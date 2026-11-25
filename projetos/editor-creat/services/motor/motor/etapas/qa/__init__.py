"""Etapa QA (frente C): conferência automática OBRIGATÓRIA antes de entregar (ARQUITETURA §9). Uma checagem por arquivo.

    conferir(final, edl, cfg, mix=, stems=, overlay_dir=, evidencias=) -> relatório válido em qa.schema.json

Cada módulo de checagem exporta ID, BLOQUEIA e `checar(c: Conferencia) -> {ok, valor?, detalhe?, evidencia?}`.
Uma checagem que quebra vira reprovação com o erro no detalhe (nunca passa calada). A versão só é aprovada se nenhuma
checagem que bloqueia falhar. As lições do dono estão aqui: frase repetida no mix/stems, tom de sala com voz, logo
conferida a 100%, LUFS, pico real, quadro preto, legenda x fala, zona segura, regras da memória e, desde 19/11, fala
cortada antes de terminar, voz da equipe dentro da peça e cobertura com a pessoa distraída na tela.
"""
from __future__ import annotations

import importlib
import json
import pathlib
import re
import subprocess
import sys
import time

import numpy as np

from motor import config
from motor.etapas import ErroDefinitivo, etapa
from motor.etapas.montagem.comum import SR, gravar_json, hash_obj, sha256_arquivo

_PY_SCHEMAS = str(config.SCHEMAS / "py")
if _PY_SCHEMAS not in sys.path:
    sys.path.insert(0, _PY_SCHEMAS)

CHECAGENS = ("formato", "duracao", "sincronia", "lufs", "true_peak", "quadros_pretos", "zona_segura", "legenda_x_fala",
             "fala_cortada", "voz_externa", "cobertura_sintonia",
             "frase_repetida", "tom_sala_sem_voz", "logo_100", "legenda_sobre_rosto", "telas_desfocadas", "regra_memoria", "cor_medida", "fatos",
             "sons_reais",                    # M6: o que entrou do banco de sons reais e voz escondida no stem 'reais'
             "olho_ia")                       # olho_ia por último: não gasta em versão que já reprovou (ja_reprovou)


def normalizar(txt: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", str(txt).lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return " ".join("".join(ch if ch.isalnum() else " " for ch in t).split())


class Conferencia:
    """Tudo que as checagens precisam, carregado só quando alguma pede (transcrição é cara: cache por arquivo)."""

    def __init__(self, final: pathlib.Path, edl: dict, cfg, *, mix=None, stems=None, overlay_dir=None, evidencias=None, fontes=None, cor=None,
                 montagem: dict | None = None):
        self.cor = cor or []
        self.montagem = montagem or {}          # montagem.json (sons reais: o que entrou e o que faltou)
        self.final = pathlib.Path(final)
        self.edl = edl
        self.cfg = cfg
        self.mix = pathlib.Path(mix) if mix else None
        self.stems = {k: pathlib.Path(v) for k, v in (stems or {}).items()}
        self.overlay_dir = overlay_dir
        self.evid = pathlib.Path(evidencias or (self.final.parent / "qa"))
        self.evid.mkdir(parents=True, exist_ok=True)
        self.fontes = fontes
        fmt = edl.get("formato", {})
        self.W, self.H, self.FPS = int(fmt.get("w", 1080)), int(fmt.get("h", 1920)), float(fmt.get("fps", 30))
        self._probe = None
        self._audio = None
        self._tr: dict = {}
        self._transcritor = False
        self._fonte_audio: dict = {}
        self.memo: dict = {}                    # medidas que mais de uma checagem usa (envelope da fonte, F0...)

    # ---------- mídia
    def probe(self) -> dict:
        if self._probe is None:
            r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                "stream=codec_type,codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels,duration,nb_frames:format=duration",
                                "-of", "json", str(self.final)], capture_output=True, text=True)
            if r.returncode != 0:
                raise RuntimeError(f"ffprobe não leu o final: {r.stderr[-300:]}")
            self._probe = json.loads(r.stdout)
        return self._probe

    def stream(self, tipo: str) -> dict | None:
        return next((s for s in self.probe().get("streams", []) if s.get("codec_type") == tipo), None)

    def audio_final(self) -> np.ndarray:
        if self._audio is None:
            r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(self.final), "-vn", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                               capture_output=True)
            x = np.frombuffer(r.stdout, np.float32)
            self._audio = x[: len(x) // 2 * 2].reshape(-1, 2).copy()
        return self._audio

    def quadro(self, t: float) -> np.ndarray | None:
        r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(self.final), "-frames:v", "1",
                            "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True)
        n = self.W * self.H * 3
        if len(r.stdout) < n:
            return None
        return np.frombuffer(r.stdout[:n], np.uint8).reshape(self.H, self.W, 3).copy()

    def audio_fonte(self, fid: str, sr: int = 16000) -> tuple[np.ndarray, float] | None:
        """Áudio inteiro da FONTE `fid` (mono, cache por fonte) e o offset dela: o tempo s do EDL cai em s - offset no arquivo.
        None quando a conferência não recebeu as fontes (sem como ouvir a fala na origem: quem chama devolve NÃO VERIFICADO).
        Fonte que falta no disco levanta (a checagem que quebra reprova)."""
        if self.fontes is None:
            return None
        k = (fid, sr)
        if k not in self._fonte_audio:
            from motor.etapas.montagem.comum import ler_audio
            self._fonte_audio[k] = (ler_audio(self.fontes.audio(fid), sr=sr, cfg=self.cfg), float(self.fontes.offset(fid)))
        return self._fonte_audio[k]

    def salvar_quadro(self, img, nome: str) -> str:
        import cv2
        p = self.evid / nome
        cv2.imwrite(str(p), img)
        return f"qa/{nome}"

    # ---------- transcrição (provedor da frente A; sem ele, as checagens de fala ficam 'não verificado')
    def transcritor(self):
        if self._transcritor is False:
            try:
                from motor.provedores import provedor
                self._transcritor = provedor("transcricao", self.cfg)
            except Exception:  # noqa: BLE001
                self._transcritor = None
        return self._transcritor

    def transcrever(self, nome: str, arq: pathlib.Path, *, normalizar_nivel: bool = False) -> dict | None:
        """Transcrição (cache por nome). normalizar_nivel: leva o áudio a -20 LUFS antes (stem baixo, tipo tom de sala)."""
        if nome in self._tr:
            return self._tr[nome]
        tr = self.transcritor()
        if tr is None or arq is None or not pathlib.Path(arq).exists():
            self._tr[nome] = None
            return None
        alvo = pathlib.Path(arq)
        if normalizar_nivel:
            import soundfile as sf
            x, sr = sf.read(str(arq), dtype="float32", always_2d=True)
            x = x.mean(1)
            if float(np.abs(x).max()) < 1e-7:
                self._tr[nome] = {"segmentos": [], "silencio": True}
                return self._tr[nome]
            try:
                import pyloudnorm as pyln
                lf = pyln.Meter(sr).integrated_loudness(x.astype(np.float64))
                g = 10 ** ((-20 - lf) / 20) if np.isfinite(lf) else 1.0
            except Exception:  # noqa: BLE001
                g = 0.1 / (np.sqrt(np.mean(x ** 2)) + 1e-9)
            x = np.clip(x * g, -1, 1)
            alvo = self.evid / f"_{nome}_norm.wav"
            sf.write(str(alvo), x, sr, subtype="PCM_16")
        try:
            r = tr.transcrever(alvo, idioma="pt", palavras=True)
        except BaseException as e:  # noqa: BLE001 - MemoryError incluso; KeyboardInterrupt/SystemExit sobem
            if isinstance(e, (KeyboardInterrupt, SystemExit)):
                raise
            r = {"segmentos": [], "erro": f"{type(e).__name__}: {e}"}
        if normalizar_nivel:
            alvo.unlink(missing_ok=True)
        self._tr[nome] = r
        return r

    @staticmethod
    def nao_verificado(tr: dict | None, onde: str = "mix") -> dict | None:
        """Transcrição ausente (sem transcritor) ou que quebrou (MemoryError, modelo faltando) NÃO é "sem problema":
        a checagem reprova e bloqueia, com o motivo. Lição de 17/11: o laço de voz não pode passar calado."""
        if tr is None:
            return {"ok": False, "bloqueia": True,
                    "detalhe": f"NÃO VERIFICADO: transcritor indisponível para o {onde}; a versão não é entregue sem ouvir"}
        if tr.get("erro"):
            return {"ok": False, "bloqueia": True,
                    "detalhe": f"NÃO VERIFICADO: a transcrição do {onde} quebrou ({str(tr['erro'])[:160]}); a versão não é entregue sem ouvir"}
        return None

    @staticmethod
    def palavras(tr: dict | None, conf_min: float = 0.0) -> list[list]:
        """[[s, e, palavra_normalizada, conf]] sem as frases-fantasma do Whisper."""
        if not tr:
            return []
        try:
            from motor.provedores.transcricao_fw import eh_fantasma
        except Exception:  # noqa: BLE001
            eh_fantasma = lambda _t: False  # noqa: E731
        out = []
        for s in tr.get("segmentos", []):
            if eh_fantasma(s.get("texto", "")):
                continue
            for w in s.get("palavras") or []:
                n = normalizar(w[2])
                if n and (w[3] if len(w) > 3 and w[3] is not None else 1.0) >= conf_min:
                    out.append([w[0], w[1], n, w[3] if len(w) > 3 else None])
        return out

    # ---------- EDL
    def palavras_legenda(self) -> list[list]:
        """[t0, t1, texto] das legendas (do EDL ou das camadas 'legenda' prontas do filme legado).

        Sem `legendas.palavras`, as frases de `legenda_revelada` entram palavra a palavra, com o tempo da frase dividido
        por igual (aproximação: para a régua de ouvido ficar exata, mande as palavras com tempo em `legendas.palavras`)."""
        pal = [[w[0], w[1], str(w[2])] for w in (self.edl.get("legendas") or {}).get("palavras", [])]
        if not pal:
            for m in self.edl.get("motion", []):
                if m["modelo"] == "legenda":
                    for w in m["props"].get("palavras", []):
                        pal.append([w.get("i", m["de"]), w.get("f", m["ate"]), str(w.get("p", ""))])
                elif m["modelo"] == "legenda_revelada":
                    for fr in m["props"].get("frases", []):
                        # " / " é a quebra manual de linha do kit (split /\s+\/\s+/), não palavra: não entra na régua
                        ws = [x.strip("*") for x in str(fr.get("texto", "")).split() if x.strip("*") and x.strip("*") != "/"]
                        de, ate = float(fr.get("de", m["de"])), float(fr.get("ate", m["ate"]))
                        passo = (ate - de) / max(1, len(ws))
                        pal += [[round(de + j * passo, 3), round(de + (j + 1) * passo, 3), x] for j, x in enumerate(ws)]
        return sorted(pal)


# Checagens recém-chegadas que ainda estão em revisão: medem e avisam, mas não seguram a entrega. Sai daqui = bloqueia.
# Desde a integração de 19/11, fala_cortada, voz_externa e cobertura_sintonia BLOQUEIAM (ordem do dono: "QA que
# bloqueia"); o recuo para uma delas é explícito no EDL (qa.cortes_confirmados, qa.vozes_confirmadas, plano.cobertura).
# olho_ia (revisão por IA, item C) segue em observação até vermos como se comporta em peças reais.
EM_OBSERVACAO: tuple[str, ...] = ()          # vazio desde 19/11: o olho de IA também segura a entrega (dono: "resolva tudo")


def _rodar(nome: str, c: Conferencia) -> dict:
    mod = importlib.import_module(f"motor.etapas.qa.{nome}")
    t = time.time()
    try:
        r = mod.checar(c) or {}
    except Exception as e:  # noqa: BLE001 - checagem que quebra reprova (nunca passa calada)
        r = {"ok": False, "detalhe": f"a checagem quebrou: {type(e).__name__}: {e}"[:400]}
    item = {"id": mod.ID, "ok": bool(r.get("ok")), "bloqueia": bool(r.get("bloqueia", mod.BLOQUEIA))}
    for k in ("valor", "detalhe", "evidencia"):
        if r.get(k) is not None:
            item[k] = r[k]
    item.setdefault("detalhe", "")
    if mod.ID in EM_OBSERVACAO and item["bloqueia"]:
        item["bloqueia"] = False
        if not item["ok"]:
            item["detalhe"] = "[em observação, ainda não segura a entrega] " + item["detalhe"]
    item["detalhe"] = (item["detalhe"] + f" [{time.time() - t:.1f} s]").strip()
    return item


def conferir(final, edl: dict, cfg, *, mix=None, stems=None, overlay_dir=None, evidencias=None, fontes=None, cor=None,
             video_chave: str | None = None, so: list[str] | None = None, progresso=None, montagem: dict | None = None) -> dict:
    t0 = time.time()
    c = Conferencia(final, edl, cfg, mix=mix, stems=stems, overlay_dir=overlay_dir, evidencias=evidencias, fontes=fontes, cor=cor,
                    montagem=montagem)
    itens = []
    nomes = [n for n in CHECAGENS if not so or n in so]
    from motor.etapas import passos
    for i, nome in enumerate(nomes):
        c.ja_reprovou = any((not x["ok"]) and x["bloqueia"] for x in itens)     # checagem paga não roda em versão já reprovada
        # mesa ao vivo: um passo da Lupa por checagem, com o resultado e o achado (o detalhe da checagem, sem o tempo)
        with passos.passo(f"qa.{nome}", ferramenta=f"motor.etapas.qa.{nome}", nome=nome) as ps:
            item = _rodar(nome, c)
            itens.append(item)
            ps.anotar(resultado="ok" if item["ok"] else ("reprovou" if item["bloqueia"] else "aviso"))
            det = re.sub(r"\s*\[\d+(\.\d+)? s\]$", "", item.get("detalhe") or "").strip()
            ps.achou(("reprovou: " if not item["ok"] and item["bloqueia"] else "") + det if det else ("reprovou" if not item["ok"] and item["bloqueia"] else None))
        if progresso:
            progresso((i + 1) / len(nomes), f"Conferência: {nome}")
    rel = {"versao": "1", "projeto": edl.get("projeto", "p"), "video": video_chave or str(final),
           "aprovado": not any((not x["ok"]) and x["bloqueia"] for x in itens), "checagens": itens, "tempo_s": round(time.time() - t0, 1)}
    from validar import erros
    e = erros("qa", rel)
    if e:
        raise ErroDefinitivo("relatório de QA fora do schema: " + "; ".join(e[:3]))
    return rel


def _resumo_no_passo(rel: dict) -> None:
    """'Passou em 20 de 21 conferências' no passo raiz do QA (mesa ao vivo)."""
    from motor.etapas import passos
    total = len(rel.get("checagens") or [])
    ok = sum(1 for x in rel.get("checagens") or [] if x.get("ok"))
    seguram = [x["id"] for x in rel.get("checagens") or [] if not x.get("ok") and x.get("bloqueia")]
    passos.anotar(aprovadas=ok, total=total)
    passos.achou(f"Passou em {ok} de {total} conferências" + (f"; segurou a entrega: {', '.join(seguram[:4])}" if seguram else ""))


def resumo(rel: dict) -> str:
    falhas = [f"{x['id']}: {x.get('detalhe', '')}" for x in rel["checagens"] if not x["ok"] and x["bloqueia"]]
    return "aprovado" if rel["aprovado"] else "reprovado — " + " | ".join(falhas)


def resumo_coluna(rel: dict, chave: str) -> dict:
    """O que vai na coluna versoes.qa: JSON curto que o site lê direto (aprovado + cada checagem), e a chave do relatório."""
    return {"aprovado": rel["aprovado"], "chave": chave, "tempo_s": rel.get("tempo_s"),
            "checagens": [{"id": x["id"], "ok": x["ok"], "bloqueia": x["bloqueia"], "detalhe": (x.get("detalhe") or "")[:200]}
                          for x in rel["checagens"]]}


def chave_conferencia(sha: str, edl: dict) -> str:
    """O que decide se um qa.json antigo ainda vale: o arquivo conferido (sha256), o conjunto de checagens (e quais estão em
    observação, que muda o que bloqueia), o EDL inteiro
    (edl.qa traz as dispensas: cortes_confirmados, vozes_confirmadas, falas_confirmadas) e as regras da memória do dono.
    Lição de 19/11: com a chave só no sha256, as três checagens novas nunca rodavam num final já conferido."""
    try:
        from motor.memoria.loja import Loja
        regras = Loja().checagens()
    except Exception:  # noqa: BLE001 - sem memória, a chave muda quando ela voltar (e o QA roda de novo)
        regras = None
    return hash_obj(sha, list(CHECAGENS), list(EM_OBSERVACAO), edl, regras)


def pode_reaproveitar(ant: dict, chave_ant: str | None, chave: str) -> bool:
    """Função pura: o relatório antigo só vale se a chave bate E ele traz toda checagem de CHECAGENS."""
    return bool(chave_ant) and chave_ant == chave and set(CHECAGENS) <= {x.get("id") for x in ant.get("checagens") or []}


@etapa("qa")
def etapa_qa(ctx) -> dict:
    from motor.etapas.montagem.comum import Fontes
    p, v = ctx.projeto, ctx.alvo or "v1"
    arm = ctx.armazenamento
    base = f"saidas/{p}/{v}"
    for k in ("edl.json", "final.mp4", "montagem.json"):
        if not arm.existe(f"{base}/{k}"):
            raise ErroDefinitivo(f"QA sem {base}/{k}")
    edl = json.loads(pathlib.Path(arm.caminho_local(f"{base}/edl.json")).read_text(encoding="utf-8"))
    mont = json.loads(pathlib.Path(arm.caminho_local(f"{base}/montagem.json")).read_text(encoding="utf-8"))
    final = pathlib.Path(arm.caminho_local(f"{base}/final.mp4"))
    sha = sha256_arquivo(final)
    chave = chave_conferencia(sha, edl)
    if arm.existe(f"{base}/qa.json") and arm.existe(f"{base}/qa.sha256") and arm.existe(f"{base}/qa.chave"):
        ant = json.loads(pathlib.Path(arm.caminho_local(f"{base}/qa.json")).read_text(encoding="utf-8"))
        chave_ant = pathlib.Path(arm.caminho_local(f"{base}/qa.chave")).read_text().strip()
        if pathlib.Path(arm.caminho_local(f"{base}/qa.sha256")).read_text().strip() == sha and pode_reaproveitar(ant, chave_ant, chave):
            ctx.con.execute("UPDATE versoes SET estado=?, qa=? WHERE projeto=? AND id=? AND estado!='entregue'",
                            ("aprovada_qa" if ant["aprovado"] else "reprovada_qa", json.dumps(resumo_coluna(ant, f"{base}/qa.json"), ensure_ascii=False), p, v))
            _resumo_no_passo(ant)
            return {"aprovado": ant["aprovado"], "reaproveitado": True, "resumo": resumo(ant), "sha256": sha,
                    "checagens": [x for x in ant["checagens"] if not x["ok"] and x["bloqueia"]]}
    stems = {n: str(arm.caminho_local(k)) for n, k in (mont.get("chaves", {}).get("stems") or {}).items()}
    for n, local in (mont.get("stems_locais") or {}).items():        # stem privado (som do banco isolado): só no disco de trabalho
        if n not in stems and local and pathlib.Path(local).exists():
            stems[n] = str(local)
    mix = arm.caminho_local(mont["chaves"]["mix"]) if mont.get("chaves", {}).get("mix") else None
    evid = pathlib.Path(ctx.cfg.dados) / "tmp" / "qa" / p / v
    rel = conferir(final, edl, ctx.cfg, mix=mix, stems=stems, overlay_dir=mont.get("overlay_dir"), evidencias=evid, cor=mont.get("cor"),
                   fontes=Fontes(edl, arm, ctx.cfg.dados), video_chave=f"{base}/final.mp4", progresso=ctx.progresso, montagem=mont)
    for arq in sorted(evid.glob("*")):
        if arq.is_file() and not arq.name.startswith("_"):
            arm.gravar(f"{base}/qa/{arq.name}", arq)
    import io
    arm.gravar(f"{base}/qa.json", io.BytesIO(json.dumps(rel, ensure_ascii=False, indent=1).encode()))
    arm.gravar(f"{base}/qa.sha256", io.BytesIO(sha.encode()))
    arm.gravar(f"{base}/qa.chave", io.BytesIO(chave.encode()))
    ctx.con.execute("UPDATE versoes SET estado=?, qa=? WHERE projeto=? AND id=?",
                    ("aprovada_qa" if rel["aprovado"] else "reprovada_qa", json.dumps(resumo_coluna(rel, f"{base}/qa.json"), ensure_ascii=False), p, v))
    _resumo_no_passo(rel)
    # saída curta (vai para o job e, se reprovar, para a próxima direção corrigir)
    return {"aprovado": rel["aprovado"], "resumo": resumo(rel), "sha256": sha,
            "checagens": [{"id": x["id"], "ok": False, "detalhe": x.get("detalhe", ""), "valor": x.get("valor")}
                          for x in rel["checagens"] if not x["ok"] and x["bloqueia"]]}


__all__ = ["conferir", "Conferencia", "normalizar", "resumo", "CHECAGENS", "hash_obj", "gravar_json"]


def modulacao_db(arq) -> float:
    """Desvio padrão (dB) do envelope de 50 ms, sem os 2 s das pontas. Fala tem sílabas (>= 5-6 dB);
    o tom de sala difuso (espectro médio + fase aleatória) fica perto de 1 dB. Usado para provar 'sem voz por construção'."""
    import numpy as np
    import soundfile as sf
    x, sr = sf.read(str(arq), dtype="float32")
    if x.ndim > 1:
        x = x.mean(1)
    x = x[2 * sr:-2 * sr] if len(x) > 6 * sr else x
    h = int(0.05 * sr)
    n = len(x) // h
    if n < 10:
        return 99.0
    rms = np.sqrt(np.mean(x[:n * h].reshape(n, h) ** 2, axis=1)) + 1e-9
    return float(np.std(20 * np.log10(rms)))
