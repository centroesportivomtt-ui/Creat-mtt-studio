"""Processo filho do ouvido fino (onda 4, D41): `nice -n 10 python -m motor.etapas.escuta_filho <tarefa.json>`.

Carrega o modelo UMA vez e transcreve arquivo por arquivo, por trechos de energia, com as funções de
`ferramentas/retranscrever.py` (`trechos_por_energia`, `transcrever_trechos`, `em_laco`). Imprime uma linha JSON por arquivo
pronto (`{"id", "segmentos", "trechos", "segundos"}`) para o pai gravar na hora: se o filho morrer no meio (memória, tempo),
o que já saiu fica fino. Não grava nada no armazenamento e não fala com ninguém (o ambiente vem sem segredo).

Tarefa: {"modelo", "threads", "beam", "pausa", "arquivos": [{"id", "wav", "energia", "dur", "limiar", "dicas"}]}.
Códigos: 0 ok; 3 sem faster-whisper; 5 o modelo não carregou (não baixou, disco); 2 outro erro.
"""
from __future__ import annotations

import json
import pathlib
import sys
import time


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("uso: python -m motor.etapas.escuta_filho <tarefa.json>", file=sys.stderr)
        return 2
    try:
        tarefa = json.loads(pathlib.Path(argv[1]).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"tarefa ilegível: {type(e).__name__}", file=sys.stderr)
        return 2
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("sem faster-whisper", file=sys.stderr)
        return 3
    import numpy as np
    from motor.ferramentas import retranscrever as R
    from motor.provedores.transcricao_fw import ler_16k
    t0 = time.monotonic()
    try:
        m = WhisperModel(str(tarefa["modelo"]), device="cpu", compute_type="int8", cpu_threads=int(tarefa.get("threads") or 1))
    except Exception as e:  # noqa: BLE001 - modelo que não baixa ou não cabe no disco: o pai fica com a transcrição rápida
        print(f"modelo não carregou: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
        return 5
    print(json.dumps({"carregado": str(tarefa["modelo"]), "s": round(time.monotonic() - t0, 2)}), flush=True)
    falhou = False
    for arq in tarefa.get("arquivos") or []:
        t1 = time.monotonic()
        try:
            db = np.load(arq["energia"])
            trechos = R.trechos_por_energia(db, float(arq["dur"]), float(arq.get("limiar", -38.0)), float(tarefa.get("pausa", 0.6)))
            audio = ler_16k(pathlib.Path(arq["wav"]))
            segs = R.transcrever_trechos(m, audio, trechos, arq.get("dicas"), beam_size=int(tarefa.get("beam") or 5))
        except Exception as e:  # noqa: BLE001 - um arquivo ruim não derruba os outros; o pai mantém a transcrição rápida dele
            print(f"{arq.get('id')}: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
            falhou = True
            continue
        print(json.dumps({"id": arq["id"], "segmentos": segs, "trechos": len(trechos), "segundos": round(time.monotonic() - t1, 2)},
                         ensure_ascii=False), flush=True)
    return 2 if falhou else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
