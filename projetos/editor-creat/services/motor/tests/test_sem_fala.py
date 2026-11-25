"""Filme SEM fala cortado pela música (peça M3, pedido do dono 25/11: música hiperconectada, cada corte junto com a música,
ordem cronológica, foco no material de mais alta qualidade, sem plano morto). Tudo sintético, gerado aqui: 3 clipes de
cores diferentes (vermelho gravado primeiro em 60 fps, verde, azul por último e o mais forte) e uma trilha de 120 bpm
com virada aos 12 s (12 s calmos + 20 s fortes)."""
import copy
import json
import pathlib
import subprocess
import types

import numpy as np
import pytest

from motor import musica
from motor.etapas import resolvedor, sem_fala
from motor.memoria.loja import Loja

SR = 48000
BPM = 120.0
CORES = {"C01": ("red", 60, "2026-11-20T09:00:00-03:00", 3), "C02": ("green", 30, "2026-11-20T09:30:00", 3),
         "C03": ("blue", 30, "2026-11-20T13:00:00Z", 5)}             # fusos misturados: naive vale como -03:00
RGB = {"red": (255, 0, 0), "green": (0, 128, 0), "blue": (0, 0, 255)}


def _trilha_wav(arq: pathlib.Path) -> dict:
    import soundfile as sf
    t = np.arange(int(32.0 * SR)) / SR
    pulso = np.exp(-6 * (t % 0.5))                                    # batida a cada 0,5 s = 120 bpm
    nota = sum(np.sin(2 * np.pi * f * t) for f in (220.0, 261.63, 329.63))
    amp = np.where(t < 12.0, 0.02, 0.25)
    x = (amp * pulso * nota / 3).astype(np.float32)
    sf.write(arq, np.stack([x, x], 1), SR)
    m = musica.mapa(x, SR, bpm=BPM, fase=0.0)
    return {"id": "t_virada", "clima": "viagem", "bpm": BPM, "fase": 0.0, "dur": 32.0, "chave": str(arq), **m}


def _clipe(pasta: pathlib.Path, cid: str, dur: float = 9.0) -> pathlib.Path:
    cor, fps, _, _ = CORES[cid]
    arq = pasta / f"{cid}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={cor}:s=360x640:r={fps}:d={dur}",
                    "-f", "lavfi", "-i", f"sine=f=330:d={dur}:sample_rate=48000", "-shortest",
                    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", str(arq)], check=True)
    return arq


def _analise(cid: str, chave: str, dur: float = 9.0) -> dict:
    cor, fps, quando, _ = CORES[cid]
    return {
        "versao": "1",
        "arquivo": {"id": f"a_{cid}", "projeto": "p_sf", "nome": f"{cid}.mp4", "chave": chave, "bytes": 1, "sha256": None, "gravado_em": quando},
        "midia": {"duracao": dur, "tem_video": True, "tem_audio": True, "w": 1080, "h": 1920, "rotacao": 0, "fps": float(fps)},
        "derivados": {"audio_wav": None, "quadros_chave": []},
        "transcricao": {"provedor": "fixture", "modelo": "t", "idioma": "pt", "vad": False, "segmentos": []},
        "sinais": {"tremor": {"passo": 1.0, "media_px": 0.5, "trechos": []}, "cenas": [{"t0": 0, "t1": dur, "ambiente": "neutro"}], "rostos": []},
    }


def _catalogo(dur: float = 9.0) -> dict:
    clipes = []
    for cid in ("C03", "C01", "C02"):                                  # fora de ordem de propósito: quem ordena é o gravado_em
        clipes.append({"id": cid, "arquivo": f"a_{cid}", "nome": f"{cid}.mp4", "dur": dur, "ambientes": ["neutro"], "falas": [],
                       "momentos": [{"id": f"M{cid[1:]}.1", "t0": 0.3, "t1": dur - 0.3, "tipo": "paisagem", "nota": CORES[cid][3]}]})
    return {"versao": "1", "projeto": "p_sf", "orcamento": {"tokens_estimados": 100, "limite": 15000}, "clipes": clipes}


DIRECAO = {
    "versao": "1", "tipo_video": "bastidor", "modelo": "evento-reel", "duracao_alvo": 16, "sem_fala": True,
    "conceito": "o dia inteiro na batida da música", "alem_do_pedido": [],
    "blocos": [
        {"id": "B1", "funcao": "contexto", "intensidade": 2, "falas": [], "cobertura": [], "saida": "corte_batida"},
        {"id": "B2", "funcao": "climax", "intensidade": 5, "falas": [], "cobertura": [], "saida": "corte_batida"},
        {"id": "B3", "funcao": "convite", "intensidade": 4, "falas": [], "cobertura": [], "saida": "corte_batida"},
    ],
    "trilha": {"id": "t_virada", "clima": "viagem", "curva": [2, 5, 4], "drop_em": "B2"},
    "fecho": {"cta": "SEGUE A creat.MTT", "apoio": None, "arroba": "@creat.mtt", "logo_cliente": None},
}


@pytest.fixture()
def material(tmp_path):
    clipes = {cid: _clipe(tmp_path, cid) for cid in CORES}
    trilha = _trilha_wav(tmp_path / "trilha.wav")
    an = [_analise(cid, str(arq)) for cid, arq in clipes.items()]
    return {"pasta": tmp_path, "an": an, "cat": _catalogo(), "trilha": trilha}


def _resolver(mat, d=None, **kw):
    loja = Loja()
    return resolvedor.resolver(d or copy.deepcopy(DIRECAO), mat["cat"], mat["an"], loja.modelo("evento-reel"), [mat["trilha"]], **kw)


def _clipe_do(p):
    return p["fonte"].partition("_")[0]


def test_sem_fala_so_liga_sem_fala():
    from b_sintetico import direcao
    assert not sem_fala.ativo(direcao())                              # filme com fala: o resolvedor de sempre
    assert sem_fala.ativo(DIRECAO)
    d = copy.deepcopy(DIRECAO)
    del d["sem_fala"]
    assert sem_fala.ativo(d)                                          # nenhum bloco com fala também é filme sem fala


def test_virada_batida_ordem_e_energia(material):
    import validar
    edl = _resolver(material)
    assert validar.erros("edl", edl) == []
    from motor.etapas.montagem import validar_edl
    validar_edl(edl)
    tr = edl["trilha"]
    assert abs(material["trilha"]["virada"] - 12.0) <= 0.5
    ini = tr["emendas"][0][1]
    b2 = next(b for b in edl["blocos"] if b["id"] == "B2")
    assert abs(ini + b2["t0"] - material["trilha"]["virada"]) < 1e-3        # a virada cai no começo do bloco marcado
    assert (ini / 2.0) % 1 == 0                                            # música entra num compasso inteiro
    assert abs(edl["duracao"] - 16.0) <= 0.25 and tr["ducking"]["db"] == 0    # duração do alvo; trilha cheia
    assert edl["voz"] == [] and edl["tom_sala"] is None and edl["origem"]["modo"] == "sem_fala"
    planos = sorted(edl["planos"], key=lambda p: p["t0"])
    assert planos[0]["t0"] == 0 and abs(planos[-1]["t1"] - edl["duracao"]) < 1e-6
    for a, b in zip(planos, planos[1:]):
        assert abs(a["t1"] - b["t0"]) < 1e-6                               # sem buraco
        assert abs(b["t0"] / 0.5 - round(b["t0"] / 0.5)) < 1e-6           # todo corte na batida
    # o plano mais forte (azul, nota 5) abre a virada, com punch
    forte = next(p for p in planos if abs(p["t0"] - b2["t0"]) < 1e-6)
    assert _clipe_do(forte) == "C03" and forte["enquadre"][-1][1] > 1.1 and forte.get("flash")
    assert any(f["tipo"] == "impacto" and abs(f["t"] - b2["t0"]) < 1e-3 for f in edl["fx"])
    # parte calma = planos longos; auge = 1 ou 2 batidas
    calmos = [p["t1"] - p["t0"] for p in planos if p["t1"] <= b2["t0"] + 1e-6]
    auge = [p["t1"] - p["t0"] for p in planos if p["t0"] >= b2["t0"] - 1e-6]
    assert min(calmos) >= 2.0 and max(auge) <= 1.0 + 1e-6 and len(auge) >= 8
    # ordem cronológica dentro de cada parte (fora o plano da virada), sem repetir trecho
    ordem = {"C01": 0, "C02": 1, "C03": 2}
    for b in edl["blocos"]:
        seq = [(ordem[_clipe_do(p)], p["s0"]) for p in planos if p["bloco"] == b["id"] and p is not forte]
        assert seq == sorted(seq), (b["id"], seq)
    usos = {}
    for p in planos:
        usos.setdefault(_clipe_do(p), []).append((p["s0"], p["s0"] + (p["t1"] - p["t0"]) * p.get("vel", 1.0)))
    for cid, iv in usos.items():
        iv.sort()
        assert all(x[1] <= y[0] + 1e-6 for x, y in zip(iv, iv[1:])), (cid, iv)
        assert all(0 <= a and b <= 9.0 for a, b in iv)
    assert len(usos) == 3                                                  # as três cenas conversam no filme
    # câmera lenta só da fonte 60 fps; som direto baixo por baixo onde vai em 1x
    assert all(_clipe_do(p) == "C01" for p in planos if p.get("vel", 1.0) < 1)
    assert any(p.get("vel", 1.0) < 1 for p in planos)
    assert all(p["som_direto_db"] is not None for p in planos if p.get("vel", 1.0) == 1.0)


def test_lento_pedido_em_fonte_30fps_vai_em_1x(material):
    d = copy.deepcopy(DIRECAO)
    d["blocos"][0]["cobertura"] = [{"m": "M02.1", "efeito": "lento"}]     # o diretor pede lento num clipe de 30 fps
    edl = _resolver(material, d)
    b1 = [p for p in edl["planos"] if p["bloco"] == "B1"]
    assert b1 and all(_clipe_do(p) == "C02" and p.get("vel", 1.0) == 1.0 for p in b1)
    assert any("30 fps" in a for a in edl["origem"]["avisos"])


def test_trecho_morto_fica_de_fora(material):
    cat = material["cat"]
    azul = next(c for c in cat["clipes"] if c["id"] == "C03")
    azul["movimento"] = {"tremor": 1.0, "nota": 0.8, "melhores": [], "tremidos": [[0.0, 6.0, 9.0]]}    # 0-6 s tremido forte
    verde = next(c for c in cat["clipes"] if c["id"] == "C02")
    verde["movimento"] = {"tremor": 0.5, "nota": 0.2, "melhores": [], "borrado_pct": 0.8}            # clipe borrado inteiro
    edl = _resolver(material)
    assert not any(_clipe_do(p) == "C02" for p in edl["planos"])
    assert all(p["s0"] >= 6.0 - 1e-6 for p in edl["planos"] if _clipe_do(p) == "C03")
    assert any("C02 fora do filme sem fala" in a for a in edl["origem"]["avisos"])


def test_serie_de_movimento_veta_borrado(material):
    """Com a série da M2, janela borrada (nitidez < 0,45) ou tremida não entra."""
    t = [round(0.5 * i, 2) for i in range(18)]
    nit = [0.1 if 2.0 <= x < 7.0 else 1.0 for x in t]                       # vermelho borrado de 2 a 7 s
    serie = {"passo": 0.5, "t": t, "tremor": [0.2] * 18, "pan_x": [0.0] * 18, "pan_y": [0.0] * 18, "nitidez": nit}
    edl = _resolver(material, movimentos={"a_C01": serie})
    for p in edl["planos"]:
        if _clipe_do(p) == "C01":
            s1 = p["s0"] + (p["t1"] - p["t0"]) * p.get("vel", 1.0)
            assert s1 <= 2.0 + 1e-6 or p["s0"] >= 7.0 - 1e-6, p


def test_monta_o_filme_sem_fala(material, monkeypatch):
    """Monta de verdade (formato pequeno para o teste ser rápido): cores na ordem do EDL, trilha cheia, duração final."""
    import soundfile as sf
    from motor.etapas import montagem
    from motor.etapas.montagem import overlay as OV
    edl = _resolver(material)
    edl["formato"] = {"w": 180, "h": 320, "fps": 30}
    monkeypatch.setattr(OV, "renderizar", lambda *a, **k: {"dir": None, "stats": {}})   # o kit (navegador) não entra no teste
    pasta = material["pasta"]
    cfg = types.SimpleNamespace(dados=str(pasta / "dados"), nice=0, render_workers=1, threads=2, som=str(pasta / "sem_kit"))
    from motor.etapas.montagem.comum import Fontes
    rel = montagem.montar(edl, pasta / "trab", Fontes(edl), cfg, cache_planos=pasta / "cache")
    final = rel["final"]
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", final], capture_output=True, text=True)
    assert abs(float(json.loads(r.stdout)["format"]["duration"]) - edl["duracao"]) < 0.15
    for p in edl["planos"]:
        if p["t1"] - p["t0"] < 0.9 or p["t0"] >= edl["duracao"] - 4.0:          # plano curto ou sob o fecho: pula
            continue
        meio = (p["t0"] + p["t1"]) / 2
        q = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{meio:.3f}", "-i", final, "-frames:v", "1", "-f", "rawvideo",
                            "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
        px = np.frombuffer(q, np.uint8).reshape(320, 180, 3)[120:200, 40:140].reshape(-1, 3).mean(0)
        esperado = np.array(RGB[CORES[_clipe_do(p)][0]], float)
        assert int(np.argmax(px)) == int(np.argmax(esperado)), (p["id"], _clipe_do(p), px)
    voz, _ = sf.read(rel["stems"]["voz"])
    mus, _ = sf.read(rel["stems"]["trilha"])
    assert np.abs(voz).max() < 1e-4 and np.abs(mus).max() > 0.05
    v = edl["blocos"][1]["t0"]
    antes = np.sqrt(np.mean(mus[int((v - 3) * SR):int((v - 0.2) * SR)] ** 2))
    depois = np.sqrt(np.mean(mus[int((v + 0.2) * SR):int((v + 3) * SR)] ** 2))
    assert depois > 4 * antes                                                    # a virada da música está no auge do filme


def test_sem_mapa_da_musica_e_sem_trilha(material):
    """Trilha antiga (sem virada nem partes) e projeto sem trilha: EDL válido, cortes na batida, energia pelo bloco."""
    import validar
    tr = {k: v for k, v in material["trilha"].items() if k not in ("virada", "secoes", "tom")}
    loja = Loja()
    edl = resolvedor.resolver(copy.deepcopy(DIRECAO), material["cat"], material["an"], loja.modelo("evento-reel"), [tr])
    assert validar.erros("edl", edl) == [] and abs(edl["duracao"] - 16.0) <= 0.25
    assert all(abs(p["t0"] / 0.5 - round(p["t0"] / 0.5)) < 1e-6 for p in edl["planos"])
    b1 = [p["t1"] - p["t0"] for p in edl["planos"] if p["bloco"] == "B1"]
    b2 = [p["t1"] - p["t0"] for p in edl["planos"] if p["bloco"] == "B2"]
    assert min(b1) > max(b2)                                         # bloco calmo (2) com planos mais longos que o intenso (5)
    edl = resolvedor.resolver(copy.deepcopy(DIRECAO), material["cat"], material["an"], loja.modelo("evento-reel"), [])
    assert validar.erros("edl", edl) == [] and edl["trilha"]["chave"] is None
    assert any("120 bpm" in a for a in edl["origem"]["avisos"])


# ---------------------------------------------------------------- correções da revisão da M3
def _na_grade(t: float, b: float = 0.5) -> bool:
    return abs(t / b - round(t / b)) < 1e-6


def test_sem_fala_false_desliga_e_fala_ignorada_avisa(material):
    """`sem_fala: false` manda (não liga sozinho); `sem_fala: true` com fala na direção avisa em vez de sumir calado."""
    d = copy.deepcopy(DIRECAO)
    d["sem_fala"] = False
    assert not sem_fala.ativo(d)
    d = copy.deepcopy(DIRECAO)
    d["blocos"][0]["falas"] = [{"id": "F01.1"}]
    assert sem_fala.ativo(d)
    edl = _resolver(material, d)
    assert edl["voz"] == [] and any("fala(s) da direção ignorada" in a for a in edl["origem"]["avisos"])


def test_musica_curta_com_fase_continua_na_batida(material):
    """Música mais curta que o filme e fase != 0: a emenda começa na fase, em compassos inteiros, e a batida da música
    no filme coincide com a grade de cortes (antes todos os cortes ficavam 0,13 s fora)."""
    import validar
    f = 0.13
    material["trilha"].update({"dur": 10.0, "fase": f})
    edl = _resolver(material)
    assert validar.erros("edl", edl) == []
    em = edl["trilha"]["emendas"]
    assert len(em) >= 2 and all(abs(e[1] - f) < 1e-6 for e in em)
    assert all(abs(((e[2] - e[1]) / 2.0) - round((e[2] - e[1]) / 2.0)) < 1e-6 for e in em[:-1])   # compassos inteiros
    for p in edl["planos"]:
        assert _na_grade(p["t0"]), p["t0"]
        e = next(e for e in reversed(em) if e[0] <= p["t0"] + 1e-6)
        assert _na_grade(e[1] + (p["t0"] - e[0]) - f), p["t0"]            # o corte cai numa batida DA MÚSICA
    assert any("mais curta que o filme" in a for a in edl["origem"]["avisos"])


def test_troca_de_parte_fora_da_batida_nao_vaza_energia(material):
    """Troca de parte medida em 6,1 s (fora da batida): a fronteira vai para 6,0 s nas DUAS leituras; o plano que
    começa na troca já tem a energia da parte forte (antes nascia com a energia 1 e durava 6 s)."""
    tr = material["trilha"]
    tr.update({"virada": None, "secoes": [{"t0": 0.0, "t1": 6.1, "energia": 1}, {"t0": 6.1, "t1": 32.0, "energia": 5}]})
    edl = _resolver(material)
    partes = edl["origem"]["musica"]["partes"]
    assert [p[:2] for p in partes][:2] == [[0.0, 6.0], [6.0, 16.0]]
    depois = [p["t1"] - p["t0"] for p in edl["planos"] if p["t0"] >= 6.0 - 1e-6]
    assert depois and max(depois) <= 1.0 + 1e-6
    assert not any(p["t0"] < 6.0 - 1e-6 < p["t1"] - 1e-6 and p["t1"] > 6.0 + 1e-6 for p in edl["planos"])


def test_cobertura_do_diretor_esgotada_avisa_certo(material):
    """Bloco com momento pedido curto demais: os planos que faltam vêm de outro trecho com o aviso VERDADEIRO
    (momentos pedidos acabaram), não 'fora da ordem de gravação'."""
    m = material["cat"]["clipes"][2]["momentos"][0]                          # C02
    assert m["id"] == "M02.1"
    m["t1"] = 1.3
    d = copy.deepcopy(DIRECAO)
    d["blocos"][0]["cobertura"] = [{"m": "M02.1"}]
    d["duracao_alvo"] = 10                                                   # sobra material livre fora do pedido
    edl = _resolver(material, d)
    av = edl["origem"]["avisos"]
    assert any("bloco B1 sem material livre nos momentos pedidos" in a for a in av), av
    assert not any("repetem trecho" in a for a in av)                      # completou antes de o material picotar


def test_repetir_nunca_passa_do_fim_do_arquivo():
    """Repetição com janela menor que o plano: o começo recua para o plano caber no arquivo."""
    c = {"id": "C09", "arquivo": "a9"}
    R = types.SimpleNamespace(an={"a9": {"midia": {"duracao": 5.0}}})
    jan = [{"c": c, "a": 4.0, "b": 4.8, "q": 0.9}, {"c": c, "a": 1.0, "b": 1.5, "q": 0.5}]
    w, s0 = sem_fala._repetir(R, jan, 3.0)
    assert s0 + 3.0 <= 5.0 and s0 >= 0
    w, s0 = sem_fala._repetir(R, jan, 0.4)                                  # cabe: o de melhor nota
    assert w["q"] == 0.9 and s0 == 4.0


def test_serie_sem_nitidez_ainda_veta_tremor():
    """Série antiga sem a lista de nitidez: o veto de tremor continua (zip curto zerava tudo em silêncio)."""
    from motor import movimento as MV
    serie = {"passo": 0.5, "t": [0.0, 0.5, 1.0], "tremor": [0.0, MV.LIMIAR_FORTE * 3, 0.0]}
    R = types.SimpleNamespace(_serie=lambda cid: serie, _escala_tremor=lambda cid, x: 1.0, avisos=[])
    assert sem_fala._ruins(R, {"id": "C1"}) == [(0.5, 1.0)]


def test_tremidos_truncados_avisam(material):
    azul = next(c for c in material["cat"]["clipes"] if c["id"] == "C03")
    azul["movimento"] = {"tremor": 1.0, "nota": 0.8, "melhores": [], "tremidos": [[0.5, 1.0, 9], [2.0, 2.5, 9], [4.0, 4.5, 9]]}
    edl = _resolver(material)
    assert any("C03: o catálogo guarda só 3 trechos tremidos" in a for a in edl["origem"]["avisos"])


def test_um_bloco_so(material):
    import validar
    d = copy.deepcopy(DIRECAO)
    d["blocos"] = [d["blocos"][1]]
    d["trilha"]["drop_em"] = "B2"
    edl = _resolver(material, d)
    assert validar.erros("edl", edl) == [] and all(_na_grade(p["t0"]) for p in edl["planos"])
