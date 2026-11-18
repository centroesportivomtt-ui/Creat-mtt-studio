# render2.py (rodada 2): renderiza SO os planos da v2 que nao saem do arquivo da v1 (novos + os que faltavam quadro/cauda).
# Mesma cadeia da v1 (py/mx.py + py/render.py): mapa de tempo, estabilizacao medida, enquadre, denoise, cor por ambiente.
# Novidades: bruto parcial em arquivo esparso (py2/busca.py), congelamento do P55, emenda P54->P11 (escala/foco/cor casados e
# residuo medido contra o 1o quadro do P11.mp4), caudas da v2.
# uso: render2.py [clip,...]   Idempotente por hash (planos/_rel.json).
import sys, time, copy
M_='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
sys.path.insert(0, M_ + '/build/video/py'); sys.path.insert(0, M_ + '/build/video/py2')
from mx import *
import mx, render as R1, busca
trajetoria, suaviza, jitter = R1.trajetoria, R1.suaviza, R1.jitter
AN = json.load(open(V + '/py2/analise.json')); R1V = json.load(open(V + '/planos/_rel_v1.json'))
LOCAL = {'IMG_5169': M + '/build/cenas/brutos/IMG_5169.MOV', 'IMG_5170': M + '/build/cenas/brutos/IMG_5170.MOV'}
# opcoes por plano (decisoes do editor; o resto vem do contrato)
OPT = {
 'P54': dict(modo='leve', mult=1.12, cor2=('interno_loja', 22.3, 24.32), emenda='P11', fase=True),   # mesmo modo/recorte do P11 (nota do diretor)
 'P09': dict(modo='leve'),                                                              # selfie (igual a v1)
 'P55': dict(congela=0.6, sem_rampa=True),
}
def mapa2(p, t):
    o = OPT.get(p['id'], {})
    if o.get('sem_rampa'):
        s = p['src_in'] + (t - p['t0']) * p['vel']
        if 'congela' in o: s = min(s, o['congela'])
        return s, (0.0 if s >= o.get('congela', 1e9) else p['vel'])
    s, v = mapa(p, t)
    if o.get('emenda'):
        # fase: o vizinho (arquivo da v1) comeca num quadro de fonte definido; este plano anda na MESMA fase, para a emenda
        # contigua nao repetir nem pular quadro de fonte (desvio de ~15 ms, igual ao do vizinho)
        s += R1V[o['emenda']]['src'][0] - (p['src_in'] + (p['F1'] / FPS - p['t0']) * p['vel'])
    return s, v

def chave(p):
    q = {k: v for k, v in p.items() if k not in ('tin', 'tout')}
    return hashlib.md5(json.dumps([q, p['tin'], p['tout'], COR.get(p['cor']), OPT.get(p['id']), 'v2r3'], sort_keys=True, default=str).encode()).hexdigest()

def _caixa(zs, fs, mult, sig):
    Z = zs * mult; Wn = 2160 / Z; Hn = 3840 / Z
    cx = np.clip(fs[:, 0] * 2160, Wn / 2, 2160 - Wn / 2); cy = np.clip(fs[:, 1] * 3840, Hn / 2, 3840 - Hn / 2)
    if sig:
        sx = (2160 - Wn) / 4; sy = (3840 - Hn) / 4
        cx = np.clip(cx, 1080 - sx, 1080 + sx); cy = np.clip(cy, 1920 - sy, 1920 + sy)
    mx_ = float(np.min(np.minimum(cx - Wn / 2, 2160 - cx - Wn / 2))); my = float(np.min(np.minimum(cy - Hn / 2, 3840 - cy - Hn / 2)))
    return Wn, Hn, cx, cy, mx_, my

def geom(p, f, info, extra_out=0):
    m = meta(f); fps = m['fps']; o = OPT.get(p['id'], {})
    G = list(range(p['F0'] - p['nin'], p['F1'] + p['nout'] + extra_out)); n = len(G)
    S = [mapa2(p, g / FPS) for g in G]
    idx = np.array([s * fps for s, v in S]); spans = []
    for (s, v), x in zip(S, idx):
        st = v * fps / FPS
        if st > 1.6: a = int(round(x - st * 0.3)); b = int(round(x + st * 0.3)); spans.append(list(range(a, b + 1)))
        else: spans.append([int(round(x))])
    lo = max(0, min(min(s) for s in spans)); hi = min(m['nb'] - 1, max(max(s) for s in spans))
    spans = [[min(max(j, lo), hi) for j in s] for s in spans]
    zs = np.array([zoom(p, min(g, p['F1'] + p['nout'] - 1) / FPS) for g in G]); fs = np.array([foco(p, g / FPS) for g in G])
    sig = 13 if p['estabilizar'] else 0
    pad = 30; a = max(0, lo - pad); b = min(m['nb'] - 1, hi + pad)
    c = trajetoria(f, a, b - a + 1)
    sel = np.clip(np.array([s[len(s) // 2] for s in spans]) - a, 0, len(c) - 1)
    jit0 = round(jitter(c[sel]), 2) if n > 16 else 0.0; info['jit_antes'] = jit0
    leve = False
    if o.get('modo') == 'leve': sig = 7; leve = True; info['estab_auto'] = 'leve(opcao do editor)'
    if not sig and jit0 > 1.6: sig = 7; leve = True; info['estab_auto'] = 'leve'
    def tenta(sig, lista, lim):
        d = None; res = None
        for mult in lista:
            Wn, Hn, cx, cy, mx_, my = _caixa(zs, fs, mult, sig)
            if not sig: return (mult, Wn, Hn, cx, cy, mx_, my, None)
            if mx_ <= 8 or my <= 8: continue
            mrot = 0.008; myy = my * 0.9 - 2160 * mrot * 0.5
            if myy <= 8: continue
            d = suaviza(c, sig, mx_ * 0.9, myy, mrot)
            info['jit_depois'] = round(jitter((c + d)[sel]), 2) if n > 16 else 0.0
            info['lim_pct'] = round(100 * float(np.mean((np.abs(d[sel, 0]) > mx_ * 0.89) | (np.abs(d[sel, 1]) > myy * 0.99))), 1)
            res = (mult, Wn, Hn, cx, cy, mx_, my, d)
            if info['lim_pct'] < lim: break
        return res
    if 'mult' in o: res = tenta(sig, [o['mult']], 1e9)
    else:
        res = tenta(sig, ([1.0, 1.04, 1.08, 1.12] if leve else [1.0, 1.05, 1.10, 1.16, 1.24]) if sig else [1.0], 35 if leve else 15)
        if sig and not leve and res[7] is not None and (info['jit_depois'] > 0.8 * jit0 or info['lim_pct'] > 50):
            sig = 7; leve = True; info['estab_auto'] = 'leve(forte nao rendeu)'
            res = tenta(sig, [1.0, 1.04, 1.08, 1.12], 35)
    mult, Wn, Hn, cx, cy, mx_, my, d = res
    info['zoom_x'] = mult; info['estab'] = bool(d is not None)
    return dict(G=G, S=S, spans=spans, lo=lo, hi=hi, zs=zs, a=a, c=c, mult=mult, Wn=Wn, Hn=Hn, cx=cx, cy=cy, mx=mx_, my=my, d=d, n=n)

def matriz(g, k, rx0, ry0, fzx, fzy):
    need = g['spans'][k]; jc = need[len(need) // 2]
    ccx, ccy, th = g['cx'][k], g['cy'][k], 0.0
    if g['d'] is not None:
        dj = g['d'][min(max(jc - g['a'], 0), len(g['d']) - 1)]; ccx, ccy, th = ccx - dj[0], ccy - dj[1], -dj[2]
    sc = (2160 / (g['zs'][k] * g['mult'] * g.get('zex', 1.0))) / W; co, si = math.cos(th), math.sin(th)
    A = np.array([[co * sc * fzx, -si * sc * fzx], [si * sc * fzy, co * sc * fzy]])
    bb = np.array([(ccx - rx0) * fzx, (ccy - ry0) * fzy]) - A @ np.array([W / 2, H / 2])
    return np.hstack([A, bb[:, None]])

def cor_mix(p, o, s_fonte, k):
    c2 = OPT.get(p['id'], {}).get('cor2')
    if not c2 or s_fonte <= c2[1]: return grade(o, p['cor'], k)
    u = min(1.0, (s_fonte - c2[1]) / (c2[2] - c2[1])); u = u * u * (3 - 2 * u)
    a_ = grade(o, p['cor'], k); b_ = grade(o, c2[0], k)
    return cv2.addWeighted(a_, 1 - u, b_, u, 0)

def desenha(p, f, g, info, corr=None, so=None, saida=None):
    """corr(k) -> matriz 3x3 (saida corrigida = corr . saida) ou None; so = lista de k para devolver em memoria"""
    mgx = g['mx'] if g['d'] is not None else 0; mgy = g['my'] if g['d'] is not None else 0
    Wn, Hn, cx, cy = g['Wn'], g['Hn'], g['cx'], g['cy']
    rx0 = int(max(0, np.min(cx - Wn / 2) - mgx)) // 2 * 2; ry0 = int(max(0, np.min(cy - Hn / 2) - mgy)) // 2 * 2
    rx1 = min(2160, int(np.max(cx + Wn / 2) + mgx + 2) // 2 * 2); ry1 = min(3840, int(np.max(cy + Hn / 2) + mgy + 2) // 2 * 2)
    fz = min(1.0, W / float(np.min(Wn)))
    ww = int((rx1 - rx0) * fz) // 2 * 2; wh = int((ry1 - ry0) * fz) // 2 * 2; fzx = ww / (rx1 - rx0); fzy = wh / (ry1 - ry0)
    cr = COR[p['cor']]
    vf = f'crop={rx1 - rx0}:{ry1 - ry0}:{rx0}:{ry0},scale={ww}:{wh}:flags=lanczos'
    if cr.get('dn'): vf += ',' + cr['dn']
    enc = None; mem = {}
    if so is None:
        tmp = saida + '.tmp.mp4'
        enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-threads', '2',
                                '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
    ks = range(g['n']) if so is None else so
    # folga de borda: se algum canto do quadro (rotacao + correcao) sair da regiao lida, fecha um zoom fixo minimo no plano inteiro
    def Mk(k):
        Mi = matriz(g, k, rx0, ry0, fzx, fzy)
        if corr is not None:
            C = corr(k)
            if C is not None: Mi = (np.vstack([Mi, [0, 0, 1]]) @ np.linalg.inv(C))[:2]
        return Mi
    def sobra():
        w = 0.0
        for k in range(g['n']):
            cs = (Mk(k) @ np.array([[0, 0, 1], [W, 0, 1], [0, H, 1], [W, H, 1]], np.float64).T).T
            w = max(w, float(max(0 - cs[:, 0].min(), cs[:, 0].max() - (ww - 1), 0 - cs[:, 1].min(), cs[:, 1].max() - (wh - 1), 0)))
        return w
    g.setdefault('zex', 1.0)
    while sobra() > 0.2 and g['zex'] < 1.06: g['zex'] = round(g['zex'] + 0.003, 4)
    info['zextra'] = g['zex']
    lo0 = min(min(g['spans'][k]) for k in ks); hi0 = max(max(g['spans'][k]) for k in ks)
    if cr.get('dn'): lo0 = max(g['lo'], lo0 - 6)      # aquece o denoise temporal
    buf = {}; rd = ler(f, lo0, hi0 - lo0 + 1, vf, ww, wh, 3); j = lo0 - 1; fora = 0.0
    for k in ks:
        need = g['spans'][k]
        while j < max(need):
            fr_ = next(rd, None); j += 1
            if fr_ is None: break
            buf[j] = fr_
        for q in [q for q in buf if q < min(need) - 2]: del buf[q]
        got = [buf[q] for q in need if q in buf] or [buf[max(buf)]]
        src = got[0] if len(got) == 1 else np.mean(np.stack(got).astype(np.float32), 0).astype(np.uint8)
        Mi = Mk(k)
        # confere se o quadro de saida cai inteiro dentro da regiao lida (sem borda replicada)
        cs = (Mi @ np.array([[0, 0, 1], [W, 0, 1], [0, H, 1], [W, H, 1]], np.float64).T).T
        fora = max(fora, float(max(0 - cs[:, 0].min(), cs[:, 0].max() - (ww - 1), 0 - cs[:, 1].min(), cs[:, 1].max() - (wh - 1), 0)))
        o = cv2.warpAffine(src, Mi, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        o = cor_mix(p, o, g['S'][k][0], k)
        if enc: enc.stdin.write(o.tobytes())
        else: mem[k] = o
    rd.close()
    info['fora_px'] = round(fora / max(fzx, 1e-6) / (2160 / W), 2)      # quanto passou da regiao, em px de saida (0 = sem borda)
    if enc:
        enc.stdin.close(); enc.wait(); os.replace(tmp, saida)
        G, S = g['G'], g['S']
        info.update(quadros=g['n'], F=[G[0], G[-1] + 1], src=[round(S[0][0], 3), round(S[-1][0], 3)], regiao=[rx0, ry0, rx1, ry1], fz=round(fz, 3))
    return mem

def primeiro_quadro(arq):
    r = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', arq, '-frames:v', '1', '-pix_fmt', 'bgr24', '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(r, np.uint8).reshape(H, W, 3)

def afim(a, b):
    """transformacao parcial (escala+rot+transl) que leva a -> b, por pontos (ORB em cinza equalizado)"""
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY); gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    pa = cv2.goodFeaturesToTrack(ga, 900, 0.004, 9)
    pb, st, _ = cv2.calcOpticalFlowPyrLK(ga, gb, pa, None, winSize=(41, 41), maxLevel=4); ok = st.ravel() == 1
    A, inl = cv2.estimateAffinePartial2D(pa[ok], pb[ok], method=cv2.RANSAC, ransacReprojThreshold=1.2)
    res = np.linalg.norm((pa[ok].reshape(-1, 2) @ A[:, :2].T + A[:, 2]) - pb[ok].reshape(-1, 2), axis=1)[inl.ravel() == 1]
    return A, int(inl.sum()), float(np.median(res))

def render(p, f, info):
    o = OPT.get(p['id'], {}); saida = f"{V}/planos/{p['id']}.mp4"
    if o.get('emenda'):
        # o quadro seguinte ao ultimo do plano (fonte = src_out) tem de cair em cima do 1o quadro do vizinho ja renderizado
        g = geom(p, f, info, extra_out=1); kx = g['n'] - 1
        alvo = primeiro_quadro(f"{V}/planos/{o['emenda']}.mp4")
        meu = desenha(p, f, g, {}, so=[kx])[kx]
        A, ninl, res = afim(meu, alvo)
        sc = math.hypot(A[0, 0], A[1, 0]); rot = math.atan2(A[1, 0], A[0, 0]); cxy = A @ np.array([W / 2, H / 2, 1.0]) - np.array([W / 2, H / 2])
        info['emenda_antes'] = dict(dx=round(float(cxy[0]), 2), dy=round(float(cxy[1]), 2), escala=round(sc, 5), rot_graus=round(math.degrees(rot), 3), pontos=ninl, residuo_px=round(res, 2))
        nr = 36                                                   # correcao entra em 1,2 s (suave) e chega inteira no corte
        def corr(k):
            u = (k - (kx - nr)) / nr
            if u <= 0: return None
            u = min(u, 1.0); u = u * u * (3 - 2 * u)
            s_ = 1 + (sc - 1) * u; r_ = rot * u; t_ = cxy * u
            co, si = math.cos(r_) * s_, math.sin(r_) * s_
            Cm = np.array([[co, -si, 0], [si, co, 0], [0, 0, 1.0]]); c0 = np.array([W / 2, H / 2])
            Cm[:2, 2] = c0 + t_ - Cm[:2, :2] @ c0
            return Cm
        dep = desenha(p, f, g, {}, corr=corr, so=[kx])[kx]
        A2, n2, res2 = afim(dep, alvo); c2 = A2 @ np.array([W / 2, H / 2, 1.0]) - np.array([W / 2, H / 2])
        info['emenda_depois'] = dict(dx=round(float(c2[0]), 2), dy=round(float(c2[1]), 2), escala=round(math.hypot(A2[0, 0], A2[1, 0]), 5), pontos=n2, residuo_px=round(res2, 2),
                                     dif_media_niveis=round(float(np.mean(cv2.absdiff(dep, alvo))), 2))
        cv2.imwrite(f"{V}/chk2/emenda_{p['id']}_{o['emenda']}.jpg", np.hstack([cv2.resize(x, (540, 960)) for x in (meu, dep, alvo, cv2.convertScaleAbs(cv2.absdiff(dep, alvo), alpha=4))]))
        g2 = dict(g); g2['n'] = g['n'] - 1; g2['G'] = g['G'][:-1]; g2['S'] = g['S'][:-1]; g2['spans'] = g['spans'][:-1]
        desenha(p, f, g2, info, corr=corr, saida=saida)
    else:
        g = geom(p, f, info); desenha(p, f, g, info, saida=saida)
    return saida

def trechos(PP, f_meta_fps=30.0):
    T = []
    for p in PP:
        G = [p['F0'] - p['nin'], p['F1'] + p['nout']]
        s0 = min(mapa2(p, G[0] / FPS)[0], mapa2(p, p['t0'])[0]); s1 = max(mapa2(p, G[1] / FPS)[0], mapa2(p, p['t1'])[0])
        T.append((max(0.0, s0 - 1.3), s1 + 1.3))
    T.sort(); U = []
    for a, b in T:
        if U and a <= U[-1][1] + 2: U[-1][1] = max(U[-1][1], b)
        else: U.append([a, b])
    return [tuple(x) for x in U]

if __name__ == '__main__':
    so = sys.argv[1].split(',') if len(sys.argv) > 1 else None
    FAZER = [k for k, v in AN.items() if v['acao'] == 'render' and k not in ('P70', 'P71', 'I02', 'I03', 'I04')]
    P = [p for p in planos() if p['id'] in FAZER]
    clips = []
    for p in P:
        if p['clip'] not in clips: clips.append(p['clip'])
    if so: clips = [c for c in clips if c in so or any(p['id'] in so for p in P if p['clip'] == c)]
    relf = V + '/planos/_rel.json'
    for clip in clips:
        rel = json.load(open(relf))
        PP = [p for p in P if p['clip'] == clip and (not so or clip in so or p['id'] in so)]
        falta = [p for p in PP if not (os.path.exists(f"{V}/planos/{p['id']}.mp4") and rel.get(p['id'], {}).get('hash') == chave(p) and not (rel[p['id']].get('fora_px', 0) > 2.0 and 'zextra' not in rel[p['id']]))]
        if not falta: print(clip, 'pronto'); continue
        t = time.time()
        f = LOCAL.get(clip) or busca.busca(clip, trechos(falta))
        print(clip, 'fonte pronta', round(time.time() - t), 's', meta(f), flush=True)
        for p in falta:
            t = time.time(); info = {}
            render(p, f, info); info['hash'] = chave(p); info['seg'] = round(time.time() - t, 1); info['v2'] = True
            rel = json.load(open(relf)); rel[p['id']] = info; json.dump(rel, open(relf, 'w'), indent=0); print(p['id'], info, flush=True)
        if clip not in LOCAL and not os.environ.get('MANTER'):
            os.remove(f); os.path.exists(f + '.faixas.json') and os.remove(f + '.faixas.json')
        progresso(f'v2: planos do {clip} prontos ({",".join(p["id"] for p in falta)})')
    print('render2 ok')
