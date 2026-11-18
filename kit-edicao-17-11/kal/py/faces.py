# folha de rostos: python3 faces.py clip.mp4 saida.jpg passo [tam]
import sys,subprocess,numpy as np
from PIL import Image, ImageDraw
clip,out,step=sys.argv[1],sys.argv[2],int(sys.argv[3]); T=int(sys.argv[4]) if len(sys.argv)>4 else 150
W,H=map(int,subprocess.check_output(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=width,height','-of','csv=p=0',clip]).decode().split(','))
raw=subprocess.run(['ffmpeg','-v','error','-i',clip,'-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
fr=np.frombuffer(raw,np.uint8).reshape(-1,H,W,3)
idx=list(range(0,len(fr),step)); cols=8; rows=(len(idx)+cols-1)//cols
sheet=Image.new('RGB',(cols*T,rows*(T+14)),(30,30,30)); d=ImageDraw.Draw(sheet)
for k,i in enumerate(idx):
    im=fr[i].astype(int); g=(im[:,:,1]-np.maximum(im[:,:,0],im[:,:,2])>40)
    fg=~g; ys,xs=np.where(fg); 
    # cabeça = maior bloco de pele perto do topo do corpo: usa linhas onde a largura é pequena
    rw=fg.sum(1); body_top=ys.min()
    # procura cabeça: a partir do topo, linhas com largura < 0.45*W
    hx=[];hy=[]
    for y in range(body_top,min(H,body_top+int(H*0.45))):
        xs_=np.where(fg[y])[0]
        if len(xs_)==0: continue
        # segmentos
        seg=np.split(xs_,np.where(np.diff(xs_)>3)[0]+1)
        best=max(seg,key=len)
        if len(best)>W*0.33: break
        hy.append(y); hx.append(best.mean())
    # ultimo trecho continuo de linhas antes do ombro = cabeça
    if not hy: hy=[body_top]; hx=[W/2]
    y1=hy[-1]; cx=np.mean(hx[-60:]); hgt=max(60,min(300,y1-hy[0]))
    # cabeça é o bloco final; se houve punho acima, pega só os ultimos hgt de linhas continuos
    ys_arr=np.array(hy); gaps=np.where(np.diff(ys_arr)>2)[0]
    st=ys_arr[gaps[-1]+1] if len(gaps) else ys_arr[0]
    cx=np.mean(np.array(hx)[ys_arr>=st]); hgt=y1-st
    s=int(hgt*1.15); box=(int(cx-s/2),int(st-hgt*0.08),int(cx+s/2),int(st-hgt*0.08)+s)
    sheet.paste(Image.fromarray(fr[i]).crop(box).resize((T,T),Image.LANCZOS),((k%cols)*T,(k//cols)*(T+14)))
    d.text(((k%cols)*T+3,(k//cols)*(T+14)+T),f'{i} ({i/24:.2f}s)',fill=(255,255,0))
sheet.save(out,quality=90); print(len(fr),'quadros')
