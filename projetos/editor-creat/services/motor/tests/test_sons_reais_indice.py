"""M6: índice do banco de sons reais (montagem do sqlite a partir do jsonl.gz, consulta em pt, filtros e ordem estável)."""
import gzip
import hashlib
import json
import pathlib
import sqlite3

import pytest
from b_sons_reais import banco, gravar_jsonl, sem_internet  # noqa: F401 - fixtures

from motor import sons_reais as SR
from motor.sons_reais import indice as IX

KIT = pathlib.Path(__file__).resolve().parents[5] / "kit-edicao-17-11" / "sfx-banco" / "indice.jsonl.gz"


def _ids(rs):
    return [r["id"] for r in rs]


def test_monta_o_sqlite_so_com_principais_e_guarda_o_sha(banco):
    con = IX.abrir(None)
    assert con.execute("SELECT count(*) FROM sons").fetchone()[0] == 42          # 43 linhas, 1 espelho (principal=0) fora
    assert con.execute("SELECT count(*) FROM sons WHERE id=109").fetchone()[0] == 0
    meta = dict(con.execute("SELECT chave, valor FROM meta").fetchall())
    assert meta["fonte_sha256"] == hashlib.sha256(banco["jsonl"].read_bytes()).hexdigest() and meta["fts5"] == "1"
    r = con.execute("SELECT categorias, risco_voz, canais FROM sons WHERE id=105").fetchone()
    assert r["categorias"] == "agua" and r["risco_voz"] == 1 and r["canais"] == ""
    con.close()
    with pytest.raises(sqlite3.OperationalError):                                    # só leitura
        IX.abrir(None).execute("DELETE FROM sons")


def test_refaz_quando_o_jsonl_muda_e_troca_de_uma_vez(banco, monkeypatch):
    p, _ = IX.caminho_banco(None)
    con_antiga = IX.abrir(None)
    linhas = banco["linhas"] + [dict(banco["linhas"][0], id=150, nome="Waterfall creek large")]
    novo = gravar_jsonl(linhas, banco["jsonl"].parent / "novo.jsonl.gz")
    monkeypatch.setattr(IX, "JSONL", novo)
    con = IX.abrir(None)
    assert con.execute("SELECT count(*) FROM sons").fetchone()[0] == 43
    assert dict(con.execute("SELECT chave, valor FROM meta").fetchall())["fonte_sha256"] == hashlib.sha256(novo.read_bytes()).hexdigest()
    assert con_antiga.execute("SELECT count(*) FROM sons").fetchone()[0] == 42        # quem já lia continua no arquivo velho
    assert [x.name for x in p.parent.iterdir() if x.name.endswith(".tmp")] == []     # nada de temporário largado
    mtime = p.stat().st_mtime_ns
    IX.abrir(None)                                                                    # mesmo sha: não refaz
    assert p.stat().st_mtime_ns == mtime


def test_indice_ausente_ou_corrompido_vira_erro_tratavel(banco, monkeypatch, tmp_path):
    monkeypatch.setattr(IX, "JSONL", tmp_path / "nao_existe.jsonl.gz")
    p, _ = IX.caminho_banco(None)
    p.unlink(missing_ok=True)
    with pytest.raises(SR.IndiceIndisponivel):
        IX.abrir(None)
    lixo = tmp_path / "lixo.sqlite"
    lixo.write_bytes(b"isto nao e sqlite" * 100)
    monkeypatch.setenv("EDITOR_SFX_BANCO", str(lixo))
    with pytest.raises(SR.IndiceIndisponivel):
        IX.abrir(None)
    ruim = tmp_path / "ruim.jsonl.gz"
    ruim.write_bytes(gzip.compress(b"{nao e json\n"))
    monkeypatch.delenv("EDITOR_SFX_BANCO")
    monkeypatch.setattr(IX, "JSONL", ruim)
    with pytest.raises(SR.IndiceIndisponivel):
        IX.abrir(None)


def test_busca_em_portugues_filtra_e_desempata_por_id(banco):
    con = IX.abrir(None)
    agua = SR.escolher(con, {"desc": "água de riacho"}, papel="ambiente", necessario_s=12.0)
    # 103 (multidão no nome), 104 (ambisônico), 105 (risco de voz) e 109 (espelho) nunca entram
    assert _ids(agua) == [101, 102]
    assert _ids(SR.escolher(con, {"desc": "água de riacho"}, papel="ambiente", necessario_s=12.0)) == [101, 102]   # estável
    mala = SR.escolher(con, {"desc": "porta-malas abrindo"}, papel="pontual", necessario_s=1.0)
    assert _ids(mala) == [106, 111, 107]                           # 106 e 111 empatam no bm25: desempate pelo id
    assert _ids(SR.escolher(con, {"desc": "porta-malas abrindo"}, papel="pontual", necessario_s=1.0, com_voz={106})) == [111, 107]
    assert _ids(SR.escolher(con, {"desc": "porta-malas abrindo"}, papel="pontual", necessario_s=1.0, excluir={106, 111})) == [107]
    assert _ids(SR.escolher(con, {"desc": "pisada na terra"}, papel="pontual", necessario_s=1.0)) == [108]
    # o "busca" em inglês vem primeiro; sem resultado, a desc em pt completa
    assert _ids(SR.escolher(con, {"desc": "floresta de manhã", "busca": "forest morning birds"}, papel="ambiente", necessario_s=10))[0] == 110
    assert _ids(SR.escolher(con, {"desc": "água de riacho", "busca": "zzzqqq inexistente"}, papel="ambiente", necessario_s=10))[0] == 101
    assert SR.escolher(con, {"desc": "som que não existe no banco"}, papel="pontual", necessario_s=1.0) == []   # vira aviso, nada inventado
    longo = SR.escolher(con, {"desc": "água de riacho"}, papel="ambiente", necessario_s=40.0)
    assert all(r["dur_s"] >= 20 for r in longo)


def test_candidato_trecho_ou_arquivo_inteiro(banco):
    con = IX.abrir(None)
    r101 = IX.info(con, 101)
    c = SR.candidato(r101, "ambiente", 12.0)
    assert c["formato"] == "wav" and c["trecho"] == [10.0, 12.0] and c["md5"] == r101["md5_wav"]   # 25% da duração
    c = SR.candidato(IX.info(con, 106), "pontual", 1.0)
    assert c["formato"] == "flac" and c["trecho"] is None and c["md5"] and c["tam"]
    r107 = IX.info(con, 107)
    c = SR.candidato(r107, "pontual", 1.0)                           # FLAC acima de 6 MB: o WAV inteiro, conferido pelo MD5
    assert c["formato"] == "wav" and c["trecho"] is None and c["md5"] == r107["md5_wav"] and c["tam"] == r107["tam_wav"]
    c = SR.candidato({**r107, "tam_wav": 20_000_000}, "pontual", 1.0)   # WAV grande demais: trecho de até 8 s
    assert c["formato"] == "wav" and c["trecho"] == [0.0, 3.0]
    c = SR.candidato(IX.info(con, 102), "ambiente", 80.0)            # pedido maior que o arquivo: trecho cabe nele (o resto é laço)
    assert c["trecho"][0] >= 0 and c["trecho"][0] + c["trecho"][1] <= 30.0


def test_texto_do_pedido_nunca_vira_sql(banco):
    con = IX.abrir(None)
    for q in ("água'; DROP TABLE sons; --", 'riacho" OR 1=1 --', "porta-malas* NEAR(", "**", "\"\"", ""):
        SR.escolher(con, {"desc": q or "x", "busca": q or None}, papel="ambiente", necessario_s=5)
    assert con.execute("SELECT count(*) FROM sons").fetchone()[0] == 42


def test_copia_do_indice_no_motor_igual_a_do_kit():
    copia = pathlib.Path(IX.__file__).with_name("indice.jsonl.gz")
    assert copia.exists(), "o motor precisa levar a cópia do índice (o build do Railway não vê o kit)"
    if not KIT.exists():
        pytest.skip("kit-edicao-17-11 não está nesta máquina")
    assert hashlib.sha256(copia.read_bytes()).hexdigest() == hashlib.sha256(KIT.read_bytes()).hexdigest(), \
        "índice do motor desatualizado: copie kit-edicao-17-11/sfx-banco/indice.jsonl.gz para motor/sons_reais/"


def test_indice_real_monta_e_acha_porta_malas(dados, sem_internet):  # noqa: F811
    """A cópia real (7.546 sons) monta no cache e responde em pt, sem rede."""
    con = IX.abrir(None)
    assert con.execute("SELECT count(*) FROM sons").fetchone()[0] == 7546
    mala = SR.escolher(con, {"desc": "porta-malas abrindo"}, papel="pontual", necessario_s=1.0)
    assert mala and all("trunk" in r["nome"].lower() or "tailgate" in r["nome"].lower() or "hatch" in r["nome"].lower() for r in mala)
    agua = SR.escolher(con, {"desc": "água de riacho", "busca": "creek water flowing"}, papel="ambiente", necessario_s=12.0)
    assert len(agua) == 3 and all(r["url_wav"].startswith("https://archive.org/") and not SR.proibido(r) for r in agua)
    assert json.dumps(SR.LICENCA, ensure_ascii=False).count("Sonniss") == 1
