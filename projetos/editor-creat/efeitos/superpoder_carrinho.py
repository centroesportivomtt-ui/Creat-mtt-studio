"""Superpoder do carrinho (Super Kal, 19/11): ela chama com a mão, o carrinho vem sozinho, ela pega. 2,4 s (um compasso a 100 bpm).
uso: python3 superpoder.py <pasta_quadros_q> <saida.mp4> [--previa]
Quadros de origem: r1439.mov a partir de 2,6 s, 1080x1920, 29,97 fps (q/0001.jpg = 2,6 s)."""
import glob, subprocess, sys
import cv2, numpy as np

W, H, FPS, NF = 1080, 1920, 30, 72
AMBAR = np.array([77, 184, 245], np.float32) / 255.0      # BGR de #F5B84D
QUENTE = np.array([170, 225, 255], np.float32) / 255.0    # núcleo quase branco
rng = np.random.default_rng(71)

fs = sorted(glob.glob(sys.argv[1] + "/*.jpg"))
PREVIA = "--previa" in sys.argv
_cache = {}


def src(n):
    n = int(np.clip(n, 1, len(fs)))
    if n not in _cache:
        if len(_cache) > 40:
            _cache.pop(next(iter(_cache)))
        _cache[n] = cv2.imread(fs[n - 1]).astype(np.float32) / 255.0
    return _cache[n]


def ease_out(u, p=2.0): return 1 - (1 - np.clip(u, 0, 1)) ** p
def ease_in(u, p=2.0): return np.clip(u, 0, 1) ** p
def smooth(u): u = np.clip(u, 0, 1); return u * u * (3 - 2 * u)


def n_de(f):
    """quadro do filme (0..72) -> quadro de origem (float). Carga 14-38, abertura 38-50, viagem 50-99, pegada 99-113."""
    if f < 18: return 14 + 24 * (f / 18)
    if f < 24: return 38 + 12 * ((f - 18) / 6)
    if f < 54: return 50 + 49 * ease_out((f - 24) / 30, 1.5)
    return 99 + 14 * ease_in((f - 54) / 18, 0.8) * 1.0


PEGADA_QUADRO = 47            # quadro de saída em que ela pega o carrinho (1,567 s: cai no tempo forte da música no vídeo da nutri)


def mapa(fo):
    """quadro de saída -> linha do tempo do efeito (carga 0-18, solta 18-24, viagem 24-54, pegada 54-72)."""
    return float(np.interp(fo, [0, 15, 21, PEGADA_QUADRO, NF], [0, 18, 24, 54, 72]))


def quadro(f, f2):
    """média dos quadros de origem cobertos por este quadro do filme (borrão de movimento de verdade na parte rápida)."""
    a, b = n_de(f), n_de(f2)
    ns = np.arange(int(round(a)), max(int(round(a)) + 1, int(round(b))))
    return np.mean([src(n) for n in ns], axis=0), a


# ---------- rastreio: alça azul do carrinho (cor) e mão (pontos-chave medidos nos quadros)
def alca(n):
    im = (src(n) * 255).astype(np.uint8)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (100, 120, 60), (125, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    k, lab, st, cen = cv2.connectedComponentsWithStats(m)
    c = [(st[i, 4], cen[i], st[i, :4]) for i in range(1, k) if st[i, 4] > 2500 and st[i, 2] > st[i, 3] * 1.5 and cen[i][1] > 900]
    if not c: return None
    a, p, b = max(c, key=lambda x: x[0])
    return float(p[0]), float(p[1]), float(b[2])


ALCA = {}
for n in range(49, 114):
    r = alca(n)
    if r: ALCA[n] = r
ks = sorted(ALCA)


def alca_em(nf):
    xs = [np.interp(nf, ks, [ALCA[k][i] for k in ks]) for i in range(3)]
    return xs  # x, y, largura da alça

MAO = {14: (668, 360), 20: (626, 405), 30: (680, 410), 38: (688, 445), 43: (742, 553), 47: (710, 715), 52: (700, 810),
       64: (548, 972), 76: (500, 918), 86: (437, 1026), 92: (405, 1000), 99: (400, 985), 113: (410, 960)}
mk = sorted(MAO)


def mao_em(nf):
    return np.array([np.interp(nf, mk, [MAO[k][0] for k in mk]), np.interp(nf, mk, [MAO[k][1] for k in mk])], np.float32)


# ---------- peças de luz (tudo numa camada aditiva L, depois brilho)
def ponto(L, c, raio, cor, forca=1.0):
    x, y = int(c[0]), int(c[1]); r = int(raio * 3)
    x0, x1, y0, y1 = max(0, x - r), min(W, x + r), max(0, y - r), min(H, y + r)
    if x1 <= x0 or y1 <= y0: return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    g = np.exp(-((xx - c[0]) ** 2 + (yy - c[1]) ** 2) / (2 * raio * raio)) * forca
    L[y0:y1, x0:x1] += g[..., None] * cor


def raio_luz(a, b, seed, amp=0.10, niv=6):
    """filamento: linha quebrada por deslocamento do ponto médio."""
    r = np.random.default_rng(seed)
    pts = [np.array(a, np.float32), np.array(b, np.float32)]
    d = float(np.linalg.norm(pts[1] - pts[0])) * amp
    for _ in range(niv):
        novo = [pts[0]]
        for p, q in zip(pts[:-1], pts[1:]):
            m = (p + q) / 2
            nrm = np.array([-(q - p)[1], (q - p)[0]], np.float32); nrm /= (np.linalg.norm(nrm) + 1e-6)
            novo += [m + nrm * r.normal(0, d), q]
        pts, d = novo, d * 0.55
    return np.array(pts, np.int32)


def filamentos(L, a, b, f, forca):
    fino = np.zeros((H, W), np.float32)
    for k in range(3):
        pts = raio_luz(a, b, 1000 + int(f // 2) * 7 + k, amp=0.07 + 0.03 * k)
        cv2.polylines(fino, [pts.reshape(-1, 1, 2)], False, 1.0 if k == 0 else 0.6, 3 if k == 0 else 2, cv2.LINE_AA)
    halo = cv2.GaussianBlur(fino, (0, 0), 9) * 2.2
    L += (fino[..., None] * QUENTE * 1.2 + halo[..., None] * AMBAR) * forca


class Particulas:
    def __init__(s): s.p = np.zeros((0, 2), np.float32); s.v = np.zeros((0, 2), np.float32); s.vida = np.zeros(0, np.float32); s.vmax = np.zeros(0, np.float32)
    def emitir(s, pos, vel, vida):
        s.p = np.vstack([s.p, pos]); s.v = np.vstack([s.v, vel]); s.vida = np.concatenate([s.vida, vida]); s.vmax = np.concatenate([s.vmax, vida])
    def passo(s, alvo=None, puxar=0.0, grav=0.0, atrito=0.96):
        if alvo is not None and len(s.p):
            d = alvo - s.p; dist = np.linalg.norm(d, axis=1, keepdims=True) + 1e-3
            s.v += d / dist * puxar
        s.v[:, 1] += grav; s.v *= atrito; s.p += s.v; s.vida -= 1
        k = s.vida > 0
        if alvo is not None and len(s.p): k &= np.linalg.norm(alvo - s.p, axis=1) > 16
        s.p, s.v, s.vida, s.vmax = s.p[k], s.v[k], s.vida[k], s.vmax[k]
    def desenhar(s, L, forca=1.0):
        if not len(s.p): return
        tela = np.zeros((H, W), np.float32)
        for p, v, vi, vm in zip(s.p, s.v, s.vida, s.vmax):
            a = float(np.clip(vi / vm, 0, 1)) ** 0.7
            q = p - v * 1.6
            cv2.line(tela, (int(p[0]), int(p[1])), (int(q[0]), int(q[1])), a, 2, cv2.LINE_AA)
        halo = cv2.GaussianBlur(tela, (0, 0), 5) * 2.0
        L += (tela[..., None] * QUENTE + halo[..., None] * AMBAR) * forca


def zoom(im, c, s, dx=0.0, dy=0.0):
    M = np.array([[s, 0, c[0] * (1 - s) + dx], [0, s, c[1] * (1 - s) + dy]], np.float32)
    return cv2.warpAffine(im, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def escurecer(im, c, k, raio=520):
    """as luzes da loja 'caem' em volta do poder: vinheta centrada + leve dessaturação."""
    if k <= 0: return im
    yy, xx = np.mgrid[0:H:8, 0:W:8].astype(np.float32)
    d = np.sqrt((xx - c[0]) ** 2 + (yy - c[1]) ** 2)
    v = cv2.resize(1 - k * smooth((d - raio * 0.5) / (raio * 1.6)), (W, H))[..., None]
    cinza = im.mean(2, keepdims=True)
    return (im * (1 - 0.35 * k) + cinza * 0.35 * k) * v


def onda(im, c, raio, amp, larg=70):
    """onda de choque: anel que entorta a imagem (refração) enquanto cresce."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = xx - c[0], yy - c[1]
    d = np.sqrt(dx * dx + dy * dy) + 1e-3
    g = np.exp(-((d - raio) ** 2) / (2 * larg * larg)) * amp
    return (cv2.remap(im, (xx - dx / d * g).astype(np.float32), (yy - dy / d * g).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT),
            np.exp(-((d - raio) ** 2) / (2 * (larg * 0.35) ** 2)).astype(np.float32))


def linhas_vel(L, c, forca, seed):
    r = np.random.default_rng(seed); tela = np.zeros((H, W), np.float32)
    for _ in range(46):
        ang = r.uniform(0, 2 * np.pi); r0 = r.uniform(520, 900); r1 = r0 + r.uniform(300, 900)
        p0 = (int(c[0] + np.cos(ang) * r0), int(c[1] + np.sin(ang) * r0)); p1 = (int(c[0] + np.cos(ang) * r1), int(c[1] + np.sin(ang) * r1))
        cv2.line(tela, p0, p1, float(r.uniform(0.3, 1.0)), int(r.integers(2, 7)), cv2.LINE_AA)
    L += cv2.GaussianBlur(tela, (0, 0), 2)[..., None] * QUENTE * forca


def aberracao(im, px):
    if px < 0.5: return im
    b, g, r = cv2.split(im); c = (W / 2, H / 2)
    return cv2.merge([zoom(b, c, 1 - px / W), g, zoom(r, c, 1 + px / W)])


def brilho_do_carrinho(im, nf, forca):
    """arame do carrinho 'energizado': bordas na região do carrinho viram ouro. Devolve camada de luz e máscara para o rastro."""
    x, y, larg = alca_em(nf)
    x0, x1 = int(max(0, x - larg * 0.75)), int(min(W, x + larg * 0.75)); y0, y1 = int(max(0, y - larg * 0.18)), int(min(H, y + larg * 2.35))
    reg = np.zeros((H, W), np.float32)
    if x1 - x0 < 8 or y1 - y0 < 8: return reg
    cz = cv2.cvtColor((im[y0:y1, x0:x1] * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY)
    bd = cv2.Canny(cz, 60, 150).astype(np.float32) / 255.0
    jan = np.outer(np.hanning(y1 - y0) ** 0.35, np.hanning(x1 - x0) ** 0.35).astype(np.float32)
    reg[y0:y1, x0:x1] = bd * jan
    return reg * forca


def render():
    saida = sys.argv[2]
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709",
                           "-colorspace", "bt709", saida], stdin=subprocess.PIPE)
    part_carga, part_fluxo, fagulhas = Particulas(), Particulas(), Particulas()
    rastro = np.zeros((H, W), np.float32)
    pegada = np.array(alca_em(99)[:2], np.float32)
    quadros = range(NF) if not PREVIA else range(0, NF, 6)
    estourou = False
    for fo in range(NF):
        f = mapa(fo)
        im, nf = quadro(f, mapa(fo + 1))
        L = np.zeros((H, W, 3), np.float32)
        mao = mao_em(nf)
        if f < 24:                                                  # ---- CARGA: energia converge para o punho
            k = smooth(f / 16)
            im = escurecer(im, mao, 0.72 * k)
            if f < 19:
                n_novas = 7
                ang = rng.uniform(0, 2 * np.pi, n_novas); rr = rng.uniform(260, 520, n_novas)
                pos = mao + np.stack([np.cos(ang) * rr, np.sin(ang) * rr], 1)
                tang = np.stack([-np.sin(ang), np.cos(ang)], 1) * rng.uniform(4, 9, (n_novas, 1))
                part_carga.emitir(pos.astype(np.float32), tang.astype(np.float32), rng.uniform(14, 22, n_novas).astype(np.float32))
            part_carga.passo(alvo=mao, puxar=2.6 + 3.5 * k, atrito=0.93)
            part_carga.desenhar(L, 0.9)
            pulso = 1 + 0.18 * np.sin(f * 1.9)
            ponto(L, mao, (22 + 40 * k) * pulso, AMBAR, 0.8 * k)
            ponto(L, mao, 8 + 9 * k, QUENTE, 1.0 * k)
            fl = np.zeros((H, W), np.float32)                        # risco horizontal de lente
            cv2.line(fl, (int(mao[0] - 360 * k), int(mao[1])), (int(mao[0] + 360 * k), int(mao[1])), 1.0, 2, cv2.LINE_AA)
            L += cv2.GaussianBlur(fl, (0, 0), 3)[..., None] * QUENTE * 0.8 * k
        if 18 <= f < 26:                                             # ---- SOLTA: clarão + borrão radial na abertura da lente
            u = (f - 18) / 8
            L += (QUENTE * 0.6 + AMBAR * 0.4) * (1 - u) ** 2 * 0.55
            acc = im.copy()
            for s in (1.02, 1.045, 1.07): acc += zoom(im, mao, s)
            im = im * u + (acc / 4) * (1 - u)
        if 20 <= f < 54:                                             # ---- VIAGEM: carrinho energizado, rastro e filamentos
            u = (f - 24) / 30
            hx, hy, larg = alca_em(max(nf, 50))
            cart = np.array([hx, hy], np.float32)
            forca = smooth((f - 20) / 5)
            im = escurecer(im, (cart + mao) / 2, 0.62 * forca, raio=640)
            arame = brilho_do_carrinho(im, max(nf, 50), forca)
            rastro = rastro * 0.80 + arame * 0.5
            rr = cv2.GaussianBlur(rastro, (0, 0), 14)
            L += rr[..., None] * AMBAR * 0.42 + cv2.GaussianBlur(arame, (0, 0), 1.5)[..., None] * (QUENTE * 0.5 + AMBAR * 0.5) * 0.55
            ponto(L, (hx, hy + larg * 2.3), larg * 0.55, AMBAR, 0.35 * forca)           # luz no piso, sob as rodas
            filamentos(L, mao, cart, f, 0.85 * forca * (0.75 + 0.25 * np.sin(f * 2.3)))
            ponto(L, mao, 34, AMBAR, 0.8 * forca); ponto(L, mao, 12, QUENTE, 1.0 * forca)
            ponto(L, cart, 30, AMBAR, 0.7 * forca)
            nn = 5
            pos = cart + rng.normal(0, larg * 0.35, (nn, 2)) + np.array([0, larg * 0.8])
            part_fluxo.emitir(pos.astype(np.float32), rng.normal(0, 2.5, (nn, 2)).astype(np.float32), rng.uniform(12, 20, nn).astype(np.float32))
            part_fluxo.passo(alvo=mao, puxar=3.2, atrito=0.92)
            part_fluxo.desenhar(L, 0.8 * forca)
        if f >= 54:                                                  # ---- PEGADA: onda de choque, fagulhas, soco de câmera
            g = f - 54; u = g / 18
            if not estourou:
                estourou = True
                nn = 90; ang = rng.uniform(0, 2 * np.pi, nn); vel = rng.uniform(10, 46, nn)
                fagulhas.emitir(np.repeat(pegada[None], nn, 0), np.stack([np.cos(ang) * vel, np.sin(ang) * vel * 0.8 - 6], 1).astype(np.float32),
                                rng.uniform(9, 20, nn).astype(np.float32))
            im = escurecer(im, pegada, 0.6 * (1 - u) ** 0.7, raio=700)
            arame = brilho_do_carrinho(im, nf, (1 - u) ** 1.5)
            rastro = rastro * 0.78 + arame * 0.4
            L += cv2.GaussianBlur(rastro, (0, 0), 14)[..., None] * AMBAR * 0.4 + cv2.GaussianBlur(arame, (0, 0), 1.5)[..., None] * QUENTE * 0.5
            raio = 30 + 1500 * ease_out(g / 15, 2.2)
            im, anel = onda(im, pegada, raio, 30 * (1 - min(1, g / 15)) ** 1.2)
            L += anel[..., None] * (AMBAR * 0.7 + QUENTE * 0.3) * 0.75 * (1 - min(1, g / 14))
            if g < 7: linhas_vel(L, pegada, 0.38 * (1 - g / 7), 500 + int(g))
            L += (QUENTE * 0.6 + AMBAR * 0.4) * max(0, 1 - g / 4) ** 2 * 0.42              # clarão do impacto
            ponto(L, pegada, 60 * (1 - u) + 18, AMBAR, 0.85 * (1 - u)); ponto(L, pegada, 16, QUENTE, 1.0 * (1 - u))
            fagulhas.passo(grav=1.1, atrito=0.93); fagulhas.desenhar(L, 1.0)
        # ---- composição: luz aditiva + brilho (bloom), câmera, aberração
        L = np.clip(L, 0, 4)
        bloom = cv2.resize(cv2.GaussianBlur(cv2.resize(L, (W // 4, H // 4)), (0, 0), 9), (W, H))
        out = 1 - (1 - np.clip(im, 0, 1)) * (1 - np.clip(L * 0.85 + bloom * 0.6, 0, 1))      # mistura "tela"
        if f < 18: out = zoom(out, mao, 1 + 0.10 * smooth(f / 18))                           # aproxima na carga
        if f >= 54:
            g = f - 54
            s = 1 + 0.075 * np.exp(-g / 3.5) + 0.02 * smooth(g / 18)
            tr = 13 * np.exp(-g / 4.0)
            out = zoom(out, pegada, s, rng.normal(0, tr), rng.normal(0, tr))
            out = aberracao(out, 7 * np.exp(-g / 3.0))
        if 18 <= f < 23: out = aberracao(out, 5 * (1 - (f - 18) / 5))
        if f >= 66:                                                  # saída: o clarão toma a tela (a montagem corta no branco-ouro)
            w = ease_in((f - 65) / 6, 2.0)
            out = out * (1 - w) + (QUENTE * 0.85 + 0.15) * w
        fr = (np.clip(out, 0, 1) * 255).astype(np.uint8)
        ff.stdin.write(fr.tobytes())
        if fo in (4, 10, 14, 17, 21, 27, 34, 41, 45, 47, 48, 51, 58, 70): cv2.imwrite(f"{saida[:-4]}_f{fo:02d}.jpg", cv2.resize(fr, (360, 640)))
    ff.stdin.close(); ff.wait()


if __name__ == "__main__":
    render()
