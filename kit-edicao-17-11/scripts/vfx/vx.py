# vx.py: base comum do compositor de VFX (rodada 2). Le o contrato (edl.json v2), abre os planos (da imagem ou os
# renderizados aqui com o mesmo codigo), desenha em skia (RGBA premultiplicado), compoe e codifica (crf 14, bt709 tv).
import os, sys, json, math, subprocess, hashlib
import numpy as np, cv2, skia
M = '/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
sys.path.insert(0, M + '/build/video/py')
import mx
from mx import W, H, FPS, fr
VF = M + '/build/vfx'
E = mx.E
E1 = json.load(open(M + '/direcao/edl_v1.json'))
FD = '/root/.fonts/creat/'
FONTES = {'anton': FD + 'Anton-Regular.ttf', 'mblack': FD + 'static_MontserratBlack.ttf', 'mxbold': FD + 'static_MontserratExtraBold.ttf',
          'msemi': FD + 'static_MontserratSemiBold.ttf', 'iblack': FD + 'static_InterBlack.ttf', 'imed': FD + 'static_InterMedium.ttf',
          'mono': M + '/kit/assets/fonts/JetBrainsMono-Bold.ttf', 'bebas': FD + 'BebasNeue-Regular.ttf'}
AMBAR = (245, 184, 77); VERM = (255, 26, 26); OFF = (241, 235, 226); GRAF = (16, 16, 18); BRANCO = (255, 255, 255)
_tf = {}
def fonte(nome, tam):
    if nome not in _tf: _tf[nome] = skia.Typeface.MakeFromFile(FONTES[nome])
    f = skia.Font(_tf[nome], tam); f.setSubpixel(True); f.setEdging(skia.Font.Edging.kAntiAlias); return f

def vfx(vid):
    v = next(x for x in E['vfx'] if x['id'] == vid); return v, fr(v['t0']), fr(v['t1'])

# ---------------- easing ----------------
def cl(u): return min(1.0, max(0.0, u))
def ss(u): u = cl(u); return u * u * (3 - 2 * u)
def eo3(u): u = cl(u); return 1 - (1 - u) ** 3
def eo5(u): u = cl(u); return 1 - (1 - u) ** 5
def ei3(u): u = cl(u); return u ** 3
def eio(u): u = cl(u); return 0.5 - 0.5 * math.cos(math.pi * u)
def eback(u, s=1.9): u = cl(u); u -= 1; return 1 + u * u * ((s + 1) * u + s)
def prog(k, k0, n): return cl((k - k0) / max(1e-6, n))

# ---------------- skia ----------------
class Tela:
    """camada RGBA premultiplicada (uint8) desenhada com skia"""
    def __init__(self, w=W, h=H):
        self.a = np.zeros((h, w, 4), np.uint8); self.s = skia.Surface(self.a); self.c = self.s.getCanvas()
    def limpa(self): self.a[:] = 0

def cor(rgb, a=1.0): return skia.Color(int(rgb[0]), int(rgb[1]), int(rgb[2]), int(round(255 * cl(a))))
def tinta(rgb, a=1.0, traco=0, blur=0, redondo=True):
    p = skia.Paint(AntiAlias=True, Color=cor(rgb, a))
    if traco:
        p.setStyle(skia.Paint.kStroke_Style); p.setStrokeWidth(traco)
        if redondo: p.setStrokeCap(skia.Paint.kRound_Cap); p.setStrokeJoin(skia.Paint.kRound_Join)
    if blur: p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))
    return p

def larg(txt, f, track=0): return f.measureText(txt) + track * f.getSize() * max(0, len(txt) - 1)
def texto(c, txt, x, y, f, rgb=BRANCO, a=1.0, track=0, alinh='e', sombra=0.0, blur=0):
    """y = linha de base. track em em. sombra = opacidade da sombra suave"""
    w = larg(txt, f, track)
    if alinh == 'c': x -= w / 2
    elif alinh == 'd': x -= w
    def des(p, dx=0, dy=0):
        if not track: c.drawString(txt, x + dx, y + dy, f, p); return
        xx = x
        for ch in txt:
            c.drawString(ch, xx + dx, y + dy, f, p); xx += f.measureText(ch) + track * f.getSize()
    if sombra > 0:
        des(tinta((0, 0, 0), sombra * a, blur=max(2.0, f.getSize() * 0.16)), 0, f.getSize() * 0.06)
        des(tinta((0, 0, 0), sombra * a * 0.7, blur=1.2), 0, 1)
    des(tinta(rgb, a, blur=blur)); return w

def rr(x0, y0, x1, y1, r): return skia.RRect.MakeRectXY(skia.Rect.MakeLTRB(x0, y0, x1, y1), r, r)
def vidro(c, x0, y0, x1, y1, r=10, a=0.82, borda=0.0, sombra=0.35, rgb=GRAF):
    if sombra > 0: c.drawRRect(rr(x0, y0 + 10, x1, y1 + 14, r), tinta((0, 0, 0), sombra, blur=16))
    c.drawRRect(rr(x0, y0, x1, y1, r), tinta(rgb, a))
    if borda > 0: c.drawRRect(rr(x0 + 1, y0 + 1, x1 - 1, y1 - 1, r), tinta(BRANCO, borda, traco=2))
def cantos(c, x0, y0, x1, y1, arm=22, esp=5, rgb=VERM, a=1.0, quais='no,se'):
    p = tinta(rgb, a, traco=esp, redondo=False)
    for q in quais.split(','):
        sx = -1 if 'o' in q else 1; sy = -1 if 'n' in q else 1
        X = x0 if sx < 0 else x1; Y = y0 if sy < 0 else y1
        pa = skia.Path(); pa.moveTo(X - sx * arm, Y); pa.lineTo(X, Y); pa.lineTo(X, Y - sy * arm); c.drawPath(pa, p)

def caminho(pts, fechado=False):
    pa = skia.Path(); pa.moveTo(*pts[0])
    for q in pts[1:]: pa.lineTo(*q)
    if fechado: pa.close()
    return pa
def trim(pa, u0, u1):
    """trecho [u0,u1] (0..1) de um caminho"""
    ms = skia.PathMeasure(pa, False); L = ms.getLength(); out = skia.Path()
    ms.getSegment(L * cl(u0), L * cl(u1), out, True); return out

# ---------------- composicao ----------------
def sobre(bgr, rgba, op=1.0):
    """RGBA premultiplicado (uint8) sobre BGR uint8 -> BGR uint8"""
    a = rgba[:, :, 3:4].astype(np.float32) * (op / 255.0)
    return np.clip(bgr.astype(np.float32) * (1 - a) + rgba[:, :, 2::-1].astype(np.float32) * op, 0, 255).astype(np.uint8)
def sobre_f(bgr_f, rgba, op=1.0):
    a = rgba[:, :, 3:4].astype(np.float32) * (op / 255.0)
    return bgr_f * (1 - a) + rgba[:, :, 2::-1].astype(np.float32) * op
def soma_luz(bgr_f, rgba, g=1.0):
    return bgr_f + rgba[:, :, 2::-1].astype(np.float32) * g
def grao_mascara(img, amp, k, msk):
    """grao do plano (mx.grao) so onde a mascara (0..1) manda: casa o que foi inserido com o grao do plano"""
    g = mx.grao(img, amp, k).astype(np.float32); m = msk[:, :, None] if msk.ndim == 2 else msk
    return np.clip(img.astype(np.float32) * (1 - m) + g * m, 0, 255).astype(np.uint8)
def grade_sem_grao(img, nome):
    lut, Msat = mx._luts(nome); o = cv2.transform(cv2.LUT(img, lut), Msat)
    bl = cv2.GaussianBlur(o, (0, 0), 1.0); o = cv2.addWeighted(o, 1.20, bl, -0.20, 0); return mx.vinheta(o)
def escala(img, s, cx=W / 2, cy=H / 2, dx=0, dy=0, borda=cv2.BORDER_REFLECT, interp=cv2.INTER_CUBIC):
    M_ = np.float32([[s, 0, cx - s * cx + dx], [0, s, cy - s * cy + dy]])
    return cv2.warpAffine(img, M_, (img.shape[1], img.shape[0]), flags=interp, borderMode=borda)
def blur_v(img, L):
    L = int(L)
    if L < 3: return img
    k = np.full((L, 1), 1.0 / L, np.float32); return cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT)
def blur_h(img, L):
    L = int(L)
    if L < 3: return img
    k = np.full((1, L), 1.0 / L, np.float32); return cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT)
def radial(img, s, forca):
    acc = np.zeros(img.shape, np.float32); K = 6
    for i in range(K): acc += escala(img, s * (1 + forca * i / K), interp=cv2.INTER_LINEAR).astype(np.float32)
    return (acc / K).astype(np.uint8)

# ---------------- planos ----------------
def arquivo_plano(pid):
    """(arquivo, indice do quadro do arquivo que cai em fr(t0) da v2, origem)"""
    p2 = next(p for p in E['planos'] if p['id'] == pid)
    for base, org in ((M + '/build/video', 'imagem'), (VF + '/src', 'vfx')):
        f = f'{base}/planos/{pid}.mp4'; rf = f'{base}/planos/_rel.json'
        if not (os.path.exists(f) and os.path.exists(rf)): continue
        r = json.load(open(rf)).get(pid)
        if not r: continue
        h2 = fr(p2['t0']) - r['F'][0]; c2 = r['F'][1] - fr(p2['t1'])
        if 0 <= h2 <= 12 and 0 <= c2 <= 12: return f, h2, org
        p1 = next((p for p in E1['planos'] if p['id'] == pid), None)
        if p1 and abs(p1['src_in'] - p2['src_in']) < 1e-6 and abs(p1['vel'] - p2['vel']) < 1e-6: return f, fr(p1['t0']) - r['F'][0], org + ' (arquivo da v1)'
    raise SystemExit('falta o plano ' + pid)

class Plano:
    def __init__(self, pid):
        self.pid = pid; self.p = next(p for p in E['planos'] if p['id'] == pid)
        self.f, self.h, self.org = arquivo_plano(pid); self.g0 = fr(self.p['t0']); self.g1 = fr(self.p['t1'])
        self.q = []; cap = cv2.VideoCapture(self.f)
        while True:
            ok, im = cap.read()
            if not ok: break
            self.q.append(im)
        cap.release()
    def get(self, g):
        i = min(max(g - self.g0 + self.h, 0), len(self.q) - 1); return self.q[i]
    def md5(self): return hashlib.md5(open(self.f, 'rb').read()).hexdigest()

def movimento(quadros, w=360):
    """caminho da camera (px de 1080) por LK: devolve posicao acumulada (dx, dy) por quadro"""
    h = int(w * H / W); sc = W / w; prev = None; tr = [(0.0, 0.0)]
    for im in quadros:
        g = cv2.cvtColor(cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        if prev is not None:
            d = (0.0, 0.0); p = cv2.goodFeaturesToTrack(prev, 300, 0.008, 8)
            if p is not None and len(p) >= 10:
                q, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, p, None); ok = st.ravel() == 1
                if ok.sum() >= 8:
                    A, _ = cv2.estimateAffinePartial2D(p[ok], q[ok], method=cv2.RANSAC, ransacReprojThreshold=1.5)
                    if A is not None:
                        c = A @ np.array([w / 2, h / 2, 1.0]); d = ((c[0] - w / 2) * sc, (c[1] - h / 2) * sc)
            tr.append(d)
        prev = g
    return np.cumsum(np.array(tr), 0)
def tremor(cam, sig=6.0):
    """parte de alta frequencia do caminho (o tremor), para o inserido acompanhar a camera"""
    r = int(3 * sig); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2); k /= k.sum()
    sm = np.stack([np.convolve(np.pad(cam[:, j], (r, r), mode='edge'), k, 'valid') for j in range(2)], 1)
    return cam - sm

def enc(path, crf=14):
    return subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                             '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', str(crf), '-threads', '3',
                             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', path], stdin=subprocess.PIPE)

class Saida:
    """codifica a placa e guarda quadros de conferencia (PNG a 100%)"""
    def __init__(self, vid, n, guarda=()):
        self.vid = vid; self.n = n; self.path = f'{VF}/{vid}.mp4'; self.tmp = self.path + '.tmp.mp4'; self.e = enc(self.tmp); self.k = 0; self.guarda = set(guarda)
        os.makedirs(f'{VF}/chk/{vid}', exist_ok=True)
    def poe(self, img):
        img = np.ascontiguousarray(img)
        if self.k in self.guarda: cv2.imwrite(f'{VF}/chk/{self.vid}/q{self.k:03d}.png', img)
        self.e.stdin.write(img.tobytes()); self.k += 1
    def fecha(self):
        self.e.stdin.close(); self.e.wait(); assert self.k == self.n, (self.k, self.n); os.replace(self.tmp, self.path); return self.path

def registra(vid, info):
    f = VF + '/vfx.json'; d = json.load(open(f)) if os.path.exists(f) else {}
    d[vid] = info; json.dump(d, open(f, 'w'), ensure_ascii=False, indent=1)
def progresso(txt):
    import time
    with open(M + '/PROGRESSO.md', 'a') as fh: fh.write(f"- {time.strftime('%H:%M')} VFX: {txt}\n")
