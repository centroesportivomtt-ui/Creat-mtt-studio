# v04.py [quadros de teste]: CHAVE -> CARRO (P55 + P56). Punch no polegar (ja no plano) + tremida de 1 quadro, anel de sinal que nasce
# do LED azul e atravessa o corte, sinal pontilhado com 3 aneis que viaja ate o pisca passando POR TRAS da moto azul,
# pisca 1 = impact frame ambar, HUD do cadeado que fecha, pisca 2 = 2 quadros ambar e corte.
import sys
from vx import *

VID = 'V04'; TESTE = [int(x) for x in sys.argv[1:]]
v, G0, G1 = vfx(VID); N = G1 - G0; sp = v['spec']
PA, PB_ = Plano('P55'), Plano('P56'); KC = PB_.g0 - G0                       # 22: corte chave -> carro
K_LED = fr(sp['chave']['led_t']) - G0; K_P1 = fr(sp['carro']['pisca_1']['t']) - G0; K_P2 = fr(sp['carro']['pisca_2']['t']) - G0
def chapa(k): return (PA if k < KC else PB_).get(G0 + k)
# LED azul no quadro congelado
def acha_led():
    im = chapa(K_LED); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    m = ((hsv[:, :, 0] > 100) & (hsv[:, :, 0] < 125) & (hsv[:, :, 1] > 150) & (hsv[:, :, 2] > 200)); m[:, :540] = False; m[:600] = False; m[1300:] = False
    ys, xs = np.where(m)
    if len(xs) < 20: return (958.0, 961.0), (255, 150, 60)
    return (float(xs.mean()), float(ys.mean())), tuple(float(x) for x in im[m].mean(0))
LED, LED_BGR = acha_led(); AZUL = (min(255, LED_BGR[2] * 0.55 + 40), min(255, LED_BGR[1] * 0.8 + 50), 255)
# pisca do carro (ambar) antes do punch
def acha_pisca():
    a = chapa(K_P1 - 12).astype(np.int16); pts = []
    for k in range(K_P1, min(K_P1 + 2, N)):
        im = chapa(k); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); d = (im.astype(np.int16) - a).max(2)
        m = (hsv[:, :, 0] > 6) & (hsv[:, :, 0] < 28) & (hsv[:, :, 1] > 120) & (hsv[:, :, 2] > 190) & (d > 40); m[:, 620:] = False; m[:900] = False; m[1550:] = False
        ys, xs = np.where(m)
        if len(xs) > 15: pts.append((float(np.median(xs)), float(np.median(ys))))
    return pts[0] if pts else (W * sp['carro']['pisca_xy_norm'][0], H * sp['carro']['pisca_xy_norm'][1])
PISCA = acha_pisca()
# mascara da moto (o que se mexe em relacao ao fundo limpo dos 4 primeiros quadros do P56)
BG = np.median(np.stack([chapa(k) for k in range(KC, KC + 4)]).astype(np.float32), 0)
def moto(k):
    d = np.abs(chapa(k).astype(np.float32) - BG).max(2); m = (d > 30).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)); m = cv2.dilate(m, np.ones((15, 15), np.uint8))
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)
# caminho do sinal (do canto direito, na altura do LED, ate o pisca)
S0 = np.array([W + 60.0, LED[1] + 30]); S1 = np.array(PISCA); SC = (S0 + S1) / 2 + np.array([40.0, -210.0])
def bez(u): return (1 - u) ** 2 * S0 + 2 * u * (1 - u) * SC + u * u * S1
BZ = np.array([bez(u) for u in np.linspace(0, 1, 400)]); BL = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(BZ, axis=0).T))]); LT = BL[-1]
def no_caminho(d): d = min(max(d, 0), LT); i = int(np.searchsorted(BL, d)); i = min(max(i, 1), 399); w = (d - BL[i - 1]) / max(1e-6, BL[i] - BL[i - 1]); return BZ[i - 1] * (1 - w) + BZ[i] * w
tl = Tela(); t2 = Tela()
AMB_PISCA = (255, 172, 38)
F_HUD = fonte('iblack', 29)
HUD = [80, 1000, 0, 1076]

def aneis(c, k):
    """2 aneis que nascem do LED: azul (cor do LED) e ambar 2 quadros depois; saem do quadro em 6 quadros e carregam o corte"""
    for d, rgb, esp in ((0, AZUL, 4.0), (2, AMBAR, 3.0)):
        u = prog(k, K_LED + d - 0.5, 6.5)
        if u <= 0 or u >= 1: continue
        r = 20 + 2300 * (u ** 1.7); a = (1 - u) ** 0.6
        c.drawCircle(LED[0], LED[1], r, tinta(rgb, 0.55 * a, traco=esp * 5 + 10 * u, blur=9 + 12 * u))
        c.drawCircle(LED[0], LED[1], r, tinta((255, 255, 255), 0.9 * a, traco=esp * 0.5 + 1))
        c.drawCircle(LED[0], LED[1], r, tinta(rgb, 0.95 * a, traco=esp + 3 * u))
def sinal(c, k):
    """linha pontilhada + 3 aneis pequenos correndo ate o pisca; chega em K_P1"""
    u = prog(k, KC - 0.5, K_P1 - KC + 0.5)
    if u <= 0 or k > K_P1 + 1: return
    cab = LT * (u ** 1.15); some = 1 - prog(k, K_P1 - 1, 3)
    d = cab % 17.0
    while d < cab:
        if cab - d < 520:
            p = no_caminho(d); a = (1 - (cab - d) / 520.0) ** 1.3 * some
            c.drawCircle(float(p[0]), float(p[1]), 2.6, tinta((0, 0, 0), 0.35 * a, blur=2)); c.drawCircle(float(p[0]), float(p[1]), 2.4, tinta((235, 245, 255), a))
        d += 17.0
    for j, (atr, r) in enumerate(((0, 15), (78, 11), (150, 8))):
        dd = cab - atr
        if dd <= 0: continue
        p = no_caminho(dd); w = cl((dd / LT - 0.72) / 0.28); rgb = tuple(AZUL[i] * (1 - w) + AMB_PISCA[i] * w for i in range(3))
        c.drawCircle(float(p[0]), float(p[1]), r, tinta(rgb, 0.5 * some, traco=7, blur=5)); c.drawCircle(float(p[0]), float(p[1]), r, tinta(rgb, some, traco=2.8))
        if j == 0: c.drawCircle(float(p[0]), float(p[1]), 3.2, tinta((255, 255, 255), some))
def hud(c, k):
    """chip CARRO TRANCADO com o cadeado que fecha (haste desce 6 quadros) a partir do pisca 1"""
    kk = k - K_P1
    if kk < 0: return
    txt = 'CARRO TRANCADO'; wt = larg(txt, F_HUD, 0.035); x0, y0, y1 = HUD[0], HUD[1], HUD[3]; x1 = x0 + 22 + 44 + 16 + 16 + 12 + wt + 26
    ue = eo5(prog(kk, 0, 8)); c.save(); c.clipRect(skia.Rect.MakeLTRB(x0 - 20, y0 - 20, x0 + (x1 - x0 + 30) * ue, y1 + 40))
    vidro(c, x0, y0, x1, y1, r=10, a=0.86, sombra=0.34); c.drawRect(skia.Rect.MakeLTRB(x0, y0 + 8, x0 + 5, y1 - 8), tinta(AMBAR, 1.0))
    # cadeado
    cx_, cy_ = x0 + 22 + 22, (y0 + y1) / 2 + 7; fe = eo3(prog(kk, 2, 6)); alto = 9 * (1 - fe)
    pa = skia.Path(); pa.moveTo(cx_ - 10, cy_ - 8); pa.lineTo(cx_ - 10, cy_ - 18 - alto); pa.arcTo(skia.Rect.MakeLTRB(cx_ - 10, cy_ - 28 - alto, cx_ + 10, cy_ - 8 - alto), 180, 180, False)
    pa.lineTo(cx_ + 10, cy_ - 8 - alto * (1.0 if fe < 1 else 0)); c.drawPath(pa, tinta(BRANCO, 1.0, traco=4.6))
    c.drawRRect(rr(cx_ - 17, cy_ - 10, cx_ + 17, cy_ + 16, 5), tinta(AMBAR if fe >= 1 else BRANCO, 1.0))
    c.drawCircle(cx_, cy_ + 2, 3.4, tinta(GRAF, 1.0)); c.drawLine(cx_, cy_ + 2, cx_, cy_ + 9, tinta(GRAF, 1.0, traco=3))
    if 0 < prog(kk, 8, 7) < 1: uu = prog(kk, 8, 7); c.drawCircle(cx_, cy_ - 2, 22 + 22 * uu, tinta(AMBAR, 1 - uu, traco=3))
    xt = x0 + 22 + 44 + 16
    c.drawCircle(xt + 8, (y0 + y1) / 2, 8, tinta(VERM, 0.6 + 0.4 * math.cos(kk / FPS * 2 * math.pi * 1.2)))
    texto(c, txt, xt + 16 + 12, (y0 + y1) / 2 + 10.5, F_HUD, BRANCO, 1.0, track=0.035)
    c.restore()
    # fio do chip ate o pisca
    uf = eo3(prog(kk, 6, 8))
    if uf > 0:
        pa = caminho([(x0 + 60, y1), (x0 + 60, y1 + 26), (PISCA_K[0], PISCA_K[1] - 34)]); tr = trim(pa, 0, uf)
        c.drawPath(tr, tinta((0, 0, 0), 0.4, traco=4.5, blur=2.5)); c.drawPath(tr, tinta(BRANCO, 0.9, traco=1.8))
PISCA_K = list(PISCA)
# o punch do plano (1.00 -> 1.10 -> 1.04 -> 1.08) desloca o pisca: segue a frente do carro por casamento de padrao
RX0, RY0, RX1, RY1 = max(0, int(PISCA[0]) - 150), int(PISCA[1]) - 90, int(PISCA[0]) + 260, int(PISCA[1]) + 150
_ref = cv2.cvtColor(chapa(K_P1 - 1), cv2.COLOR_BGR2GRAY)[RY0:RY1, RX0:RX1]
DESL = {}
for _k in range(K_P1, N):
    gk = cv2.cvtColor(chapa(_k), cv2.COLOR_BGR2GRAY); mg = 70
    jan = gk[max(0, RY0 - mg):RY1 + mg, max(0, RX0 - mg):RX1 + mg]; r_ = cv2.matchTemplate(jan, _ref, cv2.TM_CCOEFF_NORMED); _, mxv, _, loc = cv2.minMaxLoc(r_)
    d = (loc[0] + max(0, RX0 - mg) - RX0, loc[1] + max(0, RY0 - mg) - RY0); DESL[_k] = d if mxv > 0.45 else DESL.get(_k - 1, (0, 0))
def duotom(img, w, cor_=(40, 172, 255)):
    """impact frame: o quadro pega a cor do pisca, com contraste alto"""
    L = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255; L = np.clip((L - 0.42) * 1.9 + 0.5, 0, 1) ** 0.85
    duo = L[:, :, None] * np.array(cor_, np.float32) * 1.12 + (1 - L[:, :, None]) * np.array([4, 10, 26], np.float32)
    return np.clip(img.astype(np.float32) * (1 - w) + duo * w, 0, 255)
YYg, XXg = np.mgrid[0:H, 0:W].astype(np.float32)
def brilho_pisca(img, forca, pos):
    r = np.hypot(XXg - pos[0], YYg - pos[1]); gl = np.exp(-(r / 300.0) ** 1.4)[:, :, None] * forca
    return img + gl * np.array([30, 150, 255], np.float32)

def quadro(k):
    plate = chapa(k)
    if k in DESL: PISCA_K[0] = PISCA[0] + DESL[k][0]; PISCA_K[1] = PISCA[1] + DESL[k][1]
    if k == K_LED + 1: plate = cv2.warpAffine(plate, np.float32([[1.012, 0, 6 - 0.012 * LED[0]], [0, 1.012, -5 - 0.012 * LED[1]]]), (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)   # micro tremida
    img = plate.astype(np.float32)
    if K_LED <= k < KC:                                           # LED acende: pequeno brilho azul em volta do botao
        r = np.hypot(XXg - LED[0], YYg - LED[1]); f = math.exp(-((k - K_LED) / 2.2) ** 2)
        img += np.exp(-(r / 70.0) ** 2)[:, :, None] * np.array([255, 170, 70], np.float32) * 0.55 * f
    tl.limpa(); c = tl.c
    aneis(c, k)
    if k >= KC:
        t2.limpa(); sinal(t2.c, k)
        if t2.a[:, :, 3].max() > 0:
            m = (1 - np.clip(moto(k), 0, 1))[:, :, None]; a = (t2.a.astype(np.float32) * m).astype(np.uint8); img = sobre_f(img, a)
    img = sobre_f(img, tl.a)
    # pisca 1: impact frame ambar (2 quadros) + residuo; pisca 2: 2 quadros acesos e corte
    if k >= K_P1:
        w = {0: 0.92, 1: 0.55, 2: 0.16}.get(k - K_P1, 0.0)
        if k - K_P1 < 5: img = brilho_pisca(img, [0.9, 0.7, 0.4, 0.2, 0.08][k - K_P1], PISCA_K)
        if w > 0: img = duotom(np.clip(img, 0, 255).astype(np.uint8), w)
    if k >= K_P2:
        img = brilho_pisca(img, [0.75, 1.0][min(1, k - K_P2)], PISCA_K); img = duotom(np.clip(img, 0, 255).astype(np.uint8), [0.42, 0.93][min(1, k - K_P2)])
    out = np.clip(img, 0, 255).astype(np.uint8)
    tl.limpa(); hud(tl.c, k)
    if tl.a[:, :, 3].max() > 0:
        out = sobre(out, tl.a); out = grao_mascara(out, 1.0, G0 + k, cv2.GaussianBlur(tl.a[:, :, 3].astype(np.float32) / 255, (0, 0), 1))
    return out

if __name__ == '__main__':
    if TESTE:
        os.makedirs(f'{VF}/chk/{VID}', exist_ok=True)
        for k in TESTE: cv2.imwrite(f'{VF}/chk/{VID}/t{k:03d}.png', quadro(k))
        print('teste', N, dict(KC=KC, K_LED=K_LED, K_P1=K_P1, K_P2=K_P2), 'LED', LED, LED_BGR, 'PISCA', PISCA, PA.org, PB_.org); sys.exit()
    out = Saida(VID, N, guarda=(18, 20, 23, 34, 40, 50, 64))
    for k in range(N): out.poe(quadro(k))
    f = out.fecha()
    registra(VID, dict(arquivo=f, t0=v['t0'], t1=v['t1'], g0=G0, g1=G1, quadros=N, tipo='chave_carro', planos=['P55', 'P56'], fonte_plano=[PA.f, PB_.f], fonte_origem=[PA.org, PB_.org], md5_plano=[PA.md5(), PB_.md5()],
                       modo='substitui a base de g0 a g1-1 (opaca): cobre o P55 e o P56 inteiros, com corte seco entre eles em g %d' % PB_.g0,
                       contem=['punch do polegar e congelado (do plano) + micro tremida de 1 quadro', 'brilho do LED + 2 aneis (azul do LED e ambar) que nascem do botao e atravessam o corte',
                               'sinal pontilhado com 3 aneis ate o pisca, escondido atras da moto azul (mascara de movimento)', 'pisca 1: impact frame ambar de 2 quadros', 'HUD CARRO TRANCADO com cadeado que fecha + fio ate o pisca (caixa %s; o contrato pedia [80,1180,520,1260], que cobria o capo e o proprio pisca)' % HUD,
                               'pisca 2: 2 quadros ambar (o ultimo e o impact do corte)'],
                       medidas=dict(led_xy=LED, pisca_xy=PISCA), tempos_k=dict(clique=K_LED - 1, led=K_LED, corte=KC, pisca_1=K_P1, pisca_2=K_P2),
                       aviso_base='os 2 ultimos quadros ja sao o impact ambar; a base pode dispensar os 2 quadros negativos do impact P56->P13 ou manter (ficam 2 ambar + 2 negativos)',
                       fica_para_motion=['relogio 17H00'], som='clique em g %d; travas/bip ancorados em g %d (pisca 1 visivel)' % (G0 + K_LED - 1, G0 + K_P1)))
    progresso(f'{VID} pronto ({N} quadros): chave -> carro'); print('ok', f)
