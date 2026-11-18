# chroma key de qualidade: python3 key.py clip.mp4 pasta_saida "frames" (ex: "0-37,38-70:4,71-120")
# alpha por dominância do verde, unmix da cor de borda (tira franja), despill, limpeza de matte, upscale 1,5x premultiplicado.
import sys,os,subprocess,numpy as np,cv2
from scipy import ndimage as ndi
clip,out,spec=sys.argv[1],sys.argv[2],sys.argv[3]
os.makedirs(out,exist_ok=True)
W,H=map(int,subprocess.check_output(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=width,height','-of','csv=p=0',clip]).decode().split(','))
raw=subprocess.run(['ffmpeg','-v','error','-i',clip,'-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
fr=np.frombuffer(raw,np.uint8).reshape(-1,H,W,3)
idx=[]
for part in spec.split(','):
    a,_,st=part.partition(':'); lo,hi=map(int,a.split('-')); idx+=list(range(lo,min(hi,len(fr)-1)+1,int(st or 1)))
OW,OH=1080,1920
def key(img):
    f=img.astype(np.float32)
    R,G,B=f[...,0],f[...,1],f[...,2]
    d=G-np.maximum(R,B)
    # cor do fundo pelos cantos de cima
    corners=np.concatenate([f[:60,:60].reshape(-1,3),f[:60,-60:].reshape(-1,3)])
    bgc=np.median(corners,0); dbg=bgc[1]-max(bgc[0],bgc[2])
    d0,d1=18.0,dbg*0.80
    a=np.clip((d1-d)/(d1-d0),0,1)
    # limpeza: matte duro, tira ciscos e fecha furos pequenos
    hard=a>0.5
    lab,n=ndi.label(hard); 
    if n>1:
        sz=ndi.sum(hard,lab,range(1,n+1)); keep=np.isin(lab,1+np.where(sz>=400)[0])
    else: keep=hard
    holes=ndi.binary_fill_holes(keep)&~keep
    hl,hn=ndi.label(holes)
    if hn:
        hs=ndi.sum(holes,hl,range(1,hn+1)); small=np.isin(hl,1+np.where(hs<120)[0])
    else: small=np.zeros_like(keep)
    region=ndi.binary_dilation(keep|small,iterations=2)
    a=np.where(small,1.0,a)*region
    # choke leve + borda suave
    a=np.clip((a-0.08)/0.92,0,1)
    a=cv2.GaussianBlur(a,(0,0),0.6)
    # unmix: F=(C-(1-a)B)/a nas bordas
    am=np.maximum(a,1e-3)[...,None]
    F=np.where(a[...,None]>0.02,(f-(1-a[...,None])*bgc)/am,f)
    F=np.clip(F,0,255)
    # despill: verde não passa do maior entre R e B (+ pequena folga na pele/amarelo)
    F[...,1]=np.minimum(F[...,1],np.maximum(F[...,0],F[...,2])+2)
    return F,a
for k,i in enumerate(idx):
    fn=os.path.join(out,'quadro_%04d.png'%(k+1))
    if os.path.exists(fn): continue
    F,a=key(fr[i])
    pm=np.dstack([F*a[...,None],a*255])
    up=cv2.resize(pm,(OW,OH),interpolation=cv2.INTER_LANCZOS4)
    A=np.clip(up[...,3],0,255); rgb=np.clip(up[...,:3]/np.maximum(A,1e-3)[...,None]*255,0,255)
    rgb[A<0.5]=0
    o=np.dstack([rgb,A]).round().astype(np.uint8)
    cv2.imwrite(fn+'.tmp.png',cv2.cvtColor(o,cv2.COLOR_RGBA2BGRA),[cv2.IMWRITE_PNG_COMPRESSION,6]); os.replace(fn+'.tmp.png',fn)
print(out,len(idx),'quadros')
