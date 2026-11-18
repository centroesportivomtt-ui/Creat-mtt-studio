# kal.py: integracao do Kal animado (RGBA de build/kal) num plano real, PEQUENO (escala 0.31 = ~320 px), saindo de tras de uma
# plaquinha de vidro grafite com a logo oficial. Cor casada com o ambiente, relogio grafite, sombra suave, contato com a plaquinha,
# desfoque de movimento na subida/descida, balanco com o tremor da camera e grao do plano. Confere rosto real por quadro.
from vx import *
from PIL import Image
ESC = 0.31
KW, KH = int(round(W * ESC)), int(round(H * ESC))          # 335 x 595
LOGO_SK = M + '/build/marcas/superkal_logo_vetor_2400.png'
AMARELO_SK = (253, 189, 2)

def relogio_grafite(bgr, a):
    """dessatura so o mostrador AZUL do relogio (azul vizinho de dourado); o dourado nao e tocado"""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    azul = ((hsv[:, :, 0] > 96) & (hsv[:, :, 0] < 132) & (hsv[:, :, 1] > 80) & (hsv[:, :, 2] > 55) & (a > 128)).astype(np.uint8)
    ouro = ((hsv[:, :, 0] > 12) & (hsv[:, :, 0] < 32) & (hsv[:, :, 1] > 110) & (hsv[:, :, 2] > 140) & (a > 128)).astype(np.uint8)
    perto = cv2.dilate(ouro, np.ones((41, 41), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(azul & perto, 8); m = np.zeros(azul.shape, np.float32)
    for i in range(1, n):
        if st[i, 4] >= 300: m[lab == i] = 1
    if m.max() == 0: return bgr, 0
    m = cv2.GaussianBlur(cv2.dilate(m, np.ones((5, 5), np.uint8)), (0, 0), 2.0)[:, :, None]
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)[:, :, None]
    graf = g * np.array([0.60, 0.57, 0.55], np.float32) + 6           # grafite levemente frio (B,G,R)
    return np.clip(bgr.astype(np.float32) * (1 - m) + graf * m, 0, 255).astype(np.uint8), int(m.sum())

def carrega(pasta, q0, q1):
    """quadros q0..q1 -> lista de BGRA premultiplicado float32 (0..1) ja reduzidos (Lanczos em espaco premultiplicado)"""
    out = []; px_rel = 0
    for q in range(q0, q1 + 1):
        im = cv2.imread(f'{M}/build/kal/{pasta}/quadro_{q:04d}.png', cv2.IMREAD_UNCHANGED)
        bgr, n = relogio_grafite(im[:, :, :3], im[:, :, 3]); px_rel = max(px_rel, n)
        a = im[:, :, 3].astype(np.float32) / 255; pm = np.dstack([bgr.astype(np.float32) / 255 * a[:, :, None], a])
        ch = [np.asarray(Image.fromarray(np.ascontiguousarray(pm[:, :, j]), 'F').resize((KW, KH), Image.LANCZOS)) for j in range(4)]
        s = np.clip(np.dstack(ch), 0, 1); s[:, :, :3] = np.minimum(s[:, :, :3], s[:, :, 3:4])
        out.append(s.astype(np.float32))
    return out, px_rel

def ambiente(plate, caixa):
    """cor media e preto do plano em volta da caixa (para puxar o Kal para a luz do lugar)"""
    x0, y0, x1, y1 = caixa; r = plate[max(0, y0 - 60):min(H, y1 + 60), max(0, x0 - 120):min(W, x1 + 40)].reshape(-1, 3).astype(np.float32)
    lum = r @ np.array([0.114, 0.587, 0.299], np.float32)
    return r.mean(0), float(np.percentile(lum, 2))

def casa_cor(k, amb, preto, puxa=0.045):
    """k: BGRA premult 0..1. contraste +4%, saturacao -5%, puxa p/ a cor do ambiente, preto no nivel do plano"""
    a = k[:, :, 3:4]; rgb = np.where(a > 1e-4, k[:, :, :3] / np.maximum(a, 1e-4), 0)
    rgb = (rgb - 0.5) * 1.04 + 0.5
    g = (rgb @ np.array([0.114, 0.587, 0.299], np.float32))[:, :, None]; rgb = g + (rgb - g) * 0.95
    t = amb / max(1.0, float(amb.mean())); rgb = rgb * (1 + puxa * (t - 1))
    b = min(0.06, preto / 255.0 * 0.8); rgb = b + rgb * (1 - b)
    return np.dstack([np.clip(rgb, 0, 1) * a, a]).astype(np.float32)

class Plaquinha:
    """cartao de vidro grafite + logo oficial + texto; desenhado em skia num Tela inteiro"""
    def __init__(self, caixa, logo_caixa, linhas):
        self.cx = caixa; self.lc = logo_caixa; self.linhas = linhas; self.tl = Tela()
        lg = Image.open(LOGO_SK).convert('RGBA'); lw, lh = lg.size
        hh = logo_caixa[3] - logo_caixa[1]; ww = logo_caixa[2] - logo_caixa[0]; s = min(ww / lw, hh / lh)
        self.lw, self.lh = int(round(lw * s)), int(round(lh * s))
        arr = np.asarray(lg.resize((self.lw, self.lh), Image.LANCZOS)).copy()
        self.logo = skia.Image.fromarray(arr, colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)
        self.lx = logo_caixa[0] + (ww - self.lw) / 2; self.ly = logo_caixa[1] + (hh - self.lh) / 2
    def desenha(self, op=1.0, esc=1.0, k_txt=99, dx=0.0, dy=0.0):
        tl = self.tl; tl.limpa(); c = tl.c; x0, y0, x1, y1 = self.cx
        if op <= 0.003: return tl.a
        c.save(); mx_, my_ = (x0 + x1) / 2 + dx, y1 + dy
        c.translate(dx, dy); c.translate(mx_ - dx, my_ - dy); c.scale(esc, esc); c.translate(-(mx_ - dx), -(my_ - dy))
        vidro(c, x0, y0, x1, y1, r=14, a=0.88 * op, borda=0.42 * op, sombra=0.38 * op)
        cantos(c, x0 - 7, y0 - 7, x1 + 7, y1 + 7, arm=20, esp=5, a=op)
        pp = skia.Paint(AntiAlias=True); pp.setAlphaf(op)
        c.drawImage(self.logo, self.lx, self.ly, skia.SamplingOptions(skia.FilterMode.kLinear), pp)
        for i, (txt, fn, tam, rgb, yb, tr) in enumerate(self.linhas):
            u = eo5(prog(k_txt, i * 3, 7))
            if u <= 0: continue
            f = fonte(fn, tam); c.save(); c.clipRect(skia.Rect.MakeLTRB(x0 + 8, yb - tam * 1.1, x0 + 8 + (self.lc[0] - x0) * 1.0, yb + tam * 0.35))
            texto(c, txt, x0 + 22 - 14 * (1 - u), yb, f, rgb, op * u, track=tr); c.restore()
        c.restore(); return tl.a

def poe_kal(img, kq, x0, ybase, corte_y, amb, preto, sx=1.0, sy=1.0, mb=0.0, dx=0.0, dy=0.0, grao_amp=1.0, g=0):
    """compoe o Kal (BGRA premult reduzido) em img (float32 BGR 0..255). x0 = esquerda do quadro do Kal; ybase = base do quadro do Kal
    (fica escondida atras da plaquinha); corte_y = topo da plaquinha (abaixo disso o Kal nao aparece). Devolve (img, mascara alfa HxW)."""
    kq = casa_cor(kq, amb, preto)
    cxk = x0 + KW / 2 + dx; yb = ybase + dy
    # escala em torno da base (squash & stretch so global, ate 4%)
    A = np.float32([[sx, 0, cxk - sx * KW / 2], [0, sy, yb - sy * KH]])
    lay = cv2.warpAffine(kq, A, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    lay = np.clip(lay, 0, 1)
    y_top = int(max(0, yb - sy * KH - 60)); y_bot = int(min(H, corte_y + 40)); xa = int(max(0, cxk - sx * KW / 2 - 70)); xb = int(min(W, cxk + sx * KW / 2 + 70))
    roi = lay[y_top:y_bot, xa:xb]
    if mb >= 3:
        L = int(min(44, mb)); kern = np.full((L, 1), 1.0 / L, np.float32); roi = cv2.filter2D(roi, -1, kern, borderType=cv2.BORDER_CONSTANT)
    # corta no topo da plaquinha (com 2 px de pena)
    yy = np.arange(y_top, y_bot, dtype=np.float32)[:, None, None]; roi = roi * np.clip((corte_y - yy) / 2.0, 0, 1)
    a = roi[:, :, 3:4]
    if a.max() < 0.004: return img, np.zeros((H, W), np.float32)
    sub = img[y_top:y_bot, xa:xb]
    # sombra suave atras do corpo (separa do fundo carregado)
    sh = cv2.GaussianBlur(np.roll(np.roll(a[:, :, 0], 8, 1), 9, 0), (0, 0), 15) * 0.30
    sub = sub * (1 - sh[:, :, None] * (1 - a))
    # luz do ambiente abracando a borda (light wrap)
    bgb = cv2.GaussianBlur(sub, (0, 0), 14); wrap = (a[:, :, 0] * (1 - cv2.GaussianBlur(a[:, :, 0], (0, 0), 5)))[:, :, None]
    rgb = roi[:, :, :3] * 255.0 + bgb * wrap * 0.30 * a
    # sombra de contato: a plaquinha esta na frente dele
    cont = np.clip(1 - (corte_y - yy) / 22.0, 0, 1) ** 1.5 * 0.42; rgb = rgb * (1 - cont)
    sub = sub * (1 - a) + rgb
    img[y_top:y_bot, xa:xb] = sub
    msk = np.zeros((H, W), np.float32); msk[y_top:y_bot, xa:xb] = a[:, :, 0]
    return img, msk

def subida(k, n=12, over=0.07):
    """0 = escondido, 1 = no lugar; passa um pouco (overshoot) e assenta"""
    u = prog(k, 0, n); return eback(u, 1.7) if u < 1 else 1.0
def cobre_rosto(msk, rostos, folga=4, min_alt=0):
    """lista de (caixa, altura, fracao coberta) dos rostos tocados pela mascara (alfa > 0.25)"""
    out = []
    for b in (rostos or []):
        x0, y0, x1, y1 = [int(v) for v in b[:4]]; x0, y0 = max(0, x0 - folga), max(0, y0 - folga); x1, y1 = min(W, x1 + folga), min(H, y1 + folga)
        if x1 <= x0 or y1 <= y0 or (b[3] - b[1]) < min_alt: continue
        fr_ = float((msk[y0:y1, x0:x1] > 0.25).mean())
        if fr_ > 0.02: out.append(([int(v) for v in b[:4]], int(b[3] - b[1]), round(fr_, 2)))
    return out
