"""formato: 1080x1920 (o do EDL), 30 fps, H.264 high, yuv420p, AAC 48 kHz e faststart (moov antes do mdat)."""
ID, BLOQUEIA = "formato", True


def _faststart(arq) -> bool:
    import struct
    with open(arq, "rb") as f:
        pos = 0
        while True:
            f.seek(pos)
            h = f.read(16)
            if len(h) < 8:
                return False
            tam, tipo = struct.unpack(">I4s", h[:8])
            if tam == 1:
                tam = struct.unpack(">Q", h[8:16])[0]
            if tipo == b"moov":
                return True
            if tipo == b"mdat" or tam < 8:
                return False
            pos += tam


def checar(c):
    v, a = c.stream("video"), c.stream("audio")
    if v is None:
        return {"ok": False, "detalhe": "sem trilha de vídeo"}
    num, den = v.get("r_frame_rate", "0/1").split("/")
    fps = float(num) / float(den or 1)
    val = {"w": v.get("width"), "h": v.get("height"), "fps": round(fps, 3), "codec": v.get("codec_name"), "perfil": v.get("profile"),
           "pix_fmt": v.get("pix_fmt"), "audio": a.get("codec_name") if a else None, "sr": int(a.get("sample_rate", 0)) if a else None,
           "faststart": _faststart(c.final)}
    erros = []
    if (val["w"], val["h"]) != (c.W, c.H):
        erros.append(f"tamanho {val['w']}x{val['h']} (pedido {c.W}x{c.H})")
    if abs(fps - c.FPS) > 0.01:
        erros.append(f"{fps:.2f} fps (pedido {c.FPS:g})")
    if val["codec"] != "h264" or val["perfil"] != "High":
        erros.append(f"vídeo {val['codec']} {val['perfil']} (pedido H.264 High)")
    if val["pix_fmt"] != "yuv420p":
        erros.append(f"pix_fmt {val['pix_fmt']}")
    if val["audio"] != "aac" or val["sr"] != 48000:
        erros.append(f"áudio {val['audio']} {val['sr']} Hz (pedido AAC 48 kHz)")
    if not val["faststart"]:
        erros.append("sem faststart (moov depois do mdat)")
    return {"ok": not erros, "valor": val, "detalhe": "; ".join(erros) or "1080x1920 30 fps H.264 High yuv420p AAC 48 kHz faststart"}
