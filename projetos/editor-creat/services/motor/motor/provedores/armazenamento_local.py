"""Armazenamento local (padrão em dev e nesta máquina): uma pasta com as mesmas chaves do R2.

Chaves: 'entrada/<projeto>/<arquivo>.<ext>', 'derivados/<projeto>/<arquivo>/...', 'saidas/<projeto>/<versao>/...'.
Toda gravação é atômica (.tmp no mesmo disco + rename). Chave com '..', barra inicial ou caractere de controle é recusada.
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import uuid
from typing import BinaryIO, Iterator
from urllib.parse import quote


class ChaveInvalida(ValueError):
    pass


def validar_chave(chave: str) -> str:
    if not isinstance(chave, str) or not chave or len(chave) > 512:
        raise ChaveInvalida("chave vazia ou longa demais")
    if chave.startswith("/") or "\\" in chave or any(ord(c) < 32 for c in chave):
        raise ChaveInvalida(f"chave inválida: {chave!r}")
    partes = chave.split("/")
    if any(p in ("", ".", "..") for p in partes):
        raise ChaveInvalida(f"chave inválida: {chave!r}")
    return chave


class ArmazenamentoLocal:
    nome = "local"

    def __init__(self, cfg):
        self.raiz = (pathlib.Path(cfg.dados) / "armazenamento").resolve()
        self.raiz.mkdir(parents=True, exist_ok=True)
        self._multipart = pathlib.Path(cfg.dados) / "tmp" / "multipart"

    # ---------- caminhos
    def _p(self, chave: str) -> pathlib.Path:
        p = (self.raiz / validar_chave(chave)).resolve()
        if p != self.raiz and self.raiz not in p.parents:
            raise ChaveInvalida(f"chave fora do armazenamento: {chave!r}")
        return p

    def caminho_local(self, chave: str) -> pathlib.Path:
        return self._p(chave)

    # ---------- escrita
    def gravar(self, chave: str, origem: pathlib.Path | BinaryIO, *, mover: bool = False) -> str:
        dest = self._p(chave)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(origem, (str, os.PathLike)):
            origem = pathlib.Path(origem)
            if origem.resolve() == dest:
                return chave
            if mover:
                try:
                    os.replace(origem, dest)
                    return chave
                except OSError:
                    pass  # outro disco: copia
            tmp = dest.with_name(f".{dest.name}.{uuid.uuid4().hex[:6]}.tmp")
            shutil.copyfile(origem, tmp)
            os.replace(tmp, dest)
            if mover:
                origem.unlink(missing_ok=True)
            return chave
        tmp = dest.with_name(f".{dest.name}.{uuid.uuid4().hex[:6]}.tmp")
        with open(tmp, "wb") as f:
            shutil.copyfileobj(origem, f, 1 << 20)
        os.replace(tmp, dest)
        return chave

    def gravar_bytes(self, chave: str, dados: bytes) -> str:
        import io
        return self.gravar(chave, io.BytesIO(dados))

    def gravar_json(self, chave: str, obj) -> str:
        return self.gravar_bytes(chave, json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8"))

    def ler_json(self, chave: str):
        return json.loads(self._p(chave).read_text(encoding="utf-8"))

    # ---------- leitura
    def existe(self, chave: str) -> bool:
        return self._p(chave).is_file()

    def tamanho(self, chave: str) -> int:
        return self._p(chave).stat().st_size

    def listar(self, prefixo: str) -> Iterator[str]:
        base = self._p(prefixo.rstrip("/")) if prefixo.strip("/") else self.raiz
        if base.is_file():
            yield prefixo
            return
        if not base.is_dir():
            return
        for p in sorted(base.rglob("*")):
            if p.is_file() and not p.name.endswith(".tmp"):
                yield p.relative_to(self.raiz).as_posix()

    def apagar(self, chave: str) -> None:
        self._p(chave).unlink(missing_ok=True)

    def url(self, chave: str, expira_s: int = 3600) -> str:
        return "/v1/arquivos/" + quote(validar_chave(chave))

    # ---------- envio em partes (o site usa tus; isto serve a clientes sem tus e aos testes)
    def iniciar_multipart(self, chave: str) -> str:
        validar_chave(chave)
        eid = uuid.uuid4().hex
        d = self._multipart / eid
        d.mkdir(parents=True)
        (d / "chave").write_text(chave)
        return eid

    def url_parte(self, chave: str, envio_id: str, parte: int) -> str:
        return f"/v1/envio/{envio_id}/{int(parte)}"

    def gravar_parte(self, envio_id: str, parte: int, dados: BinaryIO) -> dict:
        d = self._multipart / validar_chave(envio_id)
        if not d.is_dir():
            raise ChaveInvalida("envio desconhecido")
        p = d / f"{int(parte):06d}"
        tmp = p.with_suffix(".tmp")
        with open(tmp, "wb") as f:
            shutil.copyfileobj(dados, f, 1 << 20)
        os.replace(tmp, p)
        return {"parte": int(parte), "bytes": p.stat().st_size}

    def concluir_multipart(self, chave: str, envio_id: str, partes: list[dict]) -> None:
        d = self._multipart / validar_chave(envio_id)
        if (d / "chave").read_text() != chave:
            raise ChaveInvalida("envio não pertence a esta chave")
        dest = self._p(chave)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(f".{dest.name}.{envio_id[:6]}.tmp")
        with open(tmp, "wb") as f:
            for item in sorted(partes, key=lambda x: int(x["parte"])):
                with open(d / f"{int(item['parte']):06d}", "rb") as src:
                    shutil.copyfileobj(src, f, 1 << 20)
        os.replace(tmp, dest)
        shutil.rmtree(d, ignore_errors=True)
