# base.py: emenda planos/<id>.mp4 com as transicoes do contrato -> base.mp4 (sem texto).
# whip (deslocamento + motion blur direcional), speed_ramp (corte com blur ja no plano + 1 quadro de fusao), match_porta
# (folha preta da porta vira mascara de luma), zoom_through (zoom radial), flash, impact (negativo + tremida), luma.
# Tambem: insert I01, freeze_espelho do P29 e o fundo do cartao final P44 (planos/P44.mp4).
import sys
from mx import *

def ss(u): u = np.clip(u, 0.0, 1.0); return u * u * (3 - 2 * u)

class Leitor:
    def __init__(self, p):
        self.p = p; self.g0 = p['F0'] - p['nin']; self.g1 = p['F1'] + p['nout']
        f = f"{V}/planos/{p['id']}.mp4"
        self.proc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2', '-i', f, '-pix_fmt', 'bgr24', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, bufsize=W * H * 6)
        self.g = self.g0 - 1; self.cur = None
    def get(self, g):
        g = min(max(g, self.g0), self.g1 - 1)
        while self.g < g:
            b = self.proc.stdout.read(W * H * 3)
            if len(b) < W * H * 3: break
            self.cur = np.frombuffer(b, np.uint8).reshape(H, W, 3); self.g += 1
        return self.cur
    def fecha(self): self.proc.stdout.close(); self.proc.kill()

def desloca(img, dx, dy=0):
    M_ = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(img, M_, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

def blur_dir(img, L, horiz=True):
    L = int(L)
    if L < 3: return img
    k = np.zeros((1, L) if horiz else (L, 1), np.float32); k[:] = 1.0 / L
    return cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT)

def escala(img, s, cx=W / 2, cy=H / 2):
    M_ = np.float32([[s, 0, cx - s * cx], [0, s, cy - s * cy]])
    return cv2.warpAffine(img, M_, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

def radial(img, s, forca):
    """zoom com blur radial: media de copias em escalas crescentes"""
    acc = np.zeros((H, W, 3), np.float32); K = 6
    for i in range(K): acc += escala(img, s * (1 + forca * i / K)).astype(np.float32)
    return (acc / K).astype(np.uint8)

def mix(a, b, w):
    if w <= 0: return a
    if w >= 1: return b
    return cv2.addWeighted(a, 1 - w, b, w, 0)

def luma(img): return cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (0, 0), 6).astype(np.float32) / 255

LUMA_MODO = {('P07', 'P08'): 'escuro', ('P16', 'P17'): 'claro', ('P21', 'P22'): 'claro', ('P30', 'P31'): 'escuro',
             ('P36', 'P37'): 'claro', ('P43', 'P44'): 'escuro'}
WHIP_DIR = {}

def transicao(T, A, B, g, C, n, k_whip):
    tipo = T['tipo']; u = (g - (C - n) + 0.5) / (2 * n)
    if tipo == 'whip':
        sgn = -1 if k_whip % 2 == 0 else 1
        if u < 0.5: e = (u / 0.5) ** 2; img = desloca(A, sgn * e * W * 0.55)
        else: e = ((1 - u) / 0.5) ** 2; img = desloca(B, -sgn * e * W * 0.55)
        L = 300 * math.sin(math.pi * u) ** 1.5
        img = blur_dir(img, L)
        if 0.38 < u < 0.62:      # fusao curta no pico do chicote
            o = desloca(B, -sgn * ((1 - u) / 0.5) ** 2 * W * 0.55) if u < 0.5 else desloca(A, sgn * (u / 0.5) ** 2 * W * 0.55)
            img = mix(img, blur_dir(o, L), 0.5 - abs(u - 0.5) / 0.12 * 0.5)
        return img
    if tipo == 'speed_ramp':
        img = A if g < C else B
        if g in (C - 1, C): img = mix(A, B, 0.35 if g == C - 1 else 0.65)
        return blur_dir(img, 40 * math.sin(math.pi * u))
    if tipo == 'zoom_through':
        if u < 0.5: e = (u / 0.5) ** 2; img = radial(escala(A, 1 + 0.9 * e), 1.0, 0.10 * e)
        else: e = ((1 - u) / 0.5) ** 2; img = radial(escala(B, 1 + 0.9 * e), 1.0, 0.10 * e)
        if 0.42 < u < 0.58:
            w = (u - 0.42) / 0.16
            ea, eb = (min(u, 0.5) / 0.5) ** 2, ((1 - max(u, 0.5)) / 0.5) ** 2
            a_ = radial(escala(A, 1 + 0.9 * ea), 1.0, 0.10 * ea); b_ = radial(escala(B, 1 + 0.9 * eb), 1.0, 0.10 * eb)
            img = mix(a_, b_, w)
        return img
    if tipo == 'flash':
        base = A if g < C else B
        if g in (C - 1, C): base = mix(A, B, 0.5)
        f = math.exp(-((u - 0.5) / 0.22) ** 2)
        cor = np.array([255, 235, 215], np.float32) if T['entre'] == ['P24', 'P25'] else np.array([250, 252, 255], np.float32)
        o = base.astype(np.float32) * (1 - f) + cor * f
        return np.clip(o, 0, 255).astype(np.uint8)
    if tipo == 'impact':
        if g < C: return A
        if g < C + n:      # quadros negativos com contraste alto
            neg = 255 - B; neg = cv2.convertScaleAbs(neg, alpha=1.35, beta=-40)
            return neg
        return B
    if tipo in ('luma', 'match_porta'):
        modo = LUMA_MODO.get(tuple(T['entre']), 'escuro')
        L = luma(A); L = 1 - L if modo == 'claro' else L
        if tipo == 'match_porta': thr = -0.05 + 1.30 * ss((u - 0.66) / 0.30)   # so abre quando a folha preta ja tomou o quadro
        else: thr = -0.15 + 1.35 * u
        a = np.clip((thr - L) / 0.12, 0, 1)
        a = cv2.GaussianBlur(a, (0, 0), 3)[:, :, None]
        return (A.astype(np.float32) * (1 - a) + B.astype(np.float32) * a).astype(np.uint8)
    return A if g < C else B

def freeze_espelho(img, k, n):
    """pose congelada: flash de impacto, o quadro recua e o espelho se multiplica em 3 copias (lado a lado, espelhadas), depois volta"""
    u = (k + 0.5) / n
    abre = float(ss(u / 0.25) * (1 - ss((u - 0.78) / 0.22)))
    sc = 1.0 - 0.45 * abre
    larga = np.hstack([cv2.flip(img, 1), img, cv2.flip(img, 1)])
    # costuras de espelho: linha fina clara nas juntas
    for x in (W, 2 * W): larga[:, x - 2:x + 2] = np.clip(larga[:, x - 2:x + 2].astype(np.int16) + 70, 0, 255).astype(np.uint8)
    M_ = np.float32([[sc, 0, W / 2 - sc * 1.5 * W], [0, sc, H / 2 - sc * H / 2]])
    fundo = cv2.convertScaleAbs(cv2.GaussianBlur(img, (0, 0), 25), alpha=0.35)
    cam = cv2.warpAffine(larga, M_, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    msk = cv2.warpAffine(np.ones((H, 3 * W), np.float32), M_, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)[:, :, None]
    o = fundo.astype(np.float32) * (1 - msk) + cam.astype(np.float32) * msk
    fl = math.exp(-(k / 1.3) ** 2) * 0.85        # flash nos primeiros quadros
    o = o * (1 - fl) + 255 * fl
    return np.clip(o, 0, 255).astype(np.uint8)

def fundo_fecho(n, ref):
    """fundo do cartao final: escuro quente com brilho que respira, nascido da cortina da garrafa"""
    out = []; y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    base_cor = cv2.GaussianBlur(cv2.resize(ref, (W // 8, H // 8)), (0, 0), 6); base_cor = cv2.resize(base_cor, (W, H)).astype(np.float32)
    for k in range(n):
        t = k / FPS
        cx, cy = W * (0.5 + 0.06 * math.sin(t * 0.9)), H * (0.47 + 0.03 * math.cos(t * 0.7))
        r = np.hypot((x - cx) / (W * 0.75), (y - cy) / (H * 0.55))
        glow = np.exp(-r ** 2 * 2.2) * (0.85 + 0.15 * math.sin(t * 2.1))
        img = np.zeros((H, W, 3), np.float32) + np.array([9, 9, 12], np.float32)
        img += glow[:, :, None] * np.array([14, 26, 48], np.float32)
        img = img * 0.8 + base_cor * 0.12
        out.append(grao(np.clip(img, 0, 255).astype(np.uint8), 1.6, k))
    return out

def enc(path):
    return subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                             '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-threads', '3',
                             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', path], stdin=subprocess.PIPE)

if __name__ == '__main__':
    PL = [p for p in planos() if p['id'].startswith('P')]; INS = [p for p in planos() if p['id'].startswith('I')]
    T = {tuple(t['entre']): t for t in E['transicoes']}
    p44 = next(p for p in PL if p['id'] == 'P44')
    # P44: fundo do fecho (gera a partir do ultimo quadro da cauda do P43)
    if not os.path.exists(f'{V}/planos/P44.mp4') and len(sys.argv) < 3:
        p43 = next(p for p in PL if p['id'] == 'P43'); L43 = Leitor(p43); ref = L43.get(p43['F1'] + p43['nout'] - 1).copy(); L43.fecha()
        n44 = p44['F1'] - p44['F0'] + p44['nin']; e = enc(f'{V}/planos/P44.mp4')
        for im in fundo_fecho(n44, ref): e.stdin.write(im.tobytes())
        e.stdin.close(); e.wait()
    fz = next(gx for gx in E['graficos'] if gx['modelo'] == 'freeze_espelho'); FZ0, FZ1 = fr(fz['t0']), fr(fz['t1'])
    sacode = {}
    for (a, b), t in T.items():
        if t['tipo'] == 'impact' and 'tremida' in t.get('nota', ''):
            C = fr(t['corte_t']); n = fr(t['dur'] / 2)
            rng = np.random.default_rng(3)
            for i in range(3): sacode[C + n + i] = (rng.uniform(-1, 1) * 26 * (1 - i / 3), rng.uniform(-1, 1) * 18 * (1 - i / 3))
    G0, G1 = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (0, NT)
    out = V + '/base.mp4' if (G0, G1) == (0, NT) else f'{V}/chk/base_{G0}_{G1}.mp4'; tmp = out + '.tmp.mp4'; e = enc(tmp)
    abertos = {}; whips = 0; whip_k = {}
    for (a, b), t in T.items():
        if t['tipo'] == 'whip': whip_k[(a, b)] = whips; whips += 1
    def L(p):
        if p['id'] not in abertos: abertos[p['id']] = Leitor(p)
        return abertos[p['id']]
    for g in range(G0, G1):
        # plano do corpo
        i = next(j for j, p in enumerate(PL) if p['F0'] <= g < p['F1'])
        p = PL[i]; img = None
        # janela de transicao (com o anterior ou com o proximo)
        for A, B in ((PL[i - 1] if i else None, p), (p, PL[i + 1] if i + 1 < len(PL) else None)):
            if A is None or B is None: continue
            t = T.get((A['id'], B['id']))
            if not t or t['dur'] <= 0: continue
            C = B['F0']; n = B['nin']
            if C - n <= g < C + n:
                img = transicao(t, L(A).get(g), L(B).get(g), g, C, n, whip_k.get((A['id'], B['id']), 0)); break
        if img is None: img = L(p).get(g)
        for q in INS:
            if q['F0'] <= g < q['F1']: img = L(q).get(g)
        if FZ0 <= g < FZ1: img = freeze_espelho(img, g - FZ0, FZ1 - FZ0)
        if g in sacode: img = desloca(img, *sacode[g])
        e.stdin.write(np.ascontiguousarray(img).tobytes())
        for pid in list(abertos):
            q = next(x for x in PL + INS if x['id'] == pid)
            if g >= q['F1'] + q['nout']: abertos.pop(pid).fecha()
        if g % 300 == 0: print('quadro', g, '/', NT, flush=True)
    e.stdin.close(); e.wait(); os.replace(tmp, out)
    if (G0, G1) == (0, NT): progresso('base.mp4 emendado (%d quadros)' % NT)
    print('base ok', out)
