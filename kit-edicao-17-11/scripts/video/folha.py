# folha.py <video> <saida.jpg> [passo_s=1.0] [larg=216] [cols=10]: folha de contato com tempo
import sys, subprocess, json
from PIL import Image, ImageDraw
f, out = sys.argv[1], sys.argv[2]
passo = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 216; cols = int(sys.argv[5]) if len(sys.argv) > 5 else 10
th = tw * 16 // 9
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
r = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'fps=1/{passo}:start_time=0,scale={tw}:{th}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
n = len(r) // (tw * th * 3); cel = []
for i in range(n):
    im = Image.frombytes('RGB', (tw, th), r[i * tw * th * 3:(i + 1) * tw * th * 3]); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 52, 13], fill=(0, 0, 0)); d.text((2, 1), f'{i * passo:.1f}', fill=(255, 220, 0)); cel.append(im)
rows = (n + cols - 1) // cols; sh = Image.new('RGB', (cols * tw, rows * th), (20, 20, 20))
for i, im in enumerate(cel): sh.paste(im, ((i % cols) * tw, (i // cols) * th))
sh.save(out, quality=85); print(out, n, 'quadros', round(dur, 3), 's')
