"""Onda 4, item 2 (D44): corte de fala pelo SOM dentro da montagem, automático e idempotente (critérios 2.1 a 2.7).

2.1 registrado ANTES da correção (ajustar_cortes de 19/11, áudio deste arquivo com a palavra seguinte a 160 ms do fim da
palavra cortada): rodada 1 -> 2,11 s (fim do V1 1,45 -> 1,63, reprovado: "fala termina em cima do corte, sem respiro");
rodada 2 -> 2,14 s (fim 1,66, reprovado: "a fala continua depois do corte em 1,66 s, até 2,26 s"). O teste
`test_2_1_regra_antiga_alonga_a_cada_rodada` reproduz a conta antiga do respiro e prova o defeito; os seguintes provam a correção.
Áudio sintético (vogais com sílabas, geradas aqui); nada de material de cliente.
"""
from __future__ import annotations

import copy
import json
import pathlib

import numpy as np
import pytest
import soundfile as sf

from motor import audio_fala as AF
from motor.etapas.montagem import cortes as C
from motor.etapas.montagem.comum import Fontes
from tests.test_qa_fala import _voz

SR = 48000


def _fonte(pasta: pathlib.Path, palavras, dur=5.0, nome="a.wav") -> pathlib.Path:
    rng = np.random.default_rng(7)
    x = (0.0005 * rng.standard_normal(int(dur * SR))).astype(np.float32)
    for a, d in palavras:
        v = _voz(d, 210, 0.3, SR)
        i = int(a * SR)
        x[i:i + len(v)] += v
    p = pasta / nome
    sf.write(p, x, SR)
    return p


def _edl(fonte: pathlib.Path, voz, dur=2.0) -> dict:
    return {"versao": "1", "projeto": "p", "duracao": dur, "formato": {"w": 1080, "h": 1920, "fps": 30},
            "fontes": {"A": {"chave": str(fonte), "audio": str(fonte), "offset": 0.0}},
            "voz": [dict(v) for v in voz],
            "planos": [{"id": "P1", "fonte": "A", "s0": 0.95, "t0": 0.0, "t1": dur, "vel": 1.0}],
            "blocos": [{"id": "B1", "t0": 0.0, "t1": dur}], "motion": [], "fx": [], "sfx": [], "legendas": {"palavras": []},
            "trilha": {"chave": None}, "qa": {"logos": []}, "origem": {}}


def _voz2(s1_v1=1.45):
    return [{"id": "V1", "fonte": "A", "s0": 0.95, "s1": s1_v1, "t0": 0.0, "t1": round(s1_v1 - 0.95, 4), "vel": 1.0, "texto": "um"},
            {"id": "V2", "fonte": "A", "s0": 2.95, "s1": 3.7, "t0": 0.6, "t1": 1.35, "vel": 1.0, "texto": "tres"}]


@pytest.fixture()
def pausa_curta(tmp_path):
    """Palavra 1,0-1,6 s; a seguinte começa 160 ms depois (1,76 s); outra frase em 3,0 s. V1 corta no meio da palavra."""
    return _fonte(tmp_path, [(1.0, 0.6), (1.76, 0.5), (3.0, 0.6)])


@pytest.fixture()
def pausa_boa(tmp_path):
    """Mesma frase com 300 ms de pausa antes da palavra seguinte: há corte que passa na régua."""
    return _fonte(tmp_path, [(1.0, 0.6), (1.9, 0.5), (3.0, 0.6)])


def _reprovadas(edl):
    envs, offs = C.envelopes(edl, Fontes(edl))
    return C.reprovadas(edl["voz"], envs, offs)


# ------------------------------------------------------------------ 2.1
def test_2_1_regra_antiga_alonga_a_cada_rodada(pausa_curta):
    """A conta antiga (fim + min(0,09; pausa - 0,13), piso de 30 ms) aplicada de novo sobre o próprio resultado anda sempre para
    a frente: é o filme que alonga a cada rodada (defeito do caso real, provado antes da correção)."""
    x, _ = sf.read(pausa_curta, dtype="float32")
    env = AF.envelope(x[::3], 16000)
    s1 = 1.45
    fins = []
    for _ in range(3):
        f = AF.fim_da_fala(env, s1, silencio=0.08)
        s1 = round(f["fim"] + min(0.09, max(0.03, f["pausa"] - 0.13)), 3)
        fins.append(s1)
    assert fins[1] > fins[0] + 0.02 and fins[2] >= fins[1], fins
    assert not AF.corte_final_ok(env, fins[0])[0] and not AF.corte_final_ok(env, fins[1])[0]


def test_2_1_duas_rodadas_nao_alongam_mesmo_sem_a_marca(pausa_curta):
    edl = _edl(pausa_curta, _voz2())
    r1 = C.ajustar_edl(edl, Fontes(edl))
    d1, voz1, pl1 = edl["duracao"], copy.deepcopy(edl["voz"]), copy.deepcopy(edl["planos"])
    assert r1["estado"] == "ajustado" and r1["mexidas"] == 1
    for _ in range(2):                                    # sem a marca: a correção da causa sozinha segura o filme
        r = C.ajustar_edl(edl, Fontes(edl), forcar_marca=True)
        assert r["estado"] == "sem_mudanca", r
    assert edl["duracao"] == d1 and edl["voz"] == voz1 and edl["planos"] == pl1
    v1 = edl["voz"][0]
    assert v1["s1"] < 1.76 - 0.05, v1                     # nunca come a palavra seguinte (1,76 s)
    assert any("OUVIR" in n for n in r1["notas"])         # pausa curta demais para passar: dito, não escondido


# ------------------------------------------------------------------ 2.2
def test_2_2_segunda_rodada_e_nada_a_fazer(pausa_boa):
    edl = _edl(pausa_boa, _voz2())
    r1 = C.ajustar_edl(edl, Fontes(edl))
    antes = copy.deepcopy(edl)
    r2 = C.ajustar_edl(edl, Fontes(edl))
    assert r1["estado"] == "ajustado" and r2["estado"] == "nada_a_fazer"
    assert abs(edl["duracao"] - antes["duracao"]) <= 0.005 and edl["voz"] == antes["voz"] and edl["planos"] == antes["planos"]
    marca = edl["origem"]["cortes_audio"]
    assert marca["algo"] == C.ALGO and marca["voz"] == C.hash_voz(edl["voz"]) and marca["mexidas"] == 1
    assert marca["duracao_antes"] == 2.0 and marca["duracao_depois"] == edl["duracao"]


def test_2_2_edl_editado_depois_roda_de_novo(pausa_boa):
    edl = _edl(pausa_boa, _voz2())
    C.ajustar_edl(edl, Fontes(edl))
    edl["voz"][1]["s1"] = 3.5                              # alguém mexeu no EDL: a marca não vale mais
    edl["voz"][1]["t1"] = round(edl["voz"][1]["t0"] + 0.55, 4)
    r = C.ajustar_edl(edl, Fontes(edl))
    assert r["estado"] in ("ajustado", "sem_mudanca") and edl["origem"]["cortes_audio"]["voz"] == C.hash_voz(edl["voz"])


# ------------------------------------------------------------------ 2.3
def test_2_3_fim_cedo_vira_fim_que_a_conferencia_aprova(pausa_boa):
    edl = _edl(pausa_boa, _voz2(s1_v1=1.40))               # 0,2 s antes do fim do som (1,60 s)
    assert ("V1", "fim") in _reprovadas(edl)
    r = C.ajustar_edl(edl, Fontes(edl))
    v1 = next(v for v in edl["voz"] if v["id"] == "V1")
    assert r["mexidas"] == 1 and v1["s1"] > 1.6 and v1["s1"] < 1.9 - 0.12, v1
    assert _reprovadas(edl) == set()                       # régua 1 da conferência
    from motor.etapas.qa import fala_cortada as FC
    x, _ = sf.read(pausa_boa, dtype="float32")
    m = FC.medir_fim(x[::3], 16000, v1["s1"])
    motivos, _ = FC.reguas_do_fim(v1, v1["s1"], m, None, None, None)
    assert motivos == [], motivos                          # régua 2 (cauda da última sílaba)
    assert edl["voz"][1]["t0"] > 0.6                       # o resto do filme andou junto
    assert edl["planos"][0]["t1"] == pytest.approx(edl["duracao"])


# ------------------------------------------------------------------ 2.4
def test_2_4_corte_confirmado_fica_intocado(pausa_boa):
    edl = _edl(pausa_boa, _voz2(s1_v1=1.40))
    edl["qa"]["cortes_confirmados"] = ["V1"]
    antes = copy.deepcopy(edl["voz"])
    r = C.ajustar_edl(edl, Fontes(edl))
    assert r["mexidas"] == 0 and edl["voz"] == antes and edl["duracao"] == 2.0


# ------------------------------------------------------------------ 2.5
def _limites(edl, s1_novo):
    vz = sorted(copy.deepcopy(edl["voz"]), key=lambda v: v["t0"])
    for v in vz:
        v["_s0"], v["_s1"], v["_nota"], v["_mexeu"] = v["s0"], v["s1"], [], set()
    vz[0]["_s1"], vz[0]["_mexeu"] = s1_novo, {"fim"}
    return vz


def test_2_5_tudo_que_tem_tempo_anda_pelo_mapa(pausa_boa):
    edl = _edl(pausa_boa, _voz2(s1_v1=1.40))
    edl["sons_reais"] = [{"id": "R01", "t0": 1.0, "t1": 1.8}]
    edl["legendas"]["palavras"] = [[0.6, 0.9, "tres", 0]]
    edl["motion"] = [{"id": "m1", "modelo": "x", "de": 0.7, "ate": 1.9, "props": {"itens": [{"t": 1.2}]}}]
    edl["fx"] = [{"tipo": "whip", "t": 0.6, "dur": 0.2}]
    edl["sfx"] = [{"t": 0.65, "som": "x", "g": -10, "pan": 0}]
    edl["qa"]["logos"] = [{"t": 1.9, "chave": "logo.png"}]
    edl["trilha"] = {"chave": "musica.wav", "acorde_final": 1.9, "emendas": [[0.0, 10.0, 12.0, 0.0]]}
    novo, _, avisos = C.aplicar(edl, _limites(edl, 1.70), duracao_musica=lambda ch: 60.0)
    delta = novo["duracao"] - edl["duracao"]
    # V1 ganhou 0,30 s no fim; o vão curto até V2 (0,15 s) devolve até 80 ms do respiro acrescentado: tudo depois anda 0,22 s
    assert delta == pytest.approx(0.22, abs=0.01)
    d = 0.22
    assert novo["sons_reais"][0]["t0"] == pytest.approx(1.0 + d, abs=0.01) and novo["sons_reais"][0]["t1"] == pytest.approx(1.8 + d, abs=0.01)
    assert novo["legendas"]["palavras"][0][0] == pytest.approx(0.6 + d, abs=0.01)
    assert novo["motion"][0]["de"] == pytest.approx(0.7 + d, abs=0.01) and novo["motion"][0]["props"]["itens"][0]["t"] == pytest.approx(1.2 + d, abs=0.01)
    assert novo["fx"][0]["t"] == pytest.approx(0.6 + d, abs=0.01) and novo["sfx"][0]["t"] == pytest.approx(0.65 + d, abs=0.01)
    assert novo["qa"]["logos"][0]["t"] == pytest.approx(1.9 + d, abs=0.01) and novo["trilha"]["acorde_final"] == pytest.approx(1.9 + d, abs=0.01)
    assert novo["trilha"]["emendas"][0][2] == pytest.approx(12.0 + d, abs=0.01) and avisos == []      # emenda única acompanha
    _, _, sem_sobra = C.aplicar(edl, _limites(edl, 1.70), duracao_musica=lambda ch: 12.0)
    assert sem_sobra and "não tem sobra" in sem_sobra[0]
    edl["trilha"]["emendas"] = [[0.0, 10.0, 11.0, 0.0], [1.0, 30.0, 31.0, 0.1]]
    _, _, avisos2 = C.aplicar(edl, _limites(edl, 1.70), duracao_musica=lambda ch: 60.0)
    assert avisos2 and "emendada por compasso" in avisos2[0]
    edl["trilha"] = {"chave": None, "faixas": [{"chave": "a.wav", "entra_em": 0.0, "s_de": 0.0}, {"chave": "b.wav", "entra_em": 1.0, "s_de": 3.0, "troca_em": 1.2}]}
    novo3, _, _ = C.aplicar(edl, _limites(edl, 1.70))
    assert novo3["trilha"]["faixas"][1]["entra_em"] == pytest.approx(1.0 + d, abs=0.01) and novo3["trilha"]["faixas"][1]["troca_em"] == pytest.approx(1.2 + d, abs=0.01)


def test_2_5_aperto_de_pausa_do_resolvedor_nao_e_desfeito(pausa_boa):
    """Peças vizinhas da mesma fonte, que o resolvedor separou de propósito, só viram uma se a ponta mexida encostar."""
    edl = _edl(pausa_boa, [{"id": "V1", "fonte": "A", "s0": 0.95, "s1": 1.7, "t0": 0.0, "t1": 0.75, "vel": 1.0, "texto": "um"},
                           {"id": "V2", "fonte": "A", "s0": 1.85, "s1": 2.45, "t0": 0.8, "t1": 1.4, "vel": 1.0, "texto": "dois"}])
    vz = sorted(copy.deepcopy(edl["voz"]), key=lambda v: v["t0"])
    for v in vz:
        v["_s0"], v["_s1"], v["_nota"], v["_mexeu"] = v["s0"], v["s1"], [], set()
    novo, rel, _ = C.aplicar(edl, vz)
    assert len(novo["voz"]) == 2 and not any(r["juntou"] for r in rel)


# ------------------------------------------------------------------ 2.6 (o passo na montagem) e 2.3 (edl.json gravado)
@pytest.fixture()
def ctx_montagem(tmp_path, dados, monkeypatch, pausa_boa):
    from motor import banco, config
    from motor.etapas import Contexto
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p','t',?,?)", (banco.agora_iso(), banco.agora_iso()))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p','montando',?)", (banco.agora_iso(),))
    arm.gravar_json("saidas/p/v1/edl.json", _edl(pausa_boa, _voz2(s1_v1=1.40)))
    import motor.etapas.montagem as M
    monkeypatch.setattr(M.fatos, "revisar", lambda *a, **k: {"estado": "sem_numeros"})
    renders = []

    def montar_falso(edl, trabalho, fontes, cfg, **k):
        renders.append(copy.deepcopy(edl))
        trabalho = pathlib.Path(trabalho)
        trabalho.mkdir(parents=True, exist_ok=True)
        for n in ("final.mp4", "mix.wav"):
            (trabalho / n).write_bytes(b"x")
        return {"versao": M.VERSAO, "edl_hash": M.hash_obj(edl), "kit": M.OV._versao_kit(), "final": str(trabalho / "final.mp4"),
                "mix": str(trabalho / "mix.wav"), "stems": {}, "tempos": {}, "overlay": {"ms_quadro_efetivo": None}, "cor": []}
    monkeypatch.setattr(M, "montar", montar_falso)
    return Contexto(con=con, cfg=cfg, job={"id": "j1", "etapa": "montagem", "projeto": "p", "alvo": "v1"}, armazenamento=arm), arm, renders


def test_2_3_e_2_6_montagem_grava_o_corte_e_reaproveita_o_render(ctx_montagem):
    import motor.etapas.montagem as M
    ctx, arm, renders = ctx_montagem
    r1 = M.etapa_montagem(ctx)
    edl = arm.ler_json("saidas/p/v1/edl.json")
    v1 = next(v for v in edl["voz"] if v["id"] == "V1")
    assert v1["s1"] > 1.6 and edl["origem"]["cortes_audio"]["mexidas"] == 1, v1      # 2.3: edl.json gravado antes do render
    assert len(renders) == 1 and renders[0]["voz"] == edl["voz"]                      # o render já recebeu o corte novo
    assert not r1.get("reaproveitada")
    r2 = M.etapa_montagem(ctx)                                                        # 2.6: mesma montagem de novo
    assert r2.get("reaproveitada") is True and len(renders) == 1
    assert arm.ler_json("saidas/p/v1/edl.json") == edl


def test_mix_diz_quando_nao_ha_tom_de_sala():
    import motor.etapas.montagem as M
    edl = {"voz": [{"id": "V1"}], "tom_sala": None, "trilha": {"chave": "x"},
           "origem": {"tom_sala": {"escolhido": None, "recusados": [], "motivo": "não achei trecho sem ninguém falando no material"}}}
    assert "sem tom de sala: não achei trecho sem ninguém falando no material" in M._achado_mix(edl, {"lufs": -14.0})


# ------------------------------------------------------------------ 2.7 (a ferramenta respeita a marca)
def test_2_7_ferramenta_respeita_a_marca(dados, pausa_boa, capsys):
    from motor import config
    from motor.ferramentas import ajustar_cortes as AJ
    from motor.provedores import armazenamento_de
    arm = armazenamento_de(config.carregar())
    edl = _edl(pausa_boa, _voz2(s1_v1=1.40))
    C.ajustar_edl(edl, Fontes(edl))
    arm.gravar_json("saidas/p/v1/edl.json", edl)
    assert AJ.main(["p", "v1", "--sem-fila"]) == 0
    assert "já ajustado" in capsys.readouterr().out
    assert AJ.main(["p", "v1", "--sem-fila", "--forcar", "--so-relatorio"]) == 0
    saida = capsys.readouterr().out
    assert "já ajustado" not in saida and "0 mexida(s)" in saida and "V1" in saida
    assert arm.ler_json("saidas/p/v1/edl.json") == edl


def test_falha_de_leitura_deixa_o_edl_como_veio(tmp_path):
    edl = _edl(tmp_path / "nao_existe.wav", _voz2())
    antes = copy.deepcopy(edl)
    r = C.ajustar_edl(edl, Fontes(edl))
    assert r["estado"] == "falhou" and edl == antes and "não consegui ouvir" in C.achado(r)


def test_achado_em_numeros(pausa_boa):
    edl = _edl(pausa_boa, _voz2(s1_v1=1.40))
    r = C.ajustar_edl(edl, Fontes(edl))
    assert C.achado(r).startswith("Cortes pelo som: 1 de 2 acertados")
    assert json.dumps(edl["origem"]["cortes_audio"])               # serializável, sem set


# ------------------------------------------------------------------ gancho do item 4d na montagem (montagem.sincronia)
def test_sincronia_so_no_dialogo_e_com_import_protegido(monkeypatch, pausa_boa):
    import sys
    import types
    import motor.etapas.montagem as M
    chamadas = []
    falso = types.ModuleType("motor.etapas.sincronia_cameras")

    def alinhar(edl, audio_de, modo):
        x, off = audio_de("A")
        chamadas.append((modo, len(x), off))
        edl["planos"][0]["s0"] = round(edl["planos"][0]["s0"] + 0.5, 4)
        return {"algo": "sinc-1", "pares": {}, "planos": {"P1": {"s0_antes": 0.95, "s0_depois": 1.45, "par": "A|A"}}}
    falso.alinhar = alinhar
    monkeypatch.setitem(sys.modules, "motor.etapas.sincronia_cameras", falso)
    # junção com MOTOR-B: o módulo de verdade já pode estar importado (atributo do pacote ganha de sys.modules no "from ... import")
    import motor.etapas as E
    monkeypatch.setattr(E, "sincronia_cameras", falso, raising=False)
    edl = _edl(pausa_boa, _voz2())
    edl["origem"]["vozes"] = "uma"
    assert M._sincronizar(edl, Fontes(edl), None) is None and chamadas == []          # caso de uma voz: nada muda
    edl["origem"]["vozes"] = "varias"
    rel = M._sincronizar(edl, Fontes(edl), None)
    assert chamadas == [("varias", 16000 * 5, 0.0)] and edl["origem"]["sincronia"] == rel and edl["planos"][0]["s0"] == 1.45
    monkeypatch.setitem(sys.modules, "motor.etapas.sincronia_cameras", None)         # módulo da outra frente ausente
    monkeypatch.delattr(E, "sincronia_cameras", raising=False)
    assert M._sincronizar(edl, Fontes(edl), None) is None
