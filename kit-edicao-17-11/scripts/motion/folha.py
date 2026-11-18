# folha.py saida.jpg t1,t2,...  [ov]  : quadros da base540 (com overlay 1080 por cima se 'ov' e existir PNG), lado a lado, com o tempo escrito
import sys, subprocess, numpy as np, os
from PIL import Image, ImageDraw
M='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
out=sys.argv[1]; ts=[float(x) for x in sys.argv[2].split(',')]; ov=len(sys.argv)>3 and sys.argv[3]; cols=int(sys.argv[4]) if len(sys.argv)>4 else 6
ims=[]
for t in ts:
    g=round(t*30)
    b=subprocess.run(['ffmpeg','-v','error','-ss',f'{g/30:.4f}','-i',M+'/build/motion2/prev/base540.mp4','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE).stdout
    im=Image.frombytes('RGB',(540,960),b)
    if ov:
        f=f'{ov}/quadro_{g:05d}.png'
        if os.path.exists(f):
            o=Image.open(f).convert('RGBA').resize((540,960),Image.LANCZOS); im.paste(o,(0,0),o)
    d=ImageDraw.Draw(im); d.rectangle([0,0,150,26],fill=(0,0,0)); d.text((6,6),f'{t:.2f}s g{g}',fill=(255,255,0))
    d.rectangle([30,142,480,740],outline=(0,255,0))   # zona segura (x60-960,y285-1480)/2
    ims.append(im)
rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(cols*540,rows*960),(30,30,30))
for i,im in enumerate(ims): S.paste(im,((i%cols)*540,(i//cols)*960))
S.save(out,quality=88)
