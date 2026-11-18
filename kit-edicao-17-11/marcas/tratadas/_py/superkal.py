import numpy as np, cv2, potrace
from PIL import Image
B='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/marcas/'
a=np.array(Image.open(B+'superkal_logo_sem_sombra_alfa.png').convert('RGBA')).astype(np.float32)
x0,y0,x1,y1=434-8,218-8,1624+8,1790+8
a=a[y0:y1,x0:x1]; al=a[...,3]/255; rgb=a[...,:3]
w=np.clip((rgb[...,2]-60)/140,0,1)  # azul alto = branco
cov_w=al*w; cov_y=al*(1-w)
# amarelo fica por baixo do branco: estende amarelo sob o branco vizinho (evita fresta)
near=cv2.dilate((cov_y>0.3).astype(np.uint8),np.ones((5,5),np.uint8))>0
op=al>0.98
cy=np.median(rgb[op&(w<0.1)],0); cw=np.median(rgb[op&(w>0.9)],0); print('amarelo',cy,'branco',cw)
S=3
def trace(cov,turd):
    up=cv2.resize(cov,None,fx=S,fy=S,interpolation=cv2.INTER_CUBIC)
    up=cv2.GaussianBlur(up,(0,0),S*0.6)
    p=potrace.Bitmap(~(up>0.5)).trace(turdsize=turd,alphamax=1.0,opticurve=True,opttolerance=0.6)
    d=[]
    for c in p:
        sp=c.start_point; d.append(f'M{sp.x/S:.2f},{sp.y/S:.2f}')
        for s in c.segments:
            if s.is_corner: d.append(f'L{s.c.x/S:.2f},{s.c.y/S:.2f}L{s.end_point.x/S:.2f},{s.end_point.y/S:.2f}')
            else: d.append(f'C{s.c1.x/S:.2f},{s.c1.y/S:.2f} {s.c2.x/S:.2f},{s.c2.y/S:.2f} {s.end_point.x/S:.2f},{s.end_point.y/S:.2f}')
        d.append('Z')
    return ''.join(d),len(p)
# GRUPO: refeito com Montserrat SemiBold (fonte da marca) letra a letra no arco
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
n,lab,st,cen=cv2.connectedComponentsWithStats((cov_w>0.5).astype(np.uint8))
ids=[i for i in range(1,n) if 30<st[i,4]<4000 and cen[i,1]<0.3*cov_w.shape[0]]
ids.sort(key=lambda i:cen[i,0]); print('letras GRUPO',len(ids))
P=np.array([cen[i] for i in ids])
A=np.c_[2*P,np.ones(len(P))]; bb=(P**2).sum(1); cx_,cy_,c_=np.linalg.lstsq(A,bb,rcond=None)[0]; R=np.sqrt(c_+cx_**2+cy_**2); print('arco centro',cx_,cy_,'raio',R)
font=TTFont('/root/.fonts/creat/static_MontserratSemiBold.ttf'); gs=font.getGlyphSet(); cmap=font.getBestCmap()
gpaths=[]
from PIL import ImageFont, ImageDraw
FT='/root/.fonts/creat/static_MontserratSemiBold.ttf'
def fit_rot(ch,mask,pc,h):
    K=4; m=cv2.resize(mask.astype(np.float32),None,fx=K,fy=K,interpolation=cv2.INTER_LINEAR)>0.5
    best=(-1,0)
    f=ImageFont.truetype(FT,200); bx=f.getbbox(ch); gh=bx[3]-bx[1]
    for sz_k in (0.97,1.0,1.03):
      sz=int(200*h*K*sz_k/gh); f2=ImageFont.truetype(FT,sz)
      im=Image.new('L',(sz*2,sz*2),0); d=ImageDraw.Draw(im); b=f2.getbbox(ch); d.text((sz-(b[0]+b[2])/2,sz-(b[1]+b[3])/2),ch,font=f2,fill=255)
      for ang in np.arange(-14,14.1,0.5):
        r=np.array(im.rotate(ang,resample=Image.BILINEAR))>127
        ys,xs=np.nonzero(r); cyr,cxr=ys.mean(),xs.mean()
        canvas=np.zeros_like(m); oy=int(round(pc[1]*K-cyr)); ox=int(round(pc[0]*K-cxr))
        y0_,x0_=max(oy,0),max(ox,0); y1_=min(oy+r.shape[0],m.shape[0]); x1_=min(ox+r.shape[1],m.shape[1])
        canvas[y0_:y1_,x0_:x1_]=r[y0_-oy:y1_-oy,x0_-ox:x1_-ox]
        iou=(canvas&m).sum()/((canvas|m).sum())
        if iou>best[0]: best=(iou,ang)
    print(ch,'iou %.3f ang %.1f'%best)
    return -best[1]   # PIL anti-horario -> SVG horario
angs=[fit_rot(ch,lab==i,cen[i],40.0) for i,ch in zip(ids,'GRUPO')]
TH=float(np.median(angs[:4])); print('rotacao comum GRUPO',TH)
for i,ch in zip(ids,'GRUPO'):
    ys,xs=np.nonzero(lab==i); pts=np.c_[xs+0.5,ys+0.5]
    r=np.radians(TH); up=np.array([np.sin(r),-np.cos(r)]); rt=np.array([np.cos(r),np.sin(r)])
    pu=pts@up; pr=pts@rt; h=pu.max()-pu.min()+0.6; wd=pr.max()-pr.min()+0.6
    mc=((pu.max()+pu.min())/2)*up+((pr.max()+pr.min())/2)*rt
    g=cmap[ord(ch)]; bp=BoundsPen(gs); gs[g].draw(bp); gx0,gy0,gx1,gy1=bp.bounds
    sc=h/(gy1-gy0); pen=SVGPathPen(gs); gs[g].draw(pen)
    print(ch,'alt %.1f larg %.1f larg_fonte %.1f'%(h,wd,(gx1-gx0)*sc))
    gpaths.append(f'<path transform="translate({mc[0]:.2f} {mc[1]:.2f}) rotate({TH:.2f}) scale({sc:.5f} {-sc:.5f}) translate({-(gx0+gx1)/2:.1f} {-(gy0+gy1)/2:.1f})" d="{pen.getCommands()}"/>')
    cov_w[lab==i]=0
cov_w[cv2.dilate(np.isin(lab,ids).astype(np.uint8),np.ones((5,5),np.uint8))>0]=0
GRUPO='<g fill="#fdeeef">'+''.join(gpaths)+'</g>'
dy,ny=trace(cov_y,S*S*20); dw,nw=trace(cov_w,S*S*4); print('curvas',ny,nw)
hexc=lambda c:'#%02x%02x%02x'%tuple(int(round(v)) for v in c)
W,H=x1-x0,y1-y0
open(B+'superkal_logo.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><path fill="{hexc(cy)}" fill-rule="evenodd" d="{dy}"/><path fill="#ffffff" fill-rule="evenodd" d="{dw}"/>{GRUPO}</svg>')
open(B+'_py/sk_crop.txt','w').write(f'{x0} {y0} {x1} {y1}')
