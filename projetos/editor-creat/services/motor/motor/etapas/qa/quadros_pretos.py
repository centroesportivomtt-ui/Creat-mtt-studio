"""quadros_pretos: nenhum trecho preto (>= 3 quadros) fora dos pretos intencionais do EDL (fade, íris da aba71)."""
import re
import subprocess

ID, BLOQUEIA = "quadros_pretos", True


def checar(c):
    from motor.etapas.montagem.fx import janelas_escuras
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "info", "-i", str(c.final), "-an", "-vf",
                        f"blackdetect=d={3 / c.FPS:.3f}:pix_th=0.06:pic_th=0.97", "-f", "null", "-"], capture_output=True, text=True)
    pretos = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", r.stderr)]
    ok_jan = janelas_escuras(c.edl.get("fx", []) or [])
    ruins = [(a, b) for a, b in pretos if not any(a >= x - 0.05 and b <= y + 0.05 for x, y in ok_jan)]
    evid = []
    for i, (a, b) in enumerate(ruins[:3]):
        q = c.quadro((a + b) / 2)
        if q is not None:
            evid.append(c.salvar_quadro(q, f"preto_{i}.jpg"))
    return {"ok": not ruins, "valor": [[round(a, 2), round(b, 2)] for a, b in ruins],
            "detalhe": (f"{len(ruins)} trecho(s) preto(s): " + ", ".join(f"{a:.2f}-{b:.2f} s" for a, b in ruins[:5])) if ruins else "nenhum quadro preto",
            "evidencia": evid}
