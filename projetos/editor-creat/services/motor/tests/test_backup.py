"""Backup diário (fila do dono, item A): o que entra, o que nunca entra, destino, agenda e estado. Sem rede."""
import json
import pathlib
import sqlite3
import zipfile

import pytest

from motor import backup as B
from motor import banco, config

PEDIDO = "https://www.dropbox.com/request/AbCdEfGh1234567890"


def _cenario(dados: pathlib.Path, monkeypatch, tmp_path):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO projetos (id, nome, estado, tipo_video, criado, atualizado, dados) VALUES ('p_abcd', 'Reel do Kal', 'entregue', 'auto', 'x', 'x', '{}')")
    con.commit()
    con.close()
    arm = dados / "armazenamento"
    for nome, txt in (("projetos/p_abcd/pedido.json", '{"texto": "reel"}'), ("projetos/p_abcd/direcao_1.json", "{}"),
                      ("saidas/p_abcd/v1/edl.json", "{}"), ("saidas/p_abcd/v1/qa.json", '{"aprovado": true}'),
                      ("saidas/p_abcd/v1/qa/olho_folha.json", "{}"), ("saidas/p_abcd/v1/outra_coisa.json", "{}"),
                      ("derivados/p_abcd/a1/analise.json", '{"transcricao": {}}'), ("derivados/p_abcd/a1/energia.json", "[1]")):
        f = arm / nome
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(txt)
    (arm / "saidas/p_abcd/v1/final.mp4").write_bytes(b"0" * 4096)
    (arm / "entrada/p_abcd").mkdir(parents=True)
    (arm / "entrada/p_abcd/bruto.mov").write_bytes(b"0" * 8192)
    (arm / "derivados/p_abcd/a1/grande.json").write_text("x")
    (dados / ".segredos").write_text("MOTOR_TOKEN=nao-pode-sair")
    (dados / "backup_config.json").write_text(json.dumps({"pedido": PEDIDO}))
    (dados / "gastos.jsonl").write_text('{"o_que": "olho_ia", "custo_usd": 0.12}\n')
    (dados / "modelos").mkdir()
    (dados / "modelos" / "voz.onnx").write_bytes(b"1" * 100)
    mem = tmp_path / "memoria"
    from motor.memoria.semear import semear
    semear(config.MEMORIA, mem)
    r = json.loads((mem / "regras.json").read_text())
    r["regras"].append({"id": "r_dono_2026-11-20_1", "texto": "nunca cortar a última sílaba", "origem": "dono"})
    (mem / "regras.json").write_text(json.dumps(r))
    (mem / "referencias" / "ref1.json").write_text('{"id": "ref1", "licao": "gancho em 1 s"}')
    monkeypatch.setenv("EDITOR_MEMORIA", str(mem))
    monkeypatch.delenv("EDITOR_BACKUP_PEDIDO", raising=False)
    return cfg


def test_pacote_leva_o_que_nao_se_refaz_e_nunca_segredo_nem_video(tmp_path, dados, monkeypatch):
    cfg = _cenario(dados, monkeypatch, tmp_path)
    pac = B.montar(cfg)
    z = zipfile.ZipFile(pac["zip"])
    nomes = set(z.namelist())
    assert {"motor.db", "MANIFESTO.json", "gastos.jsonl", "memoria/regras.json", "armazenamento/projetos/p_abcd/pedido.json",
            "armazenamento/saidas/p_abcd/v1/edl.json", "armazenamento/saidas/p_abcd/v1/qa.json", "armazenamento/derivados/p_abcd/a1/analise.json"} <= nomes
    assert not any(n.endswith((".mp4", ".mov", ".onnx")) or "segredos" in n or "backup_config" in n for n in nomes)
    assert "armazenamento/saidas/p_abcd/v1/outra_coisa.json" not in nomes and not any("/qa/" in n for n in nomes)
    assert "armazenamento/derivados/p_abcd/a1/energia.json" not in nomes
    conteudo = b"".join(z.read(n) for n in nomes)
    assert b"nao-pode-sair" not in conteudo and PEDIDO.encode() not in conteudo
    # o banco copiado abre e tem o projeto
    z.extract("motor.db", tmp_path / "x")
    con = sqlite3.connect(tmp_path / "x" / "motor.db")
    assert con.execute("SELECT nome FROM projetos").fetchone()[0] == "Reel do Kal"
    con.close()
    man = json.loads(z.read("MANIFESTO.json"))
    assert man["midia_fora_do_backup"] == {"arquivos": 2, "bytes": 4096 + 8192} and len(man["arquivos"]) == pac["arquivos"]
    assert pathlib.Path(pac["zip"]).name.isascii() and pathlib.Path(pac["memoria"]).name.isascii()
    # a memória vai também em texto, com o que o servidor aprendeu
    m = json.loads(pathlib.Path(pac["memoria"]).read_text())
    assert any(r["id"] == "r_dono_2026-11-20_1" for r in m["regras"]) and m["referencias"] == [{"id": "ref1", "licao": "gancho em 1 s"}] and m["casos"]


def test_arquivo_grande_fica_de_fora_e_vai_para_o_manifesto(tmp_path, dados, monkeypatch):
    cfg = _cenario(dados, monkeypatch, tmp_path)
    monkeypatch.setattr(B, "MAX_ARQUIVO", 10)
    pac = B.montar(cfg)
    man = json.loads(zipfile.ZipFile(pac["zip"]).read("MANIFESTO.json"))
    assert pac["fora"] >= 1 and any(f["motivo"] == "maior que 5 MB" for f in man["fora"])


def test_destino_vem_da_variavel_ou_da_tela_e_endereco_errado_e_recusado(tmp_path, dados, monkeypatch):
    cfg = config.carregar()
    monkeypatch.delenv("EDITOR_BACKUP_PEDIDO", raising=False)
    assert B.pedido(cfg) == "" and B.estado(cfg) == {"destino": "falta configurar", "estado": "nunca rodou"}
    for ruim in ("", "https://exemplo.com/request/abcdefgh", "https://www.dropbox.com/request/../x", "http://www.dropbox.com/request/AbCdEfGh1234"):
        with pytest.raises(ValueError):
            B.configurar(cfg, ruim)
    B.configurar(cfg, PEDIDO)
    arq = dados / "backup_config.json"
    assert B.pedido(cfg) == PEDIDO and oct(arq.stat().st_mode & 0o777) == "0o600"
    assert PEDIDO not in json.dumps(B.estado(cfg)) and B.estado(cfg)["destino"] == "configurado"
    monkeypatch.setenv("EDITOR_BACKUP_PEDIDO", "https://www.dropbox.com/request/ZZZZZZZZ9999")
    assert B.pedido(cfg).endswith("ZZZZZZZZ9999")


def test_rodar_envia_os_dois_arquivos_e_guarda_o_estado(tmp_path, dados, monkeypatch):
    cfg = _cenario(dados, monkeypatch, tmp_path)
    visto = {}

    def envia(cfg_, arquivos, url):
        visto.update(arquivos=arquivos, url=url)
        return True, "ok     2 arquivo(s)"
    e = B.rodar(cfg, enviar_fn=envia)
    assert e["estado"] == "ok" and e["destino"] == "configurado" and e["arquivos"] > 5 and e["horas_desde_o_ultimo"] == 0.0
    assert visto["url"] == PEDIDO and [pathlib.Path(a).suffix for a in visto["arquivos"]] == [".zip", ".json"]
    assert not B.precisa_rodar(cfg)                                      # já fez hoje
    assert B.precisa_rodar(cfg, agora=__import__("time").time() + 25 * 3600)
    # falha não apaga a data do último bom e tenta de novo em 1 hora
    e2 = B.rodar(cfg, enviar_fn=lambda *a: (False, "erro   página não confirmou"))
    assert e2["estado"] == "falha" and "não confirmou" in e2["erro"] and e2["ultimo_ok"] == e["ultimo_ok"]
    import time
    est = json.loads((dados / "backup_estado.json").read_text())
    est["ultimo_ok_ts"] = time.time() - 30 * 3600
    (dados / "backup_estado.json").write_text(json.dumps(est))
    assert not B.precisa_rodar(cfg) and B.precisa_rodar(cfg, agora=time.time() + 3700)


def test_sem_destino_monta_local_e_avisa_e_nao_agenda(tmp_path, dados, monkeypatch):
    cfg = _cenario(dados, monkeypatch, tmp_path)
    (dados / "backup_config.json").unlink()
    chamou = []
    e = B.rodar(cfg, enviar_fn=lambda *a: chamou.append(1) or (True, ""))
    assert e["estado"] == "sem destino" and "falta o endereço" in e["erro"] and chamou == [] and list((dados / "backups").glob("*.zip"))
    assert not B.precisa_rodar(cfg)
    monkeypatch.setenv("EDITOR_BACKUP", "0")
    assert B.agendar(cfg) is None


def test_guarda_so_os_tres_ultimos_pacotes_locais(tmp_path, dados, monkeypatch):
    cfg = _cenario(dados, monkeypatch, tmp_path)
    pasta = dados / "backups"
    pasta.mkdir()
    for d in ("20260101-0000", "20260102-0000", "20260103-0000", "20260104-0000"):
        (pasta / f"editor-backup-{d}.zip").write_bytes(b"z")
        (pasta / f"editor-memoria-{d}.json").write_text("{}")
    B.montar(cfg)
    assert len(list(pasta.glob("editor-backup-*.zip"))) == 3 and len(list(pasta.glob("editor-memoria-*.json"))) == 3
    assert not (pasta / "editor-backup-20260101-0000.zip").exists() and not list(pasta.glob("*.tmp")) and not list(pasta.glob(".motor-*"))


def test_envio_nunca_mostra_o_endereco_e_trata_falta_do_node(tmp_path, dados, monkeypatch):
    import subprocess
    cfg = config.carregar()

    class R:
        returncode, stdout, stderr = 1, "", f"erro   falhou em {PEDIDO}"
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: R())
    ok, msg = B.enviar(cfg, ["/x.zip"], PEDIDO)
    assert not ok and PEDIDO not in msg and "<pedido>" in msg

    def sem_node(*a, **k):
        raise FileNotFoundError("node")
    monkeypatch.setattr(subprocess, "run", sem_node)
    assert B.enviar(cfg, ["/x.zip"], PEDIDO) == (False, "não rodou o envio: FileNotFoundError")
    assert (config.KIT / "ferramentas" / "dropbox-enviar.cjs").exists()


def test_rotas_do_backup_e_resumo_na_saude(tmp_path, dados, monkeypatch):
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    monkeypatch.delenv("EDITOR_BACKUP_PEDIDO", raising=False)
    monkeypatch.delenv("EDITOR_BACKUP_AGENDAR", raising=False)
    monkeypatch.setattr(B, "rodar", lambda cfg, **k: None)
    cli = TestClient(criar())
    assert cli.get("/v1/backup").json() == {"destino": "falta configurar", "estado": "nunca rodou"}
    assert cli.post("/v1/backup/config", json={"pedido": "https://exemplo.com/qualquer-coisa-comprida"}).status_code == 422
    r = cli.post("/v1/backup/config", json={"pedido": PEDIDO})
    assert r.status_code == 200 and r.json()["destino"] == "configurado" and PEDIDO not in r.text
    assert cli.post("/v1/backup/rodar").status_code == 202
    s = cli.get("/v1/saude").json()
    assert s["backup"] == {"destino": "configurado", "estado": "nunca rodou"} and PEDIDO not in json.dumps(s)


# ---------------------------------------------------------------- ajustes da auditoria (Muralha, 19/11)
def test_link_de_download_nao_sai_no_backup(tmp_path, dados, monkeypatch):
    cfg = _cenario(dados, monkeypatch, tmp_path)
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO versoes (projeto, id, estado, video, link, criado) VALUES ('p_abcd', 'v1', 'entregue', 'saidas/p_abcd/v1/final.mp4', 'https://r2.exemplo/final.mp4?X-Amz-Signature=SEGREDO', 'x')")
    con.commit()
    con.close()
    (dados / "armazenamento/saidas/p_abcd/v1/entrega.json").write_text(json.dumps(
        {"link": "https://r2.exemplo/final.mp4?X-Amz-Signature=SEGREDO", "capa": "https://r2.exemplo/capa.jpg?sig=SEGREDO", "legenda_post": "vem comigo", "sha256": "abc"}))
    pac = B.montar(cfg)
    z = zipfile.ZipFile(pac["zip"])
    assert json.loads(z.read("armazenamento/saidas/p_abcd/v1/entrega.json")) == {"legenda_post": "vem comigo", "sha256": "abc"}
    assert all(b"SEGREDO" not in z.read(n) for n in z.namelist())
    z.extract("motor.db", tmp_path / "y")
    c2 = sqlite3.connect(tmp_path / "y" / "motor.db")
    assert c2.execute("SELECT link, video FROM versoes").fetchone() == (None, "saidas/p_abcd/v1/final.mp4")
    c2.close()
    orig = banco.conectar(cfg.banco)
    assert "SEGREDO" in orig.execute("SELECT link FROM versoes").fetchone()[0]          # o banco em uso não é tocado
    orig.close()


def test_navegador_do_envio_nao_herda_segredos_e_o_endereco_nunca_sai(tmp_path, dados, monkeypatch):
    import subprocess
    cfg = config.carregar()
    monkeypatch.setenv("EDITOR_ANTHROPIC_KEY", "sk-nao-pode-ir")
    monkeypatch.setenv("MOTOR_TOKEN", "token-nao-pode-ir")
    visto = {}

    class R:
        returncode = 1
        stdout = "ok     nada\n"
        stderr = f'erro   page.goto: Timeout navigating to "{PEDIDO[:-6]}'            # endereço cortado no meio

    def roda(cmd, **k):
        visto.update(env=k["env"], cmd=cmd)
        return R()
    monkeypatch.setattr(subprocess, "run", roda)
    ok, msg = B.enviar(cfg, ["/x.zip"], PEDIDO)
    assert not ok and "AbCdEf" not in msg and "<pedido>" in msg
    assert "EDITOR_ANTHROPIC_KEY" not in visto["env"] and "MOTOR_TOKEN" not in visto["env"] and "PATH" in visto["env"]
    assert visto["env"]["DROPBOX_REMETENTE_EMAIL"]
    js = (config.KIT / "ferramentas" / "dropbox-enviar.cjs").read_text()
    assert "rota.abort()" in js and "dropboxstatic" in js and "semEndereco" in js and "total / 40)" in js


def test_pedido_manual_tem_intervalo_e_sobra_de_montagem_e_limpa(tmp_path, dados, monkeypatch):
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    cfg = _cenario(dados, monkeypatch, tmp_path)
    (dados / "backups").mkdir()
    (dados / "backups" / "editor-backup-20200101-0000.zip.tmp").write_bytes(b"resto")
    B.rodar(cfg, enviar_fn=lambda *a: (True, "ok"))
    assert not list((dados / "backups").glob("*.tmp")) and B.espera_manual(cfg) > 500
    cli = TestClient(criar())
    r = cli.post("/v1/backup/rodar")
    assert r.status_code == 429 and "min" in r.json()["detail"]
    monkeypatch.setenv("EDITOR_BACKUP_PEDIDO", PEDIDO)
    assert B.estado(cfg)["destino_fixo"] is True


def test_teto_total_do_pacote(tmp_path, dados, monkeypatch):
    cfg = _cenario(dados, monkeypatch, tmp_path)
    monkeypatch.setattr(B, "MAX_TOTAL", 3000)
    pac = B.montar(cfg)
    man = json.loads(zipfile.ZipFile(pac["zip"]).read("MANIFESTO.json"))
    assert any("teto" in f["motivo"] for f in man["fora"]) and "motor.db" in {a["nome"] for a in man["arquivos"]}


def test_mensagem_de_falha_mostra_o_erro_e_nao_a_versao_do_node():
    """20/11 em produção: a tela dizia só "o Dropbox não confirmou o envio: Node.js v24.20.0" (última linha do travamento)."""
    from motor.backup import _sem_endereco
    saida = ("/app/x.cjs:40\n  browser = await chromium.launch()\nbrowserType.launch: Executable doesn't exist at /ms-playwright/chromium\n"
             "    at /app/x.cjs:40:3\n\nNode.js v24.20.0\n")
    assert _sem_endereco(saida, "https://www.dropbox.com/request/AbCdEfGh12") .startswith("browserType.launch: Executable doesn't exist")
    assert _sem_endereco("ok     2 arquivo(s)\nNode.js v24.20.0", "x") == "ok     2 arquivo(s)"


def test_ambiente_do_navegador_sem_segredos(monkeypatch):
    from motor import backup
    for k in ("EDITOR_SENHA_HASH", "EDITOR_SEGREDO_SESSAO", "EDITOR_BACKUP_PEDIDO", "R2_SECRET_ACCESS_KEY", "EDITOR_ANTHROPIC_KEY"):
        monkeypatch.setenv(k, "nao-pode-ir")
    monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", "/ms-playwright")
    monkeypatch.setenv("XDG_CONFIG_HOME", "/tmp/x")
    visto = {}
    monkeypatch.setattr(backup.subprocess, "run", lambda cmd, **k: visto.update(env=k["env"]) or type("R", (), {"returncode": 0, "stdout": "ok", "stderr": ""})())

    class Cfg:
        dados = "/tmp"
    backup.enviar(Cfg(), ["/tmp/a.zip"], "https://www.dropbox.com/request/AbCdEfGh12")
    env = visto["env"]
    assert env["PLAYWRIGHT_BROWSERS_PATH"] == "/ms-playwright" and env["XDG_CONFIG_HOME"] == "/tmp/x"   # o resto da máquina passa
    assert "nao-pode-ir" not in env.values()                                   # segredo nenhum


def test_tenta_de_novo_quando_sobe_versao_nova(dados, monkeypatch):
    import json
    import pathlib
    from motor import backup, config
    cfg = config.carregar()
    monkeypatch.setenv("EDITOR_BACKUP_PEDIDO", "https://www.dropbox.com/request/ZZZZZZZZ9999")
    arq = pathlib.Path(cfg.dados) / "backup_estado.json"
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(json.dumps({"estado": "falha", "commit": "aaaaaaa", "destinos": ["dropbox"]}))
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "bbbbbbbcccc")
    assert backup.tentar_no_boot(cfg)                                          # versão nova: tenta já
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "aaaaaaa999")
    assert not backup.tentar_no_boot(cfg)                                      # a mesma versão que falhou: espera a hora
    arq.write_text(json.dumps({"estado": "ok", "commit": "aaaaaaa"}))
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "bbbbbbb")
    assert not backup.tentar_no_boot(cfg)


class _S3Falso:
    """Cliente S3/R2 falso: guarda em memória, como o boto3 (upload_file, head_object, paginador, delete_object)."""
    def __init__(self):
        self.obj = {}

    def upload_file(self, origem, bucket, chave):
        self.obj[(bucket, chave)] = pathlib.Path(origem).read_bytes()

    def head_object(self, Bucket, Key):
        return {"ContentLength": len(self.obj[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.obj.pop((Bucket, Key), None)

    def get_paginator(self, _nome):
        s3 = self

        class P:
            def paginate(self, Bucket, Prefix):
                return [{"Contents": [{"Key": k} for (b, k) in sorted(s3.obj) if b == Bucket and k.startswith(Prefix)]}]
        return P()


def _r2_env(monkeypatch):
    for n, v in (("R2_ACCOUNT_ID", "conta"), ("R2_ACCESS_KEY_ID", "id"), ("R2_SECRET_ACCESS_KEY", "segredo"), ("R2_BUCKET", "balde")):
        monkeypatch.setenv(n, v)


def test_r2_e_o_destino_principal_e_o_dropbox_vira_segunda_copia(tmp_path, dados, monkeypatch):
    from motor import backup, config
    cfg = config.carregar()
    monkeypatch.delenv("EDITOR_BACKUP_PEDIDO", raising=False)
    assert not backup.r2_configurado() and not backup.precisa_rodar(cfg)
    _r2_env(monkeypatch)
    assert backup.r2_configurado() and backup.precisa_rodar(cfg)          # só com o R2, o backup já agenda
    s3 = _S3Falso()
    e = backup.rodar(cfg, enviar_r2_fn=lambda arqs: backup.enviar_r2(arqs, cliente=s3))
    assert e["estado"] == "ok" and e["copias"] == ["R2"] and e["r2"] is True
    chaves = [k for (_, k) in s3.obj]
    assert len(chaves) == 2 and all(k.startswith("backup-editor/") for k in chaves)
    assert any(k.endswith(".zip") for k in chaves) and any("editor-memoria-" in k for k in chaves)
    # Dropbox configurado mas falhando: o R2 garante a cópia; a falha do Dropbox fica escrita
    monkeypatch.setenv("EDITOR_BACKUP_PEDIDO", "https://www.dropbox.com/request/abcdefghij")
    e = backup.rodar(cfg, enviar_fn=lambda c, a, u: (False, "pagina fechada"), enviar_r2_fn=lambda arqs: backup.enviar_r2(arqs, cliente=s3))
    assert e["estado"] == "ok" and e["copias"] == ["R2"] and "Dropbox" in e["erro"]
    # os dois falham: falha, com os dois motivos
    e = backup.rodar(cfg, enviar_fn=lambda c, a, u: (False, "x"), enviar_r2_fn=lambda arqs: (False, "sem rede"))
    assert e["estado"] == "falha" and "R2: sem rede" in e["erro"] and "Dropbox" in e["erro"]


def test_r2_guarda_so_30_dias_e_confere_tamanho(tmp_path, monkeypatch):
    from motor import backup
    _r2_env(monkeypatch)
    s3 = _S3Falso()
    for d in range(1, 36):
        s3.obj[("balde", f"backup-editor/2026-10-{d:02d}/a.zip")] = b"x"
    s3.obj[("balde", "outra-coisa/video.mp4")] = b"v"                       # fora do prefixo: nunca é apagado
    a = tmp_path / "editor-backup-1.zip"
    a.write_bytes(b"12345")
    ok, msg = backup.enviar_r2([a], cliente=s3)
    dias = {k.split("/")[1] for (_, k) in s3.obj if k.startswith("backup-editor/")}
    assert ok and len(dias) == 30 and ("balde", "outra-coisa/video.mp4") in s3.obj
    assert "2026-10-01" not in dias and "segredo" not in msg

    class Curto(_S3Falso):
        def head_object(self, Bucket, Key):
            return {"ContentLength": 1}
    ok, msg = backup.enviar_r2([a], cliente=Curto())
    assert not ok and "esperado 5" in msg


def test_destino_novo_tenta_no_boot_sem_esperar(tmp_path, dados, monkeypatch):
    from motor import backup, config
    cfg = config.carregar()
    monkeypatch.setenv("EDITOR_BACKUP_PEDIDO", "https://www.dropbox.com/request/abcdefghij")
    backup.rodar(cfg, enviar_fn=lambda c, a, u: (False, "pagina fechada"))
    assert not backup.tentar_no_boot(cfg)                          # mesma versão, mesmo destino: espera o intervalo
    _r2_env(monkeypatch)
    assert backup.tentar_no_boot(cfg)                              # o R2 entrou na hospedagem: tenta já no boot
