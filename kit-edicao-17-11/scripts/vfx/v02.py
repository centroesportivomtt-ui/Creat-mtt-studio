# v02.py [quadros de teste]: KAL 1 (chegada no Super Kal) sobre o P54. Kal pequeno (escala 0.31) saindo de tras da plaquinha
# de vidro com a logo oficial, no canto inferior direito da zona segura.
import sys
from kal import *
import rostos as RST

VID = 'V02'; TESTE = [int(x) for x in sys.argv[1:]]
v, G0, G1 = vfx(VID); N = G1 - G0; sp = v['spec']
P = Plano('P54'); COR_P = mx.COR[P.p['cor']]
CARD = [600, 1288, 950, 1474]; LOGO = [792, 1300, 946, 1470]
PL = Plaquinha(CARD, LOGO, [('O MASCOTE', 'anton', 40, BRANCO, 1352, 0.01), ('criação', 'imed', 22, OFF, 1391, 0.02), ('creat.MTT', 'mblack', 27, AMBAR, 1431, 0.0)])
KAL, px_rel = carrega('1_chegada', sp['q_ini'], sp['q_fim'])
X0 = 603; YBASE = CARD[1] + 26; CORTE = CARD[1] + 4; ALT = 432
K_TXT = fr(sp['etiqueta']['entra']) - G0
# o rosto da caixa entra na area da plaquinha em g=988 (k=90): o Kal desce antes e a plaquinha sai ate k=89
K_DESCE = 76; N_DESCE = 9; K_CARD_SAI = 85
cam = movimento([P.get(g) for g in range(G0 - 8, G1 + 8)]); tre = tremor(cam)[8:8 + N]

def altura(k):
    if k < K_DESCE: return subida(k - 1, 12)
    return 1 - ei3(prog(k, K_DESCE, N_DESCE))
def quadro(k, R=None):
    g = G0 + k; plate = P.get(g); img = plate.astype(np.float32)
    op_c = eo3(prog(k, 0, 5)) * (1 - prog(k, K_CARD_SAI, 4)); esc_c = 0.92 + 0.08 * eback(prog(k, 0, 6), 1.6)
    msk = np.zeros((H, W), np.float32)
    h = altura(k); h0 = altura(k - 1) if k > 0 else 0.0
    if h > 0.004 and op_c > 0:
        amb, preto = ambiente(plate, [606, 862, 926, 1300])
        vel = (h - h0); st = float(np.clip(vel / 0.16, -1, 1)); fol = eio(prog(k, 2, 10)) * 0.35
        img, msk = poe_kal(img, KAL[min(k, len(KAL) - 1)], X0, YBASE + (1 - h) * ALT, CORTE, amb, preto, sx=1 - 0.025 * st, sy=1 + 0.04 * st,
                           mb=abs(vel) * ALT * 0.42, dx=tre[k, 0] * fol, dy=tre[k, 1] * fol)
    card = PL.desenha(op_c, esc_c, k - K_TXT)
    img = sobre_f(img, card); msk = np.maximum(msk, card[:, :, 3].astype(np.float32) / 255)
    out = np.clip(img, 0, 255).astype(np.uint8)
    if msk.max() > 0.01: out = grao_mascara(out, COR_P['grao'] * 1.1, g, cv2.GaussianBlur(msk, (0, 0), 1.0))
    if R is not None: R.append((k, cobre_rosto(msk, RST.detecta(plate))))
    return out

if __name__ == '__main__':
    if TESTE:
        os.makedirs(f'{VF}/chk/{VID}', exist_ok=True)
        for k in TESTE: cv2.imwrite(f'{VF}/chk/{VID}/t{k:03d}.png', quadro(k))
        print('teste', N, 'relogio px', px_rel, P.f, P.org); sys.exit()
    R = []; out = Saida(VID, N, guarda=(8, 30, 60, 80))
    for k in range(N): out.poe(quadro(k, R))
    f = out.fecha()
    toc = [(k, r) for k, r in R if r]; alt = max([x[1] for k, r in toc for x in r] or [0])
    registra(VID, dict(arquivo=f, t0=v['t0'], t1=v['t1'], g0=G0, g1=G1, quadros=N, tipo='kal', plano='P54', fonte_plano=P.f, fonte_origem=P.org, md5_plano=P.md5(),
                       modo='substitui a base de g0 a g1-1 (opaca). Os 7 ultimos quadros (k>=90) sao o plano limpo.',
                       contem=['plaquinha de vidro grafite [600,1288,950,1474] com a logo oficial do Super Kal na caixa_final [792,1300,946,1470] e o texto O MASCOTE / criacao creat.MTT (a etiqueta foi para dentro da plaquinha, nao fica acima da cabeca)',
                               'Kal 1 (q 1-97) a escala 0.31 saindo de tras da plaquinha, relogio grafite, sombra, contato, grao'],
                       kal_px=dict(largura=KW, escala=ESC, caixa=[X0, YBASE - ALT, X0 + KW, CARD[1]]),
                       tempos_k=dict(plaquinha_entra=0, kal_sobe=[1, 13], texto=K_TXT, kal_desce=[K_DESCE, K_DESCE + N_DESCE], plaquinha_sai=[K_CARD_SAI, K_CARD_SAI + 4]),
                       rostos=dict(quadros_com_rosto_tocado=len(toc), maior_altura_px=alt, detalhe=[(k, r) for k, r in toc][:60]),
                       fica_para_motion=['legenda (cx 330, largura 0.48)', 'S03: a logo viaja ate a caixa_final ate 29.93; a plaquinha do motion deve sair ate 32.90 (g 987): depois disso o rosto da caixa entra na area']))
    progresso(f'{VID} pronto ({N} quadros). Rostos tocados pelo Kal/plaquinha: {len(toc)} quadros, maior rosto {alt} px de altura.'); print('ok', f, len(toc), alt)
