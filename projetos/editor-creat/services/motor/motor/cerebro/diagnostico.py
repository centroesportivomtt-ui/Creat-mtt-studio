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
            or (atual.get("estado") == "falha" and idade < 300):
        return atual                                  # ok vale 1 dia; falha pode ser testada de novo em 5 min (depois de uma correção)
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
