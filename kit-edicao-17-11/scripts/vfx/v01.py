# v01.py [quadros de teste]: O MONITOR VIRA MOTION (P03). Cantoneiras travam no bloco da fila na tela real (plano da tela
# seguido por homografia quadro a quadro), uma replica vetorial limpa se descola do monitor e vem para a frente, ligada por
# 4 fios aos cantos reais; 011 e 012 pulsam em "acougue"; PROXIMA SENHA 013 + "19 pessoas em espera" acende em "fila".
import sys
from vx import *
import sistema as SIS
import rostos as RST

VID = 'V01'; TESTE = [int(x) for x in sys.argv[1:]]
v, G0, G1 = vfx(VID); N = G1 - G0; sp = v['spec']
P = Plano('P03'); F0 = G0 - P.g0 + P.h; NF = len(P.q)
CB = [110, 392, 970, 942]          # contrato: [110,330,970,880]; desceu 62 px para nao entrar na faixa do relogio (y 300-372)
QF = np.float32([[CB[0], CB[1]], [CB[2], CB[1]], [CB[2], CB[3]], [CB[0], CB[3]]])
F_REF = 70; Q_REF = np.float32([[255, 1072], [787, 1147], [752, 1430], [246, 1340]])     # bloco dos 3 cartoes da fila no quadro 70 (aberto)
K_AC = fr(sp['sincronia']['acougue']) - G0; K_FILA = fr(sp['sincronia']['fila']) - G0

def plano_da_tela():
    """homografia do quadro F_REF para cada quadro: SIFT entre quadros vizinhos, so na area azul da tela; devolve quad por quadro"""
    sift = cv2.SIFT_create(2500); bf = cv2.BFMatcher(); KD = []
    for im in P.q:
        sm = cv2.resize(im, (540, 960), interpolation=cv2.INTER_AREA); hsv = cv2.cvtColor(sm, cv2.COLOR_BGR2HSV)
        mk = cv2.dilate((((hsv[:, :, 0] > 98) & (hsv[:, :, 0] < 132) & (hsv[:, :, 1] > 70)).astype(np.uint8)) * 255, np.ones((9, 9), np.uint8))
        KD.append(sift.detectAndCompute(cv2.cvtColor(sm, cv2.COLOR_BGR2GRAY), mk))
    def par(a, b):
        (ka, da), (kb, db) = KD[a], KD[b]
        if da is None or db is None or len(ka) < 12 or len(kb) < 12: return None, 0
        mm = [m for m, n_ in bf.knnMatch(da, db, k=2) if m.distance < 0.75 * n_.distance]
        if len(mm) < 12: return None, 0
        Hm, inl = cv2.findHomography(np.float32([ka[m.queryIdx].pt for m in mm]) * 2, np.float32([kb[m.trainIdx].pt for m in mm]) * 2, cv2.RANSAC, 3.0)
        return Hm, (int(inl.sum()) if inl is not None else 0)
    Hs = {F_REF: np.eye(3)}; inl = {F_REF: 999}
    for f in range(F_REF - 1, -1, -1):
        Hm, n_ = par(f + 1, f); Hs[f] = (Hm @ Hs[f + 1]) if (Hm is not None and n_ >= 10) else Hs[f + 1]; inl[f] = n_
    for f in range(F_REF + 1, NF):
        Hm, n_ = par(f - 1, f); Hs[f] = (Hm @ Hs[f - 1]) if (Hm is not None and n_ >= 10) else Hs[f - 1]; inl[f] = n_
    Q = np.array([cv2.perspectiveTransform(Q_REF.reshape(1, 4, 2), Hs[f])[0] for f in range(NF)])
    r = 3; kk = np.exp(-0.5 * (np.arange(-r, r + 1) / 1.1) ** 2); kk /= kk.sum()
    Qs = np.stack([np.convolve(np.pad(Q[:, i, j], (r, r), mode='edge'), kk, 'valid') for i in range(4) for j in range(2)], 1).reshape(-1, 4, 2)
    return Qs.astype(np.float32), inl
QUAD, INL = plano_da_tela()
tb = Tela(); tc = Tela()
def cantoneiras(c, q, op, esc):
    cen = q.mean(0); q = cen + (q - cen) * esc
    for i in range(4):
        a, b, d = q[i], q[(i + 1) % 4], q[(i - 1) % 4]; L = 0.085
        pa = caminho([tuple(a + (b - a) * L), tuple(a), tuple(a + (d - a) * L * 1.6)])
        c.drawPath(pa, tinta((0, 0, 0), 0.5 * op, traco=9, blur=2.5)); c.drawPath(pa, tinta(VERM, op, traco=6, redondo=False))
def quadro(k, R=None):
    f = F0 + k; plate = P.q[f]; q = QUAD[f]
    img = plate.astype(np.float32) * (1 - 0.25 * eo3(prog(k, 2, 9)))
    ul = prog(k, 4, 10); e = eo5(ul); st = dict(pulso1=math.exp(-((k - K_AC - 2) / 2.6) ** 2), pulso2=math.exp(-((k - K_AC - 8) / 2.6) ** 2), prox=eo3(prog(k, K_FILA, 7)))
    qc = q * (1 - e) + QF * e                                           # cantos do cartao: saem da tela real e chegam ao cartao frontal
    tb.limpa(); c = tb.c
    cantoneiras(c, q, eo3(prog(k, 0, 4)), 1 + 0.25 * (1 - eback(prog(k, 0, 6), 1.6)))
    if ul > 0:                                                          # 4 fios: canto do cartao -> canto real
        for i in range(4):
            c.drawLine(float(qc[i][0]), float(qc[i][1]), float(q[i][0]), float(q[i][1]), tinta((0, 0, 0), 0.35 * e, traco=4.5, blur=2.5))
            c.drawLine(float(qc[i][0]), float(qc[i][1]), float(q[i][0]), float(q[i][1]), tinta(BRANCO, 0.85 * e, traco=1.8))
            c.drawCircle(float(q[i][0]), float(q[i][1]), 5.0, tinta(BRANCO, e))
    img = sobre_f(img, tb.a); msk = tb.a[:, :, 3].astype(np.float32) / 255
    if ul > 0:
        tc.limpa(); SIS.replica(tc, CB, st, 1.0); card = tc.a
        if ul < 1:
            Hm = cv2.getPerspectiveTransform(QF, qc.astype(np.float32)); card = cv2.warpPerspective(card, Hm, (W, H), flags=cv2.INTER_LINEAR)
            card = (card.astype(np.float32) * min(1.0, ul * 2.2)).astype(np.uint8)
        img = sobre_f(img, card); msk = np.maximum(msk, card[:, :, 3].astype(np.float32) / 255)
    out = np.clip(img, 0, 255).astype(np.uint8)
    if msk.max() > 0.01: out = grao_mascara(out, mx.COR[P.p['cor']]['grao'], G0 + k, cv2.GaussianBlur(msk, (0, 0), 1.0))
    if R is not None:
        from kal import cobre_rosto
        R.append((k, cobre_rosto(msk, RST.detecta(plate))))
    return out

if __name__ == '__main__':
    if TESTE:
        os.makedirs(f'{VF}/chk/{VID}', exist_ok=True)
        for k in TESTE: cv2.imwrite(f'{VF}/chk/{VID}/t{k:03d}.png', quadro(k))
        print('teste', N, dict(F0=F0, K_AC=K_AC, K_FILA=K_FILA), 'inliers min', min(INL.values()), [(f, INL[f]) for f in sorted(INL) if INL[f] < 25][:20], 'quad f8', QUAD[8].astype(int).tolist(), 'f40', QUAD[40].astype(int).tolist()); sys.exit()
    R = []; out = Saida(VID, N, guarda=(8, 20, 40, 52, 66))
    for k in range(N): out.poe(quadro(k, R))
    f = out.fecha(); toc = [(k, r) for k, r in R if r]; alt = max([x[1] for k, r in toc for x in r] or [0])
    registra(VID, dict(arquivo=f, t0=v['t0'], t1=v['t1'], g0=G0, g1=G1, quadros=N, tipo='tela (monitor do sistema)', plano='P03', fonte_plano=P.f, fonte_origem=P.org, md5_plano=P.md5(),
                       modo='substitui a base de g0 a g1-1 (opaca); termina no corte P03->P04',
                       contem=['resto do quadro 25% mais escuro', 'cantoneiras vermelhas travadas no bloco da fila da tela real (plano seguido por homografia)', '4 fios dos cantos do cartao aos cantos reais',
                               'replica vetorial da tela na caixa %s (o contrato pedia [110,330,970,880]; desceu 62 px para sair da faixa do relogio)' % CB,
                               'textos da replica, todos conferidos no 4K (IMG_5160 37,2 s): Fila do Acougue Super Kal; ACOUGUE FILA; ACOUGUE 1/2 · ATENDENDO A SENHA · 011/012; Chamar proxima; Chamar de novo; PROXIMA SENHA 013; 19 pessoas em espera; 014 a 025; Emitir senha; Reimprimir',
                               '011 e 012 pulsam em acougue; coluna PROXIMA SENHA acende em ambar em fila'],
                       tempos_k=dict(cantoneiras=0, cartao_sobe=[4, 14], pulso_011=K_AC + 2, pulso_012=K_AC + 8, proxima_ambar=K_FILA),
                       rastreio=dict(metodo='SIFT quadro a quadro na area azul + homografia RANSAC', inliers_min=min(INL.values())),
                       rostos=dict(quadros_com_rosto_tocado=len(toc), maior_altura_px=alt), fica_para_motion=['legenda y 0.70', 'relogio']))
    progresso(f'{VID} pronto ({N} quadros): monitor -> replica do sistema'); print('ok', f, len(toc), alt)
