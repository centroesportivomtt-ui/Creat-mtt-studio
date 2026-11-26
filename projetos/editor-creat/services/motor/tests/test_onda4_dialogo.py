"""Onda 4, item 4 (D46, D47): a conferência entende diálogo de duas pessoas e duas câmeras, SÓ com `vozes = varias`.

Caso real de 26/11 (anúncio de diálogo do Super Kal): V1, V2 e V3 seguradas por `fala_cortada` (falas coladas), `voz_externa`
(som direto do plano de apoio com a conversa), `cobertura_sintonia` (segunda câmera com rosto sobre a fala, sem sincronia entre
câmeras) e `frase_repetida`. Cada afrouxamento tem os dois lados com o MESMO áudio: `varias` aprova, `uma` reprova, e o defeito de
verdade (murmúrio da equipe, eco, outra cena, a mesma pessoa continuando, corte fora do vale, plano desalinhado, laço no tom de
sala) continua reprovando em `varias`.

Material: `sintetico_dialogo.py` (duas vozes de F0 diferente, câmera B atrasada 3,217 s, murmúrio da equipe). Assinatura de voz
falsa por altura da voz e transcritor falso que "ouve" a verdade do gerador (sem modelo, sem rede, sem custo)."""
import re
import subprocess

import numpy as np
import pytest

import sintetico_dialogo as S
from motor import config

D = S.ATRASO_B
SR = 16000


class _AssinadorPorTom:
    """Vozes diferentes = vetores diferentes, decididos pela altura da voz (A ~125 Hz, B ~235 Hz)."""
    disponivel = True

    def __init__(self, *_a, **_k):
        pass

    def assinar(self, x, sr, minimo=0.8):
        from motor.etapas.falante import tom_hz
        if len(x) < minimo * sr:
            return None
        t = tom_hz(x, sr)
        if not t:
            return None
        return np.array([1.0, 0.0, 0.0] if t > 190 else [0.0, 1.0, 0.0], np.float32)


@pytest.fixture(autouse=True)
def _voz_falsa(monkeypatch):
    from motor.etapas import falante
    monkeypatch.setattr(falante, "Assinador", _AssinadorPorTom)


@pytest.fixture(scope="module")
def material(tmp_path_factory):
    return S.escrever(tmp_path_factory.mktemp("dialogo"))


def _verdade(fid: str) -> list[list]:
    """As palavras que se ouvem de verdade em cada câmera (relógio do arquivo): os turnos das duas pessoas, sem o murmúrio."""
    desloc = 0.0 if fid == "camA" else D
    return [w for s in S.segmentos(S.TURNOS, desloc) for w in s["palavras"]]


def _tr(texto_ou_palavras) -> dict:
    if isinstance(texto_ou_palavras, str):
        ws = texto_ou_palavras.split()
        pal = [[round(0.3 * i, 2), round(0.3 * i + 0.25, 2), w, 0.9] for i, w in enumerate(ws)]
    else:
        pal = texto_ou_palavras
    return {"segmentos": [{"s": 0.0, "e": 99.0, "texto": " ".join(w[2] for w in pal), "palavras": pal}] if pal else []}


class _Ouvido:
    """Transcritor falso: janelas de fonte ouvem a verdade do gerador; o mix e os stems ouvem o que o teste mandar."""

    def __init__(self, **textos):
        self.textos = textos
        self.janelas = []

    def __call__(self, conf, nome, arq, **_k):
        m = re.match(r"janela:(\w+):([\d.]+)-([\d.]+)$", nome)
        if m:
            fid, a, b = m.group(1), float(m.group(2)), float(m.group(3))
            self.janelas.append(nome)
            pal = [[round(w[0] - a, 3), round(w[1] - a, 3), w[2], w[3]] for w in _verdade(fid) if w[0] >= a - 0.05 and w[1] <= b + 0.05]
            return _tr(pal)
        return _tr(self.textos.get(nome, ""))


def _ouvir(monkeypatch, ouvido):
    from motor.etapas import qa
    monkeypatch.setattr(qa.Conferencia, "transcrever", lambda self, nome, arq, **k: ouvido(self, nome, arq, **k))
    return ouvido


def _edl(material, voz, planos=(), modo="varias", dur=4.0, **kw):
    e = {"versao": "1", "projeto": "p", "formato": {"w": 270, "h": 480, "fps": 30}, "duracao": dur, "fontes": material["fontes"],
         "voz": list(voz), "planos": list(planos), "motion": [], "legendas": {"palavras": []}, "trilha": {"chave": None}, "sfx": [],
         "master": {"lufs": -14, "tp": -1.0}, "origem": {"vozes": modo}}
    e.update(kw)
    return e


def _peca(i, fonte, s0, s1, t0, texto):
    return {"id": i, "fonte": fonte, "s0": s0, "s1": s1, "t0": t0, "t1": round(t0 + s1 - s0, 3), "vel": 1.0, "texto": texto}


def _plano(i, fonte, s0, t0, t1, **kw):
    return {"id": i, "fonte": fonte, "s0": round(s0, 3), "t0": t0, "t1": t1, "vel": 1.0, **kw}


def _conferir(tmp_path, edl, so, final=None, **kw):
    from motor.etapas import qa
    from motor.etapas.montagem.comum import Fontes
    rel = qa.conferir(final or tmp_path / "final.mp4", edl, config.carregar(), evidencias=tmp_path / "qa", fontes=Fontes(edl), so=so, **kw)
    return rel, {x["id"]: x for x in rel["checagens"]}


def _com(modo, edl):
    return {**edl, "origem": {**edl.get("origem", {}), "vozes": modo}}


# ================================================================== 4a frase_repetida
FRASE = S.FRASE


def _edl_frase(material, **kw):
    """V1: A diz a FRASE e B repete na câmera A (o texto da peça só tem a fala de A); V2: B diz a FRASE de novo (câmera B)."""
    return _edl(material, [_peca("V1", "camA", 10.5, 18.3, 0.0, FRASE), _peca("V2", "camB", 23.3 + D, 26.9 + D, 7.8, FRASE)], dur=11.4, **kw)


def test_4a_frase_dita_tres_vezes_no_dialogo(tmp_path, dados, material, monkeypatch):
    from motor.etapas import qa
    ouvido = _Ouvido(mix=" ".join([FRASE] * 3))
    _ouvir(monkeypatch, ouvido)
    edl = _edl_frase(material)
    rel, c = _conferir(tmp_path, edl, ["frase_repetida"])
    assert rel["aprovado"], c["frase_repetida"]["detalhe"]
    assert "diálogo: 2 janela(s) de fonte ouvida(s)" in c["frase_repetida"]["detalhe"] and len(ouvido.janelas) == 2
    rel, c = _conferir(tmp_path, _com("uma", edl), ["frase_repetida"])         # o mesmo áudio, uma voz só: reprova
    assert not rel["aprovado"] and "3x no mix (roteiro tem 2x)" in c["frase_repetida"]["detalhe"]
    rel, _ = _conferir(tmp_path, _com("auto", edl), ["frase_repetida"])
    assert not rel["aprovado"]


def test_4a_frase_que_nao_esta_na_fonte_ou_uma_vez_a_mais_reprova(tmp_path, dados, material, monkeypatch):
    from motor.etapas import qa
    laco = "corta faz de novo agora"
    _ouvir(monkeypatch, _Ouvido(mix=" ".join([FRASE] * 3 + [laco] * 3)))
    rel, c = _conferir(tmp_path, _edl_frase(material), ["frase_repetida"])
    d = c["frase_repetida"]["detalhe"]
    assert not rel["aprovado"] and ("corta faz de" in d or "faz de novo" in d or "de novo agora" in d), d
    _ouvir(monkeypatch, _Ouvido(mix=" ".join([FRASE] * 4)))
    rel, c = _conferir(tmp_path, _edl_frase(material), ["frase_repetida"])
    assert not rel["aprovado"] and "4x no mix (roteiro e fonte têm 3x)" in c["frase_repetida"]["detalhe"]


def test_4a_laco_no_stem_ambiente_nunca_afrouxa(tmp_path, dados, material, monkeypatch):
    from motor.etapas import qa
    _ouvir(monkeypatch, _Ouvido(mix=" ".join([FRASE] * 3), stem_ambiente=" ".join([FRASE] * 2)))
    stem = material["fontes"]["camA"]["audio"]
    rel, c = _conferir(tmp_path, _edl_frase(material), ["frase_repetida"], stems={"ambiente": stem})
    assert not rel["aprovado"] and "no ambiente" in c["frase_repetida"]["detalhe"]


def test_4a_stem_direto_so_afrouxa_para_o_plano_aceito_como_dialogo(tmp_path, dados, material, monkeypatch):
    from motor.etapas import qa
    from motor.etapas.qa import voz_externa as VE
    _ouvir(monkeypatch, _Ouvido(mix=" ".join([FRASE] * 3), stem_direto=" ".join([FRASE] * 2)))
    stem = material["fontes"]["camB"]["audio"]
    plano = _plano("P1", "camB", 14.7 + D, 0.0, 12.2, som_direto_db=-20)          # B repete a FRASE duas vezes no som direto
    edl = _edl_frase(material, planos=[plano])
    aceito = {"P1": True}
    monkeypatch.setattr(VE, "cena_do_som_direto", lambda c, p, voz: {"aceito": aceito.get(p["id"], False), "motivo": "", "medida": ""})
    rel, c = _conferir(tmp_path, edl, ["frase_repetida"], stems={"direto": stem})
    assert rel["aprovado"], c["frase_repetida"]["detalhe"]
    assert "som direto do diálogo aceito em P1" in c["frase_repetida"]["detalhe"]
    aceito["P1"] = False                                                         # não é o diálogo da cena: laço no direto
    rel, c = _conferir(tmp_path, edl, ["frase_repetida"], stems={"direto": stem})
    assert not rel["aprovado"] and "no direto" in c["frase_repetida"]["detalhe"]
    aceito["P1"] = True
    rel, _ = _conferir(tmp_path, _com("uma", edl), ["frase_repetida"], stems={"direto": stem})
    assert not rel["aprovado"]


def test_4a_janelas_no_filme_pura():
    from motor.etapas.qa.frase_repetida import janelas_no_filme
    edl = {"voz": [_peca("V1", "a", 1.0, 3.0, 0.0, ""), _peca("V2", "a", 2.5, 4.0, 2.0, ""), _peca("V3", "b", 0.0, 1.0, 3.5, "")],
           "planos": [_plano("P1", "a", 10.0, 0.0, 2.0, som_direto_db=-20), _plano("P2", "b", 5.0, 0.0, 1.0), dict(_plano("P3", "b", 7.0, 1.0, 2.0, som_direto_db=-20), vel=2.0)]}
    assert janelas_no_filme(edl) == {"a": [(1.0, 4.0), (10.0, 12.0)], "b": [(0.0, 1.0), (7.0, 9.0)]}   # V1+V2 viram uma janela
    assert janelas_no_filme(edl, {"P1"}) == {"a": [(10.0, 12.0)]}


# ================================================================== 4b voz_externa
TEXTO_V1 = "oi tudo bem hoje é dia de black friday no super kal é verdade e o encarte está cheio de oferta boa"


def test_4b_segunda_pessoa_longe_com_palavras_aprova_so_no_dialogo(tmp_path, dados, material):
    edl = _edl(material, [_peca("V1", "camA", 1.9, 9.7, 0.0, TEXTO_V1)], dur=8.0)
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert rel["aprovado"], c["voz_externa"]["detalhe"]
    d = c["voz_externa"]["valor"]["dialogo"]
    assert d and d[0]["id"] == "V1" and d[0]["motivo"] == "segunda pessoa do diálogo, longe do microfone"
    assert "aceito(s) como o diálogo" in c["voz_externa"]["detalhe"]
    for modo in ("uma", "auto"):
        rel, c = _conferir(tmp_path, _com(modo, edl), ["voz_externa"])
        assert not rel["aprovado"] and "longe do microfone" in c["voz_externa"]["detalhe"], modo
    # as palavras precisam estar no texto da peça: a direção não escolheu a fala de B -> reprova
    rel, c = _conferir(tmp_path, _edl(material, [_peca("V1", "camA", 1.9, 9.7, 0.0, "oi tudo bem hoje é dia de black friday no super kal")], dur=8.0),
                       ["voz_externa"])
    assert not rel["aprovado"] and "não é o diálogo" in c["voz_externa"]["detalhe"]


def test_4b_murmurio_da_equipe_sem_transcricao_reprova_nos_dois_modos(tmp_path, dados, material):
    edl = _edl(material, [_peca("V3", "camA", 26.9, 33.1, 0.0, "olha só que preço bom")], dur=6.2)
    for modo in ("varias", "uma"):
        rel, c = _conferir(tmp_path, _com(modo, edl), ["voz_externa"])
        assert not rel["aprovado"] and "longe do microfone" in c["voz_externa"]["detalhe"], modo
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert "murmúrio" in c["voz_externa"]["detalhe"] and not c["voz_externa"]["valor"]["dialogo"]


def test_4b_longe_no_dialogo_sem_transcricao_da_fonte_reprova(tmp_path, dados, material):
    import shutil
    pasta = tmp_path / "sem_analise"
    pasta.mkdir()
    shutil.copy(material["fontes"]["camA"]["audio"], pasta / "audio.wav")
    fontes = {"camA": {"chave": str(pasta / "x.mp4"), "audio": str(pasta / "audio.wav")}}
    edl = _edl({"fontes": fontes}, [_peca("V1", "camA", 1.9, 9.7, 0.0, TEXTO_V1)], dur=8.0)
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert not rel["aprovado"] and "sem transcrição da fonte" in c["voz_externa"]["detalhe"]


def _stems(tmp_path, material, voz_trechos, direto_trechos, abaixo_db, dur):
    """Stems sintéticos do mix: voz = os trechos das peças; direto = os trechos dos planos, `abaixo_db` dB abaixo da voz."""
    import soundfile as sf
    xa, xb = material["xa"], material["xb"]
    fonte = {"camA": (xa, 0.0), "camB": (xb, 0.0)}
    n = int(dur * SR)
    v, d = np.zeros(n, np.float32), np.zeros(n, np.float32)
    for alvo, trechos in ((v, voz_trechos), (d, direto_trechos)):
        for fid, s0, t0, t1 in trechos:
            x, _ = fonte[fid]
            i = int(s0 * SR)
            seg = x[i:i + int((t1 - t0) * SR)]
            alvo[int(t0 * SR):int(t0 * SR) + len(seg)] += seg

    def rms_db(y):
        return 20 * np.log10(np.sqrt(np.mean(y.astype(np.float64) ** 2)) + 1e-12)
    d *= 10 ** ((rms_db(v) - abaixo_db - rms_db(d)) / 20)
    pv, pd = tmp_path / f"voz_{abaixo_db}.wav", tmp_path / f"direto_{abaixo_db}.wav"
    sf.write(str(pv), v, SR)
    sf.write(str(pd), d, SR)
    return {"voz": str(pv), "direto": str(pd)}


def test_4b_som_direto_da_mesma_cena_aprova_eco_e_outra_cena_reprovam(tmp_path, dados, material, monkeypatch):
    from motor.etapas import qa
    _ouvir(monkeypatch, _Ouvido())
    voz = [_peca("V1", "camA", 10.5, 14.1, 0.0, FRASE)]
    p1 = _plano("P1", "camB", 10.5 + D, 0.0, 3.6, som_direto_db=-20)          # a câmera B, no mesmo instante do diálogo
    edl = _edl(material, voz, [p1], dur=3.6)
    stems = _stems(tmp_path, material, [("camA", 10.5, 0.0, 3.6)], [("camB", 10.5 + D, 0.0, 3.6)], 15.0, 3.6)
    rel, c = _conferir(tmp_path, edl, ["voz_externa"], stems=stems)
    assert rel["aprovado"], c["voz_externa"]["detalhe"]
    det = c["voz_externa"]["detalhe"]
    assert "o próprio diálogo da cena" in det and "atraso medido +3.217 s" in det and "100% das palavras batem" in det
    rel, c = _conferir(tmp_path, _com("uma", edl), ["voz_externa"], stems=stems)       # o mesmo som, uma voz só: reprova
    assert not rel["aprovado"] and "conversa no som direto" in c["voz_externa"]["detalhe"]
    eco = _stems(tmp_path, material, [("camA", 10.5, 0.0, 3.6)], [("camB", 10.5 + D, 0.0, 3.6)], 3.0, 3.6)
    rel, c = _conferir(tmp_path, edl, ["voz_externa"], stems=eco)
    assert not rel["aprovado"] and "eco" in c["voz_externa"]["detalhe"]
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])                                   # sem stems não há prova contra o eco
    assert not rel["aprovado"] and "sem os stems" in c["voz_externa"]["detalhe"]
    p2 = _plano("P2", "camB", 19.0 + D, 0.0, 3.6, som_direto_db=-20)          # outra cena: A falando de outra coisa, 5 s depois
    rel, c = _conferir(tmp_path, _edl(material, voz, [p2], dur=3.6), ["voz_externa"], stems=stems)
    assert not rel["aprovado"] and "outra cena" in c["voz_externa"]["detalhe"]


def test_4b_som_direto_da_mesma_camera_com_as_mesmas_palavras(tmp_path, dados, material, monkeypatch):
    from motor.etapas import qa
    _ouvir(monkeypatch, _Ouvido())
    # a peça é a fala de A; o plano de apoio, da MESMA câmera, mostra a resposta de B logo depois (B longe, conversa no direto)
    voz = [_peca("V1", "camA", 10.5, 14.1, 0.0, FRASE + " " + FRASE)]
    p1 = _plano("P1", "camA", 14.7, 0.0, 3.6, som_direto_db=-20)
    stems = _stems(tmp_path, material, [("camA", 10.5, 0.0, 3.6)], [("camA", 14.7, 0.0, 3.6)], 14.0, 3.6)
    rel, c = _conferir(tmp_path, _edl(material, voz, [p1], dur=3.6), ["voz_externa"], stems=stems)
    assert rel["aprovado"], c["voz_externa"]["detalhe"]
    assert "mesma câmera" in c["voz_externa"]["detalhe"]
    rel, _ = _conferir(tmp_path, _edl(material, voz, [p1], modo="uma", dur=3.6), ["voz_externa"], stems=stems)
    assert not rel["aprovado"]


def test_4b_coberta_por_palavras_pura():
    from motor.etapas.qa.voz_externa import coberta_por_palavras
    pal = [[0.0, 0.5, "vem", 0.9], [0.5, 1.0, "pro", 0.9], [1.0, 1.5, "kal", 0.3], [1.5, 2.0, "corta", 0.9]]
    assert coberta_por_palavras(0.0, 2.0, pal, "Vem pro Kal!") == pytest.approx(0.5)      # "kal" com conf 0,3 não conta
    assert coberta_por_palavras(0.0, 2.0, pal, "corta") == pytest.approx(0.25)
    assert coberta_por_palavras(1.0, 1.0, pal, "vem") == 0.0


def test_4b_palavra_funcional_sozinha_nao_cobre_o_murmurio():
    """Revisão tripla (A10): murmúrio que o Whisper transcreve como "que" (conf 0,9) cobria 100% do trecho porque "que" está no
    texto da peça. Palavra funcional só conta numa sequência com palavra de conteúdo."""
    from motor.etapas.qa.voz_externa import coberta_por_palavras
    assert coberta_por_palavras(0, 2, [[0, 2, "que", 0.9]], "eu quero que você venha") == 0.0
    assert coberta_por_palavras(0, 2, [[0, 1, "de", 0.9], [1, 2, "que", 0.9]], "de que lado você está") == 0.0
    seq = [[0, 0.5, "que", 0.9], [0.5, 1.0, "você", 0.9], [1.0, 2.0, "venha", 0.9]]
    assert coberta_por_palavras(0, 2, seq, "eu quero que você venha") == pytest.approx(1.0)


# ================================================================== 4c fala_cortada
GLUED = [_peca("V4", "camA", 33.9, 35.70, 0.0, "e a picanha está barata"),
         _peca("V5", "camB", 35.70 + D, 37.2 + D, 1.8, "corre que acaba hoje")]


def test_4c_fala_colada_de_outra_pessoa_com_corte_no_vale(tmp_path, dados, material):
    edl = _edl(material, GLUED, dur=3.3)
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    fc = c["fala_cortada"]
    assert rel["aprovado"], fc["detalhe"]
    assert {(d["id"], d["onde"]) for d in fc["valor"]["dialogo"]} == {("V4", "fim"), ("V5", "inicio")}
    assert all(d["motivo"].startswith("colada em outra pessoa, corte no vale") for d in fc["valor"]["dialogo"])
    for modo in ("uma", "auto"):                                     # o mesmo áudio sem o diálogo: reprova como sempre
        rel, c = _conferir(tmp_path, _com(modo, edl), ["fala_cortada"])
        assert not rel["aprovado"] and c["fala_cortada"]["valor"]["reprovadas"] == ["V4", "V5"], modo


def test_4c_corte_fora_do_vale_e_a_mesma_pessoa_continuando_reprovam(tmp_path, dados, material):
    rel, c = _conferir(tmp_path, _edl(material, [_peca("V4", "camA", 33.9, 35.64, 0.0, "e a picanha está barata")], dur=2.0), ["fala_cortada"])
    assert not rel["aprovado"] and "60 ms fora do vale" in c["fala_cortada"]["detalhe"]
    rel, c = _conferir(tmp_path, _edl(material, [_peca("V6", "camA", 38.4, 39.52, 0.0, "aproveita essa oferta")], dur=1.2), ["fala_cortada"])
    assert not rel["aprovado"] and "a mesma pessoa continuando" in c["fala_cortada"]["detalhe"]


def test_4c_sem_transcricao_da_fonte_nao_ha_prova(tmp_path, dados, material):
    import shutil
    pasta = tmp_path / "sem_analise"
    pasta.mkdir()
    shutil.copy(material["fontes"]["camA"]["audio"], pasta / "audio.wav")
    edl = _edl({"fontes": {"camA": {"chave": str(pasta / "x.mp4"), "audio": str(pasta / "audio.wav")}}}, GLUED[:1], dur=1.8)
    rel, c = _conferir(tmp_path, edl, ["fala_cortada"])
    assert not rel["aprovado"] and "sem transcrição da fonte" in c["fala_cortada"]["detalhe"]


def test_4c_funcoes_puras():
    from motor import audio_fala
    from motor.etapas.qa import fala_cortada as FC
    pal = [[0.0, 0.3, "e", 0.9], [0.34, 0.64, "barata", 0.9], [0.70, 0.95, "corre", 0.9]]
    assert FC.palavra_dentro(pal, 0.66, 0.0, "fim")[0]
    ok, motivo = FC.palavra_dentro(pal, 0.55, 0.0, "fim")
    assert not ok and "«barata» termina 90 ms depois do corte" in motivo
    assert FC.palavra_dentro(pal, 0.68, 0.68, "inicio")[0]
    assert not FC.palavra_dentro(pal, 0.80, 0.80, "inicio")[0]
    assert not FC.palavra_dentro(None, 0.66, 0.0, "fim")[0]
    # envelope de mentira: fala forte, vale fundo em 1,00 s, a outra fala colada
    e = np.full(200, -20.0)
    e[:40] = -70.0
    e[100] = -45.0
    env = {"db": e, "limiar": -40.0}
    assert FC.corte_no_vale(env, 1.00, "fim")[0]
    assert not FC.corte_no_vale(env, 1.06, "fim")[0]                              # 60 ms fora do vale
    raso = dict(env, db=np.where(np.arange(200) == 100, -24.0, e))
    ok, motivo = FC.corte_no_vale(raso, 1.00, "fim")
    assert not ok and "vale raso" in motivo
    assert audio_fala.PASSO == 0.01
    # a outra pessoa: altura da voz bem diferente; a mesma pessoa: igual
    from sintetico_dialogo import voz
    rng = np.random.default_rng(4)
    a, b, a2 = voz(rng, 1.0, 125.0), voz(rng, 1.0, 235.0), voz(rng, 1.0, 128.0)
    assert FC.outra_pessoa(a, b, SR)[0] is True
    assert FC.outra_pessoa(a, a2, SR)[0] is False


# ================================================================== 4d cobertura_sintonia
@pytest.fixture(scope="module")
def final_rosto(tmp_path_factory):
    """3,6 s em 270x480 com a caixa vermelha ("rosto") o tempo todo."""
    out = tmp_path_factory.mktemp("cob4") / "final.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=270x480:r=30:d=3.6",
                    "-vf", "drawbox=x=80:y=100:w=110:h=140:color=red:t=fill", "-c:v", "libx264", "-preset", "veryfast",
                    "-pix_fmt", "yuv420p", str(out)], check=True)
    return out


class _DetectorVermelho:
    nome = "falso"

    def detectar(self, bgr):
        m = (bgr[:, :, 2] > 150) & (bgr[:, :, 1] < 90) & (bgr[:, :, 0] < 90)
        if m.sum() < 20:
            return []
        ys, xs = np.nonzero(m)
        H, W = m.shape
        return [[xs.min() / W, ys.min() / H, (xs.max() - xs.min() + 1) / W, (ys.max() - ys.min() + 1) / H, 0.9]]


def test_4d_segunda_camera_em_sincronia_aprova_desalinhada_reprova(tmp_path, dados, material, final_rosto, monkeypatch):
    from motor.etapas.qa import cobertura_sintonia as CS
    monkeypatch.setattr(CS, "_detector", lambda c: _DetectorVermelho())
    voz = [_peca("V1", "camA", 10.5, 14.1, 0.0, FRASE)]
    alinhado = _plano("P1", "camB", 10.5 + D, 0.0, 3.0)
    edl = _edl(material, voz, [alinhado], dur=3.6)
    rel, c = _conferir(tmp_path, edl, ["cobertura_sintonia"], final=final_rosto)
    cs = c["cobertura_sintonia"]
    assert rel["aprovado"], cs["detalhe"]
    assert cs["valor"]["sincronizados_outra_camera"] == ["P1"] and "em sincronia pelo som" in cs["detalhe"]
    rel, c = _conferir(tmp_path, _com("uma", edl), ["cobertura_sintonia"], final=final_rosto)         # uma voz: como hoje
    assert not rel["aprovado"] and c["cobertura_sintonia"]["valor"]["reprovados"] == ["P1"]
    desalinhado = _edl(material, voz, [_plano("P1", "camB", 10.5 + D + 0.5, 0.0, 3.0)], dur=3.6)
    rel, c = _conferir(tmp_path, desalinhado, ["cobertura_sintonia"], final=final_rosto)
    assert not rel["aprovado"] and c["cobertura_sintonia"]["valor"]["reprovados"] == ["P1"]


def test_4d_a_conferencia_mede_de_novo_e_nao_confia_no_edl(tmp_path, dados, material, final_rosto, monkeypatch):
    from motor.etapas.qa import cobertura_sintonia as CS
    monkeypatch.setattr(CS, "_detector", lambda c: _DetectorVermelho())
    voz = [_peca("V1", "camA", 10.5, 14.1, 0.0, FRASE)]
    # o EDL diz que o plano está em sincronia (origem.sincronia), mas o s0 está 0,5 s fora: a conferência mede e reprova
    mentira = {"algo": "sinc-1", "pares": {"camA|camB": {"offset_s": D + 0.5, "conf": 0.99, "razao": 9.0}},
               "planos": {"P1": {"s0_antes": 1.0, "s0_depois": 10.5 + D + 0.5, "par": "camA|camB"}}}
    edl = _edl(material, voz, [_plano("P1", "camB", 10.5 + D + 0.5, 0.0, 3.0)], dur=3.6)
    edl["origem"]["sincronia"] = mentira
    rel, c = _conferir(tmp_path, edl, ["cobertura_sintonia"], final=final_rosto)
    assert not rel["aprovado"] and c["cobertura_sintonia"]["valor"]["reprovados"] == ["P1"]


def test_4d_cruzamentos_pura_com_atraso_medido():
    from motor.etapas.qa.cobertura_sintonia import cruzamentos
    v = {"id": "V1", "fonte": "camA", "s0": 10.0, "t0": 0.0, "t1": 3.0}
    p = {"id": "P1", "fonte": "camB", "s0": 13.2, "t0": 0.0, "t1": 3.0, "vel": 1.0}
    assert not cruzamentos([p], [v])[0]["sincronizado"]                             # sem o atraso: outra câmera é cobertura
    x = cruzamentos([p], [v], {("camA", "camB"): 3.2})[0]
    assert x["sincronizado"] and x["camera"] == "outra"
    assert not cruzamentos([dict(p, s0=13.35)], [v], {("camA", "camB"): 3.2})[0]["sincronizado"]   # 150 ms fora
    assert not cruzamentos([dict(p, rampa=[[0, 1], [1, 2]])], [v], {("camA", "camB"): 3.2})[0]["sincronizado"]


# ================================================================== ponta a ponta: o mesmo material nos dois modos
def test_dialogo_sintetico_varias_aprova_uma_reprova_o_mesmo_material(tmp_path, dados, material, monkeypatch):
    """Duas pessoas, duas câmeras: V4 (A, câmera A) termina colada na resposta de B; V5 (B, câmera B) começa no vale. Sobre V4,
    o plano da câmera B (em sincronia pelo som, com rosto); sobre V5, o take da própria V5. As quatro checagens do diálogo."""
    from motor.etapas import qa
    from motor.etapas.qa import cobertura_sintonia as CS
    monkeypatch.setattr(CS, "_detector", lambda c: _DetectorVermelho())
    _ouvir(monkeypatch, _Ouvido(mix="e a picanha está barata corre que acaba hoje"))
    out = tmp_path / "final.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=270x480:r=30:d=3.3",
                    "-vf", "drawbox=x=80:y=100:w=110:h=140:color=red:t=fill", "-c:v", "libx264", "-preset", "veryfast",
                    "-pix_fmt", "yuv420p", str(out)], check=True)
    planos = [_plano("P1", "camB", 33.9 + D, 0.0, 1.8), _plano("P2", "camB", 35.70 + D, 1.8, 3.3)]
    edl = _edl(material, GLUED, planos, dur=3.3)
    so = ["fala_cortada", "voz_externa", "cobertura_sintonia", "frase_repetida"]
    rel, c = _conferir(tmp_path, edl, so, final=out)
    assert rel["aprovado"], {k: v["detalhe"] for k, v in c.items() if not v["ok"]}
    rel, c = _conferir(tmp_path, _com("uma", edl), so, final=out)
    reprovadas = {k for k, v in c.items() if not v["ok"]}
    assert not rel["aprovado"] and {"fala_cortada", "voz_externa", "cobertura_sintonia"} <= reprovadas, reprovadas
