"""27/11 (Bastidores Super Kal): com 3 leitores de 4K juntos o leitor volta vazio; os planos que falharam são refeitos um por
vez antes de a montagem cair."""
import pytest

from motor.etapas.montagem import planos as PL


class _Fontes:
    def video(self, f): return f"/x/{f}.mov"
    def assinatura(self, f): return f
    def offset(self, f): return 0.0


class _PoolFalso:
    """Executor "paralelo" falso: todo plano falha como no caso real (sem memória)."""
    def __init__(self, *a, **k): pass
    def map(self, fn, tarefas): return [{"id": t[0]["id"], "erro": "RuntimeError: nenhum quadro decodificado"} for t in tarefas]
    def shutdown(self): pass


def _edl():
    return {"formato": {"w": 270, "h": 480, "fps": 30},
            "planos": [{"id": f"P{i}", "fonte": "A", "s0": 0.0, "t0": float(i), "t1": float(i + 1)} for i in range(3)]}


def test_falha_em_paralelo_e_refeita_um_por_vez(tmp_path, monkeypatch):
    import concurrent.futures as cf
    monkeypatch.setattr(cf, "ProcessPoolExecutor", _PoolFalso)
    feitos = []
    monkeypatch.setattr(PL, "_trabalho", lambda t: feitos.append(t[0]["id"]) or {"id": t[0]["id"], "ok": True})
    res = PL.renderizar(_edl(), _Fontes(), tmp_path, workers=3)
    assert feitos == ["P0", "P1", "P2"] and all(r["info"] for r in res.values())


def test_falha_que_persiste_ainda_da_erro(tmp_path, monkeypatch):
    import concurrent.futures as cf
    monkeypatch.setattr(cf, "ProcessPoolExecutor", _PoolFalso)
    monkeypatch.setattr(PL, "_trabalho", lambda t: {"id": t[0]["id"], "erro": "RuntimeError: arquivo corrompido"})
    with pytest.raises(RuntimeError, match="arquivo corrompido"):
        PL.renderizar(_edl(), _Fontes(), tmp_path, workers=3)
