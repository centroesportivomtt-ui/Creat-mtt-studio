# ver_ov.py saida.jpg t1,t2,... [cols] [--cheio] [--rec x0,y0,x1,y1] [--zona]: compõe os PNG JÁ renderizados (ov/) sobre a base v2 (planos + VFX).
import sys, os
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__)); from prev import quadro
M='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
out=sys.argv[1]; ts=[float(x) for x in sys.argv[2].split(',')]
cols=int(sys.argv[3]) if len(sys.argv)>3 and sys.argv[3].isdigit() else 6
cheio='--cheio' in sys.argv; rec=None
if '--rec' in sys.argv: rec=[int(v) for v in sys.argv[sys.argv.index('--rec')+1].split(',')]; cheio=True
zona='--zona' in sys.argv
ims=[]
for t in ts:
    g=min(round(t*30),3846); b=Image.fromarray(quadro(g))
    o=Image.open(f'{M}/build/motion2/ov/quadro_{g:05d}.png').convert('RGBA'); b.paste(o,(0,0),o)
    d=ImageDraw.Draw(b)
    if zona: d.rectangle([60,285,960,1480],outline=(0,255,0))
    if rec: b=b.crop(rec)
    elif not cheio: b=b.resize((540,960),Image.LANCZOS)
    d=ImageDraw.Draw(b); d.rectangle([0,0,118,20],fill=(0,0,0)); d.text((4,4),f'{t:.2f}s g{g}',fill=(255,255,0))
    ims.append(b)
w,h=ims[0].size; cols=min(cols,len(ims)); rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(cols*w,rows*h),(30,30,30))
for i,im in enumerate(ims): S.paste(im,((i%cols)*w,(i//cols)*h))
S.save(out,quality=88); print(out,S.size)
