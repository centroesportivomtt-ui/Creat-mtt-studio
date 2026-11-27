"""Conferência AO VIVO da leitura de pasta do Google Drive (fora do pytest: usa a internet de verdade).

    python -m motor.ferramentas.conferir_drive <id_ou_link_de_pasta_publica> [--baixar]

Lista a pasta pelo mesmo caminho do editor (embeddedfolderview), mostra os vídeos com o tamanho (Range bytes=0-0) e, com
--baixar, baixa o MENOR para uma pasta temporária e confere o tamanho. Sai com código 0 se tudo fechou. Serve para notar
cedo se o Google mudou a página (risco nº 1 do projeto): a saída diz "ilegível" em vez de "vazia".
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from motor import importar


def main(argv=None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    baixar = "--baixar" in args
    args = [a for a in args if a != "--baixar"]
    if not args:
        print(__doc__)
        return 2
    alvo = args[0]
    try:
        if alvo.startswith("https://"):
            direto, tipo = importar.link_direto(alvo)
            if tipo != "pasta_drive":
                print("isso não é link de pasta do Drive")
                return 2
            fid, rk = importar.id_da_pasta(direto)
        else:
            fid, rk = alvo, None
        r = importar.listar_pasta_drive(fid, resourcekey=rk)
    except importar.ErroImportacao as e:
        print(f"ERRO (mensagem que o dono veria): {e}")
        return 1
    tam = importar.tamanhos_drive([i["id"] for i in r["itens"]])
    print(f"pasta “{r['nome']}”: {len(r['itens'])} mídia(s), {r['ignorados']} ignorado(s), {r['subpastas']} subpasta(s), "
          f"{r['subpastas_fora']} subpasta(s) de fora")
    for i in r["itens"]:
        t = tam.get(i["id"])
        print(f"  {i['tipo']:5} {(t or 0) / 2**20:9.1f} MB  {importar.nome_do_item(i)}")
    print(importar.detalhe_pasta(r, len(r["itens"])))
    if not baixar or not r["itens"]:
        return 0 if r["itens"] else 1
    menor = min((i for i in r["itens"] if tam.get(i["id"])), key=lambda i: tam[i["id"]], default=None)
    if menor is None:
        print("nenhum tamanho conhecido: não baixei")
        return 1
    with tempfile.TemporaryDirectory() as d:
        link, _ = importar.link_direto(importar.url_do_arquivo_drive(menor["id"]))
        caminho, nome, nb = importar.baixar(link, Path(d) / "x")
        ok = nb == tam[menor["id"]]
        print(f"baixado: {nome} {nb} bytes ({'confere' if ok else 'NÃO confere'} com o Range: {tam[menor['id']]})")
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
