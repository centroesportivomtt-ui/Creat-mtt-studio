#!/usr/bin/env python3
"""Entrega creat.MTT pelo Cloudflare R2 (deposito creat-entregas). Uso: python3 r2_enviar.py "<cliente>" "<projeto>" arquivos... [--data AAAA-MM-DD]. Chaves so no ambiente (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). painel.html fica ao lado e vira a pagina de entregas."""
import argparse, datetime, json, mimetypes, os, re, sys, unicodedata, urllib.request

CONTA = "1f70e44ae3dedfd6bbf8a913acdd8af8"
DEPOSITO = "creat-entregas"
PUBLICO = "https://pub-5625d0a6139649008e20536aa6235d94.r2.dev"
ENDPOINT = f"https://{CONTA}.r2.cloudflarestorage.com"
PAINEL = "painel-e160f58517f4.html"
INDICE = "_painel/e160f58517f4.json"
FUSO = datetime.timezone(datetime.timedelta(hours=-3))


def sem_acento(t):
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", sem_acento(t).lower()).strip("-")


def nome_arquivo(caminho):
    base, ext = os.path.splitext(os.path.basename(caminho))
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", sem_acento(base)).strip("_")
    return base + ext.lower()


def raiz_versao(nome):
    base, ext = os.path.splitext(nome)
    return re.sub(r"[-_.]?v\d+$", "", base, flags=re.I).lower() + ext.lower()


def atualizar_painel(s3):
    itens, tok = [], None
    while True:
        kw = {"Bucket": DEPOSITO}
        if tok:
            kw["ContinuationToken"] = tok
        r = s3.list_objects_v2(**kw)
        for o in r.get("Contents", []):
            k = o["Key"]
            if k.startswith("_") or k == PAINEL or k.count("/") < 2:
                continue
            itens.append({"k": k, "t": o["Size"]})
        tok = r.get("NextContinuationToken")
        if not tok:
            break
    corpo = json.dumps({"atualizado": datetime.datetime.now(FUSO).strftime("%d/%m/%Y %H:%M"),
                        "itens": itens}, ensure_ascii=False).encode()
    s3.put_object(Bucket=DEPOSITO, Key=INDICE, Body=corpo,
                  ContentType="application/json; charset=utf-8", CacheControl="no-store")
    html = os.path.join(os.path.dirname(os.path.abspath(__file__)), "painel.html")
    if os.path.exists(html):
        s3.upload_file(html, DEPOSITO, PAINEL,
                       ExtraArgs={"ContentType": "text/html; charset=utf-8", "CacheControl": "no-cache"})
    else:
        print("  aviso: painel.html nao esta ao lado do script; so o indice foi atualizado")
    print(f"PAINEL {len(itens)} arquivos  {PUBLICO}/{PAINEL}")


def cliente_s3():
    ak, sk = os.environ.get("R2_ACCESS_KEY_ID"), os.environ.get("R2_SECRET_ACCESS_KEY")
    if not ak or not sk:
        sys.exit("BLOQUEIO: faltam R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY no ambiente.")
    import boto3
    return boto3.client("s3", endpoint_url=ENDPOINT, region_name="auto",
                        aws_access_key_id=ak, aws_secret_access_key=sk)


def main():
    if sys.argv[1:] == ["--painel"]:
        atualizar_painel(cliente_s3())
        return 0
    p = argparse.ArgumentParser()
    p.add_argument("cliente"); p.add_argument("projeto"); p.add_argument("arquivos", nargs="+")
    p.add_argument("--data", default=None)
    p.add_argument("--teste", action="store_true")
    p.add_argument("--legenda", default=None, help="texto da legenda do post; aparece na pagina com botao Copiar")
    a = p.parse_args()
    data = a.data or datetime.datetime.now(FUSO).strftime("%Y-%m-%d")
    pasta = f"{slug(a.cliente)}/{data}-{slug(a.projeto)}/"
    plano = [(f, pasta + nome_arquivo(f)) for f in a.arquivos]
    if a.teste:
        for f, k in plano:
            print(f"{f} -> {PUBLICO}/{k}")
        return 0
    s3 = cliente_s3()
    from boto3.s3.transfer import TransferConfig
    cfg = TransferConfig(multipart_threshold=64 * 1024 * 1024, multipart_chunksize=32 * 1024 * 1024)
    falhas = 0
    for f, k in plano:
        tam = os.path.getsize(f)
        tipo = mimetypes.guess_type(f)[0] or "application/octet-stream"
        s3.upload_file(f, DEPOSITO, k, Config=cfg, ExtraArgs={"ContentType": tipo})
        raiz = raiz_versao(os.path.basename(k))
        for o in s3.list_objects_v2(Bucket=DEPOSITO, Prefix=pasta).get("Contents", []):
            if o["Key"] != k and raiz_versao(os.path.basename(o["Key"])) == raiz:
                s3.delete_object(Bucket=DEPOSITO, Key=o["Key"])
                print(f"  apagada versao anterior: {o['Key']}")
        url = f"{PUBLICO}/{k}"
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers={"User-Agent": "curl/8"}), timeout=30)
            ok = r.status == 200 and int(r.headers.get("Content-Length", -1)) == tam
        except Exception as e:
            ok = False; print(f"  erro ao conferir: {e}")
        print(f"{'OK   ' if ok else 'FALHA'} {tam/1048576:.1f} MB  {url}")
        falhas += 0 if ok else 1
    if a.legenda:
        META = "_painel/e160f58517f4-meta.json"
        try:
            meta = json.loads(s3.get_object(Bucket=DEPOSITO, Key=META)["Body"].read())
        except Exception:
            meta = {}
        meta[pasta.rstrip("/")] = {"legenda": a.legenda}
        s3.put_object(Bucket=DEPOSITO, Key=META, Body=json.dumps(meta, ensure_ascii=False).encode(),
                      ContentType="application/json; charset=utf-8", CacheControl="no-store")
    atualizar_painel(s3)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
