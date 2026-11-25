"""Resolvedor (frente B): direção (ids do catálogo) -> EDL de montagem (edl.schema.json). Sem LLM, determinístico.

ARQUITETURA.md §4.4. Reaproveita as regras do V2 de 17/11 (edl_fala.py / voz_build.py): folga na entrada e na saída,
aperto de pausas acima de ~0,28 s mantendo 0,10 s de cada lado, encaixe por energia quando a série existe,
fala em vel_fala (atempo), blocos começando na batida da trilha, legenda só com palavra dita e confirmada.
"""
from __future__ import annotations

import difflib
import hashlib
import json
import math
import re

from motor import movimento as MV
from motor import musica as MU
from motor.etapas import cor as COR
from motor.etapas import sem_fala as SF
from motor.etapas import sons_reais as SONS
from motor.etapas.catalogo import EQUIPE, norm, tokens

LETRA = "a-zà-öø-ÿ"


Y_ATRAS = 0.30          # título atrás da pessoa começa mais alto (a cabeça passa na frente da parte de baixo das letras)
DESFOQUE_FUNDO = 0.7    # "fundo_desfocado" do bloco: lente bem aberta, sem virar borrão de vidro
DESTAQUE_PESSOA = 0.6   # "destaque_pessoa" do bloco: fundo ~1/5 de ponto mais escuro e com menos cor
PELE_TRATADA = 0.5      # regra do dono ("pele tratada"): sempre nos planos de fala, sutil (textura fina -27%)
LENTO_FOLGA = 0.95      # câmera lenta verdadeira: fps_fonte * vel >= fps_saída * 0,95 (59,94 fps faz 0,5x em 30; 120 faz 0,25x)


def vel_minima(fps_fonte: float | None, fps_saida: float) -> float:
    """Menor velocidade sem quadro inventado (pedido do dono: câmera lenta só de verdade). Abaixo disso cada quadro da
    fonte se repete ou vira mistura de dois e a imagem "engasga". Fonte sem fps conhecido não tem lenta (1,0)."""
    if not fps_fonte or fps_fonte <= 0:
        return 1.0
    return round(min(1.0, fps_saida * LENTO_FOLGA / float(fps_fonte)), 4)


def _br(x: float, casas: int = 2) -> str:
    """Número com vírgula para os avisos que o dono lê."""
    return f"{x:.{casas}f}".replace(".", ",")


class ErroResolucao(Exception):
    """A direção cita algo que não existe ou não foi encontrado na transcrição. .problemas vai para o cérebro corrigir."""

    def __init__(self, problemas: list[str]):
        super().__init__("; ".join(problemas[:8]))
        self.problemas = problemas


# ---------------- palavras ----------------
def palavras_do_arquivo(analise: dict) -> list[list]:
    out = []
    for s in analise["transcricao"]["segmentos"]:
        pal = s.get("palavras") or []
        if not pal and s.get("texto"):
            ws = s["texto"].split()
            passo = (s["e"] - s["s"]) / max(1, len(ws))
            pal = [[s["s"] + i * passo, s["s"] + (i + 1) * passo, w, s.get("conf") or 0.6] for i, w in enumerate(ws)]
        for p in pal:
            txt = str(p[2]).strip()
            if not txt:
                continue
            if out and txt[0] in ".@" and not str(p[2]).startswith(" "):      # 'CREIT' + '.MTT' = uma palavra só
                out[-1] = [out[-1][0], float(p[1]), out[-1][2] + txt, min(out[-1][3], float(p[3]))]
            else:
                out.append([float(p[0]), float(p[1]), txt, float(p[3])])
    out.sort(key=lambda p: p[0])
    return out


def _tokens_com_indice(pal: list[list], i0: int, i1: int):
    toks, idx = [], []
    for i in range(i0, i1):
        for t in tokens(pal[i][2]):
            toks.append(t)
            idx.append(i)
    return toks, idx


def _melhor(toks: list[str], alvo: list[str], ini: int = 0, fim_ref: bool = False):
    """Janela de toks mais parecida com alvo. Devolve (posição inicial, razão). Empate: a mais cedo."""
    n = len(alvo)
    if n == 0 or len(toks) < 1:
        return None, 0.0
    alvo_s = " ".join(alvo)
    melhor, razao = None, 0.0
    for j in range(ini, max(ini + 1, len(toks) - n + 1)):
        for m in {n - 1, n, n + 1}:
            if m <= 0 or j + m > len(toks):
                continue
            r = difflib.SequenceMatcher(None, " ".join(toks[j:j + m]), alvo_s).ratio()
            if r > razao + 1e-9:
                melhor, razao = (j, m), r
    return melhor, razao


# ---------------- correções ----------------
def aplicar_vocabulario(texto: str, vocabulario: list[dict]) -> str:
    for v in vocabulario:
        texto = re.sub(rf"(?<![{LETRA}]){re.escape(v['de'])}(?![{LETRA}])", v["para"], texto, flags=re.I)
    return texto


def aplicar_corrigir(pal: list[list], pares: list[dict]) -> list[list]:
    """pal = [[s, e, texto, conf], ...] (cópia). Substitui sequências inteiras de palavras; corrigido vale conf 1."""
    pal = [list(p) for p in pal]
    for par in pares or []:
        de, para = tokens(par["de"]), par["para"].split()
        if not de or not para:
            continue
        i = 0
        while i <= len(pal) - len(de):
            if [norm(pal[i + k][2]).replace(" ", "") for k in range(len(de))] == [d for d in de]:
                s, e = pal[i][0], pal[i + len(de) - 1][1]
                passo = (e - s) / len(para)
                novas = [[s + k * passo, s + (k + 1) * passo, w, 1.0] for k, w in enumerate(para)]
                pal[i:i + len(de)] = novas
                i += len(para)
            else:
                i += 1
    return pal


def _limpa(w: str) -> str:
    return re.sub(rf"^[^{LETRA}0-9@#]+|[^{LETRA}0-9]+$", "", w, flags=re.I)


# ---------------- resolvedor ----------------
def _silabas_db(serie, passo: float) -> float:
    """Desvio (dB) do envelope menos a média móvel de 0,5 s, sem os buracos da série (-90). Fala: >= 4-5 dB; ar-condicionado,
    freezer e música de fundo estável: ~1-2 dB."""
    import numpy as np
    x = np.asarray(serie, dtype=float)
    x = x[x > -89]
    k = max(3, int(round(0.5 / max(passo, 1e-3))))
    if len(x) < 2 * k:
        return 0.0
    media = np.convolve(x, np.ones(k) / k, mode="valid")
    return float(np.std(x[k // 2:k // 2 + len(media)] - media))


class Resolvedor:
    def __init__(self, direcao: dict, catalogo: dict, analises: dict, modelo: dict, trilhas: list[dict] | None = None,
                 vocabulario: list[dict] | None = None, energias: dict | None = None, projeto: str | None = None,
                 ambiente: str | None = None, vozes: str | None = None, movimentos: dict | None = None):
        self.d, self.cat, self.an, self.m = direcao, catalogo, analises, modelo
        self.mov = movimentos or {}                         # arquivo -> série de motor/movimento.py (opcional)
        self.formato = {"w": 1080, "h": 1920, "fps": 30}
        self._amp: dict[str, float] = {}                    # clipe -> maior ampliação usada (aviso no fim)
        self._mom_usados = {cb["m"] for b in direcao.get("blocos", []) for cb in b.get("cobertura", [])}
        self.vozes = vozes if vozes in ("uma", "varias") else None
        self.ambiente = ambiente if ambiente in COR.LOOKS else None      # pedido do dono (ex.: academia) vence a medição
        self.trilhas = trilhas or []
        self.voc = vocabulario or []
        self.energias = energias or {}
        self.projeto = projeto or catalogo.get("projeto", "p")
        self.clipe = {c["id"]: c for c in catalogo["clipes"]}
        self.fala = {f["id"]: (c, f) for c in catalogo["clipes"] for f in c["falas"]}
        self.mom = {m["id"]: (c, m) for c in catalogo["clipes"] for m in c["momentos"]}
        self._pal = {}
        self.problemas: list[str] = []
        self.avisos: list[str] = []
        self._usadas_por: dict[str, str] = {}             # repetição -> id do ditado que o diretor escolheu
        self.r = modelo["ritmo"]

    def pal(self, cid: str) -> list[list]:
        if cid not in self._pal:
            self._pal[cid] = palavras_do_arquivo(self.an[self.clipe[cid]["arquivo"]])
        return self._pal[cid]

    # --- fala -> trechos da fonte
    def resolver_fala(self, fd: dict) -> dict | None:
        if fd["id"] not in self.fala:
            self.problemas.append(f"fala {fd['id']} não existe no catálogo")
            return None
        dit = self.fala[fd["id"]][1].get("ditado")
        if dit and dit in self.fala:
            # item 4 (defeito da cerveja, 20/11): a fala escolhida é a equipe DITANDO; entra a repetição de quem fala no vídeo
            self.avisos.append(f"fala {fd['id']} é ditado da equipe: troquei pela repetição da voz principal ({dit})")
            n = len(self.problemas)
            r = self._resolver_fala({**fd, "id": dit})
            if r is None:                                   # as palavras pedidas não batem com a repetição: usa a repetição inteira
                r = self._resolver_fala({**fd, "id": dit, "de": None, "ate": None})
                if r is not None:
                    del self.problemas[n:]                  # a 1a tentativa falhou, mas a repetição entrou: não é problema
                    self.avisos.append(f"fala {dit} entrou inteira: o trecho pedido do ditado não bate palavra a palavra com a repetição")
            if r is None:
                del self.problemas[n:]
                self.problemas.append(f"fala {fd['id']} é ditado da equipe e a repetição {dit} não foi achada: o ditado não entra")
            else:
                r["fala_usada"] = dit
                self._usadas_por[dit] = fd["id"]
            return r
        return self._resolver_fala(fd)

    def _resolver_fala(self, fd: dict) -> dict | None:
        c, f = self.fala[fd["id"]]
        pal = self.pal(c["id"])
        i0 = next((i for i, p in enumerate(pal) if p[1] > f["t0"] - 0.3), len(pal))
        i1 = next((i for i, p in enumerate(pal) if p[0] > f["t1"] + 0.3), len(pal))
        i_ext = next((i for i, p in enumerate(pal) if p[0] > f["t1"] + 20), len(pal))
        if i1 <= i0:
            self.problemas.append(f"fala {fd['id']} sem palavras na transcrição")
            return None
        toks, idx = _tokens_com_indice(pal, i0, i_ext)
        n_fala = sum(1 for i in idx if i < i1)
        ws, we = i0, i1 - 1
        if fd.get("de"):
            pos, r = _melhor(toks[:n_fala], tokens(fd["de"]))
            if pos is None or r < 0.6:
                self.problemas.append(f"fala {fd['id']}: início «{fd['de']}» não encontrado (melhor {r:.2f})")
                return None
            ws = idx[pos[0]]
            ini_tok = pos[0]
        else:
            ini_tok = 0
        if fd.get("ate"):
            alvo = tokens(fd["ate"])
            pos, r = _melhor(toks, alvo, ini=ini_tok)
            if pos is None or r < 0.6:
                self.problemas.append(f"fala {fd['id']}: fim «{fd['ate']}» não encontrado (melhor {r:.2f})")
                return None
            we = idx[pos[0] + pos[1] - 1]
        if we < ws:
            self.problemas.append(f"fala {fd['id']}: fim antes do início")
            return None
        folga_in, folga_out = self.r.get("folga_in", 0.06), self.r.get("folga_out", 0.09)
        s0 = pal[ws][0] - folga_in
        if ws > 0:
            s0 = max(s0, pal[ws - 1][1] + 0.02)
        s1 = pal[we][1] + folga_out
        if we + 1 < len(pal):
            s1 = min(s1, pal[we + 1][0] - 0.02)
        s0, s1 = self._energia(c["arquivo"], s0, s1, pal[ws][0], pal[we][1])
        s1 = self._cauda(c["arquivo"], s1, pal[ws][0], pal[we][1], pal[we + 1][0] - 0.01 if we + 1 < len(pal) else None)
        palavras = aplicar_corrigir(pal[ws:we + 1], fd.get("corrigir") or [])
        # aperto de pausas: corta silêncio interno acima de pausa_max, deixando 0,10 s de cada lado
        gmax, manter = self.r.get("pausa_max", 0.28), 0.10
        pecas, a = [], s0
        for k in range(len(palavras) - 1):
            g0, g1 = palavras[k][1], palavras[k + 1][0]
            if g1 - g0 > gmax and (g1 - g0 - 2 * manter) >= 0.10:
                # o corte de pausa também não come a última sílaba: anda até a voz morrer, sem encostar na retomada
                fim = min(self._cauda(c["arquivo"], g0 + manter, pal[ws][0], g0, g1 - 0.01), g1 - manter - 0.02)
                pecas.append((a, max(fim, g0 + manter)))
                a = g1 - manter
        pecas.append((a, s1))
        return {"clipe": c["id"], "fala": f, "s0": s0, "s1": s1, "pecas": pecas, "palavras": palavras}

    def _energia(self, aid, s0, s1, w0, w1):
        serie = self.energias.get(aid)
        if serie is None:
            return s0, s1
        passo = self.energias.get("_passo", {}).get(aid, 0.02)
        try:
            a, b = int((s0 - 0.12) / passo), int(w0 / passo)
            if b > a > 0:
                j = a + int(min(range(b - a), key=lambda k: serie[a + k]))
                s0 = max(s0 - 0.12, min(s0, j * passo))
            a, b = int(w1 / passo), int((s1 + 0.15) / passo)
            if b > a and b < len(serie):
                j = a + int(min(range(b - a), key=lambda k: serie[a + k]))
                s1 = min(s1 + 0.15, max(s1, j * passo))
        except (IndexError, ValueError):
            pass
        return s0, s1

    def _cauda(self, aid, s1, w0, w1, teto):
        """Nunca cortar a última sílaba (regra do dono, 19/11): o fim da palavra na transcrição costuma vir antes do fim
        do som. Se a voz ainda está ativa em s1, o corte anda até ela morrer (no máximo +0,40 s e nunca além do começo
        da palavra seguinte)."""
        serie = self.energias.get(aid)
        if serie is None:
            return s1
        passo = self.energias.get("_passo", {}).get(aid, 0.02)
        try:
            a, b = max(0, int(w0 / passo)), int(w1 / passo) + 1
            if b - a < 3:
                return s1
            ref = sorted(float(v) for v in serie[a:b])[int(0.9 * (b - a - 1))]
            i = int(round(s1 / passo))
            if i >= len(serie) or float(serie[i]) <= ref - 14.0:
                return s1
            fim = min(len(serie) - 1, i + int(0.40 / passo))
            for j in range(i, fim):
                if float(serie[j]) < ref - 24.0 and float(serie[j + 1]) < ref - 24.0:
                    novo = j * passo + 0.02
                    return round(min(novo, teto), 4) if teto is not None else round(novo, 4)
        except (IndexError, ValueError):
            pass
        return s1

    # --- fontes (trechos do original)
    def fonte_de(self, cid: str, s: float) -> str:
        trechos = self.an[self.clipe[cid]["arquivo"]]["derivados"].get("trechos") or []
        if len(trechos) <= 1:
            return cid
        for k, t in enumerate(trechos):
            if t["ini"] - 0.05 <= s and (t.get("fim") is None or s <= t["fim"]):
                return f"{cid}_{k}"
        self.avisos.append(f"{cid} @ {s:.1f} s fora dos trechos disponíveis")
        return f"{cid}_0"

    def _fontes(self, usadas: set[str]) -> dict:
        out = {}
        for fid in sorted(usadas):
            cid, _, k = fid.partition("_")
            a = self.an[self.clipe[cid]["arquivo"]]
            trechos = a["derivados"].get("trechos") or []
            if trechos:
                t = trechos[int(k or 0)]
                out[fid] = {"chave": t["chave"], "audio": None, "offset": float(t["ini"]), "rotacao": 0, "fps": a["midia"].get("fps")}
            else:
                out[fid] = {"chave": a["arquivo"]["chave"], "audio": a["derivados"].get("audio_wav"), "offset": 0.0, "rotacao": 0,
                            "fps": a["midia"].get("fps")}
        return out

    # --- grade da trilha
    def _trilha(self):
        dt = self.d.get("trilha") or {}
        tid = dt.get("id") or (dt.get("ids") or [None])[0]
        t = next((x for x in self.trilhas if x["id"] == tid), None) or (self.trilhas[0] if self.trilhas else None)
        if tid and (t is None or t["id"] != tid):
            self.avisos.append(f"trilha {tid} não está na biblioteca; usando {t['id'] if t else 'nenhuma'}")
        return t

    def _na_batida(self, t: float, trilha) -> float:
        if not trilha or not self.r.get("corte_na_batida", True) or not trilha.get("bpm"):
            return t
        batida = 60.0 / trilha["bpm"]
        fase = trilha.get("fase", 0.0)
        return round(fase + math.ceil((t - fase - 1e-6) / batida) * batida, 4)

    # --- linha do tempo
    def _layout(self, vel: float, resolvidas: dict, trilha) -> dict:
        t = self.r.get("t0", 0.2)
        blocos, voz, cobs = [], [], []
        janelas_fala = {}
        cob_padrao = self.m.get("cobertura", {}).get("dur_padrao", 2.0)
        for bi, b in enumerate(self.d["blocos"]):
            if bi > 0:
                t = self._na_batida(t, trilha)
            b0 = t
            for kf, fd in enumerate(b["falas"]):
                rf = resolvidas.get((b["id"], kf))
                if not rf:
                    continue
                f0 = t
                for k, (s0, s1) in enumerate(rf["pecas"]):
                    t1 = t + (s1 - s0) / vel
                    voz.append({"id": f"{b['id']}.{kf}.{k}", "bloco": b["id"], "fala": fd["id"], "chave": (b["id"], kf), "fonte": self.fonte_de(rf["clipe"], s0),
                                "clipe": rf["clipe"], "s0": round(s0, 4), "s1": round(s1, 4), "t0": round(t, 4), "t1": round(t1, 4), "vel": vel,
                                "imagem": fd.get("imagem", "misto")})
                    t = t1
                janelas_fala.setdefault(fd["id"], (f0, t, fd.get("imagem", "misto"), b))
                if rf.get("fala_usada"):                    # cobertura/chip que citam a repetição também acham a janela
                    janelas_fala.setdefault(rf["fala_usada"], janelas_fala[fd["id"]])
                t += self.r.get("gap_fala", 0.1)
            for cb in b["cobertura"]:
                if cb.get("sobre") in janelas_fala:
                    cobs.append((cb, b, None))
                else:
                    d = cb.get("dur") or cob_padrao
                    cobs.append((cb, b, (t, t + d)))
                    t += d
            if not b["falas"] and not b["cobertura"]:
                t += cob_padrao
            t += self.r.get("gap_bloco", 0.22)
            blocos.append({"id": b["id"], "funcao": b["funcao"], "intensidade": b["intensidade"], "t0": round(b0, 4), "t1": round(t, 4)})
        fecho_t = t
        dur = round(fecho_t + self.m["fecho"]["dur"], 4)
        return {"blocos": blocos, "voz": voz, "cobs": cobs, "janelas": janelas_fala, "fecho_t": fecho_t, "duracao": dur}

    # --- principal
    def resolver(self) -> dict:
        if SF.ativo(self.d):                                # filme sem fala (M3): a trilha é a espinha, não a voz
            return self._emendar_musicas(SF.resolver(self))
        return self._emendar_musicas(self._resolver_com_fala())

    def _resolver_com_fala(self) -> dict:
        d = self.d
        resolvidas = {}
        for b in d["blocos"]:
            for k, fd in enumerate(b["falas"]):
                rf = self.resolver_fala(fd)
                if rf:
                    resolvidas[(b["id"], k)] = rf
            for cb in b["cobertura"]:
                if cb["m"] not in self.mom:
                    self.problemas.append(f"momento {cb['m']} não existe no catálogo")
        if self.problemas:
            raise ErroResolucao(self.problemas)
        trilha = self._trilha()
        vel = float(d.get("vel_fala") or 1.1)
        L = self._layout(vel, resolvidas, trilha)
        alvo = float(d["duracao_alvo"])
        if L["duracao"] > alvo * 1.10 and vel < 1.2:      # passou de +10% do alvo: acelera a fala (até 1,2x) mirando +5%
            fixo = L["duracao"] - sum(v["t1"] - v["t0"] for v in L["voz"])
            fala_1 = sum(v["t1"] - v["t0"] for v in L["voz"]) * vel
            vel2 = min(1.2, max(vel, fala_1 / max(1.0, alvo * 1.05 - fixo)))
            if vel2 > vel + 0.005:
                self.avisos.append(f"fala acelerada de {vel:.2f}x para {vel2:.2f}x para caber no alvo de {alvo:.0f} s")
                vel = round(vel2, 3)
                L = self._layout(vel, resolvidas, trilha)
        if abs(L["duracao"] - alvo) > 0.1 * alvo:
            self.avisos.append(f"duração {L['duracao']:.1f} s fora de ±10% do alvo {alvo:.0f} s")
        planos = self._planos(L)
        sons = SONS.resolver_seguro(self, L, planos)              # som real pedido pela direção (M6); sem pedido: None, EDL igual
        motion, fx, sfx = self._motion(L)
        self._casar_transicoes(planos, fx, sfx)
        ampliados = getattr(self, "_ampliados", {})
        legendas = self._legendas(L, resolvidas)
        usadas = {v["fonte"] for v in L["voz"]} | {p["fonte"] for p in planos}
        tom = self._tom_sala(L)
        if tom:
            usadas.add(tom["fonte"])
        edl = {
            "versao": "1", "projeto": self.projeto,
            "origem": {"direcao": hashlib.sha256(json.dumps(d, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16],
                       "catalogo": self.cat.get("projeto"), "modelo": self.m["id"], "vel_aplicada": vel, "avisos": self.avisos,
                       "conceito": d.get("conceito"), "alem_do_pedido": d.get("alem_do_pedido", []),
                       **({"vozes": self.vozes} if getattr(self, "vozes", None) else {}),
                       **({"ampliacao": ampliados} if ampliados else {}),
                       **({"sons_reais": self._sons_reais} if sons is not None else {})},
            "formato": dict(self.formato),
            "duracao": L["duracao"], "vel_fala": vel,
            "blocos": L["blocos"],
            "fontes": self._fontes(usadas),
            "voz": [{k: v[k] for k in ("id", "bloco", "fala", "fonte", "s0", "s1", "t0", "t1", "vel")} | {"ganho_db": 0, "limpeza": {"atenuacao_db": 15, "mistura": 0.8, "auto": True},
                     "texto": None} for v in L["voz"]],
            "planos": planos, "motion": motion, "legendas": legendas, "fx": fx,
            "trilha": self._trilha_edl(trilha, L), "sfx": sfx, **({"sons_reais": sons} if sons is not None else {}), "tom_sala": tom,
            "master": {"lufs": -14, "tp": -1.0, "crf": 17},
            "qa": {"logos": [{"t": round(L["fecho_t"] + 0.6, 3), "chave": self.m["fecho"]["logo"]}]
                   + ([{"t": round(L["fecho_t"] + 0.6, 3), "chave": f"marcas/{d['fecho']['logo_cliente']}/logo.png"}] if d["fecho"].get("logo_cliente") else []),
                   "falas_confirmadas": sorted({fd["id"] for b in d["blocos"] for fd in b["falas"] if fd.get("corrigir")}),
                   "riscos": list(d.get("riscos", [])) + self.avisos},
        }
        for v, vl in zip(edl["voz"], L["voz"]):
            rf = resolvidas[vl["chave"]]
            v["texto"] = " ".join(_limpa(aplicar_vocabulario(p[2], self.voc)) for p in rf["palavras"] if v["s0"] <= (p[0] + p[1]) / 2 < v["s1"]) or None
        return edl

    # --- imagem
    def _enquadre(self, cid: str, s: float, zoom: float, push: float = 1.02) -> list:
        rostos = self.an[self.clipe[cid]["arquivo"]]["sinais"].get("rostos") or []
        cx, cy = 0.5, 0.45
        if rostos:
            r = min(rostos, key=lambda r: abs(r["t"] - s))
            if abs(r["t"] - s) < 3 and r["caixas"]:
                x, y, w, h = max(r["caixas"], key=lambda c: c[2] * c[3])[:4]
                cx, cy = round(x + w / 2, 3), round(y + h / 2, 3)
        return [[0, round(zoom, 3), cx, cy], [1, round(zoom * push, 3), cx, cy]]

    def _estab(self, cid: str, s0: float, s1: float) -> str:
        tr = self.an[self.clipe[cid]["arquivo"]]["sinais"].get("tremor") or {}
        lim = self.m.get("estab_px", 4.0)
        if any(a < s1 and b > s0 and px > lim for a, b, px in tr.get("trechos") or []):
            return "sim"
        return "sim" if (tr.get("media_px") or 0) > lim else "auto"

    def _cena(self, cid: str, s: float) -> dict | None:
        for c in self.an[self.clipe[cid]["arquivo"]]["sinais"].get("cenas") or []:
            if c["t0"] <= s <= c["t1"]:
                return c
        return None

    def _ambiente(self, cid: str, s: float) -> str:
        """Rótulo de ambiente da análise (o catálogo agrupa clipes por ele; usado no tom de sala)."""
        c = self._cena(cid, s)
        return c["ambiente"] if c and c.get("ambiente") else "neutro"

    def _cor(self, cid: str, s: float) -> str:
        """Look da biblioteca de cor: o do pedido, senão o medido na cena; análise antiga cai no rótulo de ambiente."""
        if self.ambiente:
            return self.ambiente
        c = self._cena(cid, s)
        if c and c.get("look") in COR.LOOKS:
            return c["look"]
        return c["ambiente"] if c and c.get("ambiente") else "neutro"

    def _balanco(self, cid: str, s: float) -> dict | None:
        """Primárias da cena (mesma correção para todos os planos da cena: sem cor pulando entre cortes)."""
        c = self._cena(cid, s)
        return COR.balanco(c.get("medicao"), self._cor(cid, s)) if c and c.get("medicao") else None

    def _desfocar(self, cid: str, s0: float, s1: float) -> list:
        return [t["caixa"] for t in self.an[self.clipe[cid]["arquivo"]]["sinais"].get("telas") or [] if t["t0"] < s1 and t["t1"] > s0]

    def _vel_real(self, cid: str, vel: float, efeito: str = "lento") -> float:
        """vel < 1 só se a fonte tem quadros para isso; senão sobe para o mínimo permitido, com aviso (uma vez por clipe)."""
        if vel >= 1.0 - 1e-6:
            return vel
        fps = (self.an[self.clipe[cid]["arquivo"]].get("midia") or {}).get("fps")
        vmin = vel_minima(fps, float(self.formato["fps"]))
        if vel + 1e-6 >= vmin:
            return vel
        avisados = self.__dict__.setdefault("_lenta_avisada", set())
        if (cid, efeito) not in avisados:
            avisados.add((cid, efeito))
            self.avisos.append(f"{cid}: {efeito} a {_br(vel)}x pedida, mas a fonte tem {float(fps or 0):.0f} fps; vai a {_br(vmin)}x "
                               f"(câmera lenta de verdade precisa de {float(self.formato['fps']) * LENTO_FOLGA / vel:.0f} fps)")
        return vmin

    def _plano(self, pid, bloco, t0, t1, cid, s0, vel=1.0, zoom=1.0, **extra) -> dict:
        vel = self._vel_real(cid, vel)
        s1 = s0 + (t1 - t0) * vel
        p = {"id": pid, "bloco": bloco, "t0": round(t0, 4), "t1": round(t1, 4), "fonte": self.fonte_de(cid, s0), "s0": round(s0, 4), "vel": round(vel, 4),
             "enquadre": self._enquadre(cid, s0, zoom), "estab": self._estab(cid, s0, s1), "cor": self._cor(cid, s0),
             "som_direto_db": None, "desfocar": self._desfocar(cid, s0, s1), "janela": None, "mblur": False}
        bal = self._balanco(cid, s0)
        if bal:
            p["balanco"] = bal
        p.update(extra)
        p["_clipe"] = cid
        return p

    def _planos(self, L) -> list:
        zooms = self.m.get("intensidade", {})
        intens = {b["id"]: b["intensidade"] for b in self.d["blocos"]}
        desfoca = {b["id"] for b in self.d["blocos"] if b.get("fundo_desfocado")}
        destaca = {b["id"] for b in self.d["blocos"] if b.get("destaque_pessoa")}
        base = []
        alterna = 0
        for v in L["voz"]:
            z = zooms.get(str(intens.get(v["bloco"], 3)), {}).get("zoom", 1.0)
            zoom = 1.0 if alterna % 2 == 0 else z                        # corte de escala entre frases da mesma fala
            alterna += 1
            fundo = {**({"desfoque": DESFOQUE_FUNDO} if v["bloco"] in desfoca else {}),
                     **({"destaque": DESTAQUE_PESSOA} if v["bloco"] in destaca else {})}
            extra = {"pessoa": {"pele": PELE_TRATADA}, **({"fundo": fundo} if fundo else {})}   # pele tratada: regra do dono
            base.append(self._plano(f"P{len(base)}", v["bloco"], v["t0"], v["t1"], v["clipe"], v["s0"], v["vel"], zoom, **extra))
        cobertos = []
        som = self.m.get("cobertura", {}).get("som_direto_db", {})
        lento = self.m.get("cobertura", {}).get("lento_vel", 0.5)
        por_fala = {}
        for cb, b, faixa in L["cobs"]:
            por_fala.setdefault(cb.get("sobre") if faixa is None else id(cb), []).append((cb, b, faixa))
        for chave, itens in por_fala.items():
            if itens[0][2] is not None:
                cb, b, (t0, t1) = itens[0]
                cobertos.append(self._cob(cb, b, t0, t1, som, lento))
                continue
            f0, f1, imagem, b = L["janelas"][chave]
            span = f1 - f0
            if imagem == "cobertura":
                passo = span / len(itens)
                faixas = [(f0 + k * passo, f0 + (k + 1) * passo) for k in range(len(itens))]
            else:
                t = f0 + max(0.8, 0.35 * span) if span > 2.0 else f0
                faixas = []
                for cb, _, _ in itens:
                    d = cb.get("dur") or min(2.0, span)
                    faixas.append((t, min(f1, t + d)))
                    t += d
            for (cb, b, _), (t0, t1) in zip(itens, faixas):
                if t1 - t0 >= 0.25:
                    cobertos.append(self._cob(cb, b, t0, t1, som, lento))
        # cobertura recorta o plano do falante (o depois continua a fonte no ponto certo)
        planos = base
        for c in sorted(cobertos, key=lambda p: p["t0"]):
            novos = []
            for p in planos:
                if p["t1"] <= c["t0"] or p["t0"] >= c["t1"] or p.get("_cob"):
                    novos.append(p)
                    continue
                if p["t0"] < c["t0"]:
                    novos.append(dict(p, t1=c["t0"]))
                if p["t1"] > c["t1"]:
                    novos.append(dict(p, t0=c["t1"], s0=round(p["s0"] + (c["t1"] - p["t0"]) * p["vel"], 4)))
            novos.append(c)
            planos = sorted(novos, key=lambda p: p["t0"])
        # sem buraco: estende o plano anterior (a fonte continua) até o próximo; o último vai até o fim (fundo do fecho)
        out = []
        for p in planos:
            if out and p["t0"] > out[-1]["t1"] + 1e-4:
                out[-1]["t1"] = p["t0"]
            if out and p["t0"] < out[-1]["t1"] - 1e-4:
                p = dict(p, t0=out[-1]["t1"])
                if p["t1"] - p["t0"] < 0.05:
                    continue
            out.append(p)
        if out:
            if out[0]["t0"] > 0:
                p = out[0]
                p["s0"] = round(max(0.0, p["s0"] - p["t0"] * p["vel"]), 4)
                p["t0"] = 0.0
            out[-1]["t1"] = L["duracao"]
        self._qualidade_planos(out)
        self._ampliados = {}
        for k, p in enumerate(out):
            p["id"] = f"P{k:02d}"
            p.pop("_cob", None)
            p.pop("_clipe", None)
            amp = p.pop("_amp", 1.0)
            if amp > 1.0 + 1e-3:
                self._ampliados[p["id"]] = amp
            p["t0"], p["t1"] = round(p["t0"], 4), round(p["t1"], 4)
        # Aviso só pela ampliação do FORMATO (fonte horizontal recortada para 9:16, fonte menor que a saída): o zoom
        # criativo do enquadre (intensidade, punch) é escolha da direção, fica só em origem.ampliacao. Senão todo filme
        # sairia com aviso, e os avisos vão para o crítico (chamada paga) e para as 5 vagas do evento da etapa.
        for cid in sorted(self._amp):
            fmt = self._ampliacao(cid) or 1.0
            if fmt > 1.0 + 1e-3:
                m = self.an[self.clipe[cid]["arquivo"]]["midia"]
                self.avisos.append(f"{cid}: o recorte amplia a fonte {_br(fmt)}x ({m['w']}x{m['h']} para "
                                   f"{self.formato['w']}x{self.formato['h']}; até {_br(self._amp[cid])}x com o enquadre); "
                                   "acima de 1,0 a imagem perde nitidez")
        return out

    # --- movimento, tremor e ampliação (M2)
    def _serie(self, cid: str) -> dict | None:
        return self.mov.get(self.clipe[cid]["arquivo"])

    def _ampliacao(self, cid: str, zoom: float = 1.0) -> float | None:
        m = self.an[self.clipe[cid]["arquivo"]]["midia"]
        return MV.ampliacao(m.get("w"), m.get("h"), self.formato["w"], self.formato["h"], zoom)

    def _escala_tremor(self, cid: str, zoom: float) -> float:
        """px a 1080 do lado maior da fonte -> px na saída (o recorte apertado mostra o mesmo tremor maior)."""
        m = self.an[self.clipe[cid]["arquivo"]]["midia"]
        amp = self._ampliacao(cid, zoom)
        if amp is None:
            return 1.0
        return max(m["w"], m["h"]) / MV.ESCALA_REF * amp

    def _equivalente(self, c: dict, m: dict, precisa: float, dur: float | None = None, vel: float = 1.0) -> tuple[dict, dict] | None:
        """Outro momento do mesmo tipo, nota igual ou maior e duração suficiente, num clipe NATIVO na orientação da saída
        (ampliação <= 1): o recorte de uma fonte horizontal para 9:16 amplia ~1,8x e a imagem fica mole. Desempata pelo
        mesmo ambiente e pelo clipe mais perto na ordem de gravação (o filme segue a ordem cronológica).
        Com `dur` e `vel` (câmera lenta), cada candidato precisa de dur x a velocidade que ELE aguenta: um clipe de fps menor
        sobe a lenta (vel_minima) e lê mais fonte, e o momento dele tem de caber nisso."""
        ordem = {x["id"]: k for k, x in enumerate(self.cat["clipes"])}
        ref = self._nota_imagem(c["id"], m, precisa)
        cands = []
        for c2 in self.cat["clipes"]:
            amp = self._ampliacao(c2["id"])
            if c2["id"] == c["id"] or amp is None or amp > 1.0 + 1e-3:
                continue
            precisa2 = precisa
            if dur is not None and vel < 1.0 - 1e-6:
                fps2 = (self.an[self.clipe[c2["id"]]["arquivo"]].get("midia") or {}).get("fps")
                precisa2 = max(precisa, dur * max(vel, vel_minima(fps2, float(self.formato["fps"]))))
            for m2 in c2["momentos"]:
                if m2["id"] in self._mom_usados or m2["tipo"] != m["tipo"] or m2["nota"] < m["nota"] or m2["t1"] - m2["t0"] < precisa2:
                    continue
                q2 = self._nota_imagem(c2["id"], m2, precisa)
                if q2 is not None and (q2 < 0 or (ref is not None and q2 < ref - 0.05)):
                    continue                                 # nativo, mas tremido forte ou mais mole que o original
                mesmo_amb = bool(set(c2.get("ambientes") or []) & set(c.get("ambientes") or []))
                cands.append(((not mesmo_amb, abs(ordem[c2["id"]] - ordem[c["id"]]), -m2["nota"], m2["id"]), c2, m2))
        if not cands:
            return None
        _, c2, m2 = min(cands, key=lambda x: x[0])
        return c2, m2

    def _nota_imagem(self, cid: str, m: dict, precisa: float) -> float | None:
        """Nota de imagem (0-1, motor/movimento.notas) do melhor trecho de `precisa` s dentro do momento, já na escala da
        saída; -1 se o trecho inteiro treme forte; None sem série (não dá para julgar, não veta a troca)."""
        serie = self._serie(cid)
        if not serie:
            return None
        esc = self._escala_tremor(cid, 1.0)
        a, b, nota = MV.melhor_trecho(serie, precisa, m["t0"], m["t1"], escala=esc)
        return -1.0 if MV.tremor_forte(serie, a, b, esc) else nota

    def _qualidade_planos(self, planos: list) -> None:
        """Depois de montar os planos: estabilização pela série de 0,5 s e ampliação final de cada plano.

        - estab: com a série, o plano que treme acima de MV.LIMIAR_ESTAB (já convertido para px da saída) vai com
          "sim" (a montagem estabiliza mesmo se a medição dela no plano curto ficar no limite); sem tremor, "auto".
          Sem a série, vale a regra antiga (tremor dos quadros-chave). Tremor forte vira aviso: a estabilização
          corta e pode ondular.
        - ampliação: fonte x formato de saída x enquadre (o maior zoom do plano), x1,05 quando estabiliza (a margem
          mínima que a montagem usa). Acima de 1,0 o plano entra em origem.ampliacao e num aviso por clipe."""
        fortes = set()
        for p in planos:
            cid = p.get("_clipe")
            if not cid:
                continue
            zmax = max((k[1] for k in p.get("enquadre") or [[0, 1.0]]), default=1.0)
            serie = self._serie(cid)
            if serie:
                s1 = p["s0"] + (p["t1"] - p["t0"]) * p.get("vel", 1.0)
                esc = self._escala_tremor(cid, zmax)
                p["estab"] = "sim" if MV.precisa_estabilizar(serie, p["s0"], s1, esc) else "auto"
                if MV.tremor_forte(serie, p["s0"], s1, esc) and cid not in fortes:
                    fortes.add(cid)
                    self.avisos.append(f"{cid} @ {_br(p['s0'], 1)} s: tremor forte ({_br(MV.tremor_em(serie, p['s0'], s1) * esc, 1)} px na saída); "
                                       "estabilizado, mas prefira outro trecho")
            amp = self._ampliacao(cid, zmax)
            if amp is None:
                continue
            if p.get("estab") == "sim":
                amp = round(amp * 1.05, 3)
            p["_amp"] = amp
            self._amp[cid] = max(self._amp.get(cid, 0.0), amp)

    def _casar_transicoes(self, planos: list, fx: list, sfx: list) -> None:
        """Whip no sentido em que a câmera já está indo no fim do plano que sai (pedido do dono: cada transição junto
        com a cena). Câmera indo para a direita = imagem correndo para a esquerda = whip com dir -1; o som do whip vai
        para o mesmo lado. Câmera parada ou movimento vertical: fica o padrão do modelo."""
        for e in fx:
            if e["tipo"] != "whip":
                continue
            p = next((x for x in planos if x["t0"] <= e["t"] - 0.05 < x["t1"]), None)
            if not p:
                continue
            serie = self._serie(p["fonte"].partition("_")[0]) if p["fonte"].partition("_")[0] in self.clipe else None
            if not serie:
                continue
            s = p["s0"] + (e["t"] - 0.05 - p["t0"]) * p.get("vel", 1.0)
            mvto = MV.direcao_do_movimento(serie, s - 0.25)
            if mvto["direcao"] not in ("direita", "esquerda"):
                continue
            e["dir"] = -1 if mvto["direcao"] == "direita" else 1
            for fe, x in getattr(self, "_whips", []):           # o som DESTE whip, não qualquer sfx no mesmo tempo
                if fe is e:
                    x["pan"] = 0.4 if mvto["direcao"] == "direita" else -0.4

    def _cob(self, cb, b, t0, t1, som, lento) -> dict:
        c, m = self.mom[cb["m"]]
        dur = t1 - t0
        ef = cb.get("efeito", "nenhum")
        vel = self._vel_real(c["id"], lento) if ef == "lento" else 1.0
        precisa = dur * vel
        amp = self._ampliacao(c["id"])
        if amp is not None and amp > 1.0 + 1e-3:            # fonte que amplia: há o mesmo momento numa fonte nativa?
            eq = self._equivalente(c, m, precisa, dur, lento if ef == "lento" else 1.0)
            if eq:
                self.avisos.append(f"cobertura {m['id']} trocada por {eq[1]['id']}: {c['id']} ampliaria {_br(amp)}x para "
                                   f"{self.formato['w']}x{self.formato['h']}, {eq[0]['id']} é nativo")
                self._mom_usados.add(eq[1]["id"])
                self.__dict__.setdefault("_mom_trocado", {})[cb["m"]] = eq[1]["id"]   # o som pontual do momento segue a troca
                c, m = eq
                # a velocidade depende do fps do clipe NOVO: recalcula antes de escolher o trecho (s0) que o plano lê
                vel = self._vel_real(c["id"], lento) if ef == "lento" else 1.0
                precisa = dur * vel
        s0 = m["t0"] + 0.15 if m["t1"] - m["t0"] > precisa + 0.3 else m["t0"]
        serie = self._serie(c["id"])
        v_rampa = self._vel_real(c["id"], 0.4, "rampa") if ef == "rampa" else 0.4   # o miolo lento da rampa também é lenta
        consome = {"rampa": (1.04 + 0.3 * v_rampa) * dur, "congela": 0.5 * dur}.get(ef, precisa)   # quanto da fonte o efeito lê
        if serie and m["t1"] - m["t0"] > consome + 0.1:     # o trecho mais nítido e firme dentro do momento escolhido
            # mantém a margem antiga de 0,15 s quando cabe: o momento da visão costuma começar num corte de cena e os
            # primeiros quadros do plano anterior vazariam (melhor_trecho desempata para o começo da janela)
            lo = m["t0"] + 0.15 if m["t1"] - m["t0"] > consome + 0.3 else m["t0"]
            s0 = MV.melhor_trecho(serie, consome, lo, m["t1"], escala=self._escala_tremor(c["id"], 1.0))[0]
        extra = {"_cob": True}
        zoom = 1.0
        if ef == "punch" or ef == "atras":
            zoom = 1.12
        if ef == "rampa":
            a = s0
            extra["rampa"] = [[0, round(a, 3)], [0.35, round(a + 0.35 * dur * 1.6, 3)], [0.65, round(a + 0.35 * dur * 1.6 + 0.3 * dur * v_rampa, 3)],
                              [1, round(a + 0.65 * dur * 1.6 + 0.3 * dur * v_rampa, 3)]]
        if ef == "congela":
            extra["rampa"] = [[0, round(s0, 3)], [0.5, round(s0 + 0.5 * dur, 3)], [1, round(s0 + 0.5 * dur, 3)]]
        if ef == "janela":
            extra["janela"] = {"x": 0.08, "y": 0.2, "w": 0.84, "h": 0.42, "titulo": m["tipo"].replace("_", " ").upper()}
        if m["tipo"] == "impacto":
            extra["flash"] = [[0.0, 0.12, 0.8]]
        p = self._plano("C", b["id"], t0, t1, c["id"], s0, vel, zoom, **extra)
        if ef == "punch":
            p["enquadre"] = [[0, 1.0, p["enquadre"][0][2], p["enquadre"][0][3]], [1, 1.15, p["enquadre"][0][2], p["enquadre"][0][3]]]
        if cb.get("sobre") is None:
            p["som_direto_db"] = som.get(m["tipo"], -20)
        return p

    # --- motion, fx, sfx
    def _motion(self, L):
        m, d = self.m, self.d
        motion, fx, sfx = [], [], []
        self._whips = []
        g = d.get("gancho") or {}
        if g.get("texto_tela"):
            props = {"sobrelinha": m["gancho"].get("sobrelinha"), "linhas": g["texto_tela"], "y": m["gancho"].get("y", 0.42)}
            if g.get("troca") and g["troca"].get("risca"):
                props["troca"] = {"de": g["troca"]["risca"], "para": g["troca"].get("para", ""), "em": 0.62, "dur": 0.36}
                sfx.append({"t": 0.62, "som": m["sfx"]["troca"], "g": -8, "pan": 0})
            camada = {"id": "gancho", "modelo": m["gancho"]["modelo"], "de": 0.0, "ate": round(min(m["gancho"]["dur"], L["duracao"]), 3), "props": props}
            if g.get("atras_da_pessoa"):            # quem fala passa NA FRENTE do título (a composição escolhe a altura legível)
                camada["atras"] = True
                props["y"] = m["gancho"].get("y_atras", Y_ATRAS)
            motion.append(camada)
            sfx.append({"t": 0.0, "som": m["sfx"]["gancho"], "g": -6, "pan": 0})
        primeira = {}
        for v in L["voz"]:
            primeira.setdefault(v["fala"], v["t0"])
        for rep, orig in self._usadas_por.items():         # chip "sobre" a repetição acha o tempo do ditado trocado
            if orig in primeira:
                primeira.setdefault(rep, primeira[orig])
        vistos = set()
        for b, bl in zip(d["blocos"], L["blocos"]):
            for k, ch in enumerate(b.get("chips") or []):
                if ch["nome"].upper() in vistos:
                    continue
                vistos.add(ch["nome"].upper())
                de = primeira.get(ch.get("sobre"), bl["t0"]) + 0.3
                if g.get("texto_tela") and de < m["gancho"]["dur"] + 0.1:       # chip não briga com o gancho
                    de = m["gancho"]["dur"] + 0.1
                if ch["nome"].upper() not in EQUIPE and not ch["nome"].isupper():
                    self.avisos.append(f"chip «{ch['nome']}»: nome de terceiro nunca em chip (use a função)")
                motion.append({"id": f"chip_{b['id']}_{k}", "modelo": m["chip"]["modelo"], "de": round(de, 3), "ate": round(de + m["chip"]["dur"], 3),
                               "props": {"nome": ch["nome"].capitalize() if ch["nome"].upper() in EQUIPE else ch["nome"],
                                         "cargo": ch.get("funcao") or m["chip"]["cargo"]}})
                sfx.append({"t": round(de, 3), "som": m["sfx"]["chip"], "g": -10, "pan": 0})
            for k, tx in enumerate(b.get("texto_tela") or []):
                de = bl["t0"] + 0.2 + k * m["texto_tela"]["dur"]
                motion.append({"id": f"texto_{b['id']}_{k}", "modelo": m["texto_tela"]["modelo"], "de": round(de, 3), "ate": round(min(de + m["texto_tela"]["dur"], bl["t1"] + 0.5), 3),
                               "props": {"titulo": tx, "x": m["texto_tela"].get("x", 60), "y": m["texto_tela"].get("y", 330)}})
                sfx.append({"t": round(de, 3), "som": m["sfx"]["texto_tela"], "g": -12, "pan": 0})
            tr = m["transicoes"].get(b["saida"])
            corte = bl["t1"]
            if tr:
                fx.append({"tipo": tr["fx"], "t": round(corte, 3), "dur": tr["dur"], "forca": 0.6 + 0.1 * b["intensidade"]})
                if tr["fx"] in ("whip", "mascara", "aba71"):
                    motion.append({"id": f"trans_{b['id']}", "modelo": "transicao", "de": round(corte - tr["dur"] / 2, 3), "ate": round(corte + tr["dur"] / 2, 3),
                                   "props": {"tipo": tr["fx"], "corte": round(corte, 3)}})
                if tr.get("sfx"):
                    sfx.append({"t": round(corte - (0.12 if tr["fx"] == "whip" else 0), 3), "som": tr["sfx"], "g": -5, "pan": 0})
                    if tr["fx"] == "whip":
                        self._whips.append((fx[-1], sfx[-1]))   # o som deste whip (casar_transicoes ajusta o pan)
            if b["intensidade"] >= 5 and m["intensidade"]["5"].get("fx", "bloom"):      # modo sóbrio desliga o efeito de pico (fx None)
                fx.append({"tipo": m["intensidade"]["5"].get("fx", "bloom"), "t": round(bl["t0"], 3), "dur": 0.5, "forca": 0.7})
            if (d.get("trilha") or {}).get("drop_em") == b["id"]:
                fx.append({"tipo": "impacto", "t": round(bl["t0"], 3), "dur": 0.2, "forca": 1.0})
                sfx.append({"t": round(bl["t0"], 3), "som": m["sfx"]["drop"], "g": -3, "pan": 0})
        fe = d["fecho"]
        arroba = fe.get("arroba")
        palavras = fe["cta"].split()
        meio = max(1, len(palavras) // 2)
        linhas = [" ".join(palavras[:meio]), "*" + " ".join(palavras[meio:]) + "*"] if len(palavras) > 1 else [fe["cta"]]
        apoio = " · ".join(x for x in (fe.get("apoio"), arroba) if x)
        props = {"cta": linhas, "apoio": apoio or None, "arroba": arroba, "logo": m["fecho"]["logo"]}
        if fe.get("logo_cliente"):
            props["logo_cliente"] = f"marcas/{fe['logo_cliente']}/logo.png"
        motion.append({"id": "fecho", "modelo": m["fecho"]["modelo"], "de": round(L["fecho_t"], 3), "ate": L["duracao"], "props": props})
        sfx.append({"t": round(L["fecho_t"] + 0.6, 3), "som": m["sfx"]["cta"], "g": -12, "pan": 0})
        sfx = [x for x in sfx if x.get("som")]           # som desligado pelo modo de edição
        motion.sort(key=lambda x: x["de"])
        fx.sort(key=lambda x: x["t"])
        sfx.sort(key=lambda x: x["t"])
        return motion, fx, sfx

    # --- legendas: só palavra dita e confirmada, no tempo do filme
    def _legendas(self, L, resolvidas) -> dict:
        lm = self.m["legenda"]
        conf_min = lm.get("conf_min", 0.5)
        enfase = {norm(w) for w in lm.get("enfase", [])}
        out = []
        for v in L["voz"]:
            for p in resolvidas[v["chave"]]["palavras"]:
                meio = (p[0] + p[1]) / 2
                if not (v["s0"] <= meio < v["s1"]):
                    continue
                corrigida = aplicar_vocabulario(p[2], self.voc)
                if p[3] < conf_min and corrigida == p[2]:        # incerta e não confirmada: fica fora (só legenda o que foi dito)
                    continue
                txt = _limpa(corrigida)
                if not txt:
                    continue
                t0 = v["t0"] + (max(p[0], v["s0"]) - v["s0"]) / v["vel"]
                t1 = v["t0"] + (min(p[1], v["s1"]) - v["s0"]) / v["vel"]
                out.append([round(t0, 3), round(max(t1, t0 + 0.06), 3), txt, 1 if norm(txt).replace(" ", "") in enfase or norm(txt) in enfase else 0])
        return {"modelo": lm.get("modelo", "legenda"), "y": lm.get("y", 0.62), "palavras": out}

    # --- tom de sala: trecho SEM fala, do mesmo ambiente da voz principal
    def _tom_sala(self, L):
        if not L["voz"]:
            return None
        peso = {}
        for v in L["voz"]:
            peso[v["clipe"]] = peso.get(v["clipe"], 0) + v["s1"] - v["s0"]
        principal = max(peso, key=peso.get)
        amb = self._ambiente(principal, L["voz"][0]["s0"])
        ordem = [principal] + [c for c in peso if c != principal] + [c["id"] for c in self.cat["clipes"] if c["id"] not in peso and amb in c.get("ambientes", [])]
        min_s = self.m.get("tom_sala", {}).get("min_s", 1.5)
        for cid in ordem:
            cand = self._silencios(cid, min_s)
            if cand:
                s0, s1 = cand[0]
                return {"fonte": self.fonte_de(cid, s0), "s0": round(s0, 3), "s1": round(s1, 3), "db": self.m.get("tom_sala", {}).get("db", -48)}
        self.avisos.append("nenhum trecho sem fala para o tom de sala")
        return None

    def _silencios(self, cid: str, min_s: float) -> list[tuple[float, float]]:
        a = self.an[self.clipe[cid]["arquivo"]]
        pal = self.pal(cid)
        margem = 0.35
        dur = a["midia"]["duracao"]
        trechos = a["derivados"].get("trechos") or [{"ini": 0.0, "fim": dur}]
        segs = [(s["s"], s["e"]) for s in a["transcricao"]["segmentos"]]
        marcas = sorted([(-1.0, 0.0)] + [(p[0], p[1]) for p in pal] + segs + [(dur, dur + 1)])
        unidas = []                                              # une marcas sobrepostas: o vão é só onde não há fala nenhuma
        for x in marcas:
            if unidas and x[0] <= unidas[-1][1]:
                unidas[-1] = (unidas[-1][0], max(unidas[-1][1], x[1]))
            else:
                unidas.append(x)
        marcas = unidas
        serie = self.energias.get(a["arquivo"]["id"])
        passo = self.energias.get("_passo", {}).get(a["arquivo"]["id"], 0.02)
        cands = []
        for (x0, x1), (y0, y1) in zip(marcas, marcas[1:]):
            g0, g1 = x1 + margem, y0 - margem
            for t in trechos:                                     # só onde o arquivo existe
                lo, hi = max(g0, t["ini"] + 0.2), min(g1, (t.get("fim") or dur) - 0.2)
                if hi - lo >= min_s:
                    lo2, hi2 = (lo, hi) if hi - lo <= 6 else ((lo + hi) / 2 - 3, (lo + hi) / 2 + 3)
                    nivel = 0.0
                    if serie is not None:
                        import numpy as np
                        tr = serie[int(lo2 / passo):int(hi2 / passo)]
                        nivel = float(np.median(tr)) if len(tr) else 0.0
                        if nivel <= -89:                           # buraco da série (sem áudio medido)
                            continue
                        # conversa baixa da equipe não entra na transcrição, mas tem sílabas: o envelope sobe e desce rápido.
                        # Mede só a variação RÁPIDA (envelope menos a média de 0,5 s): música crescendo, freezer ou compressor
                        # ligando mudam devagar e não contam. Item J, cerveja v2, 22/11.
                        sil = _silabas_db(tr, passo)
                        tm = self.m.get("tom_sala", {})
                        if sil > tm.get("silabas_teto_db", 5.0):
                            continue
                        nivel += 3.0 * max(0.0, sil - tm.get("silabas_ok_db", 2.0))    # entre ok e teto: só perde preferência
                    cands.append((nivel - 0.5 * min(hi2 - lo2, 6), lo2, hi2))
        cands.sort()
        return [(lo, hi) for _, lo, hi in cands]

    def _inicio_na_virada(self, trilha, L, dur: float, td: float) -> float | None:
        """Sentir o momento (25/11): se a direção marcou o bloco do auge (trilha.drop_em) e a música tem virada medida, a música
        começa no ponto que faz a virada cair no começo desse bloco (a menos de meia batida). O deslocamento é em batidas inteiras, então os
        cortes continuam na batida. Só vale se a música cobrir o filme inteiro a partir desse ponto."""
        alvo, v, bpm = (self.d.get("trilha") or {}).get("drop_em"), trilha.get("virada"), trilha.get("bpm")
        if not alvo or not v or not bpm or not trilha.get("bpm_medido", True):     # bpm chutado (120) não tem grade de verdade
            return None
        bl = next((b for b in L["blocos"] if b.get("id") == alvo), None)
        if bl is None:
            return None
        batida = 60.0 / bpm
        ini = round((float(v) - float(bl["t0"])) / batida) * batida
        if ini < 0 or ini + dur > td + 1e-6:
            self.avisos.append(f"a virada da música ({v:.1f} s) não coube no auge do filme ({bl['t0']:.1f} s): a música toca do começo")
            return None
        return ini

    def _trilha_edl(self, trilha, L) -> dict:
        tm = self.m.get("trilha", {})
        if not trilha:
            return {"chave": None, "bpm": None, "fase": 0, "emendas": [], "ganho_db": tm.get("ganho_db", -14), "ducking": tm.get("ducking", {}), "acorde_final": None}
        dur, td = L["duracao"], trilha.get("dur") or L["duracao"]
        emendas, t, s = [], 0.0, 0.0
        ini = self._inicio_na_virada(trilha, L, dur, td)
        if ini is not None:
            emendas = [[0.0, round(ini, 3), round(ini + dur, 3), 0.05 if ini > 0 else 0.0]]
        elif td >= dur:
            emendas = [[0.0, 0.0, round(dur, 3), 0.0]]
        else:                                                     # emenda por compassos inteiros
            compasso = 4 * 60.0 / trilha["bpm"]
            bloco = max(compasso, math.floor(td / compasso) * compasso)
            while t < dur:
                d = min(bloco, dur - t)
                emendas.append([round(t, 3), round(s, 3), round(s + d, 3), 0.05 if t > 0 else 0.0])
                t += d
        return {"chave": trilha["chave"], "bpm": trilha["bpm"], "fase": trilha.get("fase", 0.0), "emendas": emendas,
                "ganho_db": tm.get("ganho_db", -14), "ducking": tm.get("ducking", {"db": 10, "desce": 0.4, "sobe": 0.55}),
                "acorde_final": round(L["fecho_t"] + 0.6, 3)}


    # --- duas ou três músicas em sequência (M4)
    def _emendar_musicas(self, edl: dict) -> dict:
        """Direção com trilha.ids (2 ou 3 músicas): a 1a toca como sempre (virada no auge, cortes na grade dela) e cada
        seguinte assume no fim de uma parte da anterior, no 1 do compasso das duas (musica.ponto_de_troca). Casada (tom
        que combina e bpm a até 6%): a nova é esticada para o tempo do filme e a grade de cortes continua valendo depois
        da troca. Respiro: aviso, porque dali em diante a batida da música nova não é mais a dos cortes."""
        dt = self.d.get("trilha") or {}
        ids = list(dict.fromkeys(dt.get("ids") or []))
        tr = edl.get("trilha") or {}
        if len(ids) < 2 or not tr.get("chave"):
            return edl
        n_avisos = len(self.avisos)            # tudo o que for avisado daqui em diante vai para qa.riscos (a cópia já foi feita)
        por_id = {t["id"]: t for t in self.trilhas}
        faltam = [i for i in ids if i not in por_id]
        if faltam:
            self.avisos.append(f"trilha(s) {', '.join(faltam)} fora da biblioteca: o filme segue com as que existem")
        seq = [por_id[i] for i in ids if i in por_id]
        if len(seq) >= 2 and seq[0]["chave"] != tr["chave"]:
            atual = next((t["id"] for t in self.trilhas if t["chave"] == tr["chave"]), tr["chave"])
            self.avisos.append(f"a trilha do filme ({atual}) não é a 1a de trilha.ids ({seq[0]['id']}): as outras músicas ficaram de fora")
        if len(seq) < 2 or seq[0]["chave"] != tr["chave"]:
            return self._avisos_em_riscos(edl, n_avisos)
        D = float(edl["duracao"])
        em = tr.get("emendas") or []
        s_de0 = float(em[0][1]) if em and float(em[0][0]) <= 1e-6 else 0.0
        faixas = [{"id": seq[0]["id"], "chave": seq[0]["chave"], "entra_em": 0.0, "s_de": round(s_de0, 3), "xf": 0.0, "razao": 1.0,
                   "bpm": _bpm_real(seq[0]), "fase": float(seq[0].get("fase") or 0.0)}]
        blocos = {b["id"]: b for b in edl.get("blocos") or []}
        pedidos = list(dt.get("troca_em") or [])
        for b in pedidos:
            if b not in blocos:
                self.avisos.append(f"troca_em pede o bloco {b}, que não existe: essa troca vai para a divisão por igual")
        # cada posição de troca_em vale para a SUA troca: um id errado não empurra as trocas seguintes para o lugar errado
        alvos = [float(blocos[pedidos[k]]["t0"]) if k < len(pedidos) and pedidos[k] in blocos else D * (k + 1) / len(seq)
                 for k in range(len(seq) - 1)] + [D]
        trocas = []
        for k, prox in enumerate(seq[1:], start=1):
            atual = faixas[-1]
            ta = next(t for t in seq if t["id"] == atual["id"])
            alvo_f = alvos[k - 1]
            r_a = float(atual["razao"])

            def na_musica(t_f, f=atual, r=r_a):
                return f["s_de"] + (t_f - f["entra_em"]) * r
            # bpm chutado (biblioteca grava 120 com bpm_medido falso) não é grade: sem ele a troca é respiro e nada é esticado
            # nem fatiado em pontos que não são batidas (o 1 do compasso também sairia errado)
            bpm_a, bpm_b = _bpm_real(ta), _bpm_real(prox)
            tempo_a = bpm_a * r_a if bpm_a else None
            precisa = max(0.0, alvos[k] - alvo_f - 2.0)       # a nova precisa durar até a troca seguinte (ou o fim)
            pt, T = None, None
            for _ in range(3):
                # a troca real cai na fronteira de parte mais perto do alvo, que pode estar bem antes dele: a nova então
                # precisa de mais música. Refaz com o que falta de verdade (revisão M4: 4,7 s de silêncio no fim).
                try:
                    pt = MU.ponto_de_troca(ta, prox, bpm_a, float(ta.get("fase") or 0.0), bpm_b, float(prox.get("fase") or 0.0),
                                           alvo_a=na_musica(alvo_f), minimo_a=na_musica(atual["entra_em"] + atual["xf"] + 4.0),
                                           dur_a=ta.get("dur"), dur_b=prox.get("dur"), precisa_b=precisa, tempo_a=tempo_a)
                except Exception as e:                      # dado estranho da biblioteca não derruba a direção: vira aviso
                    self.avisos.append(f"troca de {ta['id']} para {prox['id']} falhou ({type(e).__name__}: {e}): segue só com {ta['id']}")
                    pt = None
                    break
                if pt is None:
                    break
                T = round(atual["entra_em"] + (pt["sai_a"] - atual["s_de"]) / r_a, 3)
                falta = alvos[k] - T
                if not prox.get("dur") or float(prox["dur"]) - pt["entra_b"] + 1e-3 >= falta * float(pt["razao"]):
                    break
                if precisa >= falta - 1e-3:
                    pt = None
                    break
                precisa = falta
            else:
                pt = None                                    # 3 tentativas e a nova ainda não cobre o trecho: não troca
            if pt is None:
                if not any(a.startswith(f"troca de {ta['id']} para {prox['id']} falhou") for a in self.avisos[n_avisos:]):
                    self.avisos.append(f"sem ponto de troca de {ta['id']} para {prox['id']} (partes ou duração não deixam): segue só com {ta['id']}")
                break
            if T >= D - 2.0:
                self.avisos.append(f"a troca para {prox['id']} cairia a {D - T:.1f} s do fim: segue só com {ta['id']}")
                break
            xf, rb = float(pt["xf"]), float(pt["razao"])
            # Cruzamento CENTRADO no 1 do compasso: antes dele, a parte que fecha em A ainda está acima de 0,7; depois, a parte
            # que abre em B já está acima de 0,7. Assim nenhuma das duas pontas mais fracas (a intro de B, o resto de A)
            # fica sozinha e o som não afunda; o 1 de B sai a 0,7 junto com o fim de A. Sem pré-rolagem em B (entra no
            # segundo 0) ou sem sobra em A (acaba ali), o cruzamento vai todo para o lado que tem música.
            sobra_a = max(0.0, (float(ta["dur"]) - pt["sai_a"]) / r_a) if ta.get("dur") else xf
            pre_b = pt["entra_b"] / rb
            antes = min(xf / 2, pre_b)
            depois = min(xf - antes, sobra_a)
            antes = min(xf - depois, pre_b)
            xf = antes + depois
            if xf < 0.02:                                     # nem pré-rolagem nem sobra: entrada seca no 1, sem estalo
                antes, xf = 0.0, 0.02
            entra, s_de = T - antes, pt["entra_b"] - antes * rb
            faixas.append({"id": prox["id"], "chave": prox["chave"], "entra_em": round(max(0.0, entra), 3), "s_de": round(s_de, 3),
                           "xf": round(xf, 3), "razao": rb, "bpm": bpm_b, "fase": float(prox.get("fase") or 0.0),
                           "modo": pt["modo"], "troca_em": T})
            trocas.append({"de": ta["id"], "para": prox["id"], "t": T, "modo": pt["modo"], "combina": pt["combina"], "tom": [pt["tom_a"], pt["tom_b"]],
                           "razao": rb, "motivo": pt["motivo"]})
            if pt["modo"] == "respiro":
                self.avisos.append(f"troca de {ta['id']} para {prox['id']} aos {_br(T, 1)} s num respiro ({pt['motivo']}); os cortes "
                                   "depois dela seguem a grade da música anterior")
        if len(faixas) >= 2:
            ult = faixas[-1]
            tu = next(t for t in seq if t["id"] == ult["id"])
            if tu.get("dur"):
                cobre = (float(tu["dur"]) - ult["s_de"]) / float(ult["razao"])
                if cobre + 0.5 < D - ult["entra_em"]:
                    self.avisos.append(f"a música {tu['id']} acaba {D - ult['entra_em'] - cobre:.1f} s antes do fim do filme: silêncio no fim")
        if len(faixas) < 2:
            return self._avisos_em_riscos(edl, n_avisos)
        tr["faixas"] = faixas
        tr["emendas"] = []
        edl.setdefault("origem", {})["musicas"] = trocas
        return self._avisos_em_riscos(edl, n_avisos)

    def _avisos_em_riscos(self, edl: dict, desde: int) -> dict:
        """qa.riscos é uma cópia de self.avisos feita antes da emenda de músicas: os avisos novos entram aqui."""
        riscos = (edl.get("qa") or {}).get("riscos")
        if isinstance(riscos, list):
            riscos.extend(a for a in self.avisos[desde:] if a not in riscos)
        return edl


def _bpm_real(t: dict) -> float | None:
    """bpm da música só se foi medido; o 120 de reserva da biblioteca (bpm_medido falso) não vale como grade."""
    return float(t["bpm"]) if t.get("bpm") and t.get("bpm_medido", True) else None


def resolver(direcao: dict, catalogo: dict, analises, modelo_video: dict, trilhas: list[dict] | None = None, **kw) -> dict:
    """analises: dict arquivo_id -> análise (ou lista)."""
    if isinstance(analises, list):
        analises = {a["arquivo"]["id"]: a for a in analises}
    return Resolvedor(direcao, catalogo, analises, modelo_video, trilhas, **kw).resolver()
