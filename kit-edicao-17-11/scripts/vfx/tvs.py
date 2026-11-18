# tvs.py: acha as telas das TVs (retangulos claros dentro de moldura preta) num quadro. Devolve lista de quadrilateros (4 pontos TL,TR,BR,BL).
import cv2, numpy as np
def ordena(q):
    q = np.array(q, np.float32); s = q.sum(1); d = q[:, 0] - q[:, 1]
    return np.array([q[np.argmin(s)], q[np.argmax(d)], q[np.argmax(s)], q[np.argmin(d)]], np.float32)
def telas1(im, esc=1.0, y0=0.30, y1=0.72, amin=40000, thr=60):
    h, w = im.shape[:2]; hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); v = cv2.GaussianBlur(hsv[:, :, 2], (0, 0), 1.2 * esc)
    pre = (v < thr).astype(np.uint8); pre = cv2.morphologyEx(pre, cv2.MORPH_CLOSE, np.ones((int(5 * esc) | 1, int(5 * esc) | 1), np.uint8))
    cs, hi = cv2.findContours(pre, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE); out = []
    if hi is None: return out
    for c, hh in zip(cs, hi[0]):
        if hh[3] < 0: continue                      # so buracos (tela dentro da moldura preta)
        a = cv2.contourArea(c)
        if a < amin * esc * esc: continue
        x, y, ww, hh_ = cv2.boundingRect(c)
        if not (y0 * h < y + hh_ / 2 < y1 * h) or ww / hh_ > 0.85 or ww / hh_ < 0.35: continue
        hull = cv2.convexHull(c)
        if a / cv2.contourArea(hull) < 0.9: continue
        ap = cv2.approxPolyDP(hull, 0.03 * cv2.arcLength(hull, True), True)
        if len(ap) != 4: ap = cv2.boxPoints(cv2.minAreaRect(hull)).reshape(-1, 1, 2)
        q = ordena(ap.reshape(4, 2))
        if abs(q[1, 1] - q[0, 1]) > 0.14 * abs(q[1, 0] - q[0, 0]) or abs(q[2, 1] - q[3, 1]) > 0.14 * abs(q[2, 0] - q[3, 0]): continue      # tela de TV nao e torta
        m = cv2.mean(hsv[:, :, 2], mask=cv2.fillConvexPoly(np.zeros((h, w), np.uint8), q.astype(np.int32), 255))[0]
        if m < 110: continue
        out.append(q)
    return sorted(out, key=lambda q: q[:, 0].mean())
def iou(a, b):
    ax0, ay0, ax1, ay1 = a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max(); bx0, by0, bx1, by1 = b[:, 0].min(), b[:, 1].min(), b[:, 0].max(), b[:, 1].max()
    iw = max(0, min(ax1, bx1) - max(ax0, bx0)); ih = max(0, min(ay1, by1) - max(ay0, by0)); i = iw * ih
    return i / max(1e-6, (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - i)
def telas(im, esc=1.0, **kw):
    out = []
    for thr in (60, 80, 100):
        for q in telas1(im, esc, thr=thr, **kw):
            if all(iou(q, o) < 0.5 for o in out): out.append(q)
    return sorted(out, key=lambda q: q[:, 0].mean())
def segue(a, b, quad):
    """leva o quadrilatero do quadro a (cinza) para o b por LK + afim parcial; None se falhar"""
    m = cv2.fillConvexPoly(np.zeros(a.shape, np.uint8), quad.astype(np.int32), 255)
    p = cv2.goodFeaturesToTrack(a, 120, 0.01, 6, mask=m)
    if p is None or len(p) < 8: return None
    q, st, _ = cv2.calcOpticalFlowPyrLK(a, b, p, None, winSize=(31, 31), maxLevel=4); ok = st.ravel() == 1
    if ok.sum() < 8: return None
    A, inl = cv2.estimateAffinePartial2D(p[ok], q[ok], method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if A is None or inl.sum() < 6: return None
    return (np.hstack([quad, np.ones((4, 1), np.float32)]) @ A.T).astype(np.float32)
def trilhas(F):
    """trilhas das TVs ao longo dos quadros F (BGR). devolve lista de dict quadro->quad"""
    G = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in F]; D = [telas(f) for f in F]; h, w = G[0].shape; T = []
    def dentro(q): return q[:, 0].max() > 40 and q[:, 0].min() < w - 40
    for f in range(len(F)):
        for d in D[f]:
            if any(f in t and iou(t[f], d) > 0.35 for t in T): continue
            t = {f: d}; cur = d
            for g in range(f + 1, len(F)):                 # para frente
                nx = segue(G[g - 1], G[g], cur)
                if nx is None or not dentro(nx): break
                m = [x for x in D[g] if iou(x, nx) > 0.5]
                cur = (0.5 * nx + 0.5 * m[0]) if m else nx; t[g] = cur
            cur = d
            for g in range(f - 1, -1, -1):                 # para tras
                nx = segue(G[g + 1], G[g], cur)
                if nx is None or not dentro(nx): break
                cur = nx; t[g] = cur
            T.append(t)
    return T
if __name__ == '__main__':
    cap = cv2.VideoCapture('/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/video/planos/P11.mp4'); F = []
    while True:
        ok, im = cap.read()
        if not ok: break
        F.append(im)
    T = trilhas(F)
    for t in T:
        ks = sorted(t); print('trilha', ks[0], ks[-1], len(ks), [(k, int(t[k][:, 0].min()), int(t[k][:, 1].min()), int(t[k][:, 0].max()), int(t[k][:, 1].max())) for k in ks[::max(1, len(ks) // 6)]])
    d = np.load('/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima/build/vfx/src/tv4k/tv4k_frames.npz')
    for i in d.files: print('4k', i, [q.astype(int).tolist() for q in telas(d[i], esc=2.0)])
