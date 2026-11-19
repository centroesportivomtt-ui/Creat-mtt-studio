"""Interfaces dos provedores (ARQUITETURA.md §5). Cada tipo tem um provedor local/grátis que sempre funciona
e provedores pagos plugáveis, desligados quando falta a chave (config.provedor_efetivo).

Implementações:
  armazenamento: local (frente A) | r2 (frente A, S3 compatível; desligado sem R2_*)
  transcricao:   faster-whisper (A) | parakeet (A, sherpa-onnx; triagem rápida) | scribe (A, pago, desligado)
  visao:         local (A, heurísticas) | claude-leve (A, Haiku sobre folhas de contato) | gemini (A, pago, desligado)
  cerebro:       fixture (B) | anthropic (B)
  render:        cpu (C) | modal (C, GPU, pago, desligado)
  publicacao:    nenhuma (C) | metricool | meta (C, desligados)
  falante:       voz (padrão, numpy/scipy + perfis cadastrados) | fixture (testes) | desligado
"""
from __future__ import annotations

import pathlib
from typing import BinaryIO, Iterator, Protocol, runtime_checkable


@runtime_checkable
class Armazenamento(Protocol):
    """Objetos por chave ('entrada/<projeto>/<arquivo>', 'derivados/...', 'saidas/...')."""
    def caminho_local(self, chave: str) -> pathlib.Path: ...        # baixa para cache local se preciso e devolve o caminho
    def gravar(self, chave: str, origem: pathlib.Path | BinaryIO) -> str: ...
    def existe(self, chave: str) -> bool: ...
    def tamanho(self, chave: str) -> int: ...
    def listar(self, prefixo: str) -> Iterator[str]: ...
    def apagar(self, chave: str) -> None: ...
    def url(self, chave: str, expira_s: int = 3600) -> str: ...      # link para o player/entrega (local: rota do motor; r2: pré-assinado)
    def iniciar_multipart(self, chave: str) -> str: ...              # envio retomável direto (r2); local devolve id do tus
    def url_parte(self, chave: str, envio_id: str, parte: int) -> str: ...
    def concluir_multipart(self, chave: str, envio_id: str, partes: list[dict]) -> None: ...


@runtime_checkable
class Transcricao(Protocol):
    nome: str
    def transcrever(self, wav: pathlib.Path, *, idioma: str = "pt", palavras: bool = True, dicas: list[str] | None = None) -> dict: ...
    # devolve o objeto 'transcricao' de analise.schema.json; SEM VAD (vad=false)


@runtime_checkable
class Visao(Protocol):
    nome: str
    def descrever(self, folha_jpg: pathlib.Path, tempos: list[float], contexto: dict) -> dict | None: ...
    # devolve o objeto 'visao' de analise.schema.json (ou None no provedor local sem semântica)


@runtime_checkable
class Falante(Protocol):
    nome: str
    ativo: bool                                                       # False: não rotula e não entra na assinatura da análise
    def assinatura(self) -> str: ...                                  # muda quando perfis/limiares mudam (reprocessa só o rótulo)
    def rotular(self, wav: pathlib.Path | None, segmentos: list[dict], contexto: dict | None = None) -> list[dict | None]: ...
    # um item por segmento: {'falante': marcos|ruan|xande|outro|desconhecido, 'falante_confianca': 0-1,
    #                        'falante_metodo': voz|rosto|voz+rosto|fixture} ou None (sem rótulo)


@runtime_checkable
class Cerebro(Protocol):
    nome: str
    def dirigir(self, *, sistema: str, catalogo_txt: str, pedido_txt: str, esquema: dict, maximo_saida: int) -> tuple[dict, dict]: ...
    # devolve (direcao, uso) com uso = {'entrada': n, 'entrada_cache': n, 'saida': n, 'modelo': '...', 'custo_usd': x}
    def criticar(self, *, sistema: str, catalogo_txt: str, direcao: dict, pedido_txt: str, esquema: dict) -> tuple[dict, dict]: ...
    def leve(self, *, tarefa: str, texto: str, esquema: dict | None = None) -> tuple[dict | str, dict]: ...


@runtime_checkable
class Render(Protocol):
    nome: str
    def planos(self, edl: dict, saida_dir: pathlib.Path, *, ids: list[str] | None = None) -> list[pathlib.Path]: ...
    def overlay(self, cena: dict, saida_dir: pathlib.Path) -> pathlib.Path: ...     # PNG RGBA por quadro ou stream
    def compor(self, edl: dict, planos_dir: pathlib.Path, overlay: pathlib.Path, audio: pathlib.Path, saida: pathlib.Path) -> pathlib.Path: ...


@runtime_checkable
class Publicacao(Protocol):
    nome: str
    def publicar(self, video_url: str, legenda: str, *, rede: str, quando: str | None = None) -> dict: ...
