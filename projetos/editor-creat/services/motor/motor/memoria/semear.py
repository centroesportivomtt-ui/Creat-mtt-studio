"""A memória da casa tem de sobreviver a cada publicação (fila do dono, item B).

No servidor de um contêiner só (Railway), `projetos/editor-creat/memoria` fica DENTRO da imagem: cada deploy troca a
imagem e apagaria as regras que o dono ensinou reprovando, os casos aprovados e os estudos de caso. Por isso o
`deploy/iniciar.sh` aponta EDITOR_MEMORIA para o volume (`/dados/memoria`) e roda este módulo a cada boot:

    python -m motor.memoria.semear            # junta a memória do git (imagem) com a do volume

Regra da junção (pode rodar quantas vezes for, dá sempre o mesmo resultado):
- `regras.json` (regras e vocabulário) e `checagens.json`: tudo o que está no git entra (o git manda no texto de um id que
  ele conhece) + tudo o que o servidor aprendeu e o git ainda não tem (ids novos). Nada aprendido se perde;
- `casos/` e `referencias/`: o que falta no volume é copiado; o que já está lá fica;
- `modos/`, `modelos/`, `cor/` e `README.md` são do código: copiados por cima.
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import sys
import time

DO_CODIGO = ("modos", "modelos", "cor")
APRENDIDO = ("casos", "referencias")


def _ler(p: pathlib.Path, padrao):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return padrao


def _gravar(p: pathlib.Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, p)


def _unir(do_git: list, do_volume: list, chave: str) -> tuple[list, int]:
    """Itens do git + itens do volume que o git não tem (pela chave). Devolve (lista, quantos só o servidor tinha)."""
    conhecidos = {x.get(chave) for x in do_git if isinstance(x, dict)}
    so_servidor = [x for x in do_volume if isinstance(x, dict) and x.get(chave) not in conhecidos]
    return list(do_git) + so_servidor, len(so_servidor)


def semear(git: pathlib.Path, volume: pathlib.Path) -> dict:
    git, volume = pathlib.Path(git).resolve(), pathlib.Path(volume).resolve()
    if volume == git or git in volume.parents:
        return {"feito": False, "motivo": "a memória em uso é a do próprio repositório"}
    volume.mkdir(parents=True, exist_ok=True)
    rel = {"feito": True, "regras_do_servidor": 0, "vocabulario_do_servidor": 0, "checagens_do_servidor": 0, "copiados": 0}
    rg, rv = _ler(git / "regras.json", {"versao": "1", "regras": [], "vocabulario": []}), _ler(volume / "regras.json", {})
    regras, rel["regras_do_servidor"] = _unir(rg.get("regras", []), rv.get("regras", []), "id")
    voc, rel["vocabulario_do_servidor"] = _unir(rg.get("vocabulario", []), rv.get("vocabulario", []), "de")
    # lápides (onda 3): o que o dono apagou no Caderno não volta do git. O apagados.json é só do volume: nunca vem do git
    # e nunca é sobrescrito aqui
    from motor.memoria.loja import APAGADOS, id_vocabulario
    lap = _ler(volume / APAGADOS, {})
    lap = lap if isinstance(lap, dict) else {}
    fora_r, fora_c, fora_v = (set((lap.get(t) or {}).keys()) for t in ("regras", "checagens", "vocabulario"))
    regras = [x for x in regras if not (isinstance(x, dict) and x.get("id") in fora_r)]
    voc = [x for x in voc if not (isinstance(x, dict) and id_vocabulario(x.get("de", "")) in fora_v)]
    rel["apagados_respeitados"] = len(fora_r) + len(fora_c) + len(fora_v)
    _gravar(volume / "regras.json", {**rg, "regras": regras, "vocabulario": voc})
    cg, cv = _ler(git / "checagens.json", {"versao": "1", "checagens": []}), _ler(volume / "checagens.json", {})
    checagens, rel["checagens_do_servidor"] = _unir(cg.get("checagens", []), cv.get("checagens", []), "id")
    checagens = [x for x in checagens if not (isinstance(x, dict) and x.get("id") in fora_c)]
    _gravar(volume / "checagens.json", {**cg, "checagens": checagens})
    for nome in DO_CODIGO:
        if (git / nome).is_dir():
            shutil.copytree(git / nome, volume / nome, dirs_exist_ok=True)
    if (git / "README.md").exists():
        shutil.copyfile(git / "README.md", volume / "README.md")
    for nome in APRENDIDO:
        (volume / nome).mkdir(exist_ok=True)
        if not (git / nome).is_dir():
            continue
        for item in sorted((git / nome).iterdir()):
            destino = volume / nome / item.name
            if destino.exists():
                continue
            if item.is_dir():
                shutil.copytree(item, destino)
            else:
                shutil.copyfile(item, destino)
            rel["copiados"] += 1
    rel["casos"] = sum(1 for _ in (volume / "casos").iterdir())
    rel["referencias"] = sum(1 for x in (volume / "referencias").iterdir() if x.suffix == ".json")
    _gravar(volume / ".semeado.json", {**rel, "em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    return rel


def main(argv=None) -> int:
    from motor import config
    alvo = os.environ.get("EDITOR_MEMORIA", "").strip()
    if not alvo:
        print("memória: EDITOR_MEMORIA não definida; usando a do repositório (nada a juntar)")
        return 0
    rel = semear(config.MEMORIA, pathlib.Path(alvo))
    print("memória:", json.dumps(rel, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
