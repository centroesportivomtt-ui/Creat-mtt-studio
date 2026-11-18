"""logo_100: logo nunca ampliada além do arquivo (regra do dono, 17/11: logo da Elite Drako serrilhada na abertura).
Para cada logo em cena (camadas com `logo`/`src` de imagem de marca, fechos com a logo padrão e `edl.qa.logos`):
largura em tela / largura do arquivo <= 1,15 (vetor SVG sempre passa). O quadro 1080x1920 a 100% do instante em que a
logo está pousada é salvo como evidência para olhar.
"""
import pathlib
import re

from motor import config

ID, BLOQUEIA = "logo_100", True
LIMITE = 1.15
PADRAO_LOGO = "assets/marca/logo_creatMTT_claro.png"
LARGURA_PADRAO = {"fecho": 620, "fecho2": 800}


def _arquivo(v: str, c):
    v = re.sub(r"^/@abs", "", v)
    if v.startswith("/"):
        return pathlib.Path(v)
    if v.startswith(("assets/", "kit/")):
        return config.KIT / v
    if c.fontes is not None:
        try:
            return c.fontes.arquivo_qualquer(v)
        except Exception:  # noqa: BLE001
            return None
    return None


def _largura_px(p: pathlib.Path):
    if p.suffix.lower() == ".svg":
        return None
    from PIL import Image
    with Image.open(p) as im:
        return im.width, im.height


def _usos(c):
    usos = []
    for m in c.edl.get("motion", []) or []:
        pr = m.get("props") or {}
        logo = pr.get("logo") or (pr.get("src") if re.search(r"logo|marca", str(pr.get("src", "")), re.I) else None)
        if not logo and m["modelo"] in LARGURA_PADRAO:
            logo = PADRAO_LOGO
        if not logo:
            continue
        tela = pr.get("larguraLogo") or pr.get("largura") or pr.get("w") or LARGURA_PADRAO.get(m["modelo"])
        altura = pr.get("altura") if not tela else None
        usos.append({"camada": m["id"], "modelo": m["modelo"], "logo": logo, "tela": tela, "altura": altura,
                     "t": min(m["ate"] - 0.1, m["de"] + 1.6)})
    conhecidos = {pathlib.Path(re.sub(r"^/@abs", "", u["logo"])).name for u in usos}
    for q in (c.edl.get("qa") or {}).get("logos", []) or []:
        if pathlib.Path(q["chave"]).name not in conhecidos:
            usos.append({"camada": None, "modelo": None, "logo": q["chave"], "tela": None, "altura": None, "t": q["t"]})
    return usos


def checar(c):
    usos = _usos(c)
    if not usos:
        return {"ok": True, "detalhe": "nenhuma logo em cena"}
    ruins, val, evid = [], [], []
    for i, u in enumerate(usos):
        p = _arquivo(u["logo"], c)
        if p is None or not p.exists():
            ruins.append(f"{u['logo']}: arquivo não encontrado")
            val.append({**u, "erro": "arquivo não encontrado"})
            continue
        dim = _largura_px(p)
        if dim is None:
            val.append({**u, "vetor": True})
            continue
        tela = u["tela"] or (u["altura"] * dim[0] / dim[1] if u["altura"] else None)
        if tela is None:
            val.append({**u, "px": dim[0], "aviso": "largura em tela não declarada"})
            continue
        r = float(tela) / dim[0]
        item = {"camada": u["camada"], "logo": p.name, "px": dim[0], "tela_px": round(float(tela)), "ampliacao": round(r, 2), "t": round(u["t"], 2)}
        val.append(item)
        q = c.quadro(u["t"])
        if q is not None:
            evid.append(c.salvar_quadro(q, f"logo_{i}_{p.stem[:24]}.jpg"))
        if r > LIMITE:
            ruins.append(f"{p.name} tem {dim[0]} px e aparece com {round(float(tela))} px ({r:.2f}x): pedir original em vetor/alta")
    return {"ok": not ruins, "valor": val, "evidencia": evid,
            "detalhe": "; ".join(ruins) if ruins else f"{len(val)} logo(s) sem ampliação acima de {LIMITE}x; quadro a 100% salvo"}
