import json, math, sys
import numpy as np
from PIL import Image

S = sys.argv[1]
Z = 12
XS = [1586, 1587, 1588]
YS = [2176, 2177, 2178]

mos = np.zeros((256 * len(YS), 256 * len(XS)), dtype=np.float32)
for j, y in enumerate(YS):
    for i, x in enumerate(XS):
        a = np.asarray(Image.open(f"{S}/dem12/{x}_{y}.png").convert("RGB")).astype(np.float32)
        h = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
        mos[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = h

N = 2 ** Z
def px(lon, lat):
    xt = (lon + 180) / 360 * N
    lr = math.radians(lat)
    yt = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * N
    return (xt - XS[0]) * 256, (yt - YS[0]) * 256

def elev(lon, lat):
    x, y = px(lon, lat)
    return float(mos[int(y), int(x)])

pts = {
    "vila": (-40.486526, -11.339931),
    "veu": (-40.5035718, -11.3331084),
    "arapongas": (-40.5063201, -11.3720509),
    "pico_payayas": (-40.5047642, -11.3138142),
    "urubu": (-40.5383116, -11.4021353),
}
print("mosaico", mos.shape, "min", round(float(mos.min())), "max", round(float(mos.max())))
for k, (lo, la) in pts.items():
    print(k, round(elev(lo, la)), "m")

# janela das cachoeiras: 6 km em volta da vila
x0, y0 = px(-40.56, -11.30)
x1, y1 = px(-40.46, -11.39)
win = mos[int(y0):int(y1), int(x0):int(x1)]
print("janela cachoeiras", win.shape, "min", round(float(win.min())), "max", round(float(win.max())), "amplitude", round(float(win.max() - win.min())))

# relevo pintado: sombra multidirecional + 4 tons chapados (pintura de placa)
res = 40075016.686 * math.cos(math.radians(-11.34)) / (256 * N)  # metros por pixel
gy, gx = np.gradient(mos * 1.5, res)
def shade(az, alt=40):
    az, alt = math.radians(az), math.radians(alt)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    return np.cos(alt) * np.cos(slope) + np.sin(alt) * np.sin(slope) * np.cos(az - aspect)
hs = 0.5 * shade(315) + 0.3 * shade(270) + 0.2 * shade(0)
hs = (hs - hs.min()) / (hs.max() - hs.min())
q = np.digitize(hs, [0.42, 0.6, 0.78])  # 4 tons, como tinta chapada

# cor por altitude (hipsometria pintada) e tom de luz
lo_c = np.array([46, 74, 52])    # verde do vale
hi_c = np.array([196, 160, 104])  # quartzito da serra
t = np.clip((mos - 450) / (1000 - 450), 0, 1)[..., None]
base = lo_c * (1 - t) + hi_c * t
mult = np.array([0.55, 0.78, 1.0, 1.16])[q][..., None]
img = np.clip(base * mult, 0, 255).astype(np.uint8)
im = Image.fromarray(img, "RGB").resize((img.shape[1] * 2, img.shape[0] * 2), Image.NEAREST)

# rios e estradas do recorte OSM por cima
from PIL import ImageDraw
d = ImageDraw.Draw(im)
osm = json.load(open(sys.argv[2]))
nodes = {e["id"]: (e["lon"], e["lat"]) for e in osm["elements"] if e["type"] == "node"}
for e in osm["elements"]:
    if e["type"] != "way":
        continue
    tg = e.get("tags", {})
    cor = None
    if tg.get("waterway") in ("river", "stream"):
        cor, w = (64, 170, 230), 3
    elif tg.get("highway") in ("tertiary", "unclassified", "track", "path", "residential"):
        cor, w = (245, 235, 210), 2
    if not cor:
        continue
    xy = []
    for nid in e["nodes"]:
        if nid in nodes:
            X, Y = px(*nodes[nid])
            xy.append((X * 2, Y * 2))
    if len(xy) > 1:
        d.line(xy, fill=cor, width=w)
for k, (lo, la) in pts.items():
    X, Y = px(lo, la)
    d.ellipse([X * 2 - 7, Y * 2 - 7, X * 2 + 7, Y * 2 + 7], fill=(255, 210, 0), outline=(20, 20, 20), width=3)
crop = im.crop((int(x0 * 2), int(y0 * 2), int(x1 * 2), int(y1 * 2)))
crop.save(f"{S}/prova-relevo-pintado.png")
print("salvo", f"{S}/prova-relevo-pintado.png", crop.size, "m/px", round(res, 1))
