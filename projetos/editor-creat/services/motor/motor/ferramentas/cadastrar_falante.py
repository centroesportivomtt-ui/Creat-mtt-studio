"""Cadastra (ou reforça) o perfil de voz de um falante para o provedor `voz` da análise.

uso:  python -m motor.ferramentas.cadastrar_falante --nome marcos fala1.wav fala2.m4a ...
      python -m motor.ferramentas.cadastrar_falante --listar
      python -m motor.ferramentas.cadastrar_falante --nome marcos --apagar

Cada arquivo (wav/flac direto; outros formatos passam pelo ffmpeg para WAV 16 kHz) é cortado em janelas de 3 s;
só entram janelas que parecem voz (sem silêncio, tom ou música contínua). O perfil guarda estatísticas, nunca o áudio,
em $EDITOR_FALANTES_DIR/<nome>/perfil.json (padrão $EDITOR_DADOS/biblioteca/falantes). Idempotente: o mesmo
arquivo (mesmo sha256) não conta duas vezes. Nomes fora de marcos/ruan/xande valem como 'outro' na análise.
Recomendado: 3+ arquivos, 60+ s de fala limpa no total, de dias/ambientes diferentes (ver README-falante.md).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np

from motor.provedores import falante_voz as fv

MIN_JANELAS = 6


def _audio(caminho: pathlib.Path) -> np.ndarray:
    import soundfile as sf
    try:
        x, sr = sf.read(str(caminho), dtype="float32", always_2d=True)
        return fv.reamostrar(x.mean(axis=1), sr)
    except RuntimeError:
        pass
    with tempfile.TemporaryDirectory() as d:
        saida = pathlib.Path(d) / "a.wav"
        r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(caminho), "-vn", "-ac", "1", "-ar", str(fv.SR), str(saida)],
                           capture_output=True, text=True, timeout=600)
        if r.returncode != 0 or not saida.exists():
            raise ValueError(f"não consegui ler o áudio de {caminho.name}")
        x, _ = sf.read(str(saida), dtype="float32")
        return x


def _sha(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def cadastrar(nome: str, arquivos: list[pathlib.Path], pasta: pathlib.Path | None = None) -> dict:
    """Grava/atualiza o perfil e devolve o resumo. Levanta ValueError se nada aproveitável entrou."""
    nome = fv.nome_valido(nome)
    pasta = pasta or fv.dir_falantes()
    destino = pasta / nome / "perfil.json"
    p = json.loads(destino.read_text(encoding="utf-8")) if destino.exists() else fv.perfil_vazio(nome)
    if p.get("algo") != fv.ALGO:                       # versão antiga da impressão: recomeça
        p = fv.perfil_vazio(nome)
    emb = fv.Embedder.abrir()
    vistos = {a["sha256"] for a in p["arquivos"]}
    soma, soma2 = np.asarray(p["soma"], float), np.asarray(p["soma2"], float)
    esum = np.asarray(p["emb"], float) * p["emb_n"] if p.get("emb") else None
    relat = []
    for arq in arquivos:
        sha = _sha(arq)
        if sha in vistos:
            relat.append({"arquivo": arq.name, "janelas": 0, "obs": "já cadastrado"})
            continue
        x = _audio(arq)
        ok, seg = 0, 0.0
        for j in fv.janelas(x):
            imp = fv.impressao(j)
            if not imp["voz"]:
                continue
            soma, soma2 = soma + imp["vetor"], soma2 + imp["vetor"] ** 2
            ok, seg = ok + 1, seg + imp["dur"]
            if emb is not None:
                v = emb.vetor(j)
                esum = v if esum is None else esum + v
                p["emb_n"] += 1
        p["n"] += ok
        p["segundos"] = round(p["segundos"] + len(x) / fv.SR, 1)
        p["arquivos"].append({"nome": arq.name, "sha256": sha, "janelas": ok})
        vistos.add(sha)
        relat.append({"arquivo": arq.name, "janelas": ok, "obs": "" if ok else "nenhuma janela com voz"})
    if p["n"] < 2:
        raise ValueError("nenhuma janela de voz aproveitável: mande fala limpa de 3 s ou mais")
    p["soma"], p["soma2"] = soma.tolist(), soma2.tolist()
    if esum is not None and p["emb_n"]:
        p["emb"] = (esum / p["emb_n"]).tolist()
    p["atualizado"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(".tmp")
    tmp.write_text(json.dumps(p, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, destino)
    aviso = None if p["n"] >= MIN_JANELAS else f"só {p['n']} janelas: cadastre mais fala (meta: 20+ janelas, ~60 s)"
    return {"nome": nome, "rotulo": fv.rotulo_de(nome), "janelas": p["n"], "segundos": p["segundos"],
            "modelo": bool(p.get("emb")), "arquivos": relat, "aviso": aviso, "perfil": str(destino)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--nome")
    ap.add_argument("--dir", help="pasta dos perfis (padrão: EDITOR_FALANTES_DIR ou EDITOR_DADOS/biblioteca/falantes)")
    ap.add_argument("--listar", action="store_true")
    ap.add_argument("--apagar", action="store_true", help="remove o perfil do --nome")
    ap.add_argument("arquivos", nargs="*", type=pathlib.Path)
    a = ap.parse_args(argv)
    pasta = pathlib.Path(a.dir) if a.dir else fv.dir_falantes()
    if a.listar:
        for n, p in fv.carregar_perfis(pasta).items():
            print(f"{n:12s} -> {fv.rotulo_de(n):7s} {p['n']:4d} janelas {p['segundos']:7.1f} s  modelo={'sim' if p.get('emb') else 'não'}")
        return 0
    if not a.nome:
        ap.error("--nome é obrigatório")
    if a.apagar:
        alvo = pasta / fv.nome_valido(a.nome)
        if alvo.is_dir():
            shutil.rmtree(alvo)
        print(f"perfil '{a.nome}' removido")
        return 0
    faltam = [str(x) for x in a.arquivos if not x.is_file()]
    if not a.arquivos or faltam:
        ap.error("arquivos de áudio inexistentes: " + ", ".join(faltam) if faltam else "passe ao menos um arquivo de áudio")
    try:
        r = cadastrar(a.nome, a.arquivos, pasta)
    except ValueError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 2
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
