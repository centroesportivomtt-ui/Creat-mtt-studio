"""Acesso ao armazenamento usado pelas etapas da frente B (catálogo e direção).

Usa o provedor de armazenamento da frente A quando ele existe (ctx.armazenamento); sem ele, cai na pasta local
<EDITOR_DADOS>/armazenamento/<chave>, o mesmo layout do adaptador local. Gravação sempre atômica (.tmp -> rename).
"""
from __future__ import annotations

import io
import json
import os
import pathlib
import sys

from motor import config

_PY_SCHEMAS = str(config.SCHEMAS / "py")
if _PY_SCHEMAS not in sys.path:
    sys.path.insert(0, _PY_SCHEMAS)


class Armazem:
    def __init__(self, ctx=None, *, dados: pathlib.Path | None = None, provedor=None):
        self.provedor = provedor if provedor is not None else getattr(ctx, "armazenamento", None)
        self.raiz = pathlib.Path(dados or getattr(getattr(ctx, "cfg", None), "dados", None) or config.carregar().dados) / "armazenamento"

    # caminho local de uma chave (o provedor baixa para o cache se preciso)
    def caminho(self, chave: str) -> pathlib.Path:
        if chave.startswith("/"):
            return pathlib.Path(chave)
        if self.provedor is not None:
            return pathlib.Path(self.provedor.caminho_local(chave))
        return self.raiz / chave

    def existe(self, chave: str) -> bool:
        if self.provedor is not None and not chave.startswith("/"):
            return self.provedor.existe(chave)
        return self.caminho(chave).exists()

    def listar(self, prefixo: str):
        if self.provedor is not None:
            return list(self.provedor.listar(prefixo))
        base = self.raiz / prefixo
        if not base.exists():
            return []
        return [str(p.relative_to(self.raiz)) for p in base.rglob("*") if p.is_file()]

    def ler_json(self, chave: str, padrao=None):
        try:
            return json.loads(self.caminho(chave).read_text(encoding="utf-8"))
        except FileNotFoundError:
            if padrao is not None:
                return padrao
            raise

    def gravar_bytes(self, chave: str, dados: bytes) -> str:
        if self.provedor is not None:
            return self.provedor.gravar(chave, io.BytesIO(dados))
        destino = self.raiz / chave
        destino.parent.mkdir(parents=True, exist_ok=True)
        tmp = destino.with_name(destino.name + ".tmp")
        tmp.write_bytes(dados)
        os.replace(tmp, destino)
        return chave

    def gravar_texto(self, chave: str, texto: str) -> str:
        return self.gravar_bytes(chave, texto.encode("utf-8"))

    def gravar_json(self, chave: str, obj) -> str:
        return self.gravar_texto(chave, json.dumps(obj, ensure_ascii=False, indent=1))

    def pedido(self, projeto: str) -> dict | None:
        return self.ler_json(f"projetos/{projeto}/pedido.json", padrao={}) or None


def trilhas(cfg) -> list[dict]:
    """Trilhas que podem tocar: as da biblioteca da casa com licença registrada para uso comercial (motor/biblioteca.py).
    EDITOR_TRILHAS (arquivo de testes e ferramentas de bancada) continua lido como está."""
    if not os.environ.get("EDITOR_TRILHAS"):
        from motor import biblioteca
        from motor.provedores import armazenamento_de
        try:
            arm = armazenamento_de(cfg)
        except Exception:  # noqa: BLE001
            arm = None
        ok, fora = biblioteca.trilhas_validas(cfg, arm)
        for f in fora[:5]:
            import logging
            logging.getLogger("motor.biblioteca").warning("fora do catálogo: %s", f)
        return ok
    p = pathlib.Path(os.environ["EDITOR_TRILHAS"])
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return []
