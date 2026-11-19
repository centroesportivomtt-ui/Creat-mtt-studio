"""Diagnóstico da chave do cérebro: uma chamada mínima (modelo leve, 1 token de saída), com cache de 10 min.
Devolve só estado e código HTTP, nunca a chave. Custo: fração de centavo por checagem."""
from __future__ import annotations

import time

from motor import config

_CACHE: dict = {}


def checar_chave(cfg=None, *, validade_s: int = 600) -> dict:
    cfg = cfg or config.carregar()
    if not config.chave_anthropic():
        return {"estado": "ausente"}
    agora = time.time()
    if _CACHE and agora - _CACHE["em"] < validade_s:
        return _CACHE["r"]
    try:
        cli = config.cliente_anthropic()
        m = cli.messages.create(model=cfg.modelo_leve, max_tokens=1, messages=[{"role": "user", "content": "ok"}])
        r = {"estado": "ok", "modelo": m.model}
    except Exception as e:  # noqa: BLE001 - só o tipo e o status saem daqui
        r = {"estado": "falha", "erro": type(e).__name__, "status": getattr(e, "status_code", None)}
    _CACHE.update(em=agora, r=r)
    return r


# ---------- autoteste da direção real (uma por dia) ----------
import json as _json
import pathlib as _pl
import threading as _th

_TRAVA = _th.Lock()


def _arq(cfg) -> _pl.Path:
    return _pl.Path(cfg.dados) / "diagnostico_direcao.json"


def estado_direcao(cfg=None) -> dict:
    cfg = cfg or config.carregar()
    try:
        return _json.loads(_arq(cfg).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"estado": "nunca rodou"}


def testar_direcao(cfg=None, *, validade_s: int = 86400) -> dict:
    """Pede ao cérebro real a direção de um material de exemplo (packages/schemas/exemplos/analise.json), valida contra o contrato
    e resolve o EDL. Roda em segundo plano no máximo 1 vez por dia (custo de centavos); o resultado fica em <dados>/diagnostico_direcao.json.
    Não envolve nenhum projeto do dono."""
    cfg = cfg or config.carregar()
    atual = estado_direcao(cfg)
    idade = time.time() - atual.get("em_ts", 0)
    if (atual.get("estado") == "rodando" and idade < 900) or (atual.get("estado") == "ok" and idade < validade_s) \
            or (atual.get("estado") == "falha" and idade < 1800):
        return atual                                  # ok vale 1 dia; falha repete em 30 min (a rota é pública e cada tentativa custa centavos)
    if cfg.provedor_efetivo("cerebro") != "anthropic":
        return {"estado": "cérebro real desligado", "provedor": cfg.provedor_efetivo("cerebro")}
    if not _TRAVA.acquire(blocking=False):
        return atual

    def rodar():
        t0 = time.time()
        try:
            _arq(cfg).write_text(_json.dumps({"estado": "rodando", "em_ts": t0}), encoding="utf-8")
            from motor.cerebro import orcamento
            from motor.cerebro.anthropic_api import CerebroAnthropic
            from motor.etapas import catalogo
            from motor.etapas.direcao import dirigir_e_resolver
            from motor.memoria.loja import Loja
            an = _json.loads((config.SCHEMAS / "exemplos" / "analise.json").read_text(encoding="utf-8"))
            ped = {"versao": "1", "projeto": "p_diagnostico", "texto": "Reel de bastidor de 20 s, abre com a fala mais forte e fecha chamando para seguir a @creat.mtt.",
                   "tipo_video": "bastidor", "modo": "cinema"}
            cat, txt = catalogo.montar([an], ped, "p_diagnostico")
            r = dirigir_e_resolver(cerebro=CerebroAnthropic(cfg), loja=Loja(), catalogo=cat, catalogo_txt=txt, pedido=ped,
                                   analises={an["arquivo"]["id"]: an}, trilhas=[], cfg=cfg)
            tot = orcamento.somar(r["usos"])
            from motor.cerebro import gastos
            for u in r["usos"]:
                gastos.registrar(cfg, "direcao_autoteste", u)
            d = r["direcao"]
            res = {"estado": "ok", "em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "em_ts": time.time(), "segundos": round(time.time() - t0, 1),
                   "custo_usd": tot["custo_usd"], "tokens": {k: tot[k] for k in ("entrada", "entrada_cache", "saida")},
                   "filme_s": round(r["edl"]["duracao"], 1), "gancho": (d.get("gancho") or {}).get("texto_tela"),
                   "blocos": [f"{b['funcao']}/{b['saida']}" for b in d.get("blocos", [])], "critica": r.get("critica")}
        except Exception as e:  # noqa: BLE001
            res = {"estado": "falha", "em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "em_ts": time.time(),
                   "erro": f"{type(e).__name__}: {str(e)[:300]}"}
        finally:
            _TRAVA.release()
        _arq(cfg).write_text(_json.dumps(res, ensure_ascii=False), encoding="utf-8")

    _th.Thread(target=rodar, daemon=True).start()
    return {"estado": "rodando"}


# ---------- autoteste do olho de IA (uma vez por semana) ----------
_TRAVA_OLHO = _th.Lock()


def _arq_olho(cfg) -> _pl.Path:
    return _pl.Path(cfg.dados) / "diagnostico_olho.json"


def quadros_de_teste():
    """Folha e um quadro de risco sintéticos: o texto «PROMOÇÃO HOJE» sai ESPELHADO de propósito. O olho tem de acusar."""
    import cv2
    import numpy as np
    q = np.full((1280, 720, 3), (60, 45, 35), np.uint8)
    cv2.rectangle(q, (60, 760), (660, 940), (20, 20, 20), -1)
    cv2.putText(q, "PROMOCAO HOJE", (80, 880), cv2.FONT_HERSHEY_DUPLEX, 2.0, (255, 255, 255), 4, cv2.LINE_AA)
    q = cv2.flip(q, 1)                                  # de trás para frente
    return cv2.resize(q, (360, 640)), q


def testar_olho(cfg=None, *, validade_s: int = 7 * 86400) -> dict:
    """Prova que a revisão por IA funciona de verdade neste motor: manda um quadro com texto espelhado e confere se o
    Claude acusa. Em segundo plano, no máximo 1 vez por semana (centavos); resultado em <dados>/diagnostico_olho.json."""
    cfg = cfg or config.carregar()
    try:
        atual = _json.loads(_arq_olho(cfg).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        atual = {"estado": "nunca rodou"}
    idade = time.time() - atual.get("em_ts", 0)
    if (atual.get("estado") == "rodando" and idade < 600) or (atual.get("estado") == "ok" and idade < validade_s) \
            or (atual.get("estado") == "falha" and idade < 1800) or (atual.get("estado") == "não acusou" and idade < 86400):
        return atual                                  # a rota de saúde é pública: falha só repete em 30 min; "não acusou" (gastou) em 1 dia
    if cfg.provedor_efetivo("cerebro") != "anthropic":
        return {"estado": "cérebro real desligado", "provedor": cfg.provedor_efetivo("cerebro")}
    if not _TRAVA_OLHO.acquire(blocking=False):
        return atual

    def rodar():
        t0 = time.time()
        try:
            _arq_olho(cfg).write_text(_json.dumps({"estado": "rodando", "em_ts": t0}), encoding="utf-8")
            from motor.cerebro import gastos
            from motor.etapas.qa import olho_ia
            folha, q = quadros_de_teste()
            texto = ("Filme de 5.0 s, 1080x1920. Imagem 1: folha geral. Depois, 1 quadro(s) de risco:\n"
                     "- Q1 · 2.0 s · texto de tela (rotulo) · esperado: PROMOÇÃO HOJE")
            resp, uso = olho_ia.perguntar(cfg, [olho_ia._jpg(folha), olho_ia._jpg(olho_ia._etiqueta(q, "Q1  2.0s"), 86)], texto)
            gastos.registrar(cfg, "olho_ia_autoteste", uso)
            tipos = [d.get("tipo") for d in resp.get("defeitos") or []]
            acusou = any(t in ("texto_invertido_ou_errado", "texto_ilegivel") for t in tipos)
            res = {"estado": "ok" if acusou else "não acusou", "em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "em_ts": time.time(),
                   "segundos": round(time.time() - t0, 1), "modelo": uso.get("modelo"), "custo_usd": uso.get("custo_usd"),
                   "tokens": {"entrada": uso.get("entrada"), "saida": uso.get("saida")}, "defeitos": tipos,
                   "disse": str((resp.get("defeitos") or [{}])[0].get("descricao") or resp.get("resumo") or "")[:200]}
        except Exception as e:  # noqa: BLE001
            res = {"estado": "falha", "em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "em_ts": time.time(),
                   "erro": f"{type(e).__name__}: {str(e)[:300]}"}
        finally:
            _TRAVA_OLHO.release()
        _arq_olho(cfg).write_text(_json.dumps(res, ensure_ascii=False), encoding="utf-8")

    _th.Thread(target=rodar, daemon=True).start()
    return {"estado": "rodando"}
