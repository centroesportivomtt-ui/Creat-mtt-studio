# acougue.py [quadros g de teste]: V05 (painel SIMULACAO do sistema na parede do acougue, P14+P15) e V06 (KAL 2 aponta e da joinha, P15).
# As duas placas se sobrepoem no tempo (53.217-56.142): saem do MESMO render, entao tanto faz a ordem em que entram na linha.
import sys
from kal import *
import sistema as SIS
import rostos as RST

TESTE = [int(x) for x in sys.argv[1:]]
v5, A0, A1 = vfx('V05'); v6, B0, B1 = vfx('V06'); s5, s6 = v5['spec'], v6['spec']
P14, P15 = Plano('P14'), Plano('P15'); COR_P = mx.COR[P15.p['cor']]
def plano(g): return P14 if g < P15.g0 else P15
# cauda do zoom_through P13->P14 (igual a build/video/py/base.py) nos quadros em que a placa cobre a janela da transicao
TZ = next(t for t in E['transicoes'] if t['entre'] == ['P13', 'P14']); CZ = fr(TZ['corte_t']); NZ = fr(TZ['dur'] / 2)
def chapa(g):
    im = plano(g).get(g)
    if TZ['tipo'] == 'zoom_through' and CZ <= g < CZ + NZ:
        u = (g - (CZ - NZ) + 0.5) / (2 * NZ); e = ((1 - u) / 0.5) ** 2
        im = radial(escala(im, 1 + 0.9 * e, interp=cv2.INTER_LINEAR), 1.0, 0.10 * e)
    return im
# ---------------- painel ----------------
PB = [90, 400, 720, 695]                     # contrato: [90,400,720,830]; encolhido: de 54,4 s em diante ha rostos dos acougueiros abaixo de y 700
K_PROX = fr(49.715) - A0; K_SALTO = fr(53.75) - A0; K_CHAMA = fr(55.667) - A0; K_SAI = (A1 - A0) - 5
def ancora_parede():
    """ponto da parede (onde a TV vai ficar), seguido pela camera com afim quadro a quadro"""
    out = {}
    for P, g_ref, pt in ((P14, P15.g0 - 6, (868.0, 560.0)), (P15, None, None)):
        gs = list(range(max(P.g0, A0 - 2), min(P.g1, B1)))
        if g_ref is None: g_ref = gs[0]; pt = out[P15.g0 - 1]
        prev = None; Aff = {}
        for g in gs:
            gr = cv2.cvtColor(cv2.resize(P.get(g), (360, 640), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY); A_ = np.eye(2, 3)
            if prev is not None:
                p = cv2.goodFeaturesToTrack(prev, 300, 0.008, 8, mask=MASC)
                if p is not None and len(p) >= 10:
                    q, st, _ = cv2.calcOpticalFlowPyrLK(prev, gr, p, None); ok = st.ravel() == 1
                    if ok.sum() >= 8:
                        a_, _ = cv2.estimateAffinePartial2D(p[ok], q[ok], method=cv2.RANSAC, ransacReprojThreshold=1.5)
                        if a_ is not None: A_ = a_
            Aff[g] = A_; prev = gr
        pos = {g_ref: np.array(pt) / 3.0}
        for g in range(g_ref + 1, gs[-1] + 1): pos[g] = Aff[g] @ np.append(pos[g - 1], 1.0)
        for g in range(g_ref - 1, gs[0] - 1, -1):
            A_ = np.vstack([Aff[g + 1], [0, 0, 1]]); pos[g] = (np.linalg.inv(A_) @ np.append(pos[g + 1], 1.0))[:2]
        arr = np.array([pos[g] * 3.0 for g in gs]); r = 7; kk = np.exp(-0.5 * (np.arange(-r, r + 1) / 2.5) ** 2); kk /= kk.sum()
        sm = np.stack([np.convolve(np.pad(arr[:, j], (r, r), mode='edge'), kk, 'valid') for j in range(2)], 1)
        for g, p_ in zip(gs, sm): out[g] = (float(p_[0]), float(p_[1]))
    return out
MASC = np.zeros((640, 360), np.uint8); MASC[:330] = 255      # so a parte de cima (parede, teto, luminarias): as pessoas se mexem
ANC = ancora_parede()
tp = Tela(); tn = Tela(); VIS = [1.0]
F_TV = fonte('mono', 17)
def desenha_painel(g):
    """devolve (camada RGBA, mascara) do painel + fio + numero que salta"""
    k = g - A0; tp.limpa(); c = tp.c
    if k < 0 or g >= A1: return None
    sai = prog(k, K_SAI, 5); op = 1 - eo3(sai); abre = eo5(prog(k, 0, 9)) * (1 - 0.0 * sai)
    dy = -14 * eio(prog(g, 1636, 28)); cx = [PB[0], PB[1] + dy, PB[2], PB[3] + dy]
    st = dict(conteudo=eo3(prog(k, 6, 7)), pisca=0.5 + 0.5 * math.cos(k / FPS * 2 * math.pi * 1.1), n1='011', n2='012', n3='013')
    pr = eo3(prog(k, K_PROX, 8)); st['prox'] = pr * (0.75 + 0.25 * math.exp(-max(0, k - K_PROX - 8) / 10.0))
    ks = k - K_SALTO
    if ks >= 0:
        st['esconde3'] = 1.0 if ks < 6 else 0.0
        if ks >= 6: st.update(n3='014', n3_ant='013' if ks < 15 else None, rola3=prog(ks, 6, 8)); st['n3_ant'] = None if ks < 6 else st['n3_ant']
        if ks >= 15: st.update(n1='013', n1_ant='011', rola1=1.0, esconde1=1.0 if ks < 21 else 0.0)
        if 15 <= ks < 21: st.update(n1='011', n1_ant=None, esconde1=eo3(prog(ks, 15, 4)))
        if ks >= 21: st.update(n1='013', n1_ant=None, esconde1=0.0, brilho1=max(0.0, 1 - (ks - 21) / 10.0))
        st['prox'] = st['prox'] * (1 - prog(ks, 15, 6))
    kc = k - K_CHAMA
    if kc >= 0: st['chamada'] = [prog(kc, 0, 8), prog(kc, 4, 8)]
    # fio ate o ponto da parede
    a = ANC.get(g)
    if a is not None and abre >= 0.985:
        ax, ay = a; inside = 60 <= ax <= W - 130 and 390 <= ay <= 1200
        fora = max(cx[0] - ax, ax - cx[2], cx[1] - ay, ay - cx[3])            # distancia para fora do painel
        VIS[0] += (1.0 if (inside and fora > 60) else -1.0) / 6.0; VIS[0] = min(1.0, max(0.0, VIS[0]))
        uf = eo3(prog(k, 9, 10)) * eio(VIS[0])
        sx_, sy_ = cx[2], (cx[1] + cx[3]) / 2 - 40
        if ax < cx[2] + 30: sx_, sy_ = (cx[0] + cx[2]) / 2 + 120, cx[1]
        ex, ey = min(max(ax, 30), W - 30), min(max(ay, 290), 1450)
        pa = caminho([(sx_, sy_), (sx_ + (ex - sx_) * 0.35, sy_ + (ey - sy_) * 0.0) if ax >= cx[2] + 30 else (sx_, sy_ - 30), (ex, ey)])
        c.drawPath(trim(pa, 0, uf), tinta((0, 0, 0), 0.35 * op, traco=4.5, blur=2.5)); c.drawPath(trim(pa, 0, uf), tinta(BRANCO, 0.9 * op, traco=1.8))
        op_a = op * eio(VIS[0])
        if uf > 0.9 and inside:
            ur = eback(prog(k, 19, 7)); pul = 1 + 0.10 * math.sin(k / FPS * 2 * math.pi * 1.5)
            c.drawCircle(ex, ey, 17 * ur * pul, tinta((0, 0, 0), 0.4 * op, traco=6, blur=2)); c.drawCircle(ex, ey, 17 * ur * pul, tinta(AMBAR, op, traco=3)); c.drawCircle(ex, ey, 4 * ur, tinta(BRANCO, op))
            w = larg('TV', F_TV, 0.1) + 22; c.drawRRect(rr(ex + 26, ey - 16, ex + 26 + w, ey + 14, 6), tinta(GRAF, 0.84 * op * ur))
            texto(c, 'TV', ex + 37, ey + 6, F_TV, AMBAR, op * ur, track=0.1)
    cen = SIS.painel(tp, cx, st, op, abre)
    # o 013 salta para a frente
    if cen and 0 <= ks < 21:
        (x3, y3), (x1, y1) = cen; fx, fy = (cx[0] + cx[2]) / 2 + 25, (cx[1] + cx[3]) / 2 + 55
        if ks < 15: u = prog(ks, 0, 6); e = eback(u, 2.4); px, py, sc, mixw = x3 + (fx - x3) * eo3(u), y3 + (fy - y3) * eo3(u), 1 + 1.6 * e, 0.0
        else: u = eio(prog(ks, 15, 6)); px, py, sc, mixw = fx + (x1 - fx) * u, fy + (y1 - fy) * u, 2.6 - 1.6 * u, u
        rgb = tuple(SIS.AMAR[i] + (255 - SIS.AMAR[i]) * mixw for i in range(3)); f = fonte('iblack', 88)
        c.save(); c.translate(px, py); c.scale(sc, sc)
        texto(c, '013', 0, 32, f, (0, 0, 0), 0.55 * op, alinh='c', blur=9)
        if ks < 15: texto(c, '013', 0, 32, f, SIS.AMAR, 0.7 * op, alinh='c', blur=7)
        texto(c, '013', 0, 32, f, rgb, op, alinh='c'); c.restore()
        if ks < 9:
            ub = prog(ks, 1, 8); c.drawCircle(fx, fy, 90 + 190 * eo3(ub), tinta(AMBAR, (1 - ub) * 0.9 * op, traco=6 - 4 * ub))
    return tp.a
# ---------------- Kal 2 ----------------
CARD = [600, 1372, 950, 1474]; LOGO = [866, 1380, 940, 1466]
PL = Plaquinha(CARD, LOGO, [('FILA DO AÇOUGUE', 'mono', 17, AMBAR, 1411, 0.06), ('SUPER KAL', 'anton', 45, BRANCO, 1459, 0.01)])
NK = B1 - B0; KAL, px_rel = carrega('2_entrega', s6['q_ini'], s6['q_ini'] + NK)
X0 = 605; YBASE = CARD[1] + 26; CORTE = CARD[1] + 4; ALT = 366; K_DESCE = 79; N_DESCE = 8; K_CARD_SAI = 86
cam15 = movimento([P15.get(g) for g in range(B0 - 4, B1)]); tre = tremor(cam15)[4:4 + NK]
def altura(k):
    if k < K_DESCE: return subida(k - 1, 10)
    return 1 - ei3(prog(k, K_DESCE, N_DESCE))

def quadro(g, R=None):
    plate = chapa(g); img = plate.astype(np.float32); msk = np.zeros((H, W), np.float32)
    lay = desenha_painel(g)
    if lay is not None:
        img = sobre_f(img, lay); msk = np.maximum(msk, lay[:, :, 3].astype(np.float32) / 255)
    mk = np.zeros((H, W), np.float32)
    if g >= B0:
        k = g - B0; op_c = eo3(prog(k, 0, 4)) * (1 - prog(k, K_CARD_SAI, 3.6)); esc_c = 0.90 + 0.10 * eback(prog(k, 0, 6), 1.6)
        h = altura(k); h0 = altura(k - 1) if k > 0 else 0.0
        if h > 0.004 and op_c > 0:
            amb, preto = ambiente(plate, s6['caixa_kal']); vel = h - h0; st = float(np.clip(vel / 0.18, -1, 1)); fol = eio(prog(k, 2, 8)) * 0.35
            img, mk = poe_kal(img, KAL[min(k, len(KAL) - 1)], X0, YBASE + (1 - h) * ALT, CORTE, amb, preto, sx=1 - 0.025 * st, sy=1 + 0.04 * st,
                              mb=abs(vel) * ALT * 0.42, dx=tre[k, 0] * fol, dy=tre[k, 1] * fol)
        card = PL.desenha(op_c, esc_c, k - 2); img = sobre_f(img, card); mk = np.maximum(mk, card[:, :, 3].astype(np.float32) / 255)
    out = np.clip(img, 0, 255).astype(np.uint8); mt = np.maximum(msk, mk)
    if mt.max() > 0.01: out = grao_mascara(out, COR_P['grao'] * 1.1, g, cv2.GaussianBlur(mt, (0, 0), 1.0))
    if R is not None:
        fc = RST.detecta(plano(g).get(g)); R.append((g, cobre_rosto(msk, fc, min_alt=0), cobre_rosto(mk, fc)))
    return out

if __name__ == '__main__':
    if TESTE:
        os.makedirs(f'{VF}/chk/V05', exist_ok=True)
        for g in TESTE: cv2.imwrite(f'{VF}/chk/V05/g{g}.png', quadro(g))
        print('teste', dict(A0=A0, A1=A1, B0=B0, B1=B1, K_PROX=K_PROX, K_SALTO=K_SALTO, K_CHAMA=K_CHAMA, K_SAI=K_SAI), 'anc', [(g, tuple(int(x) for x in ANC[g])) for g in (A0, 1470, 1522, 1523, 1560, 1600, 1650)]); sys.exit()
    R = []; o5 = Saida('V05', A1 - A0, guarda=(3, 80, 200, 250)); o6 = Saida('V06', B1 - B0, guarda=(6, 20, 55, 84))
    for g in range(A0, B1):
        q = quadro(g, R)
        if g < A1: o5.poe(q)
        if g >= B0: o6.poe(q)
    f5 = o5.fecha(); f6 = o6.fecha()
    tp_ = [(g, a) for g, a, b in R if a]; tk_ = [(g, b) for g, a, b in R if b]
    altp = max([x[1] for g, r in tp_ for x in r] or [0]); altk = max([x[1] for g, r in tk_ for x in r] or [0])
    comum = dict(planos=['P14', 'P15'], fonte_plano=[P14.f, P15.f], fonte_origem=[P14.org, P15.org], md5_plano=[P14.md5(), P15.md5()],
                 modo='substitui a base de g0 a g1-1 (opaca). V05 e V06 saem do mesmo render: no trecho comum (g %d a %d) os dois arquivos tem os mesmos pixels (painel + Kal).' % (B0, A1 - 1))
    registra('V05', dict(arquivo=f5, t0=v5['t0'], t1=v5['t1'], g0=A0, g1=A1, quadros=A1 - A0, tipo='tela (painel do sistema)', **comum,
                         contem=['painel de vidro %s (contrato pedia [90,400,720,830]; encolhido porque os rostos dos acougueiros sobem ate y 700 no fim do P15)' % PB, 'rotulo SIMULACAO · SISTEMA EM IMPLANTACAO o tempo todo',
                                 'ACOUGUE 1 · 011, ACOUGUE 2 · 012, PROXIMA SENHA · 013 (cores e textos da tela real)', '013 salta para a frente, vira a senha do ACOUGUE 1; proxima vira 014', 'anel de chamada 2x', 'fio + marca TV no ponto da parede (segue a camera)',
                                 'cauda do zoom_through P13->P14 nos 4 primeiros quadros (igual a base)', 'de g %d em diante tambem o Kal 2 + chip (mesmos pixels da V06)' % B0],
                         tempos_k=dict(abre=[0, 9], proxima_ambar=K_PROX, salto=K_SALTO, volta_para_acougue1=[K_SALTO + 15, K_SALTO + 21], chamada=K_CHAMA, sai=[K_SAI, A1 - A0]),
                         rostos=dict(quadros_com_rosto_tocado=len(tp_), maior_altura_px=altp, detalhe=tp_[:40]), fica_para_motion=['legenda', 'relogio']))
    registra('V06', dict(arquivo=f6, t0=v6['t0'], t1=v6['t1'], g0=B0, g1=B1, quadros=B1 - B0, tipo='kal', **comum,
                         contem=['chip de vidro [600,1372,950,1474] com a logo oficial + FILA DO ACOUGUE / SUPER KAL', 'Kal 2 (q 12-96) a escala 0.31: aponta para o painel, volta, joinha', 'painel V05 por baixo (mesmos pixels)'],
                         kal_px=dict(largura=KW, escala=ESC), tempos_k=dict(chip=0, kal_sobe=[1, 11], aponta=[8, 36], joinha=[48, 80], kal_desce=[K_DESCE, K_DESCE + N_DESCE], chip_sai=[K_CARD_SAI, K_CARD_SAI + 4]),
                         rostos=dict(quadros_com_rosto_tocado=len(tk_), maior_altura_px=altk, detalhe=tk_[:40]), fica_para_motion=['legenda (cx 330)']))
    progresso(f'V05 ({A1 - A0} q) e V06 ({B1 - B0} q) prontos. Rostos tocados: painel {len(tp_)} quadros (maior {altp} px), Kal/chip {len(tk_)} quadros (maior {altk} px).'); print('ok', f5, f6, len(tp_), altp, len(tk_), altk)
