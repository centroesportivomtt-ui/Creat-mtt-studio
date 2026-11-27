#!/bin/bash
# processa, em ordem, todo src/cXX.mov que ainda não tem folha; termina quando não houver mais e existir o arquivo FIM
B=$(dirname "$0"); cd "$B"
while true; do
  pend=$(for f in src/c??.mov; do [ -e "$f" ] || continue; c=$(basename $f .mov); grep -q "^$c ok" logs/fila.done 2>/dev/null || pgrep -f "ingest_one.sh $c\$" >/dev/null || echo $c; done)
  if [ -z "$pend" ]; then [ -e FIM ] && break; sleep 5; continue; fi
  echo "$pend" | head -2 | xargs -P2 -I{} sh -c './ingest_one.sh {} >> logs/fila.done 2>&1'
done
echo FILA_FIM >> logs/fila.done
