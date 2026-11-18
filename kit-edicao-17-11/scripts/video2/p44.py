# p44.py: fundo do cartao final (P44) na duracao da v2 (4,4 s + cauda de entrada). Mesma receita da v1 (base.py: fundo_fecho),
# nascendo do ultimo quadro da cauda do P43 (cortina da garrafa). Logo, mapa e CTA sao do motion.
import sys
M_='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
sys.path.insert(0, M_ + '/build/video/py')
from mx import *
p44 = plano('P44'); n = p44['F1'] - p44['F0'] + p44['nin']
r = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-sseof', '-0.2', '-i', V + '/planos/P43.mp4', '-pix_fmt', 'bgr24', '-f', 'rawvideo', '-'], capture_output=True).stdout
ref = np.frombuffer(r, np.uint8).reshape(-1, H, W, 3)[-1]
y, x = np.mgrid[0:H, 0:W].astype(np.float32)
base_cor = cv2.GaussianBlur(cv2.resize(ref, (W // 8, H // 8)), (0, 0), 6); base_cor = cv2.resize(base_cor, (W, H)).astype(np.float32)
out = V + '/planos/P44.mp4'
e = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-threads', '3',
                      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out + '.tmp.mp4'], stdin=subprocess.PIPE)
for k in range(n):
    t = k / FPS
    cx, cy = W * (0.5 + 0.06 * math.sin(t * 0.9)), H * (0.47 + 0.03 * math.cos(t * 0.7))
    rr = np.hypot((x - cx) / (W * 0.75), (y - cy) / (H * 0.55))
    glow = np.exp(-rr ** 2 * 2.2) * (0.85 + 0.15 * math.sin(t * 2.1))
    img = np.zeros((H, W, 3), np.float32) + np.array([9, 9, 12], np.float32)
    img += glow[:, :, None] * np.array([14, 26, 48], np.float32)
    img = img * 0.8 + base_cor * 0.12
    e.stdin.write(grao(np.clip(img, 0, 255).astype(np.uint8), 1.6, k).tobytes())
e.stdin.close(); e.wait(); os.replace(out + '.tmp.mp4', out)
json.dump(dict(quadros=n, F=[p44['F0'] - p44['nin'], p44['F1']], origem='gerado (fundo_fecho da v1, mais longo)', v2=True, hash='p44r1'), open(V + '/planos/_rel_p44.json', 'w'))
print('P44', n, 'quadros', [p44['F0'] - p44['nin'], p44['F1']])
