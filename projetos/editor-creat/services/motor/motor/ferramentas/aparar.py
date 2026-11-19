"""Apara um intervalo do FILME de um EDL já resolvido (corte com fechamento: tudo que vem depois anda para trás).

Por que existe (Super Kal, 19/11): o Whisper fundiu "Agora vem... vem comigo" em "Agora vem comigo" e o corte da direção
("de": "vem comigo") caiu no meio do "agora". Só dava para ver lendo a transcrição da mixagem final. Refazer a direção inteira
por causa de 0,6 s não compensa: aqui o intervalo sai do EDL, a peça de voz/plano que começa nele passa a começar mais tarde na
fonte, e voz, planos, textos, legendas, efeitos, sons, blocos, trilha e logos do QA andam juntos.

uso:
  python -m motor.ferramentas.aparar <projeto> <versao> <t_a> <t_b> [--trilha manter|deslocar]
`--trilha deslocar` (padrão): a música também perde o intervalo no começo (o que vem depois do corte fica no mesmo ponto da
música em que foi aprovado). `manter`: a música não muda (o que vem antes do corte fica igual).
Depois: reenfileire a montagem da versão.
"""
from __future__ import annotations

import argparse
import pathlib
import sys

from motor import banco, config
from motor.provedores import armazenamento_de


def aparar(edl: dict, ta: float, tb: float, trilha: str = "deslocar", dur_trilha: float | None = None) -> dict:
    d = tb - ta

    def anda(t: float) -> float:
        return round(t if t <= ta + 0.02 else (ta if t < tb else t - d), 4)   # 20 ms: o que está NO ponto de corte fica

    for chave in ("voz", "planos"):
        novas = []
        for p in edl.get(chave, []):
            t0, t1 = p["t0"], p["t1"]
            if t0 >= ta and t1 <= tb:
                continue                                        # peça inteira dentro do corte
            if ta <= t0 < tb:                                   # começa dentro: entra mais tarde na fonte
                p["s0"] = round(p["s0"] + (tb - t0) * float(p.get("vel", 1.0) or 1.0), 4)
            elif t0 < ta and t1 > tb:                           # atravessa o corte: não dá para fechar sem partir a peça
                raise SystemExit(f"{chave} {p.get('id')} atravessa o intervalo; apare num ponto de corte entre peças")
            if t0 < ta < t1 <= tb and "s1" in p:
                p["s1"] = round(p["s1"] - (t1 - ta) * float(p.get("vel", 1.0) or 1.0), 4)
            p["t0"], p["t1"] = anda(t0), anda(t1)
            novas.append(p)
        edl[chave] = novas
    for b in edl.get("blocos", []):
        b["t0"], b["t1"] = anda(b["t0"]), anda(b["t1"])
    for m in edl.get("motion", []):
        # camada que já estava na tela antes do corte e acabava dentro dele (transição no ponto de corte) mantém a duração
        m["de"], m["ate"] = anda(m["de"]), (m["ate"] if m["de"] <= ta + 0.02 and m["ate"] < tb else anda(m["ate"]))
    edl["motion"] = [m for m in edl.get("motion", []) if m["ate"] - m["de"] > 0.2]
    for lista in ("fx", "sfx"):
        edl[lista] = [dict(x, t=anda(x["t"])) for x in edl.get(lista, []) if not ta + 0.02 < x["t"] < tb]
    leg = edl.get("legendas") or {}
    leg["palavras"] = [[anda(w[0]), anda(w[1]), *w[2:]] for w in leg.get("palavras", []) if not (w[0] >= ta and w[1] <= tb)]
    leg["palavras"] = [w for w in leg["palavras"] if w[1] - w[0] > 0.03]
    for g in (edl.get("qa") or {}).get("logos", []):
        g["t"] = anda(g["t"])
    tr = edl.get("trilha") or {}
    if tr.get("chave"):
        if tr.get("acorde_final"):
            tr["acorde_final"] = anda(tr["acorde_final"])
        em = tr.get("emendas") or []
        if trilha == "deslocar":
            if not em:
                tr["emendas"] = [[0.0, round(d, 4), round(dur_trilha or 1e4, 3), 0.0]]
            else:
                tr["emendas"] = [[e[0], round(e[1] + d, 4), e[2], e[3]] if e[0] <= ta else [anda(e[0]), e[1], e[2], e[3]] for e in em]
        else:
            tr["emendas"] = [[anda(e[0]), *e[1:]] for e in em]
    edl["duracao"] = round(edl["duracao"] - d, 4)
    return edl


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto"); ap.add_argument("versao")
    ap.add_argument("ta", type=float); ap.add_argument("tb", type=float)
    ap.add_argument("--trilha", choices=("manter", "deslocar"), default="deslocar")
    a = ap.parse_args(argv)
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    chave = f"saidas/{a.projeto}/{a.versao}/edl.json"
    edl = arm.ler_json(chave)
    dur_tr = None
    if (edl.get("trilha") or {}).get("chave"):
        import soundfile as sf
        dur_tr = sf.info(arm.caminho_local(edl["trilha"]["chave"])).duration
    edl = aparar(edl, a.ta, a.tb, a.trilha, dur_tr)
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "packages" / "schemas" / "py"))
    import validar
    erros = validar.erros("edl", edl)
    if erros:
        print("EDL inválido depois de aparar:", erros[:4])
        return 1
    arm.gravar_json(chave, edl)
    con = banco.conectar(cfg.banco)
    with con:
        banco.enfileirar(con, "montagem", a.projeto, a.versao, prioridade=1)
    print(f"{a.versao}: saiu {a.tb - a.ta:.3f} s em {a.ta:.3f}; duração {edl['duracao']:.2f} s; montagem na fila")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
