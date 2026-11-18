"""Converte o material de 17/11 (drako/cat.json + drako/trs/*.json + drako/seg/indice.json) em análises válidas
(analise.schema.json), no mesmo lugar onde a frente A grava as dela: <dados>/armazenamento/derivados/<p>/<a>/analise.json.

Serve de fixture real da frente B (catálogo, direção, resolvedor) sem depender da leitura automática.
Nada do material vai para o git: tudo é lido do scratchpad e gravado em EDITOR_DADOS.

uso:  python -m motor.ferramentas.cat_legado [--origem DIR] [--projeto p_drako17] [--sem-energia]
Idempotente: energia (.npy) já calculada não é recalculada.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import time

import numpy as np

ORIGEM_PADRAO = pathlib.Path("/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/drako")
PASSO_ENERGIA = 0.02
# quem fala em cada tipo de momento do catálogo antigo (a transcrição de 17/11 não tem falante)
FALANTE_POR_TIPO = {"fala_marcos": "MARCOS", "fala_ruan": "RUAN"}
# clipes sem entrada no cat.json: o GUIA de 17/11 diz que 'sala' é o Marcos na sala dele
FALANTE_DO_CLIPE = {"sala": "MARCOS"}
AMBIENTES = [("mesa", ("mesa", "notebook")), ("corredor", ("corredor",)), ("palco", ("palco", "painel", "balões")),
             ("salao", ("salão", "salao", "academia", "competição", "barra")), ("sala", ("sala dele", "escritório")),
             ("externo", ("rua", "externo", "carreta"))]


def _ambientes(texto: str) -> list[str]:
    t = texto.lower()
    return [nome for nome, chaves in AMBIENTES if any(k in t for k in chaves)] or ["salao"]


def _energia_db(arquivo: pathlib.Path, ini: float, dur_total: float, destino: pathlib.Path) -> bool:
    """RMS em dB a cada PASSO_ENERGIA s, na linha do tempo do clipe (tempo_fonte). Só decodifica áudio (8 kHz)."""
    try:
        bruto = subprocess.run(["nice", "-n", "5", "ffmpeg", "-v", "error", "-threads", "2", "-i", str(arquivo), "-vn", "-ac", "1",
                                "-ar", "8000", "-f", "f32le", "-"], capture_output=True, check=True, timeout=300).stdout
    except (subprocess.SubprocessError, OSError):
        return False
    x = np.frombuffer(bruto, dtype=np.float32)
    h = int(8000 * PASSO_ENERGIA)
    n = len(x) // h
    if n == 0:
        return False
    rms = np.sqrt(np.mean(x[: n * h].reshape(n, h).astype(np.float64) ** 2, axis=1) + 1e-12)
    serie = np.full(int(dur_total / PASSO_ENERGIA) + 1, -90.0, dtype=np.float32)
    i0 = int(round(ini / PASSO_ENERGIA))
    seg = (20 * np.log10(rms)).astype(np.float32)[: max(0, len(serie) - i0)]
    serie[i0:i0 + len(seg)] = seg
    if destino.exists():                                  # vários trechos do mesmo clipe: junta
        velho = np.load(destino)
        if len(velho) == len(serie):
            serie = np.maximum(serie, velho)
    tmp = destino.with_name(destino.stem + ".tmp.npy")
    np.save(tmp, serie)
    os.replace(tmp, destino)
    return True


def converter(origem: pathlib.Path, dados: pathlib.Path, projeto: str = "p_drako17", energia: bool = True) -> list[dict]:
    cat = json.loads((origem / "cat.json").read_text(encoding="utf-8"))
    indice = json.loads((origem / "seg" / "indice.json").read_text(encoding="utf-8"))
    clipes = sorted(p.stem for p in (origem / "trs").glob("*.json"))
    base = dados / "armazenamento" / "derivados" / projeto
    analises = []
    for n, clip in enumerate(clipes, 1):
        aid = f"a{n:03d}"
        tr = json.loads((origem / "trs" / f"{clip}.json").read_text(encoding="utf-8"))
        c = cat.get(clip, {})
        momentos = c.get("momentos", [])
        dur = float(tr.get("dur") or max([m["t1"] for m in momentos] + [1.0]))
        pasta = base / aid
        pasta.mkdir(parents=True, exist_ok=True)

        def falante(s, e):
            meio = (s + e) / 2
            for m in momentos:
                if m["tipo"] in FALANTE_POR_TIPO and m["t0"] - 0.3 <= meio <= m["t1"] + 0.3:
                    return FALANTE_POR_TIPO[m["tipo"]]
            return FALANTE_DO_CLIPE.get(clip)

        segs = []
        for s in tr["segs"]:
            pal = [[float(w[0]), float(w[1]), str(w[2]).strip(), float(w[3])] for w in s.get("w", []) if str(w[2]).strip()]
            conf = round(float(np.mean([p[3] for p in pal])), 3) if pal else None
            segs.append({"s": float(s["s"]), "e": float(s["e"]), "texto": s["t"].strip(), "falante": falante(s["s"], s["e"]), "conf": conf, "palavras": pal})

        for i in range(1, len(segs) - 1):                 # trecho sem rótulo entre duas falas da mesma pessoa = mesma pessoa
            if segs[i]["falante"] is None and segs[i - 1]["falante"] and segs[i - 1]["falante"] == segs[i + 1]["falante"] \
                    and segs[i]["s"] - segs[i - 1]["e"] < 1.5 and segs[i + 1]["s"] - segs[i]["e"] < 1.5:
                segs[i]["falante"] = segs[i - 1]["falante"]
        trechos = [{"chave": t["arq"], "ini": float(t["ini"]), "fim": t["fim"]} for t in indice.get(clip, [])]
        chave_e = f"derivados/{projeto}/{aid}/energia.npy"
        arq_e = dados / "armazenamento" / chave_e
        if energia and not arq_e.exists():
            aud = origem / "aud" / f"{clip}.m4a"
            if aud.exists():
                _energia_db(aud, 0.0, dur, arq_e)
            else:
                for t in trechos:
                    _energia_db(pathlib.Path(t["chave"]), t["ini"], dur, arq_e)
        fala_pct = round(sum(s["e"] - s["s"] for s in segs) / dur, 3) if dur else None

        texto_amb = " ".join([c.get("resumo", ""), c.get("camera", "")] + [m.get("desc", "") for m in momentos])
        amb = _ambientes(texto_amb)
        camera = c.get("camera", "")
        tremido = bool(re.search(r"trem|balan|mão livre|selfie", camera.lower()))
        trechos_trem = [[m["t0"], m["t1"], 8.0] for m in momentos if re.search(r"trem|balan|andando|caminh", (m.get("desc") or "").lower())]
        tamanho = sum(pathlib.Path(t["chave"]).stat().st_size for t in trechos if pathlib.Path(t["chave"]).exists())
        kf_dir = origem / "kf" / clip
        kfs = []
        if (kf_dir / "tempos.txt").exists():
            tempos = [float(x) for x in (kf_dir / "tempos.txt").read_text().split()]
            kfs = [{"t": t, "chave": str(kf_dir / f"{i + 1:05d}.jpg")} for i, t in enumerate(tempos)]

        a = {
            "versao": "1",
            "arquivo": {"id": aid, "projeto": projeto, "nome": f"{clip}.mov", "chave": trechos[0]["chave"] if trechos else f"legado/{clip}.mov",
                        "bytes": int(tamanho), "sha256": None, "gravado_em": f"2026-11-15T{clip[:2]}:{clip[3:5]}:00-03:00" if clip[:2].isdigit() else None},
            "midia": {"duracao": round(dur, 3), "tem_video": True, "tem_audio": True, "w": 2160, "h": 3840, "rotacao": -90 if clip != "sala" else 0,
                      "fps": 30.0, "codec_video": "hevc" if clip != "sala" else "h264", "codec_audio": "aac", "hdr": False, "gop": 1.0},
            "derivados": {"audio_wav": None, "proxy_480": None, "folha": str(origem / "folhas" / f"{clip}.jpg") if (origem / "folhas" / f"{clip}.jpg").exists() else None,
                          "quadros_chave": kfs, "trechos": trechos},
            "transcricao": {"provedor": "fixture", "modelo": "whisper-small (17/11)", "idioma": "pt", "vad": False, "segmentos": segs},
            "sinais": {
                "energia": {"passo": PASSO_ENERGIA, "chave": chave_e if arq_e.exists() else "", "picos": [], "fala_pct": fala_pct},
                "tremor": {"passo": 1.0, "media_px": 6.0 if tremido else 1.5, "trechos": trechos_trem},
                "cenas": [{"t0": 0.0, "t1": round(dur, 3), "ambiente": amb[0], "luz": None}],
                "rostos": [],
                "telas": [],
            },
            "visao": {"provedor": "fixture", "resumo": c.get("resumo", ""), "pessoas": c.get("pessoas", ""), "camera": camera,
                      "serve_para": c.get("serve_para", ""),
                      "momentos": [{"t0": float(m["t0"]), "t1": float(m["t1"]), "tipo": m["tipo"], "desc": m.get("desc", ""),
                                    "nota": int(m.get("nota", 3)), "emocao": None} for m in momentos]} if c else None,
            "tempos": {},
        }
        if not c and clip in FALANTE_DO_CLIPE:            # sem catálogo antigo: um momento de fala por segmento longo
            a["visao"] = {"provedor": "fixture", "resumo": "Marcos fala para a câmera na sala dele, depois do evento.", "pessoas": "MARCOS",
                          "camera": "estável", "serve_para": "creat", "momentos": [
                              {"t0": 0.0, "t1": round(dur, 2), "tipo": "fala_marcos", "desc": "Marcos na sala dele fala para a câmera, depois do evento", "nota": 4, "emocao": None},
                              {"t0": 86.0, "t1": 93.0, "tipo": "app_tela", "desc": "telas do computador com várias abas abertas", "nota": 4, "emocao": None}]}
            a["sinais"]["cenas"][0]["ambiente"] = "sala"
        tmp = pasta / "analise.json.tmp"
        tmp.write_text(json.dumps(a, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, pasta / "analise.json")
        analises.append(a)
    _biblioteca_trilhas(origem, dados)
    return analises


def _biblioteca_trilhas(origem: pathlib.Path, dados: pathlib.Path) -> None:
    """Trilhas de 17/11 (audio/trilha_*.wav + *_mapa.json) -> <dados>/biblioteca/trilhas.json."""
    lib = []
    for mapa in sorted((origem / "audio").glob("*_mapa.json")):
        nome = mapa.stem.replace("_mapa", "")
        wav = origem / "audio" / f"trilha_{nome}.wav"
        if not wav.exists():
            continue
        m = json.loads(mapa.read_text(encoding="utf-8"))
        clima = {"creat": "energia urbana, hip-hop leve, cresce no fim", "drako": "épico, batida forte, competição"}.get(nome, "")
        lib.append({"id": f"t_{nome}_{int(m['bpm'])}", "clima": clima, "bpm": float(m["bpm"]), "dur": float(m.get("duracao_s", 0)),
                    "fase": float(m["compassos"][0]["inicio_s"]) if m.get("compassos") else 0.0, "chave": str(wav)})
    d = dados / "biblioteca"
    d.mkdir(parents=True, exist_ok=True)
    (d / "trilhas.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1), encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origem", default=str(ORIGEM_PADRAO))
    ap.add_argument("--projeto", default="p_drako17")
    ap.add_argument("--sem-energia", action="store_true")
    a = ap.parse_args(argv)
    from motor import config
    cfg = config.carregar()
    t0 = time.time()
    an = converter(pathlib.Path(a.origem), cfg.dados, a.projeto, energia=not a.sem_energia)
    print(f"{len(an)} análises em {cfg.dados}/armazenamento/derivados/{a.projeto} ({time.time() - t0:.1f} s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
