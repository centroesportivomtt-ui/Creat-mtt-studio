"""Frente A: unidades puras (sem ffmpeg pesado nem modelo)."""
import io
import zipfile

import numpy as np
import pytest

from motor import importar
from motor.etapas import analise as an
from motor.etapas import ingest as ing
from motor.provedores import transcricao_fw as fw
from motor.provedores.armazenamento_local import ArmazenamentoLocal, ChaveInvalida, validar_chave
from motor.provedores.transcricao_scribe import converter_resposta
from motor.provedores.visao_local import momentos_heuristicos


# ---------- armazenamento
@pytest.mark.parametrize("ruim", ["", "/abs/x", "../x", "a/../b", "a//b", "a\\b", "a/./b", "x\x00y"])
def test_chave_invalida(ruim):
    with pytest.raises(ChaveInvalida):
        validar_chave(ruim)


def test_armazenamento_local_ciclo(dados):
    from motor import config
    arm = ArmazenamentoLocal(config.carregar())
    arm.gravar_bytes("entrada/p1/a001.mov", b"x" * 10)
    arm.gravar_json("derivados/p1/a001/ingest.json", {"ok": 1})
    assert arm.existe("entrada/p1/a001.mov") and arm.tamanho("entrada/p1/a001.mov") == 10
    assert arm.ler_json("derivados/p1/a001/ingest.json") == {"ok": 1}
    assert list(arm.listar("derivados/p1/")) == ["derivados/p1/a001/ingest.json"]
    assert arm.url("saidas/p1/v1/final.mp4") == "/v1/arquivos/saidas/p1/v1/final.mp4"
    arm.apagar("entrada/p1/a001.mov")
    assert not arm.existe("entrada/p1/a001.mov")
    eid = arm.iniciar_multipart("entrada/p1/a002.mov")
    arm.gravar_parte(eid, 2, io.BytesIO(b"BB"))
    arm.gravar_parte(eid, 1, io.BytesIO(b"AA"))
    arm.concluir_multipart("entrada/p1/a002.mov", eid, [{"parte": 2}, {"parte": 1}])
    assert arm.caminho_local("entrada/p1/a002.mov").read_bytes() == b"AABB"


# ---------- importar
@pytest.mark.parametrize("url,esperado,tipo", [
    ("https://www.dropbox.com/scl/fi/abc/video.mov?rlkey=k&dl=0", "dl=1", "arquivo"),
    ("https://www.dropbox.com/s/abc/video.mov?raw=1", "dl=1", "arquivo"),
    ("https://www.dropbox.com/scl/fo/abc/xyz?rlkey=k&dl=0", "dl=1", "pasta_zip"),
    ("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing", "id=1AbCdEfGhIjKlMnOp&export=download&confirm=t", "arquivo"),
    ("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp", "drive.usercontent.google.com", "arquivo"),
])
def test_link_direto(url, esperado, tipo):
    u, t = importar.link_direto(url)
    assert esperado in u and t == tipo and u.startswith("https://")
    assert "raw=" not in u


@pytest.mark.parametrize("url", ["http://www.dropbox.com/s/a/b.mov", "https://evil.com/x.mov", "https://dropbox.com.evil.com/s/a",
                                 "https://drive.google.com/drive/folders/1AbCdEfGhIjKl", "https://drive.google.com/file/d/x/view",
                                 "https://169.254.169.254/latest"])
def test_link_recusado(url):
    with pytest.raises(importar.ErroImportacao):
        importar.link_direto(url)


def test_zip_so_midia_e_sem_zip_slip(tmp_path):
    z = tmp_path / "p.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("../../fora.mov", b"v1")
        f.writestr("pasta/IMG_1.MOV", b"v2")
        f.writestr("leiame.txt", b"t")
        f.writestr("__MACOSX/.IMG_1.MOV", b"lixo")
    out = importar.videos_do_zip(z, tmp_path)
    assert [n for _, n in out] == ["fora.mov", "IMG_1.MOV"]
    assert all(p.parent == tmp_path for p, _ in out)
    assert not (tmp_path.parent / "fora.mov").exists()


def test_zip_bomba_recusado(tmp_path):
    z = tmp_path / "b.zip"
    with zipfile.ZipFile(z, "w", compression=zipfile.ZIP_DEFLATED) as f:
        f.writestr("a.mov", b"\0" * 200_000)
    with pytest.raises(importar.ErroImportacao):
        importar.videos_do_zip(z, tmp_path, max_bytes=100_000)


def test_nome_do_content_disposition():
    assert importar._nome_de("attachment; filename*=UTF-8''v%C3%ADdeo%201.mov", "https://x/y") == "vídeo 1.mov"
    assert importar._nome_de('attachment; filename="../a/b.mov"', "https://x/y") == "_a_b.mov"


# ---------- ingest
def _probe(rot=None, w=3840, h=2160, transfer="bt709", tags=None):
    v = {"codec_type": "video", "codec_name": "hevc", "width": w, "height": h, "avg_frame_rate": "30000/1001", "color_transfer": transfer}
    if rot is not None:
        v["side_data_list"] = [{"side_data_type": "Display Matrix", "rotation": rot}]
    return {"streams": [v, {"codec_type": "audio", "codec_name": "aac"}], "format": {"duration": "12.5", "tags": tags or {}}}


@pytest.mark.parametrize("rot,esp,wh", [(-90, -90, (2160, 3840)), (90, 90, (2160, 3840)), (180, 180, (3840, 2160)),
                                        (-180, 180, (3840, 2160)), (-270, 90, (2160, 3840)), (None, 0, (3840, 2160))])
def test_rotacao(rot, esp, wh):
    m = ing.ler_midia(_probe(rot))
    assert m["rotacao"] == esp and (m["w"], m["h"]) == wh and m["fps"] == 29.97


def test_hdr_e_sem_video():
    assert ing.ler_midia(_probe(-90, transfer="arib-std-b67"))["hdr"] is True
    m = ing.ler_midia({"streams": [{"codec_type": "audio", "codec_name": "aac"}], "format": {"duration": "3"}})
    assert m["tem_video"] is False and m["w"] is None and m["rotacao"] == 0


def test_gravado_em():
    assert ing.gravado_em(_probe(tags={"com.apple.quicktime.creationdate": "2026-11-15T09:48:57-0300"}), "x.mov") == "2026-11-15T09:48:57-03:00"
    assert ing.gravado_em(_probe(), "2026-11-15 09.48.57.mov") == "2026-11-15T09:48:57"
    assert ing.gravado_em(_probe(), "20261115_094857.mov") == "2026-11-15T09:48:57"
    assert ing.gravado_em(_probe(tags={"creation_time": "2026-11-15T12:48:57.000000Z"}), "IMG.MOV") == "2026-11-15T12:48:57Z"


# ---------- análise
def test_picos_e_fala_pct():
    db = np.full(400, -40.0, dtype=np.float32)
    db[100], db[101], db[300] = -6.0, -8.0, -10.0
    assert an.picos(db) == [[5.0, -6.0], [15.0, -10.0]]
    assert an.fala_pct([{"s": 0, "e": 2}, {"s": 1, "e": 3}, {"s": 8, "e": 10}], 10.0) == 0.5


def _seg(s, e, txt, p=0.9):
    return {"s": s, "e": e, "texto": txt, "falante": None, "conf": p, "palavras": [[s, e, w, p] for w in txt.split()]}


def test_filtro_de_alucinacao():
    db = np.full(400, -20.0, dtype=np.float32)
    db[200:260] = -70.0                                    # silêncio de 10 a 13 s
    segs = [_seg(0, 2, "pessoal que vai competir"),
            _seg(2, 3, "marcos"), _seg(3, 4, "marcos"), _seg(4, 5, "marcos"),      # laço de segmentos iguais
            _seg(5, 7, "o que é o que é o que é o que é o que é"),                  # laço de n-grama
            _seg(7, 8, "..."), _seg(8, 9, "ме"), _seg(9, 9.8, "nowhere", 0.0),
            _seg(10.2, 12, "legendas pela comunidade amara.org"),
            _seg(10.5, 12.5, "fala no silêncio"),
            _seg(14, 16, "vai vai vai vai")]                                         # grito de torcida fica
    out = an.filtrar_transcricao({"provedor": "faster-whisper", "modelo": "small", "idioma": "pt", "vad": False, "segmentos": segs}, db)
    assert [s["texto"] for s in out["segmentos"]] == ["pessoal que vai competir", "vai vai vai vai"]


def test_segmentar_palavras_e_scribe():
    ws = [[0.0, 0.3, "Oi", 0.9], [0.3, 0.6, "gente.", 0.9], [2.0, 2.4, "Bora", 0.8, "F1"], [2.4, 2.8, "lá", 0.8, "F1"]]
    segs = fw.segmentar_palavras(ws)
    assert [s["texto"] for s in segs] == ["Oi gente.", "Bora lá"] and segs[1]["falante"] == "F1"
    r = converter_resposta({"words": [{"text": "Oi", "start": 0, "end": 0.3, "type": "word", "speaker_id": "speaker_0", "logprob": -0.1},
                                      {"text": " ", "start": 0.3, "end": 0.35, "type": "spacing"},
                                      {"text": "pessoal", "start": 0.35, "end": 0.9, "type": "word", "speaker_id": "speaker_0", "logprob": -0.2}]}, "pt", "scribe_v1")
    assert r["vad"] is False and r["segmentos"][0]["texto"] == "Oi pessoal" and r["segmentos"][0]["falante"] == "F0"


def test_momentos_heuristicos_validos():
    ctx = {"midia": {"duracao": 20.0, "tem_video": True, "w": 1080, "h": 1920},
           "transcricao": {"segmentos": [_seg(1, 4, "a gente veio aqui pra cobrir o evento")]},
           "sinais": {"tremor": {"media_px": 5.0, "trechos": [[10.0, 12.0, 90.0]]}, "cenas": [{"t0": 0, "t1": 20, "ambiente": "quente-medio", "luz": 0.5}],
                      "rostos": [{"t": 2.0, "caixas": [[0.4, 0.3, 0.1, 0.06, 0.9]]}], "telas": []},
           "picos": [[15.0, -5.0]], "fala_pct": 0.15}
    v = momentos_heuristicos(ctx)
    tipos = [m["tipo"] for m in v["momentos"]]
    assert "fala" in tipos and "broll" in tipos and "impacto" in tipos
    assert all(1 <= m["nota"] <= 5 and m["t1"] > m["t0"] for m in v["momentos"])
    assert "rosto em quadro" in v["momentos"][0]["desc"]


def test_link_de_transferencia_do_dropbox_explica_o_que_fazer():
    import pytest
    from motor import importar
    with pytest.raises(importar.ErroImportacao, match="Copiar link"):
        importar.link_direto("https://www.dropbox.com/t/AbCdEf123")
    u, tipo = importar.link_direto("https://www.dropbox.com/scl/fo/abc/xyz?rlkey=k&st=s&dl=0")   # vários vídeos = pasta
    assert tipo == "pasta_zip" and "dl=1" in u
