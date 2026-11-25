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
import threading
import time
import traceback

from motor import banco, config, pipeline
from motor.etapas import Contexto, ErroDefinitivo, carregar_todas, obter, passos
from motor.provedores import armazenamento_de


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
            alvo = None if j.get("alvo") == "-" else j.get("alvo")
            nums = passos.numeros_do_job(con, j)
            banco.emitir(con, j["projeto"], "etapa_erro", etapa=j["etapa"], alvo=alvo,
                         mensagem=passos.frase_erro(j["etapa"], n=nums.get("n"), versao=nums.get("versao"), e=j["erro"] or "", vai_tentar=False),
                         dados={"detalhe": (j["erro"] or "")[:300] + " (desistiu)", "vai_tentar": False})
            passos.fechar_abertos(con, j["projeto"], etapa=j["etapa"], alvo=alvo, so_sem_job_rodando=False)
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
    # mesa ao vivo (onda 2): o início diz quem começou (vídeo pelo número do envio, nunca pelo nome do arquivo), e um passo
    # raiz por job leva o tempo e o custo somado; os erros saem numa frase em pt-BR com o detalhe técnico em dados.detalhe
    nums = passos.numeros_do_job(con, job)
    banco.emitir(con, proj, "etapa_inicio", etapa=et, alvo=alvo_ev, mensagem=passos.mensagem_inicio(et, nums.get("n"), nums.get("versao")))
    t0 = time.time()
    try:
        passos.abrir_raiz(con, job, nums)
        with _Batimento(cfg, job["id"]):
            saida = obter(et)(Contexto(con=con, cfg=cfg, job=job, armazenamento=arm)) or {}

        def fechar():   # concluir + evento + próxima etapa: tudo ou nada (reinício no meio não perde o encadeamento)
            banco.concluir(con, job["id"], saida)
            passos.fechar_raiz("fim")
            banco.emitir(con, proj, "etapa_fim", etapa=et, alvo=alvo_ev, dados={"s": round(time.time() - t0, 2)})
            pipeline.depois(con, job, saida)
        _transacao(con, fechar)
    except ErroDefinitivo as e:
        def desistir():
            con.execute("UPDATE jobs SET max_tentativas=tentativas WHERE id=?", (job["id"],))
            banco.falhar(con, job["id"], str(e))
            frase = passos.frase_erro(et, n=nums.get("n"), versao=nums.get("versao"), definitivo=True)
            passos.fechar_raiz("erro", frase)
            banco.emitir(con, proj, "etapa_erro", etapa=et, alvo=alvo_ev, mensagem=frase,
                         dados={"detalhe": str(e)[:300], "vai_tentar": False})
            pipeline.falha_definitiva(con, job, str(e))
        _sair_de_transacao(con)
        _transacao(con, desistir)
    except Exception as e:  # noqa: BLE001 - qualquer falha volta para a fila
        def registrar():
            estado = banco.falhar(con, job["id"], traceback.format_exc())
            frase = passos.frase_erro(et, n=nums.get("n"), versao=nums.get("versao"), e=e, vai_tentar=estado == "pendente")
            passos.fechar_raiz("erro", frase)
            banco.emitir(con, proj, "etapa_erro", etapa=et, alvo=alvo_ev, mensagem=frase,
                         dados={"detalhe": f"{type(e).__name__}: {str(e)[:200]}", "vai_tentar": estado == "pendente"})
            if estado == "falhou":
                pipeline.falha_definitiva(con, job, f"{type(e).__name__}: {str(e)[:200]}")
        _sair_de_transacao(con)
        _transacao(con, registrar)
    finally:
        passos.soltar()
    return True


def _sair_de_transacao(con) -> None:
    """Uma etapa que quebrou no meio de uma transação própria não pode deixar a conexão presa nela."""
    if con.in_transaction:
        try:
            con.execute("ROLLBACK")
        except Exception:  # noqa: BLE001
            pass


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
    try:
        n = pipeline.reconciliar(con)
        if n:
            print(f"[worker] reconciliou {n} projeto(s) parado(s) depois de reinício", flush=True)
    except Exception:  # noqa: BLE001 - reconciliar é ajuda, nunca impede o worker de subir
        traceback.print_exc()
    try:
        n = passos.fechar_abertos(con)           # passo que ficou aberto num worker morto não pulsa para sempre (A2.6)
        if n:
            print(f"[worker] fechou {n} passo(s) da mesa interrompido(s) pelo reinício", flush=True)
    except Exception:  # noqa: BLE001
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
