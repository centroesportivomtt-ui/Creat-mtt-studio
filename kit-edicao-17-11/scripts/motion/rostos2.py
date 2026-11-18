# Mapa de rostos da linha v2 (5 qps) com YuNet sobre a base de conferência 540x960 (ampliada 2x): build/motion2/rostos.json = [{t, rostos:[[x,y,w,h],...]}] em px 1080x1920
import subprocess, numpy as np, cv2, json, os, sys
M='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima'
MOD='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/editor-dados-c/modelos/face_detection_yunet_2023mar.onnx'
out=M+'/build/motion2/rostos.json'
if os.path.exists(out): sys.exit(0)
p=subprocess.Popen(['ffmpeg','-v','error','-i',M+'/build/motion2/prev/base540.mp4','-vf','fps=5','-f','rawvideo','-pix_fmt','bgr24','-'],stdout=subprocess.PIPE)
d=cv2.FaceDetectorYN.create(MOD,'',(540,960),0.6,0.3,200)
k=0;res=[]
while True:
    b=p.stdout.read(540*960*3)
    if len(b)<540*960*3: break
    im=np.frombuffer(b,np.uint8).reshape(960,540,3)
    _,r=d.detect(im)
    fs=[[int(f[0]*2),int(f[1]*2),int(f[2]*2),int(f[3]*2)] for f in (r if r is not None else [])]
    res.append(dict(t=k/5,rostos=fs)); k+=1
json.dump(res,open(out,'w')); print('rostos',k,sum(1 for r in res if r['rostos']))
