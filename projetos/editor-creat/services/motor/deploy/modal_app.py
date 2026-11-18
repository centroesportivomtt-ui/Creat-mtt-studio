"""Motor do Editor creat.MTT na Modal (app "editor-motor"). SEM ESTADO LOCAL: fila/eventos no Postgres (Supabase),
arquivos no R2; o disco do contêiner (/tmp) é só rascunho e some a cada reinício.

Publicar (só com autorização do dono, é PAGO por segundo de uso):
    instalar o cliente modal 1.x com versão exata (passo 1 do DEPLOY.md) e rodar: modal token new
    modal secret create editor-motor ...        (lista exata em projetos/editor-creat/DEPLOY.md)
    cd projetos/editor-creat/services/motor && modal deploy deploy/modal_app.py

Funções:
  api         FastAPI do motor (motor.api.app:criar) atrás de @modal.asgi_app(). A URL vira MOTOR_URL no site.
  trabalhar   worker até a fila esvaziar (python -m motor.worker --ate-ocioso). A API dispara ao enfileirar
              (EDITOR_MODAL_WORKER=1, worker.acordar_remoto).
  vigia       agendamento de segurança (modal.Period): recolhe aluguéis vencidos / jobs órfãos e acorda `trabalhar`.
  render_gpu  planos de filmes grandes numa L4 (NVDEC/NVENC); chamada por provedores/render_modal.py via
              modal.Function.from_name("editor-motor", "render_gpu").

Secret "editor-motor" (Modal > Secrets), variáveis esperadas — nomes, nunca valores no repositório:
  obrigatórias: MOTOR_TOKEN, EDITOR_ARMAZENAMENTO=r2, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
                EDITOR_BANCO=postgres, DATABASE_URL
  cérebro:      EDITOR_CEREBRO=anthropic, ANTHROPIC_API_KEY (sem elas: direção fixture)
  GPU:          EDITOR_RENDER=modal, MODAL_TOKEN_ID, MODAL_TOKEN_SECRET (sem elas: tudo na CPU), EDITOR_GPU_LIMITE_S
  opcionais:    EDITOR_TRANSCRICAO, EDITOR_WHISPER_MODELO, ELEVENLABS_API_KEY, EDITOR_VISAO, GEMINI_API_KEY,
                EDITOR_PUBLICACAO, METRICOOL_TOKEN, META_ACCESS_TOKEN, EDITOR_MODELO_DIRECAO, EDITOR_MODELO_LEVE,
                EDITOR_ESFORCO_DIRECAO, EDITOR_ORCAMENTO_ENTRADA, EDITOR_ORCAMENTO_SAIDA, EDITOR_AUTORIZADO_PAGO
  (EDITOR_DADOS, EDITOR_SEM_ESTADO, EDITOR_MODAL_WORKER, EDITOR_MEMORIA, EDITOR_TRILHAS, EDITOR_FALANTES_DIR,
   EDITOR_YUNET e PLAYWRIGHT_BROWSERS_PATH já vêm da imagem, abaixo.)

O pacote `modal` NÃO é dependência do motor: sem ele este arquivo importa, mas não define nada (`app is None`).
"""
from __future__ import annotations

import pathlib
import shutil

try:  # import protegido: a Modal só existe na máquina de quem publica e dentro dos contêineres
    import modal
except ModuleNotFoundError:  # pragma: no cover - depende do ambiente
    modal = None

APP_NOME = "editor-motor"
SECRET_NOME = "editor-motor"
VOLUME_NOME = "editor-motor-estado"
PYTHON = "3.12"
GPU = "L4"                      # NVENC existe em L4/L40S/A10 (não em A100/H100): ARQUITETURA.md §0
VIGIA_MIN = 5

VARIAVEIS_OBRIGATORIAS = ("MOTOR_TOKEN", "EDITOR_ARMAZENAMENTO", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
                          "R2_BUCKET", "EDITOR_BANCO", "DATABASE_URL")
VARIAVEIS_OPCIONAIS = ("EDITOR_CEREBRO", "ANTHROPIC_API_KEY", "EDITOR_RENDER", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET",
                       "EDITOR_GPU_LIMITE_S", "EDITOR_TRANSCRICAO", "EDITOR_WHISPER_MODELO", "ELEVENLABS_API_KEY", "EDITOR_VISAO",
                       "GEMINI_API_KEY", "EDITOR_PUBLICACAO", "METRICOOL_TOKEN", "META_ACCESS_TOKEN", "EDITOR_MODELO_DIRECAO",
                       "EDITOR_MODELO_LEVE", "EDITOR_ESFORCO_DIRECAO", "EDITOR_ORCAMENTO_ENTRADA", "EDITOR_ORCAMENTO_SAIDA",
                       "EDITOR_AUTORIZADO_PAGO")

# Layout dentro da imagem = layout do repositório (config.RAIZ_REPO = parents[3] de motor/config.py = /app).
# Dentro do contêiner este arquivo é montado sozinho (ex.: /root/modal_app.py): os caminhos locais só valem na máquina
# de quem publica, por isso nada aqui pode quebrar quando eles não existem.
_AQUI = pathlib.Path(__file__).resolve()
MOTOR_LOCAL = _AQUI.parents[1] if len(_AQUI.parents) > 2 else _AQUI.parent    # services/motor
RAIZ_LOCAL = MOTOR_LOCAL.parents[1] if len(MOTOR_LOCAL.parents) > 1 else MOTOR_LOCAL  # projetos/editor-creat
RAIZ_IMG = "/app"
ESTADO = "/estado"              # Volume pequeno: memória da casa, trilhas e perfis de falante (JSON). Ver DEPLOY.md.

AMBIENTE_IMAGEM = {
    "PYTHONPATH": f"{RAIZ_IMG}/services/motor",
    "EDITOR_DADOS": "/tmp/editor-dados",             # só rascunho e cache (some com o contêiner)
    "EDITOR_RASCUNHO": "/tmp",
    "EDITOR_SEM_ESTADO": "1",                        # worker/app recusam subir sem R2 + Postgres + token
    "EDITOR_MODAL_WORKER": "1",                      # a API acorda `trabalhar` ao enfileirar
    "EDITOR_MODAL_APP": APP_NOME,
    "EDITOR_MEMORIA": f"{ESTADO}/memoria",
    "EDITOR_TRILHAS": f"{ESTADO}/biblioteca/trilhas.json",
    "EDITOR_FALANTES_DIR": f"{ESTADO}/biblioteca/falantes",
    "EDITOR_YUNET": "/opt/editor/modelos/face_detection_yunet_2023mar.onnx",
    "EDITOR_MODELOS_BAIXAR": "0",
    "EDITOR_NICE": "0",
    "PLAYWRIGHT_BROWSERS_PATH": "/opt/pw-browsers",
    "HF_HOME": "/opt/editor/hf",
}

YUNET_URL = "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx"
NODE_MAIOR = "22"
PLAYWRIGHT = "1.63.0"
KIT_DEPS = "gsap@3.12.5 three@0.160.0"


def requisitos() -> list[str]:
    """Linhas de deploy/requisitos-modal.txt (versões exatas). No contêiner o arquivo não existe: lista vazia."""
    arq = MOTOR_LOCAL / "deploy" / "requisitos-modal.txt"
    if not arq.is_file():
        return []
    return [linha.split("#", 1)[0].strip() for linha in arq.read_text(encoding="utf-8").splitlines()
            if linha.split("#", 1)[0].strip()]


def construir_imagem():
    """Debian + ffmpeg + Node 22 + Chromium headless (Playwright) para o kit + dependências exatas do motor."""
    reqs = requisitos()
    return (
        modal.Image.debian_slim(python_version=PYTHON)
        .apt_install("ffmpeg", "curl", "ca-certificates", "gnupg", "libsndfile1", "fonts-dejavu-core", "fonts-noto-color-emoji")
        .run_commands(
            f"curl -fsSL https://deb.nodesource.com/setup_{NODE_MAIOR}.x | bash -",
            "apt-get install -y nodejs",
            f"npm install -g playwright@{PLAYWRIGHT}",
            f"PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx -y playwright@{PLAYWRIGHT} install --with-deps chromium chromium-headless-shell",
            f"mkdir -p /opt/editor/modelos && curl -fsSL -o /opt/editor/modelos/face_detection_yunet_2023mar.onnx {YUNET_URL}",
        )
        .pip_install(*reqs)
        .env(AMBIENTE_IMAGEM)
        # modelo de transcrição padrão dentro da imagem (sem baixar a cada contêiner)
        .run_commands("python -c \"from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')\"")
        .add_local_dir(str(RAIZ_LOCAL / "packages" / "kit"), f"{RAIZ_IMG}/packages/kit", copy=True,
                       ignore=["node_modules", "**/*.mp4", "**/__pycache__"])
        .run_commands(f"cd {RAIZ_IMG}/packages/kit && npm install --no-save --no-audit --no-fund {KIT_DEPS} playwright@{PLAYWRIGHT}")
        .add_local_dir(str(RAIZ_LOCAL / "packages" / "schemas"), f"{RAIZ_IMG}/packages/schemas", copy=True, ignore=["node_modules"])
        .add_local_dir(str(RAIZ_LOCAL / "memoria"), f"{RAIZ_IMG}/memoria", copy=True)
        # código do motor por último (sem copy): mudar Python não refaz as camadas pesadas
        .add_local_dir(str(MOTOR_LOCAL / "motor"), f"{RAIZ_IMG}/services/motor/motor", ignore=["**/__pycache__", "**/*.pyc"])
    )


def preparar_estado(raiz_estado: str = ESTADO, memoria_semente: str = f"{RAIZ_IMG}/memoria") -> bool:
    """Primeira vez num Volume vazio: copia a memória versionada no git como semente. Devolve True se semeou."""
    destino = pathlib.Path(raiz_estado) / "memoria"
    if (destino / "regras.json").is_file():
        return False
    semente = pathlib.Path(memoria_semente)
    if semente.is_dir():
        shutil.copytree(semente, destino, dirs_exist_ok=True)
    (pathlib.Path(raiz_estado) / "biblioteca" / "falantes").mkdir(parents=True, exist_ok=True)
    return True


if modal is not None:
    app = modal.App(APP_NOME)
    imagem = construir_imagem()
    segredo = modal.Secret.from_name(SECRET_NOME)
    estado = modal.Volume.from_name(VOLUME_NOME, create_if_missing=True)
    comum = dict(image=imagem, secrets=[segredo], volumes={ESTADO: estado})

    @app.function(**comum, cpu=2.0, memory=2048, timeout=900, scaledown_window=300, min_containers=0)
    @modal.concurrent(max_inputs=40)
    @modal.asgi_app()
    def api():
        preparar_estado()
        from motor.api.app import criar
        return criar()

    @app.function(**comum, cpu=8.0, memory=16384, timeout=3600, max_containers=4)
    def trabalhar() -> int:
        """Worker até ocioso. Vários podem rodar juntos (a fila do Postgres usa FOR UPDATE SKIP LOCKED)."""
        estado.reload()
        preparar_estado()
        from motor import worker
        try:
            return worker.main(["--ate-ocioso", "--espera", "0.5"])
        finally:
            estado.commit()

    @app.function(**comum, cpu=0.25, memory=512, timeout=120, schedule=modal.Period(minutes=VIGIA_MIN))
    def vigia() -> dict:
        """Segurança: job pendente sem worker, ou aluguel vencido (contêiner morto), acorda `trabalhar`."""
        import time

        from motor import banco, config, worker
        cfg = config.carregar()
        con = banco.conectar(cfg.banco)
        try:
            mortos = worker.recolher_mortos(con)
            r = con.execute("SELECT COUNT(*) AS n FROM jobs WHERE estado='pendente' OR (estado='rodando' AND aluguel_ate < ?)",
                            (time.time(),)).fetchone()
            n = int(r["n"])
        finally:
            con.close()
        if n:
            trabalhar.spawn()
        return {"recolhidos": mortos, "a_fazer": n}

    @app.function(**comum, gpu=GPU, cpu=8.0, memory=16384, timeout=1800, max_containers=2)
    def render_gpu(pedido: dict) -> dict:
        import os
        os.environ["EDITOR_NVENC"] = "1"      # planos.py usa h264_nvenc quando suportar (pedido no relatório da fase 2)
        from motor.provedores.render_modal import executar_remoto
        return executar_remoto(pedido)
else:
    app = None
