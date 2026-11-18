# v07.py [quadros de teste]: KAL 3 (soco BORA PRA CIMA!) sobre o P58 + WHIP VERTICAL para a estrada (P70).
# O Kal pequeno, no canto, dispara o movimento: no pico do soco o quadro inteiro e arrastado para cima com blur vertical
# e a estrada na chuva entra por baixo. O Kal, o chip e o letreiro saem junto, arrastados pelo proprio whip.
import sys
from kal import *
import rostos as RST

VID = 'V07'; TESTE = [int(x) for x in sys.argv[1:]]
v, G0, G1 = vfx(VID); N = G1 - G0; sp = v['spec']
P = Plano('P58'); B = Plano('P70'); COR_P = mx.COR[P.p['cor']]
CARD = [600, 1372, 950, 1474]; LOGO = [866, 1380, 940, 1466]
PL = Plaquinha(CARD, LOGO, [('O MASCOTE', 'mono', 17, AMBAR, 1411, 0.08), ('SUPER KAL', 'anton', 45, BRANCO, 1459, 0.01)])
KAL, px_rel = carrega('3_soco', sp['q_ini'], sp['q_ini'] + N)
X0 = 605; YBASE = CARD[1] + 26; CORTE = CARD[1] + 4; ALT = 372
K_SOCO = fr(sp['sincronia']['soco'][0]) - G0            # 28
K_WHIP = fr(sp['sincronia']['pico_e_whip']) - G0 - 2    # 36: o arrasto comeca 2 quadros antes do pico e explode nele
N_WHIP = N - K_WHIP - 0.5                               # termina no ultimo quadro da placa (so estrada)
cam = movimento([P.get(g) for g in range(G0 - 2, G1)]); tre = tremor(cam)[2:2 + N]
F_BORA = fonte('anton', 70)                             # correcao 1: 30% maior (era 54)
K_LET = fr(68.5) - G0                                   # 17: entra em 68,5 s, com os punhos do Kal (antes so no soco, k 28: ficava 0,3 s)
LET = [('BORA', 300, 1106, 0), ('PRA', 322, 1186, 3), ('CIMA!', 286, 1270, 6)]   # ordem de leitura da arte oficial: BORA em cima, CIMA! embaixo
tl = Tela()
def letreiro(k):
    """BORA / PRA / CIMA! em escada, Anton inclinada -6 graus, amarelo do Super Kal com contorno grafite"""
    tl.limpa(); c = tl.c
    for txt, x, y, d in LET:
        u = prog(k, K_LET + d, 6)
        if u <= 0: continue
        s = 0.55 + 0.45 * eback(u, 2.2); sobe = (1 - eo3(u)) * 46
        c.save(); c.translate(x, y + sobe); c.rotate(-6); c.skew(-0.14, 0); c.scale(s, s)
        c.drawString(txt, 3, 5, F_BORA, tinta((0, 0, 0), 0.45, blur=5))
        po = tinta(GRAF, 1.0, traco=8); c.drawString(txt, 0, 0, F_BORA, po)
        c.drawString(txt, 0, 0, F_BORA, tinta(AMARELO_SK, 1.0)); c.restore()
    return tl.a

def cena_a(k, R=None):
    """P58 com o Kal, o chip e o letreiro"""
    g = G0 + k; plate = P.get(g); img = plate.astype(np.float32)
    op_c = eo3(prog(k, 0, 4)); esc_c = 0.90 + 0.10 * eback(prog(k, 0, 6), 1.6)
    h = subida(k - 1, 10); h0 = subida(k - 2, 10) if k > 1 else 0.0; msk = np.zeros((H, W), np.float32)
    if h > 0.004:
        amb, preto = ambiente(plate, sp['caixa_kal']); vel = h - h0; st = float(np.clip(vel / 0.18, -1, 1))
        # no soco o corpo estica 3% para cima (so escala global)
        us = prog(k, K_SOCO + 6, 4) * (1 - prog(k, K_SOCO + 11, 5)); fol = eio(prog(k, 2, 8)) * 0.35
        img, msk = poe_kal(img, KAL[min(k, len(KAL) - 1)], X0, YBASE + (1 - h) * ALT, CORTE, amb, preto, sx=1 - 0.025 * st - 0.012 * us, sy=1 + 0.04 * st + 0.03 * us,
                           mb=abs(vel) * ALT * 0.42, dx=tre[k, 0] * fol, dy=tre[k, 1] * fol)
    card = PL.desenha(op_c, esc_c, k - 2); img = sobre_f(img, card); msk = np.maximum(msk, card[:, :, 3].astype(np.float32) / 255)
    if k >= K_LET:
        lt = letreiro(k); img = sobre_f(img, lt); msk = np.maximum(msk, lt[:, :, 3].astype(np.float32) / 255)
    out = np.clip(img, 0, 255).astype(np.uint8)
    if msk.max() > 0.01: out = grao_mascara(out, COR_P['grao'] * 1.1, g, cv2.GaussianBlur(msk, (0, 0), 1.0))
    if R is not None: R.append((k, cobre_rosto(msk, RST.detecta(plate))))
    return out

def quadro(k, R=None):
    a = cena_a(k, R)
    if k < K_WHIP: return a
    u = prog(k, K_WHIP - 0.5, N_WHIP); u0 = prog(k - 1, K_WHIP - 0.5, N_WHIP)
    e = u * u * u * (u * (6 * u - 15) + 10); e0 = u0 * u0 * u0 * (u0 * (6 * u0 - 15) + 10)
    off = e * H; L = int(min(340, abs(e - e0) * H * 0.72))
    if k == K_WHIP + 2: a = np.clip(a.astype(np.float32) * 1.14 + 6, 0, 255).astype(np.uint8)          # estalo de luz no pico do soco
    b = B.get(G0 + k)
    tira = np.vstack([a, b]); pad = L // 2 + 2
    y0 = int(round(off)); ya = max(0, y0 - pad); yb = min(2 * H, y0 + H + pad)
    jan = tira[ya:yb]
    if L >= 3: jan = cv2.filter2D(jan, -1, np.full((L, 1), 1.0 / L, np.float32), borderType=cv2.BORDER_REPLICATE)
    return np.ascontiguousarray(jan[y0 - ya:y0 - ya + H])

if __name__ == '__main__':
    if TESTE:
        os.makedirs(f'{VF}/chk/{VID}', exist_ok=True)
        for k in TESTE: cv2.imwrite(f'{VF}/chk/{VID}/t{k:03d}.png', quadro(k))
        print('teste', N, 'K_SOCO', K_SOCO, 'K_WHIP', K_WHIP, P.org, B.org, 'relogio', px_rel); sys.exit()
    R = []; out = Saida(VID, N, guarda=(12, 30, 37, 40, 45))
    for k in range(N): out.poe(quadro(k, R))
    f = out.fecha(); toc = [(k, r) for k, r in R if r]; alt = max([x[1] for k, r in toc for x in r] or [0])
    registra(VID, dict(arquivo=f, t0=v['t0'], t1=v['t1'], g0=G0, g1=G1, quadros=N, tipo='kal + whip vertical', planos=['P58', 'P70'], fonte_plano=[P.f, B.f], fonte_origem=[P.org, B.org], md5_plano=[P.md5(), B.md5()],
                       modo='substitui a base de g0 a g1-1 (opaca), incluindo a transicao whip_vertical P58->P70 inteira (g 2074 a 2083). O ultimo quadro e o P70 limpo.',
                       contem=['chip de vidro [600,1372,950,1474] com a logo oficial + O MASCOTE / SUPER KAL', 'Kal 3 (q 14-59) a escala 0.31', 'letreiro BORA PRA CIMA! (Anton inclinada, amarelo Super Kal, contorno grafite) em escada',
                               'whip vertical com blur de ate 340 px: o P58 inteiro (com Kal, chip e letreiro) sobe e a estrada (P70) entra por baixo'],
                       tempos_k=dict(chip=0, kal_sobe=[1, 11], soco=K_SOCO, letreiro=[K_LET, K_LET + 12], whip=[K_WHIP, N - 1], corte_contrato=fr(sp['sincronia']['corte']) - G0),
                       rostos=dict(quadros_com_rosto_tocado=len(toc), maior_altura_px=alt, detalhe=toc[:30]),
                       fica_para_motion=['relogio/linha do tempo', 'faixa RIACHAO -> VALENTE a partir de 69.305'],
                       aviso_base='a base NAO deve aplicar outra transicao P58->P70 por cima desta janela'))
    progresso(f'{VID} pronto ({N} quadros), whip vertical embutido (g 2074-2083). Rostos tocados: {len(toc)} quadros.'); print('ok', f, len(toc), alt)
