"""Deploy na Modal sem a Modal: um módulo `modal` FALSO em sys.modules confere a estrutura de deploy/modal_app.py
(funções, secret, volume, agendamento, GPU, imagem) e o lado "sem estado local" do motor (worker/app). Nada de rede."""
import importlib.util
import pathlib
import re
import sys
import threading
import time
import types

import pytest

MOTOR = pathlib.Path(__file__).resolve().parents[1]
ARQ_APP = MOTOR / "deploy" / "modal_app.py"


# ---------------------------------------------------------------- modal falso
class _Imagem:
    def __init__(self, passos=None):
        self.passos = list(passos or [])

    def __getattr__(self, nome):
        if nome.startswith("_"):
            raise AttributeError(nome)

        def passo(*a, **k):
            return _Imagem(self.passos + [(nome, a, k)])
        return passo

    def todos(self, nome):
        return [(a, k) for n, a, k in self.passos if n == nome]


class _Funcao:
    def __init__(self, fn, opcoes, decoradores):
        self.fn, self.opcoes, self.decoradores = fn, opcoes, decoradores
        self.disparos = 0

    def __call__(self, *a, **k):
        return self.fn(*a, **k)

    def spawn(self, *a, **k):
        self.disparos += 1


def modal_falso():
    m = types.ModuleType("modal")

    class App:
        def __init__(self, nome):
            self.nome, self.funcoes = nome, {}

        def function(self, **opcoes):
            def dec(fn):
                f = _Funcao(getattr(fn, "__wrapped_fn__", fn), opcoes, getattr(fn, "__decoradores__", []))
                self.funcoes[f.fn.__name__] = f
                return f
            return dec

    def _marca(rotulo):
        def fabrica(*a, **k):
            def dec(fn):
                base = getattr(fn, "__wrapped_fn__", fn)

                def emb(*x, **y):
                    return base(*x, **y)
                emb.__wrapped_fn__ = base
                emb.__decoradores__ = getattr(fn, "__decoradores__", []) + [(rotulo, a, k)]
                return emb
            return dec
        return fabrica

    class Image:
        @staticmethod
        def debian_slim(**k):
            return _Imagem([("debian_slim", (), k)])

    class Secret:
        @staticmethod
        def from_name(nome, **k):
            return ("secret", nome)

    class _Volume:
        def __init__(self, nome):
            self.nome, self.commits, self.reloads = nome, 0, 0

        def commit(self):
            self.commits += 1

        def reload(self):
            self.reloads += 1

    class Volume:
        @staticmethod
        def from_name(nome, **k):
            return _Volume(nome)

    class Period:
        def __init__(self, **k):
            self.k = k

    m.App, m.Image, m.Secret, m.Volume, m.Period = App, Image, Secret, Volume, Period
    m.asgi_app, m.concurrent = _marca("asgi_app"), _marca("concurrent")
    return m


def _carregar(monkeypatch, modulo_modal):
    monkeypatch.setitem(sys.modules, "modal", modulo_modal)
    spec = importlib.util.spec_from_file_location("modal_app_teste", ARQ_APP)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def app_modal(monkeypatch):
    return _carregar(monkeypatch, modal_falso())


# ---------------------------------------------------------------- estrutura
def test_sem_modal_importa_e_nao_define_nada(monkeypatch):
    monkeypatch.setitem(sys.modules, "modal", None)          # import modal -> ModuleNotFoundError
    spec = importlib.util.spec_from_file_location("modal_app_sem", ARQ_APP)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.modal is None and mod.app is None


def test_funcoes_secret_volume_agendamento_gpu(app_modal):
    a = app_modal.app
    assert a.nome == "editor-motor"
    assert set(a.funcoes) == {"api", "trabalhar", "vigia", "render_gpu"}
    for f in a.funcoes.values():
        assert ("secret", "editor-motor") in f.opcoes["secrets"]
        assert list(f.opcoes["volumes"]) == ["/estado"]
    api = a.funcoes["api"]
    assert [d[0] for d in api.decoradores] == ["concurrent", "asgi_app"] or [d[0] for d in api.decoradores] == ["asgi_app", "concurrent"]
    vig = a.funcoes["vigia"]
    assert vig.opcoes["schedule"].k == {"minutes": 5}
    gpu = a.funcoes["render_gpu"]
    assert gpu.opcoes["gpu"] == "L4" and gpu.opcoes["timeout"] >= 1200
    assert "gpu" not in a.funcoes["trabalhar"].opcoes and "gpu" not in api.opcoes
    assert a.funcoes["trabalhar"].opcoes["timeout"] >= 3600


def test_imagem_debian_ffmpeg_chromium_deps_e_codigo(app_modal):
    img = app_modal.imagem
    assert img.passos[0][0] == "debian_slim" and img.passos[0][2]["python_version"] == "3.12"
    apt = [x for a, _ in img.todos("apt_install") for x in a]
    assert "ffmpeg" in apt
    cmds = " ".join(x for a, _ in img.todos("run_commands") for x in a)
    assert "chromium-headless-shell" in cmds and "nodesource" in cmds and "gsap@3.12.5" in cmds and "three@0.160.0" in cmds
    pip = [x for a, _ in img.todos("pip_install") for x in a]
    nomes = {re.split(r"[\[=]", p)[0] for p in pip}
    assert {"boto3", "psycopg", "fastapi", "faster-whisper", "anthropic", "numpy", "opencv-python-headless"} <= nomes
    assert all(re.fullmatch(r"[A-Za-z0-9_.\-]+(\[[a-z,]+\])?==[0-9][0-9A-Za-z.]*", p) for p in pip), pip   # versão exata
    destinos = {a[1] for a, _ in img.todos("add_local_dir")}
    assert destinos == {"/app/services/motor/motor", "/app/packages/schemas", "/app/packages/kit", "/app/memoria"}
    for a, _ in img.todos("add_local_dir"):
        assert pathlib.Path(a[0]).is_dir(), a[0]
    env = {k: v for a, _ in img.todos("env") for k, v in a[0].items()}
    assert env["EDITOR_SEM_ESTADO"] == "1" and env["EDITOR_MODAL_WORKER"] == "1"
    assert env["EDITOR_DADOS"].startswith("/tmp/") and env["PYTHONPATH"] == "/app/services/motor"
    assert env["EDITOR_MEMORIA"] == "/app/memoria" and env["EDITOR_MEMORIA_REMOTA"] == "r2"   # memória no R2, imagem = semente
    assert env["EDITOR_TRILHAS"].startswith("/estado/")
    # nenhum segredo na imagem: só nomes no comentário/listas
    assert not any(k in env for k in app_modal.VARIAVEIS_OBRIGATORIAS + app_modal.VARIAVEIS_OPCIONAIS)


def test_lista_de_variaveis_cobre_o_que_o_motor_le(app_modal):
    todas = set(app_modal.VARIAVEIS_OBRIGATORIAS) | set(app_modal.VARIAVEIS_OPCIONAIS)
    for chave in ("R2_SECRET_ACCESS_KEY", "ELEVENLABS_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "MODAL_TOKEN_SECRET",
                  "METRICOOL_TOKEN", "META_ACCESS_TOKEN", "DATABASE_URL", "MOTOR_TOKEN"):
        assert chave in todas
    texto = ARQ_APP.read_text(encoding="utf-8")
    for v in app_modal.VARIAVEIS_OBRIGATORIAS:
        assert v in texto.split('"""')[1], f"{v} fora do comentário do secret"
    deploy = (MOTOR.parents[1] / "DEPLOY.md").read_text(encoding="utf-8")
    for v in todas:
        assert f"`{v}`" in deploy, f"{v} não está no DEPLOY.md"


def test_requisitos_exatos():
    linhas = [ln.split("#")[0].strip() for ln in (MOTOR / "deploy" / "requisitos-modal.txt").read_text().splitlines()]
    linhas = [ln for ln in linhas if ln]
    assert linhas and all("==" in ln and ">" not in ln and "<" not in ln for ln in linhas)


def test_preparar_estado_so_cria_a_biblioteca(app_modal, tmp_path):
    est = tmp_path / "estado"
    assert app_modal.preparar_estado(str(est)) is True
    assert (est / "biblioteca" / "falantes").is_dir() and not (est / "memoria").exists()
    assert app_modal.preparar_estado(str(est)) is False


def test_vigia_acorda_trabalhar_so_com_job(app_modal, dados):
    from motor import banco, config
    vig, trab = app_modal.app.funcoes["vigia"], app_modal.app.funcoes["trabalhar"]
    assert vig() == {"recolhidos": 0, "a_fazer": 0} and trab.disparos == 0
    con = banco.conectar(config.carregar().banco)
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p_vig1', 'x', 'a', 'a')")
    banco.enfileirar(con, "catalogo", "p_vig1")
    con.close()
    assert vig()["a_fazer"] == 1 and trab.disparos == 1


# ---------------------------------------------------------------- sem estado local
def _cfg():
    from motor import config
    return config.carregar()


def test_sem_estado_recusa_disco_local(dados, monkeypatch):
    from motor import worker
    assert worker.checar_sem_estado(_cfg()) == []                 # fora da nuvem não faz nada
    monkeypatch.setenv("EDITOR_SEM_ESTADO", "1")
    with pytest.raises(RuntimeError) as e:
        worker.checar_sem_estado(_cfg())
    assert "R2" in str(e.value) and "Postgres" in str(e.value) and "MOTOR_TOKEN" in str(e.value)


def test_sem_estado_aceita_r2_postgres_token(dados, monkeypatch):
    from motor import worker
    monkeypatch.setenv("EDITOR_SEM_ESTADO", "1")
    monkeypatch.setenv("EDITOR_ARMAZENAMENTO", "r2")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "falso")
    monkeypatch.setenv("EDITOR_BANCO", "postgres")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/x")   # não conecta: só confere o destino
    monkeypatch.setenv("MOTOR_TOKEN", "tok")
    monkeypatch.delenv("EDITOR_MEMORIA", raising=False)
    avisos = worker.checar_sem_estado(_cfg())
    assert any("EDITOR_MEMORIA" in a for a in avisos)
    monkeypatch.setenv("EDITOR_MEMORIA", "/estado/memoria")
    assert worker.checar_sem_estado(_cfg()) == []


def test_app_sem_estado_nao_sobe_com_disco_local(dados, monkeypatch):
    monkeypatch.setenv("EDITOR_SEM_ESTADO", "1")
    monkeypatch.setenv("MOTOR_TOKEN", "tok")
    from motor.api.app import criar
    with pytest.raises(RuntimeError, match="sem estado local"):
        criar()


@pytest.fixture()
def disparo_zerado(monkeypatch):
    from motor import worker
    monkeypatch.setitem(worker._DISPARO, "ultimo", 0.0)
    monkeypatch.setitem(worker._DISPARO, "timer", None)
    return worker


def test_acordar_remoto_desligado_e_sem_job(dados, monkeypatch, disparo_zerado):
    w = disparo_zerado
    chamadas = []
    monkeypatch.delenv("EDITOR_MODAL_WORKER", raising=False)
    assert w.acordar_remoto(_cfg(), contar=lambda c: 3, spawn=lambda: chamadas.append(1)) is False
    monkeypatch.setenv("EDITOR_MODAL_WORKER", "1")
    assert w.acordar_remoto(_cfg(), contar=lambda c: 0, spawn=lambda: chamadas.append(1)) is False
    assert chamadas == []


def test_acordar_remoto_com_intervalo_e_rechecagem(dados, monkeypatch, disparo_zerado):
    w = disparo_zerado
    monkeypatch.setenv("EDITOR_MODAL_WORKER", "1")
    monkeypatch.setenv("EDITOR_MODAL_WORKER_INTERVALO", "0.3")
    chamadas, pronto = [], threading.Event()

    def spawn():
        chamadas.append(time.monotonic())
        if len(chamadas) == 2:
            pronto.set()
    assert w.acordar_remoto(_cfg(), contar=lambda c: 1, spawn=spawn) is True
    assert w.acordar_remoto(_cfg(), contar=lambda c: 1, spawn=spawn) is False   # dentro do intervalo: agenda
    assert w.acordar_remoto(_cfg(), contar=lambda c: 1, spawn=spawn) is False   # não agenda duas vezes
    assert pronto.wait(3) and len(chamadas) == 2 and chamadas[1] - chamadas[0] >= 0.25


def test_acordar_remoto_falha_nao_derruba(dados, monkeypatch, disparo_zerado):
    w = disparo_zerado
    monkeypatch.setenv("EDITOR_MODAL_WORKER", "1")

    def quebra():
        raise ConnectionError("sem rede")
    assert w.acordar_remoto(_cfg(), contar=lambda c: 1, spawn=quebra) is False
    assert w._DISPARO["ultimo"] == 0.0                                 # pode tentar de novo na próxima requisição


def test_acordar_remoto_conta_pendentes_no_banco(dados):
    from motor import banco, worker
    cfg = _cfg()
    assert worker._pendentes(cfg) == 0
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p_pend1', 'x', 'a', 'a')")
    banco.enfileirar(con, "catalogo", "p_pend1")
    con.close()
    assert worker._pendentes(cfg) == 1


def test_middleware_acorda_so_depois_de_mudanca_bem_sucedida(dados, monkeypatch):
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    from motor import worker
    monkeypatch.setenv("MOTOR_TOKEN", "tok-teste")
    monkeypatch.setenv("EDITOR_MODAL_WORKER", "1")
    chamadas, evento = [], threading.Event()

    def acordar(cfg):
        chamadas.append(cfg)
        evento.set()
    monkeypatch.setattr(worker, "acordar_remoto", acordar)
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer tok-teste"})
    assert c.get("/v1/saude").status_code == 200
    assert c.post("/v1/projetos", json={"nome": "x"}, headers={"Authorization": "Bearer errado"}).status_code == 401
    time.sleep(0.1)
    assert chamadas == []
    assert c.post("/v1/projetos", json={"nome": "Projeto nuvem", "tipo_video": "bastidor"}).status_code == 201
    assert evento.wait(2) and len(chamadas) == 1


def test_sem_modal_worker_nao_tem_middleware(dados, monkeypatch):
    monkeypatch.setenv("MOTOR_TOKEN", "tok-teste")
    monkeypatch.delenv("EDITOR_MODAL_WORKER", raising=False)
    from motor.api.app import AcordarWorker, criar
    app = criar()
    assert not any(getattr(m, "cls", None) is AcordarWorker for m in app.user_middleware)
