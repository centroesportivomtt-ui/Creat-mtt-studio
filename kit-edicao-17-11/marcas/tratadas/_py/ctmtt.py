import numpy as np, cv2, potrace, sys
from PIL import Image
B='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/'
a=np.array(Image.open(B+'assets/marcas/ctmtt_logo.png').convert('RGBA')).astype(np.float32)
al=a[...,3]/255; rgb=a[...,:3]
x0,y0,x1,y1=Image.fromarray(a[...,3].astype(np.uint8)).getbbox()
pad=6; x0-=pad;y0-=pad;x1+=pad;y1+=pad
al=al[y0:y1,x0:x1]; rgb=rgb[y0:y1,x0:x1]
# classe por cor: branco = canais altos e iguais; vinho = R >> G,B
sat=rgb.max(-1)-rgb.min(-1)
w=np.clip((rgb.min(-1)-110)/80,0,1)   # quanto do pixel e branco
cov_w=al*w; cov_v=al*(1-w)
k=np.ones((5,5),np.uint8); near=cv2.dilate((cov_w>0.3).astype(np.uint8),k)>0
cov_v=np.where(near,np.maximum(cov_v,cv2.dilate(cov_v,np.ones((1,7),np.uint8))),cov_v).astype(np.float32)
# cores medias
op=al>0.98
cv=np.median(rgb[op&(w<0.1)],0); cw=np.median(rgb[op&(w>0.9)],0)
print('vinho',cv,'branco',cw, 'crop',x0,y0,x1,y1)
S=8; AM=float(sys.argv[1]); OT=float(sys.argv[2]); BL=float(sys.argv[3])
def trace(cov):
    up=cv2.resize(cov,None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
    up=cv2.GaussianBlur(up,(0,0),S*BL)
    bm=~(up>0.5)
    p=potrace.Bitmap(bm).trace(turdsize=S*S*2,alphamax=AM,opticurve=True,opttolerance=OT)
    d=[]
    for c in p:
        ini=len(d); sp=c.start_point; d.append(f'M{sp.x/S:.3f},{sp.y/S:.3f}')
        for s in c.segments:
            if s.is_corner: d.append(f'L{s.c.x/S:.3f},{s.c.y/S:.3f}L{s.end_point.x/S:.3f},{s.end_point.y/S:.3f}')
            else: d.append(f'C{s.c1.x/S:.3f},{s.c1.y/S:.3f} {s.c2.x/S:.3f},{s.c2.y/S:.3f} {s.end_point.x/S:.3f},{s.end_point.y/S:.3f}')
        d.append('Z')
        PARTS.append((''.join(d[ini:]), (sp.x/S)))
    return ''.join(d), len(p)
PARTS=[]; dv,nv=trace(cov_v); PARTS=[]; dw,nw=trace(cov_w); TM=''.join(p for p,x in PARTS if x>(x1-x0)-60)
print('curvas',nv,nw)
hexc=lambda c:'#%02x%02x%02x'%tuple(int(round(v)) for v in c)
W,H=x1-x0,y1-y0
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><path fill="{hexc(cv)}" fill-rule="evenodd" d="{dv}"/><path fill="{hexc(cw)}" fill-rule="evenodd" d="{dw}"/></svg>'
open(B+'build/marcas/ctmtt_logo.svg','w').write(svg)
open(B+'build/marcas/_py/ctmtt_crop.txt','w').write(f'{x0} {y0} {x1} {y1}')
# --- branco por poligono (MTT e TM tem lados retos): sobrescreve o path branco
EPS=float(sys.argv[4]) if len(sys.argv)>4 else 0
if EPS>0:
    up=cv2.resize(cov_w,None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
    up=cv2.GaussianBlur(up,(0,0),S*BL)
    m=(up>0.5).astype(np.uint8)
    cs,hier=cv2.findContours(m,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_NONE)
    d=[]
    for c in cs:
        if cv2.contourArea(c)<S*S*2 or c[:,0,0].min()/S>W-60: continue
        p=cv2.approxPolyDP(c,EPS*S,True)[:,0,:].astype(float)
        # pixel-center -> canto: +0.5
        d.append('M'+'L'.join(f'{(x+0.5)/S:.3f},{(y+0.5)/S:.3f}' for x,y in p)+'Z')
    dw=''.join(d)+TM
    sw=0.5
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><path fill="{hexc(cv)}" fill-rule="evenodd" d="{dv}"/><path fill="{hexc(cw)}" stroke="{hexc(cw)}" stroke-width="{sw}" stroke-linejoin="round" fill-rule="evenodd" d="{dw}" transform="translate(0 0)"/></svg>'
    open(B+'build/marcas/ctmtt_logo.svg','w').write(svg)
    print('poligonos',len(d))
