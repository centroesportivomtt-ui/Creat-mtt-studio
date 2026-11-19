"""frase_repetida: frase de >= 3 palavras repetida >= 3 vezes no MIX além do que o roteiro fala é defeito até prova em contrário
(lição de 17/11: "vai competir" em laço sob o filme inteiro, vindo do tom de sala). Nos stems sem voz (ambiente, som direto),
qualquer frase de 3 palavras que aparece 2 vezes já reprova. Parâmetros da memória (checagem c_frase_repetida) valem.
"""
from collections import Counter

ID, BLOQUEIA = "frase_repetida", True


def _ngramas(toks, n):
    return Counter(tuple(toks[i:i + n]) for i in range(len(toks) - n + 1))


def _params(c):
    try:
        from motor.memoria.loja import Loja
        for ch in Loja().checagens():
            if ch.get("tipo") == "frase_repetida":
                p = ch.get("params") or {}
                return int(p.get("min_palavras", 3)), int(p.get("min_vezes", 3))
    except Exception:  # noqa: BLE001
        pass
    return 3, 3


def checar(c):
    from motor.etapas.qa import normalizar
    n, vezes = _params(c)
    roteiro = " ".join(normalizar(v.get("texto") or "") for v in c.edl.get("voz", []) or [])
    if not roteiro.strip():
        roteiro = " ".join(normalizar(w[2]) for w in c.palavras_legenda())
    esperado = _ngramas(roteiro.split(), n)
    achados, evid, ouvidos = [], [], {}
    fontes = [("mix", c.mix if c.mix is not None else c.final, False, vezes)]
    difuso = bool((c.edl.get("tom_sala") or {}).get("difuso"))
    for nome in ("ambiente", "direto"):
        if nome == "ambiente" and difuso:
            from motor.etapas.qa import modulacao_db     # sem sílaba não há frase (ver tom_sala_sem_voz)
            if nome in c.stems and modulacao_db(c.stems[nome]) <= 2.5:
                continue
        if nome in c.stems:
            fontes.append((nome, c.stems[nome], True, 2))
    for nome, arq, normal, lim in fontes:
        tr = c.transcrever(nome if nome == "mix" else f"stem_{nome}", arq, normalizar_nivel=normal)
        falta = c.nao_verificado(tr, nome if nome == "mix" else f"stem {nome}")
        if falta:
            return falta
        toks = [w[2] for w in c.palavras(tr)]
        ouvidos[nome] = len(toks)
        for ng, k in _ngramas(toks, n).items():
            extra = k - (esperado.get(ng, 0) if nome == "mix" else 0)
            if k >= lim and extra > 0:
                achados.append({"onde": nome, "frase": " ".join(ng), "vezes": k, "no_roteiro": esperado.get(ng, 0) if nome == "mix" else 0})
                if nome != "mix":
                    evid.append(f"stems/{nome}.flac")
    achados.sort(key=lambda a: -a["vezes"])
    if achados:
        a = achados[0]
        return {"ok": False, "valor": achados[:5], "evidencia": sorted(set(evid)),
                "detalhe": f"\"{a['frase']}\" {a['vezes']}x no {a['onde']} (roteiro tem {a['no_roteiro']}x): laço de voz até prova em contrário"}
    return {"ok": True, "valor": {"palavras_ouvidas": ouvidos}, "detalhe": f"sem frase repetida (mix e stems {sorted(ouvidos)})"}
