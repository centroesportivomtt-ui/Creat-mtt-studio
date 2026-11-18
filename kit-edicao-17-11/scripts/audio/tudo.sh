#!/bin/bash
# Refaz todo o audio v2 (idempotente). Ordem: df (janelas novas) -> df do P63 -> vad -> voz -> amb -> sfx -> trilha -> mix -> transcricoes
set -e; cd "$(dirname "$0")/.."
python3 py/df_run2.py; python3 py/df_p63.py; python3 py/vad.py >/dev/null; python3 py/voz.py; python3 py/amb.py; python3 py/sfx.py; python3 py/trilha.py; python3 py/mix.py
python3 py/transc.py mix.wav tr_mix.json > tr_mix.log 2>/dev/null; python3 py/transc.py amb.wav tr_amb.json > tr_amb.log 2>/dev/null; python3 py/prova_final.py
