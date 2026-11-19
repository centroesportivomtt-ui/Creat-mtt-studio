"""Falante por VOZ (padrão, grátis, sem rede, sem modelo pago): quem fala em cada trecho da transcrição.

Impressão digital da voz só com numpy/scipy, por janela de áudio (16 kHz):
- MFCC 1..19 sobre log-mel de 40 faixas (média e desvio): timbre, ou seja, o "formato" do trato vocal;
- f0 (pitch) por autocorrelação normalizada em quadros de 40 ms: mediana e espalhamento em oitavas, fração vozeada.
Cada grupo tem um piso de desvio próprio ("normalização por faixa"), para nenhum grupo dominar por escala.

Perfis em $EDITOR_FALANTES_DIR/<nome>/perfil.json (padrão $EDITOR_DADOS/biblioteca/falantes), gravados por
`python -m motor.ferramentas.cadastrar_falante --nome marcos a.wav b.wav`. Guardam só estatísticas (soma, soma dos
quadrados, n) das janelas cadastradas, nunca o áudio.

Decisão por trecho: distância de Mahalanobis diagonal (desvio dentro do falante, juntado entre os perfis) para cada
perfil + uma classe "nenhum deles" a EDITOR_FALANTE_LIMIAR desvios; softmax de -d²/2. Fica `desconhecido` quando
vence a classe "nenhum", quando o 1º perfil não abre EDITOR_FALANTE_MARGEM de probabilidade sobre o 2º, quando o
trecho é curto (< 1,2 s) ou quando não parece voz (silêncio, tom contínuo, pouca modulação). Não chuta.

Opcional: EDITOR_FALANTE_MODELO aponta para um .onnx de embeddings de locutor (entrada log-mel 80 [1, T, 80]);
onnxruntime é importado só então. Sem ele (ou sem embedding no perfil), vale o método simples.
Rosto: ainda não reforça (pendência no README-falante.md); falante_metodo sai sempre "voz".
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import pathlib
import re

import numpy as np

log = logging.getLogger("motor.falante")

ALGO = "voz-1"
SR = 16000
N_FFT, JANELA, PASSO = 512, 400, 160          # 25 ms / 10 ms
JANELA_F0 = 640                                # 40 ms (2+ períodos a 60 Hz)
F0_MIN, F0_MAX = 60.0, 400.0
N_MEL, N_MFCC = 40, 19
MIN_TRECHO_S = 1.2
MAX_TRECHO_S = 15.0
EQUIPE = ("marcos", "ruan", "xande")
# pesos e pisos de desvio por faixa do vetor (mfcc médias, mfcc desvios, f0 mediana, f0 espalhamento, fração vozeada)
FAIXAS = [("mfcc_media", N_MFCC, 1.0, 0.6), ("mfcc_desvio", N_MFCC, 0.5, 0.3), ("f0_mediana", 1, 6.0, 0.06),
          ("f0_espalho", 1, 1.0, 0.08), ("vozeado", 1, 0.5, 0.1)]
DIM = sum(n for _, n, _, _ in FAIXAS)


def _f(nome: str, padrao: float) -> float:
    try:
        return float(os.environ.get(nome, "").strip() or padrao)
    except ValueError:
        return padrao


def dir_falantes(cfg=None) -> pathlib.Path:
    env = os.environ.get("EDITOR_FALANTES_DIR", "").strip()
    if env:
        return pathlib.Path(env)
    dados = getattr(cfg, "dados", None) or os.environ.get("EDITOR_DADOS", "").strip()
    if not dados:
        from motor import config
        dados = config.RAIZ_REPO / "dados"
    return pathlib.Path(dados) / "biblioteca" / "falantes"


def nome_valido(nome: str) -> str:
    n = (nome or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,39}", n):
        raise ValueError("nome do falante: só letras minúsculas sem acento, números, _ e - (até 40)")
    return n


def rotulo_de(nome: str) -> str:
    """Perfil -> valor do contrato: marcos | ruan | xande; qualquer outro perfil cadastrado vira 'outro'."""
    return nome if nome in EQUIPE else "outro"


# ---------------- áudio ----------------
def ler_trecho(wav: pathlib.Path, s: float, e: float) -> np.ndarray:
    """Lê só o trecho [s, e] do WAV (acesso direto, sem carregar o arquivo inteiro) e devolve mono 16 kHz."""
    import soundfile as sf
    info = sf.info(str(wav))
    a, b = max(0, int(s * info.samplerate)), max(0, int(e * info.samplerate))
    if b <= a:
        return np.zeros(0, dtype=np.float32)
    x, sr = sf.read(str(wav), start=a, stop=min(b, info.frames), dtype="float32", always_2d=True)
    return reamostrar(x.mean(axis=1), sr)


def reamostrar(x: np.ndarray, sr: int) -> np.ndarray:
    if sr == SR or len(x) == 0:
        return np.asarray(x, dtype=np.float32)
    from scipy.signal import resample_poly
    g = math.gcd(int(sr), SR)
    return resample_poly(x, SR // g, int(sr) // g).astype(np.float32)


def _quadros(x: np.ndarray, n: int, passo: int) -> np.ndarray:
    if len(x) < n:
        return np.zeros((0, n), dtype=np.float32)
    k = 1 + (len(x) - n) // passo
    idx = np.arange(n)[None, :] + passo * np.arange(k)[:, None]
    return x[idx]


_MEL: dict = {}


def _banco_mel(n_mel: int = N_MEL, fmin: float = 60.0, fmax: float = 7600.0) -> np.ndarray:
    if n_mel not in _MEL:
        mel = lambda f: 2595 * np.log10(1 + f / 700)          # noqa: E731
        imel = lambda m: 700 * (10 ** (m / 2595) - 1)         # noqa: E731
        pts = imel(np.linspace(mel(fmin), mel(fmax), n_mel + 2))
        bins = np.floor((N_FFT + 1) * pts / SR).astype(int)
        fb = np.zeros((n_mel, N_FFT // 2 + 1), dtype=np.float32)
        for i in range(n_mel):
            a, c, b = bins[i], bins[i + 1], bins[i + 2]
            for k in range(a, c):
                fb[i, k] = (k - a) / max(1, c - a)
            for k in range(c, b):
                fb[i, k] = (b - k) / max(1, b - c)
        _MEL[n_mel] = fb
    return _MEL[n_mel]


def log_mel(x: np.ndarray, n_mel: int = N_MEL) -> tuple[np.ndarray, np.ndarray]:
    """(log-mel [T, n_mel], energia dBFS por quadro [T])."""
    q = _quadros(np.append(x[:1], x[1:] - 0.97 * x[:-1]), JANELA, PASSO)
    if not len(q):
        return np.zeros((0, n_mel), dtype=np.float32), np.zeros(0, dtype=np.float32)
    bruto = _quadros(x, JANELA, PASSO)
    db = 20 * np.log10(np.sqrt((bruto * bruto).mean(axis=1)) + 1e-9)
    esp = np.abs(np.fft.rfft(q * np.hanning(JANELA).astype(np.float32), N_FFT)) ** 2
    return np.log(esp @ _banco_mel(n_mel).T + 1e-10).astype(np.float32), db.astype(np.float32)


def f0_quadros(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(f0 em Hz por quadro de 40 ms, força da periodicidade 0-1). f0 = 0 onde não é vozeado."""
    q = _quadros(x, JANELA_F0, PASSO)
    if not len(q):
        return np.zeros(0), np.zeros(0)
    q = q - q.mean(axis=1, keepdims=True)
    X = np.fft.rfft(q, 2 * JANELA_F0)
    r = np.fft.irfft(np.abs(X) ** 2)[:, :JANELA_F0]
    r0 = r[:, :1] + 1e-12
    # normaliza pelo número de amostras que se sobrepõem em cada atraso (autocorrelação não enviesada)
    r = (r / r0) * (JANELA_F0 / (JANELA_F0 - np.arange(JANELA_F0)))[None, :]
    lo, hi = int(SR / F0_MAX), int(SR / F0_MIN)
    seg = r[:, lo:hi]
    k = seg.argmax(axis=1)
    forca = seg[np.arange(len(seg)), k]
    lag = (k + lo).astype(float)
    # oitava: se metade do atraso também é bem periódica, o f0 é o dobro
    meio = (lag / 2).astype(int)
    ok_meio = (meio >= lo) & (r[np.arange(len(r)), np.clip(meio, 0, JANELA_F0 - 1)] > 0.9 * forca)
    lag = np.where(ok_meio, meio, lag)
    f0 = np.where(forca > 0.5, SR / np.maximum(lag, 1), 0.0)
    return f0, np.clip(forca, 0, 1)


# ---------------- impressão digital ----------------
def impressao(x: np.ndarray) -> dict:
    """Vetor da voz de um trecho mono 16 kHz + diagnóstico (é voz? por quê não?)."""
    dur = len(x) / SR
    if dur < MIN_TRECHO_S:
        return {"voz": False, "motivo": "curto", "dur": dur}
    lm, db = log_mel(x)
    if not len(db) or float(db.max()) < -55:
        return {"voz": False, "motivo": "silencio", "dur": dur}
    ativo = (db > max(-55.0, float(db.max()) - 30.0))
    if ativo.sum() < 0.5 / (PASSO / SR):
        return {"voz": False, "motivo": "silencio", "dur": dur}
    f0, _ = f0_quadros(x)
    n = min(len(f0), len(ativo))
    f0, at = f0[:n], ativo[:n]
    voz = f0[at & (f0 > 0)]
    frac = float(len(voz) / max(1, at.sum()))
    if len(voz) < 30 or frac < 0.15:
        return {"voz": False, "motivo": "sem_vozeamento", "dur": dur}
    oit = np.log2(voz / 100.0)
    espalho = float(np.percentile(oit, 75) - np.percentile(oit, 25))
    variacao = float(np.std(oit) * 12)                              # em semitons
    modulacao = float(np.std(db[ativo]))                           # fala tem sílabas: a energia sobe e desce
    if variacao < 0.25 or modulacao < 2.5:
        return {"voz": False, "motivo": "tom", "dur": dur}
    from scipy.fft import dct
    mf = dct(lm[ativo], type=2, norm="ortho", axis=1)[:, 1:1 + N_MFCC]
    vet = np.concatenate([mf.mean(axis=0), mf.std(axis=0), [float(np.median(oit))], [espalho], [frac]]).astype(np.float64)
    return {"voz": True, "vetor": vet, "dur": dur, "f0": float(100 * 2 ** np.median(oit))}


def janelas(x: np.ndarray, dur_s: float = 3.0, passo_s: float = 1.5) -> list[np.ndarray]:
    n, p = int(dur_s * SR), int(passo_s * SR)
    if len(x) <= n:
        return [x]
    return [x[i:i + n] for i in range(0, len(x) - n + 1, p)]


# ---------------- perfis ----------------
def perfil_vazio(nome: str) -> dict:
    return {"nome": nome, "algo": ALGO, "dim": DIM, "n": 0, "soma": [0.0] * DIM, "soma2": [0.0] * DIM,
            "segundos": 0.0, "arquivos": [], "emb": None, "emb_n": 0, "rosto": None}


def media_desvio(p: dict) -> tuple[np.ndarray, np.ndarray]:
    n = max(1, int(p["n"]))
    s, s2 = np.asarray(p["soma"], float), np.asarray(p["soma2"], float)
    mu = s / n
    var = np.maximum(s2 / n - mu * mu, 0.0) * (n / max(1, n - 1))
    return mu, np.sqrt(var)


def carregar_perfis(pasta: pathlib.Path) -> dict[str, dict]:
    out = {}
    if not pasta.is_dir():
        return out
    for f in sorted(pasta.glob("*/perfil.json")):
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            log.warning("perfil de falante ilegível em %s (%s); ignorado", f.parent.name, e)
            continue
        if p.get("algo") != ALGO or int(p.get("n", 0)) < 2 or len(p.get("soma", [])) != DIM:
            log.warning("perfil '%s' sem janelas suficientes ou de outra versão; ignorado", f.parent.name)
            continue
        out[f.parent.name] = p
    return out


def _pisos() -> tuple[np.ndarray, np.ndarray]:
    pesos, pisos = [], []
    for _, n, w, piso in FAIXAS:
        pesos += [w] * n
        pisos += [piso] * n
    return np.asarray(pesos), np.asarray(pisos)


class Classificador:
    """Perfis -> rótulo de um vetor. Separado do provedor para o cadastro e os testes usarem igual."""

    def __init__(self, perfis: dict[str, dict], *, limiar: float | None = None, margem: float | None = None):
        self.nomes = sorted(perfis)
        self.limiar = _f("EDITOR_FALANTE_LIMIAR", 2.5) if limiar is None else limiar
        self.margem = _f("EDITOR_FALANTE_MARGEM", 0.2) if margem is None else margem
        self.pesos, pisos = _pisos()
        md = [media_desvio(perfis[n]) for n in self.nomes]
        self.mu = np.stack([m for m, _ in md]) if md else np.zeros((0, DIM))
        within = np.mean([d * d for _, d in md], axis=0) if md else np.zeros(DIM)
        self.sigma = np.sqrt(within + pisos * pisos)               # desvio dentro do falante, juntado

    def distancias(self, vet: np.ndarray) -> np.ndarray:
        z = (vet[None, :] - self.mu) / self.sigma[None, :]
        return np.sqrt((self.pesos[None, :] * z * z).sum(axis=1) / self.pesos.sum())

    def decidir(self, vet: np.ndarray) -> tuple[str, float, dict]:
        """('marcos'|...|'outro'|'desconhecido', confiança 0-1, detalhe)."""
        if not self.nomes:
            return "desconhecido", 0.0, {"motivo": "sem_perfis"}
        d = self.distancias(vet)
        logit = np.append(-0.5 * d * d, -0.5 * self.limiar ** 2)   # última = "nenhum dos perfis"
        p = np.exp(logit - logit.max())
        p /= p.sum()
        ordem = np.argsort(-p)
        i1, i2 = int(ordem[0]), int(ordem[1]) if len(ordem) > 1 else None
        det = {"d": {n: round(float(x), 2) for n, x in zip(self.nomes, d)}}
        if i1 == len(self.nomes):
            return "desconhecido", round(float(p[i1]), 3), {**det, "motivo": "longe_de_todos"}
        p2 = float(p[i2]) if i2 is not None else 0.0
        if float(p[i1]) - p2 < self.margem or float(p[i1]) < 0.5:
            return "desconhecido", round(1 - float(p[i1]), 3), {**det, "motivo": "ambiguo"}
        return rotulo_de(self.nomes[i1]), round(float(p[i1]), 3), {**det, "perfil": self.nomes[i1]}


# ---------------- modelo ONNX opcional ----------------
class Embedder:
    """Embeddings de locutor por ONNX (EDITOR_FALANTE_MODELO). Import tardio: sem onnxruntime, None."""

    @staticmethod
    def abrir() -> "Embedder | None":
        caminho = os.environ.get("EDITOR_FALANTE_MODELO", "").strip()
        if not caminho:
            return None
        if not pathlib.Path(caminho).is_file():
            log.warning("EDITOR_FALANTE_MODELO não aponta para um arquivo; usando o método simples")
            return None
        try:
            import onnxruntime as ort  # noqa: PLC0415
        except ImportError:
            log.warning("onnxruntime não instalado (extra 'falante'); usando o método simples")
            return None
        try:
            return Embedder(ort.InferenceSession(caminho, providers=["CPUExecutionProvider"]), caminho)
        except Exception as e:  # noqa: BLE001
            log.warning("modelo de falante não abriu (%s); usando o método simples", e)
            return None

    def __init__(self, sessao, caminho: str):
        self.sessao, self.entrada = sessao, sessao.get_inputs()[0].name
        self.id = hashlib.sha256(pathlib.Path(caminho).read_bytes()).hexdigest()[:12]

    def vetor(self, x: np.ndarray) -> np.ndarray:
        lm, _ = log_mel(x, 80)
        lm = (lm - lm.mean(axis=0, keepdims=True))[None, :, :].astype(np.float32)
        out = np.asarray(self.sessao.run(None, {self.entrada: lm})[0], dtype=np.float64)
        v = out.reshape(-1, out.shape[-1]).mean(axis=0) if out.ndim > 1 else out
        return v / (np.linalg.norm(v) + 1e-9)


def decidir_emb(emb: np.ndarray, perfis: dict[str, dict], margem: float) -> tuple[str, float, dict]:
    nomes = sorted(perfis)
    limiar = _f("EDITOR_FALANTE_LIMIAR_COS", 0.5)
    cos = np.array([float(np.dot(emb, np.asarray(perfis[n]["emb"], float) / (np.linalg.norm(perfis[n]["emb"]) + 1e-9))) for n in nomes])
    logit = np.append(cos, limiar) / 0.1
    p = np.exp(logit - logit.max())
    p /= p.sum()
    ordem = np.argsort(-p)
    i1 = int(ordem[0])
    if i1 == len(nomes):
        return "desconhecido", round(float(p[i1]), 3), {"motivo": "longe_de_todos"}
    p2 = float(p[int(ordem[1])]) if len(ordem) > 1 else 0.0
    if float(p[i1]) - p2 < margem or float(p[i1]) < 0.5:
        return "desconhecido", round(1 - float(p[i1]), 3), {"motivo": "ambiguo"}
    return rotulo_de(nomes[i1]), round(float(p[i1]), 3), {"perfil": nomes[i1]}


# ---------------- provedor ----------------
class FalanteVoz:
    nome = "voz"

    def __init__(self, cfg=None):
        self.pasta = dir_falantes(cfg)
        self.perfis = carregar_perfis(self.pasta)
        self.clf = Classificador(self.perfis)
        self.emb = Embedder.abrir() if self.perfis else None
        if self.emb is not None and not all(p.get("emb") for p in self.perfis.values()):
            log.warning("perfis cadastrados sem embedding do modelo; recadastre para usar o modelo (método simples por ora)")
            self.emb = None

    @property
    def ativo(self) -> bool:
        """Sem perfil cadastrado não há com quem comparar: o provedor não rotula e não muda a assinatura da análise."""
        return bool(self.perfis)

    def assinatura(self) -> str:
        h = hashlib.sha256()
        h.update(f"{ALGO}|{self.clf.limiar}|{self.clf.margem}|{self.emb.id if self.emb else '-'}".encode())
        for n in sorted(self.perfis):
            p = self.perfis[n]
            h.update(json.dumps([n, p["n"], [round(v, 6) for v in p["soma"]]]).encode())
        return h.hexdigest()[:16]

    def rotular(self, wav: pathlib.Path | None, segmentos: list[dict], contexto: dict | None = None) -> list[dict | None]:
        """Um rótulo por segmento ({falante, falante_confianca, falante_metodo}) ou None (não rotula)."""
        if not self.ativo or wav is None:
            return [None] * len(segmentos)
        out = []
        for s in segmentos:
            ini, fim = float(s["s"]), float(s["e"])
            if fim - ini > MAX_TRECHO_S:                  # trecho longo: o miolo basta (custo fixo por trecho)
                meio = (ini + fim) / 2
                ini, fim = meio - MAX_TRECHO_S / 2, meio + MAX_TRECHO_S / 2
            x = ler_trecho(wav, ini, fim)
            imp = impressao(x)
            if not imp["voz"]:
                out.append({"falante": "desconhecido", "falante_confianca": 0.0, "falante_metodo": "voz"})
                continue
            if self.emb is not None:
                rot, conf, _ = decidir_emb(self.emb.vetor(x), self.perfis, self.clf.margem)
            else:
                rot, conf, _ = self.clf.decidir(imp["vetor"])
            out.append({"falante": rot, "falante_confianca": conf, "falante_metodo": "voz"})
        return out
