"""Worker do motor: pega jobs da fila, roda a etapa, encadeia a próxima.

uso:  python -m motor.worker                 (todas as etapas, roda para sempre)
      python -m motor.worker --ate-ocioso    (sai quando a fila esvazia: testes de aceitação)
      python -m motor.worker --etapas ingest,analise
Rode com nice -n 5 (a máquina é dividida). Vários workers podem rodar ao mesmo tempo (a fila é atômica).

Na nuvem (deploy/modal_app.py) o worker é SEM ESTADO LOCAL (EDITOR_SEM_ESTADO=1): fila e eventos no Postgres, arquivos
no R2, disco só como rascunho (/tmp). `checar_sem_estado` recusa subir se faltar um dos dois, e `acordar_remoto` dispara
a função Modal `trabalhar` (worker até ocioso) quando a API enfileira algo (EDITOR_MODAL_WORKER=1).
"""
from __future__ import annotations

import argparse
import logging
import os
import socket
import threading
import time
import traceback

from motor import banco, config, pipeline
from motor.etapas import Contexto, ErroDefinitivo, carregar_todas, obter
from motor.provedores import armazenamento_de

log = logging.getLogger("motor.worker")
APP_MODAL = os.environ.get("EDITOR_MODAL_APP", "editor-motor").strip() or "editor-motor"


class _Batimento:
    """Renova o aluguel do job numa thread (conexão própria) enquanto a etapa roda. Assim o aluguel pode ser curto
    (banco.ALUGUEL_S) e um job de worker morto (kill -9, reinício) volta à fila em ~2 min, não em 10."""

    def __init__(self, cfg, job_id: str, intervalo: float | None = None):
        self.cfg, self.job_id = cfg, job_id
        self.intervalo = intervalo or max(5.0, banco.ALUGUEL_S / 4)
        self._parar = threading.Event()
        self._t = threading.Thread(target=self._rodar, daemon=True)

    def _rodar(self):
        con = None
        try:
            con = banco.conectar(self.cfg.banco)
            while not self._parar.wait(self.intervalo):
                try:
                    banco.renovar(con, self.job_id)
                except Exception:  # noqa: BLE001 - banco ocupado: tenta no próximo batimento
                    pass
        except Exception:  # noqa: BLE001
            pass
        finally:
            if con is not None:
                con.close()

    def __enter__(self):
        self._t.start()
        return self

    def __exit__(self, *exc):
        self._parar.set()
        self._t.join(timeout=5)


def _transacao(con, fn):
    """Tudo ou nada. No Postgres o adaptador (banco_pg) traduz BEGIN IMMEDIATE para BEGIN + trava consultiva."""
    con.execute("BEGIN IMMEDIATE")
    try:
        r = fn()
        con.execute("COMMIT")
        return r
    except BaseException:
        con.execute("ROLLBACK")
        raise


def recolher_mortos(con) -> int:
    """Jobs cujo worker morreu em todas as tentativas: 'falhou' + projeto no estado certo, numa transação só."""
    def fazer():
        mortos = banco.recolher_mortos(con)
        for j in mortos:
            banco.emitir(con, j["projeto"], "etapa_erro", etapa=j["etapa"], alvo=None if j.get("alvo") == "-" else j.get("alvo"),
                         mensagem=j["erro"] + " (desistiu)")
            pipeline.falha_definitiva(con, j, j["erro"])
        return len(mortos)
    return _transacao(con, fazer)


def rodar_um(con, cfg, arm, dono: str, etapas=None) -> bool:
    recolher_mortos(con)
    job = banco.pegar(con, dono, etapas)
    if not job:
        return False
    proj, et, alvo = job["projeto"], job["etapa"], job.get("alvo")
    alvo_ev = None if alvo == "-" else alvo
    banco.emitir(con, proj, "etapa_inicio", etapa=et, alvo=alvo_ev)
    t0 = time.time()
    try:
        with _Batimento(cfg, job["id"]):
            saida = obter(et)(Contexto(con=con, cfg=cfg, job=job, armazenamento=arm)) or {}

        def fechar():   # concluir + evento + próxima etapa: tudo ou nada (reinício no meio não perde o encadeamento)
            banco.concluir(con, job["id"], saida)
            banco.emitir(con, proj, "etapa_fim", etapa=et, alvo=alvo_ev, dados={"s": round(time.time() - t0, 2)})
            pipeline.depois(con, job, saida)
        _transacao(con, fechar)
    except ErroDefinitivo as e:
        def desistir():
            con.execute("UPDATE jobs SET max_tentativas=tentativas WHERE id=?", (job["id"],))
            banco.falhar(con, job["id"], str(e))
            banco.emitir(con, proj, "etapa_erro", etapa=et, alvo=alvo_ev, mensagem=str(e)[:300])
            pipeline.falha_definitiva(con, job, str(e))
        _sair_de_transacao(con)
        _transacao(con, desistir)
    except Exception as e:  # noqa: BLE001 - qualquer falha volta para a fila
        def registrar():
            estado = banco.falhar(con, job["id"], traceback.format_exc())
            banco.emitir(con, proj, "etapa_erro", etapa=et, alvo=alvo_ev,
                         mensagem=f"{type(e).__name__}: {str(e)[:200]} ({'vai tentar de novo' if estado == 'pendente' else 'desistiu'})")
            if estado == "falhou":
                pipeline.falha_definitiva(con, job, f"{type(e).__name__}: {str(e)[:200]}")
        _sair_de_transacao(con)
        _transacao(con, registrar)
    return True


def _sair_de_transacao(con) -> None:
    """Uma etapa que quebrou no meio de uma transação própria não pode deixar a conexão presa nela."""
    if con.in_transaction:
        try:
            con.execute("ROLLBACK")
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------- nuvem (sem estado local)
def _eh_postgres(destino) -> bool:
    return isinstance(destino, str) and destino.startswith(("postgres://", "postgresql://"))


def checar_sem_estado(cfg) -> list[str]:
    """Com EDITOR_SEM_ESTADO=1 (contêiner da Modal: o disco some a cada reinício), recusa subir se algum estado ainda
    iria para o disco local. Devolve os avisos (não fatais); levanta RuntimeError com a lista do que falta."""
    if os.environ.get("EDITOR_SEM_ESTADO", "") != "1":
        return []
    faltas, avisos = [], []
    if cfg.provedor_efetivo("armazenamento") != "r2":
        faltas.append("armazenamento não é o R2 (EDITOR_ARMAZENAMENTO=r2 + R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)")
    if not _eh_postgres(cfg.banco):
        faltas.append("banco não é o Postgres (EDITOR_BANCO=postgres + DATABASE_URL)")
    if not (cfg.motor_token or "").strip():
        faltas.append("MOTOR_TOKEN vazio (o motor fica na internet)")
    if faltas:
        raise RuntimeError("motor sem estado local (EDITOR_SEM_ESTADO=1) recusou subir: " + "; ".join(faltas))
    if not os.environ.get("EDITOR_MEMORIA"):
        avisos.append("EDITOR_MEMORIA vazio: a memória (regras do dono) iria para dentro da imagem e se perderia")
    for a in avisos:
        log.warning(a)
    return avisos


_DISPARO = {"ultimo": 0.0, "timer": None}
_TRAVA_DISPARO = threading.Lock()


def _pendentes(cfg) -> int:
    con = banco.conectar(cfg.banco)
    try:
        r = con.execute("SELECT COUNT(*) AS n FROM jobs WHERE estado='pendente'").fetchone()
        try:
            return int(r["n"])
        except (TypeError, KeyError, IndexError):
            return int(r[0])
    finally:
        con.close()


def _spawn_trabalhar() -> None:
    import modal   # só existe no contêiner da Modal (ou com o extra 'modal')
    modal.Function.from_name(APP_MODAL, "trabalhar").spawn()


def acordar_remoto(cfg, *, contar=None, spawn=None) -> bool:
    """Com EDITOR_MODAL_WORKER=1, dispara a função `trabalhar` se há job pendente. No máximo um disparo a cada
    EDITOR_MODAL_WORKER_INTERVALO s (padrão 15); dentro do intervalo, agenda UMA nova checagem para o fim dele
    (um job que chega logo depois de um worker sair não espera o agendamento de segurança). Nunca levanta."""
    if os.environ.get("EDITOR_MODAL_WORKER", "") != "1":
        return False
    contar = contar or _pendentes
    spawn = spawn or _spawn_trabalhar
    intervalo = float(os.environ.get("EDITOR_MODAL_WORKER_INTERVALO", "15") or 15)
    with _TRAVA_DISPARO:
        falta = _DISPARO["ultimo"] + intervalo - time.monotonic()
        if falta > 0:
            if _DISPARO["timer"] is None:
                def depois():
                    with _TRAVA_DISPARO:
                        _DISPARO["timer"] = None
                    acordar_remoto(cfg, contar=contar, spawn=spawn)
                t = threading.Timer(falta + 0.05, depois)
                t.daemon = True
                _DISPARO["timer"] = t
                t.start()
            return False
    try:
        if contar(cfg) <= 0:
            return False
        with _TRAVA_DISPARO:
            _DISPARO["ultimo"] = time.monotonic()
        spawn()
        return True
    except Exception as e:  # noqa: BLE001 - o agendamento de segurança (modal.Period) recolhe depois
        with _TRAVA_DISPARO:
            _DISPARO["ultimo"] = 0.0
        log.warning("não consegui acordar o worker na Modal (%s: %s)", type(e).__name__, e)
        return False


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ate-ocioso", action="store_true")
    ap.add_argument("--etapas", default="")
    ap.add_argument("--espera", type=float, default=1.0)
    a = ap.parse_args(argv)
    cfg = config.carregar()
    checar_sem_estado(cfg)
    if cfg.nice:
        try:
            os.nice(cfg.nice)
        except OSError:
            pass
    con = banco.conectar(cfg.banco)
    arm = armazenamento_de(cfg)
    carregar_todas()
    try:
        n = pipeline.reconciliar(con)
        if n:
            print(f"[worker] reconciliou {n} projeto(s) parado(s) depois de reinício", flush=True)
    except Exception:  # noqa: BLE001 - reconciliar é ajuda, nunca impede o worker de subir
        traceback.print_exc()
    dono = f"{socket.gethostname()}:{os.getpid()}"
    etapas = [e for e in a.etapas.split(",") if e] or None
    while True:
        if not rodar_um(con, cfg, arm, dono, etapas):
            if a.ate_ocioso:
                return 0
            time.sleep(a.espera)


if __name__ == "__main__":
    raise SystemExit(main())
