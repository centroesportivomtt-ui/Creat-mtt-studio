"""Prova do conceito 'Hora da Serra': a que horas a serra esconde o sol em cada ponto.
Uso: python3 -I hora_da_serra.py <pasta_tiles_z12> <pasta_saida>
Relevo: Terrain Tiles (Mapzen/AWS Open Data), Terrarium z12 (~37 m por pixel).
Sol: algoritmo NOAA (equação do tempo + declinação), refração de Bennett.
"""
import sys, os, math, json
from datetime import datetime, timedelta, timezone
import numpy as np
from PIL import Image

TILES, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
Z = 12; X0, X1 = 1584, 1590; Y0, Y1 = 2175, 2180
W = (X1 - X0 + 1) * 256; H = (Y1 - Y0 + 1) * 256
elev = np.zeros((H, W), dtype=np.float64)
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        im = np.asarray(Image.open(os.path.join(TILES, f"{x}_{y}.png")).convert('RGB')).astype(np.float64)
        elev[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768

def ll2px(lon, lat):
    n = 2 ** Z
    xt = (lon + 180) / 360 * n
    lr = math.radians(lat)
    yt = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
    return (xt - X0) * 256, (yt - Y0) * 256

def px2ll(px, py):
    n = 2 ** Z
    xt = px / 256 + X0; yt = py / 256 + Y0
    return xt / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yt / n))))

def amostra(px, py):
    if px < 0 or py < 0 or px >= W - 1 or py >= H - 1:
        return None
    x0, y0 = int(px), int(py); fx, fy = px - x0, py - y0
    a = elev[y0, x0]; b = elev[y0, x0 + 1]; c = elev[y0 + 1, x0]; d = elev[y0 + 1, x0 + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy

R = 6371000.0
def horizonte(lon, lat, olho=1.7, passo=15.0, alcance=30000.0):
    mpp = 40075016.686 * math.cos(math.radians(lat)) / (256 * 2 ** Z)
    px0, py0 = ll2px(lon, lat)
    h0 = amostra(px0, py0) + olho
    perfil = []
    for i in range(720):
        az = i * 0.5
        s, c = math.sin(math.radians(az)), math.cos(math.radians(az))
        melhor = -90.0; dist_melhor = 0; d = passo
        while d <= alcance:
            h = amostra(px0 + s * d / mpp, py0 - c * d / mpp)
            if h is None:
                break
            h_ef = h - d * d / (2 * R) * (1 - 0.13)
            ang = math.degrees(math.atan2(h_ef - h0, d))
            if ang > melhor:
                melhor, dist_melhor = ang, d
            d += passo if d < 3000 else passo * 2
        perfil.append((az, melhor, dist_melhor))
    return h0 - olho, perfil

def sol(dt_utc, lat, lon):
    jd = (dt_utc - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400 + 2451545.0
    T = (jd - 2451545.0) / 36525
    L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
    M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
    e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    Mr = math.radians(M)
    C = math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + math.sin(3 * Mr) * 0.000289
    om = math.radians(125.04 - 1934.136 * T)
    lam = math.radians(L0 + C - 0.00569 - 0.00478 * math.sin(om))
    eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
    eps = math.radians(eps0 + 0.00256 * math.cos(om))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    yv = math.tan(eps / 2) ** 2
    L0r = math.radians(L0)
    eqt = 4 * math.degrees(yv * math.sin(2 * L0r) - 2 * e * math.sin(Mr) + 4 * e * yv * math.sin(Mr) * math.cos(2 * L0r) - 0.5 * yv * yv * math.sin(4 * L0r) - 1.25 * e * e * math.sin(2 * Mr))
    minutos = dt_utc.hour * 60 + dt_utc.minute + dt_utc.second / 60
    tst = minutos + eqt + 4 * lon
    ha = math.radians(tst / 4 - 180)
    la = math.radians(lat)
    cz = math.sin(la) * math.sin(dec) + math.cos(la) * math.cos(dec) * math.cos(ha)
    z = math.acos(max(-1, min(1, cz)))
    el = 90 - math.degrees(z)
    az = (math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(la) - math.tan(dec) * math.cos(la))) + 180) % 360
    if el > -1:
        ref = 1 / math.tan(math.radians(el + 7.31 / (el + 4.4))) / 60
    else:
        ref = 0
    return el + ref, az, el

BAHIA = timezone(timedelta(hours=-3))
def dia(lon, lat, perfil, data):
    out = []
    t = datetime(data[0], data[1], data[2], 4, 30, tzinfo=BAHIA)
    fim = datetime(data[0], data[1], data[2], 19, 30, tzinfo=BAHIA)
    while t <= fim:
        ap, az, geo = sol(t.astimezone(timezone.utc), lat, lon)
        hz = perfil[int(round(az * 2)) % 720][1]
        topo = ap + 0.267
        out.append((t, ap, az, hz, topo > 0, topo > hz))
        t += timedelta(minutes=1)
    nasce = next(o[0] for o in out if o[4])
    poe = [o[0] for o in out if o[4]][-1]
    luz = [o for o in out if o[5]]
    sobre_serra = luz[0][0] if luz else None
    some_serra = luz[-1][0] if luz else None
    # intervalos de sol direto (a serra pode esconder e devolver)
    intervalos = []; ini = None; ant = False
    for o in out:
        if o[5] and not ant: ini = o[0]
        if not o[5] and ant: intervalos.append((ini, o[0] - timedelta(minutes=1)))
        ant = o[5]
    if ant: intervalos.append((ini, out[-1][0]))
    az_some = next((o[2] for o in out if o[0] == some_serra), None)
    hz_some = next((o[3] for o in out if o[0] == some_serra), None)
    return dict(nascer_oficial=nasce, por_oficial=poe, sol_aparece_na_serra=sobre_serra, sol_some_atras_da_serra=some_serra,
                min_a_menos_tarde=round((poe - some_serra).total_seconds() / 60) if some_serra else None,
                min_a_menos_manha=round((sobre_serra - nasce).total_seconds() / 60) if sobre_serra else None,
                az_some=az_some, horizonte_no_az=hz_some, intervalos=intervalos)

PONTOS = {
    'Vila de Itaitu': (-40.486526, -11.339931),
    'Cachoeira Veu da Noiva (queda, OSM)': (-40.5035718, -11.3331084),
    'Cachoeira das Arapongas (OSM)': (-40.5063201, -11.3720509),
    'Pico dos Payayas (OSM)': (-40.5047642, -11.3138142),
}
DATAS = [(2026, 11, 20), (2027, 6, 21), (2027, 9, 22)]
hm = lambda t: t.strftime('%H:%M') if t else '-'
res = {}
for nome, (lon, lat) in PONTOS.items():
    h0, perfil = horizonte(lon, lat)
    oeste = [p for p in perfil if 225 <= p[0] <= 315]
    leste = [p for p in perfil if 45 <= p[0] <= 135]
    mo = max(oeste, key=lambda p: p[1]); ml = max(leste, key=lambda p: p[1])
    print(f"\n== {nome}  alt {h0:.0f} m")
    print(f"   horizonte oeste max {mo[1]:.1f} graus no az {mo[0]:.0f} a {mo[2]/1000:.1f} km | leste max {ml[1]:.1f} graus no az {ml[0]:.0f} a {ml[2]/1000:.1f} km")
    res[nome] = {'alt_m': round(h0), 'dias': {}}
    for d in DATAS:
        r = dia(lon, lat, perfil, d)
        iv = ', '.join(f"{hm(a)}-{hm(b)}" for a, b in r['intervalos'])
        print(f"   {d[2]:02d}/{d[1]:02d}/{d[0]}: nascer oficial {hm(r['nascer_oficial'])}, sol sobre a serra {hm(r['sol_aparece_na_serra'])} (+{r['min_a_menos_manha']} min) | "
              f"sol some atras da serra {hm(r['sol_some_atras_da_serra'])} (az {r['az_some']:.0f}, serra a {r['horizonte_no_az']:.1f} graus), por oficial {hm(r['por_oficial'])} -> {r['min_a_menos_tarde']} min antes | sol direto: {iv}")
        res[nome]['dias'][f"{d[0]}-{d[1]:02d}-{d[2]:02d}"] = {k: (hm(v) if isinstance(v, datetime) else v) for k, v in r.items() if k != 'intervalos'}
json.dump(res, open(os.path.join(OUT, 'hora_da_serra.json'), 'w'), ensure_ascii=False, indent=1)

# ---------- Esboço visual: a sombra da serra andando sobre o vale ----------
lonA, latA, lonB, latB = -40.585, -11.285, -40.425, -11.415
ax, ay = ll2px(lonA, latA); bx, by = ll2px(lonB, latB)
cx0, cy0, cx1, cy1 = int(ax), int(ay), int(bx), int(by)
E = elev[cy0:cy1, cx0:cx1].copy()
mpp = 40075016.686 * math.cos(math.radians(-11.34)) / (256 * 2 ** Z)
gy, gx = np.gradient(E, mpp)

def quadro(t_local, lon=-40.486526, lat=-11.339931):
    ap, az, geo = sol(t_local.astimezone(timezone.utc), lat, lon)
    el = max(ap, 0.3)
    azr, elr = math.radians(az), math.radians(el)
    # hillshade pelo sol real (x leste, y sul no array)
    sx, sy, sz = math.sin(azr) * math.cos(elr), -math.cos(azr) * math.cos(elr), math.sin(elr)
    nx, ny, nz = -gx * 1.4, -gy * 1.4, np.ones_like(E)
    nn = np.sqrt(nx * nx + ny * ny + nz * nz)
    lam = np.clip((nx * sx + ny * sy + nz * sz) / nn, 0, 1)
    # sombra projetada: marcha em direção ao sol
    hh, ww = E.shape
    yy, xx = np.mgrid[0:hh, 0:ww]
    somb = np.zeros_like(E, dtype=bool)
    tanel = math.tan(elr)
    dxp, dyp = math.sin(azr), -math.cos(azr)
    for k in range(1, 520):
        px = np.clip((xx + dxp * k).astype(np.int32), 0, ww - 1)
        py = np.clip((yy + dyp * k).astype(np.int32), 0, hh - 1)
        somb |= (E[py, px] - E) > k * mpp * tanel
    # tinta hipsométrica quente (pedra, cerrado, mata)
    t = np.clip((E - 450) / (1150 - 450), 0, 1)
    base = np.stack([0.30 + 0.55 * t, 0.42 + 0.35 * t, 0.22 + 0.28 * t], -1)
    luz = 0.25 + 0.95 * lam
    luz = np.where(somb, luz * 0.35, luz)
    rgb = base * luz[..., None]
    # sombra puxada para azul-violeta do fim de tarde, céu quente onde há sol
    rgb = np.where(somb[..., None], rgb * np.array([0.75, 0.85, 1.35]), rgb * np.array([1.08, 1.0, 0.88]))
    img = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(img)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(im)
    for nome, (lo, la) in PONTOS.items():
        px, py = ll2px(lo, la)
        px -= cx0; py -= cy0
        dr.ellipse([px - 6, py - 6, px + 6, py + 6], outline=(255, 255, 255), width=3)
    dr.rectangle([0, 0, 250, 34], fill=(10, 12, 20))
    dr.text((10, 10), f"{t_local.strftime('%d/%m %H:%M')}  sol az {az:.0f}  alt {ap:.1f}", fill=(255, 230, 170))
    return im, somb

hoje = PONTOS
quadros = []
for hhmm in ['15:30', '16:30', '17:05', '17:25']:
    h, m = map(int, hhmm.split(':'))
    im, somb = quadro(datetime(2026, 11, 20, h, m, tzinfo=BAHIA))
    pct = 100 * somb.mean()
    print(f"quadro {hhmm}: {pct:.0f}% do recorte na sombra da serra")
    im.save(os.path.join(OUT, f"quadro_{hhmm.replace(':','')}.png"))
    quadros.append(im)
wq, hq = quadros[0].size
tira = Image.new('RGB', (wq * 2 + 10, hq * 2 + 10), (10, 12, 20))
for i, q in enumerate(quadros):
    tira.paste(q, ((i % 2) * (wq + 10), (i // 2) * (hq + 10)))
tira.save(os.path.join(OUT, 'sombra_da_serra_4_quadros.png'))
print('recorte', E.shape, 'm/pixel', round(mpp, 1), 'alt min/max', round(float(E.min())), round(float(E.max())))
