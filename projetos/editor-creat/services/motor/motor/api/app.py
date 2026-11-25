"""Fábrica da API.  uso: uvicorn motor.api.app:criar --factory --port 8787"""
from __future__ import annotations

import importlib


import hmac
import os

from starlette.requests import Request  # nível de módulo: o FastAPI resolve a anotação pelo globals da função

LOOPBACK = ("127.0.0.1", "::1", "localhost", "testclient")


def _host_de_escuta() -> str:
    """Host informado ao processo (MOTOR_HOST, ou --host do uvicorn na linha de comando)."""
    import sys
    h = os.environ.get("MOTOR_HOST", "").strip()
    args = sys.argv
    for i, a in enumerate(args):
        if a == "--host" and i + 1 < len(args):
            h = args[i + 1]
        elif a.startswith("--host="):
            h = a.split("=", 1)[1]
    return h or "127.0.0.1"


def criar():
    from fastapi import Depends, FastAPI, Header, HTTPException

    from motor import config

    cfg = config.carregar()
    token = (cfg.motor_token or "").strip()
    if not token and _host_de_escuta() not in LOOPBACK:
        raise RuntimeError("MOTOR_TOKEN vazio: o motor só sobe fora de 127.0.0.1 com token (gere um e ponha no .env)")
    esperado = f"Bearer {token}".encode()

    def autorizado(request: Request, authorization: str = Header(default="")):
        if token:
            if not hmac.compare_digest(authorization.encode(), esperado):
                raise HTTPException(401, "token do motor inválido")
        elif (request.client.host if request.client else "") not in LOOPBACK:
            raise HTTPException(401, "motor sem MOTOR_TOKEN só atende a própria máquina")

    app = FastAPI(title="Motor do Editor creat.MTT", version="0.1.0", dependencies=[Depends(autorizado)])

    @app.get("/v1/saude")
    def saude(chave: bool = False, direcao: bool = False, olho: bool = False, entregas: bool = False):
        out = {"ok": True, "provedores": {t: cfg.provedor_efetivo(t) for t in ("armazenamento", "transcricao", "visao", "cerebro", "render", "publicacao")}}
        if chave:
            from motor.cerebro.diagnostico import checar_chave
            out["chave_cerebro"] = checar_chave(cfg)
        if direcao:
            from motor.cerebro.diagnostico import testar_direcao
            out["direcao_real"] = testar_direcao(cfg)
        if olho:
            from motor.cerebro.diagnostico import testar_olho
            out["olho_ia"] = testar_olho(cfg)
        import pathlib as _pl
        from motor.etapas import falante as _fal, pessoa as _pes
        pasta = _pl.Path(cfg.dados) / "modelos"             # só olha o disco: a saúde nunca baixa nada

        def _tem(var, nome):
            v = os.environ.get(var, "").strip()
            return _pl.Path(v).is_file() if v else (pasta / nome).is_file()
        from motor import qualidade_voz as _qv
        from motor.etapas.montagem import dfn3 as _dfn
        _pdfn = _pl.Path(os.environ.get("EDITOR_DFN3", "").strip() or (pasta / "dfn3"))
        out["modelos"] = {"pessoa": _tem("EDITOR_PESSOA", _pes.MODELO_NOME), "voz": _tem("EDITOR_FALANTE", _fal.MODELO_NOME),
                          "limpeza_voz": all((_pdfn / n).is_file() for n in _dfn.ARQUIVOS),
                          "medidor_voz": _tem("EDITOR_DNSMOS", _qv.MODELO_NOME)}
        try:                                                # o boot confere o navegador do kit (motor/modelos.py)
            import json as _json
            out["modelos"]["navegador"] = _json.loads((pasta / "navegador.json").read_text()).get("ok")
        except (OSError, ValueError):
            out["modelos"]["navegador"] = None
        from motor import backup as _backup
        import re as _re
        _bk = _backup.estado(cfg)
        out["backup"] = {k: v for k, v in _bk.items() if k in ("destino", "estado", "ultimo_ok", "horas_desde_o_ultimo", "r2", "copias")}
        if _bk.get("estado") == "falha" and _bk.get("erro"):   # causa da falha, sem caminhos internos (a saúde é pública)
            out["backup"]["erro"] = _re.sub(r"(/[\w.@-]+)+/?", "<caminho>", str(_bk["erro"]))[:160]
        from motor import entregas_r2 as _ent
        out["entregas"] = _ent.estado_saude(cfg, provar=entregas)    # ?entregas=1 prova a permissão do token (list MaxKeys=1)
        from motor.etapas import espelho as _esp
        if _esp.ligado():
            out["espelho"] = {"ligado": True, "teto_gb": round(_esp.teto_bytes() / (1 << 30), 1)}
        return out

    if os.environ.get("EDITOR_BACKUP_AGENDAR") == "1":            # só no servidor (iniciar.sh); testes e aceites não agendam
        from motor import backup as _backup_ag
        _backup_ag.agendar(cfg)
    for nome in ("projetos", "direcao", "versoes", "referencias", "backup", "gastos", "biblioteca", "cliente"):
        try:
            mod = importlib.import_module(f"motor.api.{nome}")
        except ModuleNotFoundError as e:
            if e.name != f"motor.api.{nome}":
                raise
            continue
        app.include_router(mod.rotas, prefix="/v1")
    return app
