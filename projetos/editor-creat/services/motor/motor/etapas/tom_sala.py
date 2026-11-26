"""Tom de sala nunca de trecho com voz (onda 4, item 3, D45): o resolvedor escolhe com a MESMA régua que reprova.

Por que existe (Super Kal Black, 26/11): o tom de sala saiu de um trecho com a equipe conversando baixo, longe do microfone.
A transcrição rápida não ouviu ninguém e o envelope passou; a conferência (`qa/tom_sala_sem_voz.conversa_na_origem`) ouviu e
segurou a V1, a V2 e a V3. Antes a busca olhava só o clipe principal, os clipes da fala e os do mesmo ambiente.

Regras:
1. Candidatos, nesta ordem: mesmo ambiente da voz principal (o principal primeiro), depois os outros clipes da fala e, só no
   diálogo (`vozes = varias`), o resto do catálogo (outro ambiente). Com uma voz, fundo de outro lugar não entra. Dentro de cada clipe, o critério de nível que já existia (`Resolvedor._silencios`).
2. Fora: palavra da transcrição (agora a fina) a menos de 0,35 s, e envelope com sílabas (`silabas_teto_db`): os dois já
   estão em `_silencios`.
3. Fora: voz contínua na régua física da conferência (`qa.voz_externa.voz_continua`, piso da fonte + 6 dB por >= 0,4 s),
   medida pelo `ouvinte(arquivo_id, s0, s1) -> [(a, b)]` que a direção monta (`etapas/direcao.ouvinte`). Sem `ouvinte`
   (testes antigos, ferramentas), valem 1 e 2.
4. No máximo 12 candidatos ouvidos por filme (cada um tem até 6 s): segundos de CPU.
5. Sem candidato limpo: SEM tom de sala (o mix fica só com o piso), `origem.tom_sala.motivo` e aviso. Nunca um trecho com voz.
"""
from __future__ import annotations

MAX_OUVIDOS = 12
MAX_RECUSADOS = 8
MOTIVO_SEM = "não achei trecho sem ninguém falando no material"


def ordem(r, L) -> list[str]:
    """Clipes candidatos na ordem de preferência (ids do catálogo, sem repetição)."""
    peso: dict[str, float] = {}
    for v in L["voz"]:
        peso[v["clipe"]] = peso.get(v["clipe"], 0) + v["s1"] - v["s0"]
    principal = max(peso, key=peso.get)
    amb = r._ambiente(principal, L["voz"][0]["s0"])
    todos = [c["id"] for c in r.cat["clipes"]]
    amb_de = {c["id"]: c.get("ambientes") or [] for c in r.cat["clipes"]}
    g1 = [principal] + [c for c in peso if c != principal and amb in amb_de.get(c, [])] \
        + [c for c in todos if c not in peso and amb in amb_de.get(c, [])]
    g2 = [c for c in peso if c not in g1]
    # clipe de OUTRO ambiente, fora da fala, só no diálogo (`vozes = varias`, o caso real das duas câmeras): com uma voz só, um
    # fundo de outro lugar por baixo da fala soa estranho, e vale a regra de antes (melhor sem tom do que tom de outro ambiente)
    g3 = [c for c in todos if c not in g1 and c not in g2] if getattr(r, "vozes", None) == "varias" else []
    vistos, out = set(), []
    for c in g1 + g2 + g3:
        if c not in vistos and c in r.clipe:
            vistos.add(c)
            out.append(c)
    return out


def escolher(r, L, ouvinte=None) -> tuple[dict | None, dict]:
    """(tom_sala do EDL ou None, origem.tom_sala). `r` é o Resolvedor (usa _silencios, fonte_de, clipe e o modelo)."""
    tm = r.m.get("tom_sala", {})
    min_s, db = tm.get("min_s", 1.5), tm.get("db", -48)
    recusados: list[dict] = []
    ouvidos = 0
    for cid in ordem(r, L):
        for s0, s1 in r._silencios(cid, min_s):
            fonte = r.fonte_de(cid, s0)
            if ouvinte is not None:
                if ouvidos >= MAX_OUVIDOS:
                    return None, {"escolhido": None, "recusados": recusados[:MAX_RECUSADOS], "ouvidos": ouvidos,
                                  "motivo": MOTIVO_SEM + f" (ouvi {ouvidos} trechos)"}
                ouvidos += 1
                try:
                    voz = ouvinte(r.clipe[cid]["arquivo"], float(s0), float(s1))
                except Exception as e:  # noqa: BLE001 - trecho que não se ouve não vira tom de sala (a conferência também não o ouviria)
                    recusados.append({"fonte": fonte, "s0": round(s0, 3), "s1": round(s1, 3),
                                      "motivo": f"não consegui ouvir ({type(e).__name__})"})
                    continue
                if voz:
                    recusados.append({"fonte": fonte, "s0": round(s0, 3), "s1": round(s1, 3),
                                      "motivo": "voz contínua em " + ", ".join(f"{a:.2f}-{b:.2f} s" for a, b in voz[:3])})
                    continue
            tom = {"fonte": fonte, "s0": round(s0, 3), "s1": round(s1, 3), "db": db}
            return tom, {"escolhido": {"fonte": fonte, "s0": tom["s0"], "s1": tom["s1"]}, "recusados": recusados[:MAX_RECUSADOS],
                         "ouvidos": ouvidos, "motivo": None}
    return None, {"escolhido": None, "recusados": recusados[:MAX_RECUSADOS], "ouvidos": ouvidos, "motivo": MOTIVO_SEM}
