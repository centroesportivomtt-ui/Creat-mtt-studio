"""Worker do motor: pega jobs da fila, roda a etapa, encadeia a próxima.

uso:  python -m motor.worker                 (todas as etapas, roda para sempre)
      python -m motor.worker --ate-ocioso    (sai quando a fila esvazia: testes de aceitação)
      python -m motor.worker --etapas ingest,analise
Rode com nice -n 5 (a máquina é dividida). Vários workers podem rodar ao mesmo tempo (a fila é atômica).
"""
from __future__ import annotations

import argparse
import os
import socket
import time
import traceback

from motor import banco, config, pipeline
from motor.etapas import Contexto, ErroDefinitivo, carregar_todas, obter
from motor.provedores import armazenamento_de


def rodar_um(con, cfg, arm, dono: str, etapas=None) -> bool:
    job = banco.pegar(con, dono, etapas)
    if not job:
        return False
    proj, et, alvo = job["projeto"], job["etapa"], job.get("alvo")
    banco.emitir(con, proj, "etapa_inicio", etapa=et, alvo=None if alvo == "-" else alvo)
    t0 = time.time()
    try:
        saida = obter(et)(Contexto(con=con, cfg=cfg, job=job, armazenamento=arm)) or {}
        banco.concluir(con, job["id"], saida)
        banco.emitir(con, proj, "etapa_fim", etapa=et, alvo=None if alvo == "-" else alvo, dados={"s": round(time.time() - t0, 2)})
        pipeline.depois(con, job, saida)
    except ErroDefinitivo as e:
        con.execute("UPDATE jobs SET max_tentativas=tentativas WHERE id=?", (job["id"],))
        banco.falhar(con, job["id"], str(e))
        banco.emitir(con, proj, "etapa_erro", etapa=et, mensagem=str(e)[:300])
    except Exception as e:  # noqa: BLE001 - qualquer falha volta para a fila
        estado = banco.falhar(con, job["id"], traceback.format_exc())
        banco.emitir(con, proj, "etapa_erro", etapa=et, mensagem=f"{type(e).__name__}: {str(e)[:200]} ({'vai tentar de novo' if estado == 'pendente' else 'desistiu'})")
    return True


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ate-ocioso", action="store_true")
    ap.add_argument("--etapas", default="")
    ap.add_argument("--espera", type=float, default=1.0)
    a = ap.parse_args(argv)
    cfg = config.carregar()
    if cfg.nice:
        try:
            os.nice(cfg.nice)
        except OSError:
            pass
    con = banco.conectar(cfg.banco)
    arm = armazenamento_de(cfg)
    carregar_todas()
    dono = f"{socket.gethostname()}:{os.getpid()}"
    etapas = [e for e in a.etapas.split(",") if e] or None
    while True:
        if not rodar_um(con, cfg, arm, dono, etapas):
            if a.ate_ocioso:
                return 0
            time.sleep(a.espera)


if __name__ == "__main__":
    raise SystemExit(main())
