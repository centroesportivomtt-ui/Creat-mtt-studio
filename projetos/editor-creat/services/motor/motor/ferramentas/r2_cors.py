"""Libera o CORS do bucket R2 para o envio direto do navegador (PUT nas URLs assinadas + leitura do ETag).

uso:  python -m motor.ferramentas.r2_cors https://editor.creatmtt.com.br [https://outra-origem ...]
      python -m motor.ferramentas.r2_cors --ver

Precisa de um token do R2 com permissão de administrar o bucket. Se o token for só de objetos, o Cloudflare
recusa (AccessDenied): aí cole a regra impressa por --regra no painel do bucket (Configurações > Política CORS).
"""
from __future__ import annotations

import json
import sys


def regra(origens: list[str]) -> list[dict]:
    return [{
        "AllowedOrigins": origens,
        "AllowedMethods": ["PUT", "GET", "HEAD"],
        "AllowedHeaders": ["content-type", "content-length"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600,
    }]


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    if argv[0] == "--regra":
        print(json.dumps(regra(argv[1:] or ["https://SEU-SITE"]), indent=2))
        return 0
    from motor import config
    from motor.provedores.armazenamento_r2 import ArmazenamentoR2
    arm = ArmazenamentoR2(config.carregar())
    if argv[0] == "--ver":
        print(json.dumps(arm.s3.get_bucket_cors(Bucket=arm.bucket).get("CORSRules", []), indent=2))
        return 0
    origens = [o.rstrip("/") for o in argv]
    if any(not o.startswith(("https://", "http://localhost", "http://127.0.0.1")) for o in origens):
        print("origem precisa ser https:// (ou http://localhost para teste)")
        return 2
    arm.s3.put_bucket_cors(Bucket=arm.bucket, CORSConfiguration={"CORSRules": regra(origens)})
    print(f"CORS liberado no bucket {arm.bucket} para: {', '.join(origens)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
