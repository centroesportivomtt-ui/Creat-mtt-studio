"""Prova palavra a palavra: transcreve cada peça de voz de um EDL ISOLADA (com silêncio em volta) e mostra ao lado do texto
pedido, com o tempo em que a última palavra acaba e a folga até o corte.

Por que existe (revisão do dono, Super Kal 19/11): fala cortada no fim só aparece ouvindo a peça sozinha. A transcrição do
mix inteiro esconde o defeito (o Whisper completa a frase pelo contexto); a peça isolada mostra "com" no lugar de "comum".
Use depois de `ajustar_cortes` e antes de entregar; a régua física fica no QA (`fala_cortada`), esta é a leitura.

uso:
  python -m motor.ferramentas.prova_pecas <projeto> <versao> [--modelo large-v3]
"""
from __future__ import annotations

import argparse
import unicodedata

import numpy as np

from motor import config
from motor.provedores import armazenamento_de


def _norm(t: str) -> list[str]:
    t = unicodedata.normalize("NFKD", t.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return "".join(c if c.isalnum() else " " for c in t).split()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto")
    ap.add_argument("versao")
    ap.add_argument("--modelo", default="large-v3")
    a = ap.parse_args(argv)
    import scipy.signal as ss
    import soundfile as sf
    from faster_whisper import WhisperModel
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    edl = arm.ler_json(f"saidas/{a.projeto}/{a.versao}/edl.json")
    m = WhisperModel(a.modelo, device="cpu", compute_type="int8", cpu_threads=int(getattr(cfg, "threads", 3) or 3))
    audios: dict = {}
    difs = 0
    print(f"{a.projeto}/{a.versao}: {edl['duracao']:.2f} s, {len(edl['voz'])} peças de voz")
    for v in sorted(edl["voz"], key=lambda v: v["t0"]):
        chave = edl["fontes"][v["fonte"]]["audio"]
        if chave not in audios:
            x, sr = sf.read(arm.caminho_local(chave), dtype="float32")
            audios[chave] = (x.mean(1) if x.ndim > 1 else x, sr)
        x, sr = audios[chave]
        seg = x[int(max(0, v["s0"]) * sr):int(v["s1"] * sr)].copy()
        fd = max(1, int(0.01 * sr))
        seg[:fd] *= np.linspace(0, 1, fd)
        seg[-fd:] *= np.linspace(1, 0, fd)
        seg = np.concatenate([np.zeros(int(0.5 * sr), np.float32), seg, np.zeros(int(0.7 * sr), np.float32)])
        seg = ss.resample_poly(seg, 16000, sr).astype("float32")
        r, _ = m.transcribe(seg, language="pt", vad_filter=False, beam_size=5, temperature=0, condition_on_previous_text=False,
                            word_timestamps=True)
        ws = [w for s in r for w in s.words]
        ouvido = " ".join(w.word.strip() for w in ws)
        igual = _norm(v["texto"]) == _norm(ouvido)
        difs += 0 if igual else 1
        ult = ws[-1] if ws else None
        fim = (v["s0"] + ult.end - 0.5) if ult else None
        print(f"  {'ok ' if igual else 'DIF'} {v['id']:9s} filme {v['t0']:6.2f}-{v['t1']:6.2f} fonte {v['s0']:7.2f}-{v['s1']:7.2f}"
              + (f" | última «{ult.word.strip()}» acaba {fim:.2f} (folga {v['s1'] - fim:+.2f})" if ult else " | NADA OUVIDO"))
        if not igual:
            print(f"        pedido: {v['texto']}\n        ouvido: {ouvido}")
    print(f"{difs} peça(s) com texto diferente do pedido (leia cada uma: nome de marca e número escrito de outro jeito não é defeito)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
