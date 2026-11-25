"""Pedidos de SOM REAL da direção -> `edl.sons_reais` (peça M6). Determinístico, sem rede (só o índice local).

A direção pede em `blocos[].sons` ({desc, busca?, papel, m?, forca?}); aqui cada pedido ganha lugar no filme e um som do
banco (o 1º + 2 reservas):
- ambiente: cobre o bloco (ou só os planos do momento `m`). Dois blocos seguidos com a mesma `desc` viram UM item só
  (sem costura). Ambiente que muda de bloco entra 0,4 s antes do corte (J-cut) e cruza 1,0 s com o anterior;
- pontual: exige `m`, um momento que entrou num plano. O ATAQUE do som cai em t = plano.t0 + (m.t0 - plano.s0)/vel; com a
  série de energia da fonte, o instante é puxado para o maior transiente dentro do plano (subida >= 6 dB); sem série, fica
  no corte do plano + 0,15 s. Sem lugar no filme, o pedido não entra e vira aviso;
- o som direto dos planos sob ambiente real desce 6 dB (dois "lugares" ao mesmo tempo embolam), mas isso é feito na
  MIXAGEM e só onde o ambiente de fato carregou (mix.som_direto): se o download falhar, o filme sai com o som direto como era.
  Aqui os planos não mudam. O tom de sala não muda.
Pedido sem nenhum candidato vira o aviso "pedido sem som: <desc>": o editor não inventa som (nunca sintetiza no lugar).
`resolver_seguro` é o que o resolvedor chama: qualquer erro inesperado vira aviso e o EDL sai sem os sons reais.
"""
from __future__ import annotations

from motor import sons_reais as SR
from motor.sons_reais import indice as IX

J_ANTES_S = 0.4          # o ambiente novo entra antes do corte
CRUZA_S = 1.0            # e cruza com o anterior
FADE_AMB = (1.2, 1.5)
FADE_PONTUAL = (0.005, 0.03)
TRANSIENTE_DB = 6.0
FORCA_DB = {1: -6.0, 2: 0.0, 3: 3.0}
NIVEL_AMB_FALA, NIVEL_AMB_SEM_FALA, PICO_PONTUAL = -28.0, -24.0, -10.0


def _clipe_do(p: dict) -> str:
    return str(p["fonte"]).partition("_")[0]


def _momento(R, m: str):
    m = (getattr(R, "_mom_trocado", None) or {}).get(m, m)        # cobertura trocada por um clipe nativo (M2)
    return R.mom.get(m)


def planos_do_momento(R, m: str, planos: list[dict]) -> list[tuple[float, dict]]:
    """[(sobreposição em s da fonte, plano)] dos planos que mostram o momento, do maior para o menor (empate: o mais cedo)."""
    cm = _momento(R, m)
    if not cm:
        return []
    c, mm = cm
    out = []
    for p in planos:
        if _clipe_do(p) != c["id"]:
            continue
        vel = float(p.get("vel") or 1.0)
        s0, s1 = float(p["s0"]), float(p["s0"]) + (float(p["t1"]) - float(p["t0"])) * vel
        ov = min(s1, float(mm["t1"])) - max(s0, float(mm["t0"]))
        if ov > 0.05:
            out.append((ov, p))
    out.sort(key=lambda x: (-x[0], x[1]["t0"]))
    return out


def instante_pontual(R, p: dict, m: str) -> tuple[float, str]:
    """Onde cai o ataque do som pontual no plano `p` que mostra o momento `m`."""
    import numpy as np
    c, mm = _momento(R, m)
    vel = float(p.get("vel") or 1.0)
    s0 = float(p["s0"])
    s1 = s0 + (float(p["t1"]) - float(p["t0"])) * vel
    a, b = max(s0, float(mm["t0"])), min(s1, float(mm["t1"]))
    t_max = float(p["t1"]) - 0.05
    serie = (R.energias or {}).get(c["arquivo"])
    if serie is not None and b - a > 0.1:
        passo = float((R.energias.get("_passo") or {}).get(c["arquivo"], 0.02))
        x = np.asarray(serie, dtype=float)
        x = np.where(x <= -89, np.nan, x)
        k = max(1, int(round(0.08 / passo)))
        i0, i1 = max(k, int(a / passo)), min(len(x) - 1, int(b / passo))
        melhor, onde = -1.0, None
        for i in range(i0, i1 + 1):
            jan = x[i - k:i]
            if np.isnan(x[i]) or np.all(np.isnan(jan)):
                continue
            sobe = float(x[i] - np.nanmin(jan))
            if sobe > melhor + 1e-9:
                melhor, onde = sobe, i
        if onde is not None and melhor >= TRANSIENTE_DB:
            t = float(p["t0"]) + (onde * passo - s0) / vel
            return round(min(max(float(p["t0"]), t), t_max), 4), "transiente"
    if float(mm["t0"]) > s0 + 0.15 * vel:
        return round(min(float(p["t0"]) + (float(mm["t0"]) - s0) / vel, t_max), 4), "momento"
    return round(min(float(p["t0"]) + 0.15, t_max), 4), "corte"


def _norm(t: str) -> str:
    return " ".join(IX.sem_acento(t or "").split())


def resolver_seguro(R, L: dict, planos: list[dict]) -> list[dict] | None:
    """`resolver` que nunca derruba o EDL: erro inesperado (disco, sqlite, conta) vira aviso e o filme sai sem os sons reais."""
    try:
        return resolver(R, L, planos)
    except Exception as e:  # noqa: BLE001 - som real é tempero: nunca impede o filme
        pedidos = [s for b in (R.d.get("blocos") or []) for s in (b.get("sons") or [])]
        if not pedidos:
            return None
        motivo = f"falha inesperada ({type(e).__name__}: {str(e)[:100]})"
        R.avisos.append(f"sons reais: {motivo}; o filme sai sem os {len(pedidos)} som(ns) pedido(s)")
        R._sons_reais = {"pedidos": len(pedidos), "sem_som": [{"desc": s.get("desc", "")[:60], "motivo": motivo} for s in pedidos]}
        return []


def resolver(R, L: dict, planos: list[dict]) -> list[dict] | None:
    """Direção com `sons` -> itens de `edl.sons_reais`. Sem nenhum pedido: None (o EDL sai idêntico ao de antes da M6). Anota
    em R.avisos o que ficou de fora e em R._sons_reais o resumo para edl.origem. Não mexe nos planos."""
    blocos_d = R.d.get("blocos") or []
    pedidos = [(bi, b, dict(s)) for bi, b in enumerate(blocos_d) for s in (b.get("sons") or [])]
    if not pedidos:
        return None
    resumo = {"pedidos": len(pedidos), "sem_som": []}
    R._sons_reais = resumo

    def sem_som(desc: str, motivo: str) -> None:
        resumo["sem_som"].append({"desc": desc, "motivo": motivo})
        R.avisos.append(f"pedido sem som: {desc} ({motivo})")

    if not SR.ligado(None):
        for _, _, s in pedidos:
            sem_som(s["desc"], "sons reais desligados neste motor")
        return []
    D = float(L["duracao"])
    # com fala, "momento que entrou num plano" = momento citado na cobertura (o plano do falante corre pela mesma fonte e
    # mostraria qualquer momento do clipe dele); sem fala, todo plano é cobertura escolhida pelo editor
    na_cobertura = {cb["m"] for b in blocos_d for cb in b.get("cobertura") or []} if L.get("voz") else None
    # o filme é contínuo (o plano anterior se estende até o próximo bloco, que começa na batida): cada bloco vai até o começo
    # do seguinte, senão o ambiente teria buraco de até uma batida entre blocos
    bls = list(L["blocos"])
    tempos = {bl["id"]: (float(bl["t0"]), float(bls[k + 1]["t0"]) if k + 1 < len(bls) else float(bl["t1"])) for k, bl in enumerate(bls)}
    reqs = []
    for bi, b, s in pedidos:
        if b["id"] not in tempos:
            continue
        b0, b1 = tempos[b["id"]]
        papel, m = s["papel"], s.get("m")
        if papel == "pontual":
            if not m:
                sem_som(s["desc"], "som pontual sem o momento M.. da cobertura")
                continue
            achou = planos_do_momento(R, m, planos) if na_cobertura is None or m in na_cobertura else []
            if not achou:
                sem_som(s["desc"], f"o momento {m} não entrou em nenhum plano")
                continue
            p = achou[0][1]
            t, como = instante_pontual(R, p, m)
            if t >= D - 0.1:
                sem_som(s["desc"], "cai no fim do filme")
                continue
            reqs.append({"papel": "pontual", "s": s, "bi": bi, "blocos": [b["id"]], "t0": t, "t1": D, "como": como, "plano": p["id"]})
        else:
            t0, t1 = b0, b1
            if m:
                achou = planos_do_momento(R, m, planos) if na_cobertura is None or m in na_cobertura else []
                if achou:
                    t0, t1 = min(x[1]["t0"] for x in achou), max(x[1]["t1"] for x in achou)
                else:
                    R.avisos.append(f"som real «{s['desc']}»: o momento {m} não entrou em nenhum plano; o ambiente cobre o bloco {b['id']}")
            t0, t1 = max(0.0, t0), min(D, t1)
            if t1 - t0 < 0.5:
                sem_som(s["desc"], "trecho curto demais no filme")
                continue
            ant = next((r for r in reversed(reqs) if r["papel"] == "ambiente"), None)
            if ant and _norm(ant["s"]["desc"]) == _norm(s["desc"]) and abs(ant["t1"] - t0) < 0.3:
                ant["t1"] = max(ant["t1"], t1)                     # mesmo lugar no bloco seguinte: um item só, sem costura
                ant["blocos"].append(b["id"])
                continue
            reqs.append({"papel": "ambiente", "s": s, "bi": bi, "blocos": [b["id"]], "t0": t0, "t1": t1})
    reqs.sort(key=lambda r: (r["t0"], r["bi"]))
    if len(reqs) > SR.MAX_SONS:
        for r in reqs[SR.MAX_SONS:]:
            sem_som(r["s"]["desc"], f"o filme já tem {SR.MAX_SONS} sons reais")
        reqs = reqs[:SR.MAX_SONS]
    # fades e J-cut entre ambientes vizinhos
    amb = [r for r in reqs if r["papel"] == "ambiente"]
    for r in amb:
        r["fade"] = [FADE_AMB[0], FADE_AMB[1]]
    for a, b in zip(amb, amb[1:]):
        if abs(b["t0"] - a["t1"]) < 0.05:
            corte = b["t0"]
            b["t0"] = max(0.0, corte - J_ANTES_S)
            a["t1"] = min(D, corte + (CRUZA_S - J_ANTES_S))
            a["fade"][1] = CRUZA_S
            b["fade"][0] = CRUZA_S
    try:
        con = IX.abrir(None)
    except SR.IndiceIndisponivel as e:
        R.avisos.append(f"banco de sons reais indisponível ({e}): o filme sai sem os {len(reqs)} som(ns) pedido(s)")
        for r in reqs:
            resumo["sem_som"].append({"desc": r["s"]["desc"], "motivo": "índice indisponível"})
        return []
    com_voz = SR.ler_com_voz(SR.pasta_cache(None))
    usados: set[int] = set()
    itens = []
    com_fala = bool(L.get("voz"))
    try:
        for r in reqs:
            s, papel = r["s"], r["papel"]
            precisa = (r["t1"] - r["t0"]) if papel == "ambiente" else 1.0
            try:
                cands = SR.escolher(con, s, papel=papel, necessario_s=precisa, excluir=usados, com_voz=com_voz)
            except SR.IndiceIndisponivel as e:
                sem_som(s["desc"], f"busca falhou: {e}")
                continue
            if not cands:
                sem_som(s["desc"], "nenhuma gravação real do banco serve")
                continue
            principal = SR.candidato(cands[0], papel, precisa)
            if papel == "pontual":
                dur = float((principal.get("trecho") or [0.0, cands[0]["dur_s"]])[1])
                r["t1"] = round(min(D, r["t0"] + min(dur, SR.PONTUAL_MAX_S)), 4)
                ganho = PICO_PONTUAL + FORCA_DB.get(int(s.get("forca") or 2), 0.0)
                fade = list(FADE_PONTUAL)
            else:
                ganho = NIVEL_AMB_FALA if com_fala else NIVEL_AMB_SEM_FALA
                meia = max(0.05, (r["t1"] - r["t0"]) / 2)
                fade = [round(min(r["fade"][0], meia), 3), round(min(r["fade"][1], meia), 3)]
            usados.update(int(c["id"]) for c in cands[:3])          # nem as reservas se repetem: o id nunca entra duas vezes
            top = cands[0]
            item = {"id": f"R{len(itens) + 1:02d}", "papel": papel, "desc": s["desc"][:60], "bloco": r["blocos"][0], "origem": "direcao",
                    "id_banco": int(top["id"]), "item": top["item"], "pacote": top["pacote"], "biblioteca": top["biblioteca"],
                    "nome": top["nome"], "url": principal["url"], "formato": principal["formato"], "md5": principal["md5"],
                    "trecho": principal["trecho"], "tam": principal.get("tam"),
                    "t0": round(r["t0"], 4), "t1": round(r["t1"], 4), "ganho_db": ganho, "fade": fade,
                    "reservas": [SR.candidato(c, papel, precisa) for c in cands[1:3]]}
            if s.get("m"):
                item["m"] = s["m"]
            if len(r["blocos"]) > 1:
                item["blocos"] = list(r["blocos"])
            itens.append(item)
    finally:
        con.close()
    resumo["itens"] = len(itens)
    return itens
