"""M2: movimento, tremor e nitidez a cada 0,5 s (motor/movimento.py) e o que a análise, o catálogo e o resolvedor fazem com isso.

Vídeo SINTÉTICO gerado aqui (textura de ruído recortada de um quadro maior): 0-3 s parado e nítido, 3-6 s tremendo
forte, 6-9 s câmera indo para a direita, 9-12 s parado e borrado. Nada baixa da internet.
"""
import copy
import json
import logging
import pathlib
import subprocess

import numpy as np
import pytest
import validar
from b_sintetico import TRILHAS, analise, direcao

from motor import movimento as MV
from motor.etapas import analise as AN
from motor.etapas import catalogo, resolvedor
from motor.memoria.loja import Loja


def _gerar(dest: pathlib.Path, w=640, h=360, fps=30, dur=12):
    import cv2
    rng = np.random.default_rng(1)
    base = cv2.GaussianBlur((rng.random((h + 400, w + 800)) * 255).astype(np.uint8), (0, 0), 2.0)
    base = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps),
                          "-i", "pipe:", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", str(dest)],
                         stdin=subprocess.PIPE)
    x, y = 400, 200
    for i in range(dur * fps):
        t = i / fps
        ox, oy = x, y
        if 3 <= t < 6:
            ox += int(rng.integers(-8, 9))
            oy += int(rng.integers(-8, 9))
        if 6 <= t < 9:
            x += 4
            ox = x
        f = base[oy:oy + h, ox:ox + w]
        if t >= 9:
            f = cv2.GaussianBlur(f, (0, 0), 4)
        p.stdin.write(np.ascontiguousarray(f).tobytes())
    p.stdin.close()
    assert p.wait() == 0
    return dest


@pytest.fixture(scope="module")
def video(tmp_path_factory):
    return _gerar(tmp_path_factory.mktemp("mov") / "v.mp4")


@pytest.fixture(scope="module")
def serie(video):
    return MV.medir(video, nice=False)


def _jan(s, a, b, k):
    return [v for t, v in zip(s["t"], s[k]) if a <= t < b]


# ---------------------------------------------------------------- medição
def test_medir_separa_firme_tremido_pan_e_borrado(serie):
    assert serie["passo"] == 0.5 and len(serie["t"]) == 24
    assert max(_jan(serie, 0, 2.5, "tremor")) < 0.5                        # parado: firme
    assert min(_jan(serie, 3.5, 5.5, "tremor")) > MV.LIMIAR_FORTE          # tremor forte no meio
    assert max(_jan(serie, 9.5, 12, "tremor")) < 0.5
    pan = _jan(serie, 6.5, 8.5, "pan_x")
    assert min(pan) > 150 and max(abs(v) for v in _jan(serie, 6.5, 8.5, "pan_y")) < 20   # 4 px/quadro a 640 = ~200 px/s a 1080
    assert max(_jan(serie, 9.5, 12, "nitidez")) < MV.NITIDEZ_BORRADO < min(_jan(serie, 0, 8.5, "nitidez"))


def test_melhor_trecho_e_estabilizacao(serie):
    a, b, nota = MV.melhor_trecho(serie, 2.0)
    assert b - a == pytest.approx(2.0) and (b <= 3.0 or 6.0 <= a) and b <= 9.0 and nota > 0.8
    a, b, _ = MV.melhor_trecho(serie, 1.0, 2.5, 7.0)                       # janela que cruza o tremor: foge dele
    assert b <= 3.05 or a >= 5.95
    assert MV.precisa_estabilizar(serie, 3, 6) and MV.tremor_forte(serie, 3.5, 5.5)
    assert not MV.precisa_estabilizar(serie, 0, 2.5)
    assert not MV.precisa_estabilizar(serie, 3, 6, escala=0.05)             # 4K reduzido para a saída: o tremor encolhe
    assert MV.precisa_estabilizar(serie, 0.5, 2.5, escala=1.0) is False


def test_direcao_do_movimento_e_resumo(serie):
    assert MV.direcao_do_movimento(serie, 7.5)["direcao"] == "direita"
    assert MV.direcao_do_movimento(serie, 1.0)["direcao"] == "parado"
    r = MV.resumo(serie)
    assert r["tremidos"] and r["tremidos"][0][0] <= 3.5 and r["tremidos"][0][1] >= 5.5
    assert r["melhores"] and all(not (a < 6 and b > 3) for a, b, _ in r["melhores"])   # nenhum melhor trecho no tremor
    assert all(not (a < 12 and b > 9.5) for a, b, _ in r["melhores"])                    # nem no borrado
    txt = MV.texto_camera(r, 640, 360)
    assert txt.startswith("horizontal 360p") and "tremido forte" in txt and "melhor" in txt and len(txt) <= 80


def test_series_feitas_a_mao_e_juntar():
    s = {"passo": 0.5, "t": [0, 0.5, 1, 1.5], "tremor": [0, 0, 0, 0], "pan_x": [-300] * 4, "pan_y": [0] * 4, "nitidez": [1] * 4}
    assert MV.direcao_do_movimento(s, 1)["direcao"] == "esquerda"
    s2 = dict(s, pan_x=[0] * 4, pan_y=[-200] * 4)
    assert MV.direcao_do_movimento(s2, 1)["direcao"] == "cima"
    j = MV.juntar([dict(s2, t=[10, 10.5, 11, 11.5]), s])
    assert j["t"][0] == 0 and j["t"][-1] == 11.5 and len(j["tremor"]) == 8


def test_ampliacao():
    assert MV.ampliacao(1920, 1080) == pytest.approx(1.778, abs=1e-3)      # horizontal virando 9:16
    assert MV.ampliacao(1080, 1920) == 1.0
    assert MV.ampliacao(2160, 3840) == 0.5                                  # 4K vertical sobra
    assert MV.ampliacao(1080, 1920, zoom=1.12) == pytest.approx(1.12)
    assert MV.ampliacao(None, 1920) is None


# ---------------------------------------------------------------- análise (sinal opcional)
class _Arm:
    def __init__(self, raiz):
        self.raiz = pathlib.Path(raiz)

    def caminho_local(self, chave):
        return pathlib.Path(chave) if chave.startswith("/") else self.raiz / chave

    def existe(self, chave):
        return self.caminho_local(chave).exists()

    def ler_json(self, chave):
        return json.loads(self.caminho_local(chave).read_text())

    def gravar_json(self, chave, obj):
        p = self.caminho_local(chave)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(obj))


def _ing(chave):
    return {"assinatura": "sig1", "midia": {"tem_video": True}, "derivados": {}, "arquivo": {"chave": chave}}


def test_analise_mede_guarda_cache_e_valida(video, tmp_path, monkeypatch):
    arm = _Arm(tmp_path)
    mov = AN.movimento(arm, "derivados/p/a001", _ing(str(video)))
    assert mov and mov["passo"] == 0.5 and arm.existe(mov["chave"]) and mov["tremidos"]
    monkeypatch.setattr(MV, "medir", lambda *a, **k: (_ for _ in ()).throw(AssertionError("refez a medição")))
    assert AN.movimento(arm, "derivados/p/a001", _ing(str(video))) == mov    # cache próprio: não mede de novo
    a = analise()
    a["sinais"]["movimento"] = mov
    assert validar.erros("analise", a) == []


def test_analise_falha_vira_aviso(tmp_path, caplog):
    ruim = tmp_path / "ruim.mp4"
    ruim.write_bytes(b"isto nao e video")
    with caplog.at_level(logging.WARNING, logger="motor.analise"):
        assert AN.movimento(_Arm(tmp_path), "derivados/p/a002", _ing(str(ruim))) is None
    assert "AVISO" in caplog.text
    sem_video = _ing(str(ruim))
    sem_video["midia"]["tem_video"] = False
    assert AN.movimento(_Arm(tmp_path), "derivados/p/a003", sem_video) is None


# ---------------------------------------------------------------- catálogo e resolvedor
def _serie_feita(dur=30.0, tremor=lambda t: 0.0, pan_x=0.0, nit=lambda t: 1.0):
    t = [round(i * 0.5, 2) for i in range(int(dur / 0.5))]
    return {"passo": 0.5, "versao": MV.VERSAO, "nitidez_ref": 50.0, "t": t, "tremor": [tremor(x) for x in t],
            "pan_x": [pan_x] * len(t), "pan_y": [0.0] * len(t), "nitidez": [nit(x) for x in t]}


def _com_mov(a, serie):
    a = copy.deepcopy(a)
    a["sinais"]["movimento"] = {"passo": 0.5, "chave": f"derivados/p_t/{a['arquivo']['id']}/movimento.json", **MV.resumo(serie)}
    return a


def test_catalogo_mostra_qualidade_ao_diretor():
    s = _serie_feita(tremor=lambda t: 6.0 if 10 <= t < 14 else 0.2)
    a1 = _com_mov(analise(), s)
    a2 = _com_mov(analise("a002", "20261118_110000.mov"), _serie_feita(tremor=lambda t: 8.0))
    a2["midia"].update(w=1920, h=1080)
    cat, txt = catalogo.montar([a1, a2], {"texto": "reel"}, "p_t")
    assert validar.erros("catalogo", cat) == []
    c1, c2 = cat["clipes"]
    assert c1["camera"].startswith("vertical 1080p") and "melhor" in c1["camera"] and c1["movimento"]["ampliacao"] == 1.0
    assert c2["movimento"]["ampliacao"] > 1.7 and c2["movimento"]["melhores"] == []
    assert "prefira C01" in txt and "evite C02" in txt
    _, txt_antigo = catalogo.montar([analise()], {"texto": "reel"}, "p_t")    # análise sem movimento: catálogo de antes
    assert "# câmera:" not in txt_antigo


def _resolver(analises, series, d=None):
    cat, _ = catalogo.montar(analises, {"texto": "reel"}, "p_t")
    loja = Loja()
    return resolvedor.resolver(d or direcao(), cat, analises, loja.modelo("evento-reel"), TRILHAS, vocabulario=loja.vocabulario(),
                               movimentos=series)


def test_resolvedor_cobertura_no_trecho_firme_e_estab():
    # torcida (M01.1, 14-20 s) treme forte até 17 s: a cobertura nasce depois disso; plano de fala firme fica "auto"
    s = _serie_feita(tremor=lambda t: 6.0 if 14 <= t < 17 else 0.1)
    an = analise()
    edl = _resolver([an], {"a001": s})
    assert validar.erros("edl", edl) == []
    cob = [p for p in edl["planos"] if 14 <= p["s0"] <= 20]
    assert cob and all(p["s0"] >= 16.9 for p in cob), [p["s0"] for p in cob]
    assert all(p["estab"] == "auto" for p in edl["planos"] if p["s0"] < 13)   # media_px 6 dos quadros-chave perde para a série
    sem = _resolver([an], {})
    assert any(p["s0"] == pytest.approx(14.15) for p in sem["planos"])         # sem série: regra antiga
    assert all(p["estab"] == "sim" for p in sem["planos"])
    tremido = _resolver([an], {"a001": _serie_feita(tremor=lambda t: 2.0)})
    assert all(p["estab"] == "sim" for p in tremido["planos"])                 # 2 px a 1080 x 1,78 (1920/1080) > 1,5


def test_resolvedor_ampliacao_troca_por_clipe_nativo():
    a1 = analise()
    a1["midia"].update(w=1920, h=1080)                                          # horizontal: 9:16 amplia 1,78x
    a2 = analise("a002", "20261118_110000.mov", falas=[(1.0, "olha a festa")])
    a2["visao"]["momentos"] = [{"t0": 3.0, "t1": 9.0, "tipo": "torcida", "desc": "torcida vertical", "nota": 4}]
    edl = _resolver([a1, a2], {})
    assert validar.erros("edl", edl) == []
    av = " | ".join(edl["origem"]["avisos"])
    assert "trocada por M02.1" in av and "C01: o recorte amplia a fonte 1,78x" in av
    assert any(p["fonte"] == "C02" and 3.0 <= p["s0"] <= 9.0 for p in edl["planos"])
    assert edl["origem"]["ampliacao"] and all(v > 1.0 for v in edl["origem"]["ampliacao"].values())


def test_whip_segue_o_movimento_da_camera():
    an = analise()
    edl = _resolver([an], {"a001": _serie_feita(pan_x=300.0)})                # câmera indo para a direita o tempo todo
    whip = [e for e in edl["fx"] if e["tipo"] == "whip"]
    assert whip and all(e["dir"] == -1 for e in whip)
    assert [x["pan"] for x in edl["sfx"] if x["som"] == "whip"] == [0.4]      # o som do whip vai para o mesmo lado
    parado = _resolver([an], {"a001": _serie_feita()})
    assert all("dir" not in e for e in parado["fx"] if e["tipo"] == "whip")


# ---------------------------------------------------------------- correções da revisão
def test_planos_sempre_arredondados_com_ou_sem_ampliacao():
    """Regressão: o arredondamento de t0/t1 tinha caído dentro do laço dos avisos de ampliação."""
    an = analise()
    for a in (an, dict(copy.deepcopy(an), midia=dict(an["midia"], w=1920, h=1080))):
        for edl in (_resolver([a], {}), _resolver([a], {"a001": _serie_feita()})):
            assert all(p[k] == round(p[k], 4) for p in edl["planos"] for k in ("t0", "t1"))


def test_planos_arredondados_mesmo_com_ruido(monkeypatch):
    """Força ruído de ponto flutuante no layout: o plano sai arredondado em 4 casas."""
    cls = next(v for v in vars(resolvedor).values() if isinstance(v, type) and hasattr(v, "_qualidade_planos"))
    orig = cls._qualidade_planos

    def com_ruido(self, planos):
        for p in planos:
            p["t0"] += 1e-9
            p["t1"] += 1e-9
        return orig(self, planos)
    monkeypatch.setattr(cls, "_qualidade_planos", com_ruido)
    edl = _resolver([analise()], {})                                            # 1080x1920 nativo: nenhum clipe em _amp
    assert all(p[k] == round(p[k], 4) for p in edl["planos"] for k in ("t0", "t1"))


def test_cobertura_com_serie_firme_mantem_margem_de_015():
    """Série plana: o trecho mais firme empata em tudo; a cobertura segue começando 0,15 s depois do corte da visão."""
    edl = _resolver([analise()], {"a001": _serie_feita()})
    assert any(p["s0"] == pytest.approx(14.15) for p in edl["planos"]), [p["s0"] for p in edl["planos"]]


def test_fonte_nativa_nao_gera_aviso_de_ampliacao():
    """O zoom criativo do enquadre não vira aviso (iria ao crítico pago); só a ampliação do formato avisa."""
    edl = _resolver([analise()], {})
    assert not any("amplia" in x for x in edl["origem"]["avisos"]), edl["origem"]["avisos"]
    edl2 = _resolver([analise()], {"a001": _serie_feita()})
    assert not any("amplia" in x for x in edl2["origem"]["avisos"])


def test_catalogo_tremor_na_escala_da_saida():
    """4K horizontal com 2,5 px a 1080: no recorte 9:16 vira ~7,9 px; catálogo e resolvedor dizem o mesmo."""
    a = _com_mov(analise(), _serie_feita(tremor=lambda t: 2.5))
    a["midia"].update(w=3840, h=2160)
    cat, _ = catalogo.montar([a], {"texto": "reel"}, "p_t")
    tr = cat["clipes"][0]["movimento"]["tremor"]
    assert tr == pytest.approx(2.5 * MV.escala_saida(3840, 2160), abs=0.01) and tr > MV.LIMIAR_FORTE
    assert "tremido forte" in cat["clipes"][0]["camera"]
    assert validar.erros("catalogo", cat) == []
    s = _serie_feita(tremor=lambda t: 2.5)
    assert MV.melhor_trecho(s, 2.0, escala=3.16)[2] < MV.melhor_trecho(s, 2.0)[2]   # a nota também enxerga a escala


def test_clipe_inteiro_mole_e_tremor_nao_medido():
    """Nitidez é relativa ao clipe: o clipe TODO mole é pego pela mediana do projeto; falhas altas não passam por firme."""
    an = [_com_mov(analise(f"a00{k}", f"20261118_1{k}0000.mov"), _serie_feita()) for k in range(1, 5)]
    an[2]["sinais"]["movimento"]["nitidez_ref"] = 5.0                          # os outros: 50
    an[3]["sinais"]["movimento"]["falhas"] = 0.6
    cat, txt = catalogo.montar(an, {"texto": "reel"}, "p_t")
    assert validar.erros("catalogo", cat) == []
    c = {x["id"]: x for x in cat["clipes"]}
    assert c["C03"]["movimento"]["nitidez_rel"] == pytest.approx(0.1) and c["C01"]["movimento"]["nitidez_rel"] == 1.0
    linha = next(x for x in txt.splitlines() if x.startswith("# câmera:"))
    assert "evite C03" in linha and "C03" not in linha.split("prefira")[1].split(";")[0]
    assert "tremor não medido" in c["C04"]["camera"] and catalogo._qualidade(c["C04"]) < catalogo._qualidade(c["C01"])
    an_val = copy.deepcopy(an[3])
    assert validar.erros("analise", an_val) == []


def test_troca_nao_aceita_substituto_tremido():
    a1 = analise()
    a1["midia"].update(w=1920, h=1080)
    a2 = analise("a002", "20261118_110000.mov", falas=[(1.0, "olha a festa")])
    a2["visao"]["momentos"] = [{"t0": 3.0, "t1": 9.0, "tipo": "torcida", "desc": "torcida vertical", "nota": 4}]
    edl = _resolver([a1, a2], {"a001": _serie_feita(), "a002": _serie_feita(tremor=lambda t: 8.0)})
    assert not any("trocada" in x for x in edl["origem"]["avisos"])
    edl = _resolver([a1, a2], {"a001": _serie_feita(), "a002": _serie_feita()})      # substituto firme: troca
    assert any("trocada por M02.1" in x for x in edl["origem"]["avisos"])


def test_whip_so_mexe_no_som_do_proprio_whip():
    edl = _resolver([analise()], {"a001": _serie_feita(pan_x=-300.0)})         # câmera indo para a esquerda
    assert all(e["dir"] == 1 for e in edl["fx"] if e["tipo"] == "whip")
    assert [x["pan"] for x in edl["sfx"] if x["som"] == "whip"] == [-0.4]
    assert all(x["pan"] == 0 for x in edl["sfx"] if x["som"] != "whip")


def test_ffmpeg_com_stderr_enorme_nao_trava(video, monkeypatch):
    """Arquivo corrompido gera milhares de linhas de erro: com stderr em PIPE lido só no fim, o ffmpeg travava."""
    import threading
    real = MV.subprocess.Popen

    def popen(cmd, **kw):
        sh = 'yes "error while decoding MB 12 34" | head -c 400000 >&2; exec "$@"'
        return real(["sh", "-c", sh, "sh", *cmd], **kw)
    monkeypatch.setattr(MV.subprocess, "Popen", popen)
    out = {}
    th = threading.Thread(target=lambda: out.setdefault("s", MV.medir(video, nice=False)), daemon=True)
    th.start()
    th.join(90)
    assert not th.is_alive(), "medir travou com stderr cheio"
    assert len(out["s"]["t"]) == 24


def test_juntar_renormaliza_nitidez_e_tremidos_nao_atravessam_buraco():
    a = {"passo": 0.5, "t": [0, 0.5, 1.0, 1.5], "tremor": [5.0] * 4, "pan_x": [0] * 4, "pan_y": [0] * 4, "nitidez": [1.0] * 4,
         "nitidez_ref": 100.0, "falhas": 0.0}
    b = dict(a, t=[10, 10.5, 11, 11.5], nitidez_ref=10.0, falhas=0.4)          # trecho todo mole: 1,0 do próprio p90
    j = MV.juntar([b, a])
    assert j["nitidez"][:4] == [1.0] * 4 and max(j["nitidez"][4:]) < 0.2 and j["falhas"] == pytest.approx(0.2)
    assert MV.trechos_tremidos(j) == [[0.0, 2.0, 5.0], [10.0, 12.0, 5.0]]       # dois trechos, não um de 0 a 12


def test_texto_camera_1440p_e_melhor_nunca_some():
    r = {"tremor_p90": 9.0, "borrado_pct": 0.55, "tremidos": [[100.5, 120.5, 9], [130.5, 150.5, 9]],
         "melhores": [[10.5, 12.5, 0.9], [200.5, 202.5, 0.8], [300.5, 302.5, 0.7]]}
    txt = MV.texto_camera(r, 2560, 1440)
    assert txt.startswith("horizontal 1440p") and "melhor 10.5-12.5" in txt and len(txt) <= 80


def test_analise_por_trechos_e_cache_negativo(video, tmp_path, monkeypatch):
    arm = _Arm(tmp_path)
    ing = _ing(str(video))
    ing["derivados"]["trechos"] = [{"chave": str(video), "ini": 0.0}, {"chave": str(video), "ini": 100.0}]
    mov = AN.movimento(arm, "derivados/p/a010", ing)
    serie = arm.ler_json(mov["chave"])
    assert serie["t"][0] == 0 and serie["t"][-1] == pytest.approx(111.5) and len(serie["t"]) == 48
    ruim = tmp_path / "ruim.mp4"
    ruim.write_bytes(b"nao e video")
    assert AN.movimento(arm, "derivados/p/a011", _ing(str(ruim))) is None
    monkeypatch.setattr(MV, "medir", lambda *a, **k: (_ for _ in ()).throw(AssertionError("mediu de novo")))
    assert AN.movimento(arm, "derivados/p/a011", _ing(str(ruim))) is None        # a falha ficou guardada
    assert AN.movimento(arm, "derivados/p/a011", dict(_ing(str(ruim)), assinatura="outra")) is None   # fonte nova tenta


def test_direcao_carrega_as_series(tmp_path):
    from motor.etapas import direcao as DI
    arm = _Arm(tmp_path)
    arm.gravar_json("derivados/p/a001/movimento.json", _serie_feita(dur=2))
    an = {"a001": {"sinais": {"movimento": {"chave": "derivados/p/a001/movimento.json"}}},
          "a002": {"sinais": {}}, "a003": {"sinais": {"movimento": {"chave": "derivados/p/a003/sumiu.json"}}}}
    out = DI._movimentos(arm, an)
    assert list(out) == ["a001"] and out["a001"]["passo"] == 0.5
