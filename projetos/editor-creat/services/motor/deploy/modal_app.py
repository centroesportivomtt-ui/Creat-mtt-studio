"""Motor do Editor creat.MTT na Modal (fase 2): API + fila numa máquina só, que dorme quando não há trabalho.

Por que assim
- Uma classe com no máximo 1 contêiner: a fila continua em SQLite (sem Postgres agora) e nunca há dois escritores.
- A API (FastAPI) atende o site da Vercel. Cada POST acorda o `processar`, que roda os workers até a fila esvaziar.
  Como `processar` é uma chamada da própria classe, o contêiner fica vivo enquanto houver vídeo sendo feito e
  desliga sozinho depois (sem servidor ligado 24 h: paga só o tempo de trabalho).
- Mídia pesada mora no R2 (EDITOR_ARMAZENAMENTO=r2). O disco local do contêiner é cache e área de trabalho.
- O banco (motor.db) roda no disco local (WAL precisa disso) e é copiado para o Volume a cada 30 s e ao desligar;
  ao ligar, a cópia volta. Perda máxima num desligamento brusco: 30 s de estado, que a fila refaz (etapas idempotentes).

Segredos: um Secret da Modal chamado `editor-creat` com as variáveis do .env.local (Modal > Secrets > Custom >
colar o .env). Nada de segredo neste arquivo.

Deploy:  cd projetos/editor-creat && modal deploy services/motor/deploy/modal_app.py
(ou pelo GitHub Actions: .github/workflows/editor-motor-modal.yml, com MODAL_TOKEN_ID/MODAL_TOKEN_SECRET no repo).
"""
from __future__ import annotations

import os
import pathlib
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid

import modal

AQUI = pathlib.Path(__file__).resolve()
EDITOR = AQUI.parents[3]                     # projetos/editor-creat
APP_DIR = "/app"
PERSISTE = "/persistente"
DADOS = "/tmp/dados"
WORKERS = int(os.environ.get("EDITOR_MODAL_WORKERS", "2"))

app = modal.App("editor-creat-motor")
volume = modal.Volume.from_name("editor-creat-dados", create_if_missing=True, version=2)

imagem = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "curl", "ca-certificates", "fonts-dejavu-core", "fontconfig", "libsndfile1")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
    )
    .pip_install(
        "jsonschema>=4.20", "numpy>=1.26", "scipy>=1.11", "soundfile>=0.12", "pyloudnorm>=0.1.1",
        "opencv-python-headless>=4.9", "pillow>=10", "fastapi>=0.115", "uvicorn>=0.30",
        "faster-whisper>=1.2.1", "anthropic>=0.70", "boto3>=1.34",
    )
    .env({"EDITOR_DADOS": DADOS, "EDITOR_BANCO": f"{DADOS}/motor.db", "HF_HOME": f"{PERSISTE}/modelos",
          "EDITOR_TRILHAS": f"{PERSISTE}/biblioteca/trilhas.json", "EDITOR_NICE": "0",
          "PLAYWRIGHT_BROWSERS_PATH": "/opt/playwright", "PYTHONUNBUFFERED": "1",
          "MOTOR_HOST": "0.0.0.0"})            # fora do loopback: o motor recusa subir sem MOTOR_TOKEN
    # código por último: mudar o código não reconstrói as camadas pesadas
    .add_local_dir(EDITOR / "packages", f"{APP_DIR}/packages", copy=True,
                   ignore=["**/node_modules/**", "**/__pycache__/**"])
    .run_commands(
        f"cd {APP_DIR}/packages/kit && npm install --omit=dev --no-audit --no-fund && npm install --no-save --no-audit --no-fund playwright@1.63.0",
        f"cd {APP_DIR}/packages/kit && npx playwright install --with-deps chromium-headless-shell",
    )
    .add_local_dir(EDITOR / "memoria", f"{APP_DIR}/memoria", copy=True)
    .add_local_dir(EDITOR / "services" / "motor", f"{APP_DIR}/services/motor", copy=True,
                   ignore=["**/__pycache__/**", "tests/**", "deploy/**", "**/.pytest_cache/**"])
    .run_commands(f"pip install --no-deps -e {APP_DIR}/services/motor")
)


def _copiar_banco(origem: str, destino: str) -> None:
    """Cópia consistente do SQLite: backup no disco local (onde a trava do SQLite funciona), depois cópia do
    arquivo pronto para o Volume com nome temporário e troca de uma vez. Quem chama segura a trava."""
    if not os.path.exists(origem):
        return
    local = f"/tmp/motor-copia-{os.getpid()}.db"
    src, dst = sqlite3.connect(origem), sqlite3.connect(local)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    pathlib.Path(destino).parent.mkdir(parents=True, exist_ok=True)
    tmp = f"{destino}.{uuid.uuid4().hex[:8]}.tmp"
    shutil.copyfile(local, tmp)
    os.replace(tmp, destino)
    os.remove(local)


GERACAO = f"{PERSISTE}/geracao"


@app.cls(
    image=imagem,
    secrets=[modal.Secret.from_name("editor-creat")],
    volumes={PERSISTE: volume},
    cpu=8.0,
    memory=16384,
    ephemeral_disk=200 * 1024,
    timeout=3 * 3600,
    max_containers=1,
    scaledown_window=10 * 60,
)
@modal.concurrent(max_inputs=200)
class Motor:
    @modal.enter()
    def ligar(self):
        os.makedirs(DADOS, exist_ok=True)
        os.makedirs(f"{PERSISTE}/biblioteca", exist_ok=True)
        salvo = f"{PERSISTE}/motor.db"
        if os.path.exists(salvo) and not os.path.exists(os.environ["EDITOR_BANCO"]):
            shutil.copyfile(salvo, os.environ["EDITOR_BANCO"])
        # Geração: um deploy novo sobe outro contêiner enquanto o antigo termina o que estava fazendo.
        # Quem ligou por último é o dono do banco; o antigo para de salvar e de processar (os jobs dele
        # voltam para a fila quando o aluguel vence e o contêiner novo refaz: etapas idempotentes).
        self._geracao = f"{time.time():.6f}-{uuid.uuid4().hex[:8]}"
        pathlib.Path(GERACAO).write_text(self._geracao)
        volume.commit()
        self._trava = threading.Lock()
        self._trava_copia = threading.Lock()
        self._rodando = False
        self._parar = threading.Event()
        threading.Thread(target=self._guardar_sempre, daemon=True).start()
        # se o contêiner caiu com trabalho na fila, retoma sozinho
        self._acordar()

    def _sou_o_atual(self) -> bool:
        try:
            volume.reload()
        except Exception:  # noqa: BLE001 - reload falha com arquivo aberto; lê o que está montado
            pass
        try:
            return pathlib.Path(GERACAO).read_text().strip() == self._geracao
        except OSError:
            return True

    def _guardar(self) -> bool:
        """Copia o banco para o Volume. Devolve False quando um contêiner mais novo assumiu."""
        with self._trava_copia:
            if not self._sou_o_atual():
                print("[modal] contêiner mais novo assumiu: este para de salvar", flush=True)
                self._parar.set()
                return False
            try:
                _copiar_banco(os.environ["EDITOR_BANCO"], f"{PERSISTE}/motor.db")
                volume.commit()
            except Exception as e:  # noqa: BLE001 - guardar é cópia de segurança, nunca derruba a API
                print(f"[modal] cópia do banco falhou: {e}", flush=True)
            return True

    def _guardar_sempre(self):
        while not self._parar.wait(30):
            self._guardar()

    @modal.exit()
    def desligar(self):
        self._guardar()
        self._parar.set()

    def _acordar(self):
        if self._parar.is_set():
            return
        with self._trava:
            if self._rodando:
                return
            self._rodando = True
        try:
            Motor().processar.spawn()
        except Exception as e:  # noqa: BLE001
            self._rodando = False
            print(f"[modal] não deu para acordar o processamento: {e}", flush=True)

    @modal.method()
    def processar(self):
        """Roda os workers até a fila esvaziar. Mantém o contêiner vivo durante o trabalho."""
        codigos: list[int] = []
        try:
            while not self._parar.is_set():
                procs = [subprocess.Popen(["python", "-m", "motor.worker", "--ate-ocioso"], cwd=f"{APP_DIR}/services/motor")
                         for _ in range(WORKERS)]
                while any(p.poll() is None for p in procs):
                    if self._parar.wait(2):              # outro contêiner assumiu: entrega a fila para ele
                        for p in procs:
                            p.terminate()
                codigos = [p.wait() for p in procs]
                if not self._guardar() or not self._tem_pendente():
                    break
        finally:
            with self._trava:
                self._rodando = False
        # um POST pode ter enfileirado algo entre a última conferência e a trava acima: confere de novo
        if self._tem_pendente():
            self._acordar()
        return {"ok": all(c == 0 for c in codigos)}

    def _tem_pendente(self) -> bool:
        try:
            con = sqlite3.connect(os.environ["EDITOR_BANCO"])
            n = con.execute("SELECT COUNT(*) FROM jobs WHERE estado IN ('pendente','rodando')").fetchone()[0]
            con.close()
            return n > 0
        except sqlite3.Error:
            return False

    @modal.asgi_app(label="editor-creat-motor")
    def api(self):
        if not os.environ.get("MOTOR_TOKEN", "").strip():
            raise RuntimeError("MOTOR_TOKEN vazio no Secret editor-creat: o motor não sobe aberto na internet")
        from motor.api.app import criar
        web = criar()
        motor = self

        @web.middleware("http")
        async def acordar_depois_de_escrever(request, call_next):
            resposta = await call_next(request)
            if (request.method in ("POST", "DELETE") and resposta.status_code < 400
                    and not request.url.path.endswith("/partes")):    # assinar partes não cria trabalho
                motor._acordar()
            return resposta

        return web
