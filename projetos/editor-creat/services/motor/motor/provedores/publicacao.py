"""Publicação. Padrão 'nenhuma' = entrega só o link (o dono posta). Metricool e Meta são PAGOS/externos: desligados sem
token (config.provedor_efetivo) e, nesta fase, não implementados — falham com mensagem clara em vez de fingir que postaram.
Fase 3: Metricool (createScheduledPost) ou Meta Graph (Reels: container de mídia + publish), sempre com aprovação do dono."""
from __future__ import annotations


class Nenhuma:
    nome = "nenhuma"

    def __init__(self, cfg):
        self.cfg = cfg

    def publicar(self, video_url: str, legenda: str, *, rede: str, quando: str | None = None) -> dict:
        return {"publicado": False, "rede": rede, "motivo": "publicação desligada (EDITOR_PUBLICACAO=nenhuma): o link está pronto para postar",
                "link": video_url, "legenda": legenda}


class _Externa:
    nome = "externa"

    def __init__(self, cfg):
        self.cfg = cfg

    def publicar(self, video_url: str, legenda: str, *, rede: str, quando: str | None = None) -> dict:
        raise NotImplementedError(f"publicação por {self.nome} fica para a Fase 3 (com aprovação do dono); use o link da entrega")


class Metricool(_Externa):
    nome = "metricool"


class Meta(_Externa):
    nome = "meta"
