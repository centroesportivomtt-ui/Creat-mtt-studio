# chuva2.py: P70 e inserts I02/I03/I04 (e P71 = I02+I03+I04) a partir dos arquivos JA tratados de build/cenas/chuva/final.
# Nao regrada: so corta a janela do contrato, converte a cadencia (quadro mais proximo; d3/e3 sao 24 fps), poe a vinheta e o grao
# do resto do filme por cima. I04/P71: a cauda de 2 quadros e o quadro do pico do relampago segurado (nota da transicao relampago_real).
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
                             '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-threads', '2',
                             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', path], stdin=subprocess.PIPE)
GRAO = 1.0
rel = {}; guard = {}
PL = {p['id']: p for p in planos()}
for pid in ('P70', 'I02', 'I03', 'I04'):
    p = PL[pid]; tr = p['tratado']; f = M + '/' + tr['arquivo']; fps = fps_de(f); Q = quadros(f)
    nin = p['nin']; nout = 2 if pid == 'I04' else p['nout']
    G = list(range(p['F0'] - nin, p['F1'] + nout)); idx = []
    for g in G:
        gg = min(g, p['F1'] - 1) if pid == 'I04' else g                      # I04: cauda = pico segurado
        tau = tr['offset_in'] + (gg / FPS - p['t0']) * p['vel']; idx.append(int(min(max(round(tau * fps), 0), len(Q) - 1)))
    out = f"{V}/planos/{pid}.mp4"; e = enc(out + '.tmp.mp4'); fr_out = []
    for k, i in enumerate(idx):
        o = grao(vinheta(Q[i].copy()), GRAO, k); fr_out.append(o); e.stdin.write(o.tobytes())
    e.stdin.close(); e.wait(); os.replace(out + '.tmp.mp4', out)
    lum = [round(float(Q[i].mean()), 1) for i in idx]
    rel[pid] = dict(quadros=len(G), F=[G[0], G[-1] + 1], src=[round(p['src_in'] - nin / FPS, 3), round(p['src_out'], 3)], origem=tr['arquivo'], fps_origem=round(fps, 3),
                    idx_origem=[idx[0], idx[-1]], repetidos=int(sum(1 for a, b in zip(idx, idx[1:]) if a == b)), v2=True, hash='chuva2r1')
    if pid == 'I04': rel[pid]['pico_relampago'] = dict(F=G[int(np.argmax(lum))], luma=max(lum), cauda='2 quadros = pico segurado'); rel[pid]['luma_fim'] = lum[-8:]
    guard[pid] = fr_out; print(pid, rel[pid], flush=True)
# P71 = I02 + I03 + I04 (a imagem do P71 do contrato e 100% coberta pelos inserts)
e = enc(f'{V}/planos/P71.mp4.tmp.mp4'); n = 0
for pid in ('I02', 'I03', 'I04'):
    for o in guard[pid]: e.stdin.write(o.tobytes()); n += 1
e.stdin.close(); e.wait(); os.replace(f'{V}/planos/P71.mp4.tmp.mp4', f'{V}/planos/P71.mp4')
p = PL['P71']; rel['P71'] = dict(quadros=n, F=[p['F0'], p['F0'] + n], origem='I02+I03+I04 (mesmos quadros)', v2=True, hash='chuva2r1'); print('P71', rel['P71'])
json.dump(rel, open(V + '/planos/_rel_chuva.json', 'w'), indent=0)
progresso('v2: chuva pronta (P70, I02, I03, I04, P71) a partir de build/cenas/chuva/final')
