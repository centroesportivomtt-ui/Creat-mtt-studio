# chuva3.py (correcao 1 da rodada 2): P70 (textura curta, 24 fps tocado quadro a quadro = sem quadro repetido), I03 (perfil do Ruan
# reenquadrado do 4K, rosto no meio) e I04 (pista boa reenquadrada do 4K, 3,1 s, push-in lento, relampago real no fim). P71 = I03+I04 a partir de P71.F0.
import sys, json, subprocess
M_='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
sys.path.insert(0, M_ + '/build/video/py')
from mx import *
def fps_de(f):
    a, b = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip().split('/')
    return float(a) / float(b)
def quadros(f):
    r = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', f, '-pix_fmt', 'bgr24', '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(r, np.uint8).reshape(-1, H, W, 3)
def enc(path):
    return subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                             '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-threads', '3',
                             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', path], stdin=subprocess.PIPE)
def empurra(img, s, cx, cy):
    if s <= 1.0005: return img
    M_ = np.float32([[s, 0, cx - s * cx], [0, s, cy - s * cy]])
    return cv2.warpAffine(img, M_, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
def preto_base(img):
    """altura (px) da faixa preta colada na base: linhas com luma media < 14"""
    l = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).mean(1); k = 0
    while k < H and l[H - 1 - k] < 14: k += 1
    return k
rel = {}; guard = {}; PL = {p['id']: p for p in planos()}
for pid in ('P70', 'I03', 'I04'):
    p = PL[pid]; tr = p['tratado']; f = M + '/' + tr['arquivo']; fps = fps_de(f); Q = quadros(f)
    nin = p['nin']; nout = 2 if pid == 'I04' else p['nout']
    G = list(range(p['F0'] - nin, p['F1'] + nout)); idx = []; off = tr['offset_in']
    if pid == 'I04':      # ancora: o ultimo quadro do corpo e o PICO do relampago (medido no arquivo)
        lum = Q[:, ::8, ::8].reshape(len(Q), -1).mean(1); pk = int(np.argmax(lum)); off = pk / fps - (p['t1'] - 1 / FPS - p['t0']) * p['vel']
    for g in G:
        gg = min(g, p['F1'] - 1) if pid == 'I04' else g
        if pid == 'P70': i = int(round(off * fps)) + (g - p['F0'])                # 1 quadro de fonte por quadro de saida
        else: i = int(round((off + (gg / FPS - p['t0']) * p['vel']) * fps))
        idx.append(int(min(max(i, 0), len(Q) - 1)))
    out = f"{V}/planos/{pid}.mp4"; e = enc(out + '.tmp.mp4'); fr_out = []; pb = []; dif = []; ant = None; lumr = []
    for k, i in enumerate(idx):
        o = Q[i]
        if pid == 'I04': u = min(1.0, k / (len(G) - 3)); o = empurra(o, 1.0 + 0.06 * u * u * (3 - 2 * u), W * 0.56, H * 0.60)
        o = grao(vinheta(o.copy()), 1.0, k); fr_out.append(o); e.stdin.write(o.tobytes()); pb.append(preto_base(o))
        s = cv2.resize(o, (270, 480), interpolation=cv2.INTER_AREA).astype(np.int16)
        if ant is not None: dif.append(float(np.abs(s - ant).mean()))
        ant = s; lumr.append(round(float(o[1100:1700, 300:800].mean()), 1))
    e.stdin.close(); e.wait(); os.replace(out + '.tmp.mp4', out)
    rel[pid] = dict(quadros=len(G), F=[G[0], G[-1] + 1], origem=tr['arquivo'], fps_origem=round(fps, 3), idx_origem=[idx[0], idx[-1]], offset_usado=round(off, 3),
                    repetidos=int(sum(1 for a, b in zip(idx, idx[1:]) if a == b)), dif_min_entre_quadros=round(min(dif), 2), preto_base_px_max=int(max(pb)), preto_base_px_mediana=int(np.median(pb)), v2=True, hash='chuva3_correcao1')
    if pid == 'I04': rel[pid]['luma_pista_por_quadro'] = lumr; rel[pid]['pico'] = dict(idx=pk, F=G[idx.index(pk)])
    guard[pid] = dict(zip(G, fr_out)); print(pid, {k: v for k, v in rel[pid].items() if k != 'luma_pista_por_quadro'}, flush=True)
p = PL['P71']; e = enc(f'{V}/planos/P71.mp4.tmp.mp4'); n = 0
for g in range(p['F0'] - p['nin'], p['F1'] + 2):
    o = guard['I04'][g] if g in guard['I04'] else guard['I03'][g]; e.stdin.write(o.tobytes()); n += 1
e.stdin.close(); e.wait(); os.replace(f'{V}/planos/P71.mp4.tmp.mp4', f'{V}/planos/P71.mp4')
rel['P71'] = dict(quadros=n, F=[p['F0'] - p['nin'], p['F0'] - p['nin'] + n], origem='I03+I04 (mesmos quadros)', v2=True, hash='chuva3_correcao1'); print('P71', rel['P71'])
if os.path.exists(V + '/planos/I02.mp4'): os.replace(V + '/planos/I02.mp4', V + '/planos_v1_guardados/I02_fora_correcao1.mp4')
json.dump(rel, open(V + '/planos/_rel_chuva.json', 'w'), indent=0)
progresso('correcao 1: chuva refeita (P70 textura 1,1 s sem quadro repetido; I03 Ruan reenquadrado; I04 pista boa 3,1 s do 4K; I02 saiu)')
