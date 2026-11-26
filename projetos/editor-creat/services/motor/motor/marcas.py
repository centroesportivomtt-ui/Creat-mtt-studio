"""Marca do cliente (onda 4, D48/D49): a logo e as poses do mascote de cada cliente, no armazenamento.

    marcas/<slug>/logo.png              PNG RGBA normalizado (lado maior entre 512 e 2048 px, sem metadados)
    marcas/<slug>/mascote/<pose>.png    mesma coisa, com fundo transparente obrigatório
    marcas/<slug>/marca.json            {"slug", "nome", "logo": {sha256, w, h, alfa, enviado_em} | null, "mascote": {pose: {...}}}

O slug é o mesmo da página de entregas (`entregas_r2.slug` + `RE_CLIENTE`): "super_kal", "Super Kal" e "super-kal" viram
"super-kal". A logo de cliente NUNCA vai para o git (`memoria/README.md`): entra pela tela do Caderno ou por esta linha:

    python -m motor.marcas semear super-kal caminho/da/logo.png      # mesma validação da tela (teste local, servidor próprio)
    python -m motor.marcas listar

Envio malicioso não passa: o tipo é lido nos bytes (o content-type do navegador não vale), imagem acima de 16 milhões de
pixels é recusada ANTES de decodificar (bomba de descompressão), o Pillow confere o arquivo (`verify`) e a imagem é regravada
do zero em PNG (o que vier junto, como metadados, perfil ou um HTML colado no fim, não sobrevive). Apagar projeto não apaga
marca: ela é do cliente, não do projeto.
"""
from __future__ import annotations

import hashlib
import io
import json
import pathlib
import sys
import threading
import time

from motor import entregas_r2

LIMITE_BYTES = 8 * 1024 * 1024          # o proxy do site corta no mesmo teto, só nesta rota
LADO_MIN, LADO_MAX = 512, 2048
MAX_PIXELS = 16_000_000                 # 4000 × 4000: folga para logo (sai com até 2048 px) sem pico de ~500 MB na API (revisão, A7/S1)
_DECODIFICANDO = threading.BoundedSemaphore(1)   # uma imagem decodificada por vez: envios juntos não somam o pico no contêiner do render
POSES = ("espiada", "placa", "moto", "carro", "aceno")
TIPOS = ("image/png", "image/jpeg", "image/webp")
_TRAVA = threading.Lock()               # marca.json é lido, mexido e regravado: um escritor por vez no processo


class ErroImagem(ValueError):
    """Recusa com o status HTTP e a frase para o dono."""

    def __init__(self, status: int, frase: str):
        super().__init__(frase)
        self.status = status
        self.frase = frase


def slug(texto) -> str | None:
    """Slug das entregas ou None (vazio, "-", "../x" e afins não viram pasta)."""
    s = entregas_r2.slug(str(texto or ""))[:40].strip("-")
    return s if s and entregas_r2.RE_CLIENTE.match(s) else None


def slug_ou_erro(texto) -> str:
    s = slug(texto)
    if s is None:
        raise ErroImagem(422, "nome de cliente inválido")
    return s


def _formato_pelos_bytes(dados: bytes) -> str | None:
    if dados.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if dados.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if len(dados) >= 12 and dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        return "WEBP"
    return None


def validar_imagem(dados: bytes, tipo: str | None, *, exigir_alfa: bool = False) -> tuple[bytes, int, int, bool]:
    """bytes enviados -> (png normalizado, largura, altura, tem_alfa). Levanta ErroImagem com a frase do dono."""
    tipo = (tipo or "").split(";")[0].strip().lower()
    if tipo not in TIPOS:
        raise ErroImagem(415, "tipo de arquivo não aceito: mande a imagem em PNG, JPEG ou WEBP")
    if len(dados) > LIMITE_BYTES:
        raise ErroImagem(413, "imagem grande demais: mande com até 8 MB")
    formato = _formato_pelos_bytes(dados)
    if formato is None:
        raise ErroImagem(422, "não é uma imagem válida")
    import warnings

    from PIL import Image
    with _DECODIFICANDO, warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        return _decodificar(dados, formato, exigir_alfa)


def _decodificar(dados: bytes, formato: str, exigir_alfa: bool) -> tuple[bytes, int, int, bool]:
    from PIL import Image, ImageOps
    try:
        with Image.open(io.BytesIO(dados), formats=[formato]) as im:
            w, h = im.size                          # só o cabeçalho: nada decodificado ainda
            if w * h > MAX_PIXELS:
                raise ErroImagem(422, "imagem grande demais: mande com até 16 milhões de pixels (4000 × 4000)")
            if getattr(im, "is_animated", False) or getattr(im, "n_frames", 1) > 1:
                raise ErroImagem(422, "imagem animada não serve como logo")
            im.verify()
        with Image.open(io.BytesIO(dados), formats=[formato]) as im:
            im = ImageOps.exif_transpose(im)        # foto de celular deitada fica em pé antes de medir
            im.load()
            rgba = im.convert("RGBA")
    except ErroImagem:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as e:   # o próprio Pillow barrou pelo tamanho
        raise ErroImagem(422, "imagem grande demais: mande com até 16 milhões de pixels (4000 × 4000)") from e
    except Exception as e:  # noqa: BLE001 - qualquer quebra do decodificador é "não é imagem", nunca derruba o motor
        raise ErroImagem(422, "não é uma imagem válida") from e
    if max(rgba.size) < LADO_MIN:
        raise ErroImagem(422, "imagem pequena demais: mande com pelo menos 512 px no lado maior")
    if max(rgba.size) > LADO_MAX:
        rgba.thumbnail((LADO_MAX, LADO_MAX), Image.Resampling.LANCZOS)
    alfa = rgba.getchannel("A").getextrema()[0] < 255
    if exigir_alfa and not alfa:
        raise ErroImagem(422, "o mascote precisa de fundo transparente")
    limpo = Image.frombytes("RGBA", rgba.size, rgba.tobytes())   # imagem nova: nenhum metadado, perfil ou resto do arquivo
    saida = io.BytesIO()
    limpo.save(saida, "PNG", optimize=True)
    return saida.getvalue(), limpo.size[0], limpo.size[1], alfa


# ---------------------------------------------------------------- armazenamento
def chave_logo(s: str) -> str:
    return f"marcas/{s}/logo.png"


def chave_mascote(s: str, pose: str) -> str:
    return f"marcas/{s}/mascote/{pose}.png"


def _chave_json(s: str) -> str:
    return f"marcas/{s}/marca.json"


def _agora() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def ler(arm, s: str) -> dict:
    vazio = {"slug": s, "nome": entregas_r2.nome_cliente(s), "logo": None, "mascote": {}}
    try:
        if arm.existe(_chave_json(s)):
            d = json.loads(pathlib.Path(arm.caminho_local(_chave_json(s))).read_text(encoding="utf-8"))
            if isinstance(d, dict):
                vazio.update({k: d[k] for k in ("nome", "logo", "mascote") if k in d})
    except (OSError, ValueError):
        pass
    # a logo vale pelo arquivo: marca.json sem o PNG (apagado à mão) não promete logo
    if vazio["logo"] and not arm.existe(chave_logo(s)):
        vazio["logo"] = None
    vazio["mascote"] = {p: m for p, m in (vazio.get("mascote") or {}).items() if p in POSES and arm.existe(chave_mascote(s, p))}
    return vazio


def _ficha(png: bytes, w: int, h: int, alfa: bool) -> dict:
    return {"sha256": hashlib.sha256(png).hexdigest(), "w": w, "h": h, "alfa": alfa, "enviado_em": _agora()}


def gravar_logo(arm, cliente, dados: bytes, tipo: str | None) -> dict:
    s = slug_ou_erro(cliente)
    png, w, h, alfa = validar_imagem(dados, tipo)
    with _TRAVA:
        m = ler(arm, s)
        arm.gravar_bytes(chave_logo(s), png)
        m["logo"] = _ficha(png, w, h, alfa)
        arm.gravar_json(_chave_json(s), m)
    return {"slug": s, "logo": True, "w": w, "h": h, "alfa": alfa}


def apagar_logo(arm, cliente) -> dict:
    s = slug_ou_erro(cliente)
    with _TRAVA:
        m = ler(arm, s)
        arm.apagar(chave_logo(s))
        m["logo"] = None
        arm.gravar_json(_chave_json(s), m)
    return {"slug": s, "logo": False}


def gravar_mascote(arm, cliente, pose: str, dados: bytes, tipo: str | None) -> dict:
    s = slug_ou_erro(cliente)
    if pose not in POSES:
        raise ErroImagem(404, "pose do mascote não existe")
    png, w, h, alfa = validar_imagem(dados, tipo, exigir_alfa=True)
    with _TRAVA:
        m = ler(arm, s)
        arm.gravar_bytes(chave_mascote(s, pose), png)
        m["mascote"][pose] = _ficha(png, w, h, alfa)
        arm.gravar_json(_chave_json(s), m)
    return {"slug": s, "pose": pose, "w": w, "h": h, "alfa": alfa}


def apagar_mascote(arm, cliente, pose: str) -> dict:
    s = slug_ou_erro(cliente)
    if pose not in POSES:
        raise ErroImagem(404, "pose do mascote não existe")
    with _TRAVA:
        m = ler(arm, s)
        arm.apagar(chave_mascote(s, pose))
        m["mascote"].pop(pose, None)
        arm.gravar_json(_chave_json(s), m)
    return {"slug": s, "pose": pose, "apagada": True}


def listar(arm) -> list[dict]:
    """Clientes com marca cadastrada (logo ou mascote), em ordem alfabética do slug."""
    slugs = set()
    try:
        for k in arm.listar("marcas/"):
            partes = k.split("/")
            if len(partes) >= 3 and partes[0] == "marcas" and slug(partes[1]) == partes[1]:
                slugs.add(partes[1])
    except OSError:
        return []
    out = []
    for s in sorted(slugs):
        m = ler(arm, s)
        if not m["logo"] and not m["mascote"]:
            continue
        datas = [x.get("enviado_em") for x in [m["logo"] or {}, *m["mascote"].values()] if x.get("enviado_em")]
        lg = m["logo"] or {}
        out.append({"slug": s, "nome": m["nome"], "logo": bool(m["logo"]), "atualizado": max(datas) if datas else None,
                    "mascote": [p for p in POSES if p in m["mascote"]],
                    "medidas": {"w": lg.get("w"), "h": lg.get("h"), "alfa": lg.get("alfa")} if lg else None})
    return out


# ---------------------------------------------------------------- linha de comando
def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    from motor import config
    from motor.provedores import armazenamento_de
    arm = armazenamento_de(config.carregar())
    if arm is None:
        print("armazenamento indisponível neste motor", file=sys.stderr)
        return 2
    if argv[:1] == ["listar"]:
        for m in listar(arm):
            print(f"{m['slug']}: logo {'sim' if m['logo'] else 'não'}; mascote {', '.join(m['mascote']) or 'nenhum'}")
        return 0
    if argv[:1] == ["semear"] and len(argv) in (3, 4):
        arq = pathlib.Path(argv[2])
        tipo = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(arq.suffix.lower())
        try:
            dados = arq.read_bytes()
            r = gravar_mascote(arm, argv[1], argv[3], dados, tipo) if len(argv) == 4 else gravar_logo(arm, argv[1], dados, tipo)
        except OSError as e:
            print(f"não li o arquivo: {e}", file=sys.stderr)
            return 1
        except ErroImagem as e:
            print(f"recusada: {e.frase}", file=sys.stderr)
            return 1
        print(json.dumps(r, ensure_ascii=False))
        return 0
    print("uso: python -m motor.marcas listar | semear <cliente> <arquivo> [pose]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
