# sistema.py: redesenho vetorial da TELA DO SISTEMA de fila (so o que se le no 4K do IMG_5160 37,2 s:
# "Fila do Açougue Super Kal", "AÇOUGUE FILA", AÇOUGUE 1/2 · ATENDENDO A SENHA · 011/012, botoes Chamar próxima / Chamar de novo,
# PRÓXIMA SENHA 013, "19 pessoas em espera", 014..025, Emitir senha, Reimprimir). Cores tiradas da propria tela.
from vx import *
NAVY = (19, 36, 92); NAVY2 = (28, 50, 120); BORDA = (70, 100, 180); PILL = (229, 72, 77); CAP = (170, 190, 235); AMAR = (250, 212, 62); BTN = (44, 74, 156)
FILA = ['014', '015', '016', '017', '018', '019', '020', '021', '022', '023', '024', '025']

def _pill(c, cx, cy, txt, tam, op):
    f = fonte('iblack', tam); w = larg(txt, f, 0.05) + tam * 1.7; h = tam * 1.85
    c.drawRRect(rr(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, h / 2), tinta(PILL, op))
    texto(c, txt, cx, cy + tam * 0.36, f, BRANCO, op, track=0.05, alinh='c')
def _botao(c, x0, y0, x1, y1, txt, rgb, tam, op, sub=None):
    c.drawRRect(rr(x0, y0, x1, y1, 9), tinta(rgb, op)); f = fonte('iblack', tam)
    texto(c, txt, (x0 + x1) / 2, (y0 + y1) / 2 + tam * (0.36 if not sub else 0.05), f, BRANCO, op, alinh='c')
    if sub: texto(c, sub, (x0 + x1) / 2, (y0 + y1) / 2 + tam * 1.0, fonte('imed', tam * 0.62), BRANCO, op * 0.75, alinh='c')
def _num(c, txt, cx, cy, tam, rgb, op, esc=1.0, brilho=0.0):
    f = fonte('iblack', tam); c.save(); c.translate(cx, cy); c.scale(esc, esc)
    if brilho > 0: texto(c, txt, 0, tam * 0.36, f, rgb, op * brilho * 0.8, alinh='c', blur=tam * 0.10)
    texto(c, txt, 0, tam * 0.36, f, rgb, op, alinh='c'); c.restore()
def _celula(c, x0, y0, x1, y1, op, destaque=0.0, r=14):
    c.drawRRect(rr(x0, y0, x1, y1, r), tinta(NAVY2, op))
    c.drawRRect(rr(x0 + 1, y0 + 1, x1 - 1, y1 - 1, r), tinta(BORDA, op * 0.9, traco=2))
    if destaque > 0:
        c.drawRRect(rr(x0 - 2, y0 - 2, x1 + 2, y1 + 2, r + 2), tinta(AMBAR, op * destaque * 0.55, traco=10, blur=7))
        c.drawRRect(rr(x0, y0, x1, y1, r), tinta(AMBAR, op * destaque, traco=3.5))

def replica(tl, cx, st, op=1.0):
    """replica inteira da tela (V01) na caixa cx=[x0,y0,x1,y1]. st: pulso1, pulso2 (0..1), prox (0..1)"""
    c = tl.c; x0, y0, x1, y1 = cx; Wc, Hc = x1 - x0, y1 - y0; u = Wc / 860.0
    c.drawRRect(rr(x0, y0 + 12, x1, y1 + 18, 20), tinta((0, 0, 0), 0.45 * op, blur=22))
    c.drawRRect(rr(x0, y0, x1, y1, 20 * u), tinta(NAVY, 0.975 * op))
    c.drawRRect(rr(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 20 * u), tinta(BRANCO, 0.34 * op, traco=2))
    # barra do titulo
    texto(c, 'Fila do Açougue Super Kal', x0 + 26 * u, y0 + 42 * u, fonte('imed', 23 * u), (205, 218, 246), op)
    wa = texto(c, 'AÇOUGUE', x0 + 26 * u, y0 + 88 * u, fonte('iblack', 25 * u), BRANCO, op, track=0.04)
    texto(c, 'FILA', x0 + 26 * u + wa + 12 * u, y0 + 88 * u, fonte('iblack', 25 * u), PILL, op, track=0.04)
    # 3 cartoes
    cy0, cy1 = y0 + 108 * u, y1 - 20 * u
    X = [(x0 + 20 * u, x0 + 296 * u), (x0 + 308 * u, x0 + 584 * u), (x0 + 596 * u, x1 - 20 * u)]
    for i, (a, b) in enumerate(X[:2]):
        _celula(c, a, cy0, b, cy1, op); mx_ = (a + b) / 2; p = st.get('pulso%d' % (i + 1), 0.0)
        _pill(c, mx_, cy0 + 36 * u, 'AÇOUGUE %d' % (i + 1), 17 * u, op)
        texto(c, 'ATENDENDO A SENHA', mx_, cy0 + 82 * u, fonte('mono', 13.5 * u), CAP, op, track=0.14, alinh='c')
        _num(c, '01%d' % (i + 1), mx_, cy0 + 196 * u, 132 * u, BRANCO, op, 1 + 0.10 * p, p)
        if p > 0.02: c.drawRRect(rr(a, cy0, b, cy1, 14), tinta(BRANCO, op * p * 0.8, traco=3))
        _botao(c, a + 14 * u, cy1 - 78 * u, mx_ - 5 * u, cy1 - 18 * u, 'Chamar próxima', PILL, 12.6 * u, op)
        _botao(c, mx_ + 5 * u, cy1 - 78 * u, b - 14 * u, cy1 - 18 * u, 'Chamar de novo', BTN, 12.6 * u, op)
    a, b = X[2]; pr = st.get('prox', 0.0); _celula(c, a, cy0, b, cy1, op, pr); mx_ = (a + b) / 2
    texto(c, 'PRÓXIMA SENHA', a + 18 * u, cy0 + 40 * u, fonte('mono', 14.5 * u), AMBAR if pr > 0.5 else CAP, op, track=0.12)
    f13 = fonte('iblack', 86 * u); c.save(); c.translate(a + 16 * u, cy0 + 118 * u); c.scale(1 + 0.06 * pr, 1 + 0.06 * pr)
    if pr > 0: texto(c, '013', 0, 0, f13, AMAR, op * pr * 0.7, blur=9)
    texto(c, '013', 0, 0, f13, AMAR, op); c.restore()
    texto(c, '19 pessoas em espera', a + 18 * u, cy0 + 156 * u, fonte('iblack', 16.5 * u), BRANCO, op)
    if pr > 0: c.drawLine(a + 18 * u, cy0 + 164 * u, a + 18 * u + 196 * u * eo3(pr), cy0 + 164 * u, tinta(AMBAR, op, traco=3))
    fq = fonte('iblack', 17.5 * u)
    for j, n_ in enumerate(FILA):
        gx = a + 16 * u + (j % 4) * 53 * u; gy = cy0 + 182 * u + (j // 4) * 34 * u
        c.drawRRect(rr(gx, gy, gx + 47 * u, gy + 27 * u, 6), tinta(NAVY, op)); texto(c, n_, gx + 23.5 * u, gy + 20 * u, fq, BRANCO, op, alinh='c')
    _botao(c, a + 12 * u, cy1 - 78 * u, mx_ - 4 * u, cy1 - 18 * u, 'Emitir senha', BTN, 13 * u, op)
    _botao(c, mx_ + 4 * u, cy1 - 78 * u, b - 12 * u, cy1 - 18 * u, 'Reimprimir', BTN, 13 * u, op)

def painel(tl, cx, st, op=1.0, abre=1.0):
    """painel compacto (V05): 3 celulas. st: n1 (texto), n1_ant, rola1 (0..1), n3, n3_ant, rola3, prox (0..1), esconde3 (0..1), chamada (0..1 de cada pulso)"""
    c = tl.c; x0, y0, x1, y1 = cx; mxp = (x0 + x1) / 2
    c.save(); c.clipRect(skia.Rect.MakeLTRB(mxp - (mxp - x0 + 30) * abre, y0 - 40, mxp + (x1 - mxp + 30) * abre, y1 + 60))
    vidro(c, x0, y0, x1, y1, r=14, a=0.86 * op, sombra=0.36 * op)
    c.restore()
    # borda desenhada do centro para fora + cantos vermelhos
    pa = skia.Path(); pa.addRRect(rr(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 14)); c.save()
    c.clipRect(skia.Rect.MakeLTRB(mxp - (mxp - x0 + 4) * abre, y0 - 4, mxp + (x1 - mxp + 4) * abre, y1 + 4)); c.drawPath(pa, tinta(BRANCO, 0.55 * op, traco=2)); c.restore()
    if abre < 0.985: return
    ue = st.get('conteudo', 1.0); oc = op * ue
    cantos(c, x0 - 8, y0 - 8, x1 + 8, y1 + 8, arm=22, esp=5, a=oc)
    # rotulo obrigatorio
    c.drawCircle(x0 + 30, y0 + 31, 7, tinta(AMBAR, oc * (0.6 + 0.4 * st.get('pisca', 1.0))))
    texto(c, 'SIMULAÇÃO · SISTEMA EM IMPLANTAÇÃO', x0 + 48, y0 + 38, fonte('mono', 20), AMBAR, oc, track=0.045)
    cy0, cy1 = y0 + 58, y1 - 14; g = 10; wc = (x1 - x0 - 28 - 2 * g) / 3.0
    for i in range(3):
        a = x0 + 14 + i * (wc + g); b = a + wc; mx_ = (a + b) / 2; pr = st.get('prox', 0.0) if i == 2 else 0.0
        _celula(c, a, cy0, b, cy1, oc, pr, r=12)
        if i < 2:
            _pill(c, mx_, cy0 + 30, 'AÇOUGUE %d' % (i + 1), 15, oc); texto(c, 'ATENDENDO A SENHA', mx_, cy0 + 66, fonte('mono', 11.5), CAP, oc, track=0.12, alinh='c')
        else:
            texto(c, 'PRÓXIMA SENHA', mx_, cy0 + 37, fonte('mono', 15), AMBAR if pr > 0.5 else CAP, oc, track=0.10, alinh='c')
        ncy = cy0 + (cy1 - cy0) * 0.66; tam = 88
        key = ('n1', 'n2', 'n3')[i]; novo = st.get(key, ''); ant = st.get(key + '_ant'); rola = st.get('rola' + key[1], 1.0)
        rgb = AMAR if i == 2 else BRANCO
        c.save(); c.clipRect(skia.Rect.MakeLTRB(a + 4, cy0 + 74, b - 4, cy1 - 4))
        esc_ = st.get('esc' + key[1], 1.0); opn = oc * (1 - st.get('esconde' + key[1], 0.0))
        if ant is not None and rola < 1:
            e = eo5(rola); _num(c, ant, mx_, ncy - 110 * e, tam, rgb, opn * (1 - e)); _num(c, novo, mx_, ncy + 110 * (1 - e), tam, rgb, opn * e)
        else: _num(c, novo, mx_, ncy, tam, rgb, opn, esc_, st.get('brilho' + key[1], 0.0))
        c.restore()
        ch = st.get('chamada', None)
        if i == 0 and ch is not None:
            for uu in ch:
                if 0 < uu < 1: c.drawRRect(rr(a - 22 * uu, cy0 - 22 * uu, b + 22 * uu, cy1 + 22 * uu, 12 + 22 * uu), tinta(AMBAR, oc * (1 - uu) * 0.95, traco=5 - 3 * uu))
    return (x0 + 14 + 2 * (wc + g) + wc / 2, cy0 + (cy1 - cy0) * 0.66), (x0 + 14 + wc / 2, cy0 + (cy1 - cy0) * 0.66)
