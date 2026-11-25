"""Etapa INGEST (por arquivo, assim que ele chega): metadados, quadros-chave e áudio numa decodificação só.

- Nunca decodifica o 4K inteiro: `-skip_frame:v nokey` só abre os quadros-chave (11x mais rápido, pesquisa B),
  reduzidos a 640 px no maior lado, com a rotação do celular já aplicada (e HDR -> SDR quando precisa).
- Na mesma passada sai o áudio em WAV 48 kHz mono (base da transcrição e do mix).
- sha256 do original calculado em paralelo (thread), sem segunda leitura cara.
- Importação por link (Dropbox/Drive) acontece aqui quando o job traz `entrada.url` e o original ainda não existe.
- Idempotente: `derivados/<p>/<a>/ingest.json` guarda a assinatura (chave, tamanho, mtime, versão do algoritmo);
  se nada mudou, a etapa volta na hora.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

from motor import banco, importar
from motor.etapas import Contexto, ErroDefinitivo, etapa

ALGO = "ingest-1"
LADO_KF = 640
MAX_FOLHA = 48


# ---------------- utilidades (também usadas pela análise) ----------------
def assinatura(*partes) -> str:
    return hashlib.sha1("|".join(map(str, partes)).encode()).hexdigest()[:16]


def ffprobe(caminho: Path) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(caminho)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise ErroDefinitivo(f"arquivo ilegível (ffprobe): {r.stderr.strip()[:200]}")
    d = json.loads(r.stdout or "{}")
    if not d.get("streams"):
        raise ErroDefinitivo("arquivo sem trilha de vídeo ou áudio")
    return d


def _fracao(txt) -> float | None:
    try:
        n, d = str(txt).split("/") if "/" in str(txt) else (txt, 1)
        n, d = float(n), float(d)
        return round(n / d, 3) if d and n else None
    except (TypeError, ValueError):
        return None


def ler_midia(probe: dict) -> dict:
    vs = [s for s in probe["streams"] if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")]
    aus = [s for s in probe["streams"] if s.get("codec_type") == "audio"]
    v, a = (vs[0] if vs else None), (aus[0] if aus else None)
    dur = float(probe.get("format", {}).get("duration") or (v or a or {}).get("duration") or 0)
    rot = 0
    if v:
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rot = int(round(float(sd["rotation"])))
        if not rot and v.get("tags", {}).get("rotate"):
            rot = int(v["tags"]["rotate"])
    rot = -90 if rot == -90 else {0: 0, 90: 90, 180: 180, 270: 270}.get(rot % 360, 0)   # o iPhone grava -90
    w, h = (int(v["width"]), int(v["height"])) if v else (None, None)
    if v and abs(rot) % 180 == 90:
        w, h = h, w
    return {
        "duracao": round(dur, 3), "tem_video": bool(v), "tem_audio": bool(a), "w": w, "h": h, "rotacao": rot,
        "fps": _fracao(v.get("avg_frame_rate") or v.get("r_frame_rate")) if v else None,
        "codec_video": v.get("codec_name") if v else None, "codec_audio": a.get("codec_name") if a else None,
        "hdr": bool(v and v.get("color_transfer") in ("smpte2084", "arib-std-b67")), "gop": None,
    }


_RE_NOME = re.compile(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[ _T-]?(\d{2})[.:_-]?(\d{2})[.:_-]?(\d{2})")


def gravado_em(probe: dict, nome: str) -> str | None:
    tags = {k.lower(): v for k, v in (probe.get("format", {}).get("tags") or {}).items()}
    cd = tags.get("com.apple.quicktime.creationdate")
    if cd:
        m = re.match(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}):?(\d{2})?", cd)
        if m:
            return f"{m.group(1)}{m.group(2)}:{m.group(3) or '00'}"
    m = _RE_NOME.search(nome or "")
    if m:
        y, mo, d, hh, mi, ss = m.groups()
        return f"{y}-{mo}-{d}T{hh}:{mi}:{ss}"
    ct = tags.get("creation_time")
    return ct.replace(".000000Z", "Z") if ct else None


def _sha256(caminho: Path, saida: dict) -> None:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(4 << 20), b""):
            h.update(bloco)
    saida["sha256"] = h.hexdigest()


def extrair(orig: Path, pasta: Path, midia: dict, threads: int) -> tuple[list[tuple[float, Path]], Path | None]:
    """Uma decodificação: quadros-chave JPG (640 px, rotação aplicada) + WAV 48 kHz mono."""
    kf = pasta / "kf"
    kf.mkdir(parents=True, exist_ok=True)
    escala = f"scale='if(gt(iw,ih),{LADO_KF},-2)':'if(gt(iw,ih),-2,{LADO_KF})':flags=bilinear"
    sdr = ",zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
    wav = pasta / "audio.wav" if midia["tem_audio"] else None

    def rodar(com_sdr: bool):
        cmd = ["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "info", "-y", "-threads", str(threads)]
        if midia["tem_video"]:
            cmd += ["-skip_frame:v", "nokey"]
        cmd += ["-i", str(orig)]
        if midia["tem_video"]:
            vf = escala + (sdr if com_sdr else "") + ",showinfo"
            cmd += ["-map", "0:v:0", "-fps_mode", "passthrough", "-vf", vf, "-q:v", "4", str(kf / "%04d.jpg")]
        if wav:
            cmd += ["-map", "0:a:0", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(wav)]
        return subprocess.run(cmd, capture_output=True, text=True)

    r = rodar(midia["hdr"])
    if r.returncode != 0 and midia["hdr"]:
        r = rodar(False)
    if r.returncode != 0:
        raise ErroDefinitivo(f"ffmpeg falhou ao ler o arquivo: {r.stderr.strip()[-300:]}")
    tempos = [max(0.0, float(x)) for x in re.findall(r"Parsed_showinfo.*?pts_time:\s*([-0-9.e]+)", r.stderr)]
    jpgs = sorted(kf.glob("*.jpg"))
    quadros = list(zip(tempos, jpgs)) if len(tempos) >= len(jpgs) else [(i * (midia["duracao"] / max(1, len(jpgs))), p) for i, p in enumerate(jpgs)]
    return quadros, wav


def folha_contato(quadros: list[tuple[float, Path]], destino: Path, largura: int = 180, colunas: int = 8) -> Path | None:
    """Folha JPG com até 48 quadros-chave e o tempo no canto (entrada da visão e do site)."""
    if not quadros:
        return None
    from PIL import Image, ImageDraw, ImageFont
    passo = max(1, -(-len(quadros) // MAX_FOLHA))
    sel = quadros[::passo][:MAX_FOLHA]
    try:
        fonte = ImageFont.load_default(size=16)
    except TypeError:   # Pillow antigo
        fonte = ImageFont.load_default()
    ims = []
    for t, p in sel:
        im = Image.open(p).convert("RGB")
        im = im.resize((largura, max(1, int(im.height * largura / im.width))))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 64, 20], fill=(0, 0, 0))
        d.text((4, 2), f"{t:.1f}s", font=fonte, fill=(255, 210, 0))
        ims.append(im)
    alt = max(i.height for i in ims)
    linhas = -(-len(ims) // colunas)
    cols = min(colunas, len(ims))
    folha = Image.new("RGB", (cols * largura, linhas * alt), (18, 18, 18))
    for k, im in enumerate(ims):
        folha.paste(im, ((k % cols) * largura, (k // cols) * alt))
    folha.save(destino, quality=82)
    return destino


# ---------------- importação por link ----------------
def _preparar_pasta_drive(ctx: Contexto, direto: str, pasta: Path) -> tuple[str, str]:
    """Pasta do Drive colada: lista, tira o que já está no projeto, confere teto e disco, registra cada vídeo novo como um
    arquivo do projeto (cada um com o seu ingest: download próprio, retomável, e falha de um não derruba os outros) e devolve
    (url do 1º vídeo, nome) para ESTA tarefa baixar no lugar da linha "importando do link…". Repetir a tarefa (rede caiu no
    meio) não duplica nada: o par id do Drive -> arquivo fica em projetos.dados.importados_drive."""
    con, p, a = ctx.con, ctx.projeto, ctx.alvo
    fid, rk = importar.id_da_pasta(direto)
    ctx.progresso(0.02, "Lendo a lista da pasta do Drive")
    lista = importar.listar_pasta_drive(fid, resourcekey=rk)
    if not lista["itens"]:
        raise importar.ErroImportacao(importar.MSG_PASTA_SEM_MIDIA)
    ja = importar.importados_drive(con, p)
    meu = next((d for d, x in ja.items() if x == a), None)            # repetição da tarefa: o 1º já foi escolhido
    novos = [i for i in lista["itens"] if i["id"] not in ja]
    if meu is None and not novos:
        raise importar.ErroImportacao(importar.msg_pasta_ja_importada(len(lista["itens"])))
    tam = importar.tamanhos_drive([i["id"] for i in novos])
    total = sum(t or 0 for t in tam.values())
    if total > importar.MAX_BYTES:
        raise importar.ErroImportacao(f"A pasta tem {total / 2**30:.1f} GB de vídeo, acima do limite de {importar.MAX_BYTES / 2**30:.0f} GB.")
    importar._checar_disco(pasta, total)
    if meu is None:
        primeiro, novos = novos[0], novos[1:]
        meu = primeiro["id"]
        nome1 = importar.nome_do_item(primeiro)
        con.execute("UPDATE arquivos SET nome=?, bytes=? WHERE projeto=? AND id=?", (nome1, int(tam.get(meu) or 0), p, a))
        importar.marcar_importado_drive(con, p, meu, a)
    else:
        nome1 = next((importar.nome_do_item(i) for i in lista["itens"] if i["id"] == meu), None) or \
            con.execute("SELECT nome FROM arquivos WHERE projeto=? AND id=?", (p, a)).fetchone()["nome"]
    for it in novos:
        url_it = importar.url_do_arquivo_drive(it["id"])
        aid, _ = importar.registrar_arquivo(con, p, importar.nome_do_item(it), None, int(tam.get(it["id"]) or 0),
                                            entrada={"url": url_it, "drive_id": it["id"]}, ext=Path(it["nome"]).suffix.lower()[:8])
        importar.marcar_importado_drive(con, p, it["id"], aid)
    det = importar.detalhe_pasta(lista, len(novos) + 1, len(lista["itens"]) - len(novos) - 1)
    banco.emitir(con, p, "etapa_progresso", etapa="ingest", alvo=a, progresso=0.05, mensagem=det)
    return importar.url_do_arquivo_drive(meu), nome1


def _importar(ctx: Contexto, row, url: str):
    con, arm, p, a = ctx.con, ctx.armazenamento, ctx.projeto, ctx.alvo
    pasta = Path(ctx.cfg.dados) / "tmp" / f"import_{p}_{a}"
    pasta.mkdir(parents=True, exist_ok=True)

    def prog(feito, total):
        ctx.progresso(min(0.9, feito / total) if total else 0.05, f"Baixando do link: {feito / 2**20:.0f} MB" + (f" de {total / 2**20:.0f} MB" if total else ""))
    nome_fixo = None
    try:
        link, tipo = importar.link_direto(url)
        if tipo == "pasta_drive":
            url, nome_fixo = _preparar_pasta_drive(ctx, link, pasta)
            link, tipo = importar.link_direto(url)
        caminho, nome, nb = importar.baixar(link, pasta / "download", progresso=prog)
        if importar.eh_zip(caminho, nome) and not nome_fixo:
            midias = importar.videos_do_zip(caminho, pasta)
            caminho.unlink(missing_ok=True)
            if not midias:
                raise importar.ErroImportacao("A pasta do link não tem vídeo nem áudio.")
        else:
            ext = Path(nome_fixo or nome).suffix.lower()
            if ext not in importar.EXT_MIDIA:
                ext = Path(nome).suffix.lower() if Path(nome).suffix.lower() in importar.EXT_MIDIA else ".mp4"
            midias = [(caminho.rename(pasta / f"orig{ext}"), nome_fixo or nome)]
    except importar.ErroImportacao as e:
        con.execute("DELETE FROM arquivos WHERE projeto=? AND id=?", (p, a))   # não trava a direção do projeto
        importar.esquecer_importado_drive(con, p, a)                         # colar a pasta de novo traz este de volta
        shutil.rmtree(pasta, ignore_errors=True)
        raise ErroDefinitivo(str(e)) from e
    (c0, n0), extras = midias[0], midias[1:]
    chave = f"entrada/{p}/{a}{c0.suffix.lower()}"
    tam = c0.stat().st_size
    arm.gravar(chave, c0, mover=True)
    con.execute("UPDATE arquivos SET chave=?, nome=?, bytes=? WHERE projeto=? AND id=?", (chave, n0, tam, p, a))
    did = (ctx.job.get("entrada") or {}).get("drive_id") or importar.drive_id_de(url)
    if did:                                                    # arquivo do Drive: lembrar que já entrou (pasta colada de novo)
        importar.marcar_importado_drive(con, p, did, a)
    for k, (ck, nk) in enumerate(extras, start=1):
        chk = f"entrada/{p}/{a}_z{k:03d}{ck.suffix.lower()}"
        tk = ck.stat().st_size
        arm.gravar(chk, ck, mover=True)
        importar.registrar_arquivo(con, p, nk, chk, tk)
    shutil.rmtree(pasta, ignore_errors=True)
    banco.emitir(con, p, "etapa_progresso", etapa="ingest", alvo=a, progresso=0.9,
                 mensagem=f"Link baixado: {len(midias)} arquivo(s)" + (f" ({len(extras)} a mais na fila)" if extras else ""))
    return con.execute("SELECT * FROM arquivos WHERE projeto=? AND id=?", (p, a)).fetchone()


# ---------------- a etapa ----------------
@etapa("ingest")
def ingest(ctx: Contexto) -> dict:
    con, cfg, arm, p, a = ctx.con, ctx.cfg, ctx.armazenamento, ctx.projeto, ctx.alvo
    if arm is None:
        raise ErroDefinitivo("armazenamento não configurado")
    row = con.execute("SELECT * FROM arquivos WHERE projeto=? AND id=?", (p, a)).fetchone()
    if row is None:
        raise ErroDefinitivo(f"arquivo {a} não está registrado no projeto {p}")
    url = (ctx.job.get("entrada") or {}).get("url")
    if url and not arm.existe(row["chave"]):
        row = _importar(ctx, row, url)
    chave = row["chave"]
    if not arm.existe(chave):
        raise ErroDefinitivo(f"original não encontrado no armazenamento: {chave}")
    t0 = time.time()
    orig = arm.caminho_local(chave)
    st = orig.stat()
    sig = assinatura(ALGO, chave, st.st_size, st.st_mtime_ns)
    base = f"derivados/{p}/{a}"
    kj = f"{base}/ingest.json"
    if arm.existe(kj):
        try:
            prev = arm.ler_json(kj)
            d = prev["derivados"]
            chaves = [q["chave"] for q in d["quadros_chave"]] + [c for c in (d.get("audio_wav"), d.get("folha")) if c]
            if prev.get("assinatura") == sig and all(arm.existe(c) for c in chaves):
                return {"pulado": True, "quadros": len(d["quadros_chave"])}
        except (KeyError, ValueError, OSError):
            pass

    ctx.progresso(0.05, "Lendo metadados do arquivo")
    probe = ffprobe(orig)
    midia = ler_midia(probe)
    if midia["duracao"] <= 0:
        raise ErroDefinitivo("arquivo sem duração (corrompido ou vazio)")
    t_probe = time.time() - t0

    hash_out: dict = {}
    th = threading.Thread(target=_sha256, args=(orig, hash_out), daemon=True)
    th.start()
    pasta = Path(cfg.dados) / "tmp" / f"ingest_{p}_{a}"
    shutil.rmtree(pasta, ignore_errors=True)
    pasta.mkdir(parents=True)
    try:
        ctx.progresso(0.15, "Extraindo quadros-chave e áudio (sem decodificar o 4K inteiro)")
        t1 = time.time()
        quadros, wav = extrair(orig, pasta, midia, cfg.threads)
        t_extr = time.time() - t1
        if midia["tem_video"] and not quadros:
            raise ErroDefinitivo("não consegui extrair quadros do vídeo")
        midia["gop"] = round(midia["duracao"] / len(quadros), 3) if quadros else None
        t2 = time.time()
        folha = folha_contato(quadros, pasta / "folha.jpg")
        t_folha = time.time() - t2
        th.join()

        # grava: quadros, áudio, folha e por último o ingest.json (marca de pronto)
        for velho in list(arm.listar(f"{base}/kf/")):
            arm.apagar(velho)
        kfs = []
        for i, (t, jpg) in enumerate(quadros):
            ck = f"{base}/kf/{i:04d}.jpg"
            arm.gravar(ck, jpg, mover=True)
            kfs.append({"t": round(t, 3), "chave": ck})
        cw = arm.gravar(f"{base}/audio.wav", wav, mover=True) if wav and wav.exists() else None
        cf = arm.gravar(f"{base}/folha.jpg", folha, mover=True) if folha else None
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
    if row["bytes"] != st.st_size:
        con.execute("UPDATE arquivos SET bytes=? WHERE projeto=? AND id=?", (st.st_size, p, a))
    tempos = {"ingest_probe": round(t_probe, 2), "ingest_extracao": round(t_extr, 2), "ingest_folha": round(t_folha, 2),
              "ingest_total": round(time.time() - t0, 2)}
    arm.gravar_json(kj, {
        "algo": ALGO, "assinatura": sig,
        "arquivo": {"id": a, "projeto": p, "nome": row["nome"], "chave": chave, "bytes": st.st_size,
                    "sha256": hash_out.get("sha256"), "gravado_em": gravado_em(probe, row["nome"])},
        "midia": midia,
        "derivados": {"audio_wav": cw, "proxy_480": None, "folha": cf, "quadros_chave": kfs},
        "tempos": tempos,
    })
    ctx.progresso(1.0, f"Arquivo lido: {len(kfs)} quadros-chave, {midia['duracao']:.0f} s")
    return {"quadros": len(kfs), "segundos": tempos["ingest_total"]}
