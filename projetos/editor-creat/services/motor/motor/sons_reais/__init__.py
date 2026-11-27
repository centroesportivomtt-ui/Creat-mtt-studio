"""Banco de SONS REAIS ligado ao editor (peça M6, "Filme guiado por música e emoção").

Palavras do dono: "não quero som de effects criado, quero real… água, pisada no chão, folha, abertura da mala do carro";
"cada cena interaja com a outra… junto com a música"; áudio natural, sem fundo estranho.

O banco são 7.546 gravações reais dos pacotes Sonniss #GameAudioGDC espelhados no archive.org
(`kit-edicao-17-11/sfx-banco`). O repositório guarda só o ÍNDICE (indice.jsonl.gz, metadados); o áudio é baixado um por
vez, e por trecho, quando a direção pede um som.

API:
- `buscar(texto, cfg)`: consulta livre no índice (pt ou inglês), para inspeção;
- `escolher(con, pedido, papel=, necessario_s=, excluir=, com_voz=)`: candidatos determinísticos (o 1º + 2 reservas);
- `preparar(edl, cfg)`: ANTES do render, baixa o que falta para `edl.sons_reais` (cache, MD5/cabeçalho, triagem de voz pelo
  transcritor LOCAL), e devolve o relatório (o que entrou, o que faltou e por quê, quantos ficaram pendentes por rede);
- `carregar(edl, cfg)`: DURANTE o render, só lê do cache (nunca usa a rede);
- `LICENCA`: o que a licença permite e proíbe (vai para montagem.json e entrega.json).

Falha de rede, de busca ou de download nunca derruba a montagem: vira aviso e o filme sai sem aquele som. Nunca entra som
sintetizado no lugar de um som real. O áudio bruto vive só em `<dados>/cache/sons_reais` (fora do armazenamento: não é
servido por nenhuma rota e não entra no backup) e nunca é registrado na biblioteca da casa.
"""
from __future__ import annotations

import hashlib
import importlib
import json
import os
import pathlib
import re
import time

import numpy as np

from motor.sons_reais import baixar as BX
from motor.sons_reais import indice as IX
from motor.sons_reais.indice import IndiceIndisponivel, pasta_cache

LICENCA = {
    "nome": "Sonniss #GameAudioGDC Bundle",
    "uso": "comercial, sem royalties, sem crédito, dentro da obra",
    "proibido": "revender ou redistribuir sons soltos/como biblioteca; treinar IA",
    "fonte": "espelho archive.org",
    "texto": "kit-edicao-17-11/sfx/LICENCAS.md",
}
MAX_SONS = 8                       # por filme
PONTUAL_FLAC_MAX = 6_000_000       # FLAC inteiro só até 6 MB
PONTUAL_WAV_MAX = 12_000_000       # sem FLAC pequeno: o WAV inteiro (com MD5) até 12 MB; acima, trecho WAV de até 8 s
PONTUAL_MAX_S = 8.0
AMBIENTE_MAX_S = 60.0              # o que passar disso vira laço na mixagem
PALAVRAS_VOZ = 3                   # a mesma régua do tom_sala_sem_voz
NIVEL_MIN_DB = -60.0               # ambiente baixado mais baixo que isto (RMS) é quase mudo: subir viraria chiado
PICO_MIN_DB = -50.0                # pontual com pico abaixo disto não tem pancada nenhuma
PROTEGE_S = 3600.0                 # o cache não apaga som usado (nem .tmp criado) há menos de 1 h: pode ser de um filme rodando
SR = 48000
# nomes que entregam voz, gente ou som desenhado (o dono pediu gravação REAL e sem fundo estranho)
_RE_PROIBIDO = re.compile(r"\b(voices?|crowds?|walla|people|kids?|children|talk\w*|conversations?|(super)?markets?|restaurants?|"
                          r"designed|sci-?fi|magic\w*|synth\w*)\b", re.I)
_RE_ESTEREO = re.compile(r"\b(stereo|st|ortf|xy|ab|a-b|ms|m-s|binaural|wide)\b", re.I)
_RE_MONO = re.compile(r"\bmono\b", re.I)


# ---------------------------------------------------------------- configuração (Config real ou SimpleNamespace de teste)
def _cfg(cfg, nome: str, env: str, padrao: str) -> str:
    v = getattr(cfg, nome, None) if cfg is not None else None
    return str(v if v is not None else os.environ.get(env, padrao)).strip()


def ligado(cfg) -> bool:
    return _cfg(cfg, "sons_reais", "EDITOR_SONS_REAIS", "1").lower() not in ("0", "false", "nao", "não", "off", "")


def _num(v: str, padrao: float) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return padrao
    return x if x > 0 else padrao


def teto_mb(cfg) -> float:
    return _num(_cfg(cfg, "sons_reais_mb", "EDITOR_SONS_REAIS_MB", "150"), 150.0)


def cache_mb(cfg) -> float:
    return _num(_cfg(cfg, "cache_sons_mb", "EDITOR_CACHE_SONS_MB", "2000"), 2000.0)


# ---------------------------------------------------------------- busca e escolha
def buscar(texto: str, cfg=None, *, limite: int = 20) -> list[dict]:
    con = IX.abrir(cfg)
    try:
        return IX.buscar(con, texto, limite=limite)
    finally:
        con.close()


def proibido(r: dict) -> bool:
    return bool(_RE_PROIBIDO.search(f"{r.get('nome') or ''} {r.get('biblioteca') or ''}"))


def _pontuar(r: dict, papel: str, necessario_s: float) -> float:
    """bm25 (menor = melhor) + ajustes de qualidade. Determinístico."""
    p = float(r.get("pontos") or 0.0)
    nome = f"{r.get('nome') or ''}"
    estereo = r.get("canais") == "estereo" or bool(_RE_ESTEREO.search(nome))
    mono = r.get("canais") == "mono" or bool(_RE_MONO.search(nome))
    dur = float(r.get("dur_s") or 0.0)
    if papel == "ambiente":
        p += -1.5 if estereo else (1.5 if mono else 0.0)
        if dur >= necessario_s:
            p -= 1.0
        if "loop" in nome.lower() and dur < necessario_s + 6:
            p += 1.0
    else:
        p += -0.5 if estereo else 0.0
        if r.get("url_flac") and r.get("md5_flac") and (r.get("tam_flac") or 1e12) <= PONTUAL_FLAC_MAX:
            p -= 0.3                                         # arquivo inteiro conferido por MD5
    if r.get("modo") == "or":
        p += 4.0                                             # resultado parcial (não tem todos os termos): só se faltar
    return round(p, 6)


def escolher(con, pedido: dict, *, papel: str, necessario_s: float, excluir: set | None = None, com_voz: set | None = None,
             n: int = 3) -> list[dict]:
    """Os `n` melhores sons para o pedido (o 1º + reservas), sem repetir id e sem nenhum da lista negra de voz.

    Filtros: principal=1, risco_voz=0, sem surround/ambisônico, nome sem voz/gente/som desenhado; ambiente com WAV (o trecho
    sai por pedido parcial) e duração >= min(necessário + 6, 20) s; pontual de 0,3 a 20 s. Busca primeiro pelo `busca`
    (inglês, vocabulário das bibliotecas), depois pela `desc` (dicionário pt)."""
    excluir, com_voz = set(excluir or ()), set(com_voz or ())
    filtros = ["s.risco_voz=0", "COALESCE(s.canais,'') NOT IN ('surround','ambisonico')", "s.dur_s IS NOT NULL"]
    params: list = []
    if papel == "ambiente":
        filtros += ["COALESCE(s.url_wav,'')<>''", "s.dur_s>=?"]
        params.append(min(float(necessario_s) + 6.0, 20.0))
    else:
        filtros += ["s.dur_s>=?", "s.dur_s<=?", "(COALESCE(s.url_wav,'')<>'' OR COALESCE(s.url_flac,'')<>'')"]
        params += [0.3, 20.0]
    vistos, cands = set(), []
    for texto in (pedido.get("busca"), pedido.get("desc")):
        if not texto:
            continue
        for r in IX.buscar(con, texto, filtros=filtros, params=params, limite=120):
            if r["id"] in vistos or r["id"] in excluir or r["id"] in com_voz or proibido(r):
                continue
            vistos.add(r["id"])
            cands.append((_pontuar(r, papel, necessario_s), r["id"], r))
        if len(cands) >= n:
            break
    cands.sort(key=lambda x: (x[0], x[1]))
    return [r for _, _, r in cands[:n]]


def candidato(r: dict, papel: str, necessario_s: float) -> dict:
    """Linha do índice -> o que o download precisa (formato, trecho, md5 do arquivo inteiro, tamanho)."""
    dur = float(r.get("dur_s") or 0.0)
    if papel == "pontual":
        if r.get("url_flac") and r.get("md5_flac") and r.get("tam_flac") and int(r["tam_flac"]) <= PONTUAL_FLAC_MAX:
            return {"id_banco": int(r["id"]), "url": r["url_flac"], "formato": "flac", "md5": r["md5_flac"], "trecho": None,
                    "tam": int(r["tam_flac"])}
        if r.get("url_wav") and r.get("md5_wav") and r.get("tam_wav") and int(r["tam_wav"]) <= PONTUAL_WAV_MAX:
            # inteiro: a pancada pode estar depois dos 8 s, e o arquivo inteiro sai conferido pelo MD5
            return {"id_banco": int(r["id"]), "url": r["url_wav"], "formato": "wav", "md5": r["md5_wav"], "trecho": None,
                    "tam": int(r["tam_wav"])}
        d = round(min(dur, PONTUAL_MAX_S), 3)
        return {"id_banco": int(r["id"]), "url": r["url_wav"], "formato": "wav", "md5": r.get("md5_wav") or None, "trecho": [0.0, d],
                "tam": int(r["tam_wav"]) if r.get("tam_wav") else None}
    d = min(float(necessario_s), AMBIENTE_MAX_S, max(0.5, dur - 0.1))
    ini = 0.25 * dur
    if ini + d > dur - 0.05:
        ini = max(0.0, dur - d - 0.05)
    return {"id_banco": int(r["id"]), "url": r["url_wav"], "formato": "wav", "md5": r.get("md5_wav") or None,
            "trecho": [round(ini, 3), round(d, 3)], "tam": int(r["tam_wav"]) if r.get("tam_wav") else None}


# ---------------------------------------------------------------- cache
def chave_cache(c: dict) -> str:
    ini, dur = (c.get("trecho") or [None, None])
    base = f"{c['id_banco']}|{c.get('md5') or ''}|{'' if ini is None else f'{float(ini):.3f}'}|{'' if dur is None else f'{float(dur):.3f}'}|{c['formato']}"
    return f"{int(c['id_banco'])}_{hashlib.sha1(base.encode()).hexdigest()[:12]}"


def _sha256(p: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def _gravar_json(p: pathlib.Path, obj) -> None:
    tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def ler_cache(cache: pathlib.Path, c: dict) -> tuple[pathlib.Path, dict] | None:
    """(flac, sidecar) se o arquivo existe e o sha256 do sidecar bate; adulterado ou incompleto = apagado (baixa de novo)."""
    base = cache / chave_cache(c)
    arq, meta_p = base.with_suffix(".flac"), base.with_suffix(".json")
    if not arq.exists() or not meta_p.exists():
        return None
    try:
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        if meta.get("sha256_local") == _sha256(arq) and int(meta.get("id_banco", -1)) == int(c["id_banco"]):
            return arq, meta
    except (OSError, ValueError):
        pass
    arq.unlink(missing_ok=True)
    meta_p.unlink(missing_ok=True)
    return None


def nivel_db(x: np.ndarray) -> tuple[float, float]:
    """(RMS, pico) em dBFS."""
    x = np.asarray(x, np.float64)
    if x.size == 0:
        return -200.0, -200.0
    return (float(20 * np.log10(max(float(np.sqrt(np.mean(x ** 2))), 1e-10))),
            float(20 * np.log10(max(float(np.abs(x).max()), 1e-10))))


def guardar(cache: pathlib.Path, c: dict, dados: bytes, info: dict, papel: str | None = None) -> tuple[pathlib.Path, dict]:
    """Bytes conferidos -> FLAC 48 kHz no cache + sidecar. Mais de 2 canais é recusado (não serve direto para estéreo), e o
    som quase mudo também (ambiente < -60 dBFS RMS, pontual com pico < -50 dBFS): a reserva entra no lugar."""
    import soundfile as sf
    try:
        x, taxa, bits = BX.decodificar(dados)
    except Exception as e:  # noqa: BLE001 - arquivo que o soundfile não lê não entra
        raise BX.Indisponivel(f"o áudio baixado não abriu ({type(e).__name__})") from None
    if x.shape[1] > 2:
        raise BX.Indisponivel(f"o som tem {x.shape[1]} canais (surround/ambisônico): não entra no estéreo", pendente=False)
    if len(x) < int(0.05 * taxa):
        raise BX.Indisponivel("o áudio baixado está vazio", pendente=False)
    rms, pico = nivel_db(x)
    if papel == "ambiente" and rms < NIVEL_MIN_DB:
        raise BX.Indisponivel(f"o trecho baixado está quase mudo ({rms:.0f} dBFS): subir o nível viraria chiado", pendente=False)
    if papel == "pontual" and pico < PICO_MIN_DB:
        raise BX.Indisponivel(f"o som baixado não tem pancada (pico {pico:.0f} dBFS)", pendente=False)
    canais = int(x.shape[1])
    if taxa != SR:
        from math import gcd
        from scipy.signal import resample_poly
        g = gcd(int(taxa), SR)
        x = resample_poly(x, SR // g, int(taxa) // g, axis=0).astype(np.float32)
    base = cache / chave_cache(c)
    arq, meta_p = base.with_suffix(".flac"), base.with_suffix(".json")
    tmp = cache / f".{base.name}.{os.getpid()}.flac.tmp"
    sf.write(str(tmp), np.clip(x, -1.0, 1.0), SR, subtype="PCM_24", format="FLAC")
    os.replace(tmp, arq)
    meta = {"id_banco": int(c["id_banco"]), "md5_fonte": c.get("md5"), "formato": c["formato"], "trecho": c.get("trecho"),
            "sha256_local": _sha256(arq), "canais": canais, "taxa": int(taxa), "bits": bits or info.get("bits"),
            "verificacao": info.get("verificacao"), "md5": c.get("md5") if info.get("verificacao") == "md5" else None,
            "duracao_s": round(len(x) / SR, 3), "voz": {"palavras": None, "verificado": False}, "baixado_em": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    _gravar_json(meta_p, meta)
    return arq, meta


def limpar_cache(cache: pathlib.Path, limite_mb: float, *, protege_s: float = PROTEGE_S, agora: float | None = None) -> int:
    """Apaga os sons mais antigos (por uso) até o cache caber no limite (o índice sqlite nunca sai). Som usado há menos de
    `protege_s` fica (pode ser de um filme que ainda vai mixar). Também varre o lixo de processo que morreu: `.tmp` e os
    WAV da triagem de voz em `tmp/` com mais de `protege_s`. Devolve os bytes apagados."""
    if not cache.exists():
        return 0
    agora = time.time() if agora is None else agora
    apagado = 0

    def idade(p: pathlib.Path) -> float:
        try:
            return agora - p.stat().st_mtime
        except OSError:
            return 0.0
    for p in sorted(set(cache.glob(".*.tmp")) | set(cache.glob("*.tmp")) | set((cache / "tmp").glob("_voz_*"))):
        if idade(p) > protege_s:
            try:
                apagado += p.stat().st_size
                p.unlink()
            except OSError:
                pass
    arqs = []
    for p in cache.glob("*.flac"):
        try:
            arqs.append((p.stat().st_mtime, p.stat().st_size, p))
        except OSError:
            continue
    arqs.sort(key=lambda x: (x[0], x[2].name))
    total = sum(a[1] for a in arqs)
    for mt, tam, p in arqs:
        if total <= limite_mb * 1e6:
            break
        if agora - mt <= protege_s:
            break                                   # daqui em diante só som recente: o cache passa do teto até a próxima
        p.unlink(missing_ok=True)
        p.with_suffix(".json").unlink(missing_ok=True)
        total -= tam
        apagado += tam
    return apagado


def ler_com_voz(cache: pathlib.Path) -> set[int]:
    try:
        return {int(x) for x in json.loads((cache / "com_voz.json").read_text(encoding="utf-8")).get("ids", [])}
    except (OSError, ValueError, AttributeError):
        return set()


def marcar_com_voz(cache: pathlib.Path, ids) -> None:
    """Lista negra persistente: som com voz nunca mais é escolhido (preparação, QA e a correção automática da direção)."""
    cache.mkdir(parents=True, exist_ok=True)
    atual = ler_com_voz(cache) | {int(i) for i in ids}
    _gravar_json(cache / "com_voz.json", {"ids": sorted(atual)})


# ---------------------------------------------------------------- voz escondida
def transcritor_local(cfg):
    """O transcritor LOCAL (faster-whisper ou parakeet), nunca o pago: a gravação do banco não vai para terceiros."""
    try:
        from motor.provedores import MAPA
        nome = str(getattr(cfg, "transcricao", "") or "faster-whisper")
        if nome not in ("faster-whisper", "parakeet"):
            nome = "faster-whisper"
        mod, cls = MAPA["transcricao"][nome].split(":")
        return getattr(importlib.import_module(mod), cls)(cfg)
    except Exception:  # noqa: BLE001 - sem transcritor local: o som não entra ("voz não conferida")
        return None


CONF_PREPARO, CONF_QA = 0.4, 0.6     # o QA ouve o stem inteiro subido a -20 LUFS: exige mais certeza para não condenar à toa


def contar_palavras(tr: dict | None, conf_min: float = CONF_PREPARO) -> list[str]:
    if not tr:
        return []
    try:
        from motor.provedores.transcricao_fw import eh_fantasma, normalizar
    except Exception:  # noqa: BLE001
        eh_fantasma, normalizar = (lambda _t: False), (lambda t: str(t).lower().strip())
    out = []
    for s in tr.get("segmentos") or []:
        if eh_fantasma(s.get("texto", "")):
            continue
        for w in s.get("palavras") or []:
            c = w[3] if len(w) > 3 and w[3] is not None else 1.0
            n = normalizar(str(w[2]))
            if n and c >= conf_min:
                out.append(n)
    return out


def ouvir_voz(arq: pathlib.Path, transcritor, tmp: pathlib.Path, conf_min: float = CONF_PREPARO) -> dict:
    """Transcreve o som com o nível normalizado (-20 LUFS, como o QA do tom de sala). {palavras, texto, verificado}."""
    import soundfile as sf
    if transcritor is None:
        return {"palavras": None, "texto": "", "verificado": False, "motivo": "sem transcritor local"}
    x, sr = sf.read(str(arq), dtype="float32", always_2d=True)
    x = x.mean(1)
    if float(np.abs(x).max()) < 1e-7:
        return {"palavras": 0, "texto": "", "verificado": True}
    try:
        import pyloudnorm as pyln
        lf = pyln.Meter(sr).integrated_loudness(x.astype(np.float64)) if len(x) > int(0.45 * sr) else float("-inf")
        g = 10 ** ((-20 - lf) / 20) if np.isfinite(lf) else 0.1 / (np.sqrt(np.mean(x ** 2)) + 1e-9)
    except Exception:  # noqa: BLE001
        g = 0.1 / (np.sqrt(np.mean(x ** 2)) + 1e-9)
    tmp.mkdir(parents=True, exist_ok=True)
    alvo = tmp / f"_voz_{arq.stem}_{os.getpid()}.wav"
    sf.write(str(alvo), np.clip(x * g, -1, 1), sr, subtype="PCM_16")
    try:
        r = transcritor.transcrever(alvo, idioma="pt", palavras=True)
    except BaseException as e:  # noqa: BLE001 - MemoryError incluso; interrupção do processo sobe
        if isinstance(e, (KeyboardInterrupt, SystemExit)):
            raise
        return {"palavras": None, "texto": "", "verificado": False, "motivo": f"a transcrição quebrou ({type(e).__name__})"}
    finally:
        alvo.unlink(missing_ok=True)
    pal = contar_palavras(r, conf_min)
    return {"palavras": len(pal), "texto": " ".join(pal)[:160], "verificado": True}


# ---------------------------------------------------------------- preparar (rede) e carregar (só cache)
def _candidatos(it: dict) -> list[dict]:
    principal = {k: it.get(k) for k in ("id_banco", "url", "formato", "md5", "trecho", "tam")}
    return [principal] + [dict(r) for r in it.get("reservas") or []]


def conferir_no_indice(con, c: dict, papel: str) -> str | None:
    """O candidato do EDL bate com o ÍNDICE (url, md5 e tamanho daquele formato; trecho dentro do arquivo)? None = bate;
    senão o motivo. O download confia no índice, nunca no que está escrito no edl.json."""
    r = IX.info(con, c["id_banco"])
    if not r or int(r.get("principal") or 0) != 1:
        return "não está no índice"
    fmt = c.get("formato")
    if fmt not in ("wav", "flac"):
        return "formato desconhecido"
    if (c.get("url") or "") != (r.get(f"url_{fmt}") or "") or not c.get("url"):
        return "a URL não é a do índice"
    if (c.get("md5") or None) != (r.get(f"md5_{fmt}") or None):
        return "o MD5 não é o do índice"
    tam = r.get(f"tam_{fmt}")
    if c.get("tam") is not None and (tam is None or int(c["tam"]) != int(tam)):
        return "o tamanho não é o do índice"
    tr = c.get("trecho")
    if tr is not None:
        dur = float(r.get("dur_s") or 0.0)
        teto = AMBIENTE_MAX_S if papel == "ambiente" else PONTUAL_MAX_S
        ini, d = float(tr[0]), float(tr[1])
        if fmt != "wav" or ini < 0 or d <= 0 or d > teto + 1e-6 or ini + d > dur + 0.5:
            return "trecho fora do arquivo"
    return None


def _resumo(it: dict, c: dict, k: int, origem: str, meta: dict, info: dict | None) -> dict:
    out = {"id": it["id"], "desc": it["desc"], "papel": it["papel"], "t0": it["t0"], "t1": it["t1"], "id_banco": c["id_banco"],
           "candidato": k, "origem": origem, "verificacao": meta.get("verificacao"), "voz": meta.get("voz"),
           "canais": meta.get("canais"), "url": c.get("url"), "trecho": c.get("trecho")}
    for campo in ("item", "pacote", "biblioteca", "nome"):
        out[campo] = (info or {}).get(campo) if k > 0 else it.get(campo)
    return out


def preparar(edl: dict, cfg, *, transcritor=None, sessao: BX.Sessao | None = None) -> dict:
    """Baixa (um por vez) e confere os sons de `edl.sons_reais` ANTES do render. Nunca levanta por rede.

    Devolve {itens: [o que entrou], faltaram: [{id, desc, motivo, pendente}], pendentes, pedidos_http, bytes, avisos, licenca}.
    `pendentes` = sons que faltaram por motivo passageiro (rede, tempo, recuo, md5, bloqueio): com > 0 a montagem não é
    reaproveitada e a próxima tenta de novo. Depois de um bloqueio (403 ou prazo valendo) o que já está no cache continua
    entrando; só o download para."""
    itens = list(edl.get("sons_reais") or [])
    rel = {"itens": [], "faltaram": [], "pendentes": 0, "pedidos_http": 0, "bytes": 0, "avisos": [], "licenca": dict(LICENCA)}
    if not itens:
        return rel
    if not ligado(cfg):
        rel["faltaram"] = [{"id": it["id"], "desc": it["desc"], "motivo": "sons reais desligados (EDITOR_SONS_REAIS=0)", "pendente": False}
                           for it in itens]
        rel["avisos"].append("sons reais desligados neste motor: o filme sai sem eles")
        return rel
    cache = pasta_cache(cfg)
    cache.mkdir(parents=True, exist_ok=True)
    s = sessao or BX.Sessao(cache, teto_bytes=int(teto_mb(cfg) * 1e6))
    com_voz = ler_com_voz(cache)
    novos_com_voz: set[int] = set()
    estado = {"tr": transcritor, "tentou": transcritor is not None}

    def tr():
        if not estado["tentou"]:
            estado["tentou"] = True
            estado["tr"] = transcritor_local(cfg)
        return estado["tr"]

    con = None
    try:
        con = IX.abrir(cfg)
    except IndiceIndisponivel as e:
        con = None                                  # sem índice para conferir o EDL: só entra o que já está no cache
        rel["avisos"].append(f"índice de sons reais indisponível ({str(e)[:120]}): só entra o que já está no cache")
    bloqueio: str | None = None
    for n_it, it in enumerate(itens):
        if n_it >= MAX_SONS:
            rel["faltaram"].append({"id": it["id"], "desc": it["desc"], "motivo": f"mais de {MAX_SONS} sons no filme", "pendente": False})
            continue
        motivos, pendente, entrou = [], False, None
        for k, c in enumerate(_candidatos(it)):
            if c["id_banco"] in com_voz or c["id_banco"] in novos_com_voz:
                motivos.append(f"#{c['id_banco']}: tem voz (lista negra)")
                continue
            hit = ler_cache(cache, c)
            origem = "cache"
            if hit is None:
                if bloqueio:                        # bloqueado: só o cache vale, nada de pedido novo
                    motivos.append(f"#{c['id_banco']}: {bloqueio}")
                    pendente = True
                    continue
                if con is None:
                    motivos.append(f"#{c['id_banco']}: sem índice para conferir o pedido: não baixei")
                    pendente = True
                    continue
                ruim = conferir_no_indice(con, c, it["papel"])
                if ruim:
                    motivos.append(f"#{c['id_banco']}: {ruim}: não baixei")
                    continue
                if tr() is None:
                    motivos.append(f"#{c['id_banco']}: voz não conferida (sem transcritor local): não baixei")
                    continue
                try:
                    with s.trava():
                        if c.get("trecho") is None:
                            dados, info = BX.arquivo_inteiro(s, c["url"], c.get("md5"), c.get("tam"))
                        else:
                            if c["formato"] != "wav":
                                raise BX.Indisponivel("trecho só existe em WAV", pendente=False)
                            dados, info = BX.trecho_wav(s, c["url"], float(c["trecho"][0]), float(c["trecho"][1]), c.get("tam"))
                    hit = guardar(cache, c, dados, info, it["papel"])
                    origem = "baixado"
                except BX.Bloqueado as e:
                    bloqueio = e.motivo
                    motivos.append(f"#{c['id_banco']}: {e.motivo}")
                    pendente = True
                    continue
                except BX.Indisponivel as e:
                    motivos.append(f"#{c['id_banco']}: {e.motivo}")
                    pendente = pendente or e.pendente
                    continue
                except Exception as e:  # noqa: BLE001 - nada de rede derruba a montagem
                    motivos.append(f"#{c['id_banco']}: falha inesperada ({type(e).__name__}: {str(e)[:80]})")
                    pendente = True
                    continue
            arq, meta = hit
            voz = meta.get("voz") or {}
            if not voz.get("verificado"):
                voz = ouvir_voz(arq, tr(), cache / "tmp")
                if voz.get("verificado"):
                    meta["voz"] = {"palavras": voz["palavras"], "verificado": True, "texto": voz.get("texto", "")}
                    _gravar_json(arq.with_suffix(".json"), meta)
            if not voz.get("verificado"):
                motivos.append(f"#{c['id_banco']}: voz não conferida ({voz.get('motivo') or 'sem transcritor'})")
                continue
            if int(voz.get("palavras") or 0) >= PALAVRAS_VOZ:
                novos_com_voz.add(c["id_banco"])
                motivos.append(f"#{c['id_banco']}: tem voz ({voz['palavras']} palavras: «{str(voz.get('texto', ''))[:60]}»)")
                continue
            os.utime(arq)                               # cache por uso: o mais usado fica
            info_banco = IX.info(con, c["id_banco"]) if (con is not None and k > 0) else None
            entrou = _resumo(it, c, k, origem, meta, info_banco)
            break
        if entrou:
            rel["itens"].append(entrou)
            if entrou["candidato"] > 0:
                rel["avisos"].append(f"som real {it['id']} ({it['desc']}): entrou a reserva {entrou['candidato']} (#{entrou['id_banco']})")
        else:
            motivo = "; ".join(motivos) or "sem candidato"
            rel["faltaram"].append({"id": it["id"], "desc": it["desc"], "motivo": motivo[:400], "pendente": pendente})
            rel["avisos"].append(f"som real {it['id']} ({it['desc']}) ficou de fora: {motivo[:200]}")
    if con is not None:
        con.close()
    if novos_com_voz:
        marcar_com_voz(cache, novos_com_voz)
    rel["pendentes"] = sum(1 for f in rel["faltaram"] if f.get("pendente"))
    rel["pedidos_http"], rel["bytes"] = s.pedidos, s.bytes
    try:
        limpar_cache(cache, cache_mb(cfg))
    except OSError:
        pass
    return rel


def carregar(edl: dict, cfg) -> list[dict]:
    """Os sons de `edl.sons_reais` que estão no CACHE, conferidos (sha256 e voz). Nunca usa a rede.

    Para cada item, o 1º candidato válido na ordem (principal, reservas): o mesmo que `preparar` escolheu.
    Devolve [{item, candidato, id_banco, audio (n, 2) float32 48 kHz, canais}]."""
    import soundfile as sf
    itens = list(edl.get("sons_reais") or [])
    if not itens or not ligado(cfg):
        return []
    cache = pasta_cache(cfg)
    com_voz = ler_com_voz(cache)
    out = []
    for it in itens[:MAX_SONS]:
        for k, c in enumerate(_candidatos(it)):
            if c["id_banco"] in com_voz:
                continue
            hit = ler_cache(cache, c)
            if hit is None:
                continue
            arq, meta = hit
            voz = meta.get("voz") or {}
            if not voz.get("verificado") or int(voz.get("palavras") or 0) >= PALAVRAS_VOZ:
                continue
            try:
                x, sr = sf.read(str(arq), dtype="float32", always_2d=True)
            except Exception:  # noqa: BLE001 - arquivo ilegível no cache: o filme sai sem ele
                continue
            if sr != SR or x.shape[1] > 2 or len(x) == 0:
                continue
            canais = int(meta.get("canais") or x.shape[1])
            x = np.repeat(x[:, :1], 2, axis=1) if x.shape[1] == 1 else x
            out.append({"item": it, "candidato": k, "id_banco": c["id_banco"], "audio": x.astype(np.float32), "canais": canais})
            break
    return out


__all__ = ["LICENCA", "buscar", "escolher", "candidato", "preparar", "carregar", "ligado", "pasta_cache", "IndiceIndisponivel"]
