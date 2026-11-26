"""Conserta à mão os cortes de fala de um EDL resolvido. Desde a onda 4 (item 2) é uma casca fina do passo automático da
montagem, `motor/etapas/montagem/cortes.py`: a mesma régua (a da conferência, `audio_fala` a 16 kHz), a mesma marca de
idempotência (`edl.origem.cortes_audio`) e a mesma correção da causa (só mexe na ponta que reprova; o fim novo passa na régua).

Por que existe (revisão do dono, Super Kal 19/11): o resolvedor cortava no fim de palavra do Whisper, que marca o fim de 0,1 a
0,5 s antes de a voz acabar ("comum" saía "com"). A montagem já faz isto sozinha; a ferramenta fica para quem ouviu e quer
FORÇAR um ponto (`--inicio`/`--fim`) ou rodar de novo ignorando a marca (`--forcar`).

uso:
  python -m motor.ferramentas.ajustar_cortes <projeto> <versao> [--so-relatorio] [--sem-fila] [--forcar] [--inicio ID=SEG] [--fim ID=SEG]
EDL já ajustado (marca com a mesma voz): imprime "já ajustado" e sai 0. Depois de gravar, reenfileira a montagem.
"""
from __future__ import annotations

import argparse
import copy
import pathlib
import sys

from motor import banco, config
from motor.etapas.montagem import cortes as CORTES
from motor.provedores import armazenamento_de

JUNTAR = CORTES.JUNTAR
RESPIRO = CORTES.RESPIRO
PRE = CORTES.PRE


def ajustar(arm, edl: dict, cfg=None, forcar: dict | None = None, forcar_marca: bool = True) -> tuple[dict, dict]:
    """(EDL novo, relatório). Não grava nada; `edl` não é tocado."""
    from motor.etapas.montagem.comum import Fontes
    novo = copy.deepcopy(edl)
    rel = CORTES.ajustar_edl(novo, Fontes(novo, arm, getattr(cfg, "dados", None)), cfg, forcar_marca=forcar_marca, forcar=forcar)
    return novo, rel


def imprimir(rel: dict) -> None:
    for r in rel.get("pecas") or []:
        print(f"  {r['id']:9s} {r['fonte']:5s} filme {r['t'][0]:6.2f}-{r['t'][1]:6.2f} | começo {r['s0'][0]:7.2f}->{r['s0'][1]:7.2f} "
              f"fim {r['s1'][0]:7.2f}->{r['s1'][1]:7.2f} | {r['primeira']} … {r['ultima']}"
              + (f" | juntou {'+'.join(r['juntou'])}" if r["juntou"] else "") + (f" | {'; '.join(r['notas'])}" if r["notas"] else ""))
    for a in rel.get("avisos") or []:
        print(f"  aviso: {a}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto")
    ap.add_argument("versao")
    ap.add_argument("--so-relatorio", action="store_true")
    ap.add_argument("--sem-fila", action="store_true")
    ap.add_argument("--forcar", action="store_true", help="roda mesmo com a marca de cortes já ajustados")
    ap.add_argument("--inicio", action="append", default=[], metavar="ID=SEG", help="força o começo (tempo da fonte) de uma peça")
    ap.add_argument("--fim", action="append", default=[], metavar="ID=SEG", help="força o fim (tempo da fonte) de uma peça")
    a = ap.parse_args(argv)
    forcar: dict = {}
    for lado, itens in (("s0", a.inicio), ("s1", a.fim)):
        for it in itens:
            k, val = it.split("=")
            forcar.setdefault(k, {})[lado] = float(val)
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    chave = f"saidas/{a.projeto}/{a.versao}/edl.json"
    edl = arm.ler_json(chave)
    if not a.forcar and not forcar and CORTES.ja_ajustado(edl):
        print(f"{a.projeto}/{a.versao}: já ajustado (marca {edl['origem']['cortes_audio']['voz']}); use --forcar para rodar de novo")
        return 0
    novo, rel = ajustar(arm, edl, cfg, forcar=forcar or None, forcar_marca=True)
    if rel["estado"] == "falhou":
        print(f"{a.projeto}/{a.versao}: {rel['motivo']}")
        return 1
    print(f"{a.projeto}/{a.versao}: {edl['duracao']:.2f} s -> {novo['duracao']:.2f} s, {len(edl['voz'])} -> {len(novo['voz'])} peças de voz, "
          f"{rel['mexidas']} mexida(s)")
    imprimir(rel)
    if a.so_relatorio:
        return 0
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "packages" / "schemas" / "py"))
    import validar
    erros = validar.erros("edl", novo)
    if erros:
        print("EDL inválido depois do ajuste:", erros[:4])
        return 1
    arm.gravar_json(chave, novo)
    if not a.sem_fila:
        con = banco.conectar(cfg.banco)
        with con:
            banco.enfileirar(con, "montagem", a.projeto, a.versao, prioridade=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
