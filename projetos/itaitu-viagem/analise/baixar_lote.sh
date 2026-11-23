#!/bin/bash
# uso: baixar_lote.sh links.tsv   (cada linha: cXX<TAB>url)
B=$(dirname "$0"); cd "$B"
while IFS=$'\t' read -r c u; do
  ( curl -s --retry 3 -o src/$c.mov "$u" && echo "$c baixado $(stat -c%s src/$c.mov)" ) &
  while [ $(jobs -r | wc -l) -ge 4 ]; do sleep 1; done
done < "$1"
wait
cut -f1 "$1" | xargs -P2 -I{} ./ingest_one.sh {}
echo LOTE_FIM
