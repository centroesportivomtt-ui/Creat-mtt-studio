#!/usr/bin/env bash
# Pipeline completo do demo: checar regras -> folha de contato -> render 1080x1920 -> som -> overlay com alfa.
# uso: bash ferramentas/demo.sh [pasta_de_saida]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-saida}"; mkdir -p "$OUT"
node ferramentas/checar.cjs cenas/demo.json --json "$OUT/checar.json"
node ferramentas/render.cjs cenas/demo.json --folha --out "$OUT/folha.jpg"
node ferramentas/render.cjs cenas/demo.json --out "$OUT/demo_mudo.mp4"
node ferramentas/som.cjs --video "$OUT/demo_mudo.mp4" --cues "$OUT/demo_mudo.cues.json" --comp cenas/demo.json --out "$OUT/creatMTT-MOTION-KIT-DEMO.mp4"
node ferramentas/render.cjs cenas/demo.json --alfa prores --de 2.45 --ate 7.0 --out "$OUT/overlay_legenda_chip_hud.mov"
