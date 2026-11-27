"""27/11: as pastas de trabalho das versões que não foram entregues (reprovadas) saem quando a versão nova começa a montar;
o cache de planos fica em no máximo 15% do disco."""
import shutil

from motor.etapas import montagem as M


def _pasta(base, *partes, mb=1):
    d = base.joinpath(*partes)
    d.mkdir(parents=True)
    (d / "x.bin").write_bytes(b"0" * (mb * 1000))
    return d


def test_versao_nova_apaga_as_outras_e_guarda_a_dela(tmp_path):
    v1 = _pasta(tmp_path, "tmp", "montagem", "p_a", "v1")
    q1 = _pasta(tmp_path, "tmp", "qa", "p_a", "v1")
    v2 = _pasta(tmp_path, "tmp", "montagem", "p_a", "v2")
    outro = _pasta(tmp_path, "tmp", "montagem", "p_b", "v1")
    assert M.limpar_versoes_antigas(tmp_path, "p_a", "v2") == 2000
    assert not v1.exists() and not q1.exists()
    assert v2.exists() and outro.exists(), "a versão atual e os outros projetos ficam"


def test_sem_pasta_nao_quebra(tmp_path):
    assert M.limpar_versoes_antigas(tmp_path, "p_x", "v1") == 0


def test_teto_do_cache_acompanha_o_disco(tmp_path, monkeypatch):
    class U:
        total = 5_000_000_000
    monkeypatch.setattr(shutil, "disk_usage", lambda _p: U)
    monkeypatch.delenv("EDITOR_CACHE_PLANOS_MB", raising=False)
    assert M.limite_cache_planos_mb(tmp_path) == 750
    U.total = 100_000_000_000
    assert M.limite_cache_planos_mb(tmp_path) == 1200
