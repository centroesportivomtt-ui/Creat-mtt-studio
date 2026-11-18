"""Teste ponta a ponta da Fase 1 PELO SITE, com o motor real e o cérebro em modo fixture (EDL pronto).

    python -m motor.ferramentas.e2e_fase1 [--clipe <arquivo .mov>] [--edl <edl.json>] [--ate 15.23] [--workers 2]

Caminho exercitado (tudo por HTTP do site, como o dono faria pelo celular):
  login -> novo projeto -> envio tus do clipe -> fechar envio -> pedido -> [motor: ingest, análise, catálogo,
  direção (fixture: EDL do V2 de 17/11, só o começo), montagem, QA, entrega] -> link -> vídeo por Range.
Mede o tempo de cada etapa (eventos do motor) e o relógio do dono (fechar envio -> entregue). Confere também que o vídeo
NÃO sai pelo site enquanto a versão não foi entregue (regra do dono). Precisa do build do site (apps/web/.next).
Nada pago roda: cérebro fixture, transcrição local, render na CPU, publicação desligada.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import secrets
import shutil
import signal
import subprocess
import sys
import time

DRAKO = pathlib.Path("/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/drako")
RAIZ = pathlib.Path(__file__).resolve().parents[4]          # projetos/editor-creat
MOTOR_DIR = RAIZ / "services" / "motor"
WEB = RAIZ / "apps" / "web"


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clipe", default=str(DRAKO / "seg" / "1016_50_0.mov"))
    ap.add_argument("--edl", default=str(DRAKO / "V2" / "edl.json"))
    ap.add_argument("--ate", default="15.23", help="só o começo do filme (s), numa fronteira de plano")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--dir", default=os.environ.get("E2E_DIR", "/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/e2e-fase1"))
    ap.add_argument("--porta-web", type=int, default=3017)
    ap.add_argument("--porta-motor", type=int, default=8797)
    ap.add_argument("--limite-min", type=float, default=30)
    a = ap.parse_args(argv)
    import httpx

    clipe = pathlib.Path(a.clipe)
    if not clipe.is_file() or not pathlib.Path(a.edl).is_file():
        print(f"faltando material: {clipe} / {a.edl}")
        return 2
    if not (WEB / ".next" / "BUILD_ID").exists():
        print("sem build do site: rode `cd apps/web && pnpm build` antes")
        return 2
    base_dir = pathlib.Path(a.dir)
    shutil.rmtree(base_dir, ignore_errors=True)
    dados = base_dir / "dados"
    dados.mkdir(parents=True)
    if (RAIZ / "dados" / "modelos").is_dir():           # detector de rosto (YuNet) já baixado: não baixa de novo
        shutil.copytree(RAIZ / "dados" / "modelos", dados / "modelos")
    senha = "e2e-" + secrets.token_hex(8)
    g = subprocess.run(["node", str(WEB / "scripts" / "gerar-senha.mjs"), senha], capture_output=True, text=True, check=True)
    env_site = dict(l.split("=", 1) for l in g.stdout.strip().splitlines())
    token = secrets.token_urlsafe(24)
    env = {**os.environ, "EDITOR_DADOS": str(dados), "MOTOR_TOKEN": token, "EDITOR_CEREBRO": "fixture",
           "EDITOR_CEREBRO_EDL": a.edl, "EDITOR_CEREBRO_EDL_ATE": a.ate, "EDITOR_NICE": "5", "PYTHONUNBUFFERED": "1",
           "NEXT_TELEMETRY_DISABLED": "1", "MOTOR_URL": f"http://127.0.0.1:{a.porta_motor}", **env_site}
    filhos = []

    def subir(nome, cmd, cwd):
        log = open(base_dir / f"{nome}.log", "w")
        p = subprocess.Popen(["nice", "-n", "5", *cmd], cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        filhos.append(p)
        return p

    rel = {"clipe": clipe.name, "bytes": clipe.stat().st_size, "edl": a.edl, "ate_s": float(a.ate), "checagens": [], "tempos": {}}

    def ok(nome, passou, det=""):
        rel["checagens"].append({"nome": nome, "ok": bool(passou), "detalhe": det})
        print(f"{'ok   ' if passou else 'FALHA'} {nome}{' — ' + det if det else ''}", flush=True)

    try:
        t_sobe = time.time()
        subir("motor", [sys.executable, "-m", "uvicorn", "motor.api.app:criar", "--factory", "--host", "127.0.0.1", "--port", str(a.porta_motor)], MOTOR_DIR)
        subir("site", ["pnpm", "exec", "next", "start", "-H", "127.0.0.1", "-p", str(a.porta_web)], WEB)
        for i in range(a.workers):
            subir(f"worker{i + 1}", [sys.executable, "-m", "motor.worker", "--espera", "0.5"], MOTOR_DIR)
        site = f"http://127.0.0.1:{a.porta_web}"
        cli = httpx.Client(base_url=site, headers={"Origin": site}, timeout=120)
        for _ in range(240):
            try:
                if cli.get("/entrar").status_code < 500 and httpx.get(f"http://127.0.0.1:{a.porta_motor}/v1/saude",
                                                                      headers={"Authorization": f"Bearer {token}"}).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.5)
        rel["tempos"]["subir_site_motor_s"] = round(time.time() - t_sobe, 2)

        r = cli.post("/api/entrar", json={"senha": senha})
        ok("login no site", r.status_code == 200, str(r.status_code))
        r = cli.post("/api/motor/v1/projetos", json={"nome": "E2E fase 1 · evento", "tipo_video": "evento"})
        ok("projeto criado pelo site", r.status_code == 201, str(r.status_code))
        pid = r.json()["id"]
        rel["projeto"] = pid

        # envio tus em partes de 16 MB
        t = time.time()
        tam = clipe.stat().st_size
        r = cli.post("/api/envio", headers={"Tus-Resumable": "1.0.0", "Upload-Length": str(tam),
                                            "Upload-Metadata": f"projeto {_b64(pid)},nome {_b64(clipe.name)},filename {_b64(clipe.name)}"})
        loc = r.headers.get("location", "")
        ok("envio tus criado", r.status_code == 201 and loc, f"{r.status_code} {loc}")
        url = loc if loc.startswith("http") else (loc if loc.startswith("/") else f"/api/envio/{loc}")
        off, cab_fim = 0, {}
        with open(clipe, "rb") as f:
            while off < tam:
                parte = f.read(16 << 20)
                r = cli.patch(url, content=parte, headers={"Tus-Resumable": "1.0.0", "Upload-Offset": str(off),
                                                           "Content-Type": "application/offset+octet-stream"})
                if r.status_code != 204:
                    break
                off = int(r.headers["upload-offset"])
                cab_fim = r.headers
        rel["tempos"]["envio_s"] = round(time.time() - t, 2)
        ok("envio tus completo e registrado no motor", off == tam and cab_fim.get("editor-registro") == "ok",
           f"{off}/{tam} bytes, registro {cab_fim.get('editor-registro')}, chave {cab_fim.get('editor-chave')}")

        t_fecha = time.time()
        r = cli.post(f"/api/motor/v1/projetos/{pid}/fechar-envio")
        ok("fechar envio", r.status_code == 200, r.text[:120])
        r = cli.post(f"/api/motor/v1/projetos/{pid}/pedido", json={"texto": "Reels do evento: abre com a fala mais forte, legenda animada, fecha chamando para o @creat.mtt."})
        ok("pedido pelo site", r.status_code == 201, str(r.status_code))
        ok("tipo do projeto chegou ao pedido", r.json().get("pedido", {}).get("tipo_video") == "evento", r.json().get("pedido", {}).get("tipo_video", "?"))

        # acompanha; enquanto confere, o vídeo NÃO pode sair pelo site
        estados, bloqueio_visto, fim = [], None, None
        while time.time() - t_fecha < a.limite_min * 60:
            p = cli.get(f"/api/motor/v1/projetos/{pid}").json()
            if not estados or estados[-1] != p["estado"]:
                estados.append(p["estado"])
                print(f"      {time.time() - t_fecha:7.1f} s  {p['estado']}", flush=True)
            for v in p.get("versoes", []):
                if v["estado"] in ("montada", "aprovada_qa") and bloqueio_visto is None:
                    st = cli.get(f"/api/motor/v1/arquivos/saidas/{pid}/{v['id']}/final.mp4", headers={"Range": "bytes=0-99"}).status_code
                    bloqueio_visto = (v["estado"], st)
            if p["estado"] in ("entregue", "erro", "reprovado_qa"):
                fim = p
                break
            time.sleep(1.0)
        rel["tempos"]["relogio_dono_s"] = round(time.time() - t_fecha, 1)
        rel["estados"] = estados
        ok("chegou a 'entregue'", fim is not None and fim["estado"] == "entregue", (fim or {}).get("estado", "tempo esgotado"))
        ok("relógio do dono dentro de 30 min", rel["tempos"]["relogio_dono_s"] <= 1800, f"{rel['tempos']['relogio_dono_s']} s")
        if bloqueio_visto:
            ok("vídeo bloqueado pelo site antes da entrega (403)", bloqueio_visto[1] == 403, f"versão {bloqueio_visto[0]} -> {bloqueio_visto[1]}")

        # tempos por etapa (eventos do motor: etapa_fim traz a duração exata)
        ev = cli.get(f"/api/motor/v1/projetos/{pid}/eventos", params={"seguir": "false"}, timeout=60).text
        eventos = [json.loads(l[6:]) for l in ev.splitlines() if l.startswith("data: ")]
        por_etapa: dict = {}
        for e in eventos:
            if e["tipo"] == "etapa_fim" and e.get("dados"):
                por_etapa.setdefault(e["etapa"], []).append(e["dados"]["s"])
        rel["tempos"]["etapas_s"] = {k: round(sum(v), 2) for k, v in por_etapa.items()}
        rel["erros"] = [e["mensagem"] for e in eventos if e["tipo"] in ("etapa_erro", "aviso")][:10]
        print("      etapas (s):", json.dumps(rel["tempos"]["etapas_s"]), flush=True)

        vers = cli.get(f"/api/motor/v1/projetos/{pid}/versoes").json()["versoes"]
        rel["versoes"] = [{k: v.get(k) for k in ("id", "estado", "link", "capa", "legenda_post", "qa_resumo", "tempos_montagem")} for v in vers]
        ent = next((v for v in vers if v["estado"] == "entregue"), None)
        if ent:
            r = cli.get(f"/api/motor/v1/arquivos/saidas/{pid}/{ent['id']}/final.mp4", headers={"Range": "bytes=0-1023"})
            ok("link do resultado responde pelo site (Range 206)", r.status_code == 206 and len(r.content) == 1024, str(r.status_code))
            final = dados / "armazenamento" / "saidas" / pid / ent["id"] / "final.mp4"
            pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration",
                                            "-of", "json", str(final)], capture_output=True, text=True).stdout)
            vs = next(s for s in pr["streams"] if s["codec_type"] == "video")
            rel["final"] = {"caminho": str(final), "w": vs["width"], "h": vs["height"], "fps": vs["r_frame_rate"],
                            "dur": float(pr["format"]["duration"]), "bytes": final.stat().st_size}
            ok("final 1080x1920 com a duração do EDL", vs["width"] == 1080 and vs["height"] == 1920 and abs(float(pr["format"]["duration"]) - float(a.ate)) < 0.2,
               f"{vs['width']}x{vs['height']} {float(pr['format']['duration']):.2f} s")
            edl = json.loads((dados / "armazenamento" / "saidas" / pid / ent["id"] / "edl.json").read_text())
            ok("o clipe enviado pelo site entrou no filme", bool(edl["origem"].get("fontes_do_envio")), str(edl["origem"].get("fontes_do_envio")))
            q = ent.get("qa_resumo") or {}
            ok("QA aprovado antes da entrega", q.get("aprovado") is True, f"falhas {q.get('falhas')} avisos {[x['id'] for x in q.get('avisos', [])]}")
    finally:
        for p in filhos:
            try:
                os.killpg(p.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        time.sleep(1)
    total = sum(1 for c in rel["checagens"] if c["ok"])
    rel["resultado"] = f"{total}/{len(rel['checagens'])}"
    (base_dir / "resultado.json").write_text(json.dumps(rel, ensure_ascii=False, indent=1))
    print(f"\nE2E FASE 1: {rel['resultado']} ok · relatório {base_dir / 'resultado.json'}")
    return 0 if total == len(rel["checagens"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
