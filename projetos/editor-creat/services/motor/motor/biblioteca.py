"""BIBLIOTECA da casa: trilhas e efeitos sonoros com licença registrada (fila do dono, item E).

Regra: nada toca num filme sem licença registrada que permita uso comercial (vídeo de cliente e anúncio).
- `<dados>/biblioteca/trilhas.json` e `sfx.json`: um item por som, com a ficha da licença (tipo, fonte, autor, link dos
  termos, atribuição, quem registrou e quando). O áudio fica no armazenamento em `biblioteca/{trilhas,sfx}/<id>.wav`
  (no volume do servidor; o backup leva as fichas, não o áudio).
- Entrada por link (Dropbox ou Drive, como o material): baixa, converte para WAV 48 kHz, mede duração e, na trilha,
  o andamento (BPM) e a fase da batida, que o resolvedor usa para cortar na batida.
- `trilhas_validas()` é o que o diretor e o resolvedor enxergam: só item ativo, com licença válida e áudio presente.
  Efeito sonoro com o nome que o modelo pede (abre, chip, cta, embaralha, impacto, risco…) substitui o sintético.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import tempfile
import threading
import time

import numpy as np

TIPOS_LICENCA = {"propria": "gravada ou composta pela creat.MTT", "comprada": "biblioteca paga (Artlist, Epidemic, Musicbed…)",
                 "gerada_ia": "gerada por IA em plano que permite uso comercial", "livre": "livre de direitos (CC0, licença Pixabay…)"}
NOMES_SFX = ("abre", "chip", "cta", "embaralha", "impacto", "risco", "whoosh_curto", "hit_boom_grave")
ID_OK = re.compile(r"^[a-z0-9][a-z0-9_-]{1,40}$")
SR = 48000
_TRAVA = threading.Lock()


def _agora() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _raiz(cfg) -> pathlib.Path:
    return pathlib.Path(cfg.dados) / "biblioteca"


def _arq(cfg, tipo: str) -> pathlib.Path:
    return _raiz(cfg) / ("trilhas.json" if tipo == "trilha" else "sfx.json")


def ler(cfg, tipo: str) -> list[dict]:
    try:
        d = json.loads(_arq(cfg, tipo).read_text(encoding="utf-8"))
        return d if isinstance(d, list) else []
    except (OSError, ValueError):
        return []


def _gravar(cfg, tipo: str, itens: list[dict]) -> None:
    arq = _arq(cfg, tipo)
    arq.parent.mkdir(parents=True, exist_ok=True)
    tmp = arq.with_name(arq.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(itens, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, arq)


def problema_licenca(lic: dict | None) -> str | None:
    """None se a licença permite usar em vídeo de cliente; senão, o motivo (em pt-BR)."""
    if not isinstance(lic, dict):
        return "sem licença registrada"
    if lic.get("tipo") not in TIPOS_LICENCA:
        return "tipo de licença desconhecido"
    if not str(lic.get("fonte") or "").strip():
        return "falta dizer de onde veio (fonte)"
    if lic.get("uso_comercial") is not True:
        return "licença não confirmada para uso comercial"
    return None


def _audio_ok(arm, item: dict) -> bool:
    try:
        return bool(item.get("chave")) and arm is not None and arm.existe(item["chave"])
    except Exception:  # noqa: BLE001
        return False


def trilhas_validas(cfg, arm=None) -> tuple[list[dict], list[str]]:
    """(trilhas que podem tocar, avisos do que ficou de fora). Item antigo sem licença fica de fora."""
    ok, fora = [], []
    for t in ler(cfg, "trilha"):
        if t.get("ativo") is False:
            continue
        prob = problema_licenca(t.get("licenca"))
        if prob:
            fora.append(f"trilha {t.get('id')}: {prob}")
        elif arm is not None and not _audio_ok(arm, t):
            fora.append(f"trilha {t.get('id')}: áudio não encontrado")
        else:
            ok.append(t)
    return ok, fora


def pasta_sfx(cfg) -> pathlib.Path:
    """Onde a montagem procura `<nome>.wav` licenciado (montagem/trilha.som olha `<pasta>/sfx/<nome>.wav`)."""
    return pathlib.Path(cfg.dados) / "armazenamento" / "biblioteca"


# ---------------------------------------------------------------- medição
def ler_wav(p: pathlib.Path) -> tuple[np.ndarray, int]:
    import soundfile as sf
    x, sr = sf.read(str(p), dtype="float32", always_2d=True)
    return x.mean(axis=1), sr


def andamento(x: np.ndarray, sr: int) -> tuple[float | None, float]:
    """(BPM, fase em s da 1ª batida) pela autocorrelação do fluxo de energia (onsets). None se não houver pulso claro."""
    hop = max(1, sr // 100)                              # 10 ms
    n = len(x) // hop
    if n < 400:
        return None, 0.0
    q = x[: n * hop].astype(np.float64).reshape(n, hop)
    e = np.log10((q * q).mean(axis=1) + 1e-10)
    fluxo = np.maximum(0.0, np.diff(e, prepend=e[0]))
    fluxo -= fluxo.mean()
    ac = np.correlate(fluxo, fluxo, "full")[n - 1:]
    if ac[0] <= 0:
        return None, 0.0
    ac /= ac[0]
    lag_min, lag_max = int(6000 / 180), int(6000 / 70)     # 70 a 180 BPM, em quadros de 10 ms
    lags = np.arange(lag_min, min(lag_max, n - 1) + 1)
    if not len(lags):
        return None, 0.0
    pont = ac[lags] + 0.5 * ac[np.minimum(2 * lags, n - 1)]   # reforça o lag cujo dobro também bate
    k = int(lags[int(np.argmax(pont))])
    if ac[k] < 0.08:
        return None, 0.0
    # refino sub-quadro pela parábola
    a, b, c = ac[k - 1], ac[k], ac[min(k + 1, n - 1)]
    desl = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
    periodo = (k + float(np.clip(desl, -0.5, 0.5))) / 100.0
    bpm = 60.0 / periodo
    # fase: deslocamento do pente de batidas que mais coincide com os onsets
    passo = periodo * 100
    melhor, fase = -1.0, 0.0
    for f in range(int(passo)):
        idx = (f + np.arange(0, n / passo) * passo).astype(int)
        idx = idx[idx < n]
        s = float(fluxo[idx].sum())
        if s > melhor:
            melhor, fase = s, f / 100.0
    return round(bpm, 2), round(fase, 3)


def converter(origem: pathlib.Path, destino: pathlib.Path, *, max_s: float) -> float:
    """Qualquer áudio (ou vídeo com áudio) -> WAV 48 kHz estéreo 16 bits. Devolve a duração."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + ".tmp.wav")
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(origem), "-vn", "-t", f"{max_s:.0f}", "-ac", "2", "-ar", str(SR),
                        "-c:a", "pcm_s16le", str(tmp)], capture_output=True, text=True)
    if r.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        raise ValueError("esse arquivo não tem áudio que eu consiga ler")
    import soundfile as sf
    dur = float(sf.info(str(tmp)).duration)
    if dur < 0.05:
        tmp.unlink(missing_ok=True)
        raise ValueError("o áudio está vazio")
    os.replace(tmp, destino)
    return dur


# ---------------------------------------------------------------- entrada
def _ident(titulo: str, existentes: set[str]) -> str:
    import unicodedata
    base = unicodedata.normalize("NFKD", titulo.lower())
    base = re.sub(r"[^a-z0-9]+", "-", "".join(c for c in base if not unicodedata.combining(c))).strip("-")[:30] or "som"
    i, ident = 1, base
    while ident in existentes:
        i += 1
        ident = f"{base}-{i}"
    return ident


def registrar(cfg, arm, arquivo: pathlib.Path, *, tipo: str, titulo: str, licenca: dict, clima: str | None = None,
              nome: str | None = None, origem_url: str | None = None) -> dict:
    """Converte, mede e registra. Recusa sem licença válida. Efeito com o mesmo nome substitui o anterior."""
    if tipo not in ("trilha", "sfx"):
        raise ValueError("tipo deve ser trilha ou sfx")
    prob = problema_licenca(licenca)
    if prob:
        raise ValueError(f"não registro som sem licença válida: {prob}")
    if tipo == "sfx" and (not nome or not ID_OK.match(nome)):
        raise ValueError("o efeito precisa de um nome curto (ex.: impacto, chip, cta)")
    with _TRAVA:
        itens = ler(cfg, tipo)
        ident = nome if tipo == "sfx" else _ident(titulo, {i.get("id") for i in itens})
        chave = f"biblioteca/{'trilhas' if tipo == 'trilha' else 'sfx'}/{ident}.wav"
        with tempfile.TemporaryDirectory() as d:
            wav = pathlib.Path(d) / "a.wav"
            dur = converter(arquivo, wav, max_s=600 if tipo == "trilha" else 15)
            bpm, fase = andamento(*ler_wav(wav)) if tipo == "trilha" else (None, 0.0)
            ouvida = {}
            if tipo == "trilha":                                  # o editor ouve a música: virada, partes e tom (motor/musica.py)
                try:
                    from motor import musica
                    ouvida = musica.mapa(*ler_wav(wav), bpm, fase)
                except Exception:  # noqa: BLE001 - música sem mapa continua valendo (corte na batida como antes)
                    ouvida = {}
            arm.gravar(chave, wav)
        item = {"id": ident, "tipo": tipo, "titulo": titulo.strip()[:80], "chave": chave, "dur": round(dur, 2), "ativo": True,
                "licenca": {**{k: licenca.get(k) for k in ("tipo", "fonte", "autor", "termos_url", "atribuicao")},
                            "uso_comercial": True, "registrado_em": _agora()}, "origem_url": origem_url}
        if tipo == "trilha":
            item.update(bpm=bpm or 120.0, bpm_medido=bpm is not None, fase=fase, clima=(clima or "").strip()[:40] or None)
            item.update({k: v for k, v in ouvida.items() if v})
        itens = [i for i in itens if i.get("id") != ident] + [item]
        _gravar(cfg, tipo, itens)
        return item


def retirar(cfg, tipo: str, ident: str) -> bool:
    with _TRAVA:
        itens = ler(cfg, tipo)
        achou = False
        for i in itens:
            if i.get("id") == ident:
                i["ativo"], i["retirado_em"], achou = False, _agora(), True
        if achou:
            _gravar(cfg, tipo, itens)
        return achou


def sfx_da_casa() -> list[dict]:
    """Efeitos da casa embutidos no kit (sempre disponíveis; um efeito registrado com o mesmo nome vence)."""
    from motor import config
    try:
        d = json.loads((config.KIT / "assets" / "sfx" / "sfx.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [dict(s, origem="kit") for s in d.get("sfx", []) if (config.KIT / "assets" / "sfx" / s.get("arquivo", "")).exists()]


def listar(cfg, arm=None) -> dict:
    def ficha(i):
        prob = problema_licenca(i.get("licenca"))
        return {**{k: i.get(k) for k in ("id", "tipo", "titulo", "dur", "bpm", "bpm_medido", "clima", "ativo", "licenca")},
                "pode_tocar": bool(i.get("ativo", True)) and prob is None and (arm is None or _audio_ok(arm, i)), "problema": prob}
    proprios = [ficha(i) for i in ler(cfg, "sfx")]
    ativos = {s["id"] for s in proprios if s.get("ativo", True)}
    casa = [dict({k: s.get(k) for k in ("id", "tipo", "titulo", "dur", "licenca")}, ativo=True, pode_tocar=s["id"] not in ativos, origem="kit",
                 problema=("substituído pelo efeito que você registrou" if s["id"] in ativos else None)) for s in sfx_da_casa()]
    return {"trilhas": [ficha(i) for i in ler(cfg, "trilha")], "sfx": proprios + casa,
            "tipos_licenca": TIPOS_LICENCA, "nomes_sfx": list(NOMES_SFX)}
