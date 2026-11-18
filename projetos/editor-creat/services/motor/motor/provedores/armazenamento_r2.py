"""Cloudflare R2 (S3 compatível, egress grátis) para produção. Desligado sem R2_SECRET_ACCESS_KEY
(config.provedor_efetivo cai no local). Requer `pip install boto3` (extra `r2` do pyproject); o import é tardio, então
o motor sobe sem boto3 quando o armazenamento é o local.

Variáveis: R2_ACCOUNT_ID (endpoint https://<conta>.r2.cloudflarestorage.com), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET e, opcional, R2_ENDPOINT (sobrescreve o endpoint: testes com servidor falso, jurisdição UE etc.).

Os originais de vários GB sobem do navegador direto para o R2 por multipart pré-assinado (o site, `apps/web/lib/r2.ts`,
cria o envio e conclui; depois chama POST /v1/projetos/{id}/arquivos). O motor só baixa para o cache local o que precisa
ler (`caminho_local`, conferido pelo ETag) e serve o player por faixas (`abrir_faixa`), sem baixar o arquivo inteiro.
"""
from __future__ import annotations

import io
import json
import os
import pathlib
import shutil
import uuid
from typing import BinaryIO, Iterator

from motor.provedores.armazenamento_local import validar_chave

NAO_EXISTE = ("404", "NoSuchKey", "NotFound", "NoSuchUpload")


def _codigo(e: Exception) -> str:
    resp = getattr(e, "response", None) or {}
    return str((resp.get("Error") or {}).get("Code", "")) if isinstance(resp, dict) else ""


def endpoint() -> str:
    sob = os.environ.get("R2_ENDPOINT", "").strip()
    if sob:
        return sob.rstrip("/")
    return f"https://{os.environ.get('R2_ACCOUNT_ID', '').strip()}.r2.cloudflarestorage.com"


def faltando() -> list[str]:
    falta = [n for n in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(n, "").strip()]
    if not os.environ.get("R2_ENDPOINT", "").strip() and not os.environ.get("R2_ACCOUNT_ID", "").strip():
        falta.insert(0, "R2_ACCOUNT_ID")
    return falta


def criar_cliente():
    """Cliente boto3 para o R2 (import tardio). Checksums novos do boto3 (>= 1.36) só quando obrigatórios: o R2
    não aceita todos e eles quebram URL pré-assinada."""
    try:
        import boto3
        from botocore.config import Config as BotoConfig
    except ModuleNotFoundError as e:  # pragma: no cover - depende do ambiente
        raise RuntimeError("R2 precisa do pacote boto3 (pip install 'editor-motor[r2]')") from e
    opcoes = dict(retries={"max_attempts": 5, "mode": "adaptive"}, signature_version="s3v4",
                  s3={"addressing_style": "path"}, connect_timeout=10, read_timeout=120)
    try:
        cfg = BotoConfig(**opcoes, request_checksum_calculation="when_required", response_checksum_validation="when_required")
    except TypeError:  # pragma: no cover - botocore antigo, sem essas opções
        cfg = BotoConfig(**opcoes)
    return boto3.client(
        "s3", endpoint_url=endpoint(), region_name="auto", config=cfg,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"].strip(),
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"].strip(),
    )


class ArmazenamentoR2:
    nome = "r2"

    def __init__(self, cfg, cliente=None):
        self.bucket = os.environ.get("R2_BUCKET", "").strip()
        if cliente is None:
            falta = faltando()
            if falta:
                raise RuntimeError(f"R2 desligado: faltam {', '.join(falta)}")
            cliente = criar_cliente()
        self.s3 = cliente
        self.cache = pathlib.Path(cfg.dados) / "cache" / "r2"
        self.cache.mkdir(parents=True, exist_ok=True)

    # ---------- cache local ----------
    def _cache(self, chave: str) -> pathlib.Path:
        return self.cache / validar_chave(chave)

    @staticmethod
    def _marca(p: pathlib.Path) -> pathlib.Path:
        return p.with_name(f".{p.name}.etag")

    def _lembrar_etag(self, p: pathlib.Path, etag: str) -> None:
        try:
            self._marca(p).write_text(etag)
        except OSError:
            pass

    # ---------- leitura ----------
    def stat(self, chave: str) -> dict:
        """{bytes, etag, modificado, tipo}; FileNotFoundError se não existe."""
        try:
            h = self.s3.head_object(Bucket=self.bucket, Key=validar_chave(chave))
        except Exception as e:  # noqa: BLE001 - botocore ClientError
            if _codigo(e) in NAO_EXISTE:
                raise FileNotFoundError(chave) from e
            raise
        mod = h.get("LastModified")
        return {"bytes": int(h["ContentLength"]), "etag": str(h.get("ETag", "")).strip('"'),
                "modificado": mod.isoformat() if hasattr(mod, "isoformat") else mod, "tipo": h.get("ContentType")}

    def existe(self, chave: str) -> bool:
        try:
            self.stat(chave)
            return True
        except FileNotFoundError:
            return False

    def tamanho(self, chave: str) -> int:
        return self.stat(chave)["bytes"]

    def listar(self, prefixo: str) -> Iterator[str]:
        pag = self.s3.get_paginator("list_objects_v2")
        for pg in pag.paginate(Bucket=self.bucket, Prefix=prefixo):
            for o in pg.get("Contents", []):
                yield o["Key"]

    def ler_bytes(self, chave: str) -> bytes:
        try:
            r = self.s3.get_object(Bucket=self.bucket, Key=validar_chave(chave))
        except Exception as e:  # noqa: BLE001
            if _codigo(e) in NAO_EXISTE:
                raise FileNotFoundError(chave) from e
            raise
        return r["Body"].read()

    def ler_json(self, chave: str):
        return json.loads(self.ler_bytes(chave).decode("utf-8"))

    def ler_faixa(self, chave: str, ini: int, fim: int) -> bytes:
        """Bytes [ini, fim] (inclusivo), como o Range do HTTP."""
        return b"".join(self.abrir_faixa(chave, ini, fim))

    def abrir_faixa(self, chave: str, ini: int, fim: int, bloco: int = 1 << 20) -> Iterator[bytes]:
        """Gera a faixa [ini, fim] em blocos, sem baixar o arquivo inteiro (player com Range)."""
        if ini < 0 or fim < ini:
            raise ValueError("faixa inválida")
        r = self.s3.get_object(Bucket=self.bucket, Key=validar_chave(chave), Range=f"bytes={int(ini)}-{int(fim)}")
        corpo = r["Body"]
        try:
            for pedaco in corpo.iter_chunks(chunk_size=bloco):
                if pedaco:
                    yield pedaco
        finally:
            corpo.close()

    def baixar_para(self, chave: str, destino: pathlib.Path | str) -> pathlib.Path:
        """Baixa o objeto inteiro para `destino` (atômico: .tmp + rename). Devolve o caminho."""
        destino = pathlib.Path(destino)
        destino.parent.mkdir(parents=True, exist_ok=True)
        tmp = destino.with_name(f".{destino.name}.{uuid.uuid4().hex[:6]}.tmp")
        try:
            self.s3.download_file(self.bucket, validar_chave(chave), str(tmp))
            os.replace(tmp, destino)
        except Exception as e:  # noqa: BLE001
            tmp.unlink(missing_ok=True)
            if _codigo(e) in NAO_EXISTE:
                raise FileNotFoundError(chave) from e
            raise
        return destino

    def caminho_local(self, chave: str) -> pathlib.Path:
        """Cópia local (cache) do objeto; baixa de novo só se o ETag (ou, sem marca, o tamanho) mudou."""
        p = self._cache(chave)
        info = self.stat(chave)
        if p.is_file():
            marca = self._marca(p)
            if marca.is_file():
                if marca.read_text().strip() == info["etag"] and p.stat().st_size == info["bytes"]:
                    return p
            elif p.stat().st_size == info["bytes"]:
                return p
        self.baixar_para(chave, p)
        self._lembrar_etag(p, info["etag"])
        return p

    # ---------- escrita ----------
    def gravar(self, chave: str, origem: pathlib.Path | BinaryIO, *, mover: bool = False) -> str:
        validar_chave(chave)
        if isinstance(origem, (str, os.PathLike)):
            origem = pathlib.Path(origem)
            self.s3.upload_file(str(origem), self.bucket, chave)
            if mover:
                # mantém uma cópia no cache (a próxima etapa provavelmente lê) em vez de apagar
                dest = self._cache(chave)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(origem), dest)
                try:
                    self._lembrar_etag(dest, self.stat(chave)["etag"])
                except FileNotFoundError:
                    pass
        else:
            self.s3.upload_fileobj(origem, self.bucket, chave)
            self._cache(chave).unlink(missing_ok=True)   # o cache antigo, se havia, ficou velho
        return chave

    def gravar_de(self, chave: str, arquivo: pathlib.Path | str, *, mover: bool = False) -> str:
        return self.gravar(chave, pathlib.Path(arquivo), mover=mover)

    def gravar_bytes(self, chave: str, dados: bytes) -> str:
        return self.gravar(chave, io.BytesIO(dados))

    def gravar_json(self, chave: str, obj) -> str:
        return self.gravar_bytes(chave, json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8"))

    def apagar(self, chave: str) -> None:
        self.s3.delete_object(Bucket=self.bucket, Key=validar_chave(chave))
        p = self._cache(chave)
        p.unlink(missing_ok=True)
        self._marca(p).unlink(missing_ok=True)

    def url(self, chave: str, expira_s: int = 3600) -> str:
        return self.s3.generate_presigned_url("get_object", Params={"Bucket": self.bucket, "Key": validar_chave(chave)}, ExpiresIn=expira_s)

    # ---------- envio em partes (o navegador manda direto; isto serve a ferramentas e aos testes) ----------
    def iniciar_multipart(self, chave: str, tipo: str = "application/octet-stream") -> str:
        return self.s3.create_multipart_upload(Bucket=self.bucket, Key=validar_chave(chave), ContentType=tipo)["UploadId"]

    def url_parte(self, chave: str, envio_id: str, parte: int, *, bytes_: int | None = None, expira_s: int = 900) -> str:
        p = {"Bucket": self.bucket, "Key": validar_chave(chave), "UploadId": envio_id, "PartNumber": int(parte)}
        if bytes_ is not None:
            p["ContentLength"] = int(bytes_)       # entra na assinatura: a parte não pode vir de outro tamanho
        return self.s3.generate_presigned_url("upload_part", Params=p, ExpiresIn=expira_s)

    def listar_partes(self, chave: str, envio_id: str) -> list[dict]:
        """Partes já gravadas [{parte, etag, bytes}] (paginado); FileNotFoundError se o envio não existe mais."""
        partes, marcador = [], 0
        while True:
            try:
                r = self.s3.list_parts(Bucket=self.bucket, Key=validar_chave(chave), UploadId=envio_id,
                                       MaxParts=1000, PartNumberMarker=marcador)
            except Exception as e:  # noqa: BLE001
                if _codigo(e) in NAO_EXISTE:
                    raise FileNotFoundError(envio_id) from e
                raise
            partes += [{"parte": int(p["PartNumber"]), "etag": p["ETag"], "bytes": int(p["Size"])} for p in r.get("Parts", [])]
            if not r.get("IsTruncated"):
                return partes
            marcador = int(r["NextPartNumberMarker"])

    def concluir_multipart(self, chave: str, envio_id: str, partes: list[dict]) -> None:
        self.s3.complete_multipart_upload(
            Bucket=self.bucket, Key=validar_chave(chave), UploadId=envio_id,
            MultipartUpload={"Parts": [{"PartNumber": int(p["parte"]), "ETag": p["etag"]} for p in sorted(partes, key=lambda x: int(x["parte"]))]})

    def abortar_multipart(self, chave: str, envio_id: str) -> None:
        try:
            self.s3.abort_multipart_upload(Bucket=self.bucket, Key=validar_chave(chave), UploadId=envio_id)
        except Exception as e:  # noqa: BLE001
            if _codigo(e) not in NAO_EXISTE:
                raise
