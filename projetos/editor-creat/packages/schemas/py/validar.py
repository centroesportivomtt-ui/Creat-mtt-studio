"""Validação dos contratos do Editor creat.MTT.

uso:  python3 packages/schemas/py/validar.py               -> valida todos os exemplos
      python3 packages/schemas/py/validar.py edl arquivo.json
Em código:  from validar import validar; validar("edl", obj)   (levanta jsonschema.ValidationError)
"""
import json
import pathlib
import sys

from jsonschema import Draft202012Validator

RAIZ = pathlib.Path(__file__).resolve().parent.parent
NOMES = ("pedido", "analise", "catalogo", "direcao", "edl", "qa", "evento")
_cache = {}


def esquema(nome: str) -> dict:
    if nome not in _cache:
        _cache[nome] = json.loads((RAIZ / f"{nome}.schema.json").read_text(encoding="utf-8"))
    return _cache[nome]


def erros(nome: str, obj) -> list:
    v = Draft202012Validator(esquema(nome))
    return [f"{'/'.join(map(str, e.absolute_path)) or '<raiz>'}: {e.message}" for e in v.iter_errors(obj)]


def validar(nome: str, obj) -> None:
    Draft202012Validator(esquema(nome)).validate(obj)


def main(argv):
    pares = [(argv[1], argv[2])] if len(argv) == 3 else [(n, RAIZ / "exemplos" / f"{n}.json") for n in NOMES]
    falhou = False
    for nome, caminho in pares:
        Draft202012Validator.check_schema(esquema(nome))
        e = erros(nome, json.loads(pathlib.Path(caminho).read_text(encoding="utf-8")))
        print(("OK   " if not e else "FALHA"), nome, caminho)
        for linha in e[:20]:
            print("     ", linha)
        falhou |= bool(e)
    return 1 if falhou else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
