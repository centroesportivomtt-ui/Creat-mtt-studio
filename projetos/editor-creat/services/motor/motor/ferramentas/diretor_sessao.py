"""Diretor da sessão (cérebro 'sessao'): lista pedidos pendentes e devolve a direção escrita pelo Claude da sessão.

  python -m motor.ferramentas.diretor_sessao pendentes            # pedidos aguardando direção
  python -m motor.ferramentas.diretor_sessao responder <projeto>  # valida as direções escritas e devolve a direção do projeto à fila
"""
from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "packages" / "schemas" / "py"))
import validar  # noqa: E402

from motor import banco, config
from motor.cerebro.sessao import pasta


def pendentes(cfg) -> list[dict]:
    d = pasta(cfg)
    out = []
    for p in sorted(d.glob("*.pedido.md")):
        k = p.name.split(".")[0]
        out.append({"chave": k, "pedido": str(p), "respondido": (d / f"{k}.direcao.json").exists()})
    return out


def validar_respostas(cfg) -> list[str]:
    problemas = []
    for r in sorted(pasta(cfg).glob("*.direcao.json")):
        try:
            d = json.loads(r.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            problemas.append(f"{r.name}: JSON inválido ({e})")
            continue
        problemas += [f"{r.name}: {e}" for e in validar.erros("direcao", d)[:5]]
    return problemas


def responder(cfg, projeto: str) -> dict:
    problemas = validar_respostas(cfg)
    if problemas:
        return {"ok": False, "problemas": problemas}
    con = banco.conectar(cfg.banco)
    with con:
        banco.enfileirar(con, "direcao", projeto, prioridade=1)
        banco.mudar_estado(con, projeto, "dirigindo", "O diretor da sessão respondeu. Montando a direção.")
    return {"ok": True, "projeto": projeto}


def main(argv=None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    cfg = config.carregar()
    if not argv or argv[0] == "pendentes":
        print(json.dumps(pendentes(cfg), ensure_ascii=False, indent=1))
        return 0
    if argv[0] == "responder" and len(argv) > 1:
        r = responder(cfg, argv[1])
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0 if r["ok"] else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
