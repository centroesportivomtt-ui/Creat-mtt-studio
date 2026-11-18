"""Roteador CPU/GPU e render na Modal em modo fixture: a "Modal" é um módulo falso cuja função remota roda
render_modal.executar_remoto aqui mesmo (com o pedido serializado como iria pela rede). Mídia sintética pequena."""
import json
import logging
import pathlib
import pickle
import subprocess
import sys
import types

import numpy as np
import pytest

FMT = {"w": 270, "h": 480, "fps": 30}


def _fonte(destino: pathlib.Path, dur: float = 12.0) -> pathlib.Path:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s=640x360:r=30:d={dur}",
                    "-c:v", "libx264", "-g", "15", "-keyint_min", "15", "-sc_threshold", "0", "-pix_fmt", "yuv420p", str(destino)],
                   check=True)
    return destino


def _plano(pid, s0, t0, t1, fonte="a"):
    return {"id": pid, "t0": t0, "t1": t1, "fonte": fonte, "s0": s0, "vel": 1.0, "estab": "nao", "cor": "neutro",
            "enquadre": [[0, 1.0, 0.5, 0.5], [1, 1.1, 0.5, 0.5]]}


@pytest.fixture()
def edl(tmp_path):
    src = _fonte(tmp_path / "fonte.mp4")
    return {"formato": FMT, "duracao": 1.2, "fontes": {"a": {"chave": str(src), "offset": 0}},
            "planos": [_plano("P1", 1.0, 0.0, 0.6), _plano("P2", 9.0, 0.6, 1.2)]}


@pytest.fixture()
def cfg_gpu(dados, monkeypatch):
    monkeypatch.setenv("EDITOR_RENDER", "modal")
    monkeypatch.setenv("MODAL_TOKEN_ID", "falso")
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "falso")
    from motor import config
    return config.carregar()


class _Remota:
    def __init__(self):
        self.pedidos = []

    def remote(self, pedido):
        from motor.provedores.render_modal import executar_remoto
        pedido = pickle.loads(pickle.dumps(pedido))          # como se atravessasse a rede
        self.pedidos.append(pedido)
        return pickle.loads(pickle.dumps(executar_remoto(pedido, workers=1)))


@pytest.fixture()
def modal_falso(monkeypatch):
    remota = _Remota()
    m = types.ModuleType("modal")
    m.nomes = []

    class Function:
        @staticmethod
        def from_name(app, nome):
            m.nomes.append((app, nome))
            return remota
    m.Function = Function
    monkeypatch.setitem(sys.modules, "modal", m)
    m.remota = remota
    return m


def _quadros(arq):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(arq), "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(-1, FMT["h"], FMT["w"])


# ---------------------------------------------------------------- decisão
def test_decide_cpu_quando_gpu_desligada(dados, monkeypatch):
    from motor import config
    from motor.provedores.render_roteador import decidir
    grande = {"duracao": 600, "planos": [{"fonte": "a", "t1": 600}]}
    monkeypatch.setenv("EDITOR_RENDER", "cpu")
    d = decidir(grande, config.carregar(), resolucoes={"a": (3840, 2160)})
    assert d.alvo == "cpu" and "desligada" in d.motivo
    monkeypatch.setenv("EDITOR_RENDER", "modal")
    monkeypatch.delenv("MODAL_TOKEN_SECRET", raising=False)
    d = decidir(grande, config.carregar(), resolucoes={"a": (3840, 2160)})
    assert d.alvo == "cpu" and "MODAL_TOKEN_SECRET" in d.motivo


def test_decide_pelo_tamanho_nos_dois_sentidos(cfg_gpu, monkeypatch):
    from motor.provedores.render_roteador import LIMITE_PADRAO_S, decidir
    monkeypatch.delenv("EDITOR_GPU_LIMITE_S", raising=False)
    reel = {"duracao": 30, "planos": [{"fonte": "a", "t1": 30}]}
    filme_4k = {"duracao": 110, "planos": [{"fonte": "a", "t1": 60}, {"fonte": "b", "t1": 110}]}
    d = decidir(reel, cfg_gpu, resolucoes={"a": (1080, 1920)})
    assert d.alvo == "cpu" and d.peso_s == 30 and d.limite_s == LIMITE_PADRAO_S
    d = decidir(filme_4k, cfg_gpu, resolucoes={"a": (1080, 1920), "b": (2160, 3840)})
    assert d.alvo == "gpu" and d.fator_resolucao == 4.0 and d.peso_s == 440
    d = decidir(reel, cfg_gpu, resolucoes={"a": (2160, 3840)})              # 30 s em 4K = 120: no limite vai para a GPU
    assert d.alvo == "gpu"
    monkeypatch.setenv("EDITOR_GPU_LIMITE_S", "500")
    assert decidir(filme_4k, cfg_gpu, resolucoes={"b": (2160, 3840)}).alvo == "cpu"
    monkeypatch.setenv("EDITOR_GPU_LIMITE_S", "abc")                          # valor ruim: padrão
    assert decidir(reel, cfg_gpu).limite_s == LIMITE_PADRAO_S


def test_fator_mede_a_fonte_local(cfg_gpu, edl):
    from motor.etapas.montagem.comum import Fontes
    from motor.provedores.render_roteador import duracao_do_edl, fator_resolucao
    assert fator_resolucao(edl, Fontes(edl, None, None)) == 1.0             # 640x360 < 1080p: mínimo 1
    sem = dict(edl, duracao=None)
    assert duracao_do_edl(sem) == 1.2


# ---------------------------------------------------------------- GPU (Modal falsa)
def test_gpu_renderiza_igual_a_cpu_enviando_so_trechos(cfg_gpu, edl, tmp_path, monkeypatch, modal_falso):
    from motor.etapas.montagem import planos as PL
    from motor.etapas.montagem.comum import Fontes
    from motor.provedores import render_roteador as RR
    monkeypatch.setenv("EDITOR_GPU_LIMITE_S", "0")
    fontes = Fontes(edl, None, None)
    res = RR.renderizar_planos(edl, fontes, tmp_path / "cache_gpu", cfg=cfg_gpu, workers=1, nice=0)
    assert RR.renderizar_planos.ultima["usado"] == "gpu"
    assert modal_falso.nomes == [("editor-motor", "render_gpu")]
    (pedido,) = modal_falso.remota.pedidos
    assert set(pedido["edl"]) == {"formato", "fontes", "planos"}                    # EDL reduzido
    assert len(pedido["trechos"]) == 2                                              # 1 s e 9 s: longe, 2 trechos
    tam_fonte = pathlib.Path(edl["fontes"]["a"]["chave"]).stat().st_size
    assert pedido["bytes_enviados"] < tam_fonte * 0.6
    assert all(f["offset"] > 0 or n.endswith("t0") for n, f in pedido["edl"]["fontes"].items())
    cpu = PL.renderizar(edl, fontes, tmp_path / "cache_cpu", workers=1, nice=0)
    for pid in ("P1", "P2"):
        assert res[pid]["info"]["render"] == "modal"
        a, b = _quadros(res[pid]["arquivo"]), _quadros(cpu[pid]["arquivo"])
        assert a.shape == b.shape == (18, FMT["h"], FMT["w"])
        assert np.abs(a.astype(int) - b).mean() < 1.0                               # mesmos quadros da fonte
        assert pathlib.Path(res[pid]["arquivo"]).name == pathlib.Path(cpu[pid]["arquivo"]).name   # mesma chave de cache
    # segunda vez: tudo no cache, nada vai para a GPU
    res2 = RR.renderizar_planos(edl, fontes, tmp_path / "cache_gpu", cfg=cfg_gpu, workers=1, nice=0)
    assert all(r["cache"] for r in res2.values()) and len(modal_falso.remota.pedidos) == 1


def test_gpu_via_armazenamento_limpa_temporarios(cfg_gpu, edl, tmp_path, modal_falso):
    from motor.etapas.montagem.comum import Fontes
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    from motor.provedores.render_modal import RenderModal, executar_remoto
    arm = ArmazenamentoLocal(cfg_gpu)
    fontes = Fontes(edl, arm, cfg_gpu.dados)
    gpu = RenderModal(cfg_gpu, via="armazenamento")
    vistos = []

    def remota(pedido):            # o contêiner GPU lê/grava no MESMO armazenamento (R2 em produção)
        vistos.append(pedido)
        return executar_remoto(pedido, arm=arm, workers=1)
    modal_falso.remota.remote = remota
    res = gpu.renderizar(edl, fontes, tmp_path / "cache", ids={"P2"})
    assert set(res) == {"P2"} and pathlib.Path(res["P2"]["arquivo"]).is_file()
    (ped,) = vistos
    assert all(set(t) == {"chave"} and t["chave"].startswith("tmp/gpu/") for t in ped["trechos"].values())   # nada em bytes
    assert list(arm.listar("tmp/gpu")) == []                                         # trechos e saídas apagados


def test_cai_na_cpu_sem_pacote_modal(cfg_gpu, edl, tmp_path, monkeypatch, caplog):
    from motor.etapas.montagem.comum import Fontes
    from motor.provedores import render_roteador as RR
    monkeypatch.setenv("EDITOR_GPU_LIMITE_S", "0")
    monkeypatch.setitem(sys.modules, "modal", None)
    with caplog.at_level(logging.WARNING, logger="motor.render"):
        res = RR.renderizar_planos(edl, Fontes(edl, None, None), tmp_path / "c", cfg=cfg_gpu, workers=1, nice=0)
    assert RR.renderizar_planos.ultima["usado"] == "cpu" and "caiu na CPU" in RR.renderizar_planos.ultima["motivo"]
    assert "pacote 'modal'" in caplog.text
    assert all(pathlib.Path(r["arquivo"]).is_file() for r in res.values())


def test_cai_na_cpu_quando_a_gpu_falha_ou_pedido_grande(cfg_gpu, edl, tmp_path, monkeypatch, modal_falso):
    from motor.etapas.montagem.comum import Fontes
    from motor.provedores import render_roteador as RR
    monkeypatch.setenv("EDITOR_GPU_LIMITE_S", "0")
    monkeypatch.setenv("EDITOR_GPU_BYTES_MAX_MB", "0.001")                           # trechos não cabem: recusa
    res = RR.renderizar_planos(edl, Fontes(edl, None, None), tmp_path / "c1", cfg=cfg_gpu, workers=1, nice=0)
    assert RR.renderizar_planos.ultima["usado"] == "cpu" and "ModalIndisponivel" in RR.renderizar_planos.ultima["motivo"]
    assert modal_falso.remota.pedidos == [] and len(res) == 2
    monkeypatch.delenv("EDITOR_GPU_BYTES_MAX_MB")

    class Quebrada:
        def renderizar(self, *a, **k):
            raise ConnectionError("Modal fora do ar")
    RR.renderizar_planos(edl, Fontes(edl, None, None), tmp_path / "c2", cfg=cfg_gpu, gpu=Quebrada(), workers=1, nice=0)
    assert RR.renderizar_planos.ultima["usado"] == "cpu" and "ConnectionError" in RR.renderizar_planos.ultima["motivo"]


def test_render_modal_exige_tokens(dados, monkeypatch):
    from motor import config
    from motor.provedores.render_modal import ModalIndisponivel, RenderModal
    monkeypatch.delenv("MODAL_TOKEN_ID", raising=False)
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "x")
    with pytest.raises(ModalIndisponivel, match="MODAL_TOKEN_ID"):
        RenderModal(config.carregar())
    assert RenderModal.implementado is True


def test_remoto_recusa_pedido_estranho(tmp_path):
    from motor.provedores.render_modal import executar_remoto
    with pytest.raises(ValueError):
        executar_remoto({"versao": 99})
    ped = {"versao": 1, "id": "x", "via": "bytes", "ids": ["P"], "edl": {"formato": FMT, "fontes": {"a": {"chave": "a"}}, "planos": []},
           "trechos": {"../fora": {"bytes": b"00"}}}
    with pytest.raises(ValueError, match="trecho inesperado"):
        executar_remoto(ped)


def test_trecho_comeca_no_quadro_chave_e_preserva_tempo(tmp_path):
    from motor.etapas.montagem.comum import meta
    from motor.etapas.montagem.planos import ler
    from motor.provedores.render_modal import cortar_trecho, quadro_chave_antes
    src = _fonte(tmp_path / "s.mp4", dur=4.0)
    assert quadro_chave_antes(src, 1.3) == pytest.approx(1.0)
    assert quadro_chave_antes(src, 0.0) == 0.0
    k = cortar_trecho(src, 1.3, 2.4, tmp_path / "t.mp4")
    mt, ms = meta(tmp_path / "t.mp4"), meta(src)
    assert k == pytest.approx(1.0) and mt.start == 0.0
    for j in (0, 12, 30):
        a = next(ler(tmp_path / "t.mp4", mt, j, 1, "null", 640, 360, 1, nice=0))
        b = next(ler(src, ms, int(round(k * 30)) + j, 1, "null", 640, 360, 1, nice=0))
        assert np.array_equal(a, b)


def test_roteador_cumpre_protocolo_render(dados):
    from motor import config
    from motor.provedores.base import Render
    from motor.provedores.render_modal import RenderModal
    from motor.provedores.render_roteador import RenderRoteador
    assert isinstance(RenderRoteador(config.carregar()), Render)
    assert all(hasattr(RenderModal, m) for m in ("planos", "overlay", "compor")) and RenderModal.nome == "modal"
    json.dumps(RenderRoteador.__doc__)


# ---------------------------------------------------------------- NVENC (contêiner GPU) e ligação na montagem
def test_nvenc_so_muda_a_linha_de_comando_com_a_variavel(monkeypatch):
    from motor.etapas.montagem import planos as PL
    from motor.etapas.montagem.comum import Meta
    m = Meta(640, 360, 30.0, 0.0, 300, 10.0, 0, "tv", True, False)
    monkeypatch.delenv("EDITOR_NVENC", raising=False)
    cpu_enc, cpu_ler = PL.cmd_encode(270, 480, 30, "/tmp/x.mp4", nice=0), PL.cmd_leitura("/a.mp4", m, 10, 5, "null", 3, nice=0)
    assert "libx264" in cpu_enc and "-crf" in cpu_enc and "h264_nvenc" not in cpu_enc
    assert "-hwaccel" not in cpu_ler
    # a CPU continua idêntica à linha de antes da GPU existir
    assert cpu_enc == ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", "270x480", "-r", "30",
                       "-i", "-", "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset",
                       "veryfast", "-crf", "14", "-g", "30", "-threads", "2", "-colorspace", "bt709", "-color_primaries", "bt709",
                       "-color_trc", "bt709", "-color_range", "tv", "-f", "mp4", "/tmp/x.mp4"]
    monkeypatch.setenv("EDITOR_NVENC", "1")
    gpu_enc, gpu_ler = PL.cmd_encode(270, 480, 30, "/tmp/x.mp4", nice=0), PL.cmd_leitura("/a.mp4", m, 10, 5, "null", 3, nice=0)
    assert "h264_nvenc" in gpu_enc and "libx264" not in gpu_enc and "-crf" not in gpu_enc
    assert gpu_ler[gpu_ler.index("-hwaccel") + 1] == "cuda" and gpu_ler.index("-hwaccel") < gpu_ler.index("-i")
    assert [x for x in gpu_ler if x not in ("-hwaccel", "cuda")] == cpu_ler
    monkeypatch.setenv("EDITOR_NVENC", "0")
    assert PL.cmd_encode(270, 480, 30, "/tmp/x.mp4", nice=0) == cpu_enc


def test_montagem_usa_o_roteador_e_registra_a_decisao(dados, monkeypatch):
    import motor.etapas.montagem as M
    from motor.provedores import render_roteador as RR
    chamadas = []

    def falso(edl, fontes, cache, *, cfg=None, **kw):
        chamadas.append(kw)
        RR.renderizar_planos.ultima = {"alvo": "cpu", "usado": "cpu", "motivo": "teste"}
        raise RuntimeError("parar aqui")
    monkeypatch.setattr(RR, "renderizar_planos", falso)
    monkeypatch.setattr(M.OV, "renderizar", lambda *a, **k: {})
    monkeypatch.setattr(M, "validar_edl", lambda edl: None)
    monkeypatch.setattr(M.VZ, "montar_voz", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("sem áudio")))
    from motor import config
    with pytest.raises(RuntimeError, match="parar aqui"):
        M.montar({"planos": [], "fontes": {}}, dados / "t", None, config.carregar())
    assert chamadas and {"workers", "nice", "janela", "progresso"} <= set(chamadas[0])
    import inspect
    fonte = inspect.getsource(M.montar)
    assert "RR.renderizar_planos" in fonte and '"render_planos": render_planos' in fonte
