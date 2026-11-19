"""Segunda rodada da revisão do Super Kal (19/11): índice de quadro sem arredondamento bancário e régua do fim da fala que
segue a voz depois de uma oclusiva e enxerga o "s" final (3,5 a 7,5 kHz)."""
import numpy as np

from motor import audio_fala as AF
from motor.etapas.montagem.planos import camera_lenta, indices_de_quadro, tempos_fonte

SR = 16000


# ---------------------------------------------------------------- índice de quadro
def test_plano_em_meio_quadro_nao_repete_quadro():
    """s0 = 0,15 s a 30 qps cai em 4,5 quadros: np.round dava 4, 6, 6, 8, 8... (um quadro repetido a cada dois, 15 qps)."""
    p = {"id": "P1", "s0": 0.15, "vel": 1.0}
    ts = tempos_fonte(p, 60, 30.0)
    idx, frac = indices_de_quadro(ts, 0.0, 30.0, 10_000, camera_lenta(p))
    assert np.all(np.diff(idx) > 0) and np.all(np.diff(idx) == 1)     # consecutivos, estritamente crescentes
    assert idx[0] == 5 and not frac.any()
    antigo = np.round((ts - 0.0) * 30.0).astype(int)                  # a conta antiga, para o registro do defeito
    assert (np.diff(antigo) == 0).any()


def test_camera_lenta_mistura_vizinhos_em_vez_de_repetir():
    p = {"id": "P2", "s0": 1.0, "vel": 0.5}
    assert camera_lenta(p) and not camera_lenta({"vel": 0.5, "rampa": [[0, 1.0], [1, 2.0]]}) and not camera_lenta({"vel": 1.0})
    idx, frac = indices_de_quadro(tempos_fonte(p, 8, 30.0), 0.0, 30.0, 10_000, True)
    assert list(idx) == [30, 30, 31, 31, 32, 32, 33, 33] and np.allclose(frac, [0, 0.5] * 4, atol=1e-3)
    idx, _ = indices_de_quadro(np.array([-1.0, 999.0]), 0.0, 30.0, 100)  # fora do arquivo: preso nas pontas
    assert list(idx) == [0, 99]


# ---------------------------------------------------------------- régua física do fim da fala
def _vogal(dur, f0=150.0, amp=0.2):
    t = np.arange(int(dur * SR)) / SR
    x = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 20) if f0 * k < 3000)
    x = amp * x / np.max(np.abs(x))
    q = int(0.01 * SR)
    x[:q] *= np.linspace(0, 1, q)
    x[-q:] *= np.linspace(1, 0, q)
    return x


def _chiado(dur, amp, rng):
    from scipy.signal import butter, sosfilt
    y = sosfilt(butter(4, [4000, 7000], "bp", fs=SR, output="sos"), rng.normal(0, 1, int(dur * SR)))
    return amp * y / np.sqrt(np.mean(y ** 2))


def _arquivo(pecas, dur=3.0):
    rng = np.random.default_rng(3)
    x = rng.normal(0, 0.002, int(dur * SR))
    for t0, seg in pecas:
        i = int(t0 * SR)
        x[i:i + len(seg)] += seg
    return x.astype(np.float32), rng


def test_fim_da_fala_segue_a_voz_depois_da_oclusiva():
    """Vogal até 1,20 s, oclusão de 70 ms (o "t" de "fruta"), sílaba final de 1,27 a 1,45 s: o fim é depois da sílaba."""
    x, _ = _arquivo([(0.5, _vogal(0.70)), (1.27, _vogal(0.18, 170.0)), (2.0, _vogal(0.6))])
    env = AF.envelope(x, SR)
    for corte in (1.21, 1.25):                                # corte logo depois da vogal e no meio da oclusão
        f = AF.fim_da_fala(env, corte)
        assert f["ativa"] and f["fim"] is not None and 1.43 <= f["fim"] <= 1.55, (corte, f)
        ok, motivo = AF.corte_final_ok(env, corte)
        assert not ok and "continua" in motivo
    assert AF.corte_final_ok(env, 1.62)[0]                    # depois da sílaba, com respiro: passa


def test_s_final_colado_na_voz_reprova_o_corte_antes_do_fim_do_chiado():
    """'calorias': a vogal acaba em 1,20 s e o "s" (4 a 7 kHz, fraco na banda da voz) segue até 1,36 s."""
    x, rng = _arquivo([(0.5, _vogal(0.70)), (2.0, _vogal(0.6))])
    x[int(1.19 * SR):int(1.36 * SR)] += _chiado(0.17, 0.008, rng).astype(np.float32)
    env = AF.envelope(x, SR)
    assert "db_hf" in env and "limiar_hf" in env
    i = int(round(1.28 / AF.PASSO))
    assert env["db"][i] < env["limiar"] and env["db_hf"][i] > env["limiar_hf"]   # a banda da voz não vê o "s"; a do chiado vê
    ok, motivo = AF.corte_final_ok(env, 1.28)
    assert not ok and "chiado" in motivo
    f = AF.fim_da_fala(env, 1.28)
    assert 1.33 <= f["fim"] <= 1.42
    assert AF.corte_final_ok(env, 1.50)[0]                    # corte depois do "s": passa
