#!/bin/bash
cd "$(dirname "$0")"
while true; do
  todo=$(for f in aud/c??.flac; do c=$(basename $f .flac); grep -q "^$c ok" logs/fila.done logs/lote1.log 2>/dev/null && [ ! -e ana/$c.json ] && echo $c; done)
  [ -n "$todo" ] && nice -n 15 python3 analisar_audio.py $todo >> logs/audio.log 2>&1
  if grep -q FILA_FIM logs/fila.done 2>/dev/null && [ -z "$todo" ]; then echo AUDIO_FIM >> logs/audio.log; break; fi
  sleep 20
done
