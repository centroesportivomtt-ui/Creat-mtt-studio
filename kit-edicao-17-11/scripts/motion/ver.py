# ver.py saida.jpg t1,t2,... [cols] [--cheio]  : renderiza o overlay nesses tempos (render.cjs --quadros) e compõe sobre a base v2.
# padrão: folha a 540x960 por quadro; --cheio: 1080x1920 (100%) lado a lado; --rec x0,y0,x1,y1: recorte a 100%
import sys, subprocess, os, shutil
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__)); from prev import quadro
M='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
out=sys.argv[1]; ts=[float(x) for x in sys.argv[2].split(',')]
cols=int(sys.argv[3]) if len(sys.argv)>3 and sys.argv[3].isdigit() else 6
cheio='--cheio' in sys.argv; rec=None
if '--rec' in sys.argv: rec=[int(v) for v in sys.argv[sys.argv.index('--rec')+1].split(',')]; cheio=True
zona='--zona' in sys.argv
tmp=M+'/build/motion2/chk/_q'; shutil.rmtree(tmp,ignore_errors=True)
r=subprocess.run(['node','ferramentas/render.cjs','cenas/dia2.json','--alfa','png','--quadros',','.join(f'{t:.4f}' for t in ts),'--out',tmp+'/'],cwd=M+'/kit',capture_output=True,text=True)
if 'erros do navegador' in r.stdout or r.returncode: print(r.stdout[-1500:], r.stderr[-1500:])
ims=[]
for t in ts:
    g=round(t*30); b=Image.fromarray(quadro(min(g,3846)))
    o=Image.open(f'{tmp}/q_{t:.2f}'.rjust(6,'0') if False else f'{tmp}/q_'+f'{t:.2f}'.rjust(6,'0')+'.png').convert('RGBA')
    b.paste(o,(0,0),o)
    if rec: b=b.crop(rec)
    elif not cheio: b=b.resize((540,960),Image.LANCZOS)
    d=ImageDraw.Draw(b); d.rectangle([0,0,118,20],fill=(0,0,0)); d.text((4,4),f'{t:.2f}s g{g}',fill=(255,255,0))
    if zona and not rec:
        k=1 if cheio else 0.5; d.rectangle([60*k,285*k,960*k,1480*k],outline=(0,255,0))
    ims.append(b)
w,h=ims[0].size; cols=min(cols,len(ims)); rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(cols*w,rows*h),(30,30,30))
for i,im in enumerate(ims): S.paste(im,((i%cols)*w,(i//cols)*h))
S.save(out,quality=90); print(out,S.size)
