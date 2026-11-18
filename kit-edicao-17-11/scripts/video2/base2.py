# base2.py: base da v2 = planos v2 + transicoes do contrato v2 + placas VFX (opacas) -> build/video/base_v2.mp4 (sem texto).
# Reaproveita as transicoes do py/base.py da v1. Novidades: tipo_base, relampago_real (pico do I04 segurado 2 quadros),
# whip_vertical e sinal ficam por conta das placas (V07, V04), P12->P55 sem quadro de fusao, P56->P13 sem negativo (ambar da V04).
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/../py')
from base import *
import base as B1
VF = json.load(open(M + '/build/vfx/vfx.json')); VF = {k: v for k, v in VF.items() if k != '_geral'}
B1.LUMA_MODO.update({('P30', 'P60'): 'escuro'})

# ---- correcao 1 (rodada 2)
AZUL = ('P17', 'P19', 'P51', 'P20', 'P21')       # hora azul: ciano/azul saturado alem da fonte -> -28% de saturacao so nos azuis (pele intacta)
def desat_azul(img, k=0.28):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV); h = hsv[:, :, 0].astype(np.float32)
    w = np.clip((h - 78) / 10, 0, 1) * np.clip((138 - h) / 10, 0, 1)          # H do OpenCV: ciano 90, azul 120
    hsv[:, :, 1] = np.clip(hsv[:, :, 1].astype(np.float32) * (1 - k * w), 0, 255).astype(np.uint8)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
class LeitorAzul(Leitor):
    def get(self, g):
        g0 = self.g; f_ = Leitor.get(self, g)
        if self.g != g0 or getattr(self, 'az', None) is None: self.az = desat_azul(f_)
        return self.az
def espelho_cheio(img, k, n):
    """espelho da sala de pose em TELA CHEIA: o quadro recua e se multiplica em 3x3 copias espelhadas (lados e cima/baixo), sem faixa
    escura e SEM congelar (o plano segue rodando por baixo); zoom continuo do primeiro ao ultimo quadro"""
    u = (k + 0.5) / n
    abre = float(ss(u / 0.25) * (1 - ss((u - 0.78) / 0.22)))
    sc = 1.0 - 0.40 * abre + 0.035 * abre * (u - 0.5)
    fh = cv2.flip(img, 1); meio = np.hstack([fh, img, fh]); pta = cv2.flip(meio, 0)
    larga = np.vstack([pta, meio, pta])
    for x in (W, 2 * W): larga[:, x - 2:x + 2] = np.clip(larga[:, x - 2:x + 2].astype(np.int16) + 60, 0, 255).astype(np.uint8)
    for y in (H, 2 * H): larga[y - 2:y + 2] = np.clip(larga[y - 2:y + 2].astype(np.int16) + 60, 0, 255).astype(np.uint8)
    M_ = np.float32([[sc, 0, W / 2 - sc * 1.5 * W], [0, sc, H / 2 - sc * 1.5 * H]])
    o = cv2.warpAffine(larga, M_, (W, H), flags=cv2.INTER_AREA if sc < 0.8 else cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    fl = math.exp(-(k / 1.3) ** 2) * 0.85
    return np.clip(o * (1 - fl) + 255 * fl, 0, 255).astype(np.uint8)

def luma_rosto(A, B, u):
    """P16 -> P17 (correcao 2): a transicao por luminancia abria buracos no ROSTO do cliente (pele clara some antes da sombra).
    Agora e uma fusao limpa com um sopro de luz no meio (escritorio claro -> rua azul), sem recorte nenhum sobre a pele."""
    a = min(max(u, 0.0), 1.0); a = a * a * (3 - 2 * a)
    o = A.astype(np.float32) * (1 - a) + B.astype(np.float32) * a
    k = 0.20 * math.sin(math.pi * min(max(u, 0.0), 1.0)) ** 2
    return np.clip(o + (255 - o) * k, 0, 255).astype(np.uint8)

class LeitorV:
    def __init__(self, k, v):
        self.g0, self.g1 = v['g0'], v['g1']
        self.proc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2', '-i', f'{M}/build/vfx/{k}.mp4', '-pix_fmt', 'bgr24', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, bufsize=W * H * 6)
        self.g = self.g0 - 1; self.cur = None
    def get(self, g):
        while self.g < g:
            b = self.proc.stdout.read(W * H * 3)
            if len(b) < W * H * 3: raise SystemExit('placa curta em g %d' % g)
            self.cur = np.frombuffer(b, np.uint8).reshape(H, W, 3); self.g += 1
        return self.cur
    def fecha(self): self.proc.stdout.close(); self.proc.kill()

def enc2(path):
    return subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                             '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-g', '30', '-threads', '3',
                             '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', path], stdin=subprocess.PIPE)

if __name__ == '__main__':
    PL = [p for p in planos() if p['id'].startswith('P')]; INS = [p for p in planos() if p['id'].startswith('I')]
    T = {tuple(t['entre']): t for t in E['transicoes']}
    fz = next(gx for gx in E['graficos'] if gx['modelo'] == 'freeze_espelho'); FZ0, FZ1 = fr(fz['t0']), fr(fz['t1'])
    sacode = {}
    for (a, b), t in T.items():
        if t['tipo'] == 'impact' and 'tremida' in t.get('nota', ''):
            C = fr(t['corte_t']); n = fr(t['dur'] / 2); rng = np.random.default_rng(3)
            for i in range(3): sacode[C + n + i] = (rng.uniform(-1, 1) * 26 * (1 - i / 3), rng.uniform(-1, 1) * 18 * (1 - i / 3))
    G0, G1 = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (0, NT)
    out = V + '/base_v2.mp4' if (G0, G1) == (0, NT) else f'{V}/chk2/base2_{G0}_{G1}.mp4'; tmp = out + '.tmp.mp4'; e = enc2(tmp)
    abertos = {}; vab = {}; whip_k = {}; log = []
    for (a, b), t in T.items():
        if t['tipo'] == 'whip': whip_k[(a, b)] = len(whip_k)
    def L(p):
        if p['id'] not in abertos: abertos[p['id']] = (LeitorAzul if p['id'] in AZUL else Leitor)(p)
        return abertos[p['id']]
    for g in range(G0, G1):
        vk = next((k for k, v in VF.items() if v['g0'] <= g < v['g1']), None)
        if vk:
            if vk not in vab: vab[vk] = LeitorV(vk, VF[vk])
            img = vab[vk].get(g)
        else:
            i = next(j for j, p in enumerate(PL) if p['F0'] <= g < p['F1'])
            p = PL[i]; img = None
            for A, B in ((PL[i - 1] if i else None, p), (p, PL[i + 1] if i + 1 < len(PL) else None)):
                if A is None or B is None: continue
                par = (A['id'], B['id']); t = T.get(par)
                if not t or t['dur'] <= 0: continue
                C = B['F0']; n = B['nin']
                if not (C - n <= g < C + n): continue
                tipo = t['tipo']; tb = t.get('tipo_base', tipo)
                if tipo in ('whip_vertical', 'sinal'): break                      # placas V07 e V04
                if tipo == 'relampago_real':                                       # pico real do I04 segurado n quadros; depois abre em Valente
                    img = L(A).get(g) if g < C + n else L(B).get(g); log.append((g, 'relampago', 'A')); break
                if par == ('P12', 'P55'):                                          # acelera e trava: sem quadro de fusao
                    u = (g - (C - n) + 0.5) / (2 * n); img = blur_dir(L(A).get(g), 40 * math.sin(math.pi * u)) if g < C else L(B).get(g); break
                if par == ('P56', 'P13'):                                          # os 2 quadros ambar ja estao na V04: sem negativo
                    img = L(A).get(g) if g < C else L(B).get(g); break
                if par == ('P16', 'P17'):                                          # rosto do cliente protegido: some por ultimo, sem manchas
                    img = luma_rosto(L(A).get(g), L(B).get(g), (g - (C - n) + 0.5) / (2 * n)); break
                t2 = dict(t); t2['tipo'] = tb
                img = transicao(t2, L(A).get(g), L(B).get(g), g, C, n, whip_k.get(par, 0)); break
            if img is None: img = L(p).get(g)
            for q in INS:
                if q['F0'] <= g < q['F1']: img = L(q).get(g)
            if FZ0 <= g < FZ1: img = espelho_cheio(img, g - FZ0, FZ1 - FZ0)
            if g in sacode: img = desloca(img, *sacode[g])
        e.stdin.write(np.ascontiguousarray(img).tobytes())
        for pid in list(abertos):
            q = next(x for x in PL + INS if x['id'] == pid)
            if g >= q['F1'] + q['nout']: abertos.pop(pid).fecha()
        for k in list(vab):
            if g >= VF[k]['g1'] - 1: vab.pop(k).fecha()
        if g % 300 == 0: print('quadro', g, '/', NT, flush=True)
    e.stdin.close(); e.wait(); os.replace(tmp, out)
    if (G0, G1) == (0, NT): progresso('montagem: base_v2.mp4 emendado (%d quadros, planos v2 + transicoes + placas VFX)' % NT)
    print('base2 ok', out)
