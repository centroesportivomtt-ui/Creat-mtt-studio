"""M4 (pedido do dono, 25/11): duas músicas emendadas no mesmo tom e no tempo, cor viva como padrão e câmera lenta só
de verdade. Tudo com áudio e imagem SINTÉTICOS gerados aqui (nada baixado)."""
import copy
import subprocess

import numpy as np
import pytest
import soundfile as sf
import validar
from b_sintetico import TRILHAS, analise, direcao
from scipy.signal import butter, sosfilt

from motor import musica as MU
from motor.etapas import catalogo, resolvedor
from motor.etapas import cor as C
from motor.etapas.montagem import trilha as TR
from motor.etapas.montagem.comum import SR
from motor.memoria.loja import Loja

DO_MAIOR = [261.63, 329.63, 392.0]
LA_MENOR = [220.0, 261.63, 329.63]
FA_SUS_MAIOR = [369.99, 466.16, 554.37]        # fá# maior: longe de dó maior no círculo de quintas


def _faixa(bpm, dur, acorde, click_hz, partes, fase=0.0):
    """Acorde sustentado + clique na batida (mais forte no 1 do compasso) com partes de energia diferente."""
    t = np.arange(int(dur * SR)) / SR
    x = np.zeros_like(t)
    for f in acorde:
        for h, a in ((1, 1.0), (2, 0.4), (3, 0.15)):
            x += a * np.sin(2 * np.pi * f * h * t)
    x *= 0.05
    amp = np.ones_like(t)
    for a, b, g in partes:
        amp[(t >= a) & (t < b)] = g
    x *= amp
    n = int(0.025 * SR)
    env = np.exp(-np.arange(n) / SR * 180) * np.sin(2 * np.pi * click_hz * np.arange(n) / SR)
    b, k = 60.0 / bpm, 0
    while fase + k * b < dur - 0.03:
        i = int(round((fase + k * b) * SR))
        x[i:i + n] += env * (0.25 if k % 4 == 0 else 0.15) * amp[i]
        k += 1
    return x.astype(np.float32)


def _registrar(tmp_path, nome, bpm, acorde, click_hz, partes, dur=40.0):
    x = _faixa(bpm, dur, acorde, click_hz, partes)
    arq = tmp_path / f"{nome}.wav"
    sf.write(str(arq), np.stack([x, x], 1), SR)
    return {"id": nome, "chave": f"biblioteca/trilhas/{nome}.wav", "bpm": float(bpm), "bpm_medido": True, "fase": 0.0, "dur": dur,
            **MU.mapa(x, SR, bpm, 0.0)}, arq, x


def _resolvedor_so_musica(d, trilhas):
    """Só o pedaço do resolvedor que emenda as músicas (o resto do filme não interessa aqui)."""
    R = object.__new__(resolvedor.Resolvedor)
    R.d, R.trilhas, R.avisos = d, trilhas, []
    return R


def _onsets(y, hz, de, ate, limiar):
    banda = sosfilt(butter(4, [hz * 0.8, hz * 1.25], "bp", fs=SR, output="sos"), y)
    env = np.abs(banda)
    i0, i1 = int(de * SR), int(ate * SR)
    out, i = [], i0
    while i < i1:
        if env[i] > limiar:
            out.append(i / SR)
            i += int(0.15 * SR)
        else:
            i += 1
    return out


# ---------------------------------------------------------------- (1) emenda de músicas
def test_ponto_de_troca_casa_tom_e_tempo_e_respira_quando_nao_casa():
    a = {"tom": "dó maior", "secoes": [{"t0": 0, "t1": 8, "energia": 2}, {"t0": 8, "t1": 24, "energia": 5}, {"t0": 24, "t1": 40, "energia": 2}]}
    b = {"tom": "lá menor", "secoes": [{"t0": 0, "t1": 8.3, "energia": 1}, {"t0": 8.3, "t1": 40, "energia": 5}]}
    pt = MU.ponto_de_troca(a, b, 120, 0.0, 116, 0.0, alvo_a=22.0)
    assert pt["modo"] == "casada" and pt["combina"] and pt["sai_a"] == 24.0                    # fim de parte, no 1 do compasso
    assert pt["razao"] == pytest.approx(120 / 116, abs=1e-4)                                   # B esticada para o tempo de A
    compasso_b = 4 * 60 / 116
    assert pt["entra_b"] / compasso_b == pytest.approx(round(pt["entra_b"] / compasso_b), abs=1e-3)
    assert pt["xf"] == pytest.approx(2.0)                                                      # um compasso de A
    # tempo a mais de 6%: respiro, sem esticar, e A sai de preferência no fim de uma parte calma
    lenta = MU.ponto_de_troca(a, b, 120, 0.0, 100, 0.0, alvo_a=22.0)
    assert lenta["modo"] == "respiro" and lenta["razao"] == 1.0 and "6%" in lenta["motivo"]
    # tom que não combina: respiro mesmo com o tempo igual
    longe = MU.ponto_de_troca(a, {**b, "tom": "fá# maior"}, 120, 0.0, 120, 0.0, alvo_a=22.0)
    assert longe["modo"] == "respiro" and not longe["combina"] and "tom" in longe["motivo"]
    # dobro do tempo casa (60 contra 120 bpm é a mesma grade)
    assert MU.razao_de_tempo(120, 61) == (pytest.approx(120 / 122, abs=1e-4), True)
    # B sem música suficiente depois da entrada: não há troca possível
    assert MU.ponto_de_troca(a, b, 120, 0.0, 116, 0.0, dur_b=40, precisa_b=60) is None


def test_duas_trilhas_emendadas_na_batida_sem_buraco_e_sem_estalo(tmp_path):
    ta, arq_a, xa = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tb, arq_b, xb = _registrar(tmp_path, "tb", 116, LA_MENOR, 5000, [(0, 8.276, 0.3), (8.276, 30, 1.0), (30, 40, 0.6)])
    assert (ta["tom"], tb["tom"]) == ("dó maior", "lá menor") and MU.combina(ta["tom"], tb["tom"])
    assert [x["t1"] for x in ta["secoes"]][:2] == [8.0, 24.0]                                  # partes no degrau real da energia
    D = 40.0
    edl = {"duracao": D, "blocos": [], "origem": {}, "qa": {"riscos": []},
           "trilha": {"chave": ta["chave"], "bpm": 120.0, "fase": 0.0, "emendas": [[0.0, 0.0, D, 0.0]], "acorde_final": 29.0}}
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb"]}}, [ta, tb])
    edl = R._emendar_musicas(edl)
    fa, fb = edl["trilha"]["faixas"]
    assert edl["trilha"]["emendas"] == [] and fb["modo"] == "casada" and fb["razao"] == pytest.approx(120 / 116, abs=1e-4)
    T = fb["troca_em"]
    assert T == 24.0 and fb["entra_em"] == pytest.approx(23.0)          # A sai do auge dela; B entra no auge dela (energia 5 com 5)
    assert (T / 2.0) == pytest.approx(round(T / 2.0), abs=1e-3)                                # 1 do compasso de A (2 s a 120)
    s_b_em_T = fb["s_de"] + (T - fb["entra_em"]) * fb["razao"]
    compasso_b = 4 * 60 / 116
    assert s_b_em_T / compasso_b == pytest.approx(round(s_b_em_T / compasso_b), abs=1e-3)      # 1 do compasso de B
    assert edl["origem"]["musicas"][0]["modo"] == "casada"
    out, rel = TR.montar_trilha(edl, arq_a, {ta["chave"]: arq_a, tb["chave"]: arq_b})
    y = out[:, 0].astype(np.float64)
    assert len(rel["faixas"]) == 2 and abs(rel["faixas"][1]["ganho_db"]) <= 6.0
    # batidas de B (clique de 5 kHz) caem na grade de A depois da troca (esticamento casado)
    ons = [t for t in _onsets(y, 5000, T, D - 2.0, 0.02)]
    assert len(ons) >= 10
    erro = [abs(t - round(t / 0.5) * 0.5) for t in ons]
    assert max(erro) < 0.004, erro                                                             # fatiado na batida: sem deriva
    # no cruzamento as batidas das duas coincidem
    ons_a = _onsets(y, 2000, fb["entra_em"], T + 0.4, 0.02)
    ons_b = _onsets(y, 5000, fb["entra_em"] + 0.4, T + 0.4, 0.02)
    assert ons_a and ons_b and all(min(abs(b - a) for a in ons_a) < 0.015 for b in ons_b)
    # sem buraco: nível de 50 ms nunca afunda no cruzamento
    w = int(0.05 * SR)
    rms = [np.sqrt(np.mean(y[i:i + w] ** 2)) for i in range(int((T - 3) * SR), int((T + 3) * SR), w)]
    assert min(rms) > 0.5 * float(np.median(rms))
    # sem estalo: nenhum salto de amostra maior que o do próprio sinal
    g = 10 ** (max(0.0, rel["faixas"][1]["ganho_db"]) / 20)
    passo_fonte = max(np.abs(np.diff(xa)).max(), np.abs(np.diff(xb)).max() * g)
    trecho = y[int((fb["entra_em"] - 0.2) * SR):int((fb["entra_em"] + fb["xf"] + 0.2) * SR)]
    assert np.abs(np.diff(trecho)).max() <= 1.5 * passo_fonte


@pytest.mark.parametrize("razao", [1.05, 0.95])
def test_esticar_na_batida_mantem_a_grade_e_nao_abre_buraco(razao):
    """Acelerando corta a cauda de cada batida; desacelerando repete a cauda. Nos dois, o ataque cai exato na grade nova."""
    bpm = 110.0
    x = _faixa(bpm, 12.0, LA_MENOR, 5000, [(0, 12, 1.0)])
    y = TR.esticar_na_batida(np.stack([x, x], 1), razao, bpm, 0.0)[:, 0].astype(np.float64)
    assert len(y) == pytest.approx(len(x) / razao, abs=2)
    nova = 60.0 / bpm / razao
    ons = _onsets(y, 5000, 0.3, len(y) / SR - 0.5, 0.02)
    assert len(ons) >= 15 and max(abs(t - round(t / nova) * nova) for t in ons) < 0.002
    w = int(0.02 * SR)
    rms = [np.sqrt(np.mean(y[i:i + w] ** 2)) for i in range(SR, len(y) - SR, w)]
    assert min(rms) > 0.6 * float(np.median(rms))
    assert np.abs(np.diff(y)).max() <= 1.2 * np.abs(np.diff(x)).max()


def test_tom_que_nao_combina_troca_num_respiro_e_avisa(tmp_path):
    ta, arq_a, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tc, arq_c, _ = _registrar(tmp_path, "tc", 120, FA_SUS_MAIOR, 5000, [(0, 8, 0.3), (8, 40, 1.0)])
    assert not MU.combina(ta["tom"], tc["tom"])
    edl = {"duracao": 30.0, "blocos": [], "origem": {}, "qa": {"riscos": []},
           "trilha": {"chave": ta["chave"], "bpm": 120.0, "fase": 0.0, "emendas": [[0.0, 0.0, 30.0, 0.0]], "acorde_final": None}}
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tc", "inexistente"]}}, [ta, tc])
    edl = R._emendar_musicas(edl)
    fc = edl["trilha"]["faixas"][1]
    assert fc["modo"] == "respiro" and fc["razao"] == 1.0 and fc["xf"] <= 0.6
    assert any("respiro" in a for a in edl["qa"]["riscos"]) and any("inexistente" in a for a in R.avisos)
    out, _ = TR.montar_trilha(edl, arq_a, {ta["chave"]: arq_a, tc["chave"]: arq_c})
    assert np.isfinite(out).all() and np.abs(out[int(fc["troca_em"] * SR) + SR:]).max() > 0.01      # a 2a música toca até o fim


def test_resolvedor_com_duas_trilhas_gera_edl_valido():
    an = analise()
    cat, _ = catalogo.montar([an], {"texto": "reel"}, "p_t")
    loja = Loja()
    d = direcao()
    d["trilha"] = {**d["trilha"], "id": None, "ids": ["t_teste", "t_b"], "troca_em": ["B2"]}
    trilhas = [{**TRILHAS[0], "tom": "dó maior", "secoes": [{"t0": 0, "t1": 4, "energia": 3}, {"t0": 4, "t1": 12, "energia": 4},
                                                            {"t0": 12, "t1": 60, "energia": 5}]},
               {"id": "t_b", "clima": "energia", "bpm": 118.0, "dur": 60.0, "fase": 0.0, "chave": "/tmp/nao_existe_b.wav", "tom": "sol maior",
                "secoes": [{"t0": 0, "t1": 6, "energia": 2}, {"t0": 6, "t1": 60, "energia": 4}]}]
    assert validar.erros("direcao", d) == []
    edl = resolvedor.resolver(d, cat, [an], loja.modelo("evento-reel"), trilhas, vocabulario=loja.vocabulario())
    assert validar.erros("edl", edl) == []
    fx = edl["trilha"]["faixas"]
    assert [f["id"] for f in fx] == ["t_teste", "t_b"] and edl["trilha"]["chave"] == fx[0]["chave"]
    assert fx[1]["modo"] == "casada" and 0 < fx[1]["troca_em"] < edl["duracao"]
    # direção antiga (uma música) continua igual: sem faixas
    assert "faixas" not in resolvedor.resolver(direcao(), cat, [an], loja.modelo("evento-reel"), TRILHAS, vocabulario=loja.vocabulario())["trilha"]


# ---------------------------------------------------------------- (2) cor viva como padrão
def _natureza():
    """Céu, mata e flor: o tipo de imagem que o dono quer "brilhando", nunca cinzenta."""
    img = np.zeros((320, 180, 3), np.uint8)
    img[:110] = (215, 160, 90)        # céu (BGR)
    img[110:250] = (50, 150, 60)      # mata
    img[250:] = (40, 70, 200)         # flor / terra quente
    img[150:200, 60:120] = (30, 200, 230)
    return (img.astype(np.int16) + np.random.default_rng(1).integers(-8, 8, img.shape)).clip(0, 255).astype(np.uint8)


def test_nenhum_look_padrao_deixa_a_imagem_mais_cinza():
    img = _natureza()
    for nome in C.LOOKS:
        if C.dessatura(nome):
            continue
        for bal in (None, {"ganho": [1.05, 1.0, 0.94], "exp": 1.2}):
            out = C.aplicar(img, nome, bal)
            assert C._croma(out) >= C._croma(img) * 0.99, nome
            assert C.medir(out)["sat_media"] >= C.medir(img)["sat_media"] * 0.99, nome


def test_look_vintage_e_compensado_e_so_o_pedido_dessatura(monkeypatch):
    img = _natureza()
    vintage = {**C.LOOKS["neutro"], "lift": [0.06, 0.05, 0.04], "con": 0.0, "sat": 0.75, "pele": 0.0}
    monkeypatch.setitem(C.LOOKS, "_vintage", vintage)
    monkeypatch.setitem(C.LOOKS, "_memoria", {**vintage, "dessatura": True})
    C._CACHE.clear()
    viva, palida = C.aplicar(img, "_vintage", None), C.aplicar(img, "_memoria", None)
    assert C._croma(viva) >= C._croma(img) * 0.99                  # o look pedia 0,75: o piso subiu a saturação
    assert C._croma(palida) < C._croma(img) * 0.9                  # só o look marcado pela direção sai pálido
    # o .cube exportado usa a mesma saturação viva do render
    assert C.sat_efetiva("_vintage", C._tabelas("_vintage", None)[0]) > 0.75
    C._CACHE.clear()


def test_checagem_de_saturacao_avisa_sem_travar():
    from motor.etapas.qa import cor_medida
    antes, depois = {"sat_media": 0.40}, {"sat_media": 0.30}
    r = C.checar_saturacao(antes, depois, "loja")
    assert r["antes"] == 0.4 and r["depois"] == 0.3 and r["aviso"] and "pálida" in r["aviso"]
    assert C.checar_saturacao(antes, {"sat_media": 0.41}, "loja")["aviso"] is None
    assert C.checar_saturacao(antes, depois, "matriz_memoria")["aviso"] is None          # pedido pela direção
    assert C.checar_saturacao({"sat_media": 0.01}, {"sat_media": 0.0}, "loja")["aviso"] is None   # fonte já sem cor

    class Conf:
        edl = {"planos": [{}]}
        cor = [{"plano": "P1", "look": "loja", "antes": {"p50": 0.45, "estouro": 0, "esmagado": 0, "pele": None, "sat_media": 0.4},
                "depois": {"p50": 0.45, "estouro": 0, "esmagado": 0, "pele": None, "sat_media": 0.3}}]
    r = cor_medida.checar(Conf())
    assert not r["ok"] and "pálida" in r["detalhe"] and r["valor"][0]["sat"] == [0.4, 0.3] and cor_medida.BLOQUEIA is False


def test_relatorio_de_cor_mede_a_fonte_e_a_saida_por_plano(tmp_path):
    from motor.etapas import montagem as MONT
    from motor.etapas.montagem import planos as PL
    src = tmp_path / "s.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-pix_fmt", "yuv420p",
                    str(src)], check=True)
    p = {"id": "P", "t0": 0, "t1": 0.5, "fonte": "a", "s0": 0.1, "estab": "nao", "cor": "rua_dia",
         "balanco": {"ganho": [1.0, 1.0, 1.0], "exp": 1.0}}
    out = tmp_path / "p.mp4"
    info = PL.render_plano(p, str(src), 0.0, str(out), {"w": 270, "h": 480, "fps": 30}, nice=0)
    assert "cor" in info
    itens = MONT.revisao_cor({"planos": [p]}, {"P": {"arquivo": str(out)}}, tmp_path / "cor")
    sat = itens[0]["saturacao"]
    assert sat["antes"] > 0.1 and sat["depois"] >= sat["antes"] * C.SAT_TOLERANCIA and sat["aviso"] is None


# ---------------------------------------------------------------- (3) câmera lenta verdadeira
def test_vel_minima_pelo_fps_da_fonte():
    assert resolvedor.vel_minima(60, 30) == pytest.approx(0.475)
    assert resolvedor.vel_minima(59.94, 30) <= 0.5                 # 59,94 fps faz 0,5x em 30
    assert resolvedor.vel_minima(120, 30) <= 0.25                  # 120 fps faz 0,25x
    assert resolvedor.vel_minima(30, 30) == pytest.approx(0.95) and resolvedor.vel_minima(None, 30) == 1.0
    assert resolvedor.vel_minima(240, 30) == pytest.approx(0.11875, abs=2e-4)


@pytest.mark.parametrize("fps,lento,esperado,avisa", [(30.0, 0.5, 0.95, True), (60.0, 0.5, 0.5, False), (120.0, 0.25, 0.25, False),
                                                      (60.0, 0.25, 0.475, True)])
def test_lento_no_resolvedor_so_com_quadros_de_verdade(fps, lento, esperado, avisa):
    an = analise()
    an["midia"]["fps"] = fps
    cat, _ = catalogo.montar([an], {"texto": "reel"}, "p_t")
    loja = Loja()
    modelo = copy.deepcopy(loja.modelo("evento-reel"))
    modelo.setdefault("cobertura", {})["lento_vel"] = lento
    edl = resolvedor.resolver(direcao(), cat, [an], modelo, TRILHAS, vocabulario=loja.vocabulario())
    lentos = [p for p in edl["planos"] if p["vel"] < 1.0]
    assert lentos and all(p["vel"] == pytest.approx(esperado, abs=1e-4) for p in lentos)
    assert all(fps * p["vel"] >= 30 * 0.95 - 1e-6 for p in lentos)
    assert any("fps" in a and "lenta" in a for a in edl["origem"]["avisos"]) == avisa
    assert validar.erros("edl", edl) == []
