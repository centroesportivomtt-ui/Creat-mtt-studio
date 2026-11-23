"""COMP: junta os planos, aplica os FX, põe o overlay do kit por cima e codifica o vídeo final COM o áudio numa passada só
(V2/py/comp.py + pesquisa B: PNG direto no overlay + x264 veryfast, sem intermediário).

Saída: H.264 high yuv420p bt709 (faixa tv), grão leve (evita banding), AAC 48 kHz 256k, faststart — o formato que o QA confere.
"""
from __future__ import annotations

import os
import pathlib
import subprocess
import time

import numpy as np

from motor.etapas import pessoa as PESSOA
from motor.etapas.montagem import fx as FX
from motor.etapas.montagem.comum import quadro


def _cv2():
    import cv2
    cv2.setNumThreads(2)
    return cv2


def leitor(arq: str, W: int, H: int, pular_s: float = 0.0):
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-threads", "2"]
    if pular_s > 0:
        cmd += ["-ss", f"{pular_s:.4f}"]
    cmd += ["-i", arq, "-vf", "scale=in_color_matrix=bt709:in_range=tv,format=bgr24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=W * H * 3 * 2)
    try:
        while True:
            b = p.stdout.read(W * H * 3)
            if len(b) < W * H * 3:
                break
            yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


class Overlay:
    """Lê os PNG do kit uma vez por arquivo (quadros repetidos são links físicos: mesmo inode = mesmo cache)."""

    def __init__(self, d: str | None):
        self.d = d
        self.cache: dict = {}

    def pegar(self, n: int):
        if not self.d:
            return None
        p = os.path.join(self.d, f"quadro_{n:05d}.png")
        try:
            ino = os.stat(p).st_ino
        except FileNotFoundError:
            return None
        if ino in self.cache:
            return self.cache[ino]
        cv2 = _cv2()
        o = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        val = None
        if o is not None:
            if o.ndim == 3 and o.shape[2] == 4:
                a = o[:, :, 3]
                ys = np.where(a.any(1))[0]
                if len(ys):
                    y0, y1 = int(ys[0]), int(ys[-1]) + 1
                    val = ("rgba", y0, y1, o[y0:y1, :, :3].astype(np.uint16), a[y0:y1, :, None].astype(np.uint16))
            else:
                val = ("opaco", o[:, :, :3] if o.ndim == 3 else cv2.cvtColor(o, cv2.COLOR_GRAY2BGR))
        if len(self.cache) > 64:
            self.cache.clear()
        self.cache[ino] = val
        return val

    @staticmethod
    def aplicar(base: np.ndarray, val) -> np.ndarray:
        if val is None:
            return base
        if val[0] == "opaco":
            return val[1].copy()
        _, y0, y1, rgb, al = val
        base[y0:y1] = ((base[y0:y1].astype(np.uint16) * (255 - al) + rgb * al + 127) // 255).astype(np.uint8)
        return base


def desfocar_fundo(img: np.ndarray, a: np.ndarray, forca: float) -> np.ndarray:
    """Fundo desfocado atrás da pessoa (a = máscara 0..1, 1 = pessoa). Convolução NORMALIZADA: o borrão do fundo não puxa a cor
    da pessoa (sem halo em volta do corpo). Calculado em 1/4 da resolução e ampliado (lente aberta é suave; custo baixo)."""
    cv2 = _cv2()
    if forca <= 0:
        return img
    h, w = img.shape[:2]
    pw, ph = max(8, w // 4), max(8, h // 4)
    peq = cv2.resize(img, (pw, ph), interpolation=cv2.INTER_AREA).astype(np.float32)
    fpeq = 1.0 - cv2.resize(a, (pw, ph), interpolation=cv2.INTER_AREA)[:, :, None]
    sig = (1.5 + 6.5 * float(forca)) * pw / 270.0
    num = cv2.GaussianBlur(peq * fpeq, (0, 0), sig)
    den = cv2.GaussianBlur(fpeq, (0, 0), sig)[:, :, None]
    borrado = np.where(den > 1e-3, num / np.maximum(den, 1e-3), peq)
    borrado = cv2.resize(borrado, (w, h), interpolation=cv2.INTER_LINEAR)
    a3 = a[:, :, None]
    return np.clip(img * a3 + borrado * (1 - a3), 0, 255).astype(np.uint8)


def destacar(img: np.ndarray, a: np.ndarray, forca: float) -> np.ndarray:
    """Janela de luz do colorista (power window) na pessoa: o fundo baixa ~1/3 de ponto e perde um pouco de cor, a pessoa sobe
    um pouco. Separa quem fala de uma loja cheia sem parecer recorte (a máscara já é macia na borda). Operações nativas do
    OpenCV em uint8 (~15 ms em 1080x1920)."""
    if forca <= 0:
        return img
    cv2 = _cv2()
    f = float(min(1.0, forca))
    luz, cor = 1.0 - 0.20 * f, 1.0 - 0.22 * f                                # -20% de luz (~1/3 ponto) e -22% de cor no fundo
    cinza = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    fundo = cv2.addWeighted(img, luz * cor, cinza, luz * (1.0 - cor), 0.5)
    pessoa = cv2.convertScaleAbs(img, alpha=1.0 + 0.05 * f, beta=0.5)
    return cv2.blendLinear(pessoa, fundo, a, 1.0 - a)


def suavizar_pele(img: np.ndarray, a: np.ndarray, forca: float) -> np.ndarray:
    """Pele tratada (regra do dono), só na pele DA PESSOA: separação de frequências leve. A textura fina (poro, marquinha)
    perde até 55% da força; olho, boca, cabelo e roupa ficam (não são pele); o fundo nunca é tocado, mesmo que tenha cor de
    pele (embalagem laranja, madeira), porque a máscara de pele é cruzada com a da pessoa. O liso é calculado em meia
    resolução e só na caixa da pele (rosto, colo, braços)."""
    if forca <= 0:
        return img
    cv2 = _cv2()
    from motor.etapas.cor import mascara_pele
    h, w = img.shape[:2]
    meia = (max(2, w // 2), max(2, h // 2))
    img2 = cv2.resize(img, meia, interpolation=cv2.INTER_AREA)
    a2 = cv2.resize(a, meia, interpolation=cv2.INTER_AREA)
    pele2 = (mascara_pele(img2).astype(np.float32) / 255.0) * a2
    ys, xs = np.where(pele2 > 0.5)
    if len(ys) < 50:
        return img
    m = 6
    y0, y1, x0, x1 = max(0, ys.min() - m), min(meia[1], ys.max() + m + 1), max(0, xs.min() - m), min(meia[0], xs.max() + m + 1)
    roi2 = img2[y0:y1, x0:x1]
    base2 = cv2.bilateralFilter(roi2, 0, 18, max(1.0, 1.1 * w / 1080.0))      # o liso preserva a borda (contorno do rosto)
    k2 = cv2.GaussianBlur(pele2[y0:y1, x0:x1], (0, 0), 1.5) * (0.55 * float(min(1.0, forca)))
    Y0, Y1, X0, X1 = y0 * 2, min(h, y1 * 2), x0 * 2, min(w, x1 * 2)
    tam = (X1 - X0, Y1 - Y0)
    base = cv2.resize(base2, tam, interpolation=cv2.INTER_LINEAR)
    k = cv2.resize(k2, tam, interpolation=cv2.INTER_LINEAR)
    roi = img[Y0:Y1, X0:X1]
    img[Y0:Y1, X0:X1] = cv2.blendLinear(base, roi, k, 1.0 - k)
    return img


def texto_atras(img: np.ndarray, val, a: np.ndarray) -> tuple[np.ndarray, float]:
    """Camada do kit ATRÁS da pessoa: fundo + texto, e a pessoa (máscara a) volta por cima. Devolve (quadro, parte do texto que
    a pessoa cobre, 0..1)."""
    if val is None:
        return img, 0.0
    if val[0] == "opaco":
        return Overlay.aplicar(img, val), 0.0
    _, y0, y1, rgb, al = val
    faixa = img[y0:y1]                                    # só a faixa do texto: o resto do quadro não muda
    sob = ((faixa.astype(np.uint16) * (255 - al) + rgb * al + 127) // 255).astype(np.float32)
    a3 = a[y0:y1, :, None]
    img[y0:y1] = (faixa.astype(np.float32) * a3 + sob * (1 - a3) + 0.5).astype(np.uint8)
    return img, cobertura_por_linha(al[:, :, 0].astype(np.float32) / 255.0, a[y0:y1])


def cobertura(val, a: np.ndarray) -> float:
    """Só a medida (sem montar o quadro): parte da linha mais coberta do texto da camada `val` sob a máscara `a`."""
    if val is None or val[0] != "rgba":
        return 0.0
    _, y0, y1, _rgb, al = val
    return cobertura_por_linha(al[:, :, 0].astype(np.float32) / 255.0, a[y0:y1])


def cobertura_por_linha(texto: np.ndarray, a: np.ndarray) -> float:
    """Parte do texto coberta pela pessoa NA LINHA MAIS COBERTA (linhas = faixas de rows com texto, separadas por rows vazias).
    A média do bloco engana: 33% no total era "SOB…TA" na segunda linha (teste real de 20/11, 'NÃO É / SOBRE DIETA')."""
    tem = texto.max(1) > 0.15                         # sombra/brilho de alfa baixo não junta as linhas numa faixa só
    pior, i = 0.0, 0
    while i < len(tem):
        if not tem[i]:
            i += 1
            continue
        j = i
        while j < len(tem) and tem[j]:
            j += 1
        tot = float(texto[i:j].sum())
        if tot > texto.sum() * 0.05:                 # ignora risco fino (sublinhado, sombra solta)
            pior = max(pior, float((texto[i:j] * a[i:j]).sum()) / tot)
        i = j
    return pior


OCULTO_MAX = 0.30          # a pessoa pode cobrir até 30% da linha mais coberta do texto de trás (p90 da janela)
DESLOCA = (0.0, -0.08, -0.16, 0.08, -0.24)   # posições testadas para o texto de trás (fração da altura), na ordem de preferência
ZONA = (0.06, 0.78)        # o texto deslocado não sai da zona segura vertical do Reels


def deslocar(val, dy: int, H: int):
    """Camada RGBA do kit deslocada dy px na vertical (cortada nas bordas)."""
    if val is None or val[0] != "rgba" or dy == 0:
        return val
    _, y0, y1, rgb, al = val
    a, b = y0 + dy, y1 + dy
    c0, c1 = max(0, -a), (y1 - y0) - max(0, b - H)
    if c1 <= c0:
        return None
    return ("rgba", max(0, a), min(H, b), rgb[c0:c1], al[c0:c1])


def janelas(ks: list[int]) -> list[tuple[int, int]]:
    """Quadros seguidos viram janelas [a, b)."""
    out = []
    for k in sorted(ks):
        if out and k == out[-1][1]:
            out[-1] = (out[-1][0], k + 1)
        else:
            out.append((k, k + 1))
    return out


def escolher_posicao(cobertura: dict[float, list[float]], vazio: bool) -> tuple[float | None, str]:
    """Função pura: cobertura[desloc] = parte do texto coberta pela pessoa, por quadro. Devolve (deslocamento, motivo); None =
    texto vai para a FRENTE (nenhuma posição se lê). Prefere a posição original; entre as legíveis, a que tem a pessoa
    passando na frente de verdade (>= 5% coberto), senão a original."""
    if vazio:
        return 0.0, "sem pessoa na janela: texto normal"
    p90 = {d: float(np.percentile(v, 90)) if v else 0.0 for d, v in cobertura.items()}
    legiveis = [d for d in DESLOCA if d in p90 and p90[d] <= OCULTO_MAX]
    if not legiveis:
        return None, f"a pessoa cobriria {min(p90.values()):.0%} do texto em qualquer posição: texto na frente"
    com_efeito = [d for d in legiveis if p90[d] >= 0.05]
    d = (com_efeito or legiveis)[0]
    return d, f"atrás da pessoa, {p90[d]:.0%} coberto" + (f", deslocado {d:+.0%} da altura" if d else "")


def compor(edl: dict, planos_res: dict, dir_overlay: str | None, mix_wav: str | None, saida: pathlib.Path, *,
           janela: tuple[float, float] | None = None, crf: int | None = None, threads: int = 3, nice: int = 5, progresso=None,
           dir_overlay_atras: str | None = None, recortador=None) -> dict:
    """`dir_overlay_atras`: camadas que vão ATRÁS da pessoa; `recortador` (motor.etapas.pessoa) dá a máscara de pessoa por
    quadro. Sem recortador (ou sem modelo), as camadas de trás entram por cima como as outras e o fundo não é desfocado:
    o filme sai igual ao de antes, nunca com texto sumido."""
    fmt = edl.get("formato", {})
    W, H, FPS = int(fmt.get("w", 1080)), int(fmt.get("h", 1920)), float(fmt.get("fps", 30))
    NF = quadro(edl["duracao"], FPS)
    fa, fb = (quadro(janela[0], FPS), min(NF, quadro(janela[1], FPS))) if janela else (0, NF)
    crf = int(crf if crf is not None else (edl.get("master") or {}).get("crf", 17))
    planos = sorted(edl["planos"], key=lambda p: p["t0"])
    efeitos = FX.preparar(list(edl.get("fx", []) or []), planos)
    saltos = [e for e in efeitos if e["tipo"] == "salto"]
    um_cache: dict = {}

    def um_quadro(i: int, ultimo: bool):
        """Primeiro (ou último) quadro do plano i, lido sob demanda e guardado: o salto mostra o vizinho na emenda."""
        if not 0 <= i < len(planos):
            return None
        if (i, ultimo) not in um_cache:
            pl = planos[i]
            arq = planos_res.get(pl["id"], {}).get("arquivo")
            fr = None
            if arq and os.path.exists(arq):
                n = quadro(pl["t1"], FPS) - quadro(pl["t0"], FPS)
                rd = leitor(arq, W, H, max(0, n - 3) / FPS if ultimo else 0.0)
                for q in rd:
                    fr = q
                    if not ultimo:
                        break
                rd.close()
            um_cache[(i, ultimo)] = fr
        return um_cache[(i, ultimo)]

    def vizinhos(tt: float, i: int, anterior):
        """Só quando um salto está no ar: o anterior é o último quadro já visto (ou lido do plano i-1); o seguinte, o 1o de i+1."""
        if not saltos or not FX.ativos(saltos, tt):
            return None
        return {"anterior": (lambda: anterior) if anterior is not None else (lambda: um_quadro(i - 1, True)),
                "seguinte": lambda: um_quadro(i + 1, False)}
    saida.parent.mkdir(parents=True, exist_ok=True)
    tmp = saida.with_name(saida.stem + ".tmp.mp4")
    cmd = (["nice", "-n", str(nice)] if nice else []) + ["ffmpeg", "-nostdin", "-v", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if mix_wav:
        cmd += ["-ss", f"{fa / FPS:.4f}", "-i", mix_wav, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-ar", "48000"]
    cmd += ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,noise=c0s=2:c0f=t+u", "-c:v", "libx264",
            "-preset", "veryfast", "-crf", str(crf), "-profile:v", "high", "-x264-params", "aq-mode=3", "-threads", str(threads),
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
            "-t", f"{(fb - fa) / FPS:.4f}", "-movflags", "+faststart", str(tmp)]
    ov = Overlay(dir_overlay)
    ov_atras = Overlay(dir_overlay_atras)
    rec = recortador if (recortador is not None and getattr(recortador, "disponivel", False)) else None
    pessoa = {"quadros_mascara": 0, "atras_quadros": 0, "atras_oculto_max": 0.0, "atras_oculto_medio": 0.0, "desfoque_quadros": 0, "destaque_quadros": 0, "pele_quadros": 0,
              "ms_mascara": 0.0, "sem_modelo": bool(dir_overlay_atras or any((p.get("fundo") or {}).get("desfoque") or (p.get("fundo") or {}).get("destaque")
                                                     for p in edl["planos"]))
              and rec is None,
              "pele_sem_modelo": rec is None and any((p.get("pessoa") or {}).get("pele") for p in edl["planos"])}   # automática: só registra
    oculto_soma = 0.0
    t_masc = 0.0

    # passada prévia: em cada janela do texto de trás, mede quanto a pessoa cobre o texto em cada posição e escolhe a posição
    plano_de = {}
    for i, p in enumerate(planos):
        for k in range(quadro(p["t0"], FPS), quadro(p["t1"], FPS)):
            plano_de.setdefault(k, i)
    posicao: dict[int, float | None] = {}
    guardadas: dict[int, np.ndarray] = {}
    estado_fim: dict[int, tuple[int, list]] = {}
    pessoa["janelas_atras"] = []
    if rec is not None and dir_overlay_atras:
        ks = [k for k in range(fa, fb) if k in plano_de and ov_atras.pegar(k) is not None]
        for a0, b0 in janelas(ks):
            cob: dict[float, list[float]] = {}
            fora_da_zona: set[float] = set()
            pessoa_vista = False
            i_atual, rd = None, None
            for k in range(a0, b0):
                i = plano_de[k]
                if i != i_atual:
                    if rd is not None and hasattr(rd, "close"):
                        rd.close()
                    pl = planos[i]
                    arq = planos_res.get(pl["id"], {}).get("arquivo")
                    rd = leitor(arq, W, H, max(0, k - quadro(pl["t0"], FPS)) / FPS) if arq and os.path.exists(arq) else iter(())
                    rec.novo_plano()
                    i_atual = i
                fr = next(rd, None)
                if fr is None:
                    continue
                tm = time.time()
                pq = rec.alfa_pequena(fr) if hasattr(rec, "alfa_pequena") else None
                a = PESSOA.ampliar(pq, W, H) if pq is not None else rec.alfa(fr)
                if pq is not None:
                    guardadas[k] = pq                        # a composição reaproveita (não roda o modelo duas vezes)
                t_masc += time.time() - tm
                pessoa["quadros_mascara"] += 1
                pessoa_vista = pessoa_vista or float(a.mean()) > 0.02
                val = ov_atras.pegar(k)
                for d in DESLOCA:
                    v = deslocar(val, int(round(d * H)), H)
                    if d != 0.0 and (v is None or (v[0] == "rgba" and (v[1] < ZONA[0] * H or v[2] > ZONA[1] * H))):
                        fora_da_zona.add(d)                  # um quadro fora da zona segura já tira a posição inteira
                        continue
                    cob.setdefault(d, []).append(cobertura(v, a))
            if rd is not None and hasattr(rd, "close"):
                rd.close()
            if i_atual is not None and hasattr(rec, "_estado"):
                estado_fim[b0] = (i_atual, list(rec._estado))   # a composição continua a memória do modelo depois da janela
            d, motivo = escolher_posicao({x: v for x, v in cob.items() if x not in fora_da_zona}, not pessoa_vista)
            if d is None:                                    # texto foi para a frente: só fica a máscara de quem vai desfocar
                for k in range(a0, b0):
                    if not PESSOA.usa_mascara(planos[plano_de[k]]):
                        guardadas.pop(k, None)
            for k in range(a0, b0):
                posicao[k] = d
            pessoa["janelas_atras"].append({"de": round(a0 / FPS, 2), "ate": round(b0 / FPS, 2), "deslocamento": d, "decisao": motivo})

    def frente(img, k):
        """Quadro sem plano por baixo (buraco/fecho): a camada de trás entra por cima, sem máscara."""
        return Overlay.aplicar(Overlay.aplicar(img, ov_atras.pegar(k)), ov.pegar(k))
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)   # depois da passada prévia: erro nela não deixa o ffmpeg pendurado
    preto = np.zeros((H, W, 3), np.uint8)
    t0 = time.time()
    ult = None
    hist: list = []
    escritos = 0
    buracos = 0
    k = fa
    for i, p in enumerate(planos):
        p0, p1 = quadro(p["t0"], FPS), quadro(p["t1"], FPS)
        if p1 <= fa or p0 >= fb:
            continue
        while k < min(p0, fb):                               # buraco entre planos: segura o último quadro
            img = (ult if ult is not None else preto).copy()
            img = frente(FX.aplicar(img, k / FPS, efeitos, hist, vizinhos(k / FPS, i - 1, ult)), k)
            enc.stdin.write(img.tobytes())
            k += 1
            escritos += 1
            buracos += 1
        arq = planos_res.get(p["id"], {}).get("arquivo")
        rd = leitor(arq, W, H, max(0, k - p0) / FPS) if arq and os.path.exists(arq) else iter(())
        anterior = ult                                       # último quadro do plano anterior (o salto mostra na emenda)
        desf = float((p.get("fundo") or {}).get("desfoque") or 0.0)
        dest = float((p.get("fundo") or {}).get("destaque") or 0.0)
        pele = float((p.get("pessoa") or {}).get("pele") or 0.0)
        if rec is not None:
            rec.novo_plano()                                 # a máscara tem memória entre quadros: zera no corte
        while k < min(p1, fb):
            fr = next(rd, None)
            if fr is None:
                fr = ult if ult is not None else preto
            ult = fr
            img = fr.copy()
            atras_val = ov_atras.pegar(k)
            d_at = posicao.get(k, 0.0)
            if atras_val is not None and d_at is None:     # nenhuma posição legível: o texto entra na frente
                atras_val, atras_frente = None, atras_val
            else:
                atras_frente = None
                atras_val = deslocar(atras_val, int(round((d_at or 0.0) * H)), H)
            if rec is not None and (desf > 0 or dest > 0 or pele > 0 or atras_val is not None):
                tm = time.time()
                if k in estado_fim and estado_fim[k][0] == i:   # saiu da janela guardada: o modelo segue quente, sem pulo
                    rec._estado = estado_fim.pop(k)[1]
                pq = guardadas.pop(k, None)
                if pq is not None:
                    a = PESSOA.ampliar(pq, W, H)
                else:
                    a = rec.alfa(fr)
                    pessoa["quadros_mascara"] += 1
                t_masc += time.time() - tm
                if pele > 0:
                    img = suavizar_pele(img, a, pele)
                    pessoa["pele_quadros"] += 1
                if dest > 0:
                    img = destacar(img, a, dest)
                    pessoa["destaque_quadros"] += 1
                if desf > 0:
                    img = desfocar_fundo(img, a, desf)
                    pessoa["desfoque_quadros"] += 1
                if atras_val is not None:
                    img, oc = texto_atras(img, atras_val, a)
                    pessoa["atras_quadros"] += 1
                    oculto_soma += oc
                    pessoa["atras_oculto_max"] = max(pessoa["atras_oculto_max"], round(oc, 3))
            elif atras_val is not None:                     # sem modelo: por cima e depois do FX, exatamente como antes
                atras_frente = atras_val
            if efeitos:
                img = FX.aplicar(img, k / FPS, efeitos, hist, vizinhos(k / FPS, i, anterior))
                hist.append(fr)
                if len(hist) > 4:
                    hist.pop(0)
            if atras_frente is not None:
                img = Overlay.aplicar(img, atras_frente)
            img = Overlay.aplicar(img, ov.pegar(k))
            enc.stdin.write(img.tobytes())
            k += 1
            escritos += 1
            if progresso and escritos % 60 == 0:
                progresso(escritos / max(1, fb - fa), f"Composição: {escritos}/{fb - fa} quadros")
        if hasattr(rd, "close"):
            rd.close()
    while k < fb:                                            # depois do último plano (fecho cheio do kit)
        img = (ult if ult is not None else preto).copy()
        img = frente(FX.aplicar(img, k / FPS, efeitos, hist, vizinhos(k / FPS, len(planos) - 1, ult)), k)
        enc.stdin.write(img.tobytes())
        k += 1
        escritos += 1
        buracos += 1
    enc.stdin.close()
    err = enc.stderr.read().decode(errors="replace")
    if enc.wait() != 0:
        raise RuntimeError(f"composição falhou: {err[-800:]}")
    os.replace(tmp, saida)
    dt = time.time() - t0
    if pessoa["atras_quadros"]:
        pessoa["atras_oculto_medio"] = round(oculto_soma / pessoa["atras_quadros"], 3)
    pessoa["ms_mascara"] = round(t_masc * 1000 / max(1, pessoa["quadros_mascara"]), 1)
    return {"final": str(saida), "quadros": escritos, "quadros_sem_plano": buracos, "s": round(dt, 1), "pessoa": pessoa,
            "ms_quadro": round(dt * 1000 / max(1, escritos), 1), "janela": [fa / FPS, fb / FPS]}
