"""Esboço do 'cartão da trilha' do conceito Hora da Serra (1080x1920), com relevo real
e o sol do minuto da chegada. Uso:
python3 -I cartao_mock.py <tiles_z13> <recorte_osm.json> <saida.png>
Não é arte final: é prova de que o cartão sai do relevo e da luz reais, no próprio aparelho.
"""
import sys, os, math, json
from datetime import datetime, timedelta, timezone
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TILES, OSM, SAIDA = sys.argv[1], sys.argv[2], sys.argv[3]
Z = 13; X0, X1, Y0, Y1 = 3172, 3175, 4354, 4357
W = (X1 - X0 + 1) * 256; H = (Y1 - Y0 + 1) * 256
E = np.zeros((H, W))
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        a = np.asarray(Image.open(os.path.join(TILES, f"{x}_{y}.png")).convert('RGB')).astype(np.float64)
        E[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768

def ll2px(lon, lat):
    n = 2 ** Z; lr = math.radians(lat)
    return ((lon + 180) / 360 * n - X0) * 256, ((1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n - Y0) * 256

def sol(dt_utc, lat, lon):
    jd = (dt_utc - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400 + 2451545.0
    T = (jd - 2451545.0) / 36525
    L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
    M = math.radians(357.52911 + T * (35999.05029 - 0.0001537 * T))
    e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    C = math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + math.sin(2 * M) * (0.019993 - 0.000101 * T) + math.sin(3 * M) * 0.000289
    om = math.radians(125.04 - 1934.136 * T)
    lam = math.radians(L0 + C - 0.00569 - 0.00478 * math.sin(om))
    eps = math.radians(23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * math.cos(om))
    dec = math.asin(math.sin(eps) * math.sin(lam)); yv = math.tan(eps / 2) ** 2; L = math.radians(L0)
    eqt = 4 * math.degrees(yv * math.sin(2 * L) - 2 * e * math.sin(M) + 4 * e * yv * math.sin(M) * math.cos(2 * L) - 0.5 * yv * yv * math.sin(4 * L) - 1.25 * e * e * math.sin(2 * M))
    ha = math.radians((dt_utc.hour * 60 + dt_utc.minute + eqt + 4 * lon) / 4 - 180); la = math.radians(lat)
    el = 90 - math.degrees(math.acos(math.sin(la) * math.sin(dec) + math.cos(la) * math.cos(dec) * math.cos(ha)))
    az = (math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(la) - math.tan(dec) * math.cos(la))) + 180) % 360
    return el, az

BAHIA = timezone(timedelta(hours=-3))
VILA = (-40.486526, -11.339931); VEU = (-40.5035718, -11.3331084)
CHEGADA = datetime(2026, 11, 20, 15, 50, tzinfo=BAHIA)
el, az = sol(CHEGADA.astimezone(timezone.utc), VEU[1], VEU[0])
mpp = 40075016.686 * math.cos(math.radians(-11.34)) / (256 * 2 ** Z)

# luz do sol real: sombreado + sombra projetada
gy, gx = np.gradient(E, mpp)
azr, elr = math.radians(az), math.radians(el)
sx, sy, sz = math.sin(azr) * math.cos(elr), -math.cos(azr) * math.cos(elr), math.sin(elr)
nx, ny = -gx * 1.3, -gy * 1.3
lam = np.clip((nx * sx + ny * sy + sz) / np.sqrt(nx * nx + ny * ny + 1), 0, 1)
yy, xx = np.mgrid[0:H, 0:W]
somb = np.zeros((H, W), dtype=bool)
tanel = math.tan(elr); dx, dy = math.sin(azr), -math.cos(azr)
k = 1.0
while k < 700:
    px = np.clip((xx + dx * k).astype(np.int32), 0, W - 1); py = np.clip((yy + dy * k).astype(np.int32), 0, H - 1)
    somb |= (E[py, px] - E) > k * mpp * tanel
    k += 1 if k < 120 else 3
somb_f = np.asarray(Image.fromarray((somb * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.0

# relevo pintado: mata no fundo, cerrado nas encostas, quartzito claro no alto
t = np.clip((E - 480) / (1100 - 480), 0, 1)
c_mata = np.array([0.24, 0.36, 0.22]); c_cerr = np.array([0.62, 0.56, 0.36]); c_pedra = np.array([0.86, 0.80, 0.70])
base = np.where(t[..., None] < 0.45, c_mata + (c_cerr - c_mata) * (t[..., None] / 0.45), c_cerr + (c_pedra - c_cerr) * ((t[..., None] - 0.45) / 0.55))
luz = 0.32 + 0.9 * lam
rgb_sol = base * luz[..., None] * np.array([1.10, 1.00, 0.84])
rgb_sombra = base * (0.30 + 0.25 * lam)[..., None] * np.array([0.62, 0.70, 1.25])
rgb = rgb_sol * (1 - somb_f[..., None]) + rgb_sombra * somb_f[..., None]
mapa = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))

# rios do OSM
osm = json.load(open(OSM))
nos = {el_['id']: (el_['lon'], el_['lat']) for el_ in osm['elements'] if el_['type'] == 'node'}
dr = ImageDraw.Draw(mapa)
for w in osm['elements']:
    if w['type'] == 'way' and w.get('tags', {}).get('waterway') in ('river', 'stream'):
        pts = [ll2px(*nos[n]) for n in w['nodes'] if n in nos]
        if len(pts) > 1:
            dr.line(pts, fill=(120, 190, 235), width=1)

# recorte do cartão: vila e Véu com o paredão
cx = (ll2px(*VILA)[0] + ll2px(*VEU)[0]) / 2 - 18; cy = (ll2px(*VILA)[1] + ll2px(*VEU)[1]) / 2 + 10
LW, LH = 1080, 1240; esc = 2.6
cw, ch = LW / esc, LH / esc
caixa = (int(cx - cw / 2), int(cy - ch / 2), int(cx + cw / 2), int(cy + ch / 2))
topo = mapa.crop(caixa).resize((LW, LH), Image.LANCZOS)
def p(ll):
    x, y = ll2px(*ll); return ((x - caixa[0]) * esc, (y - caixa[1]) * esc)

card = Image.new('RGB', (1080, 1920), (14, 20, 32))
card.paste(topo, (0, 0))
# degradê do mapa para o painel
grad = Image.new('L', (1080, 260)); gd = ImageDraw.Draw(grad)
for i in range(260): gd.line([(0, i), (1080, i)], fill=int(255 * (i / 259) ** 1.6))
card.paste(Image.new('RGB', (1080, 260), (14, 20, 32)), (0, LH - 260), grad)
d = ImageDraw.Draw(card)
F = '/usr/share/fonts/truetype/dejavu/'
def fonte(n, s):
    for nome in (n, 'DejaVuSans.ttf'):
        try: return ImageFont.truetype(F + nome, s)
        except OSError: pass
    return ImageFont.load_default()
OURO = (242, 179, 61); AZUL = (120, 150, 230); TINTA = (244, 238, 226); APOIO = (160, 170, 190)

# linha reta honesta vila -> Véu (não é o caminho)
(ax_, ay_), (bx_, by_) = p(VILA), p(VEU)
n = 26
for i in range(n):
    if i % 2: continue
    t0, t1 = i / n, (i + 1) / n
    d.line([(ax_ + (bx_ - ax_) * t0, ay_ + (by_ - ay_) * t0), (ax_ + (bx_ - ax_) * t1, ay_ + (by_ - ay_) * t1)], fill=OURO, width=7)
d.ellipse([ax_ - 12, ay_ - 12, ax_ + 12, ay_ + 12], fill=TINTA, outline=(14, 20, 32), width=4)
d.ellipse([bx_ - 30, by_ - 30, bx_ + 30, by_ + 30], outline=OURO, width=7)
d.ellipse([bx_ - 11, by_ - 11, bx_ + 11, by_ + 11], fill=OURO)
d.text((ax_ + 22, ay_ - 18), 'vila', font=fonte('DejaVuSans-Bold.ttf', 34), fill=TINTA, stroke_width=4, stroke_fill=(14, 20, 32))
d.text((60, 56), 'TRILHAS DE ITAITU  ·  SUA POUSADA', font=fonte('DejaVuSans-Bold.ttf', 30), fill=TINTA, stroke_width=4, stroke_fill=(14, 20, 32))
d.text((60, 100), f'luz real de 20/11, {CHEGADA:%H:%M}: sol a {el:.0f}° vindo de {az:.0f}°', font=fonte('DejaVuSans.ttf', 26), fill=TINTA, stroke_width=3, stroke_fill=(14, 20, 32))
d.text(((ax_ + bx_) / 2 - 60, (ay_ + by_) / 2 - 78), 'linha reta, não é o caminho', font=fonte('DejaVuSans-Bold.ttf', 26), fill=TINTA, stroke_width=4, stroke_fill=(14, 20, 32))

# painel de baixo
y0 = LH - 200
d.text((60, y0), 'Véu da Noiva', font=fonte('DejaVuSerif-Bold.ttf', 104), fill=TINTA)
d.text((64, y0 + 132), 'cheguei', font=fonte('DejaVuSans.ttf', 32), fill=APOIO)
d.text((60, y0 + 166), CHEGADA.strftime('%H:%M'), font=fonte('DejaVuSans-Bold.ttf', 120), fill=TINTA)
d.text((480, y0 + 132), 'a serra apaga o sol', font=fonte('DejaVuSans.ttf', 32), fill=APOIO)
d.text((476, y0 + 166), '16:07', font=fonte('DejaVuSans-Bold.ttf', 120), fill=OURO)
d.text((64, y0 + 320), '17 minutos de sol no poço', font=fonte('DejaVuSans-Bold.ttf', 50), fill=OURO)
d.text((64, y0 + 396), '2,0 km de trilha  ·  ≈ 30 min  ·  +90 m', font=fonte('DejaVuSans.ttf', 40), fill=TINTA)

# selo Hora da Serra: o arco do dia (nascer a pôr oficial), luz direta no poço em ouro
sx0, sy0, r = 820, y0 + 690, 170
d.arc([sx0 - r, sy0 - r, sx0 + r, sy0 + r], 180, 360, fill=(52, 62, 92), width=18)
def ang(hhmm):
    h, m = map(int, hhmm.split(':')); mins = h * 60 + m
    return 180 + 180 * (mins - (5 * 60 + 7)) / ((17 * 60 + 48) - (5 * 60 + 7))
d.arc([sx0 - r, sy0 - r, sx0 + r, sy0 + r], ang('06:07'), ang('16:07'), fill=OURO, width=18)
a = math.radians(ang('15:50'))
d.ellipse([sx0 + r * math.cos(a) - 20, sy0 + r * math.sin(a) - 20, sx0 + r * math.cos(a) + 20, sy0 + r * math.sin(a) + 20], fill=TINTA, outline=(14, 20, 32), width=5)
d.text((sx0 - 128, sy0 - 74), 'HORA DA SERRA', font=fonte('DejaVuSans-Bold.ttf', 30), fill=TINTA)
d.text((sx0 - 128, sy0 - 34), 'poço 06:07–16:07', font=fonte('DejaVuSans.ttf', 26), fill=APOIO)
d.text((60, y0 + 540), 'O app que diz quando:', font=fonte('DejaVuSans.ttf', 34), fill=APOIO)
d.text((60, y0 + 584), 'chegar com sol,', font=fonte('DejaVuSerif-Bold.ttf', 46), fill=TINTA)
d.text((60, y0 + 640), 'voltar com luz.', font=fonte('DejaVuSerif-Bold.ttf', 46), fill=TINTA)
d.text((60, 1920 - 70), 'feito pela Creat', font=fonte('DejaVuSans.ttf', 24), fill=(110, 118, 140))
card.save(SAIDA)
print(f'sol em 15:50: alt {el:.1f} az {az:.1f}; sombra no recorte {100 * somb[caixa[1]:caixa[3], caixa[0]:caixa[2]].mean():.0f}%')
