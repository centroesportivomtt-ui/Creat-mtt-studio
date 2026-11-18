"""Cloudflare R2 (S3 compatível, egress grátis) para produção. Desligado sem R2_SECRET_ACCESS_KEY
(config.provedor_efetivo cai no local). Requer `pip install boto3` (extra `r2` do pyproject).

Os originais de vários GB sobem do site direto para o R2 por multipart pré-assinado (partes de 64 MB);
o motor só baixa para o cache local o que precisa ler (caminho_local).
"""
from __future__ import annotations

import os
import pathlib
import shutil
import uuid
from typing import BinaryIO, Iterator

from motor.provedores.armazenamento_local import validar_chave


class ArmazenamentoR2:
    nome = "r2"

    def __init__(self, cfg, cliente=None):
        conta = os.environ.get("R2_ACCOUNT_ID", "").strip()
        self.bucket = os.environ.get("R2_BUCKET", "").strip()
        if cliente is None:
            faltando = [n for n in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(n, "").strip()]
            if faltando:
                raise RuntimeError(f"R2 desligado: faltam {', '.join(faltando)}")
            try:
                import boto3
                from botocore.config import Config as BotoConfig
            except ModuleNotFoundError as e:  # pragma: no cover - depende do ambiente
                raise RuntimeError("R2 precisa do pacote boto3 (pip install 'editor-motor[r2]')") from e
            cliente = boto3.client(
                "s3",
                endpoint_url=f"https://{conta}.r2.cloudflarestorage.com",
                aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                region_name="auto",
                config=BotoConfig(retries={"max_attempts": 5, "mode": "adaptive"}),
            )
        self.s3 = cliente
        self.cache = pathlib.Path(cfg.dados) / "cache" / "r2"
        self.cache.mkdir(parents=True, exist_ok=True)

    def caminho_local(self, chave: str) -> pathlib.Path:
        p = self.cache / validar_chave(chave)
        tam = self.tamanho(chave)
        if p.is_file() and p.stat().st_size == tam:
            return p
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(f".{p.name}.{uuid.uuid4().hex[:6]}.tmp")
        self.s3.download_file(self.bucket, chave, str(tmp))
        os.replace(tmp, p)
        return p

    def gravar(self, chave: str, origem: pathlib.Path | BinaryIO, *, mover: bool = False) -> str:
        validar_chave(chave)
        if isinstance(origem, (str, os.PathLike)):
            self.s3.upload_file(str(origem), self.bucket, chave)
            if mover:
                # mantém uma cópia no cache (a próxima etapa provavelmente lê) em vez de apagar
                dest = self.cache / chave
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(origem), dest)
        else:
            self.s3.upload_fileobj(origem, self.bucket, chave)
        return chave

    def gravar_bytes(self, chave: str, dados: bytes) -> str:
        import io
        return self.gravar(chave, io.BytesIO(dados))

    def gravar_json(self, chave: str, obj) -> str:
        import json
        return self.gravar_bytes(chave, json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8"))

    def ler_json(self, chave: str):
        import json
        return json.loads(self.caminho_local(chave).read_text(encoding="utf-8"))

    def existe(self, chave: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket, Key=validar_chave(chave))
            return True
        except Exception as e:  # botocore ClientError 404
            if getattr(e, "response", {}).get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def tamanho(self, chave: str) -> int:
        return int(self.s3.head_object(Bucket=self.bucket, Key=validar_chave(chave))["ContentLength"])

    def listar(self, prefixo: str) -> Iterator[str]:
        pag = self.s3.get_paginator("list_objects_v2")
        for pg in pag.paginate(Bucket=self.bucket, Prefix=prefixo):
            for o in pg.get("Contents", []):
                yield o["Key"]

    def apagar(self, chave: str) -> None:
        self.s3.delete_object(Bucket=self.bucket, Key=validar_chave(chave))
        (self.cache / chave).unlink(missing_ok=True)

    def url(self, chave: str, expira_s: int = 3600) -> str:
        return self.s3.generate_presigned_url("get_object", Params={"Bucket": self.bucket, "Key": validar_chave(chave)}, ExpiresIn=expira_s)

    def iniciar_multipart(self, chave: str) -> str:
        return self.s3.create_multipart_upload(Bucket=self.bucket, Key=validar_chave(chave))["UploadId"]

    def url_parte(self, chave: str, envio_id: str, parte: int) -> str:
        return self.s3.generate_presigned_url(
            "upload_part", Params={"Bucket": self.bucket, "Key": validar_chave(chave), "UploadId": envio_id, "PartNumber": int(parte)}, ExpiresIn=6 * 3600)

    def concluir_multipart(self, chave: str, envio_id: str, partes: list[dict]) -> None:
        self.s3.complete_multipart_upload(
            Bucket=self.bucket, Key=validar_chave(chave), UploadId=envio_id,
            MultipartUpload={"Parts": [{"PartNumber": int(p["parte"]), "ETag": p["etag"]} for p in sorted(partes, key=lambda x: int(x["parte"]))]})
