#!/bin/bash
# uso: ingest_one.sh cXX  (src/cXX.mov já baixado)
set -u
c=$1; B=$(dirname "$0"); cd "$B"
s=src/$c.mov
[ -s "$s" ] || { echo "$c sem fonte"; exit 1; }
ffprobe -v error -print_format json -show_format -show_streams "$s" > meta/$c.json
tr=$(ffprobe -v error -select_streams v:0 -show_entries stream=color_transfer -of csv=p=0 "$s")
vf="scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)':flags=bicubic,fps=30,format=yuv420p"
if [[ "$tr" == arib-std-b67 || "$tr" == smpte2084 ]]; then
  vf="zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,$vf"
fi
ffmpeg -nostdin -v error -y -i "$s" -map 0:v:0 -map 0:a:0? -vf "$vf" -c:v libx264 -preset veryfast -crf 25 -g 30 -c:a aac -b:a 128k -ac 2 proxy/$c.mp4 || echo "$c proxy falhou"
ffmpeg -nostdin -v error -y -i "$s" -map 0:a:0 -ac 2 -ar 48000 -c:a flac aud/$c.flac || echo "$c audio falhou"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 proxy/$c.mp4); d=${d%.*}; [ -z "$d" ] && d=1
# passo das imagens: até 48 quadros por folha
st=$(python3 -c "import math;print(max(1,math.ceil(($d+1)/48)))")
ffmpeg -nostdin -v error -y -i proxy/$c.mp4 -vf "fps=1/$st,scale='if(gt(iw,ih),320,-2)':'if(gt(iw,ih),-2,320)',drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='$c %{pts\:hms}':x=6:y=6:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=8x6:padding=4" -frames:v 1 -update 1 sheets/$c.jpg 2>/dev/null || true
n=$(( (d/st)+1 )); if [ $n -gt 48 ]; then :; fi
rm -f "$s"
echo "$c ok dur=${d}s passo=${st}s tr=$tr"
