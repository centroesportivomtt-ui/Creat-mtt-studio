"""Etapa ANALISE (por arquivo, logo depois do ingest): grava `derivados/<p>/<a>/analise.json` (analise.schema.json).

Sub-etapas, cada uma com cache próprio (um reinício no meio não refaz a transcrição):
1. energia do áudio (RMS em dB a cada 50 ms, lida em blocos) -> energia.npy, picos e base do filtro de silêncio;
2. transcrição pelo provedor efetivo (faster-whisper SEM VAD por padrão) -> transcricao.json (cache por assinatura);
   segmentos sobre silêncio e frases-fantasma do Whisper são descartados;
3. sinais visuais locais nos quadros-chave (tremor, cenas, rostos, telas);
   3b. movimento, tremor e nitidez a cada 0,5 s (motor/movimento.py) -> movimento.json, OPCIONAL: cache próprio e, se a
       medição falha, vira aviso e a análise segue sem ele. Análise antiga (já pronta) ganha só este sinal, sem refazer o resto;
4. visão: momentos (heurísticos no local; Haiku/Gemini quando ligados e com chave);
5. validação no schema e gravação atômica; `analise.ok` guarda a assinatura (idempotência).
"""
from __future__ import annotations

import io
import json
import logging
import sys
import time
from pathlib import Path

import numpy as np

from motor import config
from motor.etapas import Contexto, ErroDefinitivo, etapa
from motor.etapas.ingest import assinatura
from motor.provedores import provedor
from motor.provedores.transcricao_fw import eh_fantasma, normalizar

log = logging.getLogger("motor.analise")
ALGO = "analise-2"
PASSO_ENERGIA = 0.05
DICAS_CASA = ["creat.MTT", "Creat", "Marcos", "Ruan", "Xande"]
SILENCIO_DB = -50.0
_CACHE: dict = {}


def _instancia(tipo: str, cfg):
    """Provedor efetivo, reaproveitado no processo; se o pago/opcional não sobe, cai no local (e registra)."""
    nome = cfg.provedor_efetivo(tipo)
    k = (tipo, nome, str(cfg.dados), getattr(cfg, "whisper_modelo", ""), cfg.threads)
    if k not in _CACHE:
        try:
            _CACHE[k] = provedor(tipo, cfg)
        except Exception as e:  # noqa: BLE001
            local = {"transcricao": "faster-whisper", "visao": "local"}[tipo]
            if nome == local:
                raise
            log.warning("%s '%s' indisponível (%s); usando '%s'", tipo, nome, e, local)
            from motor.provedores import MAPA
            import importlib
            mod, cls = MAPA[tipo][local].split(":")
            _CACHE[k] = getattr(importlib.import_module(mod), cls)(cfg)
    return _CACHE[k]


def _visao_local(cfg):
    k = ("visao_local", str(cfg.dados))
    if k not in _CACHE:
        from motor.provedores.visao_local import VisaoLocal
        _CACHE[k] = VisaoLocal(cfg)
    return _CACHE[k]


def energia(wav: Path) -> np.ndarray:
    import soundfile as sf
    info = sf.info(str(wav))
    hop = max(1, int(round(info.samplerate * PASSO_ENERGIA)))
    out, resto = [], np.zeros(0, dtype=np.float32)
    for bloco in sf.blocks(str(wav), blocksize=hop * 2000, dtype="float32", always_2d=True):
        x = np.concatenate([resto, bloco.mean(axis=1)])
        n = len(x) // hop
        if n:
            q = x[: n * hop].reshape(n, hop)
            out.append(np.sqrt((q * q).mean(axis=1)))
        resto = x[n * hop:]
    if len(resto):
        out.append(np.array([np.sqrt((resto * resto).mean())]))
    rms = np.concatenate(out) if out else np.zeros(1)
    return (20 * np.log10(rms + 1e-9)).astype(np.float32)


def picos(db: np.ndarray, maximo: int = 20) -> list[list[float]]:
    if len(db) < 3:
        return []
    med = float(np.median(db))
    lim = max(-20.0, med + 12.0)
    idx = [i for i in range(1, len(db) - 1) if db[i] >= lim and db[i] >= db[i - 1] and db[i] >= db[i + 1]]
    idx.sort(key=lambda i: -db[i])
    sep, esc = int(1.0 / PASSO_ENERGIA), []
    for i in idx:
        if all(abs(i - j) >= sep for j in esc):
            esc.append(i)
        if len(esc) >= maximo:
            break
    return [[round(i * PASSO_ENERGIA, 2), round(float(db[i]), 1)] for i in sorted(esc)]


def _laco(texto: str) -> bool:
    """Laço de alucinação: um n-grama de 2 a 4 palavras repetido 4+ vezes cobrindo >= 80% do segmento."""
    pal = normalizar(texto).split()
    for n in (2, 3, 4):
        if len(pal) < 4 * n:
            continue
        for i in range(0, n):
            g = pal[i:i + n]
            rep, j = 0, i
            while pal[j:j + n] == g:
                rep, j = rep + 1, j + n
            if rep >= 4 and rep * n >= 0.8 * len(pal):
                return True
    return False


def _latino(texto: str) -> bool:
    letras = [c for c in texto if c.isalpha()]
    return bool(letras) and sum(1 for c in letras if ord(c) < 0x250) >= 0.8 * len(letras)


def filtrar_transcricao(tr: dict, db: np.ndarray | None) -> dict:
    """Sem VAD, o Whisper às vezes inventa texto em silêncio, tom ou música. Descarta: frases-fantasma, texto sem
    letra latina ('...', cirílico), segmentos de confiança média < 0,35, laços de n-grama, 3+ segmentos curtos
    idênticos seguidos e segmentos sobre silêncio (energia < -50 dBFS)."""
    segs = list(tr["segmentos"])
    norm = [normalizar(s["texto"]) for s in segs]
    repetidos = set()
    for i in range(len(segs)):
        j = i
        while j + 1 < len(segs) and norm[j + 1] == norm[i] and len(norm[i].split()) <= 3:
            j += 1
        if j - i >= 2:
            repetidos.update(range(i, j + 1))
    bons = []
    for k, s in enumerate(segs):
        if k in repetidos or eh_fantasma(s["texto"]) or not _latino(s["texto"]) or _laco(s["texto"]):
            continue
        probs = [w[3] for w in s.get("palavras", [])]
        if probs and sum(probs) / len(probs) < 0.35:
            continue
        if db is not None and len(db):
            i0, i1 = int(s["s"] / PASSO_ENERGIA), max(int(s["s"] / PASSO_ENERGIA) + 1, int(s["e"] / PASSO_ENERGIA))
            trecho = db[i0:i1]
            if len(trecho) and float(trecho.max()) < SILENCIO_DB:
                continue
        bons.append(s)
    return {**tr, "segmentos": bons}


def fala_pct(segs: list[dict], dur: float) -> float:
    total, fim = 0.0, 0.0
    for s in sorted(segs, key=lambda x: x["s"]):
        a, b = max(s["s"], fim), s["e"]
        if b > a:
            total += b - a
        fim = max(fim, b)
    return round(min(1.0, total / dur), 3) if dur > 0 else 0.0


def movimento(arm, base: str, ing: dict, progresso=None) -> dict | None:
    """sinais.movimento do arquivo (pedido do dono: "foco nos vídeos de mais alta qualidade", sem tremor forte).

    Série completa em `<base>/movimento.json` (cache por assinatura da fonte + versão do medidor: refazer a análise não
    mede de novo); na análise fica só o resumo que o catálogo lê. Arquivo cortado em trechos é medido trecho a trecho
    no tempo da fonte. É um sinal OPCIONAL: qualquer falha vira aviso no log e devolve None (a análise não para)."""
    if not ing["midia"].get("tem_video"):
        return None
    from motor import movimento as MV
    chave = f"{base}/movimento.json"
    sig = assinatura(MV.VERSAO, ing["assinatura"])
    try:
        serie = None
        if arm.existe(chave):
            c = arm.ler_json(chave)
            if c.get("assinatura") == sig:
                if c.get("falhou"):                  # cache negativo: a mesma fonte já falhou; medir 4K de novo é caro
                    log.warning("AVISO: movimento de %s falhou antes (%s); siga sem ele", base, c["falhou"])
                    return None
                serie = c
        if serie is None:
            if progresso:
                progresso("Medindo movimento, tremor e nitidez a cada 0,5 s")
            trechos = ing["derivados"].get("trechos") or []
            if trechos:
                serie = MV.juntar([MV.medir(arm.caminho_local(t["chave"]), inicio=float(t["ini"])) for t in trechos])
            else:
                serie = MV.medir(arm.caminho_local(ing["arquivo"]["chave"]))
            serie["assinatura"] = sig
            arm.gravar_json(chave, serie)
        return {"passo": serie["passo"], "chave": chave, "versao": serie["versao"], **MV.resumo(serie)}
    except Exception as e:  # noqa: BLE001
        log.warning("AVISO: movimento de %s não foi medido (%s); a análise segue sem ele", base, e)
        try:                                         # guarda a falha com a assinatura: só mede de novo se a fonte mudar
            arm.gravar_json(chave, {"assinatura": sig, "falhou": str(e)[:300]})
        except Exception:  # noqa: BLE001
            pass
        return None


def validar_analise(obj: dict) -> None:
    pasta = str(config.SCHEMAS / "py")
    if pasta not in sys.path:
        sys.path.insert(0, pasta)
    import validar
    erros = validar.erros("analise", obj)
    if erros:
        raise ErroDefinitivo("análise fora do contrato: " + "; ".join(erros[:5]))


@etapa("analise")
def analise(ctx: Contexto) -> dict:
    con, cfg, arm, p, a = ctx.con, ctx.cfg, ctx.armazenamento, ctx.projeto, ctx.alvo
    base = f"derivados/{p}/{a}"
    if arm is None or not arm.existe(f"{base}/ingest.json"):
        raise ErroDefinitivo(f"ingest do arquivo {a} não existe (rode o ingest antes)")
    ing = arm.ler_json(f"{base}/ingest.json")
    midia, der = ing["midia"], ing["derivados"]
    tr_prov = _instancia("transcricao", cfg)
    vis_prov = _instancia("visao", cfg)
    d_proj = json.loads((con.execute("SELECT dados FROM projetos WHERE id=?", (p,)).fetchone() or {"dados": "{}"})["dados"] or "{}")
    dicas = DICAS_CASA + [str(x) for x in d_proj.get("dicas", [])][:30]
    tr_modelo = getattr(tr_prov, "modelo", "-")
    sig = assinatura(ALGO, ing["assinatura"], tr_prov.nome, tr_modelo, vis_prov.nome, ",".join(dicas))
    if arm.existe(f"{base}/analise.json") and arm.existe(f"{base}/analise.ok"):
        try:
            if json.loads(arm.caminho_local(f"{base}/analise.ok").read_text())["assinatura"] == sig:
                pronta = arm.ler_json(f"{base}/analise.json")
                if "movimento" not in pronta["sinais"]:          # análise de antes do medidor: ganha só o movimento
                    try:
                        mov = movimento(arm, base, ing, lambda m: ctx.progresso(0.5, m))
                        if mov:
                            pronta["sinais"]["movimento"] = mov
                            validar_analise(pronta)
                            arm.gravar_json(f"{base}/analise.json", pronta)
                            return {"pulado": True, "movimento": True}
                    except Exception as e:  # noqa: BLE001 - sinal opcional: a análise que já existe continua valendo
                        log.warning("AVISO: análise antiga de %s não ganhou o movimento (%s); fica como estava", base, e)
                return {"pulado": True}
        except (ValueError, KeyError, OSError):
            pass

    t0 = time.time()
    tempos = dict(ing.get("tempos", {}))
    wav = arm.caminho_local(der["audio_wav"]) if der.get("audio_wav") else None

    # 1. energia
    ctx.progresso(0.05, "Medindo a energia do áudio")
    db = energia(wav) if wav else None
    pk = picos(db) if db is not None else []
    buf = io.BytesIO()                      # sem áudio: série vazia (a chave do schema sempre existe)
    np.save(buf, db if db is not None else np.zeros(0, dtype=np.float32))
    arm.gravar_bytes(f"{base}/energia.npy", buf.getvalue())
    tempos["analise_energia"] = round(time.time() - t0, 2)

    # 2. transcrição (com cache próprio)
    t1 = time.time()
    if wav is None:
        tr = {"provedor": "nenhum", "modelo": "-", "idioma": "pt", "vad": False, "segmentos": []}
    else:
        sig_tr = assinatura("tr-3", ing["assinatura"], tr_prov.nome, tr_modelo, ",".join(dicas))
        ck = f"{base}/transcricao.json"
        tr = None
        if arm.existe(ck):
            c = arm.ler_json(ck)
            if c.get("assinatura") == sig_tr:
                tr = c["transcricao"]
        if tr is None:
            ctx.progresso(0.1, f"Transcrevendo ({tr_prov.nome}, sem VAD)")
            tr = tr_prov.transcrever(wav, idioma="pt", palavras=True, dicas=dicas,
                                     progresso=lambda f: ctx.progresso(0.1 + 0.6 * f, "Transcrevendo"))
            arm.gravar_json(ck, {"assinatura": sig_tr, "transcricao": tr, "segundos": round(time.time() - t1, 2)})
        tr = filtrar_transcricao(tr, db)
    tempos["analise_transcricao"] = round(time.time() - t1, 2)

    # 3. sinais visuais locais
    t2 = time.time()
    ctx.progresso(0.75, "Lendo imagem: tremor, cenas, rostos e telas")
    vl = _visao_local(cfg)
    quadros = [(q["t"], arm.caminho_local(q["chave"])) for q in der["quadros_chave"]]
    if quadros:
        sinais = vl.sinais(quadros)
        sinais.pop("_detector_rostos", None)
    else:
        sinais = {"tremor": {"passo": 0.0, "media_px": 0.0, "trechos": []}, "cenas": [], "rostos": [], "telas": []}
    fp = fala_pct(tr["segmentos"], float(midia["duracao"]))
    sinais = {"energia": {"passo": PASSO_ENERGIA, "chave": f"{base}/energia.npy", "picos": pk, "fala_pct": fp}, **sinais}
    mov = movimento(arm, base, ing, lambda m: ctx.progresso(0.8, m)) if midia["tem_video"] else None
    if mov:
        sinais["movimento"] = mov
    tempos["analise_sinais"] = round(time.time() - t2, 2)

    # 4. visão (momentos)
    t3 = time.time()
    ctx.progresso(0.9, "Marcando os momentos")
    contexto = {"midia": midia, "transcricao": tr, "sinais": sinais, "picos": pk, "fala_pct": fp}
    folha = arm.caminho_local(der["folha"]) if der.get("folha") else None
    visao = vis_prov.descrever(folha, [q["t"] for q in der["quadros_chave"]], contexto) if midia["tem_video"] or tr["segmentos"] else None
    uso = getattr(vis_prov, "ultimo_uso", None)
    if uso:
        arm.gravar_json(f"{base}/uso_visao.json", uso)
        from motor.cerebro import gastos
        gastos.registrar(ctx.cfg, "visao_leve", uso, projeto=p, ref=f"{base}/uso_visao.json")
    tempos["analise_visao"] = round(time.time() - t3, 2)
    tempos["analise_total"] = round(time.time() - t0, 2)

    obj = {"versao": "1", "arquivo": ing["arquivo"], "midia": midia, "derivados": der,
           "transcricao": tr, "sinais": sinais, "visao": visao, "tempos": tempos}
    validar_analise(obj)
    arm.gravar_json(f"{base}/analise.json", obj)
    arm.gravar_bytes(f"{base}/analise.ok", json.dumps({"assinatura": sig}).encode())
    n_pal = sum(len(s.get("palavras", [])) for s in tr["segmentos"])
    ctx.progresso(1.0, f"Análise pronta: {len(tr['segmentos'])} falas, {len((visao or {}).get('momentos', []))} momentos")
    return {"falas": len(tr["segmentos"]), "palavras": n_pal, "segundos": tempos["analise_total"]}
