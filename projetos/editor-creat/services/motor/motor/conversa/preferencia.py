"""Chave liga/desliga da conversa (decisão do dono, 25/11): ligada por padrão quando há chave do cérebro.

<dados>/conversa.json = {"ligada": bool, "por": "dono", "em": ISO}. Sem o arquivo, vale ligada.
EDITOR_CONVERSA=0 desliga no servidor e a tela não religa. Sem chave do cérebro (e sem o cérebro falso) fica
desligada com o motivo 'sem_chave'. A chave da API nunca é lida aqui além de "existe ou não".
"""
from __future__ import annotations

import json
import os
import pathlib
import tempfile

from motor import banco, config


def _arq(cfg) -> pathlib.Path:
    return pathlib.Path(cfg.dados) / "conversa.json"


def ler(cfg) -> dict:
    try:
        d = json.loads(_arq(cfg).read_text(encoding="utf-8"))
        if isinstance(d, dict) and isinstance(d.get("ligada"), bool):
            return d
    except (OSError, ValueError):
        pass
    return {"ligada": True, "por": "padrao", "em": None}


def gravar(cfg, ligada: bool) -> dict:
    """Gravação atômica (temporário + os.replace): um desligamento no meio não deixa arquivo pela metade."""
    d = {"ligada": bool(ligada), "por": "dono", "em": banco.agora_iso()}
    destino = _arq(cfg)
    destino.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".conversa.", suffix=".json", dir=str(destino.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
        os.replace(tmp, destino)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return d


def no_servidor(cfg) -> tuple[bool, str | None]:
    """O servidor deixa ligar? (False, motivo) quando EDITOR_CONVERSA=0 ou falta a chave do cérebro."""
    if cfg.conversa in ("0", "off", "desligada", "false", "nao", "não"):
        return False, "desligada_no_servidor"
    if cfg.conversa_cerebro != "falso" and not config.chave_anthropic():
        return False, "sem_chave"
    return True, None


def estado(cfg, *, dono_do_lock: bool = True) -> tuple[bool, str | None]:
    ok, motivo = no_servidor(cfg)
    if not ok:
        return False, motivo
    if not dono_do_lock:
        return False, "outro_processo"
    if not ler(cfg).get("ligada", True):
        return False, "desligada_pelo_dono"
    return True, None
