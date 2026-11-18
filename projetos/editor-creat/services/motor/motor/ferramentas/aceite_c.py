"""Aceite da FRENTE C (montagem e QA) — ARQUITETURA §11.

uso:  cd services/motor && nice -n 5 python -m motor.ferramentas.aceite_c [--rapido]

1. EDL sintético (2 fontes testsrc2 4K geradas na hora + trilha em batida; voz do clipe real 0948_57 se existir) passa pela
   FILA de verdade (worker: montagem -> qa -> entrega) e sai final.mp4 de 10 s 1080x1920 30 fps H.264 + AAC 48 kHz com gancho,
   legenda, chip, whip e fecho do kit;
2. QA aprovado: -14 ± 0,5 LUFS, pico real <= -1 dBTP, sem quadro preto, zona segura, formato; entrega com capa e link;
3. negativos: tom de sala tirado de trecho COM voz (laço "vai competir") -> reprova frase_repetida/tom_sala_sem_voz;
   logo de 300 px em tela cheia -> reprova logo_100;
4. material real (pulado se não existir): edl_legado converte o V2/edl.json e renderiza o trecho 0-8 s; folha de contato salva;
5. overlay medido: ms/quadro com 3 workers (meta <= 130) e o render antigo (screenshot, 1 worker) como base;
6. pytest dos testes da frente C e do núcleo.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

RES: list[tuple[bool, str]] = []


def ok(cond: bool, msg: str) -> bool:
    RES.append((bool(cond), msg))
    print(("  ok    " if cond else "  FALHA ") + msg, flush=True)
    return bool(cond)


def pulado(msg: str) -> None:
    print("  pulado " + msg, flush=True)


def probe(arq) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,profile,width,height,r_frame_rate,sample_rate,duration",
                        "-of", "json", str(arq)], capture_output=True, text=True)
    return {s["codec_type"]: s for s in json.loads(r.stdout).get("streams", [])}


def folha(arq, destino, tempos, colunas=8):
    sel = "+".join(f"eq(n\\,{int(round(t * 30))})" for t in tempos)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(arq), "-vf", f"select='{sel}',scale=270:480,tile={colunas}x{(len(tempos) + colunas - 1) // colunas}",
                    "-frames:v", "1", "-q:v", "3", str(destino)], check=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rapido", action="store_true", help="pula o material real e a medida do render antigo")
    a = ap.parse_args(argv)
    from motor import banco, config, worker
    from motor.etapas.montagem import montar
    from motor.etapas.montagem import overlay as OV
    from motor.etapas.montagem.comum import Fontes
    from motor.etapas.qa import conferir
    from motor.ferramentas import sintetico_c as S

    cfg = config.carregar()
    raiz = cfg.dados / "aceite_c"
    raiz.mkdir(parents=True, exist_ok=True)
    tempos: dict = {}
    t_ini = time.time()
    livre = shutil.disk_usage(cfg.dados).free / 1e9
    print(f"Aceite da frente C · dados em {cfg.dados} · {livre:.1f} GB livres · clipe real: {'sim' if S.tem_real() else 'não'}")
    if livre < 0.4:
        print("disco insuficiente (< 0,4 GB livres): libere espaço antes")
        return 2

    # ---------------------------------------------------------------- 1 e 2: pela fila
    print("\n1-2) EDL sintético pela fila (montagem -> qa -> entrega)")
    t = time.time()
    f = S.gerar_fontes(cfg.dados / "sinteticos_c")
    tempos["fontes_sinteticas_s"] = round(time.time() - t, 1)
    edl = S.edl_sintetico(f, projeto="p_aceite_c")
    arm = None
    from motor.provedores import armazenamento_de
    arm = armazenamento_de(cfg)
    con = banco.conectar(cfg.banco)
    p, v = "p_aceite_c", "v1"
    agora = banco.agora_iso()
    con.execute("DELETE FROM jobs WHERE projeto=?", (p,))
    con.execute("DELETE FROM versoes WHERE projeto=?", (p,))
    con.execute("INSERT OR REPLACE INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES (?,?,?,?,?,?)",
                (p, "aceite C", "montando", agora, agora, json.dumps({"envio_fechado": True})))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, p, "montando", agora))
    for k in list(arm.listar(f"saidas/{p}/")):
        arm.apagar(k)
    import io
    arm.gravar(f"saidas/{p}/{v}/edl.json", io.BytesIO(json.dumps(edl, ensure_ascii=False).encode()))
    banco.enfileirar(con, "montagem", p, v, prioridade=1)
    t = time.time()
    worker.main(["--ate-ocioso", "--etapas", "montagem,qa,entrega", "--espera", "0.2"])
    tempos["fila_montagem_qa_entrega_s"] = round(time.time() - t, 1)
    jobs = {j["etapa"]: j for j in banco.jobs_do_projeto(con, p)}
    for et in ("montagem", "qa", "entrega"):
        j = jobs.get(et)
        ok(j is not None and j["estado"] == "feito", f"job {et}: {j['estado'] if j else 'não criado'}" + (f" · erro: {str(j.get('erro'))[-300:]}" if j and j.get("erro") else ""))
    est = con.execute("SELECT estado FROM projetos WHERE id=?", (p,)).fetchone()["estado"]
    ok(est == "entregue", f"estado do projeto: {est}")
    base = f"saidas/{p}/{v}"
    final = pathlib.Path(arm.caminho_local(f"{base}/final.mp4"))
    if ok(final.exists(), f"final.mp4 gravado ({final.stat().st_size / 1e6:.1f} MB)" if final.exists() else "final.mp4 gravado"):
        pr = probe(final)
        vv, aa = pr.get("video", {}), pr.get("audio", {})
        ok((vv.get("width"), vv.get("height"), vv.get("r_frame_rate")) == (1080, 1920, "30/1"), f"vídeo {vv.get('width')}x{vv.get('height')} {vv.get('r_frame_rate')}")
        ok(vv.get("codec_name") == "h264" and aa.get("codec_name") == "aac" and aa.get("sample_rate") == "48000", f"{vv.get('codec_name')} {vv.get('profile')} + {aa.get('codec_name')} {aa.get('sample_rate')} Hz")
        ok(abs(float(vv.get("duration", 0)) - 10.0) <= 1 / 30 + 0.01, f"duração {float(vv.get('duration', 0)):.3f} s")
        folha(final, raiz / "folha_sintetico.jpg", [0.5, 1.4, 2.9, 3.1, 4.2, 5.0, 6.4, 9.0])
        print(f"        folha de contato: {raiz / 'folha_sintetico.jpg'}")
    mont = json.loads(pathlib.Path(arm.caminho_local(f"{base}/montagem.json")).read_text()) if arm.existe(f"{base}/montagem.json") else {}
    cam = {m["modelo"] for m in edl["motion"]} | ({"legenda"} if edl["legendas"]["palavras"] else set())
    ok({"gancho", "chip", "fecho", "legenda"} <= cam and any(x["tipo"] == "whip" for x in edl["fx"]), f"cena com {sorted(cam)} + whip")
    tempos["montagem"] = mont.get("tempos")
    if arm.existe(f"{base}/qa.json"):
        qa = json.loads(pathlib.Path(arm.caminho_local(f"{base}/qa.json")).read_text())
        c = {x["id"]: x for x in qa["checagens"]}
        ok(qa["aprovado"], "QA aprovado" + ("" if qa["aprovado"] else ": " + "; ".join(f"{k}: {x['detalhe']}" for k, x in c.items() if not x["ok"] and x["bloqueia"])))
        for k in ("lufs", "true_peak", "quadros_pretos", "zona_segura", "formato", "legenda_x_fala", "frase_repetida", "tom_sala_sem_voz", "logo_100", "sincronia"):
            ok(c.get(k, {}).get("ok", False), f"QA {k}: {c.get(k, {}).get('detalhe', 'ausente')}")
        tempos["qa_s"] = qa.get("tempo_s")
    else:
        ok(False, "qa.json gravado")
    if arm.existe(f"{base}/entrega.json"):
        ent = json.loads(pathlib.Path(arm.caminho_local(f"{base}/entrega.json")).read_text())
        ok(bool(ent.get("link")) and arm.existe(f"{base}/capa.jpg") and "@creat.mtt" in ent.get("legenda_post", ""),
           f"entrega: link {ent.get('link')} · capa · legenda do post «{ent.get('legenda_post', '')[:60]}»")
    else:
        ok(False, "entrega.json gravado")
    # entrega recusa arquivo mexido depois do QA
    from motor.etapas import ErroDefinitivo
    from motor.etapas.entrega import entregar
    sha_arq = pathlib.Path(arm.caminho_local(f"{base}/qa.sha256"))
    original = sha_arq.read_text()
    sha_arq.write_text("0" * 64)
    try:
        entregar(arm, cfg, p, v)
        recusou = False
    except ErroDefinitivo:
        recusou = True
    sha_arq.write_text(original)
    ok(recusou, "entrega recusa final com sha256 diferente do conferido")

    # ---------------------------------------------------------------- 3: negativos
    print("\n3) Testes negativos (o QA precisa reprovar de verdade)")
    if S.tem_real():
        t = time.time()
        e2 = S.edl_sintetico(f, projeto="p_neg_tom", tom_com_voz=True)
        d = raiz / "neg_tom"
        rel = montar(e2, d, Fontes(e2, None, cfg.dados), cfg)
        q = conferir(rel["final"], e2, cfg, mix=rel["mix"], stems=rel["stems"], overlay_dir=rel["overlay_dir"], evidencias=d / "qa")
        c = {x["id"]: x for x in q["checagens"]}
        ok(not q["aprovado"] and (not c["frase_repetida"]["ok"] or not c["tom_sala_sem_voz"]["ok"]),
           f"tom de sala com voz reprovado: frase_repetida «{c['frase_repetida']['detalhe'][:90]}» · tom_sala_sem_voz «{c['tom_sala_sem_voz']['detalhe'][:90]}»")
        tempos["negativo_tom_s"] = round(time.time() - t, 1)
        shutil.rmtree(d, ignore_errors=True)
    else:
        pulado("tom de sala com voz: clipe real 0948_57 ausente (sem fala de verdade para o laço)")
    t = time.time()
    e3 = S.edl_sintetico(f, projeto="p_neg_logo", logo_pequena=True)
    d = raiz / "neg_logo"
    rel = montar(e3, d, Fontes(e3, None, cfg.dados), cfg)
    q = conferir(rel["final"], e3, cfg, mix=rel["mix"], stems=rel["stems"], overlay_dir=rel["overlay_dir"], evidencias=d / "qa",
                 so=["logo_100", "formato", "lufs"])
    c = {x["id"]: x for x in q["checagens"]}
    ok(not q["aprovado"] and not c["logo_100"]["ok"], f"logo de 300 px em tela cheia reprovada: «{c['logo_100']['detalhe'][:110]}»")
    ok(bool(c["logo_100"].get("evidencia")), f"quadro a 100% salvo como evidência: {c['logo_100'].get('evidencia')}")
    tempos["negativo_logo_s"] = round(time.time() - t, 1)
    shutil.rmtree(d, ignore_errors=True)

    # ---------------------------------------------------------------- 4: material real
    print("\n4) Material real: V2/edl.json -> EDL novo -> trecho 0-8 s")
    v2 = S.SCRATCH / "V2" / "edl.json"
    if a.rapido or not v2.exists():
        pulado("V2 ausente" if not v2.exists() else "--rapido")
    else:
        from motor.ferramentas.edl_legado import converter
        sys.path.insert(0, str(config.SCHEMAS / "py"))
        from validar import erros
        t = time.time()
        e4 = converter(v2)
        ok(not erros("edl", e4), f"V2 convertido e válido: {len(e4['planos'])} planos, {len(e4['voz'])} peças de voz, {len(e4['motion'])} camadas, {len(e4['sfx'])} SFX")
        v1 = S.SCRATCH / "V1" / "edl.json"
        if v1.exists():
            e1 = converter(v1)
            ok(not erros("edl", e1), f"V1 convertido e válido: {len(e1['planos'])} planos, {len(e1['voz'])} peças de voz, pendências {len(e1['origem']['pendencias'])}")
        som_ant = os.environ.get("MK_SOM")
        if not som_ant and (S.SCRATCH / "audio" / "sfx").exists():
            os.environ["MK_SOM"] = str(S.SCRATCH / "audio")
        d = raiz / "v2_trecho"
        rel = montar(e4, d, Fontes(e4, None, cfg.dados), cfg, janela=(0.0, 8.0))
        if not som_ant:
            os.environ.pop("MK_SOM", None)
        tempos["v2_trecho"] = rel["tempos"]
        tempos["v2_trecho_overlay"] = rel["overlay"]
        pr = probe(rel["final"])
        ok(abs(float(pr["video"]["duration"]) - 8.0) <= 0.05 and pr["video"]["width"] == 1080, f"trecho V2 renderizado: {float(pr['video']['duration']):.2f} s 1080x1920")
        folha(rel["final"], raiz / "folha_v2_trecho.jpg", [0.33, 1.33, 2.5, 3.33, 4.33, 5.5, 6.67, 7.83])
        ok((raiz / "folha_v2_trecho.jpg").exists(), f"folha de contato do V2 para olhar: {raiz / 'folha_v2_trecho.jpg'}")
        shutil.copy(rel["final"], raiz / "trecho_v2_0_8.mp4")
        shutil.rmtree(d, ignore_errors=True)
        tempos["v2_total_s"] = round(time.time() - t, 1)

    # ---------------------------------------------------------------- 5: overlay medido
    print("\n5) Overlay: ms por quadro")
    d = raiz / "medida_overlay"
    shutil.rmtree(d, ignore_errors=True)
    r3 = OV.renderizar(edl, Fontes(edl, None, cfg.dados), d, workers=3, nice=cfg.nice)
    st = r3["stats"]
    ok(st["ms_efetivo"] <= 130, f"overlay 10 s (300 quadros) com 3 workers: {st['ms_efetivo']} ms/quadro efetivos (meta <= 130), "
                                f"{st['ms_quadro']} ms em cada worker, {st['repetidos']} quadros repetidos viraram link, captura {st['captura']}")
    tempos["overlay_3w"] = st
    shutil.rmtree(d, ignore_errors=True)
    if not a.rapido:
        cena = OV.cena_do_edl(edl, None)
        arq = raiz / "cena_base.json"
        arq.write_text(json.dumps(cena, ensure_ascii=False))
        t = time.time()
        r = subprocess.run(["nice", "-n", str(cfg.nice or 0), "node", str(config.KIT / "ferramentas" / "render.cjs"), str(arq), "--alfa", "png",
                            "--out", str(raiz / "base_png") + "/", "--de", "0", "--ate", "3", "--json"], capture_output=True, text=True,
                           env={**os.environ, "MK_BF": "0"}, cwd=str(config.KIT))
        import re
        m = re.search(r"MKSTATS (\{.*\})", r.stdout)
        if m:
            b = json.loads(m.group(1))
            tempos["overlay_base_screenshot_1w"] = b
            print(f"        base (render antigo: screenshot, 1 worker, 3 s): {b['ms_quadro']} ms/quadro")
        shutil.rmtree(raiz / "base_png", ignore_errors=True)
        arq.unlink(missing_ok=True)

    # ---------------------------------------------------------------- 6: pytest
    print("\n6) pytest (frente C + núcleo)")
    aqui = pathlib.Path(__file__).resolve().parents[2]
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-m", "not pago", "tests/test_c_unidades.py", "tests/test_c_qa.py", "tests/test_c_api.py",
                        "tests/test_fila.py", "tests/test_contratos.py"], cwd=str(aqui), capture_output=True, text=True)
    ultima = (r.stdout.strip().splitlines() or ["?"])[-1]
    ok(r.returncode == 0, f"pytest: {ultima}")
    if r.returncode != 0:
        print(r.stdout[-2500:])

    tempos["aceite_total_s"] = round(time.time() - t_ini, 1)
    n_ok = sum(1 for x, _ in RES if x)
    print(f"\nACEITE C: {n_ok}/{len(RES)} ok · {tempos['aceite_total_s']} s")
    (raiz / "resultado.json").write_text(json.dumps({"ok": n_ok, "total": len(RES), "itens": [[x, m] for x, m in RES], "tempos": tempos},
                                                    ensure_ascii=False, indent=1))
    print(f"tempos: {raiz / 'resultado.json'}")
    return 0 if n_ok == len(RES) else 1


if __name__ == "__main__":
    sys.exit(main())
