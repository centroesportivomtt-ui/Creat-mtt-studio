"""Teste de aceitação da FRENTE B (ARQUITETURA.md §11): catálogo, direção (fixture), resolvedor, orçamento e memória.

uso:  cd services/motor && nice -n 5 python -m motor.ferramentas.aceite_b [--dados DIR] [--manter]
Roda tudo pelo caminho real: projeto no banco -> POST /pedido (API) -> worker (catalogo, direcao) -> POST /reprovar -> worker.
A memória usada é uma CÓPIA de memoria/ (EDITOR_MEMORIA), para a reprovação de teste não mexer no git.
Sem o material de 17/11 no scratchpad, cai no exemplo sintético (packages/schemas/exemplos) e diz o que pulou.
Sai com código 0 só se todas as checagens passarem.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import sys
import tempfile
import time

SCRATCH = pathlib.Path("/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad")
DRAKO = SCRATCH / "drako"
PEDIDO = {"texto": "Reel de bastidor da creat.MTT na cobertura do evento: a fala do Marcos é a base, Ruan e Xande aparecem, "
                   "termina chamando para seguir @creat.mtt", "tipo_video": "bastidor", "duracao_alvo": 115, "obrigatorio": ["@creat.mtt"]}
MOTIVO = "Na legenda do gancho não é 'pessoal', é 'galera'; e o fecho tem que mostrar @creat.mtt"

resultados: list[tuple[str, bool, str]] = []


def ok(nome: str, cond: bool, detalhe: str = "") -> bool:
    resultados.append((nome, bool(cond), detalhe))
    print(("  OK    " if cond else "  FALHA ") + nome + (f"  ({detalhe})" if detalhe else ""), flush=True)
    return bool(cond)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dados", default=str(SCRATCH / "aceite-b"))
    ap.add_argument("--manter", action="store_true", help="não apaga a pasta de dados antes")
    a = ap.parse_args(argv)
    dados = pathlib.Path(a.dados)
    if dados.exists() and not a.manter:
        shutil.rmtree(dados)
    dados.mkdir(parents=True, exist_ok=True)
    repo = pathlib.Path(__file__).resolve().parents[4]
    mem = dados / "memoria"
    if not mem.exists():
        shutil.copytree(repo / "memoria", mem)
    os.environ.update({"EDITOR_DADOS": str(dados), "EDITOR_MEMORIA": str(mem), "EDITOR_CEREBRO": "fixture"})
    os.environ.pop("MOTOR_TOKEN", None)

    from motor import banco, config, worker
    from motor.cerebro import orcamento
    from motor.etapas import armazem_b, carregar_todas
    from motor.etapas.catalogo import norm
    from motor.etapas.direcao import montar_prompt
    from motor.etapas.resolvedor import palavras_do_arquivo
    from motor.memoria.loja import Loja
    import validar

    cfg = config.carregar()
    tempos = {}
    real = (DRAKO / "cat.json").exists() and (DRAKO / "trs").exists()
    print(f"== frente B · dados {dados} · material de 17/11: {'sim' if real else 'NÃO (exemplo sintético)'}")
    pid = "p_drako17" if real else "p_demo"

    # 1. análises
    t = time.time()
    if real:
        from motor.ferramentas import cat_legado
        analises = cat_legado.converter(DRAKO, dados, pid)
    else:
        ex = json.loads((config.SCHEMAS / "exemplos" / "analise.json").read_text(encoding="utf-8"))
        ex["arquivo"]["projeto"] = pid
        pasta = dados / "armazenamento" / "derivados" / pid / ex["arquivo"]["id"]
        pasta.mkdir(parents=True, exist_ok=True)
        (pasta / "analise.json").write_text(json.dumps(ex, ensure_ascii=False), encoding="utf-8")
        analises = [ex]
    tempos["analises_legado_s"] = round(time.time() - t, 2)
    ok("análises válidas (analise.schema.json)", all(not validar.erros("analise", x) for x in analises), f"{len(analises)} arquivos")

    # 2. projeto no banco + pedido pela API
    con = banco.conectar(cfg.banco)
    agora = banco.agora_iso()
    con.execute("INSERT OR REPLACE INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES (?,?,?,?,?,?)",
                (pid, "Bastidor creat 17/11", "lendo", agora, agora, json.dumps({"envio_fechado": True})))
    for x in analises:
        con.execute("INSERT OR REPLACE INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES (?,?,?,?,?,?,?)",
                    (x["arquivo"]["id"], pid, x["arquivo"]["nome"], x["arquivo"]["chave"], x["arquivo"]["bytes"], "analisado", agora))
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    cli = TestClient(criar())
    r = cli.post(f"/v1/projetos/{pid}/pedido", json={"texto": "", "tipo_video": "bastidor"})
    ok("API recusa pedido vazio (422)", r.status_code == 422, str(r.status_code))
    r = cli.post("/v1/projetos/nao_existe/pedido", json={"texto": "oi"})
    ok("API: projeto inexistente (404)", r.status_code == 404, str(r.status_code))
    corpo = PEDIDO if real else {"texto": "Reel do evento de hoje mostrando a equipe trabalhando", "duracao_alvo": 10, "obrigatorio": ["@creat.mtt"]}
    r = cli.post(f"/v1/projetos/{pid}/pedido", json=corpo)
    ok("API grava o pedido e dispara a direção (201)", r.status_code == 201 and r.json().get("dirigindo"), f"{r.status_code} {str(r.json())[:120]}")

    # 3. worker: catalogo + direcao (montagem é da frente C e fica na fila)
    carregar_todas()
    arm_p = __import__("motor.provedores", fromlist=["armazenamento_de"]).armazenamento_de(cfg)
    etapas_b = ["catalogo", "direcao"]
    t = time.time()
    while worker.rodar_um(con, cfg, arm_p, "aceite-b", etapas_b):
        pass
    tempos["catalogo_mais_direcao_s"] = round(time.time() - t, 2)
    jobs = {j["etapa"]: j for j in banco.jobs_do_projeto(con, pid)}
    ok("jobs catalogo e direcao concluídos", all(jobs.get(e, {}).get("estado") == "feito" for e in etapas_b),
       "; ".join(f"{e}={jobs.get(e, {}).get('estado')} {(jobs.get(e, {}).get('erro') or '')[-200:]}" for e in etapas_b))
    arm = armazem_b.Armazem(dados=dados, provedor=arm_p)
    cat = arm.ler_json(f"projetos/{pid}/catalogo.json")
    txt = arm.caminho(f"projetos/{pid}/catalogo.txt").read_text(encoding="utf-8")
    tok_cat = orcamento.estimar_tokens(txt)
    ok("catálogo válido (catalogo.schema.json)", not validar.erros("catalogo", cat))
    ok("catálogo <= 15 000 tokens estimados", tok_cat <= 15000, f"{tok_cat} tokens, {len(cat['clipes'])} clipes, cortes: {len(cat['orcamento']['cortes'])}")
    marcos = [f for c in cat["clipes"] for f in c["falas"] if f["falante"] == "MARCOS"]
    inteiras = [f for f in marcos if not f["truncado"] and f"«{f['texto']}»" in txt]
    ok("todas as falas do MARCOS inteiras no texto", len(inteiras) == len(marcos) and (len(marcos) > 0 or not real), f"{len(inteiras)}/{len(marcos)}")

    edl = arm.ler_json(f"saidas/{pid}/v1/edl.json")
    d = arm.ler_json(f"projetos/{pid}/direcao_1.json")
    uso = arm.ler_json(f"projetos/{pid}/uso_1.json")
    ok("EDL v1 válido (edl.schema.json)", not validar.erros("edl", edl), f"{edl['duracao']:.1f} s, {len(edl['voz'])} peças de voz, {len(edl['planos'])} planos")
    n_falas = sum(len(b["falas"]) for b in d["blocos"])
    resolvidas = {(v["bloco"], v["id"].split(".")[1]) for v in edl["voz"]}
    ok("todas as falas da direção resolvidas", len(resolvidas) == n_falas, f"{len(resolvidas)}/{n_falas}")
    alvo = d["duracao_alvo"]
    ok("duração dentro de ±10% do alvo", abs(edl["duracao"] - alvo) <= 0.1 * alvo, f"{edl['duracao']:.1f} s para alvo {alvo} s, vel {edl['vel_fala']}")

    # legendas: só palavra dita (conf >= 0,5) ou confirmada (corrigir/vocabulário)
    loja = Loja()
    an_por_id = {x["arquivo"]["id"]: x for x in analises}
    clip_arq = {c["id"]: c["arquivo"] for c in cat["clipes"]}
    ditas = set()
    for v in edl["voz"]:
        cid = v["fonte"].split("_")[0]
        for p in palavras_do_arquivo(an_por_id[clip_arq[cid]]):
            if v["s0"] - 0.05 <= (p[0] + p[1]) / 2 <= v["s1"] + 0.05 and p[3] >= 0.5:
                ditas.add(norm(p[2]).replace(" ", ""))
    confirmadas = {norm(x["para"]).replace(" ", "") for x in loja.vocabulario()}
    for b in d["blocos"]:
        for f in b["falas"]:
            for c in f.get("corrigir") or []:
                confirmadas |= {norm(w) for w in c["para"].split()}
    leg = edl["legendas"]["palavras"]
    fora = [w[2] for w in leg if norm(w[2]).replace(" ", "") not in ditas | confirmadas]
    ok("legendas só com palavras da transcrição (conf >= 0,5) ou confirmadas", leg and not fora, f"{len(leg)} palavras; fora: {fora[:6]}")
    seq = " ".join(norm(w[2]) for w in leg)
    if real:
        ok("correção 'RUAN na filmagem' aplicada", "ruan na filmagem" in seq and "voando" not in seq)
        ok("marca escrita creat (nada de create/creit)", not ({"create", "creit"} & set(seq.split())))
    tom = edl.get("tom_sala")
    ok_tom = False
    if tom:
        cid = tom["fonte"].split("_")[0]
        a_t = an_por_id[clip_arq[cid]]
        vozes = [(p[0], p[1]) for p in palavras_do_arquivo(a_t)] + [(s["s"], s["e"]) for s in a_t["transcricao"]["segmentos"]]
        ok_tom = not any(x0 < tom["s1"] + 0.3 and x1 > tom["s0"] - 0.3 for x0, x1 in vozes)
    ok("tom de sala de trecho sem fala (±0,3 s de margem)", ok_tom, json.dumps(tom))
    fecho = [m for m in edl["motion"] if m["modelo"].startswith("fecho")]
    ok("fecho com logo animada e @creat.mtt", fecho and fecho[0]["props"].get("logo") and "@creat.mtt" in json.dumps(fecho[0]["props"], ensure_ascii=False))
    falhas_mem = [c for c in uso.get("checagens_edl", []) if not c["ok"] and c["gravidade"] == "bloqueia"]
    ok("checagens da memória que o EDL responde passam", not falhas_mem, str(falhas_mem)[:200])

    # 4. orçamento
    ok("prompt do diretor <= 22 000 tokens estimados", uso["prompt_tokens_estimados"] <= orcamento.LIMITE_PROMPT, f"{uso['prompt_tokens_estimados']} tokens")
    ok("direção <= 4 000 tokens", uso["direcao_tokens_estimados"] <= orcamento.LIMITE_DIRECAO, f"{uso['direcao_tokens_estimados']} tokens")
    pt, dt = uso["prompt_tokens_estimados"], uso["direcao_tokens_estimados"]
    c_dir = orcamento.custo_usd("claude-opus-5-5", 400, dt, cache_escrito=pt - 400)          # 1a chamada grava o prefixo em cache
    c_cri = orcamento.custo_usd("claude-opus-5-5", 400 + dt, dt, cache_lido=pt - 400)        # crítico lê o prefixo a 10%
    tempos["custo_estimado_usd"] = round(c_dir + c_cri, 3)
    print(f"     custo estimado no Opus 5.5 (diretor US$ {c_dir:.3f} + crítico US$ {c_cri:.3f}), sem contar o raciocínio")

    # 5. idempotência: refazer catálogo e direção não chama o cérebro de novo
    t = time.time()
    banco.enfileirar(con, "catalogo", pid)
    while worker.rodar_um(con, cfg, arm_p, "aceite-b", etapas_b):
        pass
    tempos["reexecucao_s"] = round(time.time() - t, 2)
    ok("reexecução reaproveita (sem nova versão, < 2 s)", not arm.existe(f"projetos/{pid}/direcao_2.json") and tempos["reexecucao_s"] < 2, f"{tempos['reexecucao_s']} s")

    # 6. reprovação do dono -> regra + checagem -> aparece no próximo prompt -> nova direção v2
    r = cli.post(f"/v1/projetos/{pid}/versoes/v9/reprovar", json={"motivo": MOTIVO})
    ok("API: reprovar versão inexistente (404)", r.status_code == 404, str(r.status_code))
    r = cli.post(f"/v1/projetos/{pid}/versoes/v1/reprovar", json={"motivo": "x"})
    ok("API: motivo curto demais (422)", r.status_code == 422, str(r.status_code))
    r = cli.post(f"/v1/projetos/{pid}/versoes/v1/reprovar", json={"motivo": MOTIVO})
    rj = r.json() if r.status_code == 200 else {}
    ok("reprovação vira regra + checagem", r.status_code == 200 and rj.get("regra", {}).get("id", "").startswith("r_dono_")
       and rj.get("checagem", {}).get("tipo") == "legenda_proibida", f"{r.status_code} {json.dumps(rj, ensure_ascii=False)[:220]}")
    loja = Loja()
    sistema, _, ped_txt = montar_prompt(loja, txt, arm.pedido(pid), correcao={"reprovacao": MOTIVO, "versao_anterior": "v1"})
    ok("regra nova aparece no próximo prompt", rj.get("regra", {}).get("texto", "?") in sistema and "REPROVOU" in ped_txt)
    ok("checagem nova gravada na memória", any(c["id"] == rj.get("checagem", {}).get("id") for c in loja.checagens()))
    r = cli.get("/v1/memoria")
    ok("GET /v1/memoria mostra as regras ao dono", r.status_code == 200 and any(x["id"].startswith("r_dono_") for x in r.json()["regras"]))
    t = time.time()
    while worker.rodar_um(con, cfg, arm_p, "aceite-b", etapas_b):
        pass
    tempos["direcao_apos_reprovacao_s"] = round(time.time() - t, 2)
    v2 = arm.existe(f"saidas/{pid}/v2/edl.json")
    ok("nova direção v2 depois da reprovação", v2)
    if v2:
        e2 = arm.ler_json(f"saidas/{pid}/v2/edl.json")
        avaliacao = loja.avaliar_edl(e2)
        nova = next((c for c in avaliacao if c["id"] == rj.get("checagem", {}).get("id")), None)
        ok("checagem da reprovação roda no EDL v2", nova is not None, json.dumps(nova, ensure_ascii=False))
        ok("vocabulário do dono corrige a legenda da v2 ('galera', sem 'pessoal')",
           "galera" in " ".join(norm(w[2]) for w in e2["legendas"]["palavras"]) and nova is not None and nova["ok"])

    # 7. testes automáticos da frente
    import subprocess
    t = time.time()
    pr = subprocess.run([sys.executable, "-m", "pytest", "-q", "-m", "not pago", "tests/test_b_catalogo.py", "tests/test_b_resolvedor.py",
                         "tests/test_b_memoria.py", "tests/test_b_api.py", "tests/test_fila.py", "tests/test_contratos.py"],
                        cwd=pathlib.Path(__file__).resolve().parents[2], capture_output=True, text=True,
                        env={k: v for k, v in os.environ.items() if k not in ("EDITOR_DADOS", "EDITOR_MEMORIA")})
    tempos["pytest_s"] = round(time.time() - t, 2)
    ultima = (pr.stdout.strip().splitlines() or ["?"])[-1]
    ok("pytest -m 'not pago' verde (frente B + núcleo)", pr.returncode == 0, ultima)
    if pr.returncode:
        print(pr.stdout[-3000:], pr.stderr[-1500:])

    falhas = [n for n, c, _ in resultados if not c]
    print(f"\n== tempos: {json.dumps(tempos)}")
    print(f"== {len(resultados) - len(falhas)}/{len(resultados)} checagens ok" + (f"; FALHARAM: {falhas}" if falhas else ""))
    (dados / "aceite_b.json").write_text(json.dumps({"resultados": resultados, "tempos": tempos}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
