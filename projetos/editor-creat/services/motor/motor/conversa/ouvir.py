"""Transcrição do áudio do dono para a conversa, num SUBPROCESSO (plano D10).

Por que subprocesso: um estouro de memória do Whisper dentro da API derrubaria o contêiner inteiro (deploy/iniciar.sh
espera os processos com `wait -n`). Aqui, se o processo morrer, só aquele áudio falha ("grave de novo").
A API abre `nice -n 5 python -m motor.conversa.ouvir <arquivo>` com semáforo 1 e limite de 90 s; o arquivo fica em
<dados>/tmp/voz/ (fora de armazenamento/entrada/, o envio por tus não vê) e é apagado no finally de quem chamou.

Saída (stdout): {"texto": str, "conf": 0..1, "s_audio": s}. Códigos: 0 ok; 3 sem faster-whisper (503); 2 erro (422);
4 áudio com mais de 65 s (413 "grave até 1 minuto"). Custo US$ 0 (faster-whisper local).

Memória (achado da revisão, 25/11): o filho nasce com oom_score_adj 1000 (num aperto do contêiner o kernel mata ESTE
processo antes do render) e com teto de espaço de endereço (EDITOR_VOZ_LIMITE_MB, padrão 4096; 0 desliga). Medido em
25/11 com o modelo small int8 e 4 núcleos: pico virtual 3,4 GB, residente 0,75 GB; com 2 GB de teto ele não sobe.
Sessão própria (start_new_session): no tempo esgotado a API mata o grupo inteiro (python e o ffmpeg filho).
O áudio é lido com corte em 75 s (ffmpeg -t) e passa de 65 s volta 4 antes do Whisper. Arquivos de tmp/voz com mais de
10 minutos são apagados no boot e a cada áudio novo (o áudio do dono vive no máximo 10 minutos no disco).
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import sys
import time

LIMITE_S = 90.0
MAX_AUDIO_S = 65.0                    # "grave até 1 minuto" com folga
LEITURA_MAX_S = 75.0                  # ffmpeg -t: nunca carrega mais que isso
VELHO_S = 600.0                       # tmp/voz: apagado depois de 10 minutos
DICAS = ["Marcos", "Xande", "Ruan", "creat.MTT", "Grupo Super Kal"]
MAX_BYTES = 950_000
TIPOS = {"audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/x-m4a": "m4a"}


def raiz_motor() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[2]          # services/motor


def comando(arquivo: pathlib.Path) -> list[str]:
    base = ["nice", "-n", "5"] if shutil.which("nice") else []
    return [*base, sys.executable, "-m", "motor.conversa.ouvir", str(arquivo)]


_SEGREDO = ("KEY", "TOKEN", "SECRET", "SENHA", "PASSWORD", "SEGREDO", "CREDENTIAL", "AUTH")
# lista permitida (o filho só transcreve): sistema, Python, caches de modelo e as configurações do editor/whisper
_PERMITIDAS = {"PATH", "HOME", "LANG", "LANGUAGE", "TZ", "TMPDIR", "TEMP", "TMP", "USER", "PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV",
               "PYTHONIOENCODING", "PYTHONUNBUFFERED", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "LD_LIBRARY_PATH", "SSL_CERT_FILE"}
_PREFIXOS = ("EDITOR_", "LC_", "HF_", "CT2_", "XDG_", "TRANSFORMERS_", "TORCH_", "WHISPER_")


def ambiente() -> dict:
    """Ambiente do subprocesso: só variáveis da lista permitida, e nenhuma com cara de segredo (ele só transcreve,
    não chama ninguém). URL de banco ou de proxy com credencial não passa."""
    env = {k: v for k, v in os.environ.items()
           if (k in _PERMITIDAS or k.startswith(_PREFIXOS)) and not any(x in k.upper() for x in _SEGREDO)}
    from motor import config
    extra = [str(raiz_motor()), str(config.SCHEMAS / "py")]
    env["PYTHONPATH"] = os.pathsep.join(extra + ([env["PYTHONPATH"]] if env.get("PYTHONPATH") else []))
    return env


def limite_mb() -> int:
    try:
        return max(0, int(os.environ.get("EDITOR_VOZ_LIMITE_MB", "4096") or 0))
    except ValueError:
        return 4096


def limitar() -> None:
    """preexec_fn do filho (roda no filho, antes do exec): primeiro a morrer num aperto de memória, e com teto."""
    try:
        with open("/proc/self/oom_score_adj", "w") as f:
            f.write("1000")
    except OSError:
        pass
    mb = limite_mb()
    if mb:
        try:
            import resource
            lim = mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (lim, lim))
        except (ImportError, ValueError, OSError):
            pass


def limpar_velhos(cfg, velho_s: float = VELHO_S) -> int:
    """Apaga de <dados>/tmp/voz o que tem mais de velho_s (queda, kill -9 ou deploy no meio deixariam a voz no disco)."""
    pasta = pathlib.Path(cfg.dados) / "tmp" / "voz"
    if not pasta.is_dir():
        return 0
    n, agora = 0, time.time()
    for a in pasta.iterdir():
        try:
            if a.is_file() and agora - a.stat().st_mtime > velho_s:
                a.unlink()
                n += 1
        except OSError:
            pass
    return n


class AudioLongo(Exception):
    pass


def _em_laco(texto: str) -> bool:
    """Algum trigrama aparece mais de 3 vezes? (alucinação de laço do Whisper: 'marcos marcos marcos')"""
    ps = texto.lower().split()
    conta: dict[tuple, int] = {}
    for i in range(len(ps) - 2):
        k = tuple(ps[i:i + 3])
        conta[k] = conta.get(k, 0) + 1
        if conta[k] > 3:
            return True
    return False


def transcrever(arquivo: pathlib.Path) -> dict:
    from motor import config
    from motor.provedores.transcricao_fw import FasterWhisper, ler_16k
    cfg = config.carregar()
    tr = FasterWhisper(cfg)
    audio = ler_16k(arquivo, max_s=LEITURA_MAX_S)
    s_audio = round(len(audio) / 16000.0, 2)
    if s_audio > MAX_AUDIO_S:
        raise AudioLongo()
    del audio

    def uma(**kw) -> tuple[str, float]:
        r = tr.transcrever(arquivo, idioma="pt", palavras=False, dicas=DICAS, forcar_dicas=True, **kw)
        segs = r.get("segmentos", [])
        texto = " ".join(s["texto"].strip() for s in segs).strip()
        confs = [float(s["conf"]) for s in segs if s.get("conf") is not None]
        return texto, (round(sum(confs) / len(confs), 2) if confs else 0.0)

    texto, conf = uma()
    if _em_laco(texto):
        texto, conf = uma(no_repeat_ngram_size=4)
    return {"texto": texto, "conf": conf, "s_audio": s_audio}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(json.dumps({"erro": "uso: python -m motor.conversa.ouvir <arquivo>"}))
        return 2
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        print(json.dumps({"erro": "sem_transcricao"}))
        return 3
    t0 = time.monotonic()
    try:
        out = transcrever(pathlib.Path(argv[1]))
    except AudioLongo:
        print(json.dumps({"erro": "longo"}))
        return 4
    except Exception as e:  # noqa: BLE001 - o motivo técnico fica no stderr; a API responde "grave de novo"
        print(f"falhou: {type(e).__name__}", file=sys.stderr)
        print(json.dumps({"erro": "falhou"}))
        return 2
    out["s"] = round(time.monotonic() - t0, 2)
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
