"""Roteador de render: decide CPU ou GPU (Modal) pelo TAMANHO do filme e cai na CPU quando a GPU não pode ser usada.

Tamanho = duração do EDL (s) x fator de resolução da maior fonte usada pelos planos (pixels / 1920x1080, mínimo 1).
Ex.: um Reel de 30 s em 1080p pesa 30; o filme V2 de 110 s em 4K pesa 440. Vai para a GPU quando o peso passa de
EDITOR_GPU_LIMITE_S (padrão 120: por medida da fase 1, esta máquina monta ~6,4 s por segundo de filme; acima de ~120 s
equivalentes a montagem na CPU passa de 12 min e aperta a meta de 30 min).

A GPU só entra com EDITOR_RENDER=modal E MODAL_TOKEN_SECRET (config.provedor_efetivo) — gasto autorizado pelo dono.
Qualquer falha da GPU (sem pacote, sem token, função não publicada, erro remoto) vira aviso no log e a CPU renderiza.

Uso pela montagem (troca de uma linha em etapas/montagem/__init__.py):
    from motor.provedores.render_roteador import renderizar_planos
    res_pl = renderizar_planos(edl, fontes, cache_planos, cfg=cfg, workers=..., nice=..., janela=..., progresso=...)
Mesmo contrato de planos.renderizar.
"""
from __future__ import annotations

import logging
import os
import pathlib
from dataclasses import asdict, dataclass

log = logging.getLogger("motor.render")

LIMITE_PADRAO_S = 120.0
PIXELS_1080P = 1920 * 1080


def limite_s() -> float:
    try:
        return float(os.environ.get("EDITOR_GPU_LIMITE_S", "") or LIMITE_PADRAO_S)
    except ValueError:
        return LIMITE_PADRAO_S


@dataclass(frozen=True)
class Decisao:
    alvo: str              # cpu | gpu
    motivo: str
    duracao_s: float
    fator_resolucao: float
    peso_s: float
    limite_s: float

    def como_dict(self) -> dict:
        return asdict(self)


def duracao_do_edl(edl: dict) -> float:
    d = edl.get("duracao")
    if isinstance(d, (int, float)) and d > 0:
        return float(d)
    return max((float(p.get("t1", 0)) for p in edl.get("planos", [])), default=0.0)


def fator_resolucao(edl: dict, fontes=None, resolucoes: dict | None = None) -> float:
    """Maior (pixels da fonte / 1080p) entre as fontes que os planos usam. `resolucoes` = {fonte: (w, h)} já conhecidas
    (análise); sem elas, mede com ffprobe as fontes locais. Fonte que não dá para medir conta como 1080p."""
    usadas = {p.get("fonte") for p in edl.get("planos", []) if p.get("fonte")}
    fator = 1.0
    for fid in usadas:
        wh = (resolucoes or {}).get(fid)
        if wh is None and fontes is not None:
            try:
                from motor.etapas.montagem.comum import meta
                m = meta(fontes.video(fid))
                wh = (m.w, m.h)
            except Exception:  # noqa: BLE001 - fonte faltando: a própria montagem vai reclamar
                wh = None
        if wh and wh[0] and wh[1]:
            fator = max(fator, (float(wh[0]) * float(wh[1])) / PIXELS_1080P)
    return round(fator, 3)


def decidir(edl: dict, cfg, fontes=None, *, resolucoes: dict | None = None) -> Decisao:
    dur = duracao_do_edl(edl)
    lim = limite_s()
    efetivo = cfg.provedor_efetivo("render")
    if efetivo != "modal":
        pedido = getattr(cfg, "render", "cpu")
        motivo = ("GPU desligada (EDITOR_RENDER=cpu)" if pedido != "modal"
                  else "GPU pedida mas sem MODAL_TOKEN_SECRET: ficou na CPU")
        return Decisao("cpu", motivo, dur, 1.0, dur, lim)
    fator = fator_resolucao(edl, fontes, resolucoes)
    peso = round(dur * fator, 2)
    if peso < lim:
        return Decisao("cpu", f"filme pequeno ({dur:.0f} s x {fator:g} = {peso:.0f} < {lim:.0f}): CPU dá conta", dur, fator, peso, lim)
    return Decisao("gpu", f"filme grande ({dur:.0f} s x {fator:g} = {peso:.0f} >= {lim:.0f}): GPU", dur, fator, peso, lim)


def renderizar_planos(edl: dict, fontes, cache: pathlib.Path, *, cfg=None, resolucoes: dict | None = None, gpu=None, **kw) -> dict:
    """Drop-in de planos.renderizar com a escolha CPU/GPU. `gpu` injeta o provedor (testes); kw vão para quem renderiza.
    A decisão fica em renderizar_planos.ultima (para o relatório da montagem)."""
    from motor import config
    from motor.etapas.montagem import planos as PL
    cfg = cfg or config.carregar()
    d = decidir(edl, cfg, fontes, resolucoes=resolucoes)
    usado = "cpu"
    try:
        if d.alvo == "gpu":
            try:
                if gpu is None:
                    from motor.provedores.render_modal import RenderModal
                    gpu = RenderModal(cfg)
                res = gpu.renderizar(edl, fontes, cache, **{k: v for k, v in kw.items() if k in ("ids", "janela", "progresso")})
                usado = "gpu"
                return res
            except Exception as e:  # noqa: BLE001 - a CPU sempre funciona
                log.warning("render na GPU indisponível (%s: %s); renderizando os planos na CPU", type(e).__name__, e)
                d = Decisao("cpu", f"{d.motivo}; GPU falhou ({type(e).__name__}: {str(e)[:160]}), caiu na CPU",
                            d.duracao_s, d.fator_resolucao, d.peso_s, d.limite_s)
        return PL.renderizar(edl, fontes, pathlib.Path(cache), **kw)
    finally:
        renderizar_planos.ultima = dict(d.como_dict(), usado=usado)


renderizar_planos.ultima = None


class RenderRoteador:
    """Provedor Render (protocolo de provedores/base.py) que escolhe CPU/GPU por filme. Overlay e composição: CPU."""
    nome = "roteador"

    def __init__(self, cfg):
        self.cfg = cfg

    def planos(self, edl: dict, saida_dir: pathlib.Path, *, ids: list[str] | None = None, fontes=None) -> list[pathlib.Path]:
        from motor.etapas.montagem.comum import Fontes
        res = renderizar_planos(edl, fontes or Fontes(edl, None, self.cfg.dados), pathlib.Path(saida_dir), cfg=self.cfg,
                                ids=set(ids) if ids else None, workers=2, nice=int(self.cfg.nice or 0))
        return [pathlib.Path(r["arquivo"]) for r in res.values()]

    def overlay(self, cena_ou_edl: dict, saida_dir: pathlib.Path):
        from motor.provedores.render_cpu import RenderCPU
        return RenderCPU(self.cfg).overlay(cena_ou_edl, saida_dir)

    def compor(self, edl: dict, planos_dir, overlay, audio, saida: pathlib.Path) -> pathlib.Path:
        from motor.provedores.render_cpu import RenderCPU
        return RenderCPU(self.cfg).compor(edl, planos_dir, overlay, audio, saida)
