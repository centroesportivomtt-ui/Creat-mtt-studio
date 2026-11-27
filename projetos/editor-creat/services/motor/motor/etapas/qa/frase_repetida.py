"""frase_repetida: frase de >= 3 palavras repetida >= 3 vezes no MIX além do que o roteiro fala é defeito até prova em contrário
(lição de 17/11: "vai competir" em laço sob o filme inteiro, vindo do tom de sala). Nos stems sem voz (ambiente, som direto),
qualquer frase de 3 palavras que aparece 2 vezes já reprova. Parâmetros da memória (checagem c_frase_repetida) valem.

Diálogo (onda 4, D46, SÓ com `edl.origem.vozes == "varias"`; em "uma" e no automático nada muda): no diálogo a mesma frase
volta de verdade ("vem pro super kal" dito por um e repetido pelo outro, ou ouvido também no som direto da outra câmera) e o
`texto` das peças não conta todas. Então, no MIX, o esperado de cada frase passa a ser o MAIOR entre o roteiro e as JANELAS
DE FONTE que estão no filme (cada peça de voz de `s0` ao fim real na fonte; cada plano com som direto de `s0` a
`s0 + (t1 - t0) * vel`; janelas da mesma fonte que se sobrepõem viram uma só, para a mesma fala não contar duas vezes),
transcritas pelo MESMO transcritor da conferência (`c.transcrever_janela`: o mix e a fonte erram igual). Frase repetida que
existe nessas janelas o mesmo número de vezes não é laço; uma vez a mais já é. O stem `ambiente` NUNCA afrouxa (o tom de sala
não é diálogo). O stem `direto` só afrouxa com as janelas dos planos que a `voz_externa` aceitou como o próprio diálogo da cena
(`voz_externa.cena_do_som_direto`). Janela que não se transcreve não conta (sem prova, vale o roteiro).
"""
from collections import Counter

ID, BLOQUEIA = "frase_repetida", True


def janelas_direto(edl: dict, folga: float = 0.3) -> list[tuple[float, float]]:
    """Trechos do filme (s) em que o stem direto tem som: os planos com som_direto_db, com folga nas pontas."""
    return [(float(p["t0"]) - folga, float(p["t1"]) + folga) for p in edl.get("planos") or []
            if p.get("som_direto_db") is not None and p.get("t1") is not None]


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


def _uniao(janelas: list[tuple[float, float]]) -> list[tuple[float, float]]:
    out: list = []
    for a, b in sorted(janelas):
        if out and a <= out[-1][1] + 0.05:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def janelas_no_filme(edl: dict, planos_ids: set | None = None) -> dict[str, list[tuple[float, float]]]:
    """Função pura: fonte -> janelas de fonte (unidas) que tocam no filme: peças de voz (s0 ao fim real) e planos com som
    direto (s0 a s0 + (t1 - t0) * vel). `planos_ids` dado: só esses planos e nenhuma peça de voz (o stem direto)."""
    from motor.etapas.qa.fala_cortada import fim_na_fonte
    por: dict = {}
    if planos_ids is None:
        for v in edl.get("voz") or []:
            a, b = float(v["s0"]), fim_na_fonte(v)
            if b > a:
                por.setdefault(v["fonte"], []).append((a, b))
    for p in edl.get("planos") or []:
        if p.get("som_direto_db") is None or (planos_ids is not None and p["id"] not in planos_ids):
            continue
        a = float(p["s0"])
        b = a + (float(p["t1"]) - float(p["t0"])) * float(p.get("vel", 1.0) or 1.0)
        if b > a:
            por.setdefault(p["fonte"], []).append((a, b))
    return {f: _uniao(j) for f, j in sorted(por.items())}


def esperado_das_janelas(c, janelas: dict, n: int) -> tuple[Counter, int]:
    """n-gramas das janelas de fonte, transcritas pelo transcritor da conferência; e quantas janelas foram ouvidas."""
    tot, ouvidas = Counter(), 0
    for fid, js in janelas.items():
        for a, b in js:
            try:
                tr = c.transcrever_janela(fid, a, b)
            except Exception:  # noqa: BLE001 - janela que não se lê não conta (sem prova, vale o roteiro)
                tr = None
            if not tr or tr.get("erro"):
                continue
            ouvidas += 1
            tot += _ngramas([w[2] for w in c.palavras(tr)], n)
    return tot, ouvidas


def _maior(a: Counter, b: Counter) -> Counter:
    return Counter({k: max(a.get(k, 0), b.get(k, 0)) for k in set(a) | set(b)})


def checar(c):
    from motor.etapas.qa import normalizar
    n, vezes = _params(c)
    roteiro = " ".join(normalizar(v.get("texto") or "") for v in c.edl.get("voz", []) or [])
    if not roteiro.strip():
        roteiro = " ".join(normalizar(w[2]) for w in c.palavras_legenda())
    esperado = _ngramas(roteiro.split(), n)
    dialogo = str((c.edl.get("origem") or {}).get("vozes") or "auto") == "varias" and getattr(c, "fontes", None) is not None
    esperado_direto, nota = Counter(), ""
    if dialogo:
        ej, k_mix = esperado_das_janelas(c, janelas_no_filme(c.edl), n)
        esperado = _maior(esperado, ej)
        aceitos = set()
        if "direto" in (getattr(c, "stems", None) or {}):
            from motor.etapas.qa import voz_externa as VE
            voz = c.edl.get("voz") or []
            for p in c.edl.get("planos") or []:
                if p.get("som_direto_db") is not None:
                    try:
                        if VE.cena_do_som_direto(c, p, voz)["aceito"]:
                            aceitos.add(p["id"])
                    except Exception:  # noqa: BLE001 - sem prova de que é o diálogo: o stem direto não afrouxa para ele
                        pass
            if aceitos:
                esperado_direto, _ = esperado_das_janelas(c, janelas_no_filme(c.edl, aceitos), n)
        nota = f"; diálogo: {k_mix} janela(s) de fonte ouvida(s) no esperado do mix" + (
            f", som direto do diálogo aceito em {', '.join(sorted(aceitos))}" if aceitos else "")
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
        pal = c.palavras(tr)
        if nome == "direto":
            # 27/11 (V9 dos Bastidores): o stem direto só tem som nos planos com som_direto_db; o resto é silêncio, que a
            # normalização de nível sobe até o Whisper inventar ("e o que" 74x num stem com 2,2 s de som). Palavra fora das
            # janelas com som direto não existe no filme: não conta.
            jan = janelas_direto(c.edl)
            pal = [w for w in pal if any(a <= float(w[0]) <= b for a, b in jan)]
        toks = [w[2] for w in pal]
        ouvidos[nome] = len(toks)
        for ng, k in _ngramas(toks, n).items():
            esp = esperado.get(ng, 0) if nome == "mix" else (esperado_direto.get(ng, 0) if nome == "direto" else 0)
            extra = k - esp
            if k >= lim and extra > 0:
                achados.append({"onde": nome, "frase": " ".join(ng), "vezes": k, "no_roteiro": esp})
                if nome != "mix":
                    evid.append(f"stems/{nome}.flac")
    achados.sort(key=lambda a: -a["vezes"])
    if achados:
        a = achados[0]
        return {"ok": False, "valor": achados[:5], "evidencia": sorted(set(evid)),
                "detalhe": f"\"{a['frase']}\" {a['vezes']}x no {a['onde']} ({'roteiro e fonte têm' if dialogo else 'roteiro tem'} "
                           f"{a['no_roteiro']}x): laço de voz até prova em contrário" + nota}
    return {"ok": True, "valor": {"palavras_ouvidas": ouvidos}, "detalhe": f"sem frase repetida (mix e stems {sorted(ouvidos)})" + nota}
