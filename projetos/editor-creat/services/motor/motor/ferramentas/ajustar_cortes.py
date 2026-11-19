"""Conserta os cortes de fala de um EDL resolvido: cada peça de voz passa a começar no começo do som e a terminar DEPOIS da
última sílaba (com um respiro), e o resto do filme (planos, textos, legendas, efeitos, sons, blocos, trilha) se reacomoda.

Por que existe (revisão do dono, Super Kal 19/11): o resolvedor cortava no fim de palavra do Whisper, que marca o fim de 0,1 a
0,5 s antes de a voz acabar. "Uma lata de cerveja comum" saía "com"; "tradicional" saía "tradição". E o aperto de pausa partia
frases corridas em três peças, cada uma com o fim comido. Aqui a régua é o áudio (`motor.audio_fala`), não a transcrição:

- fim: se a fala ainda soa no corte, a peça vai até a fala cair abaixo do limiar por 80 ms, mais um respiro (até 90 ms, sempre
  deixando 130 ms de silêncio antes da palavra seguinte). Sem pausa em 0,6 s (palavra seguinte colada): corta no vale;
- peça cujo id está em `qa.cortes_confirmados` (corte conferido de ouvido) não é tocada;
- começo: se o corte cai no meio de um som, recua até o começo desse som (50 ms de folga) quando ele é a primeira palavra
  pedida; se é a palavra anterior colada, corta no vale;
- silêncio de mais de 0,20 s antes da primeira palavra sai (ar morto, e é onde sobra a voz de quem dirige a gravação);
- peças seguidas da mesma fonte que ficam a menos de 0,30 s uma da outra viram uma só (a pausa natural volta);
- o tempo do filme é refeito peça a peça mantendo os intervalos (os pequenos encolhem até 80 ms, só para pagar o respiro que
  esta rodada acrescentou: rodar de novo não aperta mais) e tudo que
  tem tempo passa por um mapa antigo -> novo; plano sincronizado com a fala recalcula o ponto da fonte para a boca não sair
  do lugar.

uso:
  python -m motor.ferramentas.ajustar_cortes <projeto> <versao> [--so-relatorio] [--sem-fila] [--inicio ID=SEG] [--fim ID=SEG]
Imprime a lista de cortes (peça, última palavra, fim antigo -> novo, tempo no filme). Confira a trilha depois (emendas
alinhadas a compasso precisam ser refeitas à mão) e reenfileire a montagem.
"""
from __future__ import annotations

import argparse
import copy
import pathlib
import sys

import numpy as np

from motor import audio_fala as AF
from motor import banco, config
from motor.provedores import armazenamento_de

JUNTAR = 0.30        # peças da mesma fonte mais próximas que isto viram uma
RESPIRO = 0.09
PRE = 0.05


def _envelopes(arm, edl):
    import soundfile as sf
    cache = {}

    def env(fonte):
        if fonte not in cache:
            x, sr = sf.read(arm.caminho_local(edl["fontes"][fonte]["audio"]), dtype="float32")
            cache[fonte] = AF.envelope(x, sr)
        return cache[fonte]
    return env


def _palavras(arm, edl, fonte):
    chave = edl["fontes"][fonte]["audio"].replace("audio.wav", "analise.json")
    try:
        an = arm.ler_json(chave)
        return [w for s in an["transcricao"]["segmentos"] for w in s["palavras"]]
    except Exception:  # noqa: BLE001 - fonte sem análise (clipe pronto)
        return []


def novos_limites(arm, edl, forcar: dict | None = None) -> list[dict]:
    """Para cada peça de voz (ordem do filme): s0/s1 novos pelo áudio, sem mexer no EDL.
    `forcar` = {id: {"s0": seg, "s1": seg}} põe o ponto escolhido por quem ouviu no lugar do medido."""
    env = _envelopes(arm, edl)
    vz = sorted(copy.deepcopy(edl["voz"]), key=lambda v: v["t0"])
    for k, v in enumerate(vz):
        e = env(v["fonte"])
        colada_dep = k + 1 < len(vz) and vz[k + 1]["fonte"] == v["fonte"] and abs(vz[k + 1]["s0"] - v["s1"]) < 0.03
        colada_ant = k > 0 and vz[k - 1]["fonte"] == v["fonte"] and abs(vz[k - 1]["s1"] - v["s0"]) < 0.03
        v["_s0"], v["_s1"], v["_nota"] = v["s0"], v["s1"], []
        if v["id"] in ((edl.get("qa") or {}).get("cortes_confirmados") or []):
            v["_nota"].append("corte confirmado de ouvido: não mexe")
            continue
        if not colada_dep:
            f = AF.fim_da_fala(e, v["s1"], silencio=0.08)
            v["_fim"] = f
            if f["ativa"] or (f["fim"] is not None and f["fim"] > v["s1"] + 0.03):     # voz no corte, ou o "s" final passando dele
                if f["fim"] is not None and f["fim"] - v["s1"] <= 0.6:
                    # respiro: até 90 ms, mas sobrando >= 130 ms de silêncio depois do corte (o QA reprova corte com a voz
                    # voltando em até 120 ms); em pausa menor que isso ficam 30 ms e o diretor confirma de ouvido
                    v["_s1"] = round(f["fim"] + min(RESPIRO, max(0.03, f["pausa"] - 0.13)), 3)
                    v["_nota"].append(f"fim +{v['_s1'] - v['s1']:.2f}")
                else:
                    v["_s1"] = round(max(v["s1"], f["vale"]), 3)
                    v["_nota"].append("fim no vale (palavra seguinte colada): OUVIR")
        if not colada_ant:
            ok, _ = AF.corte_inicial_ok(e, v["s0"])
            if not ok:
                i = AF.inicio_da_fala(e, v["s0"])
                ws = [w for w in _palavras(arm, edl, v["fonte"]) if w[0] >= v["s0"] - 0.05]
                w0 = ws[0][0] if ws else v["s0"]
                if i["inicio"] is not None and i["inicio"] >= w0 - 0.25:
                    v["_s0"] = round(max(0.0, i["inicio"] - PRE), 3)
                    v["_nota"].append(f"começo -{v['s0'] - v['_s0']:.2f}")
                else:
                    v["_s0"] = round(i["vale"], 3)
                    v["_nota"].append("começo no vale (palavra anterior colada): OUVIR")
            else:
                # silêncio antes da primeira palavra (o Whisper marca o começo cedo): é ar morto e é onde fica o resto da voz
                # de quem dirige ("vem!", "vai"). A peça passa a entrar 60 ms antes do som.
                j, db, lim = int(round(v["s0"] / AF.PASSO)), e["db"], e["limiar"]
                q = j
                while q < min(len(db) - 6, int(round(v["s1"] / AF.PASSO))) and not np.all(db[q:q + 6] > lim):
                    q += 1
                ini = q * AF.PASSO
                if ini - v["s0"] > 0.20 and ini < v["s1"] - 0.3:
                    v["_s0"] = round(ini - 0.12, 3)       # 120 ms: consoante surda ("s", "f") começa antes do som forte
                    v["_nota"].append(f"silêncio no começo -{v['_s0'] - v['s0']:.2f}")
        if forcar and v["id"] in forcar:
            for lado in ("s0", "s1"):
                if lado in forcar[v["id"]]:
                    v["_" + lado] = float(forcar[v["id"]][lado])
                    v["_nota"].append(f"{lado} forçado em {v['_' + lado]:.2f}")
    return vz


def ajustar(arm, edl: dict, limites: list[dict] | None = None) -> tuple[dict, list[dict]]:
    vz = limites or novos_limites(arm, edl)
    antigo_dur = edl["duracao"]
    # 1) junta peças vizinhas da mesma fonte
    grupos: list[dict] = []
    for v in vz:
        g = grupos[-1] if grupos else None
        if g and g["fonte"] == v["fonte"] and abs(g["vel"] - v["vel"]) < 1e-6 and v["_s0"] - g["_s1"] < JUNTAR \
                and v["s0"] >= g["pecas"][-1]["s1"] - 0.03 and v.get("ganho_db", 0) == g["ganho_db"]:
            g["_s1"] = max(g["_s1"], v["_s1"])
            g["pecas"].append(v)
            g["texto"] = (g["texto"] + " " + v["texto"]).strip()
        else:
            grupos.append({**{k: v[k] for k in v if not k.startswith("_")}, "_s0": v["_s0"], "_s1": v["_s1"], "pecas": [v],
                           "ganho_db": v.get("ganho_db", 0)})
    # 2) tempo novo de cada grupo, mantendo os intervalos
    t = None
    for k, g in enumerate(grupos):
        p0 = g["pecas"][0]
        if t is None:
            t0 = max(0.0, p0["t0"] - max(0.0, p0["s0"] - g["_s0"]) / g["vel"])
        else:
            ant = grupos[k - 1]["pecas"][-1]
            vao = p0["t0"] - ant["t1"]
            # o intervalo pequeno só encolhe o que ESTA rodada acrescentou de respiro nas duas pontas (até 80 ms): rodar a
            # ferramenta de novo num EDL já ajustado não pode ir apertando o filme
            ganho = (max(0.0, grupos[k - 1]["_s1"] - ant["s1"]) + max(0.0, p0["s0"] - g["_s0"])) / g["vel"]
            t0 = t + (vao if vao > 0.4 else max(0.03, vao - min(0.08, ganho)))
        g["_t0"] = round(t0, 4)
        g["_t1"] = round(t0 + (g["_s1"] - g["_s0"]) / g["vel"], 4)
        t = g["_t1"]
    # 3) mapa antigo -> novo (âncoras: começo e fim de cada peça antiga, pelo tempo da fonte)
    olds, news = [], []
    for g in grupos:
        for p in g["pecas"]:
            pts = [(p["s0"], p["t0"]), (p["s1"], p["t1"])]
            if p["s0"] < g["_s0"] < p["s1"] and p is g["pecas"][0]:     # silêncio aparado no começo: some do filme (mapa plano)
                pts.insert(1, (g["_s0"], p["t0"] + (g["_s0"] - p["s0"]) / p["vel"]))
            for s, tt in pts:
                olds.append(tt)
                news.append(float(np.clip(g["_t0"] + (s - g["_s0"]) / g["vel"], g["_t0"], g["_t1"])))
    if olds and olds[0] > 0:
        olds.insert(0, 0.0)
        news.insert(0, max(0.0, news[0] - olds[1]))
    fim_novo = news[-1] + (antigo_dur - olds[-1])
    olds.append(antigo_dur + 1e-6)
    news.append(fim_novo)
    olds_a, news_a = np.array(olds), np.maximum.accumulate(np.array(news))

    def f(tt: float) -> float:
        if tt >= olds_a[-1]:
            return round(float(news_a[-1] + (tt - olds_a[-1])), 4)
        return round(float(np.interp(tt, olds_a, news_a)), 4)

    novo = copy.deepcopy(edl)
    # 4) planos: sincronizado com a fala recalcula o ponto da fonte
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
    # 5) voz nova
    novo["voz"] = []
    for g in grupos:
        v = {k: g[k] for k in g if not k.startswith("_") and k != "pecas"}
        v.update(s0=g["_s0"], s1=g["_s1"], t0=g["_t0"], t1=g["_t1"])
        novo["voz"].append(v)
    # 6) o resto pelo mapa
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
    leg = novo.get("legendas") or {}
    leg["palavras"] = [[f(w[0]), f(w[1]), *w[2:]] for w in leg.get("palavras", [])]
    for lg in (novo.get("qa") or {}).get("logos", []):
        lg["t"] = f(lg["t"])
    tr = novo.get("trilha") or {}
    if tr.get("acorde_final"):
        tr["acorde_final"] = f(tr["acorde_final"])
    if tr.get("emendas"):
        tr["emendas"] = [[f(e[0]), *e[1:]] for e in tr["emendas"]]
    novo["duracao"] = round(fim_novo, 4)
    rel = []
    for g in grupos:
        ult = g["pecas"][-1]
        rel.append({"id": g["id"], "fonte": g["fonte"], "juntou": [p["id"] for p in g["pecas"]] if len(g["pecas"]) > 1 else [],
                    "s0": [g["pecas"][0]["s0"], g["_s0"]], "s1": [ult["s1"], g["_s1"]], "t": [g["_t0"], g["_t1"]],
                    "ultima": g["texto"].split()[-1] if g["texto"].split() else "", "primeira": g["texto"].split()[0] if g["texto"].split() else "",
                    "notas": [n for p in g["pecas"] for n in p["_nota"]]})
    return novo, rel


def imprimir(rel: list[dict]) -> None:
    for r in rel:
        print(f"  {r['id']:9s} {r['fonte']:5s} filme {r['t'][0]:6.2f}-{r['t'][1]:6.2f} | começo {r['s0'][0]:7.2f}->{r['s0'][1]:7.2f} "
              f"fim {r['s1'][0]:7.2f}->{r['s1'][1]:7.2f} | {r['primeira']} … {r['ultima']}"
              + (f" | juntou {'+'.join(r['juntou'])}" if r["juntou"] else "") + (f" | {'; '.join(r['notas'])}" if r["notas"] else ""))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto")
    ap.add_argument("versao")
    ap.add_argument("--so-relatorio", action="store_true")
    ap.add_argument("--sem-fila", action="store_true")
    ap.add_argument("--inicio", action="append", default=[], metavar="ID=SEG", help="força o começo (tempo da fonte) de uma peça")
    ap.add_argument("--fim", action="append", default=[], metavar="ID=SEG", help="força o fim (tempo da fonte) de uma peça")
    a = ap.parse_args(argv)
    forcar: dict = {}
    for lado, itens in (("s0", a.inicio), ("s1", a.fim)):
        for it in itens:
            k, val = it.split("=")
            forcar.setdefault(k, {})[lado] = float(val)
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    chave = f"saidas/{a.projeto}/{a.versao}/edl.json"
    edl = arm.ler_json(chave)
    novo, rel = ajustar(arm, edl, novos_limites(arm, edl, forcar))
    print(f"{a.projeto}/{a.versao}: {edl['duracao']:.2f} s -> {novo['duracao']:.2f} s, {len(edl['voz'])} -> {len(novo['voz'])} peças de voz")
    imprimir(rel)
    if a.so_relatorio:
        return 0
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4] / "packages" / "schemas" / "py"))
    import validar
    erros = validar.erros("edl", novo)
    if erros:
        print("EDL inválido depois do ajuste:", erros[:4])
        return 1
    arm.gravar_json(chave, novo)
    if not a.sem_fila:
        con = banco.conectar(cfg.banco)
        with con:
            banco.enfileirar(con, "montagem", a.projeto, a.versao, prioridade=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
