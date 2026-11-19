"""Checagens de fala que seguram a entrega (pedido do dono em 19/11): fala cortada no fim, voz externa, cobertura em sintonia."""
import json

import numpy as np
import pytest

from motor import config
from motor.etapas.montagem.comum import Fontes

SR = 48000


class _Tr:
    def __init__(self, texto):
        self.texto = texto

    def __call__(self, nome, arq, **_k):
        pal = [[t, t + 0.25, w, 0.9] for t, w in self.texto]
        return {"segmentos": [{"texto": " ".join(w for _, w in self.texto), "palavras": pal}] if pal else []}


def _fala(trechos, dur=6.0, sala=0.002):
    """Áudio sintético: 'voz' = ruído filtrado forte nos trechos [(ini, fim)], sala baixa no resto (queda de 30 ms)."""
    rng = np.random.default_rng(7)
    n = int(dur * SR)
    x = rng.normal(0, sala, n)
    for a, b in trechos:
        i, j = int(a * SR), int(b * SR)
        seg = rng.normal(0, 0.2, j - i)
        q = int(0.03 * SR)
        seg[:q] *= np.linspace(0, 1, q)
        seg[-q:] *= np.linspace(1, 0, q)
        x[i:j] += seg
    return x.astype(np.float32)


def _conf(tmp_path, monkeypatch, voz, trechos, palavras_fonte=None, mix=()):
    import soundfile as sf
    from motor.etapas import qa
    d = tmp_path / "derivados" / "a"
    d.mkdir(parents=True)
    sf.write(d / "audio.wav", _fala(trechos), SR)
    if palavras_fonte is not None:
        (d / "analise.json").write_text(json.dumps({"transcricao": {"segmentos": [
            {"s": 0, "e": 6, "texto": " ".join(w[2] for w in palavras_fonte), "palavras": palavras_fonte}]}}))
    edl = {"duracao": 6.0, "formato": {"w": 1080, "h": 1920, "fps": 30}, "voz": voz,
           "fontes": {"a": {"chave": str(d / "audio.wav"), "audio": str(d / "audio.wav"), "offset": 0}}}
    monkeypatch.setattr(qa.Conferencia, "transcrever", lambda self, nome, arq, **k: _Tr(list(mix))(nome, arq))
    return qa.Conferencia(tmp_path / "final.mp4", edl, config.carregar(), fontes=Fontes(edl), evidencias=tmp_path / "ev")


def _v(i, s0, s1, t0, texto, **kw):
    return {"id": f"V{i}", "fonte": "a", "s0": s0, "s1": s1, "t0": t0, "t1": t0 + (s1 - s0), "vel": 1.0, "texto": texto, **kw}


def test_fala_inteira_passa(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    c = _conf(tmp_path, monkeypatch, [_v(1, 1.0, 2.6, 0.0, "vem comigo agora")], [(1.05, 2.45)], mix=[(0.2, "vem"), (0.6, "comigo"), (1.1, "agora")])
    r = fala_cortada.checar(c)
    assert r["ok"], r["detalhe"]
    assert r["valor"][0]["ativo"] is False and r["valor"][0]["ouvida_no_mix"] is True


def test_corte_antes_da_ultima_silaba_reprova(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import CHECAGENS, fala_cortada
    assert "fala_cortada" in CHECAGENS and fala_cortada.BLOQUEIA
    # a voz vai até 2,45 s, mas a peça corta em 2,30 s: 150 ms da última sílaba ficam de fora
    c = _conf(tmp_path, monkeypatch, [_v(1, 1.0, 2.30, 0.0, "vem comigo agora")], [(1.05, 2.45)], mix=[(0.2, "vem"), (0.6, "comigo"), (1.1, "agora")])
    r = fala_cortada.checar(c)
    assert not r["ok"] and "última sílaba continua por" in r["detalhe"] and "V1" in r["detalhe"]
    assert 100 <= r["valor"][0]["cauda_ms"] <= 220


def test_corte_dentro_da_palavra_reprova(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    pal = [[1.05, 1.4, "vem", 0.9], [1.5, 1.9, "comigo", 0.9], [2.0, 2.45, "agora", 0.9], [2.5, 3.2, "pessoal", 0.9]]
    # fala contínua (sem queda depois do corte): só a transcrição da fonte mostra que o corte caiu no meio de "agora"
    c = _conf(tmp_path, monkeypatch, [_v(1, 1.0, 2.2, 0.0, "vem comigo agora")], [(1.05, 3.6)], palavras_fonte=pal, mix=[(0.2, "vem"), (0.6, "comigo")])
    r = fala_cortada.checar(c)
    assert not r["ok"] and "dentro da palavra «agora»" in r["detalhe"]


def test_corte_entre_palavras_no_meio_da_frase_passa(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    pal = [[1.05, 1.4, "vem", 0.9], [1.5, 1.9, "comigo", 0.9], [1.96, 2.45, "agora", 0.9]]
    c = _conf(tmp_path, monkeypatch, [_v(1, 1.0, 1.93, 0.0, "vem comigo")], [(1.05, 3.6)], palavras_fonte=pal, mix=[(0.2, "vem"), (0.6, "comigo")])
    assert fala_cortada.checar(c)["ok"]


def test_voz_ativa_e_palavra_nao_ouvida_reprova_e_onda_calma_vira_observacao(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    c = _conf(tmp_path, monkeypatch, [_v(1, 1.0, 2.2, 0.0, "vem comigo agora")], [(1.05, 3.6)], mix=[(0.2, "vem"), (0.6, "comigo")])
    r = fala_cortada.checar(c)
    assert not r["ok"] and "última palavra não é ouvida" in r["detalhe"]
    c2 = _conf(tmp_path / "b", monkeypatch, [_v(1, 1.0, 2.6, 0.0, "vem comigo agora")], [(1.05, 2.45)], mix=[(0.2, "vem")])
    r2 = fala_cortada.checar(c2)
    assert r2["ok"] and "observação" in r2["detalhe"]


def test_pecas_coladas_da_mesma_fala_nao_contam_como_fim(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    voz = [_v(1, 1.0, 2.0, 0.0, "vem comigo"), _v(2, 2.0, 2.6, 1.0, "agora")]
    c = _conf(tmp_path, monkeypatch, voz, [(1.05, 2.45)], mix=[(0.2, "vem"), (0.6, "comigo"), (1.1, "agora")])
    r = fala_cortada.checar(c)
    assert r["ok"] and [x["voz"] for x in r["valor"]] == ["V2"]


def test_peca_encurtada_na_linha_do_tempo_mede_o_fim_real(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    v = _v(1, 1.0, 2.6, 0.0, "vem comigo agora")
    v["t1"] = 1.3                                        # a linha do tempo só usa 1,3 s: o fim real é 2,30 s na fonte
    c = _conf(tmp_path, monkeypatch, [v], [(1.05, 2.45)], mix=[(0.2, "vem"), (0.6, "comigo"), (1.0, "agora")])
    assert not fala_cortada.checar(c)["ok"]


def test_fonte_ilegivel_nao_passa_calada(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    c = _conf(tmp_path, monkeypatch, [_v(1, 1.0, 2.6, 0.0, "vem comigo agora")], [(1.05, 2.45)])
    c.edl["fontes"]["a"]["audio"] = c.edl["fontes"]["a"]["chave"] = str(tmp_path / "nao_existe.wav")
    c.fontes = Fontes(c.edl)
    r = fala_cortada.checar(c)
    assert not r["ok"] and r["bloqueia"] and "NÃO VERIFICADO" in r["detalhe"]


def test_medir_corte_sem_contraste_nao_acusa():
    from motor.etapas.qa.fala_cortada import medir_corte
    env = np.full(160, -40.0, np.float32) + np.random.default_rng(1).normal(0, 0.5, 160).astype(np.float32)
    assert medir_corte(env, 100)["ativo"] is False


def test_resolvedor_estica_o_corte_ate_a_voz_morrer():
    from motor.etapas.resolvedor import Resolvedor
    r = Resolvedor.__new__(Resolvedor)
    passo = 0.02
    serie = np.full(400, -60.0, np.float32)
    serie[50:130] = -20.0                                # voz de 1,00 s a 2,60 s
    serie[130:136] = np.linspace(-22, -40, 6)            # cauda morrendo até ~2,72 s
    r.energias = {"a": serie, "_passo": {"a": passo}}
    # a transcrição disse que a palavra acaba em 2,40 s (+ folga = 2,49 s): a voz ainda está ativa ali
    novo = r._cauda("a", 2.49, 1.0, 2.40, None)
    assert 2.66 <= novo <= 2.80
    assert r._cauda("a", 2.49, 1.0, 2.40, 2.55) == 2.55                  # nunca além da palavra seguinte
    assert r._cauda("a", 2.90, 1.0, 2.40, None) == 2.90                  # já estava calmo: não mexe
    serie2 = np.full(400, -20.0, np.float32)                             # fala corrida, não morre em 0,40 s: fica onde está
    r.energias = {"a": serie2, "_passo": {"a": passo}}
    assert r._cauda("a", 2.49, 1.0, 2.40, None) == 2.49
    r.energias = {}
    assert r._cauda("a", 2.49, 1.0, 2.40, None) == 2.49


# ---------------------------------------------------------------- voz externa
class _AssinadorFalso:
    """Assinatura pela 'cor' do som: cada voz de teste é um tom; a assinatura é o espectro grosso normalizado."""
    disponivel = True

    def assinar(self, x, sr, minimo=0.8):
        if len(x) < minimo * sr:
            return None
        e = np.abs(np.fft.rfft(x[: int(0.4 * sr)], 4096))[:400].astype(np.float32)
        return e / (np.linalg.norm(e) + 1e-9)


def _vozes(tmp_path, monkeypatch, pecas, origem=None):
    """pecas = [(freq_hz, s0, s1)]: cada 'voz' é um tom diferente na fonte."""
    import soundfile as sf
    from motor.etapas import qa
    d = tmp_path / "derivados" / "a"
    d.mkdir(parents=True)
    x = np.zeros(int(30 * SR), np.float32)
    voz, t = [], 0.0
    for i, (f, s0, s1) in enumerate(pecas):
        n = np.arange(int(s0 * SR), int(s1 * SR))
        x[n] = 0.2 * np.sin(2 * np.pi * f * n / SR)
        voz.append({"id": f"V{i + 1}", "fonte": "a", "s0": s0, "s1": s1, "t0": t, "t1": t + (s1 - s0), "vel": 1.0, "texto": f"fala {i + 1}"})
        t += s1 - s0
    sf.write(d / "audio.wav", x, SR)
    edl = {"duracao": t, "formato": {"w": 1080, "h": 1920, "fps": 30}, "voz": voz, "origem": origem or {},
           "fontes": {"a": {"chave": str(d / "audio.wav"), "audio": str(d / "audio.wav"), "offset": 0}}}
    c = qa.Conferencia(tmp_path / "final.mp4", edl, config.carregar(), fontes=Fontes(edl), evidencias=tmp_path / "ev")
    c._assinador = _AssinadorFalso()
    return c


def test_voz_de_quem_dirige_a_gravacao_reprova(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import CHECAGENS, voz_externa
    assert "voz_externa" in CHECAGENS and voz_externa.BLOQUEIA
    c = _vozes(tmp_path, monkeypatch, [(300, 0, 5), (300, 6, 10), (900, 11, 12.2), (300, 13, 17)])
    r = voz_externa.checar(c)
    assert not r["ok"] and "V3" in r["detalhe"] and "outra voz" in r["detalhe"]
    assert [x.get("outra_voz", False) for x in r["valor"]] == [False, False, True, False]


def test_mesma_voz_passa_e_conversa_equilibrada_passa(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import voz_externa
    r = voz_externa.checar(_vozes(tmp_path, monkeypatch, [(300, 0, 5), (300, 6, 10)]))
    assert r["ok"] and "mesma voz" in r["detalhe"]
    r2 = voz_externa.checar(_vozes(tmp_path / "b", monkeypatch, [(300, 0, 5), (900, 6, 10)]))
    assert r2["ok"] and "conversa" in r2["detalhe"]


def test_pedido_manda_na_voz(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import voz_externa
    pecas = [(300, 0, 5), (900, 6, 10)]
    assert not voz_externa.checar(_vozes(tmp_path, monkeypatch, pecas, {"vozes": "uma"}))["ok"]
    pecas2 = [(300, 0, 5), (300, 6, 10), (900, 11, 12.2)]
    r = voz_externa.checar(_vozes(tmp_path / "b", monkeypatch, pecas2, {"vozes": "varias"}))
    assert r["ok"] and "permitido pelo pedido" in r["detalhe"]


def test_sem_modelo_de_voz_nao_passa_calado(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import voz_externa
    c = _vozes(tmp_path, monkeypatch, [(300, 0, 5)])

    class Sem:
        disponivel = False
    c._assinador = Sem()
    r = voz_externa.checar(c)
    assert not r["ok"] and r["bloqueia"] and "NÃO VERIFICADO" in r["detalhe"]
    c.fontes = None
    assert voz_externa.checar(c)["ok"]


def test_fala_curta_pede_segunda_pista(tmp_path, dados, monkeypatch):
    """Trecho de menos de 2 s engana a assinatura: só é 'outra voz' se o tom (grave/agudo) também estiver longe."""
    from motor.etapas import falante as F
    from motor.etapas.qa import voz_externa
    monkeypatch.setattr(voz_externa, "LIM_CURTA", -1.0)                  # isola a pista do tom (o assinador falso dá cosseno ~0)
    c = _vozes(tmp_path, monkeypatch, [(300, 0, 5), (300, 6, 10), (900, 11, 12.2)])
    monkeypatch.setattr(F, "tom_hz", lambda x, sr: 200.0)                 # mesmo tom em tudo: a peça curta não é acusada
    assert voz_externa.checar(c)["ok"]
    tons = iter([200.0, 200.0, 120.0])
    monkeypatch.setattr(F, "tom_hz", lambda x, sr: next(tons))             # tom 40% mais grave: é outra pessoa
    c2 = _vozes(tmp_path / "b", monkeypatch, [(300, 0, 5), (300, 6, 10), (900, 11, 12.2)])
    assert not voz_externa.checar(c2)["ok"]


def test_tom_da_voz():
    from motor.etapas import falante as F
    t = np.arange(F.SR) / F.SR
    x = sum(np.sin(2 * np.pi * 150 * k * t) / k for k in range(1, 6)).astype(np.float32) * 0.1
    assert abs(F.tom_hz(x, F.SR) - 150) < 4
    assert F.tom_hz(np.random.default_rng(0).normal(0, 0.1, F.SR).astype(np.float32), F.SR) is None
    assert F.tom_hz(np.zeros(100, np.float32), F.SR) is None


def test_fbank_e_agrupamento():
    from motor.etapas import falante as F
    x = np.random.default_rng(0).normal(0, 0.1, F.SR * 2).astype(np.float32)
    f = F.fbank(x)
    assert f.shape == (198, 80) and abs(float(f.mean())) < 1e-3 and np.isfinite(f).all()
    assert F.fbank(x[:100]).shape == (0, 80)
    assert len(F.reamostrar(np.zeros(48000, np.float32), 48000)) == 16000
    a, b = np.array([1, 0, 0], np.float32), np.array([0, 1, 0], np.float32)
    g = F.agrupar([a, None, b, a], [5.0, 0.3, 1.0, 4.0])
    assert g["grupos"][0] == g["grupos"][3] != g["grupos"][2] and g["grupos"][1] == -1
    assert g["principal"] == g["grupos"][0] and g["proximidade"][2] < 0.1 and g["proximidade"][1] is None
    assert F.agrupar([None], [1.0])["principal"] is None


def test_pedido_leva_vozes_ate_a_origem_do_edl():
    import validar
    ped = json.loads((config.SCHEMAS / "exemplos" / "pedido.json").read_text())
    assert validar.erros("pedido", {**ped, "vozes": "uma"}) == [] and validar.erros("pedido", {**ped, "vozes": "duas"})
    from motor.etapas.resolvedor import Resolvedor
    import inspect
    assert "vozes" in inspect.signature(Resolvedor.__init__).parameters


# ---------------------------------------------------------------- cobertura em sintonia
class _Det:
    nome = "falso"

    def __init__(self, larguras):
        self.larguras = iter(larguras)

    def detectar(self, bgr):
        w = next(self.larguras)
        return [[0.3, 0.2, w, w, 0.9]] if w else []


def _cob(tmp_path, planos, voz, larguras, det=None):
    from motor.etapas import qa
    edl = {"duracao": 10.0, "formato": {"w": 108, "h": 192, "fps": 30}, "voz": voz, "planos": planos, "fontes": {}}
    c = qa.Conferencia(tmp_path / "final.mp4", edl, config.carregar(), evidencias=tmp_path / "ev")
    c.quadro = lambda t: np.zeros((192, 108, 3), np.uint8)
    c._rostos = det or _Det(larguras)
    return c


def _p(i, fonte, t0, t1, s0, **kw):
    return {"id": f"P{i}", "fonte": fonte, "t0": t0, "t1": t1, "s0": s0, "vel": 1.0, **kw}


def test_cobertura_e_sincronia_sao_separadas():
    from motor.etapas.qa.cobertura_sintonia import coberturas
    voz = [{"id": "V1", "fonte": "a", "s0": 10.0, "s1": 16.0, "t0": 0.0, "t1": 6.0, "vel": 1.0, "texto": "olha só essa promoção"}]
    planos = [_p(1, "a", 0.0, 2.0, 10.0),                    # a própria fala em quadro
              _p(2, "b", 2.0, 4.0, 3.0),                     # outra fonte: cobertura
              _p(3, "a_0", 4.0, 5.0, 40.0),                  # mesma câmera, outro momento: cobertura
              _p(4, "a", 5.0, 5.3, 15.0),                    # sincronizado e curto
              _p(5, "b", 5.3, 6.0, 9.0, janela={"x": 0, "y": 0, "w": 1, "h": 1})]   # PiP não conta
    assert [c["plano"] for c in coberturas({"voz": voz, "planos": planos})] == ["P2", "P3"]
    planos[0]["vel"], voz[0]["vel"] = 1.1, 1.1               # fala acelerada junto com a imagem continua em sincronia
    assert "P1" not in [c["plano"] for c in coberturas({"voz": voz, "planos": planos})]


def test_rosto_em_primeiro_plano_sobre_a_fala_reprova(tmp_path, dados):
    from motor.etapas.qa import CHECAGENS, cobertura_sintonia
    assert "cobertura_sintonia" in CHECAGENS and cobertura_sintonia.BLOQUEIA
    voz = [{"id": "V1", "fonte": "a", "s0": 10.0, "s1": 16.0, "t0": 0.0, "t1": 6.0, "vel": 1.0, "texto": "olha só essa promoção"}]
    planos = [_p(1, "a", 0.0, 2.0, 10.0), _p(2, "b", 2.0, 4.0, 3.0), _p(3, "b", 4.0, 6.0, 30.0)]
    r = cobertura_sintonia.checar(_cob(tmp_path, planos, voz, [0.4, 0.35, 0.0, 0.0, 0.1, 0.0]))
    assert not r["ok"] and "P2" in r["detalhe"] and "P3" not in r["detalhe"] and r["evidencia"] == ["qa/cobertura_P2_V1.jpg"]
    assert r["valor"][0]["rosto_largura"] == [0.4, 0.35, 0.0]
    ok = cobertura_sintonia.checar(_cob(tmp_path, planos, voz, [0.4, 0.0, 0.0, 0.25, 0.25, 0.25]))    # rosto passando em 1 de 3; plano médio (25%) passa em 1 de 3 quadros
    assert ok["ok"]


def test_cobertura_sem_detector_nao_passa_calada_e_sem_cobertura_passa(tmp_path, dados):
    from motor.etapas.qa import cobertura_sintonia
    voz = [{"id": "V1", "fonte": "a", "s0": 10.0, "s1": 16.0, "t0": 0.0, "t1": 6.0, "vel": 1.0, "texto": "olha"}]

    class Nenhum:
        nome = "nenhum"
    r = cobertura_sintonia.checar(_cob(tmp_path, [_p(2, "b", 2.0, 4.0, 3.0)], voz, [], det=Nenhum()))
    assert not r["ok"] and r["bloqueia"] and "NÃO VERIFICADO" in r["detalhe"]
    assert cobertura_sintonia.checar(_cob(tmp_path, [_p(1, "a", 0.0, 6.0, 10.0)], voz, [], det=Nenhum()))["ok"]


def test_contrato_do_qa_aceita_as_tres_checagens_novas(tmp_path, dados):
    import validar
    ids = validar.esquema("qa")["properties"]["checagens"]["items"]["properties"]["id"]["enum"]
    assert {"fala_cortada", "voz_externa", "cobertura_sintonia"} <= set(ids)


def test_fala_sem_texto_nao_vira_palavra(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import fala_cortada
    v = _v(1, 1.0, 2.6, 0.0, None)
    r = fala_cortada.checar(_conf(tmp_path, monkeypatch, [v], [(1.05, 2.45)]))
    assert r["ok"] and "none" not in r["detalhe"].lower() and "ultima_palavra" not in r["valor"][0]


def test_checagem_em_observacao_avisa_e_fora_dela_bloqueia(tmp_path, dados, monkeypatch):
    from motor.etapas import qa
    c = _vozes(tmp_path, monkeypatch, [(300, 0, 5), (300, 6, 10), (900, 11, 14)])
    monkeypatch.setattr(qa, "EM_OBSERVACAO", ("voz_externa",))
    item = qa._rodar("voz_externa", c)
    assert not item["ok"] and item["bloqueia"] is False and item["detalhe"].startswith("[em observação")
    monkeypatch.setattr(qa, "EM_OBSERVACAO", ())
    item = qa._rodar("voz_externa", c)
    assert not item["ok"] and item["bloqueia"] is True and "observação" not in item["detalhe"]


# ---------------------------------------------------------------- ajustes da revisão (Crivo, 19/11)
def test_corte_de_pausa_tambem_espera_a_voz_morrer():
    """O aperto de pausas cortava em fim-da-palavra + 0,10 s sem olhar a onda: reprovaria sempre igual, sem saída."""
    from motor.etapas.resolvedor import Resolvedor
    r = Resolvedor.__new__(Resolvedor)
    passo = 0.02
    serie = np.full(600, -60.0, np.float32)
    serie[50:120] = -20.0                                # "vem comigo": 1,00 a 2,40 s
    serie[120:132] = np.linspace(-21, -45, 12)           # cauda até ~2,64 s (a transcrição disse 2,20 s)
    serie[200:260] = -20.0                               # "agora": 4,00 a 5,20 s
    r.energias = {"a": serie, "_passo": {"a": passo}}
    r.r = {"pausa_max": 0.28, "folga_in": 0.06, "folga_out": 0.09}
    r.problemas, r.avisos = [], []
    pal = [[1.0, 1.5, "vem", 0.9], [1.6, 2.2, "comigo", 0.9], [4.0, 5.2, "agora", 0.9]]
    r.fala = {"F1": ({"id": "c1", "arquivo": "a"}, {"t0": 1.0, "t1": 5.2})}
    r._pal = {"c1": pal}
    res = r.resolver_fala({"id": "F1"})
    (a0, a1), (b0, b1) = res["pecas"]
    assert 2.5 <= a1 <= 2.75                             # antes parava em 2,30 s, no meio da cauda
    assert b0 == pytest.approx(3.9) and a1 < b0 - 0.02


def test_ultima_palavra_corrigida_conta_como_ouvida():
    from motor.etapas.qa.fala_cortada import _parecida
    assert _parecida("kal", "cal") and _parecida("creat", "create") and _parecida("mtt", "creatmtt")
    assert _parecida("agora", "agora") and not _parecida("agora", "comigo") and not _parecida("", "x")


def test_tom_longe_e_medicao_sem_cair_de_oitava():
    from motor.etapas import falante as F
    from motor.etapas.qa.voz_externa import _tom_longe
    assert not _tom_longe(1.0) and not _tom_longe(1.1) and _tom_longe(0.5) and _tom_longe(0.7) and _tom_longe(1.4)
    t = np.arange(F.SR) / F.SR
    for f0 in (110.0, 220.0):                            # homem e mulher, uma oitava: cada um na sua altura
        x = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 8)).astype(np.float32) * 0.1
        assert abs(F.tom_hz(x, F.SR) - f0) < 0.04 * f0


def test_modelo_de_voz_so_carrega_com_o_hash_conferido(tmp_path, monkeypatch):
    import io
    import urllib.request
    from motor.etapas import falante as F

    class Cfg:
        dados = tmp_path
    monkeypatch.delenv("EDITOR_FALANTE", raising=False)
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "1")
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: io.BytesIO(b"x" * 6_000_000))
    assert F._modelo(Cfg()) is None                      # baixou outra coisa: não vira modelo
    assert list((tmp_path / "modelos").iterdir()) == []  # e não deixa resto
