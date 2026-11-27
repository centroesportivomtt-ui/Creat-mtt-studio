"""Onda 3, frente B: apagar projeto (A3.20 a A3.25) e a corrida com a conversa (A3.15). Sem rede (S3 falso no espelho)."""
import hashlib
import json
import os
import pathlib
import threading
import time

import pytest

from conversa_util import app_conversa, con, esperar, esperar_fim, mandar  # noqa: F401
from motor import apagar as AP
from motor import banco, cliente, config
from motor.conversa import falso, laco
from s3_falso import S3Falso

TABELAS = AP.TABELAS + ("projetos",)


def _mexer(pid: str, nome: str, k) -> None:
    t = banco.agora_iso()
    k.execute("INSERT INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES (?,?,?,?,?,?)",
              (pid, nome, "entregue", t, t, json.dumps({"aprovadas": {}})))


def _encher(cfg, pid: str, nome: str = "Feira de Natal") -> list[pathlib.Path]:
    """Uma linha em cada tabela da 7.1 e um arquivo em cada prefixo e pasta local. Devolve os arquivos criados."""
    k = con()
    try:
        cliente.preparar(k)
        _mexer(pid, nome, k)
        t = banco.agora_iso()
        k.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES (?,?,?,?,?,?,?)",
                  ("a001", pid, "video.mov", f"entrada/{pid}/a001.mov", 2_000_000, "analisado", t))
        k.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1',?,'entregue',?)", (pid, t))
        banco.enfileirar(k, "entrega", pid, "v1")
        k.execute("UPDATE jobs SET estado='feito' WHERE projeto=?", (pid,))
        banco.emitir(k, pid, "estado", estado="entregue", mensagem="ok")
        k.execute("INSERT INTO nuvem (chave, projeto, bytes, estado) VALUES (?,?,?,?)", (f"entrada/{pid}/a001.mov", pid, 10, "guardado"))
        k.execute("INSERT INTO conversa_capitulos (projeto, capitulo, modelo, prompt_versao, ferramentas_versao, system_json, tools_json, criado) "
                  "VALUES (?,?,?,?,?,?,?,?)", (pid, 1, "m", "nimbus-2", "2", "[]", "[]", t))
        k.execute("INSERT INTO conversa_msgs (projeto, capitulo, papel, conteudo, turno, criado) VALUES (?,?,?,?,?,?)",
                  (pid, 1, "user", "[]", "t_0000000000", t))
        k.execute("INSERT INTO conversa_espera (projeto, tipo, tool_use_id, turno, cartao, desde) VALUES (?,?,?,?,?,?)",
                  (pid, "pergunta", "toolu_x", "t_0000000000", "{}", t))
        cliente.gerar(k, pid, "v1")
    finally:
        k.close()
    d = pathlib.Path(cfg.dados)
    arqs = []
    for raiz in (d / "armazenamento", d / "cache" / "r2"):
        for pref in ("entrada", "derivados", "projetos", "saidas"):
            arqs.append(raiz / pref / pid / "sub" / "x.bin")
    for nome_tmp in ("montagem", "qa", "entrega"):
        arqs.append(d / "tmp" / nome_tmp / pid / "v1" / "y.bin")
    arqs += [d / "tmp" / f"import_{pid}_a001" / "z.bin", d / "tmp" / f"ingest_{pid}_a001" / "z.bin"]
    for a in arqs:
        a.parent.mkdir(parents=True, exist_ok=True)
        a.write_bytes(os.urandom(64))
    return arqs


def _linhas(pid: str) -> dict:
    k = con()
    try:
        cliente.preparar(k)
        out = {t: k.execute(f"SELECT COUNT(*) n FROM {t} WHERE projeto=?", (pid,)).fetchone()["n"] for t in TABELAS if t != "projetos"}
        out["projetos"] = k.execute("SELECT COUNT(*) n FROM projetos WHERE id=?", (pid,)).fetchone()["n"]
        return out
    finally:
        k.close()


def _hashes(raiz: pathlib.Path, sem_banco: bool = True) -> dict:
    out = {}
    for p in sorted(raiz.rglob("*")):
        if p.is_file() and not p.is_symlink() and not (sem_banco and p.name.startswith("motor.db")):
            out[str(p.relative_to(raiz))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def _ligar_entregas(monkeypatch):
    for n, v in (("R2_ACCOUNT_ID", "x"), ("R2_ACCESS_KEY_ID", "x"), ("R2_SECRET_ACCESS_KEY", "x"), ("R2_ENTREGAS_BUCKET", "creat-entregas"),
                 ("R2_ENTREGAS_PUBLICO", "https://entregas.exemplo")):
        monkeypatch.setenv(n, v)


def _dados_proj(pid, **campos):
    k = con()
    try:
        banco.atualizar_dados(k, pid, lambda d: d.update(campos))
    finally:
        k.close()


# ---------------- A3.20: apagar A não toca B ----------------
def test_apagar_a_nao_toca_b(app_conversa, monkeypatch):
    cfg = config.carregar()
    monkeypatch.setenv("EDITOR_ESPELHO", "1")
    monkeypatch.setenv("R2_MIDIA_BUCKET", "midia")
    for n in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        monkeypatch.setenv(n, "x")
    s3 = S3Falso()
    for p in ("p_aaaa1111", "p_bbbb2222"):
        s3.put_object(Bucket="midia", Key=f"entrada/{p}/a001.mov", Body=b"x")
    s3.put_object(Bucket="midia", Key="entrada/p_aaaa11112/a001.mov", Body=b"x")      # id que começa igual: fica
    monkeypatch.setattr(AP, "_s3_espelho", lambda: s3)
    with app_conversa() as c:
        arqs_a = _encher(cfg, "p_aaaa1111")
        _encher(cfg, "p_bbbb2222", "Outro projeto")
        (cfg.dados / "gastos.jsonl").write_text('{"o_que":"direcao","projeto":"p_aaaa1111","custo_usd":0.4}\n')
        mem = pathlib.Path(os.environ["EDITOR_MEMORIA"])
        antes_b = {k: v for k, v in _hashes(cfg.dados).items() if "p_bbbb2222" in k}
        antes_gastos, antes_mem = (cfg.dados / "gastos.jsonl").read_bytes(), _hashes(mem)
        linhas_b = _linhas("p_bbbb2222")
        assert all(v >= 1 for v in _linhas("p_aaaa1111").values())
        pv = c.get("/v1/projetos/p_aaaa1111/apagar").json()
        assert pv["pode"] is True and pv["nome"] == "Feira de Natal" and pv["fica"] == AP.FICA
        assert pv["vai_apagar"] == {"videos": 1, "bytes": 2_000_000, "versoes": 1, "mensagens_conversa": 1, "links_cliente_ativos": 1}
        r = c.post("/v1/projetos/p_aaaa1111/apagar", json={"nome": "  feira   DE natal "})
        assert r.status_code == 200 and r.json() == {"apagado": True, "arquivos": "apagando"}
        esperar(lambda: not any(a.exists() for a in arqs_a), timeout=15)
        assert all(v == 0 for v in _linhas("p_aaaa1111").values())
        assert not any("p_aaaa1111" in k for k in _hashes(cfg.dados) if not k.startswith("apagar/"))     # só o diário fica
        assert not any(p.name.startswith(("import_p_aaaa1111", "ingest_p_aaaa1111")) for p in (cfg.dados / "tmp").iterdir())
        assert {k: v for k, v in _hashes(cfg.dados).items() if "p_bbbb2222" in k} == antes_b
        assert _linhas("p_bbbb2222") == linhas_b
        assert (cfg.dados / "gastos.jsonl").read_bytes() == antes_gastos and _hashes(mem) == antes_mem
        assert s3.chaves("midia") == ["entrada/p_aaaa11112/a001.mov", "entrada/p_bbbb2222/a001.mov"]
        assert c.get("/v1/projetos/p_aaaa1111/apagar").status_code == 404
        diario = json.loads((cfg.dados / "apagar" / "p_aaaa1111.json").read_text())
        assert diario["fase"] == "apagado" and diario["recusados"] == 0


# ---------------- A3.21: id malicioso e link simbólico ----------------
@pytest.mark.parametrize("pid", ["..", "p_..", "p_%2e%2e", "P_ABCD", "p_abc", "p_" + "a" * 41, "p_abcd%2f..%2f..%2fetc", "p_abcd.1"])
def test_id_malicioso_da_404_e_nao_mexe_em_nada(app_conversa, pid):
    cfg = config.carregar()
    with app_conversa() as c:
        _encher(cfg, "p_aaaa1111")
        antes = _hashes(cfg.dados)
        for metodo, rota, corpo in (("get", f"/v1/projetos/{pid}/apagar", None), ("post", f"/v1/projetos/{pid}/apagar", {"nome": "x"}),
                                    ("post", f"/v1/projetos/{pid}/versoes/v1/retirar", {})):
            r = getattr(c, metodo)(rota, **({"json": corpo} if corpo is not None else {}))
            assert r.status_code == 404, (rota, r.status_code)
        assert _hashes(cfg.dados) == antes and _linhas("p_aaaa1111")["projetos"] == 1
    assert c.post("/v1/projetos/p_abcd/../x/apagar", json={"nome": "x"}).status_code == 404
    assert AP.limpar_arquivos(cfg, "../p_aaaa1111")["recusados"] == 1


def test_link_simbolico_so_some_o_link(app_conversa, tmp_path):
    cfg = config.carregar()
    fora = tmp_path / "fora"
    fora.mkdir()
    (fora / "segredo.txt").write_text("não pode sumir")
    (fora / "outro").mkdir()
    (fora / "outro" / "z.bin").write_text("também fica")
    with app_conversa() as c:
        k = con()
        _mexer("p_aaaa1111", "Alvo", k)
        k.close()
        ent = cfg.dados / "armazenamento" / "entrada" / "p_aaaa1111"
        ent.parent.mkdir(parents=True, exist_ok=True)
        ent.symlink_to(fora, target_is_directory=True)
        mont = cfg.dados / "tmp" / "montagem" / "p_aaaa1111"
        mont.parent.mkdir(parents=True, exist_ok=True)
        mont.symlink_to(fora / "outro", target_is_directory=True)
        der = cfg.dados / "armazenamento" / "derivados" / "p_aaaa1111"
        der.mkdir(parents=True)
        (der / "atalho.bin").symlink_to(fora / "segredo.txt")      # arquivo que é link: só o link some
        (der / "real.bin").write_bytes(b"x")
        r = c.post("/v1/projetos/p_aaaa1111/apagar", json={"nome": "alvo"})
        assert r.status_code == 200
        esperar(lambda: not ent.is_symlink() and not mont.is_symlink() and not der.exists(), timeout=15)
    assert (fora / "segredo.txt").read_text() == "não pode sumir" and (fora / "outro" / "z.bin").read_text() == "também fica"
    d = json.loads((cfg.dados / "apagar" / "p_aaaa1111.json").read_text())
    assert d["recusados"] >= 1


# ---------------- A3.22: recusas com a frase exata ----------------
def test_recusas_com_a_frase_exata(app_conversa, monkeypatch):
    cfg = config.carregar()
    with app_conversa() as c:
        pid = "p_aaaa1111"
        _encher(cfg, pid)
        k = con()
        banco.enfileirar(k, "montagem", pid, "v1")
        k.execute("UPDATE jobs SET estado='rodando' WHERE projeto=? AND etapa='montagem'", (pid,))
        k.close()
        r = c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "Feira de Natal"})
        assert r.status_code == 409 and r.json()["detail"] == "a montagem está rodando agora; espere terminar para apagar"
        assert c.get(f"/v1/projetos/{pid}/apagar").json()["porque"] == r.json()["detail"]
        k = con()
        k.execute("UPDATE jobs SET estado='feito' WHERE projeto=?", (pid,))
        banco.enfileirar(k, "espelho", pid, "a001", prioridade=9)
        k.close()
        r = c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "Feira de Natal"})
        assert r.json()["detail"] == "a cópia do material para o Cloudflare está rodando agora; espere terminar para apagar"
        k = con()
        k.execute("UPDATE jobs SET estado='feito' WHERE projeto=?", (pid,))
        k.close()
        _ligar_entregas(monkeypatch)
        _dados_proj(pid, entregas={"v1": {"estado": "no_ar"}})
        r = c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "Feira de Natal"})
        assert r.status_code == 409 and r.json()["detail"] == \
            "a v1 está na página de entregas; tire de lá primeiro (botão Tirar da página) e apague depois"
        pv = c.get(f"/v1/projetos/{pid}/apagar").json()
        assert pv["pode"] is False and pv["na_pagina"] == [{"versao": "v1", "estado": "no_ar"}]
        _dados_proj(pid, entregas={"v1": {"estado": "retirando", "proxima": "14:30"}})
        r = c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "Feira de Natal"})
        assert r.json()["detail"] == "a v1 está saindo da página de entregas; espere terminar (tento de novo sozinho às 14:30)"
        _dados_proj(pid, entregas={"v1": {"estado": "retirada"}})
        r = c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "Feira do Natal"})
        assert r.status_code == 422 and r.json()["detail"] == "o nome não confere; digite o nome do projeto como aparece no topo"
        assert c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "Feira de Natál"}).status_code == 422     # acento conta
        assert c.post(f"/v1/projetos/{pid}/apagar", json={"nome": ""}).status_code == 422
        assert _linhas(pid)["projetos"] == 1 and not (cfg.dados / "apagar" / f"{pid}.json").exists()   # recusa não deixa diário
        assert c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "FEIRA DE NATAL"}).status_code == 200


def test_entregas_desligadas_com_no_ar_guardado_avisa_e_deixa(app_conversa):
    cfg = config.carregar()
    with app_conversa() as c:
        _encher(cfg, "p_aaaa1111")
        _dados_proj("p_aaaa1111", entregas={"v1": {"estado": "no_ar"}})
        pv = c.get("/v1/projetos/p_aaaa1111/apagar").json()
        assert pv["pode"] is True and pv["na_pagina"] == []
        assert pv["restos_previstos"] == {"pagina_desligada": ["v1"], "copia_material": 1}
        assert c.post("/v1/projetos/p_aaaa1111/apagar", json={"nome": "feira de natal"}).status_code == 200


def test_recusa_com_a_conversa_respondendo(app_conversa):
    falso.instalar([{"blocos": [{"tipo": "texto", "texto": "Entendi: " + "x" * 200, "pedaco": 4}], "atraso": 0.03}])
    with app_conversa() as c:
        pid = c.post("/v1/projetos", json={"nome": "Conversa viva"}).json()["id"]
        assert mandar(c, pid, "oi").status_code == 202            # o turno já foi criado quando a rota respondeu
        r = c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "Conversa viva"})
        assert r.status_code == 409 and r.json()["detail"] == AP.CONVERSA_RODANDO
        assert c.get(f"/v1/projetos/{pid}/apagar").json()["porque"] == AP.CONVERSA_RODANDO
        esperar_fim(pid, timeout=20)
        esperar(lambda: c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "conversa viva"}).status_code == 200, timeout=5)
        assert _linhas(pid)["conversa_msgs"] == 0 and _linhas(pid)["eventos"] == 0


# ---------------- A3.15: mensagem logo depois do apagar ----------------
def test_mensagem_depois_do_apagar_da_404_e_nao_grava(app_conversa):
    falso.instalar([])
    with app_conversa() as c:
        pid = c.post("/v1/projetos", json={"nome": "Some"}).json()["id"]
        assert c.post(f"/v1/projetos/{pid}/apagar", json={"nome": "some"}).status_code == 200
        r = mandar(c, pid, "ainda está aí?")
        assert r.status_code == 404 and r.json()["detail"] == "projeto não encontrado"
        cfg = config.carregar()
        with pytest.raises(laco.ErroConversa) as e:      # a checagem de dentro da transação (rota passou antes do apagar)
            laco._preparar_mensagem(cfg, pid, "t_0123456789", "oi", "oi", "m_abcdef012345")
        assert e.value.status == 404
        assert _linhas(pid)["conversa_msgs"] == 0 and _linhas(pid)["eventos"] == 0 and _linhas(pid)["conversa_capitulos"] == 0


# ---------------- A3.23: corrida com o worker ----------------
def test_corrida_com_o_worker(dados):
    cfg = config.carregar()
    k = banco.conectar(cfg.banco)
    cliente.preparar(k)
    k.close()
    cadeia = ["ingest", "analise", "catalogo", "direcao", "montagem"]
    apagados = recusados = 0
    houve_recusa = False
    for i in range(50):
        pid = f"p_corrida{i:03d}"
        k = banco.conectar(cfg.banco)
        _mexer(pid, "corrida", k)
        banco.enfileirar(k, "ingest", pid, "a001")
        k.close()

        def trabalhador():
            w = banco.conectar(cfg.banco)
            try:
                for _ in range(40):
                    j = banco.pegar(w, "teste", etapas=cadeia)
                    if j is None:
                        if w.execute("SELECT 1 FROM jobs WHERE projeto=? AND estado IN ('pendente','rodando')", (pid,)).fetchone() is None:
                            return
                        continue
                    banco.emitir(w, j["projeto"], "etapa_inicio", etapa=j["etapa"])
                    w.execute("BEGIN IMMEDIATE")
                    banco.concluir(w, j["id"], {})
                    banco.emitir(w, j["projeto"], "etapa_fim", etapa=j["etapa"])
                    prox = cadeia.index(j["etapa"]) + 1
                    if prox < len(cadeia):
                        banco.enfileirar(w, cadeia[prox], j["projeto"], "a001")
                    w.execute("COMMIT")
            finally:
                w.close()

        resultado = {}

        def apagador():
            for _ in range(30):
                try:
                    resultado["r"] = AP.apagar(cfg, pid, "corrida", limpar_agora=False)
                    return
                except AP.Recusa as e:
                    assert e.status == 409, e.frase
                    resultado["recusas"] = resultado.get("recusas", 0) + 1
                    time.sleep(0.001)

        ts = [threading.Thread(target=trabalhador), threading.Thread(target=apagador)]
        for t in ts:
            t.start()
        for t in ts:
            t.join(30)
        houve_recusa = houve_recusa or bool(resultado.get("recusas"))
        if "r" in resultado:
            apagados += 1
            assert all(v == 0 for v in _linhas(pid).values()), (pid, _linhas(pid))
        else:
            recusados += 1
            assert _linhas(pid)["projetos"] == 1
    assert apagados > 0 and houve_recusa


# ---------------- A3.24: diário e varredura ----------------
def test_queda_depois_do_commit_e_a_varredura_limpa(app_conversa):
    cfg = config.carregar()
    with app_conversa():
        arqs = _encher(cfg, "p_aaaa1111")
        _encher(cfg, "p_bbbb2222")
        AP.apagar(cfg, "p_aaaa1111", "Feira de Natal", limpar_agora=False)       # "caiu" antes da limpeza
        assert all(a.exists() for a in arqs) and _linhas("p_aaaa1111")["projetos"] == 0
        k = con()
        try:
            out = AP.varrer(k)
            assert out["limpos"] == 1 and not any(a.exists() for a in arqs)
            assert (cfg.dados / "apagar" / "p_aaaa1111.json").exists()            # fica 7 dias (envio que chega atrasado)
            atrasado = cfg.dados / "armazenamento" / "entrada" / "p_aaaa1111" / "tarde.mov"
            atrasado.parent.mkdir(parents=True)
            atrasado.write_bytes(b"x")
            AP.varrer(k)
            assert not atrasado.exists()
            out = AP.varrer(k, time.time() + 8 * 86400)
            assert out["encerrados"] == 1 and not (cfg.dados / "apagar" / "p_aaaa1111.json").exists()
            # diário de intenção com o projeto VIVO há mais de 10 min: some o diário, nada do projeto é tocado
            antes = {x: v for x, v in _hashes(cfg.dados).items() if "p_bbbb2222" in x}
            (cfg.dados / "apagar" / "p_bbbb2222.json").write_text(json.dumps({"pid": "p_bbbb2222", "fase": "intencao",
                                                                               "criado_ts": time.time() - 11 * 60}))
            assert AP.varrer(k)["intencoes_descartadas"] == 1
            assert not (cfg.dados / "apagar" / "p_bbbb2222.json").exists()
            assert {x: v for x, v in _hashes(cfg.dados).items() if "p_bbbb2222" in x} == antes and _linhas("p_bbbb2222")["projetos"] == 1
            # diário "apagado" com o projeto vivo (inconsistente): nunca toca
            (cfg.dados / "apagar" / "p_bbbb2222.json").write_text(json.dumps({"pid": "p_bbbb2222", "fase": "apagado", "ate_ts": 0}))
            AP.varrer(k)
            assert {x: v for x, v in _hashes(cfg.dados).items() if "p_bbbb2222" in x} == antes
            assert not (cfg.dados / "apagar" / "p_bbbb2222.json").exists() and _linhas("p_bbbb2222")["projetos"] == 1
            # intenção sem projeto (confirmou e caiu antes do passo 5): vira apagado e limpa
            arqs_c = _encher(cfg, "p_cccc3333")
            k.execute("DELETE FROM projetos WHERE id='p_cccc3333'")
            (cfg.dados / "apagar" / "p_cccc3333.json").write_text(json.dumps({"pid": "p_cccc3333", "fase": "intencao", "criado_ts": time.time()}))
            AP.varrer(k)
            assert not any(a.exists() for a in arqs_c) and _linhas("p_cccc3333")["arquivos"] == 0
            assert json.loads((cfg.dados / "apagar" / "p_cccc3333.json").read_text())["fase"] == "apagado"
        finally:
            k.close()


def test_falha_no_banco_nao_apaga_nada(app_conversa, monkeypatch):
    cfg = config.carregar()
    with app_conversa():
        arqs = _encher(cfg, "p_aaaa1111")
        monkeypatch.setattr(AP, "TABELAS", AP.TABELAS + ("tabela_que_nao_existe",))
        with pytest.raises(Exception):
            AP.apagar(cfg, "p_aaaa1111", "Feira de Natal")
        assert all(v >= 1 for v in _linhas("p_aaaa1111").values())
        assert all(a.exists() for a in arqs) and not (cfg.dados / "apagar" / "p_aaaa1111.json").exists()


# ---------------- A3.25: tirar da página ----------------
def test_tirar_da_pagina(app_conversa, monkeypatch):
    cfg = config.carregar()
    with app_conversa() as c:
        pid = "p_aaaa1111"
        _encher(cfg, pid)
        _dados_proj(pid, entregas={"v1": {"estado": "no_ar"}})
        r = c.post(f"/v1/projetos/{pid}/versoes/v1/retirar", json={})
        assert r.status_code == 503 and r.json()["detail"] == "a página de entregas está desligada neste servidor"
        _ligar_entregas(monkeypatch)
        r = c.post(f"/v1/projetos/{pid}/versoes/v1/retirar", json={})
        assert r.status_code == 202 and r.json() == {"estado": "retirando"}
        k = con()
        d = json.loads(k.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()["dados"])
        j = k.execute("SELECT estado, entrada FROM jobs WHERE projeto=? AND etapa='entregas' AND alvo='v1'", (pid,)).fetchone()
        k.close()
        assert d["entregas"]["v1"]["estado"] == "retirando" and d["entregas"]["v1"]["acao"] == "retirar"
        assert j["estado"] == "pendente" and json.loads(j["entrada"]) == {"acao": "retirar"}
        assert c.post(f"/v1/projetos/{pid}/versoes/v1/retirar", json={}).json() == {"estado": "retirando"}     # idempotente
        assert c.post(f"/v1/projetos/{pid}/versoes/v9/retirar", json={}).json()["detail"] == "versão não encontrada"
        assert c.post(f"/v1/projetos/{pid}/versoes/x1/retirar", json={}).status_code == 404
        _dados_proj(pid, entregas={"v1": {"estado": "retirada"}})
        r = c.post(f"/v1/projetos/{pid}/versoes/v1/retirar", json={})
        assert r.status_code == 409 and r.json()["detail"] == "esta versão não está na página de entregas"


# ---------------- revisão da onda 3: o que "para sempre" tem de levar junto ----------------
def test_apagar_leva_caches_e_casos_do_projeto_e_conta_respostas(app_conversa):
    from motor import refazer
    cfg = config.carregar()
    d = pathlib.Path(cfg.dados)
    mem = pathlib.Path(os.environ["EDITOR_MEMORIA"])
    with app_conversa() as c:
        _encher(cfg, "p_aaaa1111")
        _encher(cfg, "p_bbbb2222", "Outro projeto")
        arm = refazer._arm(cfg)
        cache_de = {}
        for pid, x in (("p_aaaa1111", "a"), ("p_bbbb2222", "b")):
            h, sha, fat = x * 40, (x + "1") * 32, (x + "2") * 32
            arm.gravar_json(f"saidas/{pid}/v1/montagem.json", {"planos": {"P1": {"arquivo": f"/outra/maquina/cache/planos/{h}.mp4"},
                                                                         "P2": {"arquivo": "/etc/passwd"}}})
            arm.gravar_bytes(f"saidas/{pid}/v1/qa.sha256", sha.encode())
            arm.gravar_json(f"saidas/{pid}/v1/edl.json", {"qa": {"fatos": {"chave": fat, "chave_saida": "../../motor"}}})
            arqs = [d / "cache" / "planos" / f"{h}{s}" for s in (".mp4", ".antes.jpg", ".depois.jpg", ".cor.json")]
            arqs += [d / "cache" / "olho" / f"{sha}.o3.json", d / "cache" / "fatos" / f"{fat}.json"]
            for a in arqs:
                a.parent.mkdir(parents=True, exist_ok=True)
                a.write_bytes(b"rosto e fala")
            cache_de[pid] = arqs
        outro_cache = d / "cache" / "planos" / ("f" * 40 + ".mp4")
        outro_cache.write_bytes(b"de ninguem")
        for nome in ("p_aaaa1111-v1", "p_aaaa1111-v2", "p_aaaa11112-v1", "p_bbbb2222-v1"):
            (mem / "casos" / nome).mkdir(parents=True, exist_ok=True)
            (mem / "casos" / nome / "caso.json").write_text('{"pedido": "texto do cliente"}')
        k = con()
        k.execute("UPDATE links_cliente SET resposta='ajuste', texto='mais vermelho', respondido=? WHERE projeto='p_aaaa1111'", (banco.agora_iso(),))
        k.close()
        pv = c.get("/v1/projetos/p_aaaa1111/apagar").json()
        assert pv["vai_apagar"]["respostas_cliente_sem_ver"] == 1
        assert pv["fica"] == AP.FICA and not any("casos" in f for f in pv["fica"])
        r = c.post("/v1/projetos/p_aaaa1111/apagar", json={"nome": "Feira de Natal"})
        assert r.status_code == 200
        esperar(lambda: not any(a.exists() for a in cache_de["p_aaaa1111"]), timeout=15)
        # a limpeza de fundo apaga uma pasta de caso por vez: espera as duas (sob carga a v2 sai depois da v1)
        esperar(lambda: not (mem / "casos" / "p_aaaa1111-v1").exists() and not (mem / "casos" / "p_aaaa1111-v2").exists(), timeout=15)
        assert not (mem / "casos" / "p_aaaa1111-v2").exists()
        assert (mem / "casos" / "p_aaaa11112-v1" / "caso.json").exists() and (mem / "casos" / "p_bbbb2222-v1" / "caso.json").exists()
        assert all(a.exists() for a in cache_de["p_bbbb2222"]) and outro_cache.exists()
        assert pathlib.Path("/etc/passwd").exists() and (d / "motor.db").exists()
