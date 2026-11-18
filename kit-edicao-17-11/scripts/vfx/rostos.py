# rostos.py <arquivo.mp4> <saida.json> : caixas de rosto por quadro (YuNet, quadro inteiro + 4 ladrilhos ampliados)
import sys, json, cv2, numpy as np
MOD = '/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/editor-dados-c/modelos/face_detection_yunet_2023mar.onnx'
def detecta(im, thr=0.6):
    h, w = im.shape[:2]; bx = []
    tiles = [(0, 0, w, h, 0.5)] + [(x0, y0, x0 + w // 2 + 100, y0 + h // 2 + 100, 1.0) for x0 in (0, w // 2 - 100) for y0 in (0, h // 2 - 100)]
    for (x0, y0, x1, y1, sc) in tiles:
        sub = im[y0:y1, x0:x1]
        if sc != 1.0: sub = cv2.resize(sub, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
        d = cv2.FaceDetectorYN.create(MOD, '', (sub.shape[1], sub.shape[0]), thr, 0.3, 200)
        _, r = d.detect(sub)
        for f in (r if r is not None else []):
            x, y, ww, hh = f[:4] / sc; bx.append([int(x0 + x), int(y0 + y), int(x0 + x + ww), int(y0 + y + hh), round(float(f[-1]), 2)])
    return bx
if __name__ == '__main__':
    f, out = sys.argv[1], sys.argv[2]; passo = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    cap = cv2.VideoCapture(f); R = []; k = 0
    while True:
        ok, im = cap.read()
        if not ok: break
        R.append(detecta(im) if k % passo == 0 else None); k += 1
    json.dump(R, open(out, 'w')); print(f, k, 'quadros', sum(1 for b in R if b), 'com rosto')
