"""Medidor de qualidade da voz (DNSMOS P.835): sem modelo devolve None; com sessão falsa, as contas de janela e o mapa de notas."""
import numpy as np


class SessaoFalsa:
    def __init__(self):
        self.chamadas = 0

    def run(self, _saidas, ent):
        self.chamadas += 1
        assert ent["input_1"].shape == (1, int(9.01 * 16000))
        return [np.array([[3.0, 3.5, 3.2]], np.float32)]


def test_sem_modelo_none(dados, monkeypatch):
    from motor import config, qualidade_voz as Q
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "0")
    monkeypatch.delenv("EDITOR_DNSMOS", raising=False)
    monkeypatch.setattr(Q, "_SESSAO", None)
    assert Q.notas(np.zeros(48000, np.float32), 48000, config.carregar()) is None


def test_janelas_e_mapa():
    from motor import qualidade_voz as Q
    s = SessaoFalsa()
    n = Q.notas(np.random.default_rng(0).standard_normal(48000 * 3).astype(np.float32) * 0.1, 48000, sessao=s)
    assert s.chamadas == 1 and set(n) == {"sig", "bak", "ovrl"}                  # 3 s repetidos até 9,01 s: uma janela
    assert abs(n["sig"] - round(float(Q._P_SIG(3.0)), 2)) < 1e-6
    s2 = SessaoFalsa()
    Q.notas(np.zeros(16000 * 12, np.float32) + 0.01, 16000, sessao=s2)
    assert s2.chamadas == 3                                                     # 12 s: janelas de 9,01 s com passo de 1 s
    assert Q.notas(np.zeros(1000, np.float32), 16000, sessao=SessaoFalsa()) is None   # curto demais
