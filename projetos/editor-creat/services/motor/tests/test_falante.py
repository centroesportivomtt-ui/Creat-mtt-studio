"""Falante (Marcos, Ruan, Xande) na análise: impressão de voz, cadastro, provedores voz/fixture/desligado, contrato,
catálogo e análise ponta a ponta. Tudo com vozes sintéticas (numpy), sem modelo, sem rede."""
import copy
import json
import pathlib
import subprocess
import sys
import types

import numpy as np
import pytest
import soundfile as sf
from scipy.signal import lfilter, resample_poly

import validar
from b_sintetico import analise as analise_b

from motor.cerebro import orcamento
from motor.etapas import catalogo
from motor.ferramentas import cadastrar_falante as cad
from motor.provedores import falante_voz as fv
from motor.provedores.falante_fixture import FalanteFixture, FalanteNenhum

pytestmark = pytest.mark.filterwarnings("ignore")
VOGAIS = [(730, 1090, 2440), (530, 1840, 2480), (270, 2290, 3010), (570, 840, 2410), (300, 870, 2240)]
# f0 (Hz) e escala dos formantes (trato vocal) de cada voz sintética
VOZES = {"marcos": (100, 1.0), "ruan": (140, 0.93), "xande": (185, 0.88)}
ESTRANHA = (240, 1.2)


def voz(f0: float, escala: float, dur: float, semente: int, sr: int = 16000) -> np.ndarray:
    """Fala sintética: harmônicos com entonação e vibrato, sílabas de 250 ms com vogais (formantes) sorteadas, ruído."""
    r = np.random.default_rng(semente)
    n = int(dur * sr)
    t = np.arange(n) / sr
    contorno = 2 ** ((1.5 / 12) * np.sin(2 * np.pi * 0.35 * t + r.uniform(0, 6)) + (0.3 / 12) * np.sin(2 * np.pi * 5.5 * t))
    fase = 2 * np.pi * np.cumsum(f0 * contorno * (1 + 0.004 * r.standard_normal(n))) / sr
    fonte = sum(np.sin(k * fase) / k for k in range(1, int(7000 / (f0 * 1.2))))
    out, sil = np.zeros(n), int(0.25 * sr)
    for i in range(0, n, sil):
        y = fonte[i:i + sil]
        for fc in VOGAIS[r.integers(len(VOGAIS))]:
            fc *= escala
            rr, th = np.exp(-np.pi * (80 + fc * 0.06) / sr), 2 * np.pi * fc / sr
            y = lfilter([1 - rr], [1, -2 * rr * np.cos(th), rr * rr], y)
        on = int(len(y) * r.uniform(0.6, 0.8))
        env = np.zeros(len(y))
        env[:on] = np.sin(np.linspace(0, np.pi, on))
        out[i:i + len(y)] = y * env
    out = out / (np.abs(out).max() + 1e-9) * 0.5 + 0.003 * r.standard_normal(n)
    return out.astype(np.float32)


def grava(caminho: pathlib.Path, x: np.ndarray, sr_saida: int = 48000) -> pathlib.Path:
    sf.write(str(caminho), resample_poly(x, sr_saida // 16000, 1).astype(np.float32) if sr_saida != 16000 else x, sr_saida)
    return caminho


@pytest.fixture()
def perfis(tmp_path, monkeypatch):
    """marcos, ruan e xande cadastrados pelo caminho real (cadastrar_falante) a partir de 2 arquivos cada."""
    pasta = tmp_path / "falantes"
    monkeypatch.setenv("EDITOR_FALANTES_DIR", str(pasta))
    for k in ("EDITOR_FALANTE_MODELO", "EDITOR_FALANTE_MARGEM", "EDITOR_FALANTE_LIMIAR", "EDITOR_FALANTE_FIXTURE"):
        monkeypatch.delenv(k, raising=False)
    for nome, (f0, esc) in VOZES.items():
        arqs = [grava(tmp_path / f"{nome}{i}.wav", voz(f0, esc, 8, 10 * i + len(nome))) for i in (1, 2)]
        r = cad.cadastrar(nome, arqs)
        assert r["janelas"] >= 6 and r["aviso"] is None and r["rotulo"] == nome
    return pasta


def _conversa(tmp_path, partes) -> tuple[pathlib.Path, list[dict]]:
    """WAV 48 kHz com as partes [(x, texto)] separadas por 0,5 s de silêncio + segmentos da transcrição."""
    sil = np.zeros(8000, dtype=np.float32)
    x, segs, t = [], [], 0.0
    for parte, texto in partes:
        x += [parte, sil]
        segs.append({"s": round(t, 2), "e": round(t + len(parte) / 16000, 2), "texto": texto, "falante": None, "conf": 0.9})
        t += (len(parte) + len(sil)) / 16000
    return grava(tmp_path / "conversa.wav", np.concatenate(x)), segs


# ---------------- provedor voz ----------------
def test_reconhece_as_tres_vozes(perfis, tmp_path):
    partes = [(voz(f0, esc, 4, 500 + i), nome) for i, (nome, (f0, esc)) in enumerate(VOZES.items())]
    wav, segs = _conversa(tmp_path, partes + [(voz(100, 1.0, 3, 900), "marcos de novo")])
    prov = fv.FalanteVoz()
    assert prov.ativo and sorted(prov.perfis) == ["marcos", "ruan", "xande"]
    rot = prov.rotular(wav, segs)
    assert [r["falante"] for r in rot] == ["marcos", "ruan", "xande", "marcos"]
    assert all(r["falante_metodo"] == "voz" and r["falante_confianca"] >= 0.8 for r in rot)


def test_negativos_desconhecido(perfis, tmp_path):
    t = np.arange(32000) / 16000
    tom = (0.3 * np.sin(2 * np.pi * 150 * t)).astype(np.float32)
    wav, segs = _conversa(tmp_path, [(voz(*ESTRANHA, 4, 77), "voz fora dos perfis"), (voz(100, 1.0, 0.8, 78), "curto"),
                                     (np.zeros(32000, np.float32), "silêncio"), (tom, "tom de 150 Hz")])
    rot = fv.FalanteVoz().rotular(wav, segs)
    assert [r["falante"] for r in rot] == ["desconhecido"] * 4
    assert [r["falante_confianca"] for r in rot[1:]] == [0.0, 0.0, 0.0]          # curto, silêncio e tom: nem compara
    assert fv.impressao(tom)["motivo"] == "tom" and fv.impressao(np.zeros(32000, np.float32))["motivo"] == "silencio"
    assert fv.impressao(voz(100, 1.0, 1.0, 1))["motivo"] == "curto"


def test_margem_ambigua_vira_desconhecido(perfis):
    clf = fv.Classificador(fv.carregar_perfis(perfis))
    meio = (clf.mu[0] + clf.mu[1]) / 2                       # exatamente entre marcos e ruan
    assert clf.decidir(meio)[0] == "desconhecido"
    assert clf.decidir(clf.mu[clf.nomes.index("ruan")])[0] == "ruan"
    assert fv.Classificador(fv.carregar_perfis(perfis), margem=0.99).decidir(clf.mu[0])[0] == "desconhecido"


def test_sem_perfil_nao_rotula(tmp_path, monkeypatch):
    monkeypatch.setenv("EDITOR_FALANTES_DIR", str(tmp_path / "vazio"))
    prov = fv.FalanteVoz()
    assert not prov.ativo and prov.rotular(None, [{"s": 0, "e": 3, "texto": "x"}]) == [None]


def test_cadastro_idempotente_outro_e_nome_invalido(perfis, tmp_path):
    antes = json.loads((perfis / "marcos" / "perfil.json").read_text())
    r = cad.cadastrar("marcos", [tmp_path / "marcos1.wav"])
    assert r["janelas"] == antes["n"] and r["arquivos"][0]["obs"] == "já cadastrado"
    assert "soma" in antes and "audio" not in json.dumps(antes)                     # só estatística, nunca o áudio
    r = cad.cadastrar("apresentador", [grava(tmp_path / "ap.wav", voz(*ESTRANHA, 8, 5))])
    assert r["rotulo"] == "outro"
    wav, segs = _conversa(tmp_path, [(voz(*ESTRANHA, 4, 6), "apresentador fala")])
    assert fv.FalanteVoz().rotular(wav, segs)[0]["falante"] == "outro"
    with pytest.raises(ValueError):
        cad.cadastrar("Márcos!", [tmp_path / "marcos1.wav"])
    t = np.arange(48000) / 16000
    with pytest.raises(ValueError):
        cad.cadastrar("tom", [grava(tmp_path / "tom.wav", (0.3 * np.sin(2 * np.pi * 200 * t)).astype(np.float32))])


def test_cli_cadastrar_e_listar(tmp_path, monkeypatch):
    pasta = tmp_path / "f"
    raiz = pathlib.Path(__file__).resolve().parents[1]
    wav = grava(tmp_path / "x.wav", voz(140, 0.93, 6, 3))
    env = {"PATH": "/usr/bin:/bin", "PYTHONPATH": str(raiz)}
    r = subprocess.run([sys.executable, "-m", "motor.ferramentas.cadastrar_falante", "--dir", str(pasta), "--nome", "ruan", str(wav)],
                       capture_output=True, text=True, env=env, cwd=raiz, timeout=120)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout)["nome"] == "ruan" and (pasta / "ruan" / "perfil.json").is_file()
    r = subprocess.run([sys.executable, "-m", "motor.ferramentas.cadastrar_falante", "--dir", str(pasta), "--listar"],
                       capture_output=True, text=True, env=env, cwd=raiz, timeout=120)
    assert r.stdout.startswith("ruan")


def test_assinatura_muda_com_perfil(perfis, tmp_path):
    a = fv.FalanteVoz().assinatura()
    cad.cadastrar("xande", [grava(tmp_path / "x3.wav", voz(185, 0.88, 6, 99))])
    assert fv.FalanteVoz().assinatura() != a


def test_modelo_onnx_opcional(perfis, tmp_path, monkeypatch):
    """EDITOR_FALANTE_MODELO: sem onnxruntime cai no método simples; com ele (aqui um falso), usa o embedding."""
    modelo = tmp_path / "m.onnx"
    modelo.write_bytes(b"falso")
    monkeypatch.setenv("EDITOR_FALANTE_MODELO", str(modelo))
    monkeypatch.setitem(sys.modules, "onnxruntime", None)                 # import falha
    assert fv.Embedder.abrir() is None and fv.FalanteVoz().emb is None

    class Sessao:                                    # "embedding" falso e determinístico: contorno do desvio do log-mel
        def __init__(self, *a, **k):
            pass

        def get_inputs(self):
            return [types.SimpleNamespace(name="feats")]

        def run(self, _, entradas):
            v = entradas["feats"].std(axis=1)
            v = v - v.mean(axis=1, keepdims=True)
            return [v[:, 1:] - v[:, :-1]]
    monkeypatch.setitem(sys.modules, "onnxruntime", types.SimpleNamespace(InferenceSession=Sessao))
    assert fv.FalanteVoz().emb is None                                    # perfis sem embedding: avisa e fica no simples
    for n in VOZES:
        (perfis / n / "perfil.json").unlink()
    for nome, (f0, esc) in VOZES.items():
        cad.cadastrar(nome, [grava(tmp_path / f"e{nome}.wav", voz(f0, esc, 8, 40 + len(nome)))])
    prov = fv.FalanteVoz()
    assert prov.emb is not None
    wav, segs = _conversa(tmp_path, [(voz(185, 0.88, 4, 301), "x"), (voz(100, 1.0, 4, 302), "m")])
    assert [r["falante"] for r in prov.rotular(wav, segs)] == ["xande", "marcos"]


# ---------------- fixture e desligado ----------------
def test_fixture_por_f0_e_por_nome(tmp_path, monkeypatch):
    monkeypatch.delenv("EDITOR_FALANTE_FIXTURE", raising=False)
    t = np.arange(32000) / 16000
    partes = [(voz(f0, esc, 3, 60 + i), n) for i, (n, (f0, esc)) in enumerate(VOZES.items())]
    partes += [(voz(*ESTRANHA, 3, 70), "outro"), ((0.3 * np.sin(2 * np.pi * 150 * t)).astype(np.float32), "tom")]
    wav, segs = _conversa(tmp_path, partes)
    rot = FalanteFixture().rotular(wav, segs, {"arquivo": "qualquer.mov"})
    assert [r["falante"] for r in rot] == ["marcos", "ruan", "xande", "outro", "desconhecido"]
    assert {r["falante_metodo"] for r in rot} == {"fixture"}
    mapa = tmp_path / "mapa.json"
    mapa.write_text(json.dumps({"_sala": "marcos", "x": "INVALIDO"}))
    monkeypatch.setenv("EDITOR_FALANTE_FIXTURE", str(mapa))
    f = FalanteFixture()
    assert f.mapa == {"_sala": "marcos"}
    assert {r["falante"] for r in f.rotular(wav, segs, {"arquivo": "20261117_sala.mov"})} == {"marcos"}
    assert FalanteNenhum().rotular(wav, segs) == [None] * len(segs) and not FalanteNenhum.ativo


# ---------------- contrato ----------------
def _exemplo(nome):
    return json.loads((pathlib.Path(validar.RAIZ) / "exemplos" / f"{nome}.json").read_text(encoding="utf-8"))


def test_contrato_novo_e_antigo():
    novo = _exemplo("analise")
    assert validar.erros("analise", novo) == [] and validar.erros("catalogo", _exemplo("catalogo")) == []
    antigo = copy.deepcopy(novo)                               # forma de antes (fase 1): sem os campos novos
    antigo.pop("falante")
    antigo["tempos"].pop("falante")
    seg = antigo["transcricao"]["segmentos"][0]
    seg.pop("falante_confianca"), seg.pop("falante_metodo")
    for v in ("MARCOS", "F1", None):
        seg["falante"] = v
        assert validar.erros("analise", antigo) == []
    cat = _exemplo("catalogo")
    cat["clipes"][0]["falas"][0].pop("falante_conf")
    assert validar.erros("catalogo", cat) == []
    ruim = copy.deepcopy(novo)
    ruim["transcricao"]["segmentos"][0]["falante"] = "MARCOS"              # com método, só o vocabulário do contrato
    assert validar.erros("analise", ruim)
    ruim = copy.deepcopy(novo)
    ruim["transcricao"]["segmentos"][0].pop("falante_confianca")
    assert validar.erros("analise", ruim)
    ruim = copy.deepcopy(novo)
    ruim["transcricao"]["segmentos"][0]["falante_confianca"] = 1.4
    assert validar.erros("analise", ruim)


# ---------------- catálogo ----------------
def _rotular(a, rotulos):
    for s, (f, c) in zip(a["transcricao"]["segmentos"], rotulos):
        s.update(falante=f, falante_confianca=c, falante_metodo="voz")
    return a


def test_catalogo_com_rotulo():
    a = _rotular(analise_b(falante=None), [("marcos", 0.95), ("marcos", 0.6), ("outro", 0.9), ("desconhecido", 0.0)])
    cat, txt = catalogo.montar([a], {"texto": "reel"}, "p_t")
    assert validar.erros("catalogo", cat) == []
    falas = cat["clipes"][0]["falas"]
    assert [f["falante"] for f in falas] == ["MARCOS", "MARCOS", "OUTRO", "DESCONHECIDO"]
    assert [f["falante_conf"] for f in falas] == [0.95, 0.6, 0.9, 0.0]
    assert " MARCOS «o pessoal" in txt and " MARCOS~ «a gente" in txt and " OUTRO «hoje" in txt and " ? «então" in txt
    assert "# FALANTE pela voz" in txt and "MARCOS: 2 falas" in txt
    assert cat["clipes"][0]["pessoas"].startswith("MARCOS")


def test_catalogo_sem_rotulo_mantem_paliativo():
    a = analise_b(falante=None)
    a["visao"]["momentos"].append({"t0": 0.5, "t1": 9.0, "tipo": "fala_evento", "desc": "fala com rosto em quadro", "nota": 4})
    cat, txt = catalogo.montar([a], {"texto": "reel"}, "p_t")
    assert "# FALANTE" not in txt and "falante_conf" not in json.dumps(cat)
    assert catalogo.falas_protegidas(cat["clipes"]) == {"F01.1", "F01.2"}
    # com rótulo, a reserva vale só para o que o provedor deixou como DESCONHECIDO
    b = _rotular(copy.deepcopy(a), [("ruan", 0.9), ("desconhecido", 0.2), ("ruan", 0.9), ("ruan", 0.9)])
    cat_b, _ = catalogo.montar([b], {"texto": "reel"}, "p_t")
    assert catalogo.falas_protegidas(cat_b["clipes"]) == {"F01.2"}
    # desligado/legado: igual ao de antes
    leg = analise_b(falante="MARCOS")
    assert catalogo.montar([leg], {"texto": "reel"}, "p_t")[1] == catalogo.montar([copy.deepcopy(leg)], {"texto": "reel"}, "p_t")[1]
    assert "# FALANTE" not in catalogo.montar([leg], {"texto": "reel"}, "p_t")[1]


def _projeto_48(rotulado: bool):
    """48 clipes no formato do material de 17/11 (falas de equipe e de terceiros, momentos)."""
    frases = ["o pessoal da creat está aqui capturando tudo do evento de hoje com a equipe inteira",
              "a gente trabalha com automação inteligência e vídeo para negócio local",
              "olha o tamanho desse salão cheio de gente competindo", "então sigam a creat para ver o resto"]
    out = []
    for i in range(48):
        quem = ["marcos", "ruan", "xande", "outro"][i % 4]
        a = analise_b(aid=f"a{i:03d}", nome=f"20261117_{i:06d}.mov", dur=80.0,
                      falas=[(1.0 + 7 * k, frases[(i + k) % 4]) for k in range(10)], falante=quem.upper() if quem != "outro" else "F1")
        if rotulado:
            _rotular(a, [(quem, 0.9 if k % 5 else 0.62) for k in range(10)])
        out.append(a)
    return out


def test_tokens_do_rotulo_menos_de_5_por_cento():
    pedido = {"texto": "Reel de bastidor: a fala do Marcos é a base"}
    _, antes = catalogo.montar(_projeto_48(False), pedido, "p_t", limite=15000)
    _, depois = catalogo.montar(_projeto_48(True), pedido, "p_t", limite=15000)
    ta, td = orcamento.estimar_tokens(antes), orcamento.estimar_tokens(depois)
    assert ta > 8000 and td <= ta * 1.05, (ta, td)


# ---------------- análise ponta a ponta (provedor fixture) ----------------
class _TrFake:
    nome, modelo = "fixture", "t"

    def __init__(self, segs):
        self.segs = segs

    def transcrever(self, wav, **k):
        return {"provedor": "fixture", "modelo": "t", "idioma": "pt", "vad": False,
                "segmentos": [{**s, "palavras": [[s["s"], s["e"], w, 0.9] for w in s["texto"].split()]} for s in self.segs]}


def test_analise_ponta_a_ponta_fixture(dados, tmp_path, monkeypatch):
    from motor import banco, config, importar, worker
    from motor.etapas import analise as an
    from motor.provedores import armazenamento_de
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "0")
    monkeypatch.setenv("EDITOR_FALANTE", "desligado")
    monkeypatch.delenv("EDITOR_FALANTE_FIXTURE", raising=False)
    partes = [(voz(100, 1.0, 3, 1), "o pessoal da creat está aqui"), (voz(185, 0.88, 3, 2), "bora que bora galera"),
              (voz(100, 1.0, 0.8, 3), "valeu")]
    wav, segs = _conversa(tmp_path, partes)
    mov = tmp_path / "20261118_101500.mov"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x240:r=30:d=8.4", "-i", str(wav),
                    "-c:v", "libx264", "-preset", "ultrafast", "-g", "30", "-c:a", "pcm_s16le", "-shortest", str(mov)], check=True)
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p1','t',?,?)", (banco.agora_iso(), banco.agora_iso()))
    arm = armazenamento_de(cfg)
    arm.gravar("entrada/p1/20261118_101500.mov", mov)
    importar.registrar_arquivo(con, "p1", mov.name, "entrada/p1/20261118_101500.mov", mov.stat().st_size)
    vis_chamadas = []
    original = an._instancia

    def instancia(tipo, c):
        if tipo == "transcricao":
            return _TrFake(segs)
        v = original(tipo, c)
        if not hasattr(v, "_contado"):
            d = v.descrever
            v.descrever = lambda *a, **k: (vis_chamadas.append(1), d(*a, **k))[1]
            v._contado = True
        return v
    monkeypatch.setattr(an, "_instancia", instancia)

    # 1) desligado: análise como antes, sem campos novos
    worker.main(["--ate-ocioso", "--etapas", "ingest,analise"])
    a = arm.ler_json("derivados/p1/a001/analise.json")
    assert validar.erros("analise", a) == [] and "falante" not in a and "analise_falante" not in a["tempos"]
    assert all("falante_metodo" not in s for s in a["transcricao"]["segmentos"])
    assert len(vis_chamadas) == 1

    # 2) liga o fixture: só o rótulo é refeito (sem nova visão nem transcrição)
    monkeypatch.setenv("EDITOR_FALANTE", "fixture")
    banco.enfileirar(con, "analise", "p1", "a001")
    worker.main(["--ate-ocioso", "--etapas", "analise"])
    a = arm.ler_json("derivados/p1/a001/analise.json")
    assert validar.erros("analise", a) == []
    assert [s["falante"] for s in a["transcricao"]["segmentos"]] == ["marcos", "xande", "desconhecido"]
    assert a["falante"]["provedor"] == "fixture" and a["falante"]["contagem"] == {"marcos": 1, "xande": 1, "desconhecido": 1}
    assert len(vis_chamadas) == 1 and "analise_falante" in a["tempos"]
    saida = lambda: json.loads(con.execute("SELECT saida FROM jobs WHERE etapa='analise' AND alvo='a001'").fetchone()["saida"])  # noqa: E731
    assert saida().get("so_falante") is True

    # 3) idempotente: de novo não refaz nada
    banco.enfileirar(con, "analise", "p1", "a001")
    worker.main(["--ate-ocioso", "--etapas", "analise"])
    assert saida() == {"pulado": True} and len(vis_chamadas) == 1

    # desligar de novo tira os rótulos (sem refazer visão)
    monkeypatch.setenv("EDITOR_FALANTE", "desligado")
    banco.enfileirar(con, "analise", "p1", "a001")
    worker.main(["--ate-ocioso", "--etapas", "analise"])
    b = arm.ler_json("derivados/p1/a001/analise.json")
    assert "falante" not in b and all("falante_metodo" not in s for s in b["transcricao"]["segmentos"]) and len(vis_chamadas) == 1

    # 4) catálogo do projeto: a fala do Marcos sai rotulada e inteira
    cat, txt = catalogo.montar([a], {"texto": "reel"}, "p1")
    assert [f["falante"] for f in cat["clipes"][0]["falas"]][:2] == ["MARCOS", "XANDE"] and "MARCOS «o pessoal" in txt


def test_falha_do_falante_nao_derruba_a_analise(monkeypatch):
    from motor.etapas import analise as an

    class Quebra:
        nome, ativo = "voz", True

        def assinatura(self):
            return "x"

        def rotular(self, *a, **k):
            raise RuntimeError("perfil corrompido")
    tr = {"provedor": "fixture", "modelo": "t", "idioma": "pt", "segmentos": [
        {"s": 0, "e": 2, "texto": "oi", "falante": "marcos", "falante_confianca": 0.9, "falante_metodo": "voz"},
        {"s": 2, "e": 4, "texto": "tchau", "falante": "F1"}]}
    out, info = an.rotular_falantes(Quebra(), None, pathlib.Path("/nao/existe.wav"), tr, {})
    assert [s.get("falante") for s in out["segmentos"]] == [None, "F1"]
    assert all("falante_metodo" not in s for s in out["segmentos"]) and "falhou" in info["aviso"]
    monkeypatch.setattr(an, "provedor", lambda *a: (_ for _ in ()).throw(KeyError("nao_existe")))
    prov, aviso = an._falante(types.SimpleNamespace(falante="nao_existe"))
    assert prov is None and "indisponível" in aviso
