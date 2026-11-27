"""Onda 2 da conversa, "Mesa ao vivo" (docs/plano-conversa-25-11.md, seções 7 e 13.9, aceites A2.x do motor).

Sem rede e sem chave: etapas falsas pela fila de verdade, cérebro falso com custo, checagens do QA com mídia sintética.
O que se prova: todo job tem passo raiz início + fim e nada fica aberto (A2.1); diretor e crítico levam modelo e custo, e
sai uma `decisao` (A2.2); a soma dos passos é o livro de gastos, sem "gasto fora de passo" (A2.3); passo de worker morto
vira 'interrompido' no boot (A2.6); o instantâneo diz quem está trabalhando; erro técnico vira frase em pt-BR com o
detalhe recolhido; etapa_inicio tem mensagem; o aviso do arquivo de fora é texto para o dono com o técnico à parte.
"""
import json
import logging
import threading

import pytest

from motor import banco, config, etapas, worker
from motor.cerebro import gastos, orcamento
from motor.etapas import passos

from conversa_util import validar_contra


def _projeto(con, pid="p1", **dados):
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES (?,?,?,?,?)", (pid, "teste", t, t, json.dumps(dados)))


def _passos(con, pid="p1"):
    return [e for e in banco.eventos_desde(con, pid, 0, 5000) if e["tipo"] == "passo"]


def _pipeline_falso(con, monkeypatch, cfg, extras=None):
    _projeto(con, envio_fechado=True, pedido={"texto": "reel"})
    for aid in ("a001", "a002"):
        con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, criado) VALUES (?,?,?,?,?,?)",
                    (aid, "p1", f"C00{aid[-1]}.MP4", aid, 12_400_000, banco.agora_iso()))
        banco.enfileirar(con, "ingest", "p1", aid)
    falsas = {n: (lambda ctx, n=n: {"versao": "v1"} if n == "direcao" else ({"aprovado": True} if n == "qa" else {})) for n in etapas.ORDEM}
    falsas.update(extras or {})
    monkeypatch.setattr(etapas, "_REGISTRO", falsas)
    monkeypatch.setattr(worker, "carregar_todas", lambda: falsas)
    n = 0
    while worker.rodar_um(con, cfg, None, "w") and n < 50:
        n += 1
    return banco.eventos_desde(con, "p1", 0, 5000)


def test_a2_1_todo_job_tem_passo_raiz_inicio_e_fim_e_nada_fica_aberto(dados, monkeypatch):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    evs = _pipeline_falso(con, monkeypatch, cfg)
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "entregue"
    ps = [e for e in evs if e["tipo"] == "passo"]
    raizes = {}
    for e in ps:
        d = e["dados"]
        assert e["estado"] is None and e["mensagem"] is None, e          # D19: a fase vai em dados.fase
        if "pai" not in d:
            raizes.setdefault(d["passo"], []).append(d["fase"])
    jobs = banco.jobs_do_projeto(con, "p1")
    assert len(raizes) == len(jobs) == 9                                  # 2 ingest + 2 análise + catálogo, direção, montagem, qa, entrega
    assert all(f == ["inicio", "fim"] for f in raizes.values()), raizes
    assert passos.abertos(con, "p1") == []
    assert validar_contra("conversa.schema.json", ps) == []
    # o passo raiz da análise leva o número do vídeo e os MB do envio (nunca o nome do arquivo)
    ingest = [e["dados"] for e in ps if e["dados"]["chave"] == "ingest" and e["dados"]["fase"] == "inicio"]
    assert {d["numeros"]["n"] for d in ingest} == {1, 2} and ingest[0]["numeros"]["mb"] == 12.4
    assert not any("C001" in json.dumps(e["dados"]) for e in ps)
    # etapa_inicio agora diz quem começou (a tela antiga mostrava a etapa sem texto)
    ini = [e for e in evs if e["tipo"] == "etapa_inicio"]
    assert ini and all(e["mensagem"] for e in ini)
    assert any(e["mensagem"] == "Trilho começou a receber o vídeo 1." for e in ini)
    assert any(e["mensagem"] == "Lupa começou a conferir a V1." for e in ini)


def test_a2_3_soma_dos_passos_e_o_livro_e_nenhum_gasto_fora_de_passo(dados, monkeypatch, caplog):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)

    def direcao(ctx):
        for chave, custo in (("direcao.diretor", 0.1842), ("direcao.critico", 0.0571)):
            with ctx.passo(chave, ferramenta="cérebro falso") as p:
                gastos.registrar(ctx.cfg, "direcao", orcamento.uso("claude-opus-5-5", entrada=1200, saida=int(custo * 1e6 / 20)), projeto="p1", versao="v1")
                p.anotar(blocos=3)
        with ctx.passo("direcao.resolvedor"):
            pass
        return {"versao": "v1"}

    def analise(ctx):
        with ctx.passo("analise.visao") as p:
            gastos.registrar(ctx.cfg, "visao_leve", orcamento.uso("claude-haiku-5-5", entrada=9000, saida=400), projeto="p1")
            p.anotar(momentos=6, fortes=2)
        return {}

    def qa(ctx):
        gastos.registrar(ctx.cfg, "olho_ia", orcamento.uso("claude-haiku-5-5", entrada=3000, saida=100), projeto="p1")   # no raiz
        return {"aprovado": True}
    caplog.set_level(logging.WARNING, logger="motor.passos")
    evs = _pipeline_falso(con, monkeypatch, cfg, {"direcao": direcao, "analise": analise, "qa": qa})
    livro = [d for d in gastos.ler(cfg) if d.get("projeto") == "p1"]
    assert len(livro) == 5                                                 # o livro tem as mesmas linhas que teria sem a mesa
    fins = [e["dados"] for e in evs if e["tipo"] == "passo" and e["dados"]["fase"] != "inicio"]
    soma = sum(d.get("custo_usd", 0) for d in fins)
    assert abs(soma - sum(d["custo_usd"] for d in livro)) <= 0.001
    raiz_dir = next(d for d in fins if d["chave"] == "direcao")
    assert "custo_usd" not in raiz_dir and abs(raiz_dir["custo_total_usd"] - (0.1842 + 0.0571 + 2 * 0.0048)) < 0.002
    dirigiu = next(d for d in fins if d["chave"] == "direcao.diretor")
    assert dirigiu["modelo"] == "claude-opus-5-5" and dirigiu["tokens"]["entrada"] == 1200 and "÷ 1.000.000" in dirigiu["conta"]
    assert next(d for d in fins if d["chave"] == "qa")["custo_usd"] > 0  # gasto sem filho aberto cai no raiz
    assert "gasto fora de passo" not in caplog.text


def test_gasto_fora_de_job_so_avisa_e_conversa_nao_avisa(dados, caplog):
    cfg = config.carregar()
    caplog.set_level(logging.WARNING, logger="motor.passos")
    assert gastos.registrar(cfg, "conversa", {"custo_usd": 0.01, "modelo": "claude-opus-5-5"}, projeto="p1") is True
    assert "gasto fora de passo" not in caplog.text
    assert gastos.registrar(cfg, "visao_leve", {"custo_usd": 0.01, "modelo": "claude-haiku-5-5"}, projeto="p1") is True
    assert "gasto fora de passo: visao_leve" in caplog.text


class _CerebroComCusto:
    nome = "anthropic"

    def __init__(self, revisar=False):
        self.revisar = revisar

    def dirigir(self, **_):
        from b_sintetico import direcao
        return direcao(), orcamento.uso("claude-opus-5-5", entrada=1200, saida=3100, cache_lido=15000, esforco="high", cerebro="anthropic")

    def criticar(self, *, direcao, **_):
        import copy
        d = copy.deepcopy(direcao)
        if self.revisar:
            d["conceito"] = "teste revisado"
        return d, orcamento.uso("claude-opus-5-5", entrada=400, saida=900, cache_lido=15000, esforco="medium", cerebro="anthropic")


def _job_aberto(con, etapa="direcao", alvo="-"):
    job = {"id": "j1", "projeto": "p1", "etapa": etapa, "alvo": alvo}
    passos.abrir_raiz(con, job, passos.numeros_do_job(con, job))
    return job


def test_a2_2_diretor_e_critico_tem_modelo_e_custo_e_sai_a_decisao(dados):
    from b_sintetico import TRILHAS, analise
    from motor.etapas import catalogo
    from motor.etapas.direcao import dirigir_e_resolver
    from motor.memoria.loja import Loja
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    an = analise()
    cat, txt = catalogo.montar([an], {"texto": "reel"}, "p_t")
    _job_aberto(con)
    try:
        r = dirigir_e_resolver(cerebro=_CerebroComCusto(revisar=True), loja=Loja(), catalogo=cat, catalogo_txt=txt, pedido={"texto": "reel"},
                               analises={an["arquivo"]["id"]: an}, trilhas=TRILHAS, cfg=cfg,
                               ao_usar=lambda u, i: gastos.registrar(cfg, "critico" if u.get("chamada") == "critico" else "direcao", u, projeto="p1"))
        passos.emitir_decisao("v1", r["direcao"], r["critica"])
        passos.fechar_raiz("fim")
    finally:
        passos.soltar()
    ps = _passos(con)
    fim = {e["dados"]["chave"]: e["dados"] for e in ps if e["dados"]["fase"] == "fim"}
    for chave, esforco in (("direcao.diretor", "high"), ("direcao.critico", "medium")):
        d = fim[chave]
        assert d["modelo"] == "claude-opus-5-5" and d["esforco"] == esforco and isinstance(d["custo_usd"], float) and d["custo_usd"] > 0, d
        assert d["ferramenta"].startswith("Claude")
    assert fim["direcao.critico"]["numeros"]["resultado"] == "mudou a direção"
    resolv = [e["dados"] for e in ps if e["dados"]["chave"] == "direcao.resolvedor" and e["dados"]["fase"] == "fim"]
    assert len(resolv) == 2                                               # a direção revisada também foi encaixada
    assert resolv[0]["numeros"]["blocos"] == 3 and resolv[0]["numeros"]["dur"] > 0
    assert "a música explode aos" in resolv[0]["achado"]                  # drop_em = B2 na direção sintética
    assert fim["direcao.diretor"]["achado"] == "Conceito: teste"
    # o diretor e o crítico são filhos do raiz e o custo bate com o livro (registrado logo depois de cada chamada)
    raiz = next(e["dados"] for e in ps if "pai" not in e["dados"] and e["dados"]["fase"] == "fim")
    assert {fim["direcao.diretor"]["pai"], fim["direcao.critico"]["pai"]} == {raiz["passo"]}
    livro = sum(d["custo_usd"] for d in gastos.ler(cfg) if d.get("projeto") == "p1")
    assert abs(raiz["custo_total_usd"] - livro) <= 0.001
    dec = [e for e in banco.eventos_desde(con, "p1", 0, 500) if e["tipo"] == "decisao"]
    assert len(dec) == 1 and dec[0]["alvo"] == "v1" and dec[0]["etapa"] == "direcao"
    dd = dec[0]["dados"]
    assert dd["conceito"] == "teste revisado" and "NÃO É SÓ FILMAR." in dd["gancho"] and dd["critica"] == "aplicada"
    assert [b["id"] for b in dd["blocos"]] == ["B1", "B2", "B3"] and dd["trilha"] == {"clima": "energia", "drop_em": "B2"}
    assert validar_contra("conversa.schema.json", ps + dec) == []


def test_direcao_registra_cada_chamada_com_a_mesma_ref_de_antes():
    """A2.3 (livro igual): a linha de cada chamada continua indo ao livro com a ref uso_<n>.json#<i>, agora logo depois dela."""
    src = (config.RAIZ_REPO / "services/motor/motor/etapas/direcao.py").read_text()
    assert 'ref=f"projetos/{p}/uso_{n}.json#{i}"' in src and "ao_usar=ao_usar" in src
    assert "for i, u in enumerate(r[\"usos\"]):" not in src            # o laço do fim saiu (senão a linha entraria duas vezes)


def test_qa_um_passo_da_lupa_por_checagem_com_resultado_e_achado(tmp_path, dados):
    from test_c_qa import _edl, _video
    from motor.etapas.qa import conferir
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    f = _video(tmp_path, preto_ate=0.5)
    _job_aberto(con, "qa", "v1")
    try:
        rel = conferir(f, _edl(), cfg, so=["formato", "lufs", "quadros_pretos"])
        passos.fechar_raiz("fim")
    finally:
        passos.soltar()
    fins = {e["dados"]["chave"]: e["dados"] for e in _passos(con) if e["dados"]["fase"] == "fim"}
    assert set(fins) == {"qa", "qa.formato", "qa.lufs", "qa.quadros_pretos"}
    assert fins["qa.lufs"]["numeros"] == {"versao": "v1", "nome": "lufs", "resultado": "ok"}
    assert fins["qa.quadros_pretos"]["numeros"]["resultado"] == "reprovou" and fins["qa.quadros_pretos"]["achado"].startswith("reprovou: ")
    assert not fins["qa.lufs"]["achado"].endswith(" s]")                 # o tempo da checagem não vai para o achado
    assert all(d["ferramenta"] == f"motor.etapas.qa.{d['numeros']['nome']}" for k, d in fins.items() if k != "qa")
    assert not rel["aprovado"]
    # fora de job, a mesma conferência não emite nada (o QA puro dos testes continua igual)
    antes = len(_passos(con))
    conferir(f, _edl(), cfg, so=["formato"])
    assert len(_passos(con)) == antes


def test_partes_em_paralelo_tempo_medido_e_thread_de_fora_nao_emite(dados):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    _job_aberto(con, "montagem", "v1")
    try:
        a = passos.inicio("montagem.voz", n=4)
        b = passos.inicio("montagem.planos", n=9)
        de_fora = []
        t = threading.Thread(target=lambda: de_fora.append(passos.inicio("montagem.overlay")))
        t.start(); t.join()
        assert de_fora[0].falso                                           # outra thread: nada emitido (a conexão é do job)
        passos.fim(a, s=3.21)
        passos.fechar_raiz("erro", "A montagem da V1 parou.")             # b não fechou: não pode ficar pulsando
    finally:
        passos.soltar()
    ps = _passos(con)
    d = {(e["dados"]["chave"], e["dados"]["fase"]): e["dados"] for e in ps}
    assert d[("montagem.voz", "fim")]["s"] == 3.21 and d[("montagem.voz", "inicio")]["numeros"] == {"versao": "v1", "n": 4}
    assert ("montagem.planos", "erro") in d and ("montagem.overlay", "inicio") not in d
    assert d[("montagem", "erro")]["achado"] == "A montagem da V1 parou."
    assert passos.abertos(con, "p1") == []


def test_a2_6_worker_morto_no_meio_do_passo_vira_interrompido_no_boot(dados, monkeypatch):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    banco.enfileirar(con, "montagem", "p1", "v1")
    _job_aberto(con, "montagem", "v1")
    passos.inicio("montagem.comp", Q=900)                                 # o processo "morre" aqui: nada fecha
    passos.soltar()
    assert len(passos.abertos(con, "p1")) == 2
    # job ainda 'rodando' com o aluguel em dia (outro worker vivo): não mexe
    con.execute("UPDATE jobs SET estado='rodando' WHERE projeto='p1'")
    assert passos.fechar_abertos(con) == 0
    con.execute("UPDATE jobs SET estado='pendente' WHERE projeto='p1'")
    monkeypatch.setattr(worker, "rodar_um", lambda *a, **k: False)
    assert worker.main(["--ate-ocioso"]) == 0
    con2 = banco.conectar(cfg.banco)
    assert passos.abertos(con2, "p1") == []
    inter = [e["dados"] for e in _passos(con2) if e["dados"]["fase"] == "interrompido"]
    assert {d["chave"] for d in inter} == {"montagem", "montagem.comp"}
    assert validar_contra("conversa.schema.json", _passos(con2)) == []


def test_job_pego_de_novo_fecha_os_passos_da_tentativa_anterior(dados):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    _job_aberto(con, "qa", "v1")
    passos.soltar()
    _job_aberto(con, "qa", "v1")                                          # mesma etapa e alvo: a anterior morreu
    passos.fechar_raiz("fim")
    passos.soltar()
    fases = [e["dados"]["fase"] for e in _passos(con)]
    assert fases == ["inicio", "interrompido", "inicio", "fim"]


def test_instantaneo_traz_quem_esta_trabalhando_agora(dados):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    _job_aberto(con, "direcao")
    p = passos.inicio("direcao.diretor")
    with TestClient(criar()) as c:
        r = c.get("/v1/projetos/p1/eventos?v=2&seguir=false")
    passos.soltar()
    inst = [json.loads(b.split("data: ", 1)[1]) for b in r.text.split("\n\n") if b.startswith("event: instantaneo")]
    assert inst, r.text[:300]
    ab = inst[0]["dados"]["passos_abertos"]
    assert {a["chave"] for a in ab} == {"direcao", "direcao.diretor"} and all(a["desde"] and a["passo"].startswith("ps_") for a in ab)
    assert any(a["passo"] == p.id for a in ab)
    assert validar_contra("evento-efemero.schema.json", inst[0]) == []


def test_erro_tecnico_vira_frase_em_portugues_com_detalhe_recolhido(dados, monkeypatch):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    banco.enfileirar(con, "montagem", "p1", "v1")

    def quebra(ctx):
        raise MemoryError("Unable to allocate 2.1 GiB for an array")
    monkeypatch.setattr(etapas, "_REGISTRO", {"montagem": quebra})
    monkeypatch.setattr(worker, "carregar_todas", lambda: {"montagem": quebra})
    assert worker.rodar_um(con, cfg, None, "w")
    err = [e for e in banco.eventos_desde(con, "p1") if e["tipo"] == "etapa_erro"][-1]
    assert err["mensagem"] == "A montagem da V1 parou (faltou memória na máquina); vou tentar de novo."
    assert err["dados"] == {"detalhe": "MemoryError: Unable to allocate 2.1 GiB for an array", "vai_tentar": True}
    raiz = [e["dados"] for e in _passos(con) if e["dados"]["fase"] == "erro"]
    assert raiz and raiz[0]["achado"] == err["mensagem"]
    # na última tentativa: desiste, o projeto vai para erro com a frase e o detalhe à parte
    con.execute("UPDATE jobs SET tentativas=max_tentativas-1, estado='pendente', aluguel_ate=NULL WHERE projeto='p1'")
    assert worker.rodar_um(con, cfg, None, "w")
    est = [e for e in banco.eventos_desde(con, "p1") if e["tipo"] == "estado"][-1]
    assert est["estado"] == "erro" and est["mensagem"] == "A montagem da V1 parou (faltou memória na máquina) e não vai tentar de novo."
    assert est["dados"]["detalhe"].startswith("MemoryError")
    assert "TypeError" not in json.dumps([e["mensagem"] for e in banco.eventos_desde(con, "p1")])


def test_erro_definitivo_frase_curta_e_motivo_no_detalhe(dados, monkeypatch):
    from motor.etapas import ErroDefinitivo
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con)
    banco.enfileirar(con, "direcao", "p1")

    def quebra(ctx):
        raise ErroDefinitivo("a direção não resolveu: id F09.1 não existe")
    monkeypatch.setattr(etapas, "_REGISTRO", {"direcao": quebra})
    monkeypatch.setattr(worker, "carregar_todas", lambda: {"direcao": quebra})
    worker.rodar_um(con, cfg, None, "w")
    err = [e for e in banco.eventos_desde(con, "p1") if e["tipo"] == "etapa_erro"][-1]
    assert err["mensagem"] == "A direção parou." and err["dados"]["detalhe"] == "a direção não resolveu: id F09.1 não existe"


def test_aviso_do_arquivo_de_fora_fala_com_o_dono_e_guarda_o_tecnico(dados):
    from motor import pipeline
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con, envio_fechado=True)
    for aid in ("a001", "a002"):
        con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES (?,?,?,?,?,?,?)",
                    (aid, "p1", f"C00{aid[-1]}.MP4", aid, 10, "analisado" if aid == "a001" else "ingerido", banco.agora_iso()))
    pipeline.falha_definitiva(con, {"etapa": "analise", "projeto": "p1", "alvo": "a002"}, "Traceback...\nValueError: moov atom not found")
    av = [e for e in banco.eventos_desde(con, "p1") if e["tipo"] == "aviso"][-1]
    assert av["mensagem"] == "O vídeo 2 (C002.MP4) não pôde ser lido e ficou de fora. O resto do material segue."
    assert av["dados"] == {"detalhe": "ValueError: moov atom not found"}


def test_frases_sem_numero_nao_deixam_buraco():
    assert passos.mensagem_inicio("qa") == "Lupa começou a conferir a versão."
    assert passos.mensagem_inicio("analise") == "Radar começou a ouvir e olhar o vídeo."
    assert passos.mensagem_inicio("montagem", versao="v2") == "A montagem da V2 começou: voz, planos, legendas e mix."
    assert passos.frase_erro("ingest", n=3, e="ConnectionError: reset", vai_tentar=True) == \
        "O recebimento do vídeo 3 parou (a conexão com um serviço caiu); vou tentar de novo."
    assert passos.frase_erro("entrega", definitivo=True) == "A entrega parou."


def test_equipe_tem_agente_para_toda_chave_que_o_motor_emite():
    """Toda chave de passo emitida no código tem linha no equipe.json (senão a tela cairia em 'Nimbus · Trabalhando')."""
    import re
    eq = json.loads((config.SCHEMAS / "equipe.json").read_text(encoding="utf-8"))
    chaves = [p["chave"] for p in eq["passos"]]
    raiz = config.RAIZ_REPO / "services/motor/motor"
    achadas = set()
    for arq in raiz.rglob("*.py"):
        achadas |= set(re.findall(r"passos?\.(?:passo|inicio)\(\s*f?\"([a-z_.{}]+)\"", arq.read_text(encoding="utf-8")))
        achadas |= set(re.findall(r"ctx\.passo\(\s*\"([a-z_.]+)\"", arq.read_text(encoding="utf-8")))
    achadas = {a.replace("{nome}", "x") for a in achadas} | set(etapas.ORDEM)
    assert len(achadas) > 12, achadas
    for a in achadas:
        assert any(c == a or (c.endswith("*") and a.startswith(c[:-1])) for c in chaves), a
    for p in eq["passos"]:
        assert p["agente"] in eq["agentes"], p
        assert "{i}" not in (p.get("rodando") or "")                     # rodando só com número que existe no início
    web = json.loads((config.RAIZ_REPO / "apps/web/lib/equipe.json").read_text(encoding="utf-8"))
    assert web == eq                                                       # a cópia do site é igual (o Dockerfile.web só copia apps/web)
