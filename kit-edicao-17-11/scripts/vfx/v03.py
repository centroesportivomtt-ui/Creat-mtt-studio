# v03.py [quadros de teste]: AS TVs DA LOJA (P11). Colchetes de foco seguem cada TV; a TV em foco salta para um cartao vertical
# com os PIXELS REAIS do 4K (retificados, reduzidos, nunca ampliados; nenhum texto redigitado). Abas OFERTAS / NOVIDADE DE PRODUTOS
# abrem nas palavras. O cartao troca de TV quando a camera chega na seguinte.
import sys
from vx import *
import tvs as TV
import rostos as RST

VID = 'V03'; TESTE = [int(x) for x in sys.argv[1:]]
v, G0, G1 = vfx(VID); N = G1 - G0; sp = v['spec']
P = Plano('P11'); F0 = G0 - P.g0 + P.h                      # indice do arquivo no k=0
T = sorted(TV.trilhas(P.q), key=lambda t: min(t))
NOV, HOR = T[0], T[-1]                                      # NOVIDADE (desde o quadro 0) e HORTIFRUTI (entra no fim)
D4 = np.load(VF + '/src/tv4k/tv4k_frames.npz')
def omo_4k(i='75', roi=(1040, 1300, 1700, 2330)):
    """tela do OMO no 4K: mancha clara (sem o laranja do display que cobre o pe da TV) dentro da moldura preta; quadrilatero pelas 4 bordas"""
    x0, y0, x1, y1 = roi; sub = D4[i][y0:y1, x0:x1]; hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV); v_ = cv2.GaussianBlur(hsv[:, :, 2], (0, 0), 2)
    laranja = (hsv[:, :, 0] < 22) & (hsv[:, :, 1] > 120)
    m = cv2.morphologyEx(((v_ > 120) & ~laranja).astype(np.uint8), cv2.MORPH_OPEN, np.ones((25, 25), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8); j = 1 + int(np.argmax([st[i_, 4] if abs(cen[i_][0] - (x1 - x0) / 2) < 200 else 0 for i_ in range(1, n)]))
    bl = (lab == j).astype(np.uint8); ys, xs = np.where(bl > 0); ya, yb = np.percentile(ys, 3), np.percentile(ys, 97)
    # bordas esquerda e direita: reta ajustada nos extremos de cada linha (so o miolo, longe dos cantos e do display laranja)
    E, D = [], []
    for y in range(int(ya + 0.12 * (yb - ya)), int(ya + 0.70 * (yb - ya)), 6):
        r_ = np.where(bl[y] > 0)[0]
        if len(r_) > 50: E.append((r_[0], y)); D.append((r_[-1], y))
    le = np.polyfit([p[1] for p in E], [p[0] for p in E], 1); ld = np.polyfit([p[1] for p in D], [p[0] for p in D], 1)
    T_ = []
    for x in range(int(np.polyval(le, ya)) + 40, int(np.polyval(ld, ya)) - 40, 6):
        c_ = np.where(bl[:, x] > 0)[0]
        if len(c_) > 50: T_.append((x, c_[0]))
    lt = np.polyfit([p[0] for p in T_], [p[1] for p in T_], 1)
    def cruz(lv, lh):      # x = a*y + b  com  y = c*x + d
        a_, b_ = lv; c_, d_ = lh; y = (c_ * b_ + d_) / (1 - a_ * c_); return np.float32([a_ * y + b_, y])
    tl_, tr_ = cruz(le, lt), cruz(ld, lt); larg_ = np.linalg.norm(tr_ - tl_); alt = larg_ * 16.0 / 9.0     # a tela e 9:16: a base sai da proporcao (o pe esta coberto)
    dl = np.float32([le[0], 1.0]); dl /= np.linalg.norm(dl); dr = np.float32([ld[0], 1.0]); dr /= np.linalg.norm(dr)
    return np.float32([tl_, tr_, tr_ + dr * alt, tl_ + dl * alt]) + np.float32([x0, y0])
Q_OMO4 = omo_4k()
def trilha_omo():
    """segue a TV do OMO no plano casando o recorte real (SIFT + homografia, objeto plano); buracos cobertos por LK"""
    w = int(np.linalg.norm(Q_OMO4[1] - Q_OMO4[0]) / 2); h = int(np.linalg.norm(Q_OMO4[3] - Q_OMO4[0]) / 2)
    ref = cv2.warpPerspective(D4['75'], cv2.getPerspectiveTransform(Q_OMO4, np.float32([[0, 0], [2 * w, 0], [2 * w, 2 * h], [0, 2 * h]])), (2 * w, 2 * h), flags=cv2.INTER_CUBIC)
    ref = cv2.cvtColor(cv2.resize(ref, (w, h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY); sift = cv2.SIFT_create(1500); bf = cv2.BFMatcher(); kr, dr = sift.detectAndCompute(ref, None)
    cant = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(1, 4, 2); t = {}; G = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in P.q]
    for f in range(len(P.q)):
        mk = np.zeros(G[f].shape, np.uint8); mk[560:1340] = 255; kf, df = sift.detectAndCompute(G[f], mk)
        if df is None: continue
        mm = [m for m, n_ in bf.knnMatch(dr, df, k=2) if m.distance < 0.72 * n_.distance]
        if len(mm) < 12: continue
        Hm, inl = cv2.findHomography(np.float32([kr[m.queryIdx].pt for m in mm]), np.float32([kf[m.trainIdx].pt for m in mm]), cv2.RANSAC, 3.0)
        if Hm is None or inl.sum() < 10: continue
        q = cv2.perspectiveTransform(cant, Hm)[0]; ww = np.linalg.norm(q[1] - q[0]); hh = np.linalg.norm(q[3] - q[0])
        if 150 < ww < 400 and 1.4 < hh / ww < 2.2: t[f] = q
    ks = sorted(t)
    for f in range(ks[0] - 1, -1, -1):
        nx = TV.segue(G[f + 1], G[f], t[f + 1])
        if nx is None or nx[:, 0].min() > W - 40: break
        t[f] = nx
    for f in range(ks[0] + 1, len(P.q)):
        if f in t: continue
        if f - 1 not in t: break
        nx = TV.segue(G[f - 1], G[f], t[f - 1])
        if nx is None or nx[:, 0].min() > W - 40: break
        t[f] = nx
    return {f: t[f] for f in range(min(t), max(t) + 1) if f in t}
OMO = trilha_omo()
def suave(t):
    ks = sorted(t); arr = np.array([t[k] for k in ks]); r = 4; kk = np.exp(-0.5 * (np.arange(-r, r + 1) / 1.4) ** 2); kk /= kk.sum()
    sm = np.stack([np.convolve(np.pad(arr[:, i, j], (r, r), mode='edge'), kk, 'valid') for i in range(4) for j in range(2)], 1).reshape(-1, 4, 2)
    return {k: sm[i].astype(np.float32) for i, k in enumerate(ks)}
OMO, NOV, HOR = suave(OMO), suave(NOV), suave(HOR); TR = dict(omo=OMO, nov=NOV, hor=HOR)
# ---------------- pixels reais do 4K ----------------
IW, IH = 332, 590
def nitidez(im): return float(cv2.Laplacian(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
def retifica(im4, quad, folga=5):
    q = quad.copy(); c = q.mean(0); q = c + (q - c) * (1 - folga * 2 / max(1.0, np.linalg.norm(q[1] - q[0])))
    w = int(np.linalg.norm(q[1] - q[0])); h = int(np.linalg.norm(q[3] - q[0]))
    Hm = cv2.getPerspectiveTransform(q.astype(np.float32), np.float32([[0, 0], [w, 0], [w, h], [0, h]]))
    r = cv2.warpPerspective(im4, Hm, (w, h), flags=cv2.INTER_CUBIC); return r, (w, h)
def do_4k(nome):
    cands = []
    if nome == 'omo': cands.append(('75', Q_OMO4, 0))
    else:
        for i in (('29', '100') if nome == 'nov' else ('140', '157')):
            qs = [q for q in TV.telas(D4[i], esc=2.0) if abs((q[1, 1] - q[0, 1])) < 40 and 400 < np.linalg.norm(q[1] - q[0]) < 620]
            if qs: cands.append((i, qs[0], 0))
    best = None
    for i, q, n_ in cands:
        r, tam = retifica(D4[i], q, 8 if nome == 'omo' else 6); s = nitidez(cv2.resize(r, (IW, IH), interpolation=cv2.INTER_AREA))
        if best is None or s > best[0]: best = (s, i, r, tam, n_)
    s, i, r, tam, n_ = best
    lut, Msat = mx._luts(P.p['cor']); r = cv2.transform(cv2.LUT(r, lut), Msat)                 # mesma cor do plano (sem vinheta nem grao)
    peq = cv2.resize(r, (IW, IH), interpolation=cv2.INTER_AREA)
    rgba = np.dstack([peq[:, :, ::-1], np.full((IH, IW), 255, np.uint8)])
    return dict(img=skia.Image.fromarray(np.ascontiguousarray(rgba), colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kOpaque_AlphaType), quadro4k=i, tam4k=tam, nitidez=round(s, 1), inliers=n_, bgr=peq)
IMG = {n_: do_4k(n_) for n_ in ('omo', 'nov', 'hor')}
# ---------------- tempos ----------------
K_CARD = fr(34.516) - G0; K_OFE = fr(sp['abas'][0]['t']) - G0; K_NOV = fr(sp['abas'][1]['t']) - G0; K_HOR = 100; K_SAI = N - 6
CB = sp['caixa_cartao']; CX, CY = (CB[0] + CB[2]) / 2, (CB[1] + CB[3]) / 2
def conteudo(k): return 'omo' if k < K_NOV + 3 else ('nov' if k < K_HOR + 3 else 'hor')
def vira(k):
    for k0 in (K_NOV, K_HOR):
        if k0 <= k < k0 + 3: return 1 - (k - k0 + 1) / 3.2
        if k0 + 3 <= k < k0 + 8: return 0.15 + 0.85 * eback(prog(k, k0 + 3, 5), 1.5)
    return 1.0
tc = Tela(); to = Tela()
F_ROT = fonte('iblack', 27); F_ABA = fonte('iblack', 23)
def cartao(k, op):
    """cartao de vidro com a imagem real da TV (leve inclinacao e sombra)"""
    tc.limpa(); c = tc.c; nome = conteudo(k); sx = vira(k)
    c.save(); c.translate(CX, CY); c.rotate(-2.0); c.scale(sx, 1.0); c.translate(-CX, -CY)
    vidro(c, CB[0], CB[1], CB[2], CB[3], r=14, a=0.92 * op, borda=0.5 * op, sombra=0.42 * op)
    x0, y0 = CX - IW / 2, CY - IH / 2
    c.save(); c.clipRRect(rr(x0, y0, x0 + IW, y0 + IH, 8), True); pp = skia.Paint(AntiAlias=True); pp.setAlphaf(op)
    c.drawImage(IMG[nome]['img'], x0, y0, skia.SamplingOptions(skia.FilterMode.kLinear), pp); c.restore()
    c.drawRRect(rr(x0, y0, x0 + IW, y0 + IH, 8), tinta((0, 0, 0), 0.5 * op, traco=1.5))
    cantos(c, CB[0] - 8, CB[1] - 8, CB[2] + 8, CB[3] + 8, arm=22, esp=5, a=op)
    c.restore(); return tc.a
QF = np.float32([[CB[0], CB[1]], [CB[2], CB[1]], [CB[2], CB[3]], [CB[0], CB[3]]])
def colchetes(c, q, rgb, op, esc=1.0, esp=3.2):
    cen = q.mean(0); q = cen + (q - cen) * (1.06 * esc)
    for i in range(4):
        a, b, d = q[i], q[(i + 1) % 4], q[(i - 1) % 4]; L = 0.16
        pa = caminho([tuple(a + (b - a) * L), tuple(a), tuple(a + (d - a) * L * 0.6)])
        c.drawPath(pa, tinta((0, 0, 0), 0.5 * op, traco=esp + 3, blur=2)); c.drawPath(pa, tinta(rgb, op, traco=esp))
def aba(c, txt, y, k0, k, ativa, op):
    u = eo5(prog(k, k0, 8))
    if u <= 0: return
    w = larg(txt, F_ABA, 0.05) + 44; x1 = CB[0] - 6; x0 = x1 - w
    c.save(); c.clipRect(skia.Rect.MakeLTRB(x1 - (w + 30) * u, y - 20, x1 + 2, y + 80))
    if ativa > 0.5: c.drawRRect(rr(x0, y + 8, x1, y + 56, 8), tinta((0, 0, 0), 0.35 * op, blur=10)); c.drawRRect(rr(x0, y, x1, y + 48, 8), tinta(AMBAR, op))
    else: vidro(c, x0, y, x1, y + 48, r=8, a=0.84 * op, sombra=0.3 * op)
    texto(c, txt, x0 + 22, y + 33, F_ABA, GRAF if ativa > 0.5 else OFF, op, track=0.05); c.restore()

def quadro(k, R=None):
    f = F0 + k; plate = P.q[f]; img = plate.astype(np.float32); sai = prog(k, K_SAI, 5.5); op = 1 - eo3(sai)
    to.limpa(); c = to.c; nome = conteudo(k)
    # colchetes em cada TV visivel (a TV em foco fica ambar)
    for n_, t in TR.items():
        if f not in t: continue
        k_ini = max(3, min(t) - F0); u = prog(k, k_ini, 6)
        if u <= 0: continue
        foco = (n_ == nome and k >= K_CARD)
        colchetes(c, t[f], AMBAR if foco else BRANCO, op * eo3(u), 1 + 0.22 * (1 - eback(u, 1.6)))
    # rotulo
    ue = eo5(prog(k, 4, 10))
    if ue > 0:
        t1, t2 = 'TVs DA LOJA', 'no ar'; w1 = larg(t1, F_ROT, 0.03); w2 = larg(t2, F_ROT, 0.03); x0, y0, y1 = 60, 392, 452; x1 = x0 + 20 + 16 + 14 + w1 + 34 + w2 + 24
        c.save(); c.clipRect(skia.Rect.MakeLTRB(x0 - 20, y0 - 20, x0 + (x1 - x0 + 30) * ue, y1 + 40))
        vidro(c, x0, y0, x1, y1, r=8, a=0.86 * op, sombra=0.32 * op); c.drawRect(skia.Rect.MakeLTRB(x0, y0 + 6, x0 + 5, y1 - 6), tinta(AMBAR, op))
        c.drawCircle(x0 + 28, (y0 + y1) / 2, 8, tinta(VERM, op * (0.6 + 0.4 * math.cos(k / FPS * 2 * math.pi * 1.2))))
        texto(c, t1, x0 + 50, (y0 + y1) / 2 + 10, F_ROT, BRANCO, op, track=0.03); texto(c, '·', x0 + 50 + w1 + 11, (y0 + y1) / 2 + 10, F_ROT, OFF, op * 0.7)
        texto(c, t2, x0 + 50 + w1 + 34, (y0 + y1) / 2 + 10, F_ROT, AMBAR, op, track=0.03); c.restore()
    msk = np.zeros((H, W), np.float32)
    if k >= K_CARD:
        up = prog(k, K_CARD, 9); card = cartao(k, op)
        src = TR[nome].get(f)
        if up < 1 and OMO.get(f) is not None:                         # a TV salta para o cartao
            e = eo5(up); qi = OMO[f] * (1 - e) + QF * e; Hm = cv2.getPerspectiveTransform(QF, qi.astype(np.float32))
            card = cv2.warpPerspective(card, Hm, (W, H), flags=cv2.INTER_LINEAR); card = (card.astype(np.float32) * min(1.0, 0.25 + up * 1.5)).astype(np.uint8)
        elif sai > 0:
            Hm = cv2.getRotationMatrix2D((CX, CY), 0, 1 - 0.12 * eo3(sai)); card = cv2.warpAffine(card, Hm, (W, H), flags=cv2.INTER_LINEAR)
        # fio do cartao ate a TV em foco
        if src is not None and up >= 1:
            alvo = src[1] * 0.5 + src[2] * 0.5 if src.mean(0)[0] < CB[0] else src.mean(0)
            if alvo[0] < CB[0] - 30:
                pa = caminho([(CB[0] - 4, CB[3] - 60), (alvo[0] + 22, alvo[1])]); uf = eo3(prog(k, max(K_CARD + 9, (K_NOV + 8 if nome == 'nov' else K_HOR + 8 if nome == 'hor' else 0)), 7))
                c.drawPath(trim(pa, 0, uf), tinta((0, 0, 0), 0.4 * op, traco=4.5, blur=2.5)); c.drawPath(trim(pa, 0, uf), tinta(BRANCO, 0.9 * op, traco=1.8)); c.drawCircle(alvo[0] + 22, alvo[1], 4.5 * uf, tinta(AMBAR, op))
        aba(c, 'OFERTAS', 470, K_OFE, k, 1.0 if (nome in ('omo', 'hor')) else 0.0, op)
        aba(c, 'NOVIDADE DE PRODUTOS', 530, K_NOV, k, 1.0 if nome == 'nov' else 0.0, op)
        img = sobre_f(img, to.a); img = sobre_f(img, card); msk = np.maximum(to.a[:, :, 3], card[:, :, 3]).astype(np.float32) / 255
    else:
        img = sobre_f(img, to.a); msk = to.a[:, :, 3].astype(np.float32) / 255
    out = np.clip(img, 0, 255).astype(np.uint8)
    if msk.max() > 0.01: out = grao_mascara(out, mx.COR[P.p['cor']]['grao'], G0 + k, cv2.GaussianBlur(msk, (0, 0), 1.0))
    if R is not None:
        from kal import cobre_rosto
        R.append((k, cobre_rosto(msk, RST.detecta(plate))))
    return out

if __name__ == '__main__':
    info4k = {n_: {x: d[x] for x in ('quadro4k', 'tam4k', 'nitidez', 'inliers')} for n_, d in IMG.items()}
    if TESTE:
        os.makedirs(f'{VF}/chk/{VID}', exist_ok=True)
        for k in TESTE: cv2.imwrite(f'{VF}/chk/{VID}/t{k:03d}.png', quadro(k))
        cv2.imwrite(f'{VF}/chk/{VID}/tvs_reais.jpg', np.hstack([IMG[n_]['bgr'] for n_ in ('omo', 'nov', 'hor')]), [cv2.IMWRITE_JPEG_QUALITY, 93])
        print('teste', N, dict(K_CARD=K_CARD, K_OFE=K_OFE, K_NOV=K_NOV, K_HOR=K_HOR), info4k, [(min(t), max(t)) for t in (OMO, NOV, HOR)]); sys.exit()
    R = []; out = Saida(VID, N, guarda=(12, 40, 70, 92, 110))
    for k in range(N): out.poe(quadro(k, R))
    f = out.fecha(); toc = [(k, r) for k, r in R if r]; alt = max([x[1] for k, r in toc for x in r] or [0])
    registra(VID, dict(arquivo=f, t0=v['t0'], t1=v['t1'], g0=G0, g1=G1, quadros=N, tipo='tela (TVs da loja)', plano='P11', fonte_plano=P.f, fonte_origem=P.org, md5_plano=P.md5(),
                       modo='substitui a base de g0 a g1-1 (opaca). Os elementos saem nos ultimos 6 quadros (o flash P11->P12 vem logo depois).',
                       contem=['colchetes seguindo as 3 TVs (trilha por LK): em foco = ambar', 'rotulo TVs DA LOJA · no ar', 'cartao %s com os pixels reais do 4K (%dx%d, reduzidos; nada redigitado), inclinado 2 graus' % (CB, IW, IH),
                               'ordem do cartao: OMO (salta da TV em k=%d) -> NOVIDADE (k=%d) -> HORTIFRUTI (k=%d)' % (K_CARD, K_NOV, K_HOR), 'abas OFERTAS (k=%d) e NOVIDADE DE PRODUTOS (k=%d) a esquerda do cartao' % (K_OFE, K_NOV), 'fio do cartao ate a TV em foco'],
                       pixels_4k=info4k, rostos=dict(quadros_com_rosto_tocado=len(toc), maior_altura_px=alt, detalhe=toc[:30]), fica_para_motion=['legenda y 0.70', 'relogio']))
    progresso(f'{VID} pronto ({N} quadros): TVs com pixels reais do 4K. Rostos tocados: {len(toc)} quadros (maior {alt} px).'); print('ok', f, len(toc), alt)
