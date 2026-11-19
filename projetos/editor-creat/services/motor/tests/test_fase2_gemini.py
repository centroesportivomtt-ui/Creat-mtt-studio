"""Fase 2: Gemini pelo Vertex (chave de API), com reserva de modelo em 404. Sem rede: urlopen simulado."""
import io
import json
import urllib.error

import pytest

from motor.provedores import visao_gemini
from motor.provedores.visao_gemini import VisaoGemini

RESPOSTA = {"candidates": [{"content": {"parts": [{"text": json.dumps({
    "resumo": "Marcos fala para a câmera", "pessoas": "1", "camera": "estável", "serve_para": "gancho",
    "momentos": [{"t0": 0.5, "t1": 3.0, "tipo": "fala_dono", "desc": "abre o vídeo", "nota": 5, "emocao": ""}]})}]}}]}

CTX = {"midia": {"duracao": 10.0, "w": 1080, "h": 1920}, "fala_pct": 0.8,
       "transcricao": {"segmentos": [{"s": 0.5, "e": 3.0, "texto": "fala"}]},
       "sinais": {"tremor": {"media_px": 2, "trechos": []}, "cenas": [], "rostos": []}, "picos": []}


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def folha(tmp_path):
    p = tmp_path / "folha.jpg"
    p.write_bytes(b"\xff\xd8\xff\xe0jpg")
    return p


def _visao(monkeypatch, **env):
    monkeypatch.setenv("GEMINI_API_KEY", "chave-teste")
    for k in ("EDITOR_GEMINI_VIA", "EDITOR_GEMINI_MODELO", "EDITOR_GEMINI_RESERVAS"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return VisaoGemini(None)


def test_vertex_e_o_padrao_e_usa_chave_no_cabecalho(monkeypatch, folha):
    chamadas = []

    def falso(req, timeout=0):
        chamadas.append(req)
        return _Resp(json.dumps(RESPOSTA).encode())

    monkeypatch.setattr(visao_gemini.urllib.request, "urlopen", falso)
    v = _visao(monkeypatch, EDITOR_GEMINI_MODELO="gemini-x")
    out = v.descrever(folha, [], CTX)
    assert out["provedor"] == "gemini" and out["momentos"][0]["nota"] == 5
    assert chamadas[0].full_url == "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-x:generateContent"
    assert "key=" not in chamadas[0].full_url  # chave nunca na URL (não vai parar em log)
    assert chamadas[0].get_header("X-goog-api-key") == "chave-teste"
    corpo = json.loads(chamadas[0].data)
    assert "inlineData" in corpo["contents"][0]["parts"][0]


def test_modelo_sumiu_cai_na_reserva(monkeypatch, folha):
    vistos = []

    def falso(req, timeout=0):
        vistos.append(req.full_url)
        if "velho" in req.full_url:
            raise urllib.error.HTTPError(req.full_url, 404, "not found", {}, None)
        return _Resp(json.dumps(RESPOSTA).encode())

    monkeypatch.setattr(visao_gemini.urllib.request, "urlopen", falso)
    v = _visao(monkeypatch, EDITOR_GEMINI_MODELO="gemini-velho", EDITOR_GEMINI_RESERVAS="gemini-novo")
    assert v.descrever(folha, [], CTX)["provedor"] == "gemini"
    assert v.modelo == "gemini-novo" and len(vistos) == 2


def test_erro_que_nao_e_404_cai_na_heuristica(monkeypatch, folha):
    def falso(req, timeout=0):
        raise urllib.error.HTTPError(req.full_url, 403, "sem permissão", {}, None)

    monkeypatch.setattr(visao_gemini.urllib.request, "urlopen", falso)
    v = _visao(monkeypatch)
    assert v.descrever(folha, [], CTX)["provedor"] != "gemini"


def test_aistudio_continua_disponivel(monkeypatch):
    v = _visao(monkeypatch, EDITOR_GEMINI_VIA="aistudio", EDITOR_GEMINI_MODELO="m")
    assert v.url("m").startswith("https://generativelanguage.googleapis.com/")


def test_via_invalida_recusa(monkeypatch):
    with pytest.raises(RuntimeError):
        _visao(monkeypatch, EDITOR_GEMINI_VIA="outro")
