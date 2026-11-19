"""Estudos de caso: o dono cola o link de um vídeo de referência (Reel do Instagram, TikTok, YouTube, Shorts, Drive/Dropbox
público) e o editor baixa, mede a edição e guarda o aprendizado na memória da casa (memoria/referencias/<id>.json).

Mede: duração, número de cortes e duração média do plano (ritmo), tempo até o 1º corte (gancho), quanto da tela tem texto
(amostra de quadros), volume e a fala transcrita. Guarda uma folha de contato. O diretor recebe o resumo das referências no prompt.
Nada de vídeo de terceiros vai para o git: o arquivo fica em <dados>/referencias/ e na memória só entram os números e o texto.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone

from motor import config

URL_OK = re.compile(r"^https://([a-z0-9-]+\.)*(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|dropbox\.com|drive\.google\.com|vimeo\.com)/", re.I)


def ident(url: str) -> str:
    return "ref_" + hashlib.sha256(url.strip().encode()).hexdigest()[:12]


def _pasta(cfg) -> pathlib.Path:
    d = pathlib.Path(cfg.dados) / "referencias"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _memoria() -> pathlib.Path:
    import os
    d = pathlib.Path(os.environ.get("EDITOR_MEMORIA") or config.MEMORIA) / "referencias"
    d.mkdir(parents=True, exist_ok=True)
    return d


def baixar(url: str, destino: pathlib.Path) -> dict:
    """yt-dlp sem login (só conteúdo público). Devolve título/autor; levanta RuntimeError com motivo legível."""
    import yt_dlp
    destino.mkdir(parents=True, exist_ok=True)
    opcoes = {"outtmpl": str(destino / "video.%(ext)s"), "format": "mp4/bv*+ba/b", "merge_output_format": "mp4",
              "quiet": True, "no_warnings": True, "noplaylist": True, "max_filesize": 600 * 1024 * 1024}
    try:
        with yt_dlp.YoutubeDL(opcoes) as y:
            info = y.extract_info(url, download=True)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "login" in msg.lower() or "rate" in msg.lower() or "private" in msg.lower():
            raise RuntimeError("a rede pediu login para esse vídeo (privado ou bloqueado para robôs). Baixe pelo celular e mande o arquivo, ou use um link público.") from e
        raise RuntimeError(f"não deu para baixar: {msg[:200]}") from e
    arq = next(iter(sorted(destino.glob("video.*"))), None)
    if not arq:
        raise RuntimeError("o download terminou sem arquivo de vídeo")
    return {"arquivo": arq, "titulo": (info or {}).get("title"), "autor": (info or {}).get("uploader"), "duracao": (info or {}).get("duration")}


def _ffprobe_dur(arq: pathlib.Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(arq)], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def cortes(arq: pathlib.Path, limiar: float = 0.32) -> list[float]:
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "info", "-i", str(arq), "-filter:v", f"select='gt(scene,{limiar})',showinfo", "-an", "-f", "null", "-"],
                       capture_output=True, text=True)
    return [round(float(t), 2) for t in re.findall(r"pts_time:([0-9.]+)", r.stderr)]


def folha(arq: pathlib.Path, saida: pathlib.Path, dur: float) -> None:
    passo = max(dur / 16, 0.5)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(arq), "-vf", f"fps=1/{passo:.3f},scale=180:-2,tile=8x2", "-frames:v", "1", str(saida)],
                   capture_output=True)


def transcrever(arq: pathlib.Path, pasta: pathlib.Path, cfg) -> str:
    wav = pasta / "audio.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(arq), "-ac", "1", "-ar", "16000", str(wav)], capture_output=True)
    if not wav.exists() or wav.stat().st_size < 2000:
        return ""
    try:
        from motor.provedores import provedor
        tr = provedor("transcricao", cfg).transcrever(wav, idioma="pt", palavras=False)
        return " ".join(s["texto"].strip() for s in tr.get("segmentos", []))[:3000]
    except Exception:  # noqa: BLE001 - sem transcrição a referência ainda vale pelo ritmo
        return ""


def analisar(url: str, *, nota: str | None = None, cfg=None) -> dict:
    cfg = cfg or config.carregar()
    if not URL_OK.match(url.strip()):
        raise ValueError("link não reconhecido: use um link público do Instagram, TikTok, YouTube, Vimeo, Drive ou Dropbox")
    rid = ident(url)
    pasta = _pasta(cfg) / rid
    b = baixar(url.strip(), pasta)
    dur = _ffprobe_dur(b["arquivo"]) or float(b.get("duracao") or 0)
    cs = [c for c in cortes(b["arquivo"]) if 0.2 < c < dur - 0.2]
    planos = len(cs) + 1
    folha(b["arquivo"], pasta / "folha.jpg", dur)
    fala = transcrever(b["arquivo"], pasta, cfg)
    ref = {"id": rid, "url": url.strip(), "titulo": b.get("titulo"), "autor": b.get("autor"), "nota_dono": nota,
           "duracao_s": round(dur, 2), "planos": planos, "plano_medio_s": round(dur / planos, 2) if planos else None,
           "primeiro_corte_s": cs[0] if cs else None, "cortes_por_10s": round(len(cs) / dur * 10, 2) if dur else None,
           "fala": fala, "lido_em": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    ref["licao"] = licao(ref)
    (_memoria() / f"{rid}.json").write_text(json.dumps(ref, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return ref


def licao(r: dict) -> str:
    """Resumo objetivo que o diretor lê: ritmo e gancho medidos (sem opinião inventada)."""
    partes = [f"{r['duracao_s']:.0f} s, {r['planos']} planos (plano médio {r['plano_medio_s']} s)"]
    if r.get("primeiro_corte_s") is not None:
        partes.append(f"1º corte em {r['primeiro_corte_s']} s")
    if r.get("fala"):
        partes.append("abre com: «" + r["fala"][:90] + "»")
    if r.get("nota_dono"):
        partes.append("o dono quer: " + r["nota_dono"][:160])
    return "; ".join(partes)


def listar() -> list[dict]:
    out = []
    for p in sorted(_memoria().glob("ref_*.json")):
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except ValueError:
            continue
    return sorted(out, key=lambda r: r.get("lido_em", ""), reverse=True)


def para_prompt(n: int = 5) -> str:
    return "\n".join(f"- referência {r['id']} ({r.get('autor') or 'autor ?'}): {r['licao']}" for r in listar()[:n])
