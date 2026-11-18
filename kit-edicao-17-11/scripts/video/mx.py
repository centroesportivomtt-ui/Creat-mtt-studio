# mx.py: base comum do editor de imagem (Reel "Um dia na maxima").
# Le o contrato direcao/edl.json, monta a lista de planos com cauda, o mapa de tempo (vel, speed ramp, freeze),
# o enquadre (foco_xy + zoom do contrato), a cor por ambiente e a leitura da fonte 4K (range automatico).
import os, sys, json, math, subprocess, hashlib
import numpy as np, cv2
cv2.setNumThreads(3)
M = '/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
V = M + '/build/video'
W, H, FPS = 1080, 1920, 30
E = json.load(open(M + '/direcao/edl.json'))
NT = int(round(E['dur'] * FPS))
IDS = {l.split('\t')[1]: l.split('\t')[0] for l in open(M + '/tools/lista.tsv').read().split('\n') if l.strip()}
VMAX = 4.0          # pico do speed ramp entre clipes diferentes

def fr(t): return int(round(t * FPS + 1e-9))

# ---------------- planos com cauda ----------------
def _trans():
    T = {}
    for t in E['transicoes']: T[tuple(t['entre'])] = t
    return T

def planos():
    T = _trans(); P = []
    for p in E['planos']:
        tin = next((t for (a, b), t in T.items() if b == p['id']), None)
        tout = next((t for (a, b), t in T.items() if a == p['id']), None)
        q = dict(p); q['tin'] = tin; q['tout'] = tout
        q['F0'], q['F1'] = fr(p['t0']), fr(p['t1'])
        q['nin'] = fr(tin['dur'] / 2) if tin else 0
        q['nout'] = fr(tout['dur'] / 2) if tout else 0
        if p['id'] == 'P44': q['F1'] = NT
        P.append(q)
    for i in E['inserts']:
        q = dict(i); q['tin'] = q['tout'] = None; q['F0'], q['F1'] = fr(i['t0']), fr(i['t1']); q['nin'] = q['nout'] = 0
        q['enquadre'] = 'acao'; q.setdefault('foco_xy', [0.5, 0.45]); q.setdefault('zoom', [[0, 1.0], [i['t1'] - i['t0'], 1.06]])
        P.append(q)
    return P

def plano(pid): return next(p for p in planos() if p['id'] == pid)
def vizinho(pid, d):
    L = [p for p in planos() if p['id'].startswith('P')]; i = [p['id'] for p in L].index(pid)
    j = i + d
    return L[j] if 0 <= j < len(L) else None

# ---------------- mapa de tempo: tempo global t -> tempo de fonte s ----------------
def _ramp_int(u, a):        # integral de u^2 de 0..u (x a)
    return a * u ** 3 / 3

def mapa(p, t):
    """retorna (s, v) = tempo de fonte e velocidade instantanea"""
    t0, t1, vel = p['t0'], p['t1'], p['vel']
    s = p['src_in'] + (t - t0) * vel; v = vel
    if p['id'] == 'P44': return 0.0, 1.0
    # freeze (freeze_espelho no P29): segura o quadro e volta no ponto linear (L-cut: a fala continua)
    for g in E['graficos']:
        if g['modelo'] == 'freeze_espelho' and g['props'].get('congela', True) and t0 <= g['t0'] < t1 and g['t0'] <= t < g['t1']:
            return g['props']['src_t'], 0.0
    ti, to = p.get('tin'), p.get('tout')
    # speed ramp de saida (A acelera ate VMAX no corte; a cauda continua em VMAX)
    if to and to['tipo'] == 'speed_ramp':
        c, h = to['corte_t'], to['dur'] / 2; B = vizinho(p['id'], 1)
        contig = B and B['clip'] == p['clip'] and abs(B['src_in'] - p['src_out']) < 0.02
        if not contig and t > c - h:
            A_ = VMAX - vel
            if t <= c:
                u = (t - (c - h)) / h; s += _ramp_int(u, A_) * h; v = vel + A_ * u * u
            else:
                s += _ramp_int(1, A_) * h + (t - c) * A_; v = VMAX
    if ti and ti['tipo'] == 'speed_ramp':
        c, h = ti['corte_t'], ti['dur'] / 2; A0 = vizinho(p['id'], -1)
        contig = A0 and A0['clip'] == p['clip'] and abs(A0['src_out'] - p['src_in']) < 0.02
        if contig:
            # mesmo clipe continuo: lombada de velocidade (cosseno) logo depois do corte, ancorado no fim do plano
            Hb, Wd = 1.4, 0.40
            vb = (p['src_out'] - p['src_in'] - Hb * Wd / 2) / (t1 - t0)
            def bint(x):   # integral do cosseno elevado de c ate x
                x = min(max(x - c, 0), Wd); return Hb * (x / 2 - Wd / (4 * math.pi) * math.sin(2 * math.pi * x / Wd))
            s = p['src_in'] + (t - t0) * vb + bint(t); v = vb + (Hb * (1 - math.cos(2 * math.pi * min(max(t - c, 0), Wd) / Wd)) / 2 if c <= t <= c + Wd else 0)
        elif t < c + h:
            A_ = VMAX - vel
            if t >= c:
                u = (c + h - t) / h; s -= _ramp_int(u, A_) * h; v = vel + A_ * u * u
            else:
                s -= _ramp_int(1, A_) * h + (c - t) * A_; v = VMAX
    return s, v

# ---------------- enquadre ----------------
def _interp(keys, x):
    if x <= keys[0][0]: return keys[0][1]
    for (a, za), (b, zb) in zip(keys, keys[1:]):
        if x <= b:
            u = (x - a) / max(1e-6, b - a); u = u * u * (3 - 2 * u); return za + (zb - za) * u
    return keys[-1][1]

def zoom(p, t): return _interp(p['zoom'], t - p['t0'])

def foco(p, t):
    fx, fy = p['foco_xy']
    if p['id'] == 'P07' and p.get('porta_xy'):     # empurrao para dentro da folha preta da porta
        u = _interp([[0, 0.0], [2.0, 0.0], [2.48, 1.0]], t - p['t0']); px, py = p['porta_xy']
        fx, fy = fx + (px - fx) * u, fy + (py - fy) * u
    return fx, fy

# ---------------- cor por ambiente ----------------
# g: ganho r,g,b; gama; con: contraste em S; sat; preto: ponto preto; piso: preto de saida (densidade, nunca lavado);
# sombra/luz: tinta (r,g,b) somada nas sombras/altas; pele: suavizacao de pele; grao; dn: denoise temporal (hqdn3d)
COR = {
 'ct':                 dict(g=(1.02, 1.00, 0.97), gama=0.97, con=0.15, sat=1.00, preto=0.014, piso=0.0, sombra=(0.00, -0.004, 0.006), luz=(0.010, 0.004, -0.006), pele=0.30, grao=1.2),
 'rua_dia':            dict(g=(1.00, 1.00, 1.00), gama=0.98, con=0.18, sat=1.08, preto=0.016, piso=0.0, sombra=(-0.006, 0.0, 0.008), luz=(0.008, 0.004, -0.004), pele=0.2, grao=1.0),
 'interno_loja':       dict(g=(0.99, 1.00, 1.01), gama=0.98, con=0.14, sat=1.06, preto=0.014, piso=0.0, sombra=(0, 0, 0.004), luz=(0, 0, 0), pele=0.2, grao=1.0),
 'interno_escritorio': dict(g=(1.01, 1.00, 0.99), gama=0.98, con=0.13, sat=1.00, preto=0.012, piso=0.0, sombra=(0, 0, 0.004), luz=(0.004, 0.002, 0), pele=0.30, grao=1.0),
 'rua_azul':           dict(g=(0.97, 1.00, 1.05), gama=0.95, con=0.17, sat=1.06, preto=0.016, piso=0.0, sombra=(-0.010, 0.004, 0.020), luz=(0.010, 0.004, -0.004), pele=0.25, grao=1.4),
 'rua_azul_reflexo':   dict(g=(0.98, 1.00, 1.04), gama=0.93, con=0.16, sat=1.08, preto=0.014, piso=0.0, sombra=(-0.010, 0.004, 0.020), luz=(0.012, 0.006, -0.002), pele=0.25, grao=1.4),
 'estrada_noite':      dict(g=(0.96, 1.00, 1.00), gama=0.90, con=0.12, sat=0.96, preto=0.008, piso=0.010, sombra=(-0.008, 0.010, 0.012), luz=(0.016, 0.006, -0.010), pele=0.0, grao=2.2, dn='hqdn3d=3:2.5:7:6'),
 'valente_academia':   dict(g=(1.00, 1.00, 0.99), gama=0.97, con=0.16, sat=0.95, preto=0.016, piso=0.0, sombra=(0.004, -0.002, 0.006), luz=(0.012, 0.004, -0.008), pele=0.25, grao=1.3),
 'noturno_prospeccao': dict(g=(1.02, 0.97, 1.05), gama=0.82, con=0.14, sat=1.08, preto=0.030, piso=0.045, sombra=(0.010, -0.006, 0.020), luz=(0.010, 0.0, 0.006), pele=0.0, grao=2.6, dn='hqdn3d=5:4:9:8'),
 'rota_noite':         dict(g=(1.05, 1.00, 0.93), gama=0.95, con=0.16, sat=1.04, preto=0.016, piso=0.006, sombra=(0.002, 0.000, 0.008), luz=(0.014, 0.006, -0.008), pele=0.25, grao=1.6, dn='hqdn3d=2:1.5:4:4'),
 'marca':              dict(g=(1, 1, 1), gama=1.0, con=0.0, sat=1.0, preto=0.0, piso=0.0, sombra=(0, 0, 0), luz=(0, 0, 0), pele=0, grao=1.0),
}
_lut = {}
def _luts(nome):
    if nome in _lut: return _lut[nome]
    c = COR[nome]; x = np.linspace(0, 1, 256); luts = []
    for i, ch in enumerate((2, 1, 0)):              # b, g, r na ordem do OpenCV
        v = np.clip(x * c['g'][ch], 0, 1) ** c['gama']
        v = v + c['con'] * (v - 0.5) * (1 - (2 * v - 1) ** 2) * 1.6
        v = np.clip((v - c['preto']) / (1 - c['preto']), 0, 1)
        som = (1 - v) ** 3; luz = v ** 3
        v = v + c['sombra'][ch] * som * 3 + c['luz'][ch] * luz * 3
        v = c['piso'] + (1 - c['piso']) * np.clip(v, 0, 1)
        luts.append(np.clip(v * 255 + 0.5, 0, 255).astype(np.uint8))
    s = c['sat']; wv = np.array([0.0722, 0.7152, 0.2126])
    Msat = ((1 - s) * np.tile(wv, (3, 1)) + s * np.eye(3)).astype(np.float32)
    _lut[nome] = (np.stack(luts, 1).reshape(256, 1, 3), Msat); return _lut[nome]

def pele(img, forca):
    """suavizacao leve so na pele (mascara YCrCb), preservando bordas"""
    if forca <= 0: return img
    sm = cv2.resize(img, (img.shape[1] // 2, img.shape[0] // 2), interpolation=cv2.INTER_AREA)
    ycc = cv2.cvtColor(sm, cv2.COLOR_BGR2YCrCb)
    m = cv2.inRange(ycc, (40, 136, 82), (245, 172, 125))
    m = cv2.GaussianBlur(m, (0, 0), 3).astype(np.float32) / 255 * forca
    bl = cv2.bilateralFilter(sm, 7, 22, 5)
    d = (bl.astype(np.float32) - sm.astype(np.float32)) * m[:, :, None]
    d = cv2.resize(d, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    return np.clip(img.astype(np.float32) + d, 0, 255).astype(np.uint8)

_vig = {}
def vinheta(img, k=0.30):
    h, w = img.shape[:2]
    if (h, w, k) not in _vig:
        y, x = np.mgrid[0:h, 0:w].astype(np.float32); r = np.hypot((x - w / 2) / (w * 0.80), (y - h / 2) / (h * 0.80))
        _vig[(h, w, k)] = (np.clip(1 - k * np.clip(r - 0.42, 0, None) ** 1.7, 0, 1) * 256).astype(np.uint16)
    return ((img.astype(np.uint16) * _vig[(h, w, k)][:, :, None]) >> 8).astype(np.uint8)

_grao = {}
def grao(img, amp, k):
    if amp <= 0: return img
    h, w = img.shape[:2]
    if (h, w) not in _grao:
        rng = np.random.default_rng(7); G = []
        for _ in range(8):
            g = rng.normal(0, 1, (h // 2, w // 2)).astype(np.float32)
            g = cv2.resize(g, (w, h), interpolation=cv2.INTER_LINEAR); g = cv2.GaussianBlur(g, (0, 0), 0.6); g /= g.std(); G.append(g)
        _grao[(h, w)] = G
    g = _grao[(h, w)][k % 8]
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    wgt = 0.55 + 0.9 * lum * (1 - lum) * 2          # mais grao nos meios-tons
    return np.clip(img.astype(np.float32) + (g * amp * wgt)[:, :, None], 0, 255).astype(np.uint8)

def grade(img, nome, k=0, nitidez=True):
    c = COR[nome]; lut, Msat = _luts(nome)
    if c['pele']: img = pele(img, c['pele'])
    o = cv2.transform(cv2.LUT(img, lut), Msat)
    if nitidez:
        bl = cv2.GaussianBlur(o, (0, 0), 1.0); o = cv2.addWeighted(o, 1.20, bl, -0.20, 0)
    o = vinheta(o)
    return grao(o, c['grao'], k)

# ---------------- fonte ----------------
def raw(clip):
    for ext in ('.mov', '.MOV', '.mp4'):
        f = f'{V}/raw/{clip}{ext}'
        if os.path.exists(f): return f
    return None

_meta = {}
def meta(f):
    if f not in _meta:
        r = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,start_time,nb_frames,pix_fmt,color_range', '-of', 'json', f], capture_output=True, text=True).stdout)['streams'][0]
        a, b = r['r_frame_rate'].split('/'); _meta[f] = dict(fps=float(a) / float(b), vst=float(r.get('start_time', 0) or 0), nb=int(r.get('nb_frames', 0) or 0), pix=r.get('pix_fmt'), rng=r.get('color_range'))
    return _meta[f]

def ler(f, n0, n, vf, w, h, ch=3, threads=4):
    m = meta(f); T = max(0.0, m['vst'] + (n0 - 0.4) / m['fps'])
    # range da fonte: AUTOMATICO (yuvj420p/pc ou yuv420p/tv conforme o arquivo); nunca forcar in_range=tv
    p = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', str(threads), '-ss', f'{T:.4f}', '-i', f, '-frames:v', str(n), '-fps_mode', 'passthrough',
                          '-vf', vf, '-pix_fmt', 'bgr24' if ch == 3 else 'gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, bufsize=w * h * ch * 2)
    sz = w * h * ch
    for _ in range(n):
        b = p.stdout.read(sz)
        if len(b) < sz: break
        yield np.frombuffer(b, np.uint8).reshape((h, w, ch) if ch == 3 else (h, w))
    p.stdout.close(); p.wait()

def baixar(clip):
    f = raw(clip)
    if f: return f
    import shutil
    while shutil.disk_usage('/').free < (int(dict((l.split('\t')[1], l.split('\t')[2]) for l in open(M + '/tools/lista.tsv').read().split('\n') if l.strip())[clip]) + 1.0e9):
        print('disco curto para', clip, '- esperando', flush=True); import time; time.sleep(30)
    tmp = f'{V}/raw/{clip}.part'
    subprocess.run(['curl', '-sS', '-L', '--retry', '3', '-o', tmp, f'https://drive.usercontent.google.com/download?id={IDS[clip]}&export=download&confirm=t'], check=True)
    os.replace(tmp, f'{V}/raw/{clip}.mov'); return f'{V}/raw/{clip}.mov'

def progresso(txt):
    import time
    with open(M + '/PROGRESSO.md', 'a') as fh: fh.write(f"- {time.strftime('%H:%M')} imagem: {txt}\n")
