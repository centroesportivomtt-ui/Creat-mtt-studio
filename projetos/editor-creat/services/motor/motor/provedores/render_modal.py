"""Render em GPU na nuvem (Modal; L4/L40S com NVENC). PAGO: só fica ativo com MODAL_TOKEN_ID/MODAL_TOKEN_SECRET E autorização
do dono (regra da casa). Fase 1: interface pronta, execução remota ainda não implementada — a montagem cai na CPU e avisa.
Plano (Fase 2): enviar só os trechos usados (-ss/-t) e o EDL; a função remota roda planos.render_plano com NVDEC/NVENC e
devolve os clipes 1080x1920; overlay e composição continuam aqui."""
from __future__ import annotations

import os


class RenderModal:
    nome = "modal"
    implementado = False

    def __init__(self, cfg):
        self.cfg = cfg
        if not (os.environ.get("MODAL_TOKEN_ID") and os.environ.get("MODAL_TOKEN_SECRET")):
            raise RuntimeError("Modal desligado: faltam MODAL_TOKEN_ID e MODAL_TOKEN_SECRET")

    def _nao(self, *_a, **_k):
        raise NotImplementedError("render na Modal fica para a Fase 2 (precisa de autorização do dono); use EDITOR_RENDER=cpu")

    planos = overlay = compor = _nao
