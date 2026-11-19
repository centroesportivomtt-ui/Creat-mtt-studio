"""Abrir o banco ao mesmo tempo (API + workers no boot do contêiner) não pode dar 'database is locked'."""
import multiprocessing as mp

from motor import banco


def _abre(caminho, q):
    try:
        con = banco.conectar(caminho)
        con.execute("SELECT 1 FROM projetos LIMIT 1")
        q.put("ok")
    except Exception as e:  # noqa: BLE001
        q.put(f"erro: {e}")


def test_boot_concorrente_do_banco(tmp_path):
    q = mp.Queue()
    ps = [mp.Process(target=_abre, args=(tmp_path / "motor.db", q)) for _ in range(8)]
    [p.start() for p in ps]
    [p.join(60) for p in ps]
    resultados = [q.get(timeout=5) for _ in ps]
    assert resultados == ["ok"] * 8, resultados
