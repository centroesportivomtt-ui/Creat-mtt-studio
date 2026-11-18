"""Teste de aceitação da FRENTE A (ingestão e análise). ARQUITETURA.md §11.

uso:  cd services/motor && nice -n 5 python -m motor.ferramentas.aceite_a [--dados PASTA] [--manter] [--workers 2]

1. gera 2 vídeos sintéticos 4K (3840x2160 gravado com rotação -90 = vertical, 20 s, GOP 1 s; um com silêncio no
   meio, outro com tremor, corte de cena e batidas) + usa o clipe real 0948_57 do scratchpad (pulado se não existir);
2. sobe a API de verdade (uvicorn numa thread, com token), cria o projeto, registra os arquivos e escuta o SSE;
3. roda N workers `motor.worker --ate-ocioso --etapas ingest,analise` em processos separados;
4. confere: análise válida nos 3; quadros-chave >= duração/GOP; vad=false; rotação aplicada (w<h);
   "competir" no clipe real; SSE com etapa_fim dos 6 jobs; reexecução sem refazer nada em < 2 s;
   tempos por arquivo registrados e dentro da meta (§8) nos sintéticos.
Sai com código 0 só se tudo passar.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time

AQUI = pathlib.Path(__file__).resolve()
MOTOR_DIR = AQUI.parents[2]                       # services/motor
SCRATCH = pathlib.Path("/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/drako")
CLIPE_REAL = SCRATCH / "seg" / "0948_57_0.mov"
META_INGEST_S = 15.0          # §8: ingest <= 15 s por arquivo
META_ANALISE_RT = 1.0         # teto: análise inteira <= duração do clipe (meta típica 4-5x tempo real só na transcrição)


# ---------------- mídia sintética (também usada pelos testes) ----------------
def gerar_sintetico(dest: pathlib.Path, *, tipo: str = "silencio", w: int = 3840, h: int = 2160, dur: float = 20.0,
                    rotacao: int = -90, audio: bool = True, crf: int = 38) -> pathlib.Path:
    """Vídeo como o do iPhone: gravado deitado com matriz de rotação (vira vertical ao exibir), GOP de 1 s."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.stem + ".tmp.mp4")
    if tipo == "tremor":
        meio = dur / 2
        v = (f"testsrc2=s={w + 160}x{h + 120}:r=30:d={meio},crop={w}:{h}:x='80+70*sin(13*t)':y='60+50*cos(11*t)'[a];"
             f"smptehdbars=s={w}x{h}:r=30:d={dur - meio}[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]")
        a = f"aevalsrc='0.05*sin(2*PI*660*t)+if(lt(mod(t,5),0.15),0.9*sin(2*PI*220*t),0)':s=48000:d={dur}"
    else:
        v = f"testsrc2=s={w}x{h}:r=30:d={dur},format=yuv420p[v]"
        a = f"sine=f=440:r=48000:d={dur},volume='if(between(t,8,12),0,0.5)':eval=frame"
    cmd = ["nice", "-n", "5", "ffmpeg", "-v", "error", "-y", "-filter_complex", v]
    if audio:
        cmd += ["-f", "lavfi", "-i", a]
    cmd += ["-map", "[v]"] + (["-map", "0:a"] if audio else [])
    cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", str(crf), "-g", "30", "-threads", "2"]
    cmd += (["-c:a", "aac", "-b:a", "96k", "-shortest"] if audio else ["-an"]) + [str(tmp)]
    subprocess.run(cmd, check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation", str(rotacao), "-i", str(tmp), "-c", "copy", str(dest)], check=True)
    tmp.unlink(missing_ok=True)
    return dest


# ---------------- servidor e SSE ----------------
def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def subir_api(porta: int):
    import uvicorn

    from motor.api.app import criar
    srv = uvicorn.Server(uvicorn.Config(criar(), host="127.0.0.1", port=porta, log_level="warning", lifespan="off"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    for _ in range(100):
        if srv.started:
            return srv
        time.sleep(0.05)
    raise RuntimeError("API não subiu")


def escutar_sse(url: str, token: str, eventos: list, parar: threading.Event):
    import httpx
    with httpx.Client(timeout=httpx.Timeout(10, read=None)) as cli:
        with cli.stream("GET", url, headers={"Authorization": f"Bearer {token}"}) as r:
            r.raise_for_status()
            for linha in r.iter_lines():
                if linha.startswith("data: "):
                    eventos.append(json.loads(linha[6:]))
                if parar.is_set():
                    return


# ---------------- o aceite ----------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dados", default="")
    ap.add_argument("--manter", action="store_true", help="não apaga a pasta de dados no fim")
    ap.add_argument("--workers", type=int, default=2)
    a = ap.parse_args(argv)

    from motor import config as _c
    dados = pathlib.Path(a.dados or (_c.RAIZ_REPO / "dados" / "aceite_a")).resolve()
    sint_dir = dados.parent / "sinteticos"
    if dados.exists():
        shutil.rmtree(dados)
    dados.mkdir(parents=True)
    token = secrets.token_hex(16)
    os.environ.update({"EDITOR_DADOS": str(dados), "MOTOR_TOKEN": token, "EDITOR_NICE": "5"})
    modelos_cache = dados.parent / "modelos"          # YuNet baixado uma vez e reaproveitado
    (dados / "modelos").mkdir(exist_ok=True)
    for f in modelos_cache.glob("*.onnx"):
        shutil.copy(f, dados / "modelos" / f.name)

    import httpx

    from motor import banco, config
    cfg = config.carregar()
    from motor.provedores import armazenamento_de
    arm = armazenamento_de(cfg)
    resultados, falhas = [], []

    def checar(ok: bool, texto: str):
        resultados.append(("OK   " if ok else "FALHA") + " " + texto)
        if not ok:
            falhas.append(texto)
        print(resultados[-1], flush=True)

    # 1. material
    t = time.time()
    s1 = gerar_sintetico(sint_dir / "sint_silencio_4k.mov", tipo="silencio")
    s2 = gerar_sintetico(sint_dir / "sint_tremor_4k.mov", tipo="tremor")
    print(f"sintéticos prontos em {time.time() - t:.1f} s ({s1.stat().st_size >> 20} MB + {s2.stat().st_size >> 20} MB)")
    fontes = [(s1, "20261118_101500.mov"), (s2, "20261118_101600.mov")]
    tem_real = CLIPE_REAL.exists()
    if tem_real:
        fontes.append((CLIPE_REAL, "20261115_094857.mov"))
    else:
        print("AVISO clipe real 0948_57 não existe nesta máquina: checagem 'competir' pulada")

    # 2. API + SSE
    porta = _porta_livre()
    srv = subir_api(porta)
    base = f"http://127.0.0.1:{porta}/v1"
    H = {"Authorization": f"Bearer {token}"}
    cli = httpx.Client(timeout=30)
    checar(cli.get(f"{base}/saude").status_code == 401, "API recusa chamada sem token (401)")
    r = cli.post(f"{base}/projetos", json={"nome": "Aceite frente A", "tipo_video": "bastidor"}, headers=H)
    checar(r.status_code == 201, f"projeto criado pela API ({r.status_code})")
    pid = r.json()["id"]
    eventos, parar = [], threading.Event()
    th_sse = threading.Thread(target=escutar_sse, args=(f"{base}/projetos/{pid}/eventos?ate=900", token, eventos, parar), daemon=True)
    th_sse.start()
    ids = {}
    for orig, nome in fontes:
        chave = f"entrada/{pid}/{nome}"
        arm.gravar(chave, orig)                        # o site (tus) faz isto em produção
        r = cli.post(f"{base}/projetos/{pid}/arquivos", json={"chave": chave, "nome": nome, "bytes": orig.stat().st_size}, headers=H)
        checar(r.status_code == 201, f"arquivo {nome} registrado ({r.status_code})")
        ids[nome] = r.json()["id"]

    # 3. workers em processos separados
    t_ini = time.time()
    env = {**os.environ}
    procs = [subprocess.Popen(["nice", "-n", "5", sys.executable, "-m", "motor.worker", "--ate-ocioso", "--etapas", "ingest,analise", "--espera", "0.3"],
                              cwd=str(MOTOR_DIR), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
             for _ in range(max(1, a.workers))]
    for p in procs:
        _, err = p.communicate(timeout=1800)
        if p.returncode != 0:
            print(err[-2000:])
    t_total = time.time() - t_ini
    con = banco.conectar(cfg.banco)
    pend = [j for j in banco.jobs_do_projeto(con, pid) if j["estado"] != "feito"]
    if pend:      # um worker pode ter saído no instante em que a fila esvaziou: termina aqui
        from motor import worker
        worker.main(["--ate-ocioso", "--etapas", "ingest,analise"])
    print(f"leitura completa de {len(fontes)} arquivos em {t_total:.1f} s com {len(procs)} worker(s)")

    # 4. conferências
    jobs = banco.jobs_do_projeto(con, pid)
    checar(len(jobs) == 2 * len(fontes) and all(j["estado"] == "feito" for j in jobs),
           f"{len(jobs)} jobs feitos: " + ", ".join(f"{j['etapa']}:{j['alvo']}={j['estado']}" for j in jobs))
    sys.path.insert(0, str(config.SCHEMAS / "py"))
    import validar
    tabela = []
    for orig, nome in fontes:
        aid = ids[nome]
        an = arm.ler_json(f"derivados/{pid}/{aid}/analise.json")
        err = validar.erros("analise", an)
        checar(not err, f"{aid} analise.json válido no schema" + (f": {err[:3]}" if err else ""))
        m, tr, tp = an["midia"], an["transcricao"], an["tempos"]
        kfs = len(an["derivados"]["quadros_chave"])
        checar(kfs >= int(m["duracao"] / (m["gop"] or 1)) and kfs > 0, f"{aid} quadros-chave {kfs} >= duração/GOP ({m['duracao']:.1f}/{m['gop']})")
        checar(tr["vad"] is False, f"{aid} transcrição sem VAD (vad=false, provedor {tr['provedor']}/{tr['modelo']})")
        checar(m["w"] < m["h"] and m["rotacao"] == -90, f"{aid} rotação aplicada: {m['w']}x{m['h']} (rotação {m['rotacao']})")
        jpg = arm.caminho_local(an["derivados"]["quadros_chave"][0]["chave"])
        from PIL import Image
        iw, ih = Image.open(jpg).size
        checar(iw < ih, f"{aid} quadro-chave em pé ({iw}x{ih})")
        checar(all(k in tp for k in ("ingest_total", "analise_total", "analise_transcricao")), f"{aid} tempos registrados")
        sint = orig != CLIPE_REAL
        if sint:
            checar(tp["ingest_total"] <= META_INGEST_S, f"{aid} ingest {tp['ingest_total']:.1f} s <= meta {META_INGEST_S:.0f} s")
            checar(tp["analise_total"] <= META_ANALISE_RT * m["duracao"], f"{aid} análise {tp['analise_total']:.1f} s <= {META_ANALISE_RT * m['duracao']:.0f} s (duração)")
        else:
            txt = " ".join(s["texto"] for s in tr["segmentos"]).lower()
            checar("competir" in txt, f"{aid} clipe real contém 'competir': «{txt[:90]}»")
        if nome.startswith("20261118_101600"):
            checar(len(an["sinais"]["cenas"]) >= 2, f"{aid} corte de cena achado ({len(an['sinais']['cenas'])} cenas)")
            checar(len(an["sinais"]["energia"]["picos"]) >= 2, f"{aid} batidas achadas como picos ({len(an['sinais']['energia']['picos'])})")
        tabela.append((aid, nome, m["duracao"], tp["ingest_total"], tp["analise_transcricao"], tp["analise_total"],
                       len(tr["segmentos"]), len((an.get("visao") or {}).get("momentos", []))))

    # SSE
    t_lim = time.time() + 10
    while time.time() < t_lim and sum(1 for e in eventos if e["tipo"] == "etapa_fim") < 2 * len(fontes):
        time.sleep(0.2)
    fins = [(e["etapa"], e["alvo"]) for e in eventos if e["tipo"] == "etapa_fim"]
    checar(len(set(fins)) >= 2 * len(fontes) and all(("ingest", i) in fins and ("analise", i) in fins for i in ids.values()),
           f"SSE entregou etapa_fim dos {2 * len(fontes)} jobs ({len(eventos)} eventos ao vivo)")
    checar(all(validar.erros("evento", {k: v for k, v in e.items()}) == [] for e in eventos), "todos os eventos do SSE válidos em evento.schema.json")

    # 5. idempotência: reenfileira tudo e roda de novo
    for aid in ids.values():
        banco.enfileirar(con, "ingest", pid, aid)
    t = time.time()
    from motor import worker
    worker.main(["--ate-ocioso", "--etapas", "ingest,analise", "--espera", "0.1"])
    t_re = time.time() - t
    saidas = [json.loads(j["saida"] or "{}") for j in con.execute("SELECT saida FROM jobs WHERE projeto=?", (pid,))]
    checar(t_re < 2.0 and all(s.get("pulado") for s in saidas), f"reexecução sem refazer nada em {t_re:.2f} s (< 2 s; {len(saidas)} jobs 'pulado')")

    # arquivo servido com Range (player)
    ck = f"derivados/{pid}/{ids[fontes[0][1]]}/folha.jpg"
    r = cli.get(f"{base}/arquivos/{ck}", headers={**H, "Range": "bytes=0-99"})
    checar(r.status_code == 206 and len(r.content) == 100, f"arquivo servido com Range (206, {len(r.content)} bytes)")

    parar.set()
    srv.should_exit = True
    # modelos baixados ficam para a próxima rodada
    modelos_cache.mkdir(exist_ok=True)
    for f in (dados / "modelos").glob("*.onnx"):
        if not (modelos_cache / f.name).exists():
            shutil.copy(f, modelos_cache / f.name)

    print("\narquivo  nome                    dur(s)  ingest(s)  transcr(s)  análise(s)  falas  momentos")
    for l in tabela:
        print(f"{l[0]:8} {l[1]:22} {l[2]:6.1f}  {l[3]:9.2f}  {l[4]:10.2f}  {l[5]:10.2f}  {l[6]:5}  {l[7]:8}")
    print(f"\n{len(resultados) - len(falhas)}/{len(resultados)} checagens OK" + (" — ACEITE A APROVADO" if not falhas else " — ACEITE A REPROVADO"))
    if not a.manter:
        shutil.rmtree(dados, ignore_errors=True)
    return 0 if not falhas else 1


if __name__ == "__main__":
    raise SystemExit(main())
