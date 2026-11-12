#!/usr/bin/env python3
"""Ingestão de um vídeo para a Creat Nuvem: ficha técnica, folha de quadros, ritmo de corte, áudio e transcrição.

Escrito pela casa (Forja, 12/11/2026) a partir do script usado no evento de 11/11/2026. Não acessa rede por
conta própria; o faster-whisper baixa o modelo do Hugging Face só se ele ainda não estiver no cache local.

    python3 -I ingerir.py <video> --saida <pasta fora do repositório> [--rotulo nome] [--quadros 8]
                          [--modelo small|medium] [--idioma pt] [--sem-transcricao] [--manter-wav]

Grava em <saida>: <rotulo>.json (ficha, cortes, segmentos da fala com tempo, texto), <rotulo>-quadros.jpg
(folha com N quadros espalhados pelo vídeo) e, com --manter-wav, <rotulo>.wav (16 kHz, mono).
Imprime um resumo curto. Sai com 0 se gravou a ficha, 2 se a entrada é inválida, 1 se o ffprobe falhou.

Depende de ffmpeg e ffprobe no PATH e, para transcrever, de faster-whisper e numpy instalados.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

CASA = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ROTULO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$")
MODELOS = ("tiny", "base", "small", "medium")


class ErroEntrada(Exception):
    pass


def rodar(args, tempo=600):
    """Roda um programa por lista de argumentos (nunca por shell)."""
    return subprocess.run(args, capture_output=True, text=True, timeout=tempo)


def ficha(video):
    r = rodar(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", video], 120)
    if r.returncode != 0:
        return None
    p = json.loads(r.stdout or "{}")
    v = next((s for s in p.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in p.get("streams", []) if s.get("codec_type") == "audio"), None)
    dur = float(p.get("format", {}).get("duration", 0) or 0)
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = sd["rotation"]
    fps = None
    if v.get("avg_frame_rate") and v["avg_frame_rate"] != "0/0":
        n, d = v["avg_frame_rate"].split("/")
        fps = round(float(n) / float(d), 2) if float(d) else None
    larg, alt = v.get("width"), v.get("height")
    if rot in (90, -90, 270, -270) and larg and alt:
        larg, alt = alt, larg
    formato = None
    if larg and alt:
        formato = "vertical" if alt > larg * 1.1 else ("horizontal" if larg > alt * 1.1 else "quadrado")
    return {"arquivo": os.path.basename(video), "bytes": os.path.getsize(video), "duracao_s": round(dur, 2),
            "largura": larg, "altura": alt, "formato": formato, "rotacao": rot, "fps": fps,
            "codec": v.get("codec_name"), "tem_audio": bool(a)}


def folha(video, dur, destino, n):
    tmp = tempfile.mkdtemp(prefix="quadros-")
    try:
        for i in range(n):
            t = dur * (i + 0.5) / n
            rodar(["ffmpeg", "-v", "error", "-y", "-ss", "%.2f" % t, "-i", video, "-frames:v", "1",
                   "-vf", "scale=-2:480", "-q:v", "4", os.path.join(tmp, "%02d.jpg" % i)], 120)
        feitos = sorted(f for f in os.listdir(tmp) if f.endswith(".jpg"))
        if not feitos:
            return None
        rodar(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", os.path.join(tmp, "%02d.jpg"),
               "-vf", "tile=%dx1:padding=4:color=white" % len(feitos), "-frames:v", "1", "-q:v", "4", destino], 120)
        return destino if os.path.exists(destino) else None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def cortes(video, limiar=0.3):
    """Momentos de troca de cena, para medir o ritmo da edição."""
    r = rodar(["ffmpeg", "-v", "info", "-i", video, "-an", "-vf", "select='gt(scene,%s)',showinfo" % limiar,
               "-f", "null", "-"], 900)
    return [round(float(m), 2) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr or "")]


def audio(video, wav):
    rodar(["ffmpeg", "-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav], 600)
    if not os.path.exists(wav):
        return None
    vol = rodar(["ffmpeg", "-v", "info", "-i", wav, "-af", "volumedetect", "-f", "null", "-"], 300).stderr or ""
    m = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", vol)
    return float(m.group(1)) if m else None


def transcrever(wav, modelo, idioma, fios):
    from faster_whisper import WhisperModel  # importado só aqui: a ficha funciona sem ele
    import wave
    import numpy as np
    m = WhisperModel(modelo, device="cpu", compute_type="int8", cpu_threads=fios)
    with wave.open(wav) as f:
        arr = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    segs, _ = m.transcribe(arr, language=idioma, vad_filter=True, beam_size=3, condition_on_previous_text=False)
    return [{"de": round(s.start, 2), "ate": round(s.end, 2), "texto": s.text.strip()} for s in segs]


def validar(args):
    if not os.path.isfile(args.video):
        raise ErroEntrada("vídeo não existe: %s" % args.video)
    saida = os.path.abspath(args.saida)
    if saida == CASA or saida.startswith(CASA + os.sep):
        raise ErroEntrada("--saida fica fora do repositório da casa (use o scratchpad da sessão)")
    rot = args.rotulo or os.path.splitext(os.path.basename(args.video))[0]
    rot = re.sub(r"[^A-Za-z0-9._-]", "-", rot)[:60].strip("-.") or "video"
    if not ROTULO.match(rot):
        raise ErroEntrada("rótulo inválido: use letras, números, ponto, hífen ou sublinhado")
    if not 1 <= args.quadros <= 16:
        raise ErroEntrada("--quadros vai de 1 a 16")
    if args.modelo not in MODELOS:
        raise ErroEntrada("--modelo é um de %s" % ", ".join(MODELOS))
    if not re.fullmatch(r"[a-z]{2}", args.idioma):
        raise ErroEntrada("--idioma é um código de duas letras, como pt ou en")
    for prog in ("ffmpeg", "ffprobe"):
        if not shutil.which(prog):
            raise ErroEntrada("%s não está instalado" % prog)
    os.makedirs(saida, exist_ok=True)
    return saida, rot


def main(argv=None):
    ap = argparse.ArgumentParser(description="Ingestão de vídeo da Creat Nuvem (ficha, quadros, cortes, transcrição).")
    ap.add_argument("video")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--rotulo")
    ap.add_argument("--quadros", type=int, default=8)
    ap.add_argument("--modelo", default="small")
    ap.add_argument("--idioma", default="pt")
    ap.add_argument("--fios", type=int, default=2)
    ap.add_argument("--sem-transcricao", action="store_true")
    ap.add_argument("--manter-wav", action="store_true")
    a = ap.parse_args(argv)
    try:
        saida, rot = validar(a)
    except ErroEntrada as e:
        print("erro: %s" % e, file=sys.stderr)
        return 2
    info = ficha(a.video)
    if info is None:
        print("erro: o ffprobe não leu o vídeo", file=sys.stderr)
        return 1
    info["rotulo"] = rot
    info["folha"] = folha(a.video, info["duracao_s"], os.path.join(saida, rot + "-quadros.jpg"), a.quadros)
    info["cortes_s"] = cortes(a.video)
    info["cortes_por_10s"] = round(len(info["cortes_s"]) * 10 / info["duracao_s"], 1) if info["duracao_s"] else None
    info.update({"texto": "", "segmentos": [], "fala_s": 0, "palavras_por_minuto": None})
    if info["tem_audio"]:
        wav = os.path.join(saida, rot + ".wav")
        info["volume_medio_db"] = audio(a.video, wav)
        if not a.sem_transcricao and os.path.exists(wav):
            try:
                info["segmentos"] = transcrever(wav, a.modelo, a.idioma, max(1, a.fios))
                info["texto"] = " ".join(s["texto"] for s in info["segmentos"])
                info["fala_s"] = round(sum(s["ate"] - s["de"] for s in info["segmentos"]), 1)
                palavras = len(info["texto"].split())
                info["palavras_por_minuto"] = round(palavras * 60 / info["fala_s"]) if info["fala_s"] else None
                info["modelo"] = "faster-whisper %s int8 (cpu), idioma %s" % (a.modelo, a.idioma)
            except Exception as e:  # sem o pacote ou sem o modelo: a ficha sai mesmo assim, com o motivo
                info["erro_transcricao"] = ("%s: %s" % (type(e).__name__, e))[:200]
        if not a.manter_wav and os.path.exists(wav):
            os.remove(wav)
    destino = os.path.join(saida, rot + ".json")
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(info, fh, ensure_ascii=False, indent=1)
    resumo = {k: info.get(k) for k in ("rotulo", "duracao_s", "formato", "cortes_por_10s", "fala_s", "palavras_por_minuto")}
    resumo["texto"] = info["texto"][:300]
    print(json.dumps(resumo, ensure_ascii=False))
    print("gravado %s" % destino)
    return 0


if __name__ == "__main__":
    sys.exit(main())
