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


def test_audio_tenta_de_novo_quando_falta_thread(monkeypatch, tmp_path):
    """27/11: EAGAIN do teto de processos do contêiner não derruba a montagem: a leitura do áudio tenta de novo."""
    import subprocess
    from motor.etapas.montagem import comum

    class R:
        def __init__(self, rc, err=b"", out=b""):
            self.returncode, self.stderr, self.stdout = rc, err, out
    respostas = [R(1, b"Error while filtering: Resource temporarily unavailable"), R(0, out=b"\x00" * 64)]
    chamadas = []
    monkeypatch.setattr(subprocess, "run", lambda cmd, **k: chamadas.append(cmd) or respostas.pop(0))
    monkeypatch.setattr(comum.time, "sleep", lambda s: None)
    x = comum.ler_audio(tmp_path / "a.wav")
    assert len(chamadas) == 2 and len(x) == 16
    assert "-filter_threads" in chamadas[0]


def test_saidas_substituidas_perdem_mix_e_stems_e_guardam_o_filme(tmp_path):
    import json
    import sqlite3
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE projetos (id TEXT, dados TEXT)")
    con.execute("CREATE TABLE versoes (id TEXT, projeto TEXT, estado TEXT)")
    con.execute("INSERT INTO projetos VALUES ('p_a', ?)", (json.dumps({"aprovadas": {"v2": {}}}),))
    for v, e in (("v1", "reprovada_qa"), ("v2", "entregue"), ("v3", "reprovada"), ("v4", "montando")):
        con.execute("INSERT INTO versoes VALUES (?, 'p_a', ?)", (v, e))

    class Arm:
        def __init__(self):
            self.arqs = {f"saidas/p_a/{v}/{n}": 10 for v in ("v1", "v2", "v3", "v4")
                         for n in ("final.mp4", "mix.wav", "stems/voz.flac", "qa.json")}

        def listar(self, prefixo):
            return [k for k in self.arqs if k.startswith(prefixo)]

        def tamanho(self, k):
            return self.arqs[k]

        def apagar(self, k):
            self.arqs.pop(k, None)
    arm = Arm()
    assert M.limpar_saidas_substituidas(con, arm, "p_a", "v4") == 40
    for v in ("v1", "v3"):
        assert f"saidas/p_a/{v}/final.mp4" in arm.arqs and f"saidas/p_a/{v}/qa.json" in arm.arqs
        assert f"saidas/p_a/{v}/mix.wav" not in arm.arqs and f"saidas/p_a/{v}/stems/voz.flac" not in arm.arqs
    for v in ("v2", "v4"):                                   # entregue/aprovada e a que vai montar ficam inteiras
        assert f"saidas/p_a/{v}/mix.wav" in arm.arqs and f"saidas/p_a/{v}/stems/voz.flac" in arm.arqs
