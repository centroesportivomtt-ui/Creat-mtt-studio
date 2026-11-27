"""Corte de fala pelo SOM, dentro da montagem (onda 4, item 2, D44): passo `montagem.cortes`, depois de `fatos.revisar` e antes
de o render ser reaproveitado ou refeito.

Por que existe (Super Kal Black, 26/11): o resolvedor corta no fim de palavra do Whisper, que marca o fim de 0,1 a 0,5 s antes
de a voz acabar, e a conferência segurava a versão em `fala_cortada`. A ferramenta `ajustar_cortes` resolvia, mas era só à mão
e alongava o filme a cada rodada (provado no teste 2.1: 2,11 s -> 2,14 s na segunda rodada, com o corte reprovado nas duas).

A causa: o respiro novo era `fim + min(0,09; pausa - 0,13)` com piso de 30 ms. Com pausa curta, o corte ficava a 30 ms do fim
da voz; na rodada seguinte `fim_da_fala` via a voz "soando" nos 60 ms antes do corte, achava o fim no próprio corte e somava
mais 30 ms. Quando o corte passava de 60 ms do fim, a palavra seguinte a menos de 120 ms parecia "voz retomando" (oclusão) e
o fim pulava para o fim da PRÓXIMA palavra. Correção, em duas partes juntas (a marca sozinha esconderia o defeito; a correção
sozinha não protege de quem edita o EDL):

1. Causa: só mexe na ponta (fim ou começo) que REPROVA na régua 1 da conferência (`qa.fala_cortada.conferir_pecas`, com
   `audio_fala.corte_final_ok`/`corte_inicial_ok` no envelope do arquivo inteiro da fonte a 16 kHz, igual à conferência). O
   fim novo é escolhido para PASSAR nessa régua: pelo menos 50 ms depois do fim da voz e pelo menos 130 ms antes da voz
   voltar. Pausa curta demais para as duas coisas: corta no meio da pausa e anota "OUVIR". O fim nunca passa do começo da
   palavra seguinte da transcrição (nada de comer a próxima palavra). Corte que já passa fica como está.
2. Marca: `edl.origem.cortes_audio.voz` = hash da lista de voz DEPOIS do ajuste. Rodar de novo com a mesma voz não faz nada.

`qa.cortes_confirmados` (ouvido pelo diretor) continua intocado. Peças vizinhas da mesma fonte só viram uma quando uma das
pontas mexidas encosta na outra (< 0,30 s na fonte): o aperto de pausa do resolvedor fica como ele fez. O resto do filme
(planos, blocos, motion, legendas, fx, sfx, sons reais, logos, trilha e faixas) passa por um mapa de tempo antigo -> novo.
Música com UMA emenda acompanha a duração nova quando a música tem sobra; com várias emendas, aviso para conferir a emenda.
Qualquer falha (fonte sem áudio, exceção): o EDL fica como veio e o relatório diz por quê. A conferência continua sendo a régua.
"""
from __future__ import annotations

import copy
import hashlib
import json
import pathlib

import numpy as np

from motor import audio_fala as AF

ALGO = "cortes-2"
SR = 16000                  # o mesmo da conferência (qa/fala_cortada.SR_FALA): a decisão de quem corta bate com a de quem confere
RESPIRO = 0.09              # respiro preferido depois do fim da voz
FOLGA_MIN = 0.05            # corte_final_ok reprova voz nos 40 ms antes do corte: 50 ms dá a margem de um quadro do envelope
SILENCIO_DEPOIS = 0.13      # corte_final_ok reprova voz voltando em até 120 ms: 130 ms dá a margem
JUNTAR = 0.30               # pontas mexidas da mesma fonte mais próximas que isto viram uma peça só
PRE = 0.05
LONGE = 0.6                 # fim da voz a mais que isto do corte: é outra frase colada, corta no vale
PAUSA_MIN = 0.13            # silêncio em volta do corte a partir disto é pausa entre palavras, não oclusão (oclusão: até ~100 ms)
NOTAS_MAX = 20
ESTENDER_MAX = 1.6          # 27/11: "deixa a frase terminar" anda no máximo isto para frente, até uma pausa de verdade


# ------------------------------------------------------------------ marca
def hash_voz(voz: list[dict]) -> str:
    """Assinatura da lista de voz (só o que define o corte): ids, fontes e tempos, na ordem do filme."""
    chave = [[v.get("id"), v.get("fonte"), round(float(v["s0"]), 3), round(float(v["s1"]), 3), round(float(v["t0"]), 3),
              round(float(v["t1"]), 3), round(float(v.get("vel", 1.0) or 1.0), 4)] for v in sorted(voz, key=lambda v: v["t0"])]
    return hashlib.sha256(json.dumps(chave).encode()).hexdigest()[:16]


def ja_ajustado(edl: dict) -> bool:
    m = (edl.get("origem") or {}).get("cortes_audio") or {}
    return m.get("algo") == ALGO and m.get("voz") == hash_voz(edl.get("voz") or [])


# ------------------------------------------------------------------ leitura das fontes
def envelopes(edl: dict, fontes, cfg=None) -> tuple[dict, dict]:
    """{fonte: envelope a 16 kHz do arquivo inteiro} e {fonte: offset}, como a conferência (qa/fala_cortada.envelope_fonte)."""
    from motor.etapas.montagem.comum import ler_audio
    envs, offs = {}, {}
    for fid in sorted({v["fonte"] for v in edl.get("voz") or []}):
        x = ler_audio(fontes.audio(fid), sr=SR, cfg=cfg)
        envs[fid] = AF.envelope(x, SR)
        offs[fid] = float(fontes.offset(fid))
    return envs, offs


def palavras(fontes, fid: str) -> list:
    """Palavras da transcrição da fonte (analise.json ao lado do áudio); sem análise (clipe pronto): []."""
    try:
        arq = pathlib.Path(fontes.audio(fid)).parent / "analise.json"
        if not arq.exists():
            return []
        from motor.etapas.resolvedor import palavras_do_arquivo
        return palavras_do_arquivo(json.loads(arq.read_text(encoding="utf-8")))
    except Exception:  # noqa: BLE001 - sem transcrição, vale só o som
        return []


# ------------------------------------------------------------------ régua: o que reprova hoje
def reprovadas(voz: list[dict], envs: dict, offs: dict) -> set[tuple[str, str]]:
    """{(id, "fim"|"inicio")} que a régua 1 da conferência reprova (a mesma função, não uma cópia)."""
    from motor.etapas.qa.fala_cortada import conferir_pecas
    return {(p["id"], p["onde"]) for p in conferir_pecas(voz, envs, offs)}


def _fim_novo(env: dict, s1: float, teto: float | None) -> tuple[float, str]:
    """Fim (tempo do arquivo) que passa em corte_final_ok, ou o melhor possível com a nota do porquê."""
    f = AF.fim_da_fala(env, s1, silencio=0.08)
    if f["retoma"] and not f["soando"]:
        # corte num silêncio com a voz voltando logo depois: oclusão de "t/p/k" (até ~100 ms) ou a PAUSA entre duas palavras
        # (o corte que uma rodada anterior pôs no meio de uma pausa curta). Na pausa, estender comeria a palavra seguinte.
        e, lim = env["db"], env["limiar"]
        j = min(len(e), int(round(s1 / AF.PASSO)))
        a, b = j, j
        while a > 0 and e[a - 1] <= lim:
            a -= 1
        while b < len(e) and e[b] <= lim:
            b += 1
        if (b - a) * AF.PASSO >= PAUSA_MIN:
            # pausa que cabe a folga depois da voz E o silêncio antes da próxima palavra: o corte anda o mínimo para dentro dela
            # (antes ficava onde estava, perto da palavra seguinte, e a conferência segurava a versão por fala_cortada)
            lo, hi = a * AF.PASSO + FOLGA_MIN, b * AF.PASSO - SILENCIO_DEPOIS
            if teto is not None:
                hi = min(hi, teto)
            if hi >= lo:
                novo = round(float(np.clip(s1, lo, hi)), 3)
                return novo, f"corte numa pausa de {(b - a) * 10:.0f} ms: {'fica' if abs(novo - s1) < 1e-4 else f'anda {novo - s1:+.2f} s'} dentro da pausa"
            return s1, f"corte numa pausa de {(b - a) * 10:.0f} ms com a palavra seguinte logo depois: fica, OUVIR"
    if f["fim"] is None or f["fim"] - s1 > LONGE:
        return max(s1, f["vale"]), "fim no vale (palavra seguinte colada): OUVIR"
    if teto is not None and f["fim"] > teto + 0.03:
        # o "fim" achado é o da PRÓXIMA palavra (a voz voltou antes de calar): corta no ponto mais baixo antes dela
        a, b = int(round(s1 / AF.PASSO)), int(round(max(s1 + 0.02, teto) / AF.PASSO))
        e = env["db"]
        vale = (a + int(np.argmin(e[a:b]))) * AF.PASSO if b > a and b <= len(e) else s1
        return max(s1, round(vale, 3)), "palavra seguinte colada na transcrição: corte no vale, OUVIR"
    lo, hi = f["fim"] + FOLGA_MIN, f["fim"] + f["pausa"] - SILENCIO_DEPOIS
    if teto is not None:
        hi = min(hi, teto)
    if hi >= lo:
        return max(s1, round(max(lo, min(f["fim"] + RESPIRO, hi)), 3)), f"fim +{max(s1, max(lo, min(f['fim'] + RESPIRO, hi))) - s1:.2f}"
    meio = f["fim"] + max(0.0, f["pausa"]) / 2
    return max(s1, round(meio, 3)), f"pausa de {f['pausa'] * 1000:.0f} ms antes da palavra seguinte: corte no meio, OUVIR"


def _deixar_terminar(env: dict, s1: float, limite: float | None = None) -> float | None:
    """27/11 (Bastidores Super Kal, V1-V3 seguradas por fala_cortada): quando a palavra seguinte vem colada e não há como
    cortar sem partir a fala, a frase segue até a primeira PAUSA de verdade (até ESTENDER_MAX s), e o corte vai para dentro
    dela, desde que passe na mesma régua da conferência. `limite` (tempo do arquivo): não passa daqui (outra peça da mesma
    fonte começa ali; repetir fala é pior). None = não achou."""
    e, lim, P = env["db"], env["limiar"], AF.PASSO
    j = max(0, int(round(s1 / P)))
    fim = min(len(e), j + int(round(ESTENDER_MAX / P)))
    k = j
    while k < fim:
        if e[k] > lim:
            k += 1
            continue
        a = k
        while k < len(e) and e[k] <= lim:
            k += 1
        if (k - a) * P < PAUSA_MIN + FOLGA_MIN:
            continue
        for cand in (a * P + RESPIRO, a * P + FOLGA_MIN + 0.02, (a + k) * P / 2):
            cand = round(cand, 3)
            if cand <= s1 or cand > (k * P - SILENCIO_DEPOIS) + 1e-6 or (limite is not None and cand > limite):
                continue
            if AF.corte_final_ok(env, cand)[0]:
                return cand
        if limite is not None and a * P > limite:
            return None
    return None


def _inicio_novo(env: dict, s0: float, pal: list) -> tuple[float, str | None]:
    """Começo (tempo do arquivo) para o corte que reprova em corte_inicial_ok (a regra da ferramenta ajustar_cortes)."""
    if AF.comeco_colado(env, s0) is not None and not (AF._pico(env["db"], s0 - 0.06, s0) > env["limiar"]):
        return s0, "começo colado em outra fala (resto de palavra?): OUVIR"
    i = AF.inicio_da_fala(env, s0)
    ws = [w for w in pal if w[0] >= s0 - 0.05]
    w0 = ws[0][0] if ws else s0
    if i["inicio"] is not None and i["inicio"] >= w0 - 0.25:
        return round(max(0.0, i["inicio"] - PRE), 3), f"começo -{s0 - max(0.0, i['inicio'] - PRE):.2f}"
    return round(i["vale"], 3), "começo no vale (palavra anterior colada): OUVIR"


def novos_limites(edl: dict, envs: dict, offs: dict, pals: dict | None = None, forcar: dict | None = None) -> list[dict]:
    """Peças de voz (ordem do filme) com `_s0`/`_s1` novos (tempo da fonte, como no EDL), `_nota` e `_mexeu` ("fim"/"inicio").
    Só a ponta reprovada na régua 1 muda; `forcar` = {id: {"s0", "s1"}} põe o ponto escolhido por quem ouviu."""
    pals = pals or {}
    vz = sorted(copy.deepcopy(edl["voz"]), key=lambda v: v["t0"])
    ruins = reprovadas(vz, envs, offs)
    confirmados = set((edl.get("qa") or {}).get("cortes_confirmados") or [])
    for v in vz:
        v["_s0"], v["_s1"], v["_nota"], v["_mexeu"] = v["s0"], v["s1"], [], set()
        if v["id"] in confirmados:
            if (v["id"], "fim") in ruins or (v["id"], "inicio") in ruins:
                v["_nota"].append("corte confirmado de ouvido: não mexe")
            continue
        env, off = envs[v["fonte"]], float(offs.get(v["fonte"], 0.0))
        pal = pals.get(v["fonte"]) or []
        if (v["id"], "fim") in ruins:
            from motor.etapas.qa.fala_cortada import fim_na_fonte
            fim = fim_na_fonte(v)
            prox = next((w[0] for w in pal if w[0] >= fim + 0.02), None)          # começo da palavra seguinte (tempo do arquivo)
            teto = (prox - off - 0.02) if prox is not None else None
            s1n, nota = _fim_novo(env, fim - off, teto)
            if "OUVIR" in nota:
                outros = [o["s0"] - off for o in vz if o is not v and o["fonte"] == v["fonte"] and o["s0"] - off > fim - off + 0.05]
                ext = _deixar_terminar(env, fim - off, (min(outros) - 0.05) if outros else None)
                if ext is not None and ext > s1n:
                    s1n, nota = ext, f"frase completa até a pausa: +{ext - (fim - off):.2f} s"
            v["_s1"] = round(s1n + off, 3)
            if abs(v["_s1"] - v["s1"]) > 1e-4:
                v["_mexeu"].add("fim")
            v["_nota"].append(nota)
        if (v["id"], "inicio") in ruins:
            s0n, nota = _inicio_novo(env, v["s0"] - off, pal)
            v["_s0"] = round(s0n + off, 3)
            if abs(v["_s0"] - v["s0"]) > 1e-4:
                v["_mexeu"].add("inicio")
            if nota:
                v["_nota"].append(nota)
        if forcar and v["id"] in forcar:
            for lado in ("s0", "s1"):
                if lado in forcar[v["id"]]:
                    v["_" + lado] = float(forcar[v["id"]][lado])
                    v["_mexeu"].add("fim" if lado == "s1" else "inicio")
                    v["_nota"].append(f"{lado} forçado em {v['_' + lado]:.2f}")
    return vz


# ------------------------------------------------------------------ o filme se reacomoda
def _pode_juntar(g: dict, v: dict) -> bool:
    ult = g["pecas"][-1]
    mexida = "fim" in ult["_mexeu"] or "inicio" in v["_mexeu"] or g.get("_forcar_juntar")
    return (g["fonte"] == v["fonte"] and abs(g["vel"] - v["vel"]) < 1e-6 and v["_s0"] - g["_s1"] < JUNTAR
            and v["s0"] >= ult["s1"] - 0.03 and v.get("ganho_db", 0) == g["ganho_db"] and bool(mexida))


def aplicar(edl: dict, vz: list[dict], duracao_musica=None, juntar_tudo: bool = False) -> tuple[dict, list[dict], list[str]]:
    """EDL novo (cópia), relatório por peça e avisos. `duracao_musica(chave) -> s | None` deixa a emenda única acompanhar."""
    antigo_dur = edl["duracao"]
    grupos: list[dict] = []
    for v in vz:
        g = grupos[-1] if grupos else None
        if g and (_pode_juntar(g, v) or (juntar_tudo and g["fonte"] == v["fonte"] and abs(g["vel"] - v["vel"]) < 1e-6
                                         and v["_s0"] - g["_s1"] < JUNTAR and v["s0"] >= g["pecas"][-1]["s1"] - 0.03
                                         and v.get("ganho_db", 0) == g["ganho_db"])):
            g["_s1"] = max(g["_s1"], v["_s1"])
            g["pecas"].append(v)
            g["texto"] = ((g.get("texto") or "") + " " + (v.get("texto") or "")).strip() or None
        else:
            grupos.append({**{k: v[k] for k in v if not k.startswith("_")}, "_s0": v["_s0"], "_s1": v["_s1"], "pecas": [v],
                           "ganho_db": v.get("ganho_db", 0)})
    # tempo novo de cada grupo, mantendo os intervalos (o pequeno só encolhe o que ESTA rodada acrescentou, até 80 ms)
    t = None
    for k, g in enumerate(grupos):
        p0 = g["pecas"][0]
        if t is None:
            t0 = max(0.0, p0["t0"] - max(0.0, p0["s0"] - g["_s0"]) / g["vel"])
        else:
            ant = grupos[k - 1]["pecas"][-1]
            vao = p0["t0"] - ant["t1"]
            ganho = (max(0.0, grupos[k - 1]["_s1"] - ant["s1"]) + max(0.0, p0["s0"] - g["_s0"])) / g["vel"]
            t0 = t + (vao if vao > 0.4 or ganho <= 0 else max(0.03, vao - min(0.08, ganho)))
        g["_t0"] = round(t0, 4)
        g["_t1"] = round(t0 + (g["_s1"] - g["_s0"]) / g["vel"], 4)
        t = g["_t1"]
    # mapa antigo -> novo (âncoras: começo e fim de cada peça antiga)
    olds, news = [], []
    for g in grupos:
        for p in g["pecas"]:
            for s, tt in ((p["s0"], p["t0"]), (p["s1"], p["t1"])):
                olds.append(tt)
                news.append(float(np.clip(g["_t0"] + (s - g["_s0"]) / g["vel"], g["_t0"], g["_t1"])))
    if olds and olds[0] > 0:
        olds.insert(0, 0.0)
        news.insert(0, max(0.0, news[0] - olds[1]))
    fim_novo = (news[-1] + (antigo_dur - olds[-1])) if olds else antigo_dur
    olds.append(antigo_dur + 1e-6)
    news.append(fim_novo)
    olds_a, news_a = np.maximum.accumulate(np.array(olds)), np.maximum.accumulate(np.array(news))

    def f(tt: float) -> float:
        if tt >= olds_a[-1]:
            return round(float(news_a[-1] + (tt - olds_a[-1])), 4)
        return round(float(np.interp(tt, olds_a, news_a)), 4)

    novo = copy.deepcopy(edl)

    def grupo_sinc(pl):
        melhor, cob = None, 0.0
        for g in grupos:
            for p in g["pecas"]:
                a, b = max(pl["t0"], p["t0"]), min(pl["t1"], p["t1"])
                if b - a > cob and pl["fonte"] == p["fonte"]:
                    tm = (a + b) / 2
                    if abs((pl["s0"] + (tm - pl["t0"]) * pl.get("vel", 1.0)) - (p["s0"] + (tm - p["t0"]) * p["vel"])) < 0.25:
                        melhor, cob = g, b - a
        return melhor
    for pl in novo["planos"]:
        g = grupo_sinc(pl)
        t0n, t1n = f(pl["t0"]), f(pl["t1"])
        if g is not None:
            pl["s0"] = round(g["_s0"] + (t0n - g["_t0"]) * g["vel"], 4)
        pl["t0"], pl["t1"] = t0n, t1n
    novo["planos"] = [p for p in novo["planos"] if p["t1"] - p["t0"] > 0.02]
    novo["voz"] = []
    for g in grupos:
        v = {k: g[k] for k in g if not k.startswith("_") and k != "pecas"}
        v.update(s0=g["_s0"], s1=g["_s1"], t0=g["_t0"], t1=g["_t1"])
        novo["voz"].append(v)
    for b in novo.get("blocos", []):
        b["t0"], b["t1"] = f(b["t0"]), f(b["t1"])
    for m in novo.get("motion", []):
        m["de"], m["ate"] = f(m["de"]), f(m["ate"])
        for it in (m.get("props") or {}).get("itens", []) or []:
            if isinstance(it, dict) and "t" in it:
                it["t"] = f(it["t"])
    for lista in ("fx", "sfx"):
        for x in novo.get(lista, []):
            x["t"] = f(x["t"])
    for s in novo.get("sons_reais") or []:
        s["t0"], s["t1"] = f(s["t0"]), f(s["t1"])
    leg = novo.get("legendas") or {}
    if "palavras" in leg:
        leg["palavras"] = [[f(w[0]), f(w[1]), *w[2:]] for w in leg.get("palavras", [])]
    for lg in (novo.get("qa") or {}).get("logos", []):
        lg["t"] = f(lg["t"])
    avisos: list[str] = []
    novo["duracao"] = round(fim_novo, 4)
    tr = novo.get("trilha") or {}
    if tr.get("acorde_final"):
        tr["acorde_final"] = f(tr["acorde_final"])
    for fx_ in tr.get("faixas") or []:
        fx_["entra_em"] = max(0.0, f(fx_["entra_em"]))
        if isinstance(fx_.get("troca_em"), (int, float)):
            fx_["troca_em"] = f(fx_["troca_em"])
    if tr.get("emendas"):
        tr["emendas"] = [[f(e[0]), *e[1:]] for e in tr["emendas"]]
        delta = novo["duracao"] - antigo_dur
        if len(tr["emendas"]) == 1 and abs(delta) > 1e-3:
            e = tr["emendas"][0]
            dm = duracao_musica(tr.get("chave")) if (duracao_musica and tr.get("chave")) else None
            if dm is not None and e[2] + delta <= dm - 0.05:
                e[2] = round(e[2] + delta, 4)
            elif delta > 0:
                avisos.append(f"a música não tem sobra para os {delta:.2f} s a mais: confira o fim da música".replace(".", ","))
        elif len(tr["emendas"]) > 1 and abs(delta) > 1e-3:
            ems = ", ".join(f"{int(e[0]) // 60}:{int(e[0]) % 60:02d}" for e in tr["emendas"][1:4])
            avisos.append(f"a música foi emendada por compasso; confira a emenda aos {ems}")
    rel = []
    for g in grupos:
        ult = g["pecas"][-1]
        texto = (g.get("texto") or "").split()
        rel.append({"id": g["id"], "fonte": g["fonte"], "juntou": [p["id"] for p in g["pecas"]] if len(g["pecas"]) > 1 else [],
                    "s0": [g["pecas"][0]["s0"], g["_s0"]], "s1": [ult["s1"], g["_s1"]], "t": [g["_t0"], g["_t1"]],
                    "ultima": texto[-1] if texto else "", "primeira": texto[0] if texto else "",
                    "mexeu": sorted({x for p in g["pecas"] for x in p["_mexeu"]}),
                    "notas": [n for p in g["pecas"] for n in p["_nota"]]})
    return novo, rel, avisos


# ------------------------------------------------------------------ o passo
def ajustar_edl(edl: dict, fontes, cfg=None, *, forcar_marca: bool = False, forcar: dict | None = None) -> dict:
    """Passo `montagem.cortes`: ajusta `edl` NO LUGAR (como fatos.revisar) e devolve o relatório
    {"estado": "nada_a_fazer"|"ajustado"|"sem_mudanca"|"falhou", "n", "mexidas", "juntadas", "duracao_antes", "duracao_depois",
    "notas", "avisos", "motivo"}. `forcar_marca` ignora a marca (ferramenta com --forcar)."""
    voz = edl.get("voz") or []
    base = {"n": len(voz), "mexidas": 0, "juntadas": 0, "duracao_antes": edl.get("duracao"), "duracao_depois": edl.get("duracao"),
            "notas": [], "avisos": []}
    if not voz:
        return {**base, "estado": "nada_a_fazer", "motivo": "filme sem fala"}
    if not forcar_marca and not forcar and ja_ajustado(edl):
        return {**base, "estado": "nada_a_fazer", "motivo": "cortes já ajustados pelo som nesta lista de falas"}
    try:
        envs, offs = envelopes(edl, fontes, cfg)
        pals = {fid: palavras(fontes, fid) for fid in envs}
        vz = novos_limites(edl, envs, offs, pals, forcar=forcar)

        def dur_musica(chave):
            try:
                import soundfile as sf
                return float(sf.info(str(fontes.arquivo_qualquer(chave))).duration)
            except Exception:  # noqa: BLE001 - sem medir a música, a emenda não estica (vai aviso)
                return None
        novo, rel, avisos = aplicar(edl, vz, duracao_musica=dur_musica)
    except Exception as e:  # noqa: BLE001 - nada daqui derruba a montagem: o EDL fica como veio e a conferência julga
        return {**base, "estado": "falhou", "motivo": f"não consegui ouvir as fontes ({type(e).__name__}: {str(e)[:120]})"}
    mexidas = sum(1 for p in vz if p["_mexeu"])
    juntadas = sum(len(r["juntou"]) - 1 for r in rel if r["juntou"])
    notas = [f"{r['id']}: {'; '.join(r['notas'])}" for r in rel if r["notas"]][:NOTAS_MAX]
    if mexidas or juntadas:
        edl.clear()
        edl.update(novo)
    origem = edl.setdefault("origem", {})
    origem["cortes_audio"] = {"algo": ALGO, "voz": hash_voz(edl["voz"]), "mexidas": mexidas, "juntadas": juntadas,
                              "duracao_antes": base["duracao_antes"], "duracao_depois": edl["duracao"], "notas": notas}
    if avisos:
        origem["avisos"] = list(origem.get("avisos") or []) + [a for a in avisos if a not in (origem.get("avisos") or [])]
    return {**base, "estado": "ajustado" if (mexidas or juntadas) else "sem_mudanca", "mexidas": mexidas, "juntadas": juntadas,
            "duracao_depois": edl["duracao"], "notas": notas, "avisos": avisos, "pecas": rel, "motivo": None}


def achado(rel: dict) -> str:
    """'Cortes pelo som: 3 de 9 acertados; filme 44,2 s -> 44,6 s.' Só números da régua."""
    n, mx = rel.get("n", 0), rel.get("mexidas", 0)
    est = rel.get("estado")
    if est == "falhou":
        return f"Cortes pelo som não rodaram: {rel.get('motivo')}; a conferência ouve como o diretor cortou"
    if est == "nada_a_fazer":
        return "Filme sem fala: nada para cortar" if not n else "Cortes já acertados pelo som (nada a refazer)"
    txt = f"Cortes pelo som: {mx} de {n} acertados"
    a, d = rel.get("duracao_antes"), rel.get("duracao_depois")
    if isinstance(a, (int, float)) and isinstance(d, (int, float)) and abs(d - a) >= 0.05:
        txt += f"; filme {a:.1f} s -> {d:.1f} s".replace(".", ",")
    if rel.get("juntadas"):
        txt += f"; {rel['juntadas']} emenda(s) juntada(s)"
    ouvir = sum(1 for x in rel.get("notas") or [] if "OUVIR" in x)
    if ouvir:
        txt += f"; {ouvir} para ouvir"
    if rel.get("avisos"):
        txt += "; " + rel["avisos"][0]
    return txt
