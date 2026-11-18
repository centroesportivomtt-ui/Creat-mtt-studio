# render.py: renderiza planos/<id>.mp4 (1080x1920, 30 fps, corpo t1-t0 + metade das transicoes vizinhas como cauda)
# a partir do bruto 4K: mapa de tempo (vel/ramp/freeze), estabilizacao medida (LK + caminho suave), enquadre por foco/zoom,
# denoise temporal (noturno), cor por ambiente, motion blur temporal nos trechos rapidos.
# uso: render.py [clip,...]  (por clipe: baixa, renderiza todos os planos dele, apaga o bruto). Idempotente por hash.
import sys, time
from mx import *

def trajetoria(f, n0, n):
    w, h = 360, 640; sc = 2160 / w; tr = [(0, 0, 0)]; prev = None
    for g in ler(f, n0, n, f'scale={w}:{h}', w, h, 1):
        M_ = None
        if prev is not None:
            p = cv2.goodFeaturesToTrack(prev, 400, 0.006, 8)
            if p is not None and len(p) >= 12:
                q, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, p, None); ok = st.ravel() == 1
                if ok.sum() >= 8: M_, _ = cv2.estimateAffinePartial2D(p[ok], q[ok], method=cv2.RANSAC, ransacReprojThreshold=1.5)
            if M_ is not None:
                c = M_ @ np.array([w / 2, h / 2, 1.0]); tr.append(((c[0] - w / 2) * sc, (c[1] - h / 2) * sc, math.atan2(M_[1, 0], M_[0, 0])))
            else: tr.append((0, 0, 0))
        prev = g.copy()
    tr = np.array(tr, np.float64); big = np.hypot(tr[:, 0], tr[:, 1]) > 260; tr[big] = 0
    return np.cumsum(tr, 0)

def suaviza(c, sig, mx, my, mrot=0.010):
    r = int(3 * sig); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2); k /= k.sum()
    sm = lambda x: np.convolve(np.pad(x, (r, r), mode='edge'), k, 'valid')
    def lim(d):
        d = d.copy(); d[:, 0] = np.clip(d[:, 0], -mx, mx); d[:, 1] = np.clip(d[:, 1], -my, my); d[:, 2] = np.clip(d[:, 2], -mrot, mrot); return d
    tgt = np.stack([sm(c[:, j]) for j in range(3)], 1)
    for _ in range(6): tgt = np.stack([sm((c + lim(tgt - c))[:, j]) for j in range(3)], 1)
    return lim(tgt - c)

def jitter(c):
    k = 15; ker = np.ones(k) / k
    sm = lambda x: np.convolve(np.pad(x, (k // 2, k // 2), mode='edge'), ker, 'valid')
    res = np.stack([c[:, j] - sm(c[:, j]) for j in range(2)], 1)
    return float(np.sqrt(np.mean(res[:, 0] ** 2 + res[:, 1] ** 2))) / 2

def porta_xy(f):
    """centro da folha preta da porta fechando (fonte 19.45) para o empurrao do P07"""
    m = meta(f); n = int(round(19.40 * m['fps']))
    g = next(ler(f, n, 1, 'scale=540:960', 540, 960, 1))
    msk = (cv2.GaussianBlur(g, (0, 0), 3) < 38).astype(np.uint8)
    msk[:int(0.12 * 960)] = 0; msk[int(0.92 * 960):] = 0
    n_, lab, st, cen = cv2.connectedComponentsWithStats(msk, 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); x, y = cen[i]
    return [round(x / 540, 3), round(y / 960, 3)], round(st[i, cv2.CC_STAT_AREA] / (540 * 960), 3)

def chave(p):
    q = {k: v for k, v in p.items() if k not in ('tin', 'tout', 'porta_xy')}
    return hashlib.md5(json.dumps([q, p['tin'], p['tout'], COR.get(p['cor']), 'r5', VMAX], sort_keys=True, default=str).encode()).hexdigest()

def render(p, f, info):
    m = meta(f); fps = m['fps']
    G = list(range(p['F0'] - p['nin'], p['F1'] + p['nout'])); n = len(G)
    S = [mapa(p, g / FPS) for g in G]
    idx = np.array([s * fps for s, v in S])                      # indice fracionario de quadro de fonte
    spans = []
    for (s, v), x in zip(S, idx):
        st = v * fps / FPS
        if st > 1.6:      # obturador ~ 180 graus nos trechos rapidos (speed ramp)
            a = int(round(x - st * 0.3)); b = int(round(x + st * 0.3)); spans.append(list(range(a, b + 1)))
        else: spans.append([int(round(x))])
    lo = max(0, min(min(s) for s in spans)); hi = min(m['nb'] - 1, max(max(s) for s in spans))
    spans = [[min(max(j, lo), hi) for j in s] for s in spans]
    zs = np.array([zoom(p, g / FPS) for g in G]); fs = np.array([foco(p, g / FPS) for g in G])
    # estabilizacao medida
    sig = 13 if p['estabilizar'] else 0
    pad = 30; a = max(0, lo - pad); b = min(m['nb'] - 1, hi + pad)
    c = trajetoria(f, a, b - a + 1)
    sel = np.clip(np.array([s[len(s) // 2] for s in spans]) - a, 0, len(c) - 1)
    jit0 = round(jitter(c[sel]), 2); info['jit_antes'] = jit0
    leve = False
    if p['id'] in ('P09',): sig = 7; leve = True; info['estab_auto'] = 'leve(selfie: rosto do Ruan na borda)'
    if not sig and jit0 > 1.6: sig = 7; leve = True; info['estab_auto'] = 'leve'
    d = None; mult = 1.0
    for mult in (([1.0, 1.04, 1.08, 1.12] if leve else [1.0, 1.05, 1.10, 1.16, 1.24]) if sig else [1.0]):
        Z = zs * mult; Wn = 2160 / Z; Hn = 3840 / Z
        cx = np.clip(fs[:, 0] * 2160, Wn / 2, 2160 - Wn / 2); cy = np.clip(fs[:, 1] * 3840, Hn / 2, 3840 - Hn / 2)
        if sig:
            sx = (2160 - Wn) / 4; sy = (3840 - Hn) / 4
            cx = np.clip(cx, 1080 - sx, 1080 + sx); cy = np.clip(cy, 1920 - sy, 1920 + sy)
        mx = float(np.min(np.minimum(cx - Wn / 2, 2160 - cx - Wn / 2))); my = float(np.min(np.minimum(cy - Hn / 2, 3840 - cy - Hn / 2)))
        if not sig: break
        if mx <= 8 or my <= 8: continue
        mrot = 0.008; myy = my * 0.9 - 2160 * mrot * 0.5
        if myy <= 8: continue
        dd = suaviza(c, sig, mx * 0.9, myy, mrot); d = dd
        info['jit_depois'] = round(jitter((c + dd)[sel]), 2)
        info['lim_pct'] = round(100 * float(np.mean((np.abs(dd[sel, 0]) > mx * 0.89) | (np.abs(dd[sel, 1]) > myy * 0.99))), 1)
        if info['lim_pct'] < (35 if leve else 15): break
    if sig and not leve and d is not None and (info['jit_depois'] > 0.8 * jit0 or info['lim_pct'] > 50):
        # estabilizacao forte nao rende (movimento de caminhada): volta para a leve, cortando menos
        sig = 7; leve = True; info['estab_auto'] = 'leve(forte nao rendeu)'
        for mult in [1.0, 1.04, 1.08, 1.12]:
            Z = zs * mult; Wn = 2160 / Z; Hn = 3840 / Z
            cx = np.clip(fs[:, 0] * 2160, Wn / 2, 2160 - Wn / 2); cy = np.clip(fs[:, 1] * 3840, Hn / 2, 3840 - Hn / 2)
            sx = (2160 - Wn) / 4; sy = (3840 - Hn) / 4
            cx = np.clip(cx, 1080 - sx, 1080 + sx); cy = np.clip(cy, 1920 - sy, 1920 + sy)
            mx = float(np.min(np.minimum(cx - Wn / 2, 2160 - cx - Wn / 2))); my = float(np.min(np.minimum(cy - Hn / 2, 3840 - cy - Hn / 2)))
            if mx <= 8 or my <= 8: continue
            mrot = 0.008; myy = my * 0.9 - 2160 * mrot * 0.5
            if myy <= 8: continue
            dd = suaviza(c, sig, mx * 0.9, myy, mrot); d = dd
            info['jit_depois'] = round(jitter((c + dd)[sel]), 2)
            info['lim_pct'] = round(100 * float(np.mean((np.abs(dd[sel, 0]) > mx * 0.89) | (np.abs(dd[sel, 1]) > myy * 0.99))), 1)
            if info['lim_pct'] < 35: break
    info['zoom_x'] = mult; info['estab'] = bool(d is not None)
    # regiao de trabalho
    mgx = mx if d is not None else 0; mgy = my if d is not None else 0
    rx0 = int(max(0, np.min(cx - Wn / 2) - mgx)) // 2 * 2; ry0 = int(max(0, np.min(cy - Hn / 2) - mgy)) // 2 * 2
    rx1 = min(2160, int(np.max(cx + Wn / 2) + mgx + 2) // 2 * 2); ry1 = min(3840, int(np.max(cy + Hn / 2) + mgy + 2) // 2 * 2)
    fz = min(1.0, W / float(np.min(Wn)))
    ww = int((rx1 - rx0) * fz) // 2 * 2; wh = int((ry1 - ry0) * fz) // 2 * 2; fzx = ww / (rx1 - rx0); fzy = wh / (ry1 - ry0)
    cr = COR[p['cor']]
    vf = f'crop={rx1 - rx0}:{ry1 - ry0}:{rx0}:{ry0},scale={ww}:{wh}:flags=lanczos'
    if cr.get('dn'): vf += ',' + cr['dn']
    out = f"{V}/planos/{p['id']}.mp4"; tmp = out + '.tmp.mp4'
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-threads', '2',
                            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
    buf = {}; k = 0; ultimo = None
    rd = ler(f, lo, hi - lo + 1, vf, ww, wh, 3)
    j = lo - 1
    for k in range(n):
        need = spans[k]
        while j < max(need):
            fr_ = next(rd, None); j += 1
            if fr_ is None: break
            buf[j] = fr_
        for q in [q for q in buf if q < min(need) - 2]: del buf[q]
        got = [buf[q] for q in need if q in buf] or [buf[max(buf)]]
        src = got[0] if len(got) == 1 else np.mean(np.stack(got).astype(np.float32), 0).astype(np.uint8)
        jc = need[len(need) // 2]
        ccx, ccy, th = cx[k], cy[k], 0.0
        if d is not None:
            dj = d[min(max(jc - a, 0), len(d) - 1)]; ccx, ccy, th = cx[k] - dj[0], cy[k] - dj[1], -dj[2]
        sc = (2160 / (zs[k] * mult)) / W; co, si = math.cos(th), math.sin(th)
        A = np.array([[co * sc * fzx, -si * sc * fzx], [si * sc * fzy, co * sc * fzy]])
        bb = np.array([(ccx - rx0) * fzx, (ccy - ry0) * fzy]) - A @ np.array([W / 2, H / 2])
        o = cv2.warpAffine(src, np.hstack([A, bb[:, None]]), (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        o = grade(o, p['cor'], k)
        enc.stdin.write(o.tobytes())
    enc.stdin.close(); enc.wait(); rd.close()
    os.replace(tmp, out)
    info.update(quadros=n, F=[G[0], G[-1] + 1], src=[round(S[0][0], 3), round(S[-1][0], 3)], regiao=[rx0, ry0, rx1, ry1], fz=round(fz, 3))
    return out

if __name__ == '__main__':
    so = sys.argv[1].split(',') if len(sys.argv) > 1 else None
    P = [p for p in planos() if p['id'] != 'P44']
    clips = []
    for p in P:
        if p['clip'] not in clips: clips.append(p['clip'])
    if so: clips = [c for c in clips if c in so]
    relf = V + '/planos/_rel.json'
    rel = json.load(open(relf)) if os.path.exists(relf) else {}
    for clip in clips:
        PP = [p for p in P if p['clip'] == clip]
        falta = [p for p in PP if not (os.path.exists(f"{V}/planos/{p['id']}.mp4") and rel.get(p['id'], {}).get('hash') == chave(p))]
        if not falta: print(clip, 'pronto'); continue
        t = time.time(); f = baixar(clip); print(clip, 'baixado', round(time.time() - t), 's', meta(f), flush=True)
        for p in falta:
            if p['id'] == 'P07':
                xy, area = porta_xy(f); p['porta_xy'] = xy; print('porta_xy', xy, 'area', area)
            t = time.time(); info = {}
            render(p, f, info); info['hash'] = chave(p); info['seg'] = round(time.time() - t, 1)
            if p.get('porta_xy'): info['porta_xy'] = p['porta_xy']
            rel[p['id']] = info; json.dump(rel, open(relf, 'w'), indent=0); print(p['id'], info, flush=True)
        if not os.environ.get('MANTER'): os.remove(f)
        progresso(f'planos do {clip} prontos ({",".join(p["id"] for p in PP)})')
    print('render ok')
