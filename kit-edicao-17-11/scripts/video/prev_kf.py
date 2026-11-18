# previa de enquadre + cor a partir dos quadros-chave (sem baixar o bruto). uso: prev_kf.py [ids] [--cru]
import sys, json
from mx import *
from PIL import Image, ImageDraw
so = sys.argv[1].split(',') if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else None
cru = '--cru' in sys.argv
tw, th = 270, 480; cel = []
for p in planos():
    if p['id'] == 'P44' or (so and p['id'] not in so): continue
    kd = M + '/ing/' + p['clip']; kf = json.load(open(kd + '/kf.json'))
    for t in (p['t0'] + 0.05, (p['t0'] + p['t1']) / 2, p['t1'] - 0.05):
        s, _ = mapa(p, t); k = min(kf, key=lambda x: abs(x['t'] - s))
        im = cv2.imread(kd + '/' + k['arq']); h, w = im.shape[:2]
        z = zoom(p, t); fx, fy = foco(p, t); ww, hh = w / z, h / z
        cx = min(max(fx * w, ww / 2), w - ww / 2); cy = min(max(fy * h, hh / 2), h - hh / 2)
        c = im[int(cy - hh / 2):int(cy + hh / 2), int(cx - ww / 2):int(cx + ww / 2)]
        c = cv2.resize(c, (tw * 2, th * 2), interpolation=cv2.INTER_AREA)
        if not cru: c = grade(c, p['cor'], nitidez=False)
        c = cv2.resize(c, (tw, th), interpolation=cv2.INTER_AREA)
        pi = Image.fromarray(c[:, :, ::-1]); d = ImageDraw.Draw(pi); d.rectangle([0, 0, tw, 16], fill=(0, 0, 0))
        d.text((3, 2), f"{p['id']} {p['cor'][:10]} s{s:.1f}(kf{k['t']:.1f})", fill=(255, 220, 0)); cel.append(pi)
cols = 12; rows = (len(cel) + cols - 1) // cols
sh = Image.new('RGB', (cols * tw, rows * th), (20, 20, 20))
for i, im in enumerate(cel): sh.paste(im, ((i % cols) * tw, (i // cols) * th))
out = V + '/chk/prev_kf' + ('_cru' if cru else '') + ('_' + so[0] if so else '') + '.jpg'; sh.save(out, quality=85); print(out, sh.size)
