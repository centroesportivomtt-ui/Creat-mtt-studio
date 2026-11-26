"""Ouvido fino (onda 4, item 1, D40 a D43): o primeiro passo do job `catalogo` (`catalogo.escuta`) transcreve de novo as falas
com o Whisper grande, por trechos de energia e com o vocabulário do pedido, antes de o catálogo ser montado.

Por que existe (Super Kal Black, 26/11): a análise roda o `small` no arquivo inteiro, antes do pedido existir. Ele errou
Guerreiro, Sisal e Bacia do Jacuípe, e a conversa baixa da equipe não entrou na transcrição. A entrega da noite só saiu com a
transcrição refeita à mão (`ferramentas/retranscrever.py`, `large-v3`, beam 5). Agora isso é o padrão, no fluxo (com o turbo):

- arquivos com fala (análise com segmento ou `fala_pct >= 0,02`) e áudio; o resto fica como está;
- dicas: nomes do pedido (sequências com inicial maiúscula, "Bacia do Jacuípe" inteira), `projeto.dados.dicas`, o nome do
  cliente, as da casa e o vocabulário da casa; pedido primeiro, sem repetição, até 40 termos e 400 caracteres. Só entram como
  `initial_prompt` em trecho de 2 s ou mais (em trecho curto o prompt vira laço);
- cache por arquivo em `derivados/<p>/<a>/transcricao_fina.json` (assinatura: algoritmo, ingest, modelo, dicas, limiar,
  pausa, beam). Igual: reaplica sem chamar o modelo (segunda rodada do catálogo, refazer a leitura);
- o resultado SUBSTITUI `analise.json.transcricao` (modelo `"<modelo>+trechos"`, pelo mesmo filtro da análise); o resto da
  análise e `analise.ok` não mudam. Catálogo, resolvedor e conferência leem a mesma transcrição;
- o modelo roda num PROCESSO FILHO (`etapas/escuta_filho.py`): `nice 10`, sessão própria, `oom_score_adj 1000`, ambiente pela
  lista permitida de `conversa/ouvir.ambiente()` (sem segredo), memória REAL do grupo vigiada a cada 0,5 s
  (`EDITOR_ESCUTA_LIMITE_MB`) e tempo (`EDITOR_ESCUTA_TEMPO_S`). Um ouvido fino por vez no servidor inteiro (`<dados>/tmp/escuta.lock`);
- queda segura (memória, tempo, trava ocupada, modelo que não carrega, faster-whisper ausente, erro): o que já chegou fica
  fino, o resto fica com a transcrição rápida, e a mesa diz isso. O projeto NUNCA vai a erro por causa do ouvido fino.

Variáveis (todas opcionais): EDITOR_WHISPER_MODELO_FINO (turbo pela medição 1.11; large-v3 se couber; 0 ou vazio desliga),
EDITOR_ESCUTA_LIMITE_MB (4500; 0 desliga a vigia), EDITOR_ESCUTA_THREADS (min(4, núcleos)), EDITOR_ESCUTA_TEMPO_S
(240 + 2 x segundos de fala, teto 1800), EDITOR_ESCUTA_BEAM (5).
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import logging
import os
import pathlib
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import unicodedata
import uuid
from collections import deque

import numpy as np

log = logging.getLogger("motor.escuta")

ALGO = "escuta-1"
# Medição 1.11 (26/11, local, 4 núcleos, 60 s de fala, beam 5, int8): large-v3 pico de 4.322 MB residentes e 81,5 s; turbo
# 2.131 MB e 24,6 s. O critério do plano era "pico acima de 4 GB, o padrão vira turbo": virou. large-v3 continua a um env de distância.
MODELO_PADRAO = "turbo"
BATIMENTO_S = 10.0            # de quanto em quanto tempo o pai renova o lease do job (e repete a última frase na tela)
LIMIAR_DB = -38.0          # o da entrega à mão de 26/11 (retranscrever.py)
PAUSA_S = 0.6
FALA_PCT_MIN = 0.02
MAX_DICAS, MAX_PROMPT = 40, 400
MAX_VOCAB = 12
VIGIA_S = 0.5
VELHO_S = 3600.0           # tmp/escuta: o que tem mais de 1 h é resto de queda e sai
CONECTORES = {"do", "da", "de", "dos", "das"}
# palavras com maiúscula só porque abrem a frase: não são nomes (o pedido é texto livre do dono)
COMUNS = {"a", "o", "as", "os", "um", "uma", "eu", "ele", "ela", "nós", "nos", "eles", "elas", "quero", "queria", "faça", "faz",
          "fazer", "precisa", "preciso", "vídeo", "video", "para", "pra", "com", "sem", "no", "na", "em", "que", "se", "mas",
          "não", "nao", "sim", "use", "usar", "coloca", "colocar", "bota", "botar", "mostra", "mostrar", "tem", "ter", "é", "e",
          "isso", "esse", "essa", "este", "esta", "aqui", "depois", "antes", "também", "tambem", "anúncio", "anuncio", "reel",
          "filme", "peça", "peca", "quem", "como", "quando", "onde", "porque", "por", "cada", "todo", "toda", "todos", "tudo",
          "bem", "muito", "mais", "menos", "só", "so", "ai", "aí", "então", "entao", "olha", "veja", "vamos", "bora", "oi", "olá"}
QUEDAS = {
    "memoria": "Não coube o ouvido fino agora (memória do servidor); segui com a transcrição rápida.",
    "modelo": "Não coube o ouvido fino agora (o modelo não baixou); segui com a transcrição rápida.",
    "sem_whisper": "Não coube o ouvido fino agora (o ouvido fino não está instalado); segui com a transcrição rápida.",
    "trava": "Não coube o ouvido fino agora (outro projeto está usando o ouvido fino); segui com a transcrição rápida.",
    "erro": "Não coube o ouvido fino agora (o ouvido fino falhou); segui com a transcrição rápida.",
}


# ------------------------------------------------------------------ configuração
def _num(nome: str, padrao: float) -> float:
    try:
        v = os.environ.get(nome, "")
        return float(v) if v.strip() else padrao
    except ValueError:
        return padrao


def modelo_fino(cfg=None) -> str:
    v = getattr(cfg, "whisper_modelo_fino", None)
    if v is None:
        v = os.environ.get("EDITOR_WHISPER_MODELO_FINO", MODELO_PADRAO)
    v = str(v).strip()
    return "" if v in ("", "0") else v


def limite_mb() -> int:
    return max(0, int(_num("EDITOR_ESCUTA_LIMITE_MB", 4500)))


def threads() -> int:
    return max(1, int(_num("EDITOR_ESCUTA_THREADS", min(4, os.cpu_count() or 2))))


def beam() -> int:
    return max(1, int(_num("EDITOR_ESCUTA_BEAM", 5)))


def tempo_max(segundos_fala: float) -> float:
    if os.environ.get("EDITOR_ESCUTA_TEMPO_S", "").strip():
        return max(0.5, _num("EDITOR_ESCUTA_TEMPO_S", 240.0))
    return min(1800.0, 240.0 + 2.0 * max(0.0, segundos_fala))


# ------------------------------------------------------------------ quem tem fala
def tem_fala(an: dict) -> bool:
    if not (an.get("derivados") or {}).get("audio_wav") or not (an.get("midia") or {}).get("tem_audio", True):
        return False
    segs = (an.get("transcricao") or {}).get("segmentos") or []
    pct = ((an.get("sinais") or {}).get("energia") or {}).get("fala_pct") or 0.0
    return bool(segs) or float(pct) >= FALA_PCT_MIN


def segundos_de_fala(an: dict) -> float:
    dur = float((an.get("midia") or {}).get("duracao") or 0.0)
    pct = float(((an.get("sinais") or {}).get("energia") or {}).get("fala_pct") or 0.0)
    segs = (an.get("transcricao") or {}).get("segmentos") or []
    return max(pct * dur, sum(max(0.0, float(s["e"]) - float(s["s"])) for s in segs))


# ------------------------------------------------------------------ dicas
def _chave(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    return " ".join("".join(c for c in t if not unicodedata.combining(c)).split())


_PALAVRA = r"[A-Za-zÀ-ÖØ-öø-ÿ0-9][\wÀ-ÖØ-öø-ÿ'’.\-]*"


def nomes(texto: str) -> list[str]:
    """Sequências de até 4 palavras com inicial maiúscula, aceitando do/da/de/dos/das no meio ("Bacia do Jacuípe"). Vírgula,
    ponto e outra pontuação entre duas palavras fecham a sequência ("Guerreiro, Sisal" são dois nomes)."""
    texto = texto or ""
    toks, quebra = [], []
    ant = 0
    for m in re.finditer(_PALAVRA, texto):
        w = m.group(0)
        fim_frase = w.endswith(".") and w.count(".") == 1          # "Jacuípe." fecha a frase; "creat.MTT" não
        quebra.append(bool(re.search(r"[,;:.!?()\[\]«»\"“”/|-]", texto[ant:m.start()])) if toks else True)
        toks.append(w.rstrip(".") if fim_frase else w)
        ant = m.end() - (1 if fim_frase else 0)
    out = []
    i = 0
    while i < len(toks):
        w = toks[i]
        if w[:1].isupper():
            seq = [w]
            j = i + 1
            while j < len(toks) and not quebra[j] and len([x for x in seq if x.lower() not in CONECTORES]) < 4:
                if toks[j][:1].isupper():
                    seq.append(toks[j])
                    j += 1
                elif toks[j].lower() in CONECTORES and j + 1 < len(toks) and not quebra[j + 1] and toks[j + 1][:1].isupper():
                    seq += [toks[j], toks[j + 1]]
                    j += 2
                else:
                    break
            while len(seq) > 1 and seq[0].lower() in COMUNS:             # "Anúncio da Black": a palavra comum que abre sai
                seq = seq[1:]
                if seq and seq[0].lower() in CONECTORES:
                    seq = seq[1:]
            nome = " ".join(seq).strip(".-'’")
            if seq and not (len(seq) == 1 and (nome.lower() in COMUNS or len(nome) < 3)):
                out.append(nome)
            i = j
        else:
            i += 1
    return out


def dicas_do_pedido(pedido: dict | None, dicas_projeto=None, vocabulario=None) -> list[str]:
    """Dicas do ouvido fino: pedido primeiro (texto e obrigatório), cliente, dados.dicas do projeto, as da casa e o vocabulário."""
    from motor.etapas.analise import DICAS_CASA
    p = pedido or {}
    brutas: list[str] = []
    obrig = p.get("obrigatorio") or []
    if isinstance(obrig, str):
        obrig = [obrig]
    for t in [p.get("texto") or ""] + [str(x) for x in obrig]:
        brutas += nomes(t)
    if p.get("cliente"):
        from motor.entregas_r2 import nome_cliente, slug
        s = slug(str(p["cliente"]))
        if s:
            brutas.append(nome_cliente(s))
    brutas += [str(x) for x in (dicas_projeto or [])][:30]
    brutas += list(DICAS_CASA)
    paras: list[str] = []
    for v in vocabulario or []:
        x = str(v.get("para") or "").strip() if isinstance(v, dict) else ""
        if x and _chave(x) not in {_chave(y) for y in paras}:
            paras.append(x)
    brutas += paras[:MAX_VOCAB]
    out, vistos, tam = [], set(), 0
    for b in brutas:
        b = " ".join(str(b).split())[:60]
        k = _chave(b)
        if not k or k in vistos:
            continue
        if len(out) >= MAX_DICAS or tam + len(b) + 2 > MAX_PROMPT:
            break
        vistos.add(k)
        out.append(b)
        tam += len(b) + 2
    return out


def prompt(dicas: list[str]) -> str | None:
    return (", ".join(dicas) + ".") if dicas else None


# ------------------------------------------------------------------ assinatura e cache
def limiar_de(db: np.ndarray) -> float:
    """-38 dBFS (a medida de 26/11); arquivo baixo (fala com pico abaixo de -20 dBFS) desce junto, para não perder a fala."""
    if db is None or not len(db):
        return LIMIAR_DB
    alto = float(np.percentile(db, 95))
    return round(min(LIMIAR_DB, alto - 18.0), 1)


def assinatura(sig_ingest: str, modelo: str, dicas: list[str], limiar: float) -> str:
    base = json.dumps([ALGO, sig_ingest, modelo, dicas, limiar, PAUSA_S, beam()], ensure_ascii=False)
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:24]


def _sig_ingest(arm, p: str, aid: str, an: dict) -> str:
    try:
        return str(arm.ler_json(f"derivados/{p}/{aid}/ingest.json")["assinatura"])
    except Exception:  # noqa: BLE001 - sem ingest (material antigo): o arquivo pelo id, chave e tamanho
        a = an.get("arquivo") or {}
        return f"{a.get('id')}|{a.get('chave')}|{a.get('bytes')}|{a.get('sha256')}"


def transcricao(segmentos: list[dict], modelo: str) -> dict:
    return {"provedor": "faster-whisper", "modelo": f"{modelo}+trechos", "idioma": "pt", "vad": False, "segmentos": segmentos}


def aplicar(arm, p: str, aid: str, an: dict, tr: dict) -> tuple[bool, int]:
    """Põe a transcrição fina em analise.json (pelo filtro da análise). Devolve (mudou, falas). Fina vazia sobre uma rápida com
    fala: fica a rápida (queda segura; o trecho de energia pode ter perdido fala baixa)."""
    from motor.etapas import analise as A
    try:
        db = np.load(arm.caminho(f"derivados/{p}/{aid}/energia.npy"))
    except Exception:  # noqa: BLE001
        db = None
    nova = A.filtrar_transcricao(tr, db)
    if not nova["segmentos"] and ((an.get("transcricao") or {}).get("segmentos")):
        return False, len(an["transcricao"]["segmentos"])
    if an.get("transcricao") == nova:
        return False, len(nova["segmentos"])
    obj = {**an, "transcricao": nova}
    A.validar_analise(obj)
    arm.gravar_json(f"derivados/{p}/{aid}/analise.json", obj)
    an.clear()
    an.update(obj)
    return True, len(nova["segmentos"])


# ------------------------------------------------------------------ o filho
def raiz_motor() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[2]


def comando(tarefa: pathlib.Path) -> list[str]:
    base = ["nice", "-n", "10"] if shutil.which("nice") else []
    return [*base, sys.executable, "-m", "motor.etapas.escuta_filho", str(tarefa)]


def ambiente(n_threads: int) -> dict:
    """O mesmo ambiente da voz da conversa (lista permitida, sem nada com cara de segredo), com as threads do ouvido fino."""
    from motor.conversa import ouvir
    env = ouvir.ambiente()
    for k in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        env[k] = str(n_threads)
    env["PYTHONUNBUFFERED"] = "1"
    return env


def _limitar(pid: int | None = None) -> None:
    """Primeiro a morrer num aperto de memória do contêiner (o render de outro projeto fica). O PAI escreve no /proc do filho
    logo depois de abri-lo: preexec_fn num processo com threads (a API) pode travar no fork, como a documentação do Python avisa
    (revisão de segurança, S6). Subir o oom_score_adj do próprio filho não exige privilégio."""
    try:
        with open(f"/proc/{pid or 'self'}/oom_score_adj", "w") as f:
            f.write("1000")
    except OSError:
        pass


def _gravar_tarefa(arq: pathlib.Path, tarefa: dict) -> None:
    """Arquivo de tarefa só para o dono (0600): leva as dicas do pedido (nomes de cliente) e caminhos do projeto."""
    fd = os.open(str(arq), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(tarefa, ensure_ascii=False))


def _matar(proc) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)          # o grupo todo: python, ffmpeg e o que mais o filho abrir
    except (ProcessLookupError, PermissionError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pass


def _limpar_velhos(pasta: pathlib.Path) -> None:
    if not pasta.is_dir():
        return
    agora = time.time()
    for a in pasta.iterdir():
        try:
            if a.is_file() and agora - a.stat().st_mtime > VELHO_S:
                a.unlink()
        except OSError:
            pass


def _travar(caminho: pathlib.Path, ate: float, renovar):
    """Trava fcntl exclusiva (um ouvido fino por vez no servidor). Espera até `ate` (monotonic); não conseguiu: None."""
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd = open(caminho, "a+")
    ultimo = time.monotonic()
    while True:
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except BlockingIOError:
            if time.monotonic() >= ate:
                fd.close()
                return None
            if renovar and time.monotonic() - ultimo > BATIMENTO_S:
                ultimo = time.monotonic()
                renovar(None)
            time.sleep(0.25)


def rodar_filho(tarefa: dict, dados: pathlib.Path, tempo_s: float, ao_chegar, renovar=None) -> dict:
    """Roda o filho e chama `ao_chegar(linha_json)` para cada arquivo pronto, na thread de quem chamou. Devolve
    {"motivo": None | "memoria" | "tempo" | "trava" | "modelo" | "sem_whisper" | "erro", "codigo", "pico_mb", "s"}."""
    pasta = pathlib.Path(dados) / "tmp" / "escuta"
    pasta.mkdir(parents=True, exist_ok=True)
    _limpar_velhos(pasta)
    t_ini = time.monotonic()
    fd = _travar(pathlib.Path(dados) / "tmp" / "escuta.lock", t_ini + tempo_s, renovar)
    if fd is None:
        return {"motivo": "trava", "codigo": None, "pico_mb": 0.0, "s": round(time.monotonic() - t_ini, 2)}
    arq = pasta / f"{uuid.uuid4().hex}.json"
    proc = None
    try:
        _gravar_tarefa(arq, tarefa)
        try:
            proc = subprocess.Popen(comando(arq), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ambiente(int(tarefa.get("threads") or 1)),
                                    cwd=str(raiz_motor()), start_new_session=True)
            _limitar(proc.pid)
        except OSError as e:
            log.warning("ouvido fino não abriu o processo: %s", e)
            return {"motivo": "erro", "codigo": None, "pico_mb": 0.0, "s": 0.0}
        linhas: queue.Queue = queue.Queue()
        cauda: deque = deque(maxlen=20)

        def ler_saida():
            for b in proc.stdout:
                linhas.put(b)
            linhas.put(None)

        def ler_erro():
            for b in proc.stderr:
                cauda.append(b.decode("utf-8", "replace").rstrip()[-300:])
        th = [threading.Thread(target=ler_saida, daemon=True), threading.Thread(target=ler_erro, daemon=True)]
        for t in th:
            t.start()
        from motor.conversa import ouvir

        def entregar(b: bytes) -> None:
            try:
                ao_chegar(json.loads(b.decode("utf-8", "replace")))
            except ValueError:
                pass                                   # linha que não é JSON (aviso de biblioteca): ignora
            except Exception as e:  # noqa: BLE001 - um arquivo que não grava não derruba os outros
                log.warning("ouvido fino: resultado não aplicado (%s: %s)", type(e).__name__, e)

        def drenar() -> bool:
            """Entrega tudo o que já chegou; True quando a saída do filho acabou."""
            while True:
                try:
                    b = linhas.get_nowait()
                except queue.Empty:
                    return False
                if b is None:
                    return True
                entregar(b)
        teto, pico, motivo, fim_saida = limite_mb(), 0.0, None, False
        t0 = time.monotonic()
        ultimo_renovar = t0
        while not (fim_saida and proc.poll() is not None):
            try:
                b = linhas.get(timeout=VIGIA_S)
                if b is None:
                    fim_saida = True
                else:
                    entregar(b)
                    fim_saida = drenar()
            except queue.Empty:
                pass
            if proc.poll() is None:
                mb = ouvir.rss_mb(proc.pid)
                pico = max(pico, mb)
                if teto and mb > teto:
                    motivo = "memoria"
                elif time.monotonic() - t0 > tempo_s:
                    motivo = "tempo"
                if motivo:
                    _matar(proc)
                    break
            if renovar and time.monotonic() - ultimo_renovar > BATIMENTO_S:
                ultimo_renovar = time.monotonic()
                renovar(None)
        for t in th:
            t.join(timeout=5)
        drenar()                                        # o que o filho imprimiu antes de morrer ainda vale
        codigo = proc.poll()
        if motivo is None and codigo not in (0, None):
            motivo = {3: "sem_whisper", 5: "modelo"}.get(codigo, "erro")
        if motivo or codigo:
            log.warning("ouvido fino parou (%s, código %s, pico %.0f MB): %s", motivo, codigo, pico, " | ".join(list(cauda)[-3:]))
        return {"motivo": motivo, "codigo": codigo, "pico_mb": round(pico, 1), "s": round(time.monotonic() - t0, 2)}
    finally:
        if proc is not None and proc.poll() is None:
            _matar(proc)
        try:
            arq.unlink()
        except OSError:
            pass
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_UN)
        finally:
            fd.close()


# ------------------------------------------------------------------ o passo
def ouvir(arm, p: str, analises: list[dict], pedido: dict | None, cfg, *, dicas_projeto=None, vocabulario=None,
          progresso=None) -> dict:
    """`catalogo.escuta`. `progresso(mensagem, fracao)`: fração de 0 a 1 dos vídeos já ouvidos (também no batimento). `analises` (as do catálogo) são atualizadas no lugar. Devolve o relatório:
    {"estado": "desligado"|"sem_fala"|"pronto"|"queda", "videos", "finos", "do_cache", "falas", "modelo", "motivo", "frase", ...}."""
    modelo = modelo_fino(cfg)
    base = {"modelo": modelo, "videos": 0, "finos": 0, "do_cache": 0, "falas": 0, "motivo": None, "frase": None}
    prov = cfg.provedor_efetivo("transcricao") if hasattr(cfg, "provedor_efetivo") else "faster-whisper"
    if not modelo or prov != "faster-whisper":
        return {**base, "estado": "desligado"}
    alvos = [a for a in analises if tem_fala(a)]
    if not alvos:
        return {**base, "estado": "sem_fala"}
    dicas = dicas_do_pedido(pedido, dicas_projeto, vocabulario)
    prompt_txt = prompt(dicas)
    pendentes, por_id, sigs = [], {}, {}
    finos, do_cache, falas, mudou = 0, 0, 0, 0
    for an in alvos:
        aid = an["arquivo"]["id"]
        por_id[aid] = an
        pref = f"derivados/{p}/{aid}"
        try:
            db = np.load(arm.caminho(f"{pref}/energia.npy"))
        except Exception:  # noqa: BLE001
            db = None
        lim = limiar_de(db)
        sig = assinatura(_sig_ingest(arm, p, aid, an), modelo, dicas, lim)
        sigs[aid] = sig
        c = arm.ler_json(f"{pref}/transcricao_fina.json", padrao={}) if arm.existe(f"{pref}/transcricao_fina.json") else {}
        if c.get("assinatura") == sig and isinstance(c.get("transcricao"), dict):
            m, n = aplicar(arm, p, aid, an, c["transcricao"])
            finos, do_cache, falas, mudou = finos + 1, do_cache + 1, falas + n, mudou + int(m)
            continue
        if db is None:
            continue
        pendentes.append({"id": aid, "wav": str(arm.caminho(an["derivados"]["audio_wav"])), "energia": str(arm.caminho(f"{pref}/energia.npy")),
                          "dur": float(an["midia"]["duracao"]), "limiar": lim, "dicas": prompt_txt})
    rel = {**base, "videos": len(alvos), "dicas": dicas}
    if not pendentes:
        return {**rel, "estado": "pronto", "finos": finos, "do_cache": do_cache, "falas": falas, "mudou": mudou}
    n_total = len(pendentes)
    feitos = {"n": 0}
    # o batimento (renova o lease a cada 10 s) repete a ÚLTIMA frase e a fração feita: com None a tela trocava
    # "Ouvindo de novo o vídeo 3 de 9" por nada e a barra parava (revisão tripla, A6)
    ultima = {"m": f"Ouvindo de novo {n_total} vídeo{'s' if n_total != 1 else ''}", "f": 0.0}

    def avisar(_m=None):
        if progresso:
            progresso(ultima["m"], ultima["f"])

    def ao_chegar(linha: dict):
        nonlocal finos, falas, mudou
        aid = linha.get("id")
        if aid not in por_id or not isinstance(linha.get("segmentos"), list):
            return
        tr = transcricao(linha["segmentos"], modelo)
        arm.gravar_json(f"derivados/{p}/{aid}/transcricao_fina.json",
                        {"assinatura": sigs[aid], "modelo": modelo, "dicas": dicas, "trechos": int(linha.get("trechos") or 0),
                         "segundos": float(linha.get("segundos") or 0.0), "transcricao": tr})
        m, n = aplicar(arm, p, aid, por_id[aid], tr)
        finos, falas, mudou = finos + 1, falas + n, mudou + int(m)
        feitos["n"] += 1
        ultima["m"], ultima["f"] = f"Ouvindo de novo o vídeo {feitos['n']} de {n_total}", feitos["n"] / n_total
        avisar()
    tarefa = {"modelo": modelo, "threads": threads(), "beam": beam(), "pausa": PAUSA_S, "arquivos": pendentes}
    seg_fala = sum(segundos_de_fala(por_id[x["id"]]) for x in pendentes)
    r = rodar_filho(tarefa, pathlib.Path(cfg.dados), tempo_max(seg_fala), ao_chegar, renovar=avisar if progresso else None)
    out = {**rel, "finos": finos, "do_cache": do_cache, "falas": falas, "mudou": mudou, "pico_mb": r["pico_mb"], "s": r["s"]}
    if r["motivo"]:
        k = finos
        if r["motivo"] == "tempo":
            frase = f"Não coube o ouvido fino agora (passou do tempo); {k} de {len(alvos)} vídeos ficaram com o ouvido fino."
        else:
            frase = QUEDAS.get(r["motivo"], QUEDAS["erro"])
            if k:
                frase += f" {k} de {len(alvos)} vídeos ficaram com o ouvido fino."
        return {**out, "estado": "queda", "motivo": r["motivo"], "frase": frase}
    return {**out, "estado": "pronto"}


def achado(rel: dict) -> str:
    if rel.get("frase"):
        return rel["frase"]
    v, f = rel.get("videos", 0), rel.get("falas", 0)
    txt = f"Ouviu de novo {v} vídeo{'s' if v != 1 else ''} com o {rel.get('modelo')}: {f} fala{'s' if f != 1 else ''}"
    if rel.get("do_cache") and rel["do_cache"] == rel.get("finos"):
        txt += " (do cache, sem rodar o modelo)"
    elif rel.get("do_cache"):
        txt += f" ({rel['do_cache']} do cache)"
    return txt
