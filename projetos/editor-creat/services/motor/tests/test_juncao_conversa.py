"""Junção de 25/11: a conversa e a mesa ao vivo entraram na mesma linha do Cloudflare/Drive e dos sons reais.
Cada teste prova um ponto em que os dois lados se encontram."""
import json
import time

import pytest

from motor import banco, config, worker
from motor.etapas import montagem


@pytest.fixture()
def con(dados):
    c = banco.conectar(config.carregar().banco)
    yield c
    c.close()


def _projeto(con, pid="p1", estado="entregue"):
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, estado, tipo_video, criado, atualizado, dados) VALUES (?,?,?,?,?,?,?)",
                (pid, "t", estado, None, t, t, json.dumps({})))


@pytest.mark.parametrize("etapa", ["entregas", "espelho"])
def test_job_de_fundo_morto_nao_vira_erro_na_mesa(con, dados, etapa):
    """Entrega/cópia no Cloudflare que morreu não derruba o projeto nem aparece como 'um passo da mesa parou':
    o dono lê só o aviso claro, e o filme continua entregue."""
    _projeto(con)
    jid = banco.enfileirar(con, etapa, "p1", "v1" if etapa == "entregas" else "a001")
    con.execute("UPDATE jobs SET estado='rodando', tentativas=max_tentativas, aluguel_ate=? WHERE id=?", (time.time() - 5, jid))
    assert worker.recolher_mortos(con) == 1
    assert con.execute("SELECT estado FROM jobs WHERE id=?", (jid,)).fetchone()["estado"] == "falhou"
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "entregue"
    evs = banco.eventos_desde(con, "p1")
    assert [e["tipo"] for e in evs] == ["aviso"]
    assert "seguro no editor" in evs[0]["mensagem"]


class _Passo:
    def __init__(self):
        self.numeros, self.achado = {}, None

    def anotar(self, **n):
        self.numeros.update(n)
        return self

    def achou(self, t):
        self.achado = t
        return self


def test_achado_dos_sons_reais_so_tem_numero_da_preparacao():
    p = _Passo()
    montagem._achado_sons(p, {"itens": [{}, {}, {}], "faltaram": [{"id": "S4"}], "bytes": 8_512_000}, 4)
    assert p.achado == "3 de 4 sons reais prontos (8,5 MB baixados); 1 ficou de fora."
    assert p.numeros == {"prontos": 3, "fora": 1, "mb": 8.5}
    p = _Passo()
    montagem._achado_sons(p, {"itens": [{}, {}], "faltaram": [], "bytes": 0}, 2)       # tudo do cache: nada baixado
    assert p.achado == "2 de 2 sons reais prontos."
    p = _Passo()
    montagem._achado_sons(p, {"itens": [], "faltaram": [{}, {}], "bytes": 0}, 2)
    assert p.achado == "0 de 2 sons reais prontos; 2 ficaram de fora."


def test_disco_cheio_diz_que_foi_o_disco_e_nao_o_video(tmp_path, monkeypatch):
    """O dono colou a pasta do Drive duas vezes e só lia "o arquivo a001 não pôde ser lido": o motivo era o disco (26/11)."""
    import collections, shutil
    import pytest
    from motor import importar
    uso = collections.namedtuple("uso", "total used free")
    monkeypatch.setattr(shutil, "disk_usage", lambda p: uso(500 << 20, 104 << 20, 396 << 20))
    with pytest.raises(importar.ErroImportacao) as e:
        importar._checar_disco(tmp_path, 330 << 20)
    msg = str(e.value)
    assert msg.startswith(importar.MSG_SEM_ESPACO) and "0,3 GB" in msg and "0,4 GB livres" in msg and "0,5 GB de folga" in msg
    importar._checar_disco(tmp_path, 0, folga=0)             # com espaço, passa calado


def test_falha_por_disco_cheio_vira_aviso_claro_na_mesa(con, dados):
    from motor import importar, pipeline
    _projeto(con, "p_disco0001", "recebendo")
    con.commit()
    msg = f"{importar.MSG_SEM_ESPACO}: o material tem 0,3 GB e o disco só tem 0,4 GB livres (o editor ainda guarda 0,5 GB de folga para trabalhar)."
    pipeline.falha_definitiva(con, {"id": "j1", "projeto": "p_disco0001", "etapa": "ingest", "alvo": "a001", "erro": msg}, msg)
    avisos = [r["mensagem"] for r in con.execute("SELECT mensagem FROM eventos WHERE projeto='p_disco0001' AND tipo='aviso'")]
    assert avisos and avisos[-1].startswith("Nada foi importado: faltou espaço no disco do editor. O material tem 0,3 GB")
    assert "não pôde ser lido" not in avisos[-1]


def test_saude_mostra_o_espaco_livre_do_disco(dados):
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    d = TestClient(criar()).get("/v1/saude").json()["disco"]
    assert d["total_gb"] > 0 and 0 <= d["livre_gb"] <= d["total_gb"]
