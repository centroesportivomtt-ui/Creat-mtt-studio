"""Retranscreve arquivos já analisados, por TRECHOS DE ENERGIA, com modelo maior e vocabulário do pedido.

Por que existe (Super Kal, 19/11): sem VAD, o Whisper em arquivo inteiro juntou três tentativas seguidas da mesma frase
("Uma latinha de cerveja comum...") num segmento só de 24 s, com palavras espalhadas pelas tentativas. O resolvedor achava
"de"/"ate" nesse segmento e o corte levava os erros junto. Aqui o áudio é partido onde a energia fica abaixo do limiar por
>= `--pausa` s (não é o VAD Silero, então fala gritada e fala sobre música continuam dentro), e cada trecho é transcrito sozinho,
com tempos somados ao início do trecho. Nomes de marca entram como `initial_prompt` só nos trechos com fala (sem laço em música).

uso:
  python -m motor.ferramentas.retranscrever <projeto> [arquivo_id ...] [--modelo large-v3] [--dicas "Stella Pure Gold, Amstel Ultra"]
Desde a onda 4 o mesmo trabalho roda sozinho no fluxo (passo `catalogo.escuta`, `etapas/escuta.py`) e esta ferramenta usa as
mesmas funções. Grava `transcricao_fina.json` (o cache do ouvido fino: com as mesmas dicas que o fluxo calcularia, o catálogo
reaplica sem rodar o modelo de novo) e atualiza a transcrição dentro de `analise.json`.
Depois: refaça o catálogo/direção do projeto (novo pedido ou `fechar-envio`).
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib

import numpy as np

from motor import config
from motor.provedores import armazenamento_de
from motor.provedores.transcricao_fw import eh_fantasma, ler_16k, normalizar

PASSO = 0.05  # passo da série de energia gravada pela análise (energia.npy)


def trechos_por_energia(db: np.ndarray, dur: float, limiar: float = -38.0, pausa: float = 0.6, folga: float = 0.25,
                        min_trecho: float = 0.35) -> list[tuple[float, float]]:
    """Intervalos com som acima do limiar, unidos quando o vão é menor que `pausa`."""
    ativo = db > limiar
    out, ini = [], None
    for i, a in enumerate(ativo):
        t = i * PASSO
        if a and ini is None:
            ini = t
        if not a and ini is not None:
            out.append([ini, t]); ini = None
    if ini is not None:
        out.append([ini, len(ativo) * PASSO])
    unidos = []
    for s, e in out:
        if unidos and s - unidos[-1][1] < pausa:
            unidos[-1][1] = e
        else:
            unidos.append([s, e])
    return [(max(0.0, s - folga), min(dur, e + folga)) for s, e in unidos if e - s >= min_trecho]


FANTASMAS_EXTRA = ("legendas preparadas", "voluntario", "pilula", "sininho", "inscreva", "ative o", "obrigado por")


def em_laco(txt: str) -> bool:
    """Alucinação em laço: a mesma palavra/expressão repetida, ou letra esticada ("Êêêêê")."""
    import re
    from motor.provedores.transcricao_fw import normalizar
    if re.search(r"(.)\1{7,}", txt):
        return True
    w = normalizar(txt).split()
    for n in (1, 2, 3):                      # a mesma expressão SEGUIDA 3+ vezes ("amstel ultra amstel ultra amstel ultra")
        for i in range(0, max(0, len(w) - 3 * n + 1)):
            g = w[i:i + n]
            if w[i + n:i + 2 * n] == g and w[i + 2 * n:i + 3 * n] == g:
                return True
    return False


def transcrever_trechos(modelo, audio16: np.ndarray, trechos, dicas: str | None, beam_size: int = 5) -> list[dict]:
    """Transcreve cada trecho sozinho (tempos somados ao início do trecho). Usada aqui e pelo ouvido fino do fluxo
    (`etapas/escuta_filho.py`), com os mesmos filtros de fantasma e laço."""
    segs = []
    for a, b in trechos:
        pedaco = audio16[int(a * 16000):int(b * 16000)]
        if len(pedaco) < 1600:
            continue
        # vocabulário só em trecho longo: em trecho curto/sem fala o prompt vira laço ("Amstel Ultra, Amstel Ultra...")
        r, _ = modelo.transcribe(pedaco, language="pt", word_timestamps=True, vad_filter=False, beam_size=int(beam_size),
                                 temperature=0, condition_on_previous_text=False,
                                 initial_prompt=(dicas or None) if b - a >= 2.0 else None)
        for s in r:
            txt = (s.text or "").strip()
            n = normalizar(txt)
            if (not txt or eh_fantasma(txt) or em_laco(txt) or any(f in n for f in FANTASMAS_EXTRA)
                    or (s.no_speech_prob or 0) > 0.6):
                continue
            ws = [[round(a + w.start, 2), round(a + w.end, 2), w.word.strip(), round(float(w.probability), 2)]
                  for w in (s.words or []) if w.word.strip()]
            if not ws:
                continue
            segs.append({"s": ws[0][0], "e": ws[-1][1], "texto": txt, "falante": None,
                         "conf": round(math.exp(s.avg_logprob), 2) if s.avg_logprob is not None else None, "palavras": ws})
    return segs


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto")
    ap.add_argument("arquivos", nargs="*")
    ap.add_argument("--modelo", default="large-v3")
    ap.add_argument("--dicas", default="")
    ap.add_argument("--limiar", type=float, default=-38.0)
    ap.add_argument("--pausa", type=float, default=0.6)
    ap.add_argument("--beam", type=int, default=5)
    a = ap.parse_args(argv)
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    from faster_whisper import WhisperModel
    m = WhisperModel(a.modelo, device="cpu", compute_type="int8", cpu_threads=int(getattr(cfg, "threads", 4) or 4))
    base = pathlib.Path(arm.caminho_local(f"derivados/{a.projeto}"))
    ids = a.arquivos or sorted(p.name for p in base.iterdir() if (p / "analise.json").exists())
    from motor.etapas import escuta as ESC
    dicas = [d.strip() for d in a.dicas.split(",") if d.strip()]
    for aid in ids:
        pref = f"derivados/{a.projeto}/{aid}"
        an = arm.ler_json(f"{pref}/analise.json")
        dur = float(an["midia"]["duracao"])
        db = np.load(arm.caminho_local(f"{pref}/energia.npy"))
        tr_ = trechos_por_energia(db, dur, a.limiar, a.pausa)
        audio = ler_16k(pathlib.Path(arm.caminho_local(f"{pref}/audio.wav")))
        segs = transcrever_trechos(m, audio, tr_, ESC.prompt(dicas), beam_size=a.beam)
        tr = ESC.transcricao(segs, a.modelo)
        sig = ESC.assinatura(ESC._sig_ingest(arm, a.projeto, aid, an), a.modelo, dicas, a.limiar) if a.pausa == ESC.PAUSA_S else None
        arm.gravar_json(f"{pref}/transcricao_fina.json", {"assinatura": sig, "modelo": a.modelo, "dicas": dicas, "trechos": len(tr_),
                                                         "segundos": None, "transcricao": tr, "ferramenta": True})
        from motor.etapas import analise as A
        an["transcricao"] = A.filtrar_transcricao(tr, db)
        A.validar_analise(an)
        arm.gravar_json(f"{pref}/analise.json", an)
        print(f"{aid} {an['arquivo'].get('nome')}: {len(tr_)} trechos, {len(segs)} falas")
        for s in segs:
            print(f"   {s['s']:.1f}-{s['e']:.1f} {s['texto']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
