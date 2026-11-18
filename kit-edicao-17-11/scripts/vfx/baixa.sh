#!/bin/bash
# baixa.sh <clip>: baixa o bruto do Drive para build/vfx/raw/<clip>.mov (idempotente; confere o tamanho da lista)
M=/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/maxima
clip=$1; out=$M/build/vfx/raw/$clip.mov
id=$(awk -F'\t' -v c=$clip '$2==c{print $1}' $M/tools/lista.tsv); sz=$(awk -F'\t' -v c=$clip '$2==c{print $3}' $M/tools/lista.tsv)
[ -f "$out" ] && [ "$(stat -c %s "$out")" = "$sz" ] && { echo "$clip ja baixado"; exit 0; }
free=$(df --output=avail -B1 / | tail -1); need=$((sz + 1200000000))
[ "$free" -lt "$need" ] && { echo "disco curto para $clip ($free livres)"; exit 2; }
curl -sS -L --retry 3 -o "$out.part" "https://drive.usercontent.google.com/download?id=$id&export=download&confirm=t" || exit 1
got=$(stat -c %s "$out.part"); [ "$got" = "$sz" ] || { echo "tamanho errado $got != $sz"; head -c 300 "$out.part"; exit 3; }
mv "$out.part" "$out"; echo "$clip ok $got"
