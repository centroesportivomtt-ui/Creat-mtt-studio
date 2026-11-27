"""M6: a pista dos sons reais na mixagem (tempo, nível, ducking, fades, graves, estéreo, laço) e a montagem de ponta a
ponta com a rede caindo e voltando. Áudio sintético; nenhum teste usa a internet."""
import copy
import importlib.util
import json
import pathlib
import sqlite3
import subprocess
import types

import numpy as np
import pytest
from b_sons_reais import Servidor, TranscritorFalso, banco, batida, ruido_rosa, sem_internet  # noqa: F401 - fixtures

from motor.etapas.montagem import mix as MIX
from motor.etapas.montagem import reais as REAIS
from motor.etapas.montagem.comum import Fontes

SR = 48000
RAIZ_GIT = pathlib.Path(__file__).resolve().parents[5]


def _db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.asarray(x, np.float64) ** 2)) + 1e-12)


def _item(papel="ambiente", t0=0.0, t1=10.0, ganho=None, fade=None, rid="R01"):
    return {"id": rid, "papel": papel, "desc": "teste", "t0": t0, "t1": t1,
            "ganho_db": ganho if ganho is not None else (-28.0 if papel == "ambiente" else -10.0),
            "fade": fade or ([1.2, 1.5] if papel == "ambiente" else [0.005, 0.03])}


def _voz(n, ini, fim, seed=5):
    from scipy.signal import butter, sosfilt
    x = sosfilt(butter(4, [300, 3000], "bp", fs=SR, output="sos"), np.random.default_rng(seed).standard_normal(n)).astype(np.float32)
    x *= 0.1 / (np.sqrt(np.mean(x ** 2)) + 1e-9)
    t = np.arange(n) / SR
    return (x * ((t >= ini) & (t < fim))).astype(np.float32)


def _edl(dur, itens):
    return {"duracao": dur, "trilha": {"ganho_db": -14}, "master": {"lufs": -14, "tp": -1.0}, "sfx": [], "planos": [], "fontes": {},
            "tom_sala": None, "sons_reais": itens}


MIX_ANTES_DA_M6 = "83158730d4573b53bdcaa5b874fdcf249098ff38"      # blob git do mix.py de antes da M6 (fica no histórico)


def _mix_antigo():
    """mix.py como estava antes da M6 (blob fixo do git), para provar que reais=None não muda nada."""
    r = subprocess.run(["git", "-C", str(RAIZ_GIT), "cat-file", "-p", MIX_ANTES_DA_M6], capture_output=True, text=True)
    if r.returncode != 0 or "def mixar" not in r.stdout:
        pytest.skip("o mix.py de antes da M6 não está no git desta máquina")
    return r.stdout


def test_reais_none_sai_identico_ao_mix_de_antes(tmp_path):
    import soundfile as sf
    fonte = _mix_antigo()
    arq = tmp_path / "mix_antigo.py"
    arq.write_text(fonte)
    spec = importlib.util.spec_from_file_location("mix_antigo_m6", arq)
    antigo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(antigo)
    from motor.etapas.montagem import trilha
    n = SR * 6
    t = np.arange(n) / SR
    voz = (0.2 * np.sin(2 * np.pi * 200 * t) * (np.sin(2 * np.pi * 3 * t) > 0) * (t > 0.5) * (t < 4.5)).astype(np.float32)
    mus = np.stack([0.3 * np.sin(2 * np.pi * 110 * t)] * 2, 1).astype(np.float32)
    edl = {"duracao": 6.0, "trilha": {"ganho_db": -16}, "master": {"lufs": -14, "tp": -1.0}, "sfx": [{"t": 1.0, "som": "hit_boom_grave"}],
           "planos": [], "fontes": {}, "tom_sala": None}
    fx, _ = trilha.montar_sfx(edl, None)
    a = antigo.mixar(edl, voz.copy(), mus.copy(), fx.copy(), Fontes(edl), tmp_path / "a", None)
    b = MIX.mixar(edl, voz.copy(), mus.copy(), fx.copy(), Fontes(edl), tmp_path / "b", None, reais=None)
    assert {k: v for k, v in a.items() if k not in ("mix", "stems")} == {k: v for k, v in b.items() if k not in ("mix", "stems")}
    assert set(b["stems"]) == {"voz", "trilha", "sfx", "direto", "ambiente"}
    assert np.array_equal(sf.read(a["mix"])[0], sf.read(b["mix"])[0])
    for k in a["stems"]:
        assert np.array_equal(sf.read(a["stems"][k])[0], sf.read(b["stems"][k])[0]), k


def test_ambiente_no_nivel_e_8_db_abaixo_sob_a_voz(tmp_path):
    import soundfile as sf
    N = SR * 10
    it = _item()
    edl = _edl(10.0, [it])
    pista, rel = REAIS.pista(edl, [{"item": it, "audio": ruido_rosa(SR * 12, 21), "id_banco": 101}], N)
    assert rel["sons"][0]["t0"] == 0.0 and rel["sons"][0]["t1"] == 10.0
    assert abs(REAIS.lufs(pista["ambiente"][int(1.3 * SR):int(8.4 * SR)]) - (-28.0)) < 0.8            # -28 LUFS no próprio trecho
    r = MIX.mixar(edl, _voz(N, 4.0, 7.0), np.zeros((N, 2), np.float32), np.zeros((N, 2), np.float32), Fontes(edl), tmp_path, reais=pista)
    assert "reais" in r["stems"]
    st, _ = sf.read(r["stems"]["reais"])
    queda = _db(st[int(2.0 * SR):int(3.5 * SR)]) - _db(st[int(5.0 * SR):int(6.5 * SR)])
    assert abs(queda - 8.0) < 1.0, queda
    assert r["voz_sobre_cama_db"] > 9 and r["true_peak_db"] <= -1.0 and abs(r["lufs"] + 14) <= 0.5


def test_sem_estalo_nas_bordas_e_pontual_com_ataque_no_tempo(tmp_path):
    N = SR * 8
    amb = _item(t0=0.5, t1=6.0)
    pon = _item("pontual", t0=3.0, t1=5.0, ganho=-7.0, rid="R02")
    tampa = batida(2.0, 0.6, SR, 1)
    pista, rel = REAIS.pista(_edl(8.0, [amb, pon]), [{"item": amb, "audio": ruido_rosa(SR * 7, 22), "id_banco": 1},
                                                     {"item": pon, "audio": np.repeat(tampa, 2, 1), "id_banco": 2}], N)
    a = pista["ambiente"]
    i0, i1 = int(0.5 * SR), int(6.0 * SR)
    corpo = np.abs(np.diff(a[i0 + SR:i1 - 2 * SR], axis=0)).max()
    assert np.abs(a[:i0]).max() == 0 and np.abs(a[i1:]).max() == 0
    assert np.abs(a[i0]).max() < 1e-4 and np.abs(a[i1 - 1]).max() < 2e-3
    assert np.abs(np.diff(a[i0:i0 + 480], axis=0)).max() <= corpo and np.abs(np.diff(a[i1 - 480:i1], axis=0)).max() <= corpo
    p = pista["pontual"]
    at = REAIS.ataque(p)
    assert abs(at / SR - 3.0) < 0.012                                                  # o ataque cai em t0
    assert abs(20 * np.log10(np.abs(p).max()) - (-7.0)) < 0.05                          # pico em -10 + força 3
    assert np.abs(p[:int(2.99 * SR)]).max() < 1e-4                                     # silêncio inicial cortado (nada antes)
    ini = int(np.argmax(np.abs(p).max(1) > 0))
    assert np.abs(p[ini]).max() < 1e-3 and np.abs(p[int(5.0 * SR) + 300:]).max() == 0   # entra em 5 ms, sai em 30 ms


def test_graves_cortados_estereo_e_laco_sem_degrau():
    N = SR * 20
    t = np.arange(SR * 12) / SR
    ronco = ruido_rosa(SR * 12, 23) * 0.3 + (0.5 * np.sin(2 * np.pi * 30 * t))[:, None].astype(np.float32)
    it = _item(t0=0.0, t1=12.0)
    pista, _ = REAIS.pista(_edl(20.0, [it]), [{"item": it, "audio": ronco, "id_banco": 1}], N)

    def razao(x):
        f = np.fft.rfftfreq(len(x), 1 / SR)
        P = np.abs(np.fft.rfft(x[:, 0].astype(np.float64))) ** 2
        return 10 * np.log10(P[f < 60].sum() / P[(f > 200) & (f < 2000)].sum())
    assert razao(ronco[2 * SR:9 * SR]) - razao(pista["ambiente"][2 * SR:9 * SR]) > 20      # abaixo de 60 Hz: atenuado
    mono = _item(t0=0.0, t1=6.0)
    pm, _ = REAIS.pista(_edl(20.0, [mono]), [{"item": mono, "audio": ruido_rosa(SR * 7, 24, canais=1), "id_banco": 1}], N)
    assert pm["ambiente"].shape == (N, 2) and np.array_equal(pm["ambiente"][:, 0], pm["ambiente"][:, 1])   # dual mono no centro
    assert abs(np.corrcoef(pista["ambiente"][SR:8 * SR, 0], pista["ambiente"][SR:8 * SR, 1])[0, 1]) < 0.9   # estéreo como veio
    curto = _item(t0=0.0, t1=20.0)
    pl, _ = REAIS.pista(_edl(20.0, [curto]), [{"item": curto, "audio": ruido_rosa(SR * 5, 25), "id_banco": 1}], N)
    x = pl["ambiente"][int(1.5 * SR):int(18.0 * SR)]
    h = SR // 4
    env = np.array([_db(x[i:i + h]) for i in range(0, len(x) - h, h)])
    assert np.abs(env - np.median(env)).max() < 1.5                                     # 4 emendas de laço, sem degrau


def test_ambiente_segue_a_musica():
    n = SR * 10
    t = np.arange(n) / SR
    mus = (np.where(t < 5, 0.02, 0.3) * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    g = REAIS.ganho_musica(np.stack([mus, mus], 1), n)
    gdb = 20 * np.log10(g)
    assert gdb.max() <= 4.0 + 1e-6 and gdb.min() >= -4.0 - 1e-6
    assert gdb[int(1 * SR):int(3.5 * SR)].mean() > 2.5 and gdb[int(6.5 * SR):int(9 * SR)].mean() < -2.5   # respiro sobe, drop desce
    assert np.all(REAIS.ganho_musica(np.zeros((n, 2), np.float32), n) == 1.0)                         # sem música: nada muda


# ---------------------------------------------------------------- ponta a ponta
def _ctx(cfg, arm):
    con = sqlite3.connect(":memory:", check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE versoes (id TEXT, projeto TEXT, estado TEXT, video TEXT, qa TEXT, link TEXT, criado TEXT)")
    con.execute("CREATE TABLE projetos (id TEXT, nome TEXT)")
    con.execute("INSERT INTO versoes (id, projeto, estado) VALUES ('v1', 'p_sf', 'montando')")
    return types.SimpleNamespace(projeto="p_sf", alvo="v1", armazenamento=arm, cfg=cfg, con=con,
                                 progresso=lambda *a, **k: None, job={"etapa": "montagem", "id": "j1", "projeto": "p_sf"})


def test_montagem_de_ponta_a_ponta_com_a_rede_caindo_e_voltando(banco, monkeypatch, tmp_path):
    """Rede fora: o filme sai, sem o som e sem nada sintético no lugar, o aviso aparece e o reuso fica bloqueado.
    Rede de volta: a próxima montagem baixa, o som entra no tempo e no nível certos, e a seguinte é reaproveitada."""
    import soundfile as sf
    import test_sem_fala as TSF
    from motor import config
    from motor import sons_reais as SONS
    from motor.etapas import montagem
    from motor.etapas.montagem import overlay as OV
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    monkeypatch.setattr(OV, "renderizar", lambda *a, **k: {"dir": None, "stats": {}})     # o kit (navegador) não entra no teste
    monkeypatch.setattr(SONS, "transcritor_local", lambda cfg: TranscritorFalso())
    monkeypatch.setenv("EDITOR_FATOS", "0")
    mat = {"pasta": tmp_path, "an": [TSF._analise(c, str(TSF._clipe(tmp_path, c))) for c in TSF.CORES], "cat": TSF._catalogo(),
           "trilha": TSF._trilha_wav(tmp_path / "trilha.wav")}
    d = copy.deepcopy(TSF.DIRECAO)
    d["blocos"][2]["sons"] = [{"desc": "floresta de manhã", "busca": "forest morning birds", "papel": "ambiente"}]
    edl = TSF._resolver(mat, d)
    edl["formato"] = {"w": 180, "h": 320, "fps": 30}
    it = edl["sons_reais"][0]
    cfg = config.carregar()
    arm = ArmazenamentoLocal(cfg)
    arm.gravar_json("saidas/p_sf/v1/edl.json", edl)
    ctx = _ctx(cfg, arm)
    srv, porta = banco["srv"], banco["srv"].porta
    srv.fechar()                                                                          # a rede cai

    r1 = montagem.etapa_montagem(ctx)
    mont = arm.ler_json("saidas/p_sf/v1/montagem.json")
    assert not r1.get("reaproveitada") and arm.existe("saidas/p_sf/v1/final.mp4")
    sr = mont["sons_reais"]
    assert sr["itens"] == [] and sr["pendentes"] == 1 and "rede indisponível" in sr["faltaram"][0]["motivo"]
    assert any("ficou de fora" in a for a in sr["avisos"]) and sr["licenca"]["nome"] == "Sonniss #GameAudioGDC Bundle"
    assert "reais" not in mont["chaves"]["stems"]                                         # nada no lugar (nem sintético)
    r2 = montagem.etapa_montagem(ctx)                                                     # pendente: não reaproveita
    assert not r2.get("reaproveitada")

    volta = Servidor(porta)                                                               # a rede volta (mesmo endereço)
    volta.arquivos.update(srv.arquivos)
    try:
        r3 = montagem.etapa_montagem(ctx)
        mont = arm.ler_json("saidas/p_sf/v1/montagem.json")
        assert not r3.get("reaproveitada") and mont["sons_reais"]["pendentes"] == 0 and volta.contar() == 2
        x = mont["sons_reais"]["itens"][0]
        assert (x["id_banco"], x["origem"], x["verificacao"], x["item"]) == (110, "baixado", "cabecalho+tamanho", "fake-gdc-2024")
        assert "reais" not in mont["chaves"]["stems"] and not arm.existe("saidas/p_sf/v1/stems/reais.flac")   # licença
        st, _ = sf.read(mont["stems_locais"]["reais"])                                     # só no disco de trabalho
        a, b = int(it["t0"] * SR), int(it["t1"] * SR)
        assert np.abs(st[:a - 10]).max() < 1e-5 and _db(st[a + int(1.3 * SR):b - int(1.6 * SR)]) > -60   # entra no tempo
        assert np.abs(st[a]).max() < 1e-3                                                                # com fade, sem estalo
        mus, _ = sf.read(arm.caminho_local(mont["chaves"]["stems"]["trilha"]))
        cama = _db(mus[a + int(1.3 * SR):b - int(1.6 * SR)])
        assert 6 < cama - _db(st[a + int(1.3 * SR):b - int(1.6 * SR)]) < 16                               # sob a música
        r4 = montagem.etapa_montagem(ctx)
        assert r4.get("reaproveitada") and volta.contar() == 2                                           # sem pendência: reusa
    finally:
        volta.fechar()
