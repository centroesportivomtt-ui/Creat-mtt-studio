# visao.py V08|V09 [quadros de teste...]: A VISAO DA creat.MTT (BRABUS LOUNGE).
# quadro real congelado e escurecido -> blueprint sobe do chao linha a linha -> a luz acende em ondas -> conceito com
# camera 2.5D (dolly nao linear em torno do ponto de fuga) e particulas de luz -> a luz apaga (volta pelo blueprint).
# Rotulo "A VISAO DA creat.MTT · ESBOCO/CONCEITO" e notas de briefing fazem parte da placa.
import sys
from vx import *

VID = sys.argv[1]; TESTE = [int(x) for x in sys.argv[2:]]
v, G0, G1 = vfx(VID); N = G1 - G0; sp = v['spec']
n = 2 if VID == 'V08' else 3
VIS = M + '/build/visao'
bp = json.load(open(f'{VIS}/blueprint_{n}.json')); VP = np.array(bp['ponto_de_fuga'], np.float32)
PIV = 0.5 * VP + 0.5 * np.array([W / 2, H / 2], np.float32)
def k_de(t): return fr(t) - G0
S = sp['sequencia']
if VID == 'V08':
    kB0, kC0, kD0 = k_de(S[2]['de']), k_de(S[3]['de']), k_de(S[4]['de']); kOFF = N - 4
    NOTAS = [dict(txt=i['texto'], k=max(0, k_de(i['t']))) for i in sp['notas_de_briefing']['itens']]
    NOTAS[1]['k'] = max(NOTAS[1]['k'], 5)
    ALVO = {'FITA DE LED': ('esq', (182, 758)), 'PAREDE DE CORDAS': ('esq', (132, 942)), 'PINTURA NEON': ('dir', (985, 1002), 640), 'SAMAMBAIA': ('esq', (262, 882))}
    VELHAS = []; LUZ = (985, 1050); S_FIM = 1.115; C_FIM = 0.085; PAL = [(255, 205, 150), (255, 130, 205), (130, 225, 255)]
else:
    kB0, kC0, kD0 = 0, k_de(S[2]['de']), k_de(S[3]['de']); kOFF = k_de(S[4]['de'])
    NOTAS = [dict(txt=i['texto'], k=max(0, k_de(i['t']))) for i in sp['notas_de_briefing']['itens']]
    ALVO = {'AQUI DANÇANDO': ('dir', (428, 1085), 520), 'DENTRO DO LOUNGE': ('dir', (905, 1118), 700)}
    VELHAS = [i['texto'] for i in next(x for x in E['vfx'] if x['id'] == 'V08')['spec']['notas_de_briefing']['itens']]
    LUZ = (215, 700); S_FIM = 1.10; C_FIM = 0.10; PAL = [(255, 95, 225), (95, 225, 255), (255, 255, 255)]
    kPULSO = k_de(104.471); kDESLIZA = k_de(105.004); BEAT = 60.0 / E['musica']['bpm'] * FPS
kTROCA = k_de(sp['rotulo']['troca_em'])

# ---------------- imagens ----------------
base = cv2.imread(f'{VIS}/base_{n}.png'); base = grade_sem_grao(base, 'noturno_prospeccao')
gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)[:, :, None].astype(np.float32)
real = base.astype(np.float32) * 0.70 + gray * 0.30                        # -30% de saturacao
conc = cv2.imread(f'{VIS}/conceito_{n}.png'); c2k = cv2.imread(f'{VIS}/conceito_{n}_2k.png')
# afim 1080 -> 2k (o conceito alinhado e uma copia afim do 2k): ECC
def afim_2k():
    a = cv2.cvtColor(cv2.resize(conc, (540, 960), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
    b = cv2.cvtColor(cv2.resize(c2k, (540, 960), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
    Wm = np.eye(2, 3, dtype=np.float32)
    try: _, Wm = cv2.findTransformECC(a, b, Wm, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
    except cv2.error: pass
    # Wm leva coord de a (540) para b (540). passar para 1080 -> 2k
    sa = 1080 / 540.0; sbx = c2k.shape[1] / 540.0; sby = c2k.shape[0] / 960.0 * (960 / 960.0)
    A = np.array([[Wm[0, 0] * sbx / sa, Wm[0, 1] * sbx / sa, Wm[0, 2] * sbx], [Wm[1, 0] * sby / sa, Wm[1, 1] * sby / sa, Wm[1, 2] * sby]], np.float32)
    return A
A2K = afim_2k()
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
RMAX = float(max(np.hypot(PIV[0] - x, PIV[1] - y) for x in (0, W) for y in (0, H)))

def cam(k):
    """escala s, dolly c, deslocamento do centro (px da fonte)"""
    u_ab = prog(k, 0, max(1, kC0)); s = 1.0 + 0.035 * eio(u_ab) if VID == 'V08' else 1.0 + 0.02 * eio(u_ab)
    ud = prog(k, kC0, N - kC0); e = ud ** 1.15
    s0 = 1.035 if VID == 'V08' else 1.02
    if k >= kC0: s = s0 + (S_FIM - s0) * e
    c = C_FIM * e
    pan = (0.0, 0.0)
    if VID == 'V09':
        us = eio(prog(k, kDESLIZA, 30)); pan = (58.0 * us, 14.0 * us); s += 0.03 * us
    return s, c, pan
def mapas(s, c, pan):
    dx = XX - PIV[0]; dy = YY - PIV[1]
    den = s + c * np.sqrt(dx * dx + dy * dy) / RMAX
    return PIV[0] + dx / den + pan[0], PIV[1] + dy / den + pan[1]
def leva(q, s, c, pan):
    """ponto da fonte -> ponto da tela (inverso de mapas)"""
    d = np.array(q, np.float32) - np.array(pan, np.float32) - PIV; r = float(np.hypot(*d))
    if r < 1e-3: return tuple(PIV)
    ro = s * r / max(0.2, 1 - c * r / RMAX); return (float(PIV[0] + d[0] * ro / r), float(PIV[1] + d[1] * ro / r))
def conceito(s, c, pan):
    mx_, my_ = mapas(s, c, pan)
    u = A2K[0, 0] * mx_ + A2K[0, 1] * my_ + A2K[0, 2]; w = A2K[1, 0] * mx_ + A2K[1, 1] * my_ + A2K[1, 2]
    return cv2.remap(c2k, u, w, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
def real_cam(s):
    return escala(real, s, PIV[0], PIV[1]).astype(np.float32)

# ordem em que a luz acende: o mais claro e o mais perto da fonte nova primeiro
Lc = cv2.GaussianBlur(cv2.cvtColor(conc, cv2.COLOR_BGR2GRAY), (0, 0), 18).astype(np.float32); Lc = np.clip(Lc / np.percentile(Lc, 99.5), 0, 1)
DL = np.hypot(XX - LUZ[0], YY - LUZ[1]); DL /= DL.max()
ORD = 0.62 * (1 - Lc) + 0.38 * DL
IGN = [0.20, 0.07, 0.38, 0.26, 0.50, 0.64, 0.76, 0.86, 0.93, 0.975, 1.0]
hsv = cv2.cvtColor(conc, cv2.COLOR_BGR2HSV).astype(np.float32)
LASER = cv2.GaussianBlur(np.clip((hsv[:, :, 1] / 255 - 0.45) * 2.2, 0, 1) * np.clip((hsv[:, :, 2] / 255 - 0.5) * 2.5, 0, 1), (0, 0), 9)

# ---------------- blueprint ----------------
SEG = bp['segmentos']; NS = len(SEG)
nB = max(8, kC0 - kB0)
def seg_k0(i): return kB0 + (0.22 if VID == 'V08' else 0.10) * nB + (i / NS) ** 0.92 * (nB * (0.70 if VID == 'V08' else 0.62))
DSEG = 8 if VID == 'V08' else 5
CIANO = (120, 225, 255)
def piso(tl, k, s, op=1.0):
    """grade do piso em perspectiva, revelada de baixo para cima com uma linha de varredura"""
    c = tl.c; u = eo3(prog(k, kB0, nB * (0.30 if VID == 'V08' else 0.35))); yv = float(VP[1]); ytop = H - (H - yv - 30) * u
    c.save(); c.clipRect(skia.Rect.MakeLTRB(0, ytop, W, H)); p = tinta(CIANO, 0.15 * op, traco=1.0)
    for j in range(-9, 10):
        xb = VP[0] + j * 300; dx = xb - VP[0]; dy = H + 400 - yv; t0 = 70 / math.hypot(dx, dy)
        c.drawLine(float(VP[0] + dx * t0), float(yv + dy * t0), float(xb), float(H + 400), p)
    for j in range(3, 10):
        y = yv + (H - yv) * (j / 9.0) ** 1.8; c.drawLine(0, float(y), W, float(y), p)
    c.restore()
    if 0 < u < 1: c.drawLine(0, float(ytop), W, float(ytop), tinta(CIANO, 0.5 * (1 - u) * op, traco=2))
def linhas(tl, k, s, op=1.0, modo='est'):
    """modo 'est': linhas estruturais (ganham brilho); 'fino': grade do piso + linhas finas (sem brilho)"""
    c = tl.c; c.save(); c.translate(float(PIV[0]), float(PIV[1])); c.scale(s, s); c.translate(-float(PIV[0]), -float(PIV[1]))
    if modo == 'fino': piso(tl, k, s, op)
    for i, (x1, y1, x2, y2, est) in enumerate(SEG):
        if bool(est) != (modo == 'est'): continue
        if not est and math.hypot(x2 - x1, y2 - y1) < 46: continue
        u = prog(k, seg_k0(i), DSEG)
        if u <= 0: continue
        if y2 > y1: x1, y1, x2, y2 = x2, y2, x1, y1          # desenha de baixo para cima
        e = eo3(u); xe, ye = x1 + (x2 - x1) * e, y1 + (y2 - y1) * e
        c.drawLine(x1, y1, xe, ye, tinta(BRANCO if est else CIANO, (0.92 if est else 0.34) * op, traco=2.4 if est else 1.1))
        if u < 1 and est: c.drawCircle(xe, ye, 4.0, tinta(BRANCO, 0.95 * op))
    c.restore()

# ---------------- particulas de luz ----------------
rng = np.random.default_rng(11 + n); NPART = 64
PX = rng.uniform(-80, W + 80, NPART); PY = rng.uniform(250, H - 150, NPART); PZ = rng.uniform(0.15, 1.0, NPART) ** 1.6
PF = rng.uniform(0, 6.28, NPART); PC = rng.integers(0, 3, NPART)
def particulas(k, s, c, pan, forca):
    if forca <= 0: return None
    buf = np.zeros((H // 2, W // 2, 3), np.float32); t = k / FPS
    for i in range(NPART):
        z = PZ[i]; x = PX[i] + 14 * math.sin(t * 0.8 + PF[i]) * (0.4 + z); y = PY[i] - t * (10 + 34 * z) + 6 * math.sin(t * 1.3 + PF[i] * 2)
        ss_ = s + (s - 1 + c) * 3.2 * z
        xs = PIV[0] + (x - pan[0] - PIV[0]) * ss_; ys = PIV[1] + (y - pan[1] - PIV[1]) * ss_
        r = (1.6 + 7.5 * z * z); a = (0.22 + 0.5 * (0.5 + 0.5 * math.sin(t * 3.1 + PF[i] * 3))) * (1.0 - 0.55 * z) * forca
        col = PAL[PC[i]]; cv2.circle(buf, (int(xs / 2), int(ys / 2)), max(1, int(r / 2 + 0.5)), (col[2] * a, col[1] * a, col[0] * a), -1, cv2.LINE_AA)
    buf = cv2.GaussianBlur(buf, (0, 0), 1.4) + 0.6 * cv2.GaussianBlur(buf, (0, 0), 5)
    return cv2.resize(buf, (W, H), interpolation=cv2.INTER_LINEAR)

# ---------------- rotulo e notas ----------------
RX0, RY0, RY1 = sp['rotulo']['caixa'][0], sp['rotulo']['caixa'][1], sp['rotulo']['caixa'][3]
F_ROT = fonte('iblack', 29); F_MONO = fonte('mono', 32); F_CAB = fonte('mono', 21); F_VELHA = fonte('mono', 18)
def rotulo(tl, k, op):
    c = tl.c; t1, t2 = 'A VISÃO DA creat.MTT', '·'
    pal_a, pal_b = sp['rotulo']['esboco'].split('· ')[-1], sp['rotulo']['conceito'].split('· ')[-1]
    w1 = larg(t1, F_ROT, 0.03); wd = larg(t2, F_ROT); ut = eio(prog(k, kTROCA, 7))
    wa, wb = larg(pal_a, F_ROT, 0.03), larg(pal_b, F_ROT, 0.03); wp = wa + (wb - wa) * ut
    x = RX0 + 20; larg_t = 20 + 16 + 14 + w1 + 12 + wd + 12 + wp + 24
    ue = eo5(prog(k, 1, 11))
    c.save(); c.clipRect(skia.Rect.MakeLTRB(RX0 - 20, RY0 - 20, RX0 + larg_t * ue + (30 if ue >= 1 else 0), RY1 + 40))
    vidro(c, RX0, RY0, RX0 + larg_t, RY1, r=8, a=0.86 * op, sombra=0.32 * op)
    c.drawRect(skia.Rect.MakeLTRB(RX0, RY0 + 6, RX0 + 5, RY1 - 6), tinta(VERM, op))
    pul = 0.6 + 0.4 * math.cos(k / FPS * 2 * math.pi * 1.2)
    c.drawCircle(x + 8, (RY0 + RY1) / 2, 8, tinta(VERM, op * pul)); x += 16 + 14
    yb = (RY0 + RY1) / 2 + 10
    texto(c, t1, x, yb, F_ROT, BRANCO, op, track=0.03); x += w1 + 12
    texto(c, t2, x, yb, F_ROT, OFF, op * 0.7); x += wd + 12
    c.save(); c.clipRect(skia.Rect.MakeLTRB(x - 4, RY0 + 6, x + max(wa, wb) + 10, RY1 - 6))
    if ut < 1: texto(c, pal_a, x, yb - 34 * ut, F_ROT, AMBAR, op * (1 - ut), track=0.03)
    if ut > 0: texto(c, pal_b, x, yb + 34 * (1 - ut), F_ROT, AMBAR, op * ut, track=0.03)
    c.restore(); c.restore()

NX0 = 196; NTX = NX0 + 40; NY_CAB = 508
LH = 48
def linha_y(i): return (558 if not VELHAS else 622) + i * LH
def notas(tl, k, op, cam_, conc_on):
    c = tl.c; s, cc, pan = cam_
    ue = eo5(prog(k, 0, 8))
    # cabecalho
    c.save(); c.clipRect(skia.Rect.MakeLTRB(NX0 - 30, NY_CAB - 40, NX0 - 30 + 560 * ue, H))
    w = texto(c, 'BRIEFING', NX0, NY_CAB, F_CAB, AMBAR, op, track=0.08, sombra=0.8)
    texto(c, '· o que o espaço pede', NX0 + w + 12, NY_CAB, F_CAB, OFF, op * 0.85, track=0.02, sombra=0.8)
    c.restore()
    ativos = [i for i, nt in enumerate(NOTAS) if k >= nt['k']]
    yb_ = (linha_y(ativos[-1]) + 22) if ativos else NY_CAB + 16
    c.drawRRect(rr(NX0 - 44, NY_CAB - 44, NX0 + 372, yb_, 18), tinta((6, 6, 10), 0.40 * op * ue, blur=14))
    if VELHAS:
        l1 = ' · '.join(VELHAS[:3]); l2 = ' · '.join(VELHAS[3:])
        for j, l in enumerate((l1, l2)):
            texto(c, l, NX0, 542 + j * 27, F_VELHA, OFF, op * 0.62 * ue, track=0.02, sombra=0.7)
            c.drawLine(NX0 - 16, 542 + j * 27 - 6, NX0 - 8, 542 + j * 27 - 6, tinta(AMBAR, op * 0.6 * ue, traco=2))
    ybot = (linha_y(ativos[-1]) + 8) if ativos else NY_CAB + 12
    c.drawLine(NX0 - 22, NY_CAB - 22, NX0 - 22, NY_CAB - 22 + (ybot - NY_CAB + 22) * ue, tinta(BRANCO, 0.55 * op, traco=2.5))
    for i in ativos:
        nt = NOTAS[i]; kk = k - nt['k']; y = linha_y(i); txt = nt['txt']
        # tique ambar desenhado
        ut = eo3(prog(kk, 0, 5)); pa = caminho([(NX0, y - 13), (NX0 + 9, y - 3), (NX0 + 27, y - 25)])
        c.drawPath(trim(pa, 0, ut), tinta((0, 0, 0), 0.6 * op, traco=7, blur=2)); c.drawPath(trim(pa, 0, ut), tinta(AMBAR, op, traco=4.2))
        nch = min(len(txt), int(kk * 1.6) + 1)
        recente = kk < 26
        wtx = texto(c, txt[:nch], NTX, y, F_MONO, BRANCO, op * (1.0 if recente else 0.88), sombra=0.85)
        if nch < len(txt) or (kk < len(txt) / 1.6 + 8 and (kk // 3) % 2 == 0):
            c.drawRect(skia.Rect.MakeLTRB(NTX + wtx + 3, y - 26, NTX + wtx + 19, y + 4), tinta(AMBAR, op))
        # fio ate o elemento do conceito
        al = ALVO.get(txt)
        if al and conc_on is not None:
            kf = k - max(conc_on + (2 + 4 * list(ALVO).index(txt)), nt['k'] + 3)
            if VID == 'V09' and txt == 'DENTRO DO LOUNGE': kf = k - (kDESLIZA + 6)
            uf = eo3(prog(kf, 0, 10))
            if uf > 0:
                T = leva(al[1], s, cc, pan); wfull = larg(txt, F_MONO)
                if al[0] == 'esq': pts = [(NX0 - 22, y - 11), (NX0 - 48, y - 11), T]
                elif al[2]: pts = [(NTX + wfull + 14, y - 11), (al[2], y - 11), T]
                else: pts = [(NTX + wfull + 14, y - 11), (NTX + wfull + 40, y - 11), T]
                pa = caminho(pts); tr = trim(pa, 0, uf)
                c.drawPath(tr, tinta((0, 0, 0), 0.45 * op, traco=4.5, blur=2.5)); c.drawPath(tr, tinta(BRANCO, 0.92 * op, traco=1.8))
                c.drawCircle(pts[0][0], pts[0][1], 3.5, tinta(AMBAR, op))
                if uf >= 1:
                    ur = eback(prog(kf, 10, 7)); pul = 1 + 0.10 * math.sin((kf - 10) / FPS * 2 * math.pi * 1.6)
                    c.drawCircle(T[0], T[1], 15 * ur * pul, tinta((0, 0, 0), 0.5 * op, traco=6, blur=2)); c.drawCircle(T[0], T[1], 15 * ur * pul, tinta(AMBAR, op, traco=3))
                    c.drawCircle(T[0], T[1], 3.5 * ur, tinta(BRANCO, op))

# ---------------- quadro ----------------
tl = Tela(); tb = Tela()
def quadro(k):
    s, c, pan = cam(k); t_on = None
    # 1) fundo
    if k < kC0:
        img = real_cam(s) * (0.92 - 0.30 * eo3(prog(k, kB0, 24)))            # escurece para o desenho aparecer
        img[:, :, 0] += 5; al = 0.0
    else:
        kr = k - kC0; nC = kD0 - kC0
        u = IGN[min(kr, len(IGN) - 1)] if kr < len(IGN) else 1.0
        al_m = np.clip((u * 1.42 - ORD) / 0.36, 0, 1); al_m = al_m * al_m * (3 - 2 * al_m)
        cc_ = conceito(s, c, pan)
        if VID == 'V09' and k >= kPULSO:                                         # lasers pulsam 2x na batida
            pl = sum(math.exp(-(((k - kPULSO - j * BEAT)) / 2.4) ** 2) for j in (0, 1)) if k - kPULSO < 2.2 * BEAT else 0.0
            if pl > 0.01:
                lm = cv2.remap(LASER, *mapas(s, c, pan), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)[:, :, None]
                cc_ = cc_ * (1 + 0.85 * pl * lm) + 26 * pl * lm
        if u < 1:
            rl = real_cam(s) * 0.62; rl[:, :, 0] += 5
            img = rl * (1 - al_m[:, :, None]) + cc_ * al_m[:, :, None]
        else: img = cc_
        b = 0.55 * math.exp(-((kr - 6.5) / 3.6) ** 2) + 0.07
        if b > 0.02:
            lit = cv2.resize(cc_ * (al_m[:, :, None] if u < 1 else 1.0), (W // 4, H // 4), interpolation=cv2.INTER_AREA)
            bl = cv2.resize(cv2.GaussianBlur(np.clip(lit - 120, 0, None), (0, 0), 9), (W, H), interpolation=cv2.INTER_LINEAR); img = img + bl * b * 1.5
        al = u; t_on = kC0
    # 2) blueprint (some quando a luz acende; volta no apagar)
    op_l = 1.0 if k < kC0 else max(0.0, 1 - prog(k, kC0 + 1, 9))
    off = prog(k, kOFF, N - kOFF + 0.5) if k >= kOFF else 0.0
    if off > 0:
        rl = real_cam(s) * 0.5; img = img * (1 - eo3(off)) * (1 - 0.35 * off) + rl * eo3(off); op_l = min(1.0, 1.6 * off) * (1.0 - 0.75 * max(0, off - 0.6) / 0.4)
    if op_l > 0.01:
        kk_ = k if off <= 0 else 10 ** 6; s_ = s if off <= 0 else cam(kC0)[0]
        tb.limpa(); linhas(tb, kk_, s_, op_l, 'fino'); img = sobre_f(img, tb.a, 1.0)
        tb.limpa(); linhas(tb, kk_, s_, op_l, 'est')
        if k >= kC0 and off <= 0: flash = 1 + 1.5 * (1 - prog(k, kC0, 4))
        else: flash = 1.0
        img = sobre_f(img, tb.a, 1.0)
        g1 = cv2.GaussianBlur(tb.a, (0, 0), 5); g2 = cv2.resize(cv2.GaussianBlur(cv2.resize(tb.a, (W // 4, H // 4), interpolation=cv2.INTER_AREA), (0, 0), 6), (W, H))
        img = img + np.minimum(g1[:, :, 2::-1].astype(np.float32) * 0.5 * flash, 70.0) + np.minimum(g2[:, :, 2::-1].astype(np.float32) * 0.42 * flash, 46.0)
    # 3) particulas de luz (so no conceito)
    if k >= kC0 + 3:
        pt = particulas(k, s, c, pan, eio(prog(k, kC0 + 3, 14)) * (1 - off))
        if pt is not None: img = img + pt * 0.9
    # 4) flash de entrada (corte para o quadro real)
    if VID == 'V08' and k < 7: f = math.exp(-(k / 1.9) ** 2) * 0.9; img = img * (1 - f) + np.array([255, 238, 225], np.float32) * f
    if VID == 'V09' and k < 5: f = math.exp(-(k / 1.5) ** 2) * 0.55; img = img * (1 - f) + np.array([255, 238, 225], np.float32) * f
    img = np.clip(img, 0, 255).astype(np.uint8)
    img = mx.grao(img, 2.6 if k < kC0 else 2.0, G0 + k)                        # grao vivo: o congelado nao parece foto parada
    # 5) rotulo + notas (por cima, sem grao pesado)
    tl.limpa(); op = 1.0 - eo3(off)
    notas(tl, k, op, (s, c, pan), t_on if (k >= kD0 - 2) else None); rotulo(tl, k, op)
    return sobre(img, tl.a)

if __name__ == '__main__':
    if TESTE:
        os.makedirs(f'{VF}/chk/{VID}', exist_ok=True)
        for k in TESTE: cv2.imwrite(f'{VF}/chk/{VID}/t{k:03d}.jpg', quadro(k), [cv2.IMWRITE_JPEG_QUALITY, 92])
        print('teste', VID, N, dict(kB0=kB0, kC0=kC0, kD0=kD0, kOFF=kOFF, kTROCA=kTROCA), [(x['txt'], x['k']) for x in NOTAS], A2K.tolist()); sys.exit()
    out = Saida(VID, N, guarda=(2, kC0 - 2, kC0 + 4, kD0 + 20, N - 6, N - 2))
    for k in range(N): out.poe(quadro(k))
    f = out.fecha()
    registra(VID, dict(arquivo=f, t0=v['t0'], t1=v['t1'], g0=G0, g1=G1, quadros=N, tipo='visao', fonte_base='nenhum plano (quadro real congelado base_%d + conceito_%d_2k + blueprint_%d.json)' % (n, n, n),
                       modo='substitui a base de g0 a g1-1 (opaca)',
                       contem=['quadro real congelado com a cor noturno_prospeccao', 'blueprint linha a linha + grade do piso', 'luz acendendo em ondas + bloom', 'conceito com camera 2.5D e particulas',
                               'rotulo A VISAO DA creat.MTT · ESBOCO -> CONCEITO (caixa %s)' % sp['rotulo']['caixa'], 'notas de briefing digitadas + fios ate o elemento', 'luz apaga nos ultimos 4 quadros'],
                       marcos_k=dict(blueprint=kB0, luz_acende=kC0, conceito=kD0, apaga=kOFF, troca_rotulo=kTROCA), notas=[(x['txt'], x['k']) for x in NOTAS],
                       fica_para_motion=['legenda estilo cliente (y 0.72)', 'chip BRABUS LOUNGE nos trechos ao vivo']))
    progresso(f'{VID} pronto ({N} quadros) em build/vfx/{VID}.mp4'); print('ok', f)
