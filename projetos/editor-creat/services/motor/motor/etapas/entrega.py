"""Etapa ENTREGA (frente C): só entrega a versão que o QA aprovou E cujo arquivo é o mesmo que o QA conferiu (sha256).

Regra do dono (17/11): "você não vai mandar a versão que não está ajustada". Por isso:
- sem qa.json aprovado -> recusa; sha256 do final diferente do qa.sha256 -> recusa (arquivo mexido depois da conferência);
- qa.json sem alguma checagem de CHECAGENS, ou EDL/regras mudados depois da conferência (qa.chave) -> recusa (19/11: um QA
  de antes de fala_cortada, voz_externa e cobertura_sintonia não pode liberar a entrega);
- gera capa (quadro do gancho), legenda do post (do próprio EDL: gancho + CTA + arroba, sem LLM) e o link;
- publicação pelo provedor (`EDITOR_PUBLICACAO`; padrão 'nenhuma' = só link); provedor pago sem chave fica desligado;
- limpa os intermediários da versão (overlay, áudio de trabalho) — o disco é curto.
"""
from __future__ import annotations

import io
import json
import pathlib
import re
import shutil
import subprocess

from motor.etapas import ErroDefinitivo, etapa
from motor.etapas.montagem.comum import sha256_arquivo


def legenda_post(edl: dict) -> str:
    def txt(v):
        if isinstance(v, list):
            return " ".join(txt(x) for x in v)
        return re.sub(r"[*~|]", "", str(v or "")).strip()
    partes = []
    for m in edl.get("motion", []):
        pr = m.get("props") or {}
        if m["modelo"].startswith("gancho"):
            linhas = pr.get("linhas") or (pr.get("a") or {}).get("linhas") or []
            if linhas:
                partes.append(txt(linhas).capitalize())
    cta, arroba = "", ""
    for m in edl.get("motion", []):
        if m["modelo"].startswith("fecho"):
            pr = m.get("props") or {}
            cta = txt(pr.get("cta"))
            for v in (pr.get("arroba"), pr.get("apoio")):
                mm = re.search(r"@[\w.]+", str(v or ""))
                if mm:
                    arroba = mm.group(0)
    if cta:
        partes.append(cta.capitalize())
    partes.append(arroba or "@creat.mtt")
    return "\n\n".join(p for p in partes if p)


def capa(final: pathlib.Path, edl: dict, destino: pathlib.Path) -> pathlib.Path:
    t = 1.0
    for m in edl.get("motion", []):
        if m["modelo"].startswith("gancho"):
            t = min(m["ate"] - 0.2, m["de"] + 1.6)
            break
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{max(0.0, t):.2f}", "-i", str(final), "-frames:v", "1",
                    "-q:v", "2", str(destino)], check=True)
    return destino


def entregar(arm, cfg, projeto: str, versao: str, *, publicar_em: str | None = None) -> dict:
    base = f"saidas/{projeto}/{versao}"
    if not arm.existe(f"{base}/qa.json"):
        raise ErroDefinitivo("sem QA: a versão não foi conferida")
    qa = json.loads(pathlib.Path(arm.caminho_local(f"{base}/qa.json")).read_text(encoding="utf-8"))
    if not qa.get("aprovado"):
        raise ErroDefinitivo("o QA reprovou esta versão: não entrego versão com erro conhecido")
    final = pathlib.Path(arm.caminho_local(f"{base}/final.mp4"))
    sha_qa = pathlib.Path(arm.caminho_local(f"{base}/qa.sha256")).read_text().strip() if arm.existe(f"{base}/qa.sha256") else ""
    sha = sha256_arquivo(final)
    if sha != sha_qa:
        raise ErroDefinitivo("o arquivo final mudou depois da conferência (sha256 diferente): refazer o QA")
    from motor.etapas.qa import CHECAGENS, chave_conferencia
    faltam = [n for n in CHECAGENS if n not in {x.get("id") for x in qa.get("checagens") or []}]
    if faltam:
        raise ErroDefinitivo(f"o QA desta versão é de antes das checagens {', '.join(faltam)}: refazer o QA")
    edl = json.loads(pathlib.Path(arm.caminho_local(f"{base}/edl.json")).read_text(encoding="utf-8"))
    chave_qa = pathlib.Path(arm.caminho_local(f"{base}/qa.chave")).read_text().strip() if arm.existe(f"{base}/qa.chave") else ""
    if chave_qa != chave_conferencia(sha, edl):
        raise ErroDefinitivo("o EDL ou as regras do dono mudaram depois da conferência (qa.chave diferente): refazer o QA")
    tmp = pathlib.Path(cfg.dados) / "tmp" / "entrega" / projeto / versao
    tmp.mkdir(parents=True, exist_ok=True)
    arm.gravar(f"{base}/capa.jpg", capa(final, edl, tmp / "capa.jpg"))
    texto = legenda_post(edl)
    pub = {"publicado": False, "motivo": "só link (publicação desligada)"}
    if publicar_em:
        from motor.provedores import provedor
        pub = provedor("publicacao", cfg).publicar(arm.url(f"{base}/final.mp4", 7 * 24 * 3600), texto, rede=publicar_em)
    rel = {"versao": versao, "link": arm.url(f"{base}/final.mp4", 7 * 24 * 3600), "capa": arm.url(f"{base}/capa.jpg", 7 * 24 * 3600),
           "legenda_post": texto, "sha256": sha, "publicacao": pub, "qa": f"{base}/qa.json"}
    lic = licencas(arm, base)
    if lic:
        rel["licencas"] = lic
    arm.gravar(f"{base}/entrega.json", io.BytesIO(json.dumps(rel, ensure_ascii=False, indent=1).encode()))
    for d in (pathlib.Path(cfg.dados) / "tmp" / "montagem" / projeto / versao, pathlib.Path(cfg.dados) / "tmp" / "qa" / projeto / versao, tmp):
        shutil.rmtree(d, ignore_errors=True)
    return rel


def licencas(arm, base: str) -> list[dict]:
    """Sons reais do banco que entraram no filme (M6): lista curta para a licença (pacote, biblioteca, nome, item do
    archive.org). Só metadado; o áudio nunca sai do cache."""
    if not arm.existe(f"{base}/montagem.json"):
        return []
    try:
        mont = json.loads(pathlib.Path(arm.caminho_local(f"{base}/montagem.json")).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    sr = mont.get("sons_reais") or {}
    out = [{k: x.get(k) for k in ("pacote", "biblioteca", "nome", "item")} for x in sr.get("itens") or []]
    if out:
        out = [{**x, "licenca": (sr.get("licenca") or {}).get("nome")} for x in out]
    return out


@etapa("entrega")
def etapa_entrega(ctx) -> dict:
    p, v = ctx.projeto, ctx.alvo or "v1"
    if ctx.armazenamento is None:
        raise ErroDefinitivo("armazenamento indisponível")
    rel = entregar(ctx.armazenamento, ctx.cfg, p, v, publicar_em=(ctx.job.get("entrada") or {}).get("publicar_em") if isinstance(ctx.job.get("entrada"), dict) else None)
    ctx.con.execute("UPDATE versoes SET estado='entregue', link=? WHERE projeto=? AND id=?", (rel["link"], p, v))
    return {"versao": v, "link": rel["link"], "capa": rel["capa"], "legenda_post": rel["legenda_post"]}
