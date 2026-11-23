#!/bin/bash
B=$(dirname "$0"); cd "$B"
while IFS=$'\t' read -r c u; do
  ( curl -s --retry 3 -o src/$c.mov.part "$u" && mv src/$c.mov.part src/$c.mov && echo "$c baixado" ) &
  while [ $(jobs -r | wc -l) -ge 4 ]; do sleep 1; done
done < "$1"; wait; echo BAIXOU_FIM
