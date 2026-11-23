"""A memória aprendida no servidor sobrevive às publicações (fila do dono, item B)."""
import json
import pathlib

from motor import config
from motor.memoria.semear import semear


def _git(tmp_path):
    g = tmp_path / "git"
    (g / "modos").mkdir(parents=True)
    (g / "casos" / "caso-git").mkdir(parents=True)
    (g / "casos" / "caso-git" / "caso.json").write_text('{"id": "caso-git"}')
    (g / "modos" / "cinema.json").write_text('{"id": "cinema", "v": 2}')
    (g / "regras.json").write_text(json.dumps({"versao": "1", "regras": [{"id": "r1", "texto": "do git, corrigida"}, {"id": "r2", "texto": "nova no git"}],
                                               "vocabulario": [{"de": "create", "para": "creat"}]}))
    (g / "checagens.json").write_text(json.dumps({"versao": "1", "checagens": [{"id": "c1"}]}))
    (g / "README.md").write_text("leia")
    return g


def test_primeiro_boot_copia_a_memoria_do_git(tmp_path):
    g, v = _git(tmp_path), tmp_path / "dados" / "memoria"
    rel = semear(g, v)
    assert rel["feito"] and rel["regras_do_servidor"] == 0 and rel["copiados"] == 1
    assert [r["id"] for r in json.loads((v / "regras.json").read_text())["regras"]] == ["r1", "r2"]
    assert (v / "casos" / "caso-git" / "caso.json").exists() and (v / "referencias").is_dir() and (v / "modos" / "cinema.json").exists()


def test_o_que_o_dono_ensinou_no_servidor_sobrevive_ao_deploy(tmp_path):
    g, v = _git(tmp_path), tmp_path / "dados" / "memoria"
    semear(g, v)
    # o servidor aprende: reprovação vira regra, vocabulário e checagem; versão aprovada vira caso; estudo de caso por link
    r = json.loads((v / "regras.json").read_text())
    r["regras"] += [{"id": "r_dono_2026-11-20_1", "texto": "nunca cortar a última sílaba"}]
    r["regras"][0]["texto"] = "texto antigo que o git já corrigiu"
    r["vocabulario"] += [{"de": "juan", "para": "Ruan"}]
    (v / "regras.json").write_text(json.dumps(r))
    (v / "checagens.json").write_text(json.dumps({"versao": "1", "checagens": [{"id": "c1"}, {"id": "c_dono_1"}]}))
    (v / "casos" / "p_abc-v2").mkdir()
    (v / "casos" / "p_abc-v2" / "caso.json").write_text('{"id": "p_abc-v2"}')
    (v / "referencias" / "ref1.json").write_text('{"licao": "gancho em 1 s"}')
    (v / "modos" / "cinema.json").write_text('{"id": "cinema", "v": 1}')
    # nova publicação: o git traz regra nova e modo atualizado
    (g / "regras.json").write_text(json.dumps({"versao": "1", "regras": [{"id": "r1", "texto": "do git, corrigida"}, {"id": "r2", "texto": "nova no git"},
                                                                    {"id": "r3", "texto": "chegou neste deploy"}], "vocabulario": [{"de": "create", "para": "creat"}]}))
    rel = semear(g, v)
    regras = json.loads((v / "regras.json").read_text())
    assert [x["id"] for x in regras["regras"]] == ["r1", "r2", "r3", "r_dono_2026-11-20_1"]
    assert regras["regras"][0]["texto"] == "do git, corrigida"                       # o git manda no que ele conhece
    assert {"de": "juan", "para": "Ruan"} in regras["vocabulario"] and len(regras["vocabulario"]) == 2
    assert [c["id"] for c in json.loads((v / "checagens.json").read_text())["checagens"]] == ["c1", "c_dono_1"]
    assert (v / "casos" / "p_abc-v2" / "caso.json").exists() and (v / "referencias" / "ref1.json").exists()
    assert json.loads((v / "modos" / "cinema.json").read_text())["v"] == 2            # modo é do código
    assert rel["regras_do_servidor"] == 1 and rel["vocabulario_do_servidor"] == 1 and rel["checagens_do_servidor"] == 1
    assert rel["casos"] == 2 and rel["referencias"] == 1
    antes = (v / "regras.json").read_text()
    semear(g, v)
    assert (v / "regras.json").read_text() == antes                                  # rodar de novo não muda nada


def test_nao_mexe_quando_a_memoria_e_a_do_repositorio(tmp_path):
    g = _git(tmp_path)
    assert semear(g, g)["feito"] is False and semear(g, g / "sub")["feito"] is False
    assert not (g / ".semeado.json").exists()


def test_com_a_memoria_real_e_a_loja(tmp_path, monkeypatch):
    v = tmp_path / "memoria"
    rel = semear(config.MEMORIA, v)
    assert rel["feito"]
    monkeypatch.setenv("EDITOR_MEMORIA", str(v))
    from motor.memoria.loja import Loja
    loja = Loja()
    assert len(loja.regras()) == len(Loja(config.MEMORIA).regras()) and loja.modo("cinema") and loja.checagens()
    assert not list(pathlib.Path(v).glob("*.tmp"))


def test_iniciar_sh_poe_a_memoria_no_volume():
    sh = (config.RAIZ_REPO / "deploy" / "iniciar.sh").read_text()
    assert 'EDITOR_MEMORIA="${EDITOR_MEMORIA:-$DADOS/memoria}"' in sh and "motor.memoria.semear" in sh
    assert sh.index("motor.memoria.semear") < sh.index("uvicorn motor.api.app")
