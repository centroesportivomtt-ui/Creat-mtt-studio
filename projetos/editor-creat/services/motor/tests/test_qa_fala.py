"""Checagens de 19/11 (revisão do dono no Super Kal): fala_cortada, voz_externa e cobertura_sintonia, mais a régua comum
`motor.audio_fala`. Áudio e vídeo SINTÉTICOS gerados no teste (voz = complexo harmônico com sílabas; rosto = caixa vermelha
achada por um detector falso injetado; assinatura de voz falsa, "uma voz só", para a régua da assinatura não baixar modelo).
Nada de material de cliente, nada de modelo. Os testes do outro lado da integração (assinatura de voz, cauda da última sílaba,
resolvedor, cobertura em primeiro plano) ficam em test_qa_fala_assinatura.py."""
import json
import subprocess

import numpy as np
import pytest

from motor import config

SR = 48000


class _AssinadorUmaVoz:
    """Assinatura de voz falsa: toda peça longa o bastante é da mesma voz (a régua da assinatura passa; o que se testa aqui é a
    régua de nível e tom e o som direto). Sem isto o QA baixaria o modelo CAM++ em cada teste."""
    disponivel = True

    def __init__(self, *_a, **_k):
        pass

    def assinar(self, x, sr, minimo=0.8):
        return np.array([1.0, 0.0, 0.0], np.float32) if len(x) >= minimo * sr else None


@pytest.fixture(autouse=True)
def _sem_modelo_de_voz(monkeypatch):
    from motor.etapas import falante
    monkeypatch.setattr(falante, "Assinador", _AssinadorUmaVoz)


# ------------------------------------------------------------------ síntese
def _voz(dur: float, f0: float, amp: float, sr: int = SR, silabas: bool = True) -> np.ndarray:
    """Vogal sintética: harmônicos de f0 até 3,5 kHz, com leve vibrato e sílabas de ~180 ms (vale de 40% entre elas)."""
    t = np.arange(int(dur * sr)) / sr
    fase = 2 * np.pi * np.cumsum(f0 * (1 + 0.01 * np.sin(2 * np.pi * 5 * t))) / sr
    x = sum(np.sin(k * fase) / k for k in range(1, int(3500 // f0) + 1))
    x = x / (np.abs(x).max() + 1e-9)
    env = np.ones_like(t)
    if silabas:
        env = 0.6 + 0.4 * np.abs(np.sin(np.pi * t / 0.18))
    r = int(0.015 * sr)
    rampa = np.ones_like(t)
    rampa[:r] = np.linspace(0, 1, r)
    rampa[-r:] = np.linspace(1, 0, r)
    return (amp * x * env * rampa).astype(np.float32)


def _fonte(tmp_path, nome: str, dur: float, trechos: list, ruido: float = 0.0005, sr: int = SR):
    """Arquivo wav: ruído de sala + trechos [(início, dur, f0, amp)] de voz sintética. Devolve o caminho."""
    import soundfile as sf
    rng = np.random.default_rng(7)
    x = (ruido * rng.standard_normal(int(dur * sr))).astype(np.float32)
    for a, d, f0, amp in trechos:
        v = _voz(d, f0, amp, sr)
        i = int(a * sr)
        x[i:i + len(v)] += v
    p = tmp_path / f"{nome}.wav"
    sf.write(p, x, sr)
    return p


# fonte A: três "palavras" com pausa entre elas e uma palavra com oclusão de 60 ms no meio ("Ul-tra")
PALAVRAS_A = [(1.0, 0.6, 210, 0.3), (2.2, 0.7, 210, 0.3), (3.6, 0.25, 210, 0.3), (3.91, 0.3, 210, 0.3)]


def _sinal_a():
    rng = np.random.default_rng(7)
    x = (0.0005 * rng.standard_normal(int(5.0 * 16000))).astype(np.float32)
    for a, d, f0, amp in PALAVRAS_A:
        v = _voz(d, f0, amp, 16000)
        x[int(a * 16000):int(a * 16000) + len(v)] += v
    return x


@pytest.fixture(scope="module")
def env_a():
    from motor import audio_fala
    return audio_fala.envelope(_sinal_a(), 16000)


# ------------------------------------------------------------------ audio_fala
def test_envelope_separa_fala_de_ambiente(env_a):
    assert abs(len(env_a["db"]) - 500) <= 1
    assert env_a["piso"] < env_a["limiar"] < env_a["alto"]
    assert env_a["alto"] - env_a["piso"] > 30


def test_fim_e_inicio_da_fala(env_a):
    from motor import audio_fala
    f = audio_fala.fim_da_fala(env_a, 2.5)                  # meio da segunda palavra (2,2 a 2,9)
    assert f["ativa"] and f["fim"] is not None and abs(f["fim"] - 2.9) <= 0.05 and f["pausa"] >= 0.5
    assert not audio_fala.fim_da_fala(env_a, 3.3)["ativa"]  # pausa entre palavras
    i = audio_fala.inicio_da_fala(env_a, 2.35)              # corte 150 ms depois do começo da palavra
    assert i["som_antes"] and i["inicio"] is not None and abs(i["inicio"] - 2.2) <= 0.05


def test_corte_final(env_a):
    from motor import audio_fala
    ok, motivo = audio_fala.corte_final_ok(env_a, 2.5)
    assert not ok and "2.50" in motivo
    assert audio_fala.corte_final_ok(env_a, 1.75)[0]         # 150 ms depois do fim da palavra
    assert audio_fala.corte_final_ok(env_a, 3.2)[0]
    assert not audio_fala.corte_final_ok(env_a, 3.88)[0]     # corte na oclusão: a sílaba "tra" volta em 30 ms


def test_corte_inicial(env_a):
    from motor import audio_fala
    ok, motivo = audio_fala.corte_inicial_ok(env_a, 2.5)
    assert not ok and "meio de um som" in motivo
    assert audio_fala.corte_inicial_ok(env_a, 2.1)[0]
    assert audio_fala.corte_inicial_ok(env_a, 0.5)[0]


def test_f0_serie_acha_o_tom():
    from motor import audio_fala
    ts, f, lv = audio_fala.f0_serie(_voz(1.0, 180, 0.3, 48000), 48000)   # reamostra para 16 kHz por dentro
    assert len(ts) == len(f) == len(lv) > 40
    v = f[f > 0]
    assert len(v) > 0.8 * len(f) and abs(float(np.median(v)) - 180) < 10


def _trecho_b(extra: list) -> np.ndarray:
    rng = np.random.default_rng(3)
    x = (0.0005 * rng.standard_normal(int(4.5 * 16000))).astype(np.float32)
    v = _voz(2.6, 220, 0.3, 16000)
    x[int(0.3 * 16000):int(0.3 * 16000) + len(v)] += v
    for a, d, f0, amp in extra:
        w = _voz(d, f0, amp, 16000)
        x[int(a * 16000):int(a * 16000) + len(w)] += w
    return x


def test_vozes_de_fora():
    from motor import audio_fala
    assert audio_fala.vozes_de_fora(_trecho_b([]), 16000) == []
    longe = audio_fala.vozes_de_fora(_trecho_b([(3.2, 0.7, 200, 0.3 * 10 ** (-20 / 20))]), 16000)
    assert longe and longe[0]["motivo"] == "longe" and 3.1 <= longe[0]["a"] <= 3.4 and longe[0]["b"] >= 3.7
    grave = audio_fala.vozes_de_fora(_trecho_b([(3.2, 0.7, 110, 0.3)]), 16000)
    assert grave and grave[0]["motivo"] == "tom" and grave[0]["f0"] < 130


# ------------------------------------------------------------------ fala_cortada
def _edl(**kw):
    e = {"versao": "1", "projeto": "p", "formato": {"w": 270, "h": 480, "fps": 30}, "duracao": 3.0, "fontes": {}, "voz": [], "planos": [],
         "motion": [], "legendas": {"palavras": []}, "trilha": {"chave": None}, "sfx": [], "master": {"lufs": -14, "tp": -1.0}}
    e.update(kw)
    return e


def _conferir(tmp_path, edl, so, com_fontes=True):
    from motor.etapas import qa
    from motor.etapas.montagem.comum import Fontes
    final = tmp_path / "final.mp4"                       # as checagens de áudio não abrem o final
    rel = qa.conferir(final, edl, config.carregar(), evidencias=tmp_path / "qa", fontes=Fontes(edl) if com_fontes else None, so=so)
    return rel, rel["checagens"][0]


def _voz_peca(i, s0, s1, t0, texto, fonte="A", vel=1.0):
    return {"id": i, "fonte": fonte, "s0": s0, "s1": s1, "t0": t0, "t1": round(t0 + (s1 - s0) / vel, 4), "vel": vel, "texto": texto}


@pytest.fixture()
def fonte_a(tmp_path):
    return {"A": {"chave": str(tmp_path / "nao_existe.mp4"), "audio": str(_fonte(tmp_path, "a", 5.0, PALAVRAS_A))}}


def test_fala_cortada_aprova_cortes_com_respiro(tmp_path, dados, fonte_a):
    edl = _edl(fontes=fonte_a, voz=[_voz_peca("V1", 0.9, 1.75, 0.0, "uma lata"), _voz_peca("V2", 2.1, 3.05, 0.85, "comum")])
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    assert rel["aprovado"] and c["ok"], c["detalhe"]


def test_fala_cortada_reprova_fim_e_comeco_no_meio_da_palavra(tmp_path, dados, fonte_a):
    edl = _edl(fontes=fonte_a, voz=[_voz_peca("V1", 0.9, 1.75, 0.0, "uma lata"), _voz_peca("V2", 2.1, 2.6, 0.85, "de cerveja comum."),
                                    _voz_peca("V3", 2.75, 3.3, 1.35, "tradicional")])
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    assert not rel["aprovado"] and not c["ok"] and c["bloqueia"]
    assert c["valor"]["reprovadas"] == ["V2", "V3"]
    assert "V2 corta o fim em 1.35 s do filme (fonte A 2.60 s, «comum»)" in c["detalhe"]
    assert "V3 começa no meio de um som" in c["detalhe"] and "«tradicional»" in c["detalhe"]


def test_fala_cortada_dispensa_do_diretor(tmp_path, dados, fonte_a):
    edl = _edl(fontes=fonte_a, voz=[_voz_peca("V2", 2.1, 2.6, 0.0, "comum")], qa={"cortes_confirmados": ["V2"]})
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    assert rel["aprovado"] and c["ok"]
    assert "confirmados pelo diretor" in c["detalhe"] and "V2" in c["detalhe"] and c["valor"]["confirmadas"] == ["V2"]


def test_fala_cortada_pecas_coladas_nao_contam_na_emenda(tmp_path, dados, fonte_a):
    # a mesma palavra partida em duas peças coladas (|s0 - s1| < 0,03 s) é um corte contínuo, não fala cortada
    edl = _edl(fontes=fonte_a, voz=[_voz_peca("V2a", 2.1, 2.55, 0.0, "cer"), _voz_peca("V2b", 2.56, 3.05, 0.45, "veja")])
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    assert rel["aprovado"], c["detalhe"]
    assert "1 emenda(s) colada(s)" in c["detalhe"]
    # de fontes diferentes não é emenda: as duas pontas são conferidas
    from motor.etapas.qa.fala_cortada import emendas
    assert emendas([dict(_voz_peca("a", 0, 1, 0, ""), fonte="A"), dict(_voz_peca("b", 1.0, 2, 1, ""), fonte="B")]) == (set(), set())


def test_fala_cortada_sem_fontes_nao_verificado(tmp_path, dados, fonte_a):
    edl = _edl(fontes=fonte_a, voz=[_voz_peca("V1", 0.9, 1.75, 0.0, "uma lata")])
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"], com_fontes=False)
    assert not rel["aprovado"] and "NÃO VERIFICADO" in c["detalhe"]


# ------------------------------------------------------------------ voz_externa
@pytest.fixture()
def fonte_b(tmp_path):
    """Apresentadora 0,3-2,9 s; alguém LONGE do microfone (-20 dB) 3,2-3,9 s; silêncio até 6 s."""
    trechos = [(0.3, 2.6, 220, 0.3), (3.2, 0.7, 200, 0.3 * 10 ** (-20 / 20))]
    return {"B": {"chave": str(tmp_path / "nao_existe.mp4"), "audio": str(_fonte(tmp_path, "b", 6.0, trechos))}}


def test_voz_externa_reprova_voz_longe_na_peca(tmp_path, dados, fonte_b):
    edl = _edl(fontes=fonte_b, voz=[_voz_peca("V1", 0.2, 4.2, 10.0, "vem comigo", fonte="B", vel=2.0)])
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert not rel["aprovado"] and not c["ok"]
    a = c["valor"]["achados"][0]
    assert a["id"] == "V1" and a["motivo"] == "longe do microfone"
    assert 3.0 <= a["s"][0] <= 3.4                       # tempo da fonte
    assert abs(a["t"][0] - (10.0 + (a["s"][0] - 0.2) / 2.0)) < 0.02   # tempo do filme: t0 + (s - s0) / vel
    assert "peça V1" in c["detalhe"]


def test_voz_externa_aprova_peca_limpa(tmp_path, dados, fonte_b):
    edl = _edl(fontes=fonte_b, voz=[_voz_peca("V1", 0.2, 3.05, 0.0, "vem comigo", fonte="B")])
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert rel["aprovado"], c["detalhe"]


def test_voz_externa_som_direto_e_dispensa(tmp_path, dados, fonte_b):
    plano_conversa = {"id": "P1", "fonte": "B", "s0": 3.0, "t0": 0.0, "t1": 1.2, "vel": 1.0, "som_direto_db": -20}
    plano_sala = {"id": "P2", "fonte": "B", "s0": 4.4, "t0": 1.2, "t1": 2.4, "vel": 1.0, "som_direto_db": -20}
    plano_mudo = {"id": "P3", "fonte": "B", "s0": 0.5, "t0": 2.4, "t1": 3.0, "vel": 1.0, "som_direto_db": None}
    edl = _edl(fontes=fonte_b, planos=[plano_conversa, plano_sala, plano_mudo])
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert not rel["aprovado"] and [a["id"] for a in c["valor"]["achados"]] == ["P1"]
    assert "som direto do plano P1" in c["detalhe"] and "conversa" in c["detalhe"]
    edl["qa"] = {"vozes_confirmadas": ["P1"]}
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert rel["aprovado"] and c["valor"]["confirmadas"] == ["P1"] and "confirmadas pelo diretor" in c["detalhe"]


def test_voz_continua_pura():
    from motor.etapas.qa.voz_externa import voz_continua
    ts = np.arange(50) * 0.02
    f = np.zeros(50)
    lv = np.full(50, -60.0)
    f[10:40], lv[10:40] = 200.0, -30.0
    f[25] = 0.0                                          # um quadro sem F0 no meio não quebra o trecho
    assert voz_continua(ts, f, lv, piso=-60.0) == [(0.2, 0.8)]
    assert voz_continua(ts, f, lv, piso=-33.0) == []     # não passa de piso + 6 dB
    f[28:40] = 0.0
    assert voz_continua(ts, f, lv, piso=-60.0) == []     # 18 quadros = 0,36 s (o 25 sem F0 conta junto): não chega a 0,4 s
    assert voz_continua(ts, f, lv, piso=-60.0, dur_min=0.3) == [(0.2, 0.56)]


# ------------------------------------------------------------------ cobertura_sintonia
P_FALA = {"id": "PF", "fonte": "C", "s0": 0.0, "t0": 0.0, "t1": 1.0, "vel": 1.0}
V_FALA = {"id": "V", "fonte": "C", "s0": 0.0, "s1": 3.0, "t0": 0.0, "t1": 3.0, "vel": 1.0}


def test_coberturas_e_sincronia_pura():
    from motor.etapas.qa.cobertura_sintonia import coberturas, cruzamentos
    pl = [P_FALA,
          {"id": "PX", "fonte": "X", "s0": 5.0, "t0": 1.0, "t1": 2.0, "vel": 1.0},          # outra fonte: cobertura
          {"id": "PD", "fonte": "C", "s0": 2.5, "t0": 2.0, "t1": 3.0, "vel": 1.0},          # mesma fonte, 0,5 s fora: cobertura
          {"id": "PS", "fonte": "C", "s0": 3.1, "t0": 3.0, "t1": 4.0, "vel": 1.0},          # depois da fala: não cruza
          {"id": "PE", "fonte": "X", "s0": 0.0, "t0": 2.95, "t1": 3.5, "vel": 1.0}]         # encosta 50 ms: não conta
    assert {x["plano"]: x["sincronizado"] for x in cruzamentos(pl, [V_FALA])} == {"PF": True, "PX": False, "PD": False}
    assert coberturas(pl, [V_FALA]) == {"PX": [(1.0, 2.0)], "PD": [(2.0, 3.0)]}
    # vel diferente na mesma fonte: no meio do cruzamento a diferença passa de 0,25 s
    lento = {"id": "PL", "fonte": "C", "s0": 0.0, "t0": 0.0, "t1": 3.0, "vel": 0.5}
    assert coberturas([lento], [V_FALA]) == {"PL": [(0.0, 3.0)]}


def test_tempos_amostra():
    from motor.etapas.qa.cobertura_sintonia import tempos_amostra
    assert len(tempos_amostra([(0.0, 0.2)])) == 2
    ts = tempos_amostra([(1.0, 3.0)])
    assert len(ts) == 5 and all(1.0 < t < 3.0 for t in ts)
    assert tempos_amostra([]) == []


def test_decidir_pura():
    from motor.etapas.qa.cobertura_sintonia import decidir
    px = {"id": "PX", "fonte": "X", "s0": 0.0, "t0": 1.0, "t1": 2.0, "vel": 1.0}
    reprov = lambda planos, fr: {r["id"]: r["motivo"] for r in decidir(planos, [V_FALA], fr)}
    assert reprov([px], {"PX": 0.1}) == {}                                  # produto na tela, sem gente: passa
    assert "sem conferência de sintonia" in reprov([px], {"PX": 0.5})["PX"]  # gente na tela, sem anotação
    assert "sem conferência" in reprov([{**px, "cobertura": {"olhar": "produto", "assunto": "  "}}], {"PX": 0.5})["PX"]
    assert reprov([{**px, "cobertura": {"olhar": "produto", "assunto": "Amstel Ultra na mão dela"}}], {"PX": 0.9}) == {}
    assert "boca fora de sincronia" in reprov([{**px, "cobertura": {"olhar": "camera", "assunto": "sorri"}}], {})["PX"]
    assert "NÃO VERIFICADO" in reprov([px], {"PX": None})["PX"]
    assert reprov([P_FALA], {}) == {}                                       # take sincronizado nunca é cobertura


class _DetectorVermelho:
    """Detector falso: "rosto" = a caixa vermelha do vídeo sintético."""
    nome = "falso"

    def detectar(self, bgr):
        m = (bgr[:, :, 2] > 150) & (bgr[:, :, 1] < 90) & (bgr[:, :, 0] < 90)
        if m.sum() < 20:
            return []
        ys, xs = np.nonzero(m)
        H, W = m.shape
        return [[xs.min() / W, ys.min() / H, (xs.max() - xs.min() + 1) / W, (ys.max() - ys.min() + 1) / H, 0.9]]


@pytest.fixture(scope="module")
def final_rosto(tmp_path_factory):
    """3 s em 270x480: caixa vermelha ("rosto", 29% da altura) de 0 a 1,5 s; só fundo azul depois."""
    out = tmp_path_factory.mktemp("cob") / "final.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=270x480:r=30:d=3",
                    "-vf", "drawbox=x=80:y=100:w=110:h=140:color=red:t=fill:enable='lt(t,1.5)'",
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(out)], check=True)
    return out


_VERMELHO = _DetectorVermelho()


def _cob(tmp_path, final, planos, monkeypatch, detector=_VERMELHO):
    from motor.etapas import qa
    from motor.etapas.qa import cobertura_sintonia as cd
    monkeypatch.setattr(cd, "_detector", lambda c: detector)
    edl = _edl(voz=[dict(V_FALA, fonte="Z")], planos=planos)
    rel = qa.conferir(final, edl, config.carregar(), evidencias=tmp_path / "qa", so=["cobertura_sintonia"])
    return rel, rel["checagens"][0]


P_ROSTO = {"id": "P1", "fonte": "X", "s0": 0.0, "t0": 0.0, "t1": 1.5, "vel": 1.0}
P_PRODUTO = {"id": "P2", "fonte": "Y", "s0": 0.0, "t0": 1.5, "t1": 3.0, "vel": 1.0}


def test_cobertura_reprova_pessoa_na_tela_sem_anotacao(tmp_path, dados, final_rosto, monkeypatch):
    rel, c = _cob(tmp_path, final_rosto, [P_ROSTO, P_PRODUTO], monkeypatch)
    assert not rel["aprovado"] and c["bloqueia"] and c["valor"]["reprovados"] == ["P1"]
    assert c["valor"]["coberturas"]["P1"]["fracao_rosto"] == 1.0 and c["valor"]["coberturas"]["P2"]["fracao_rosto"] == 0.0
    assert "sem conferência de sintonia" in c["detalhe"]
    assert c["evidencia"] and c["evidencia"][0].startswith("qa/cobertura_P1_") and (tmp_path / c["evidencia"][0]).exists()


def test_cobertura_aprova_com_anotacao_e_reprova_camera(tmp_path, dados, final_rosto, monkeypatch):
    anotado = {**P_ROSTO, "cobertura": {"olhar": "produto", "assunto": "ela pega a long neck que a fala cita"}}
    rel, c = _cob(tmp_path, final_rosto, [anotado, P_PRODUTO], monkeypatch)
    assert rel["aprovado"], c["detalhe"]
    assert "com conferência de sintonia: P1 (produto" in c["detalhe"]
    camera = {**P_ROSTO, "cobertura": {"olhar": "camera", "assunto": "sorri para a câmera"}}
    rel, c = _cob(tmp_path, final_rosto, [camera, P_PRODUTO], monkeypatch)
    assert not rel["aprovado"] and "boca fora de sincronia" in c["detalhe"]


def test_cobertura_take_sincronizado_e_sem_detector(tmp_path, dados, final_rosto, monkeypatch):
    sinc = {**P_ROSTO, "fonte": "Z"}                    # o take da própria fala: rosto falando é o certo
    rel, c = _cob(tmp_path, final_rosto, [sinc], monkeypatch, detector=None)
    assert rel["aprovado"] and "nenhuma cobertura" in c["detalhe"]
    rel, c = _cob(tmp_path, final_rosto, [P_ROSTO, P_PRODUTO], monkeypatch, detector=None)
    assert not rel["aprovado"] and "NÃO VERIFICADO" in c["detalhe"]


# ------------------------------------------------------------------ contratos e memória
def test_contratos_aceitam_os_campos_novos():
    from validar import erros
    edl = _edl(voz=[_voz_peca("V1", 0.0, 1.0, 0.0, "oi")],
               planos=[{**P_ROSTO, "cobertura": {"olhar": "produto", "assunto": "a garrafa"}}, {**P_PRODUTO, "cobertura": None}],
               qa={"cortes_confirmados": ["V1"], "vozes_confirmadas": ["V1", "P1"]})
    assert erros("edl", edl) == []
    ruim = _edl(planos=[{**P_ROSTO, "cobertura": {"olhar": "longe"}}])
    assert erros("edl", ruim)
    from motor.etapas.qa import CHECAGENS
    i = CHECAGENS.index("legenda_x_fala")
    assert CHECAGENS[i + 1:i + 4] == ("fala_cortada", "voz_externa", "cobertura_sintonia")
    for nome in CHECAGENS[i + 1:i + 4]:
        rel = {"versao": "1", "projeto": "p", "video": "v", "aprovado": True, "checagens": [{"id": nome, "ok": True, "bloqueia": True}]}
        assert erros("qa", rel) == []


def test_memoria_registra_as_tres_regras_do_dono():
    from motor.memoria.loja import ESQUEMA_PROPOSTA, Loja
    tipos = ESQUEMA_PROPOSTA["properties"]["checagem"]["properties"]["tipo"]["enum"]
    ch = {c["id"]: c for c in Loja().checagens()}
    for cid, tipo in (("c_fala_cortada", "fala_cortada"), ("c_voz_externa", "voz_externa"), ("c_cobertura_sintonia", "cobertura_sintonia")):
        assert ch[cid]["executor"] == "qa" and ch[cid]["tipo"] == tipo and ch[cid]["gravidade"] == "bloqueia"
        assert ch[cid]["origem"] == "dono 19/11/2026" and tipo in tipos
    assert json.dumps(Loja().avaliar_edl(_edl()))           # executor 'qa' fica fora do avaliar_edl (não quebra)


# ------------------------------------------------------------------ achados da revisão independente (19/11)
def test_emenda_com_vao_no_filme_confere_as_duas_pontas(env_a):
    """Achado: mesma fonte e |s0 - s1| < 0,03 s, mas com 2 s de vão no FILME. A montagem só faz crossfade com |Δt| < 0,02 s;
    com vão cada peça entra com fade próprio e o corte de 'a' no meio da palavra (1,6 s) se ouve. Antes: dispensado."""
    from motor.etapas.qa.fala_cortada import conferir_pecas, emendas
    a = {"id": "a", "fonte": "A", "s0": 0.9, "s1": 1.6, "t0": 0.0, "t1": 0.7}
    b = {"id": "b", "fonte": "A", "s0": 1.6, "s1": 2.2, "t0": 2.7, "t1": 3.3}
    assert emendas([a, b]) == (set(), set())
    assert ("a", "fim") in {(p["id"], p["onde"]) for p in conferir_pecas([a, b], {"A": env_a})}
    colada = dict(b, t0=0.71)                            # encostada no filme (|Δt| = 0,01 s): continua emenda
    assert emendas([a, colada]) == ({"a"}, {"b"})


def test_audivel_pura(env_a):
    from motor import audio_fala
    assert audio_fala.audivel(env_a, 2.2, 2.9)
    assert not audio_fala.audivel(env_a, 3.0, 3.5)       # pausa entre palavras: nada acima do limiar
    assert not audio_fala.audivel(env_a, 4.5, 5.5)       # passa do fim do arquivo (5 s)
    mudo = audio_fala.envelope(np.zeros(5 * 16000, np.float32), 16000)
    assert not audio_fala.audivel(mudo, 1.0, 2.0)


@pytest.fixture()
def fonte_muda(tmp_path):
    import soundfile as sf
    p = tmp_path / "mudo.wav"
    sf.write(p, np.zeros(5 * SR, np.float32), SR)
    return {"A": {"chave": str(tmp_path / "nao_existe.mp4"), "audio": str(p)}}


@pytest.fixture()
def fonte_curta(tmp_path):
    """Fonte A truncada em 2,5 s: a segunda palavra (2,2 a 2,9 s) fica pela metade."""
    import soundfile as sf
    x, sr = sf.read(str(_fonte(tmp_path, "a_inteira", 5.0, PALAVRAS_A)), dtype="float32")
    p = tmp_path / "a_curta.wav"
    sf.write(p, x[:int(2.5 * sr)], sr)
    return {"A": {"chave": str(tmp_path / "nao_existe.mp4"), "audio": str(p)}}


def test_fala_cortada_audio_mudo_ou_curto_nao_aprova_calado(tmp_path, dados, fonte_muda, fonte_curta):
    """Achado: wav todo em zeros, ou mais curto que a peça, dava ok=True ("a fala já tinha terminado")."""
    rel, c = _conferir(tmp_path, _edl(fontes=fonte_muda, voz=[_voz_peca("V1", 1.0, 2.0, 0.0, "oi")]), ["fala_cortada"])
    assert not rel["aprovado"] and c["bloqueia"] and "NÃO VERIFICADO" in c["detalhe"] and "mudo" in c["detalhe"]
    assert [p["id"] for p in c["valor"]["nao_verificadas"]] == ["V1"]
    edl = _edl(fontes=fonte_curta, voz=[_voz_peca("V1", 2.1, 3.0, 0.0, "comum")], qa={"cortes_confirmados": ["V1"]})
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    assert not rel["aprovado"] and "NÃO VERIFICADO" in c["detalhe"] and "a peça vai até 3.00 s" in c["detalhe"]  # sem dispensa


def test_voz_externa_audio_mudo_ou_curto_nao_aprova_calado(tmp_path, dados, fonte_muda, fonte_curta):
    rel, c = _conferir(tmp_path, _edl(fontes=fonte_muda, voz=[_voz_peca("V1", 1.0, 2.0, 0.0, "oi")]), ["voz_externa"])
    assert not rel["aprovado"] and "NÃO VERIFICADO" in c["detalhe"]
    rel, c = _conferir(tmp_path, _edl(fontes=fonte_curta, voz=[_voz_peca("V1", 2.1, 3.0, 0.0, "comum")]), ["voz_externa"])
    assert not rel["aprovado"] and "NÃO VERIFICADO" in c["detalhe"]
    plano = {"id": "P1", "fonte": "A", "s0": 2.0, "t0": 0.0, "t1": 1.5, "vel": 1.0, "som_direto_db": -20}   # vai até 3,5 s
    rel, c = _conferir(tmp_path, _edl(fontes=fonte_curta, planos=[plano]), ["voz_externa"])
    assert not rel["aprovado"] and "som direto do plano P1" in c["detalhe"] and "NÃO VERIFICADO" in c["detalhe"]


def _ruido(x, sr=16000):
    return (x + 0.0005 * np.random.default_rng(1).standard_normal(len(x))).astype(np.float32)


def _glide(dur, fa, fb, queda, sr=16000):
    """Vogal com o tom caindo de fa para fb nos últimos `queda` s (fim de frase)."""
    t = np.arange(int(dur * sr)) / sr
    f0 = np.where(t < dur - queda, fa, fa - (fa - fb) * (t - (dur - queda)) / queda)
    fase = 2 * np.pi * np.cumsum(f0) / sr
    y = sum(np.sin(k * fase) / k for k in range(1, 12))
    return (0.3 * y / np.abs(y).max()).astype(np.float32)


def test_vozes_de_fora_continuidade_nao_reprova_o_proprio_falante():
    """Achado: sílaba fraca no meio da frase (-14 dB) e tom caindo no fim da frase saíam como "outra voz". Com
    continuidade=True (o que o QA usa), a linha de tom contínua e colada na fala dela é ela; o padrão segue o antigo."""
    from motor import audio_fala
    sr, z = 16000, (lambda d: np.zeros(int(d * 16000), np.float32))
    fraca = _ruido(np.concatenate([z(.25), _voz(.5, 220, .3, sr), _voz(.3, 220, .3 * 10 ** (-14 / 20), sr), _voz(.5, 220, .3, sr), z(.25)]))
    assert audio_fala.vozes_de_fora(fraca, sr)[0]["motivo"] == "longe"            # padrão: comportamento antigo
    assert audio_fala.vozes_de_fora(fraca, sr, continuidade=True) == []
    queda = _ruido(np.concatenate([z(.25), _glide(1.4, 240, 120, .6), z(.5)]))
    assert audio_fala.vozes_de_fora(queda, sr)[0]["motivo"] == "tom"
    assert audio_fala.vozes_de_fora(queda, sr, continuidade=True) == []
    # homem da equipe entrando colado nela, sem pausa (salto de tom 230 -> 115 Hz): continua reprovando, perto ou longe
    for amp in (.3, .3 * 10 ** (-15 / 20)):
        homem = _ruido(np.concatenate([z(.25), _voz(1.2, 230, .3, sr), _voz(.6, 115, amp, sr), z(.3)]))
        r = audio_fala.vozes_de_fora(homem, sr, continuidade=True)
        assert r and r[0]["f0"] < 130 and r[0]["motivo"] == "tom"
    # voz longe depois de uma pausa (o caso do dono) continua reprovando
    assert audio_fala.vozes_de_fora(_trecho_b([(3.2, .7, 200, .3 * 10 ** (-20 / 20))]), sr, continuidade=True)


def test_voz_externa_nao_reprova_silaba_fraca_dela(tmp_path, dados):
    trechos = [(0.3, 0.5, 220, 0.3), (0.8, 0.3, 220, 0.3 * 10 ** (-14 / 20)), (1.1, 0.5, 220, 0.3)]
    fontes = {"B": {"chave": str(tmp_path / "nao_existe.mp4"), "audio": str(_fonte(tmp_path, "fraca", 3.0, trechos))}}
    rel, c = _conferir(tmp_path, _edl(fontes=fontes, voz=[_voz_peca("V1", 0.2, 1.8, 0.0, "uma lata comum", fonte="B")]), ["voz_externa"])
    assert rel["aprovado"], c["detalhe"]


def test_sincronia_conferida_nas_pontas_do_cruzamento():
    """Achado: vel diferente (voz 1,2x, plano 1,0x) alinhados só no meio: ±0,5 s de diferença nas pontas passava como take
    sincronizado e o rosto nem era medido."""
    from motor.etapas.qa.cobertura_sintonia import coberturas, cruzamentos, decidir
    v = {"id": "V", "fonte": "A", "s0": 10.0, "s1": 16.0, "t0": 0.0, "t1": 5.0, "vel": 1.2}
    p = {"id": "P", "fonte": "A", "s0": 10.5, "t0": 0.0, "t1": 5.0, "vel": 1.0}
    assert cruzamentos([p], [v])[0]["sincronizado"] is False
    assert coberturas([p], [v]) == {"P": [(0.0, 5.0)]}
    assert decidir([p], [v], {"P": 1.0})[0]["id"] == "P"
    assert cruzamentos([dict(p, s0=10.0, vel=1.2)], [v])[0]["sincronizado"] is True   # o take certo continua sincronizado


def test_sequencia_e_decidir_com_seguidas():
    """Achado (P41 do Super Kal): rosto grande só no fim de um plano longo = 2 de 8 amostras (25% < 30%) e passava."""
    from motor.etapas.qa.cobertura_sintonia import decidir, sequencia_max
    ts = [0.2, 0.6, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0]
    assert sequencia_max(ts, [False] * 6 + [True, True]) == 2
    assert sequencia_max(ts, [True, False] * 4) == 1
    assert sequencia_max([0.2, 2.0], [True, True]) == 1                     # trechos separados do plano não são seguidos
    px = {"id": "PX", "fonte": "X", "s0": 0.0, "t0": 0.0, "t1": 3.0, "vel": 1.0}
    assert decidir([px], [V_FALA], {"PX": 0.25}) == []                      # sem as seguidas: o comportamento antigo
    assert "sem conferência" in decidir([px], [V_FALA], {"PX": 0.25}, {"PX": 2})[0]["motivo"]
    assert decidir([px], [V_FALA], {"PX": 0.25}, {"PX": 1}) == []
    ok = {**px, "cobertura": {"olhar": "produto", "assunto": "mão pegando a garrafa que a fala cita"}}
    assert decidir([ok], [V_FALA], {"PX": 0.25}, {"PX": 2}) == []


@pytest.fixture(scope="module")
def final_rosto_no_fim(tmp_path_factory):
    """3,2 s em 270x480: só fundo azul, e a caixa vermelha ("rosto") entra de 2,4 s em diante (2 das 8 amostras)."""
    out = tmp_path_factory.mktemp("cobfim") / "final.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=270x480:r=30:d=3.2",
                    "-vf", "drawbox=x=80:y=100:w=110:h=140:color=red:t=fill:enable='gte(t,2.4)'",
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(out)], check=True)
    return out


def test_cobertura_reprova_pessoa_que_entra_no_fim_do_plano(tmp_path, dados, final_rosto_no_fim, monkeypatch):
    longo = {"id": "P41", "fonte": "X", "s0": 0.0, "t0": 0.0, "t1": 3.2, "vel": 1.0}
    from motor.etapas import qa
    from motor.etapas.qa import cobertura_sintonia as cd
    monkeypatch.setattr(cd, "_detector", lambda c: _VERMELHO)
    voz = [{"id": "V", "fonte": "Z", "s0": 0.0, "s1": 3.2, "t0": 0.0, "t1": 3.2, "vel": 1.0}]
    rel = qa.conferir(final_rosto_no_fim, _edl(voz=voz, planos=[longo]), config.carregar(), evidencias=tmp_path / "qa", so=["cobertura_sintonia"])
    c = rel["checagens"][0]
    assert c["valor"]["coberturas"]["P41"]["fracao_rosto"] == 0.25 and c["valor"]["coberturas"]["P41"]["seguidas"] == 2
    assert not rel["aprovado"] and c["valor"]["reprovados"] == ["P41"] and "2 amostras seguidas" in c["detalhe"]


# ------------------------------------------------------------------ cache do QA e entrega
def _versao(dados, edl, qa_ant=None):
    """Projeto p1/v1 no armazenamento local: edl.json, final.mp4 (bytes), montagem.json e, se dado, um qa.json antigo."""
    import io
    from types import SimpleNamespace
    from motor import banco
    from motor.etapas.montagem.comum import sha256_arquivo
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    t = banco.agora_iso()
    con.execute("INSERT OR IGNORE INTO projetos (id, nome, criado, atualizado) VALUES ('p1','t',?,?)", (t, t))
    con.execute("INSERT OR IGNORE INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','montada',?)", (t,))
    arm = armazenamento_de(cfg)
    base = "saidas/p1/v1"
    arm.gravar(f"{base}/edl.json", io.BytesIO(json.dumps(edl).encode()))
    arm.gravar(f"{base}/final.mp4", io.BytesIO(b"filme"))
    arm.gravar(f"{base}/montagem.json", io.BytesIO(b'{"chaves": {}}'))
    if qa_ant is not None:
        arm.gravar(f"{base}/qa.json", io.BytesIO(json.dumps(qa_ant).encode()))
        arm.gravar(f"{base}/qa.sha256", io.BytesIO(sha256_arquivo(arm.caminho_local(f"{base}/final.mp4")).encode()))
    ctx = SimpleNamespace(projeto="p1", alvo="v1", armazenamento=arm, con=con, cfg=cfg, progresso=lambda *a, **k: None)
    return ctx, arm, base


def test_qa_nao_reaproveita_relatorio_sem_as_checagens_novas_nem_com_edl_mudado(dados, monkeypatch):
    """Achado (bloqueia): o qa.json antigo era reaproveitado só pelo sha256 do final; as 3 checagens novas nunca rodavam
    num final já conferido, e a dispensa (edl.qa) não era reavaliada."""
    from motor.etapas import qa
    from motor.etapas.qa import CHECAGENS
    chamadas = []

    def conferir_falso(final, edl, cfg, **kw):
        chamadas.append(edl.get("qa"))
        return {"versao": "1", "projeto": "p1", "video": "saidas/p1/v1/final.mp4", "aprovado": True,
                "checagens": [{"id": n, "ok": True, "bloqueia": True} for n in CHECAGENS]}
    monkeypatch.setattr(qa, "conferir", conferir_falso)
    antigas = [n for n in CHECAGENS if n not in ("fala_cortada", "voz_externa", "cobertura_sintonia")]
    ant = {"versao": "1", "projeto": "p1", "video": "v", "aprovado": True, "checagens": [{"id": n, "ok": True, "bloqueia": True} for n in antigas]}
    edl = _edl()
    ctx, arm, base = _versao(dados, edl, qa_ant=ant)
    r = qa.etapa_qa(ctx)
    assert len(chamadas) == 1 and not r.get("reaproveitado")                  # antes: reaproveitado=True, aprovado=True
    assert arm.existe(f"{base}/qa.chave")
    assert qa.etapa_qa(ctx).get("reaproveitado") and len(chamadas) == 1        # mesmo final, mesmo EDL: reaproveita
    edl["qa"] = {"cortes_confirmados": ["B3.1.0"]}                             # dispensa nova no EDL: confere de novo
    import io
    arm.gravar(f"{base}/edl.json", io.BytesIO(json.dumps(edl).encode()))
    assert not qa.etapa_qa(ctx).get("reaproveitado") and chamadas[-1] == {"cortes_confirmados": ["B3.1.0"]}
    assert not qa.pode_reaproveitar(ant, "x", "x") and not qa.pode_reaproveitar({"checagens": []}, None, None)


def test_entrega_recusa_qa_de_antes_das_checagens_novas(dados):
    import io
    from motor.etapas import ErroDefinitivo
    from motor.etapas.entrega import entregar
    from motor.etapas.qa import CHECAGENS, chave_conferencia
    from motor.etapas.montagem.comum import sha256_arquivo
    antigas = [n for n in CHECAGENS if n != "fala_cortada"]
    ant = {"versao": "1", "projeto": "p1", "video": "v", "aprovado": True, "checagens": [{"id": n, "ok": True, "bloqueia": True} for n in antigas]}
    ctx, arm, base = _versao(dados, _edl(), qa_ant=ant)
    with pytest.raises(ErroDefinitivo, match="antes das checagens fala_cortada"):
        entregar(arm, ctx.cfg, "p1", "v1")
    ant["checagens"].append({"id": "fala_cortada", "ok": True, "bloqueia": True})
    arm.gravar(f"{base}/qa.json", io.BytesIO(json.dumps(ant).encode()))
    with pytest.raises(ErroDefinitivo, match="qa.chave"):                     # QA completo, mas de outro EDL
        sha = sha256_arquivo(arm.caminho_local(f"{base}/final.mp4"))
        arm.gravar(f"{base}/qa.chave", io.BytesIO(chave_conferencia(sha, _edl(duracao=9.0)).encode()))
        entregar(arm, ctx.cfg, "p1", "v1")


# ------------------------------------------------------------------ integração 19/11 (uma checagem por critério, todas bloqueiam)
def test_as_tres_bloqueiam_e_a_chave_leva_o_modo_observacao(monkeypatch):
    """Ordem do dono (19/11, "QA que bloqueia"): nenhuma das três fica em observação; mudar a lista muda a chave do cache.
    (O olho de IA, item C, segue em observação como a outra sessão definiu; ele roda por último.)"""
    import importlib
    from motor.etapas import qa
    assert qa.EM_OBSERVACAO == ("olho_ia",) and qa.CHECAGENS[-1] == "olho_ia"
    assert not {"fala_cortada", "voz_externa", "cobertura_sintonia"} & set(qa.EM_OBSERVACAO)
    for nome in ("fala_cortada", "voz_externa", "cobertura_sintonia"):
        assert importlib.import_module(f"motor.etapas.qa.{nome}").BLOQUEIA is True and nome in qa.CHECAGENS
    assert "cobertura_desconectada" not in qa.CHECAGENS                      # um id só por critério
    k = qa.chave_conferencia("abc", _edl())
    monkeypatch.setattr(qa, "EM_OBSERVACAO", ("voz_externa",))
    assert qa.chave_conferencia("abc", _edl()) != k


def test_voz_externa_varias_pessoas_permite_outra_voz_mas_nao_a_equipe_longe(tmp_path, dados, fonte_b):
    """'várias pessoas falam' no pedido: tom de outra pessoa é só relatado; voz longe do microfone (equipe dirigindo) reprova."""
    grave = {"G": {"chave": str(tmp_path / "nao_existe.mp4"),
                   "audio": str(_fonte(tmp_path, "g", 6.0, [(0.3, 2.6, 220, 0.3), (3.2, 0.7, 110, 0.3)]))}}
    peca = [_voz_peca("V1", 0.2, 4.2, 0.0, "vem comigo", fonte="G")]
    rel, c = _conferir(tmp_path, _edl(fontes=grave, voz=peca), ["voz_externa"])
    assert not rel["aprovado"] and "tom de outra pessoa" in c["detalhe"]
    rel, c = _conferir(tmp_path, _edl(fontes=grave, voz=peca, origem={"vozes": "varias"}), ["voz_externa"])
    assert rel["aprovado"] and "permitido pelo pedido" in c["detalhe"] and c["valor"]["permitidos"][0]["id"] == "V1"
    longe = [_voz_peca("V1", 0.2, 4.2, 0.0, "vem comigo", fonte="B")]
    rel, c = _conferir(tmp_path, _edl(fontes=fonte_b, voz=longe, origem={"vozes": "varias"}), ["voz_externa"])
    assert not rel["aprovado"] and "longe do microfone" in c["detalhe"]


def test_fala_cortada_une_as_reguas_no_mesmo_problema(tmp_path, dados, fonte_a):
    """O mesmo fim reprovado por duas réguas vira UM problema com os dois motivos (régua de audio_fala + cauda da sílaba)."""
    edl = _edl(fontes=fonte_a, voz=[_voz_peca("V2", 2.1, 2.6, 0.0, "comum")])
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    p = c["valor"]["problemas"]
    assert not rel["aprovado"] and len(p) == 1 and p[0]["id"] == "V2" and p[0]["onde"] == "fim"
    assert set(p[0]["reguas"]) == {"audio_fala", "cauda"} and "a fala continua depois do corte" in p[0]["motivo"]
    assert "última sílaba continua por" in p[0]["motivo"]


def test_coberturas_do_edl_para_o_olho_de_ia():
    """O olho de IA (outra sessão) lia `coberturas(edl)`; depois da integração ele usa `coberturas_do_edl`, com a mesma régua
    de sincronia da checagem, sem janela/PiP e só com 0,5 s ou mais de fala por baixo."""
    from motor.etapas.qa.cobertura_sintonia import coberturas_do_edl
    voz = [{"id": "V1", "fonte": "a", "s0": 10.0, "s1": 16.0, "t0": 0.0, "t1": 6.0, "vel": 1.0, "texto": "olha só essa promoção"}]
    planos = [{"id": "P1", "fonte": "a", "t0": 0.0, "t1": 2.0, "s0": 10.0, "vel": 1.0},
              {"id": "P2", "fonte": "b", "t0": 2.0, "t1": 4.0, "s0": 3.0, "vel": 1.0},
              {"id": "P3", "fonte": "b", "t0": 4.0, "t1": 4.3, "s0": 9.0, "vel": 1.0},
              {"id": "P4", "fonte": "b", "t0": 4.3, "t1": 6.0, "s0": 9.0, "vel": 1.0, "janela": {"x": 0, "y": 0, "w": 1, "h": 1}}]
    cbs = coberturas_do_edl({"voz": voz, "planos": planos})
    assert [(x["plano"], x["t0"], x["t1"], x["texto"]) for x in cbs] == [("P2", 2.0, 4.0, "olha só essa promoção")]
