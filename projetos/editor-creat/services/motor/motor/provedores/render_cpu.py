"""Render na CPU desta máquina (padrão, sempre funciona): ffmpeg + OpenCV para os planos, Chromium headless (beginFrame,
N workers) para o motion do kit, composição numa passada. Implementa o protocolo Render de provedores/base.py."""
from __future__ import annotations

import pathlib


class RenderCPU:
    nome = "cpu"

    def __init__(self, cfg):
        self.cfg = cfg

    def planos(self, edl: dict, saida_dir: pathlib.Path, *, ids: list[str] | None = None, fontes=None) -> list[pathlib.Path]:
        from motor.etapas.montagem import planos as PL
        from motor.etapas.montagem.comum import Fontes
        res = PL.renderizar(edl, fontes or Fontes(edl, None, self.cfg.dados), pathlib.Path(saida_dir), workers=2,
                            nice=int(self.cfg.nice or 0), ids=set(ids) if ids else None)
        return [pathlib.Path(r["arquivo"]) for r in res.values()]

    def overlay(self, cena_ou_edl: dict, saida_dir: pathlib.Path) -> pathlib.Path | None:
        from motor.etapas.montagem import overlay as OV
        r = OV.renderizar(cena_ou_edl, None, pathlib.Path(saida_dir), workers=int(self.cfg.render_workers or 3), nice=int(self.cfg.nice or 0))
        return pathlib.Path(r["dir"]) if r.get("dir") else None

    def compor(self, edl: dict, planos_dir, overlay, audio, saida: pathlib.Path) -> pathlib.Path:
        from motor.etapas.montagem import comp as COMP
        res = planos_dir if isinstance(planos_dir, dict) else {}
        COMP.compor(edl, res, str(overlay) if overlay else None, str(audio) if audio else None, pathlib.Path(saida),
                    nice=int(self.cfg.nice or 0))
        return pathlib.Path(saida)
