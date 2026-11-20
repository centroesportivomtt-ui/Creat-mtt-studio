"""PESSOA: máscara de quem aparece no plano, quadro a quadro, para o texto ATRÁS da pessoa e o fundo desfocado (item 2 do mapa).

Modelo: Robust Video Matting, MobileNetV3 (ONNX fp32, 15 MB), escolhido em 20/11/2026 (pesquisa do Radar, medida nesta CPU):
- é TEMPORAL (estados r1..r4 passam de um quadro para o outro): a borda não treme, que é o defeito que entrega o truque;
- ~11 ms por quadro em 640x360 na CPU (MODNet, a reserva sem GPL, dava 80-140 ms e é quadro a quadro);
- alpha de verdade (cabelo com meio-tom), não máscara binária.
Licença: GPL-3.0 (código e pesos no repositório oficial). Usado SÓ no servidor, baixado na primeira vez de github.com e
conferido pelo sha256; não é distribuído a cliente nenhum. Se um dia o editor for entregue como programa a terceiros, trocar
pelo MODNet (Apache-2.0) ou rever a licença. Registro em docs/stack-ferramentas-2026.md.

Sem o modelo (sem rede, sha256 diferente, EDITOR_MODELOS_BAIXAR=0), `disponivel` é False e a composição entrega o filme como
antes: camada de trás por cima e fundo sem desfoque. Nunca some texto por falta de máscara.
"""
from __future__ import annotations

import hashlib
import logging
import os
import pathlib
import urllib.request

import numpy as np

log = logging.getLogger(__name__)

MODELO_NOME = "rvm_mobilenetv3_fp32.onnx"
MODELO_URL = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx"
MODELO_SHA256 = "88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828"   # conferido em 20/11/2026 (14.975.696 bytes)
LADO = 640                 # lado maior do quadro que entra no modelo (1080x1920 -> 360x640)
REDUCAO = 0.4              # downsample_ratio do RVM para esse tamanho (o miolo do modelo trabalha em ~144x256)


def _modelo(cfg) -> pathlib.Path | None:
    env = os.environ.get("EDITOR_PESSOA", "").strip()
    if env:
        return pathlib.Path(env) if pathlib.Path(env).is_file() else None
    p = pathlib.Path(cfg.dados) / "modelos" / MODELO_NOME
    if p.is_file():
        return p
    if os.environ.get("EDITOR_MODELOS_BAIXAR", "1") != "1":
        return None
    tmp = p.with_suffix(f".{os.getpid()}.tmp")
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(MODELO_URL, headers={"User-Agent": "editor-motor/0.1"}), timeout=120) as r, \
                open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
                if f.tell() > 40_000_000:
                    raise OSError("modelo maior que o esperado")
        h = hashlib.sha256()
        with open(tmp, "rb") as f:
            for bloco in iter(lambda: f.read(1 << 20), b""):
                h.update(bloco)
        if h.hexdigest() != MODELO_SHA256:                 # arquivo de terceiros: só carrega o que foi conferido
            raise OSError("sha256 do modelo não confere")
        os.replace(tmp, p)
        return p
    except Exception as e:  # noqa: BLE001 - sem rede: segue sem máscara (o filme sai como antes)
        log.warning("modelo de pessoa indisponível (%s)", e)
        tmp.unlink(missing_ok=True)
        return None


class Recortador:
    """alfa(bgr) -> máscara float32 (H, W) em 0..1 (1 = pessoa), do tamanho do quadro. `novo_plano()` zera a memória no corte."""

    def __init__(self, cfg):
        self.sessao = None
        self._estado = None
        m = _modelo(cfg)
        if m is None:
            return
        try:
            import onnxruntime as ort
            op = ort.SessionOptions()
            op.intra_op_num_threads = int(os.environ.get("EDITOR_THREADS", "2") or 2)
            op.log_severity_level = 3
            self.sessao = ort.InferenceSession(str(m), sess_options=op, providers=["CPUExecutionProvider"])
        except Exception as e:  # noqa: BLE001
            log.warning("modelo de pessoa não carregou: %s", e)
        self.novo_plano()

    @property
    def disponivel(self) -> bool:
        return self.sessao is not None

    def novo_plano(self) -> None:
        z = np.zeros((1, 1, 1, 1), np.float32)
        self._estado = [z, z, z, z]

    def alfa(self, bgr: np.ndarray) -> np.ndarray:
        h, w = bgr.shape[:2]
        if self.sessao is None:
            return np.zeros((h, w), np.float32)
        return ampliar(self.alfa_pequena(bgr), w, h)

    def alfa_pequena(self, bgr: np.ndarray) -> np.ndarray:
        """A máscara do tamanho que o modelo vê (lado maior 640), uint8 0..255: barata de guardar entre a passada prévia e a
        composição (90 quadros = ~20 MB; em 1080x1920 float seriam 750 MB)."""
        import cv2
        h, w = bgr.shape[:2]
        esc = LADO / max(h, w)
        pw, ph = max(32, int(round(w * esc / 4)) * 4), max(32, int(round(h * esc / 4)) * 4)
        peq = cv2.cvtColor(cv2.resize(bgr, (pw, ph), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        src = (peq.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        r1, r2, r3, r4 = self._estado
        _fgr, pha, *rs = self.sessao.run(None, {"src": src, "r1i": r1, "r2i": r2, "r3i": r3, "r4i": r4,
                                                "downsample_ratio": np.array([REDUCAO], np.float32)})
        self._estado = rs
        return (np.clip(pha[0, 0], 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def ampliar(pequena: np.ndarray, w: int, h: int) -> np.ndarray:
    """Máscara pequena (uint8) -> float32 0..1 no tamanho do quadro (cúbica: borda de cabelo sem escada)."""
    import cv2
    a = cv2.resize(pequena.astype(np.float32) / 255.0, (w, h), interpolation=cv2.INTER_CUBIC)
    return np.clip(a, 0.0, 1.0).astype(np.float32)


def precisa(edl: dict) -> bool:
    """O filme usa a máscara? (camada atrás da pessoa ou fundo desfocado em algum plano)"""
    return any(m.get("atras") for m in edl.get("motion") or []) or \
        any((p.get("fundo") or {}).get("desfoque") for p in edl.get("planos") or [])


def recortador_para(edl: dict, cfg) -> Recortador | None:
    """Só carrega o modelo quando o filme pede (sem custo nos filmes que não usam)."""
    return Recortador(cfg) if precisa(edl) else None
