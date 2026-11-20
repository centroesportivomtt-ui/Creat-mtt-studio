"""Quando o sol some atrás da serra? Relevo Terrarium z12 + fórmula solar (NOAA).
Uso: python3 -I -B sol_serra.py <scratchpad> AAAA-MM-DD"""
import math, sys
import numpy as np
from PIL import Image

S, DATA = sys.argv[1], sys.argv[2]
Z, XS, YS = 12, [1586, 1587, 1588], [2176, 2177, 2178]
mos = np.zeros((256 * 3, 256 * 3), dtype=np.float64)
for j, y in enumerate(YS):
    for i, x in enumerate(XS):
        a = np.asarray(Image.open(f"{S}/dem12/{x}_{y}.png").convert("RGB")).astype(np.float64)
        mos[j*256:(j+1)*256, i*256:(i+1)*256] = a[:, :, 0]*256 + a[:, :, 1] + a[:, :, 2]/256 - 32768
N = 2 ** Z
def px(lon, lat):
    lr = math.radians(lat)
    return ((lon + 180) / 360 * N - XS[0]) * 256, ((1 - math.log(math.tan(lr) + 1/math.cos(lr)) / math.pi) / 2 * N - YS[0]) * 256
def h(lon, lat):
    x, y = px(lon, lat)
    if not (0 <= x < mos.shape[1]-1 and 0 <= y < mos.shape[0]-1):
        return None
    x0, y0 = int(x), int(y); fx, fy = x-x0, y-y0
    a = mos[y0, x0]*(1-fx) + mos[y0, x0+1]*fx
    b = mos[y0+1, x0]*(1-fx) + mos[y0+1, x0+1]*fx
    return a*(1-fy) + b*fy
R = 6371000.0
def destino(lon, lat, az, d):
    la1, lo1, b, dr = math.radians(lat), math.radians(lon), math.radians(az), d/R
    la2 = math.asin(math.sin(la1)*math.cos(dr) + math.cos(la1)*math.sin(dr)*math.cos(b))
    lo2 = lo1 + math.atan2(math.sin(b)*math.sin(dr)*math.cos(la1), math.cos(dr) - math.sin(la1)*math.sin(la2))
    return math.degrees(lo2), math.degrees(la2)
def horizonte(lon, lat, az):
    h0 = h(lon, lat) + 1.6
    best = -90.0
    d = 60.0
    while d < 12000:
        lo, la = destino(lon, lat, az, d)
        hh = h(lo, la)
        if hh is None:
            break
        ang = math.degrees(math.atan2(hh - h0 - d*d/(2*R)*0.87, d))
        best = max(best, ang)
        d += 30.0
    return best
def sol(lat, lon, ano, mes, dia, hora_utc):
    # NOAA (aprox. de Spencer/US NOAA)
    n = (np.datetime64(f"{ano:04d}-{mes:02d}-{dia:02d}") - np.datetime64(f"{ano:04d}-01-01")).astype(int) + 1
    g = 2*math.pi/365*(n - 1 + (hora_utc - 12)/24)
    eqt = 229.18*(0.000075 + 0.001868*math.cos(g) - 0.032077*math.sin(g) - 0.014615*math.cos(2*g) - 0.040849*math.sin(2*g))
    dec = 0.006918 - 0.399912*math.cos(g) + 0.070257*math.sin(g) - 0.006758*math.cos(2*g) + 0.000907*math.sin(2*g) - 0.002697*math.cos(3*g) + 0.00148*math.sin(3*g)
    tst = hora_utc*60 + eqt + 4*lon
    ha = math.radians(tst/4 - 180)
    la = math.radians(lat)
    cz = math.sin(la)*math.sin(dec) + math.cos(la)*math.cos(dec)*math.cos(ha)
    zen = math.acos(max(-1, min(1, cz)))
    el = 90 - math.degrees(zen)
    az = math.degrees(math.atan2(math.sin(ha), math.cos(ha)*math.sin(la) - math.tan(dec)*math.cos(la))) + 180
    return el, az % 360
ano, mes, dia = map(int, DATA.split("-"))
pts = {"Vila (praça)": (-40.486526, -11.339931), "Véu da Noiva (queda)": (-40.5035718, -11.3331084), "Arapongas": (-40.5063201, -11.3720509)}
for nome, (lon, lat) in pts.items():
    escondeu, poente = None, None
    for m in range(12*60, 19*60):  # hora local UTC-3
        hu = (m + 180) / 60
        el, az = sol(lat, lon, ano, mes, dia, hu)
        if poente is None and el < -0.833:
            poente = m
        if escondeu is None and el > -0.833 and el < horizonte(lon, lat, az):
            escondeu = (m, el, az)
    f = lambda mm: f"{mm//60:02d}:{mm%60:02d}"
    if escondeu:
        m, el, az = escondeu
        print(f"{nome}: sol some atrás do relevo às {f(m)} (sol a {el:.1f} graus, azimute {az:.0f}); pôr do sol no horizonte livre às {f(poente)}; diferença {poente-m} min")
    else:
        print(f"{nome}: sem bloqueio; pôr do sol {f(poente)}")
