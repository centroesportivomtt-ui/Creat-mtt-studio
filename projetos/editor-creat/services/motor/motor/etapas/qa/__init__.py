"""Etapa QA (frente C): conferência automática OBRIGATÓRIA antes de entregar (ARQUITETURA §9). Uma checagem por arquivo.

    conferir(final, edl, cfg, mix=, stems=, overlay_dir=, evidencias=) -> relatório válido em qa.schema.json

Cada módulo de checagem exporta ID, BLOQUEIA e `checar(c: Conferencia) -> {ok, valor?, detalhe?, evidencia?}`.
Uma checagem que quebra vira reprovação com o erro no detalhe (nunca passa calada). A versão só é aprovada se nenhuma
checagem que bloqueia falhar. As lições do dono estão aqui: frase repetida no mix/stems, tom de sala com voz, logo
conferida a 100%, LUFS, pico real, quadro preto, legenda x fala, zona segura, regras da memória.
"""
from __future__ import annotations

import importlib
import json
import pathlib
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
             "frase_repetida", "tom_sala_sem_voz", "logo_100", "legenda_sobre_rosto", "telas_desfocadas", "regra_memoria")


def normalizar(txt: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", str(txt).lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return " ".join("".join(ch if ch.isalnum() else " " for ch in t).split())


class Conferencia:
    """Tudo que as checagens precisam, carregado só quando alguma pede (transcrição é cara: cache por arquivo)."""

    def __init__(self, final: pathlib.Path, edl: dict, cfg, *, mix=None, stems=None, overlay_dir=None, evidencias=None, fontes=None):
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
        """[t0, t1, texto] das legendas (do EDL ou das camadas 'legenda' prontas do filme legado)."""
        pal = [[w[0], w[1], str(w[2])] for w in (self.edl.get("legendas") or {}).get("palavras", [])]
        if not pal:
            for m in self.edl.get("motion", []):
                if m["modelo"] == "legenda":
                    for w in m["props"].get("palavras", []):
                        pal.append([w.get("i", m["de"]), w.get("f", m["ate"]), str(w.get("p", ""))])
        return sorted(pal)


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
    item["detalhe"] = (item["detalhe"] + f" [{time.time() - t:.1f} s]").strip()
    return item


def conferir(final, edl: dict, cfg, *, mix=None, stems=None, overlay_dir=None, evidencias=None, fontes=None,
             video_chave: str | None = None, so: list[str] | None = None, progresso=None) -> dict:
    t0 = time.time()
    c = Conferencia(final, edl, cfg, mix=mix, stems=stems, overlay_dir=overlay_dir, evidencias=evidencias, fontes=fontes)
    itens = []
    nomes = [n for n in CHECAGENS if not so or n in so]
    for i, nome in enumerate(nomes):
        itens.append(_rodar(nome, c))
        if progresso:
            progresso((i + 1) / len(nomes), f"Conferência: {nome}")
    rel = {"versao": "1", "projeto": edl.get("projeto", "p"), "video": video_chave or str(final),
           "aprovado": not any((not x["ok"]) and x["bloqueia"] for x in itens), "checagens": itens, "tempo_s": round(time.time() - t0, 1)}
    from validar import erros
    e = erros("qa", rel)
    if e:
        raise ErroDefinitivo("relatório de QA fora do schema: " + "; ".join(e[:3]))
    return rel


def resumo(rel: dict) -> str:
    falhas = [f"{x['id']}: {x.get('detalhe', '')}" for x in rel["checagens"] if not x["ok"] and x["bloqueia"]]
    return "aprovado" if rel["aprovado"] else "reprovado — " + " | ".join(falhas)


def resumo_coluna(rel: dict, chave: str) -> dict:
    """O que vai na coluna versoes.qa: JSON curto que o site lê direto (aprovado + cada checagem), e a chave do relatório."""
    return {"aprovado": rel["aprovado"], "chave": chave, "tempo_s": rel.get("tempo_s"),
            "checagens": [{"id": x["id"], "ok": x["ok"], "bloqueia": x["bloqueia"], "detalhe": (x.get("detalhe") or "")[:200]}
                          for x in rel["checagens"]]}


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
    if arm.existe(f"{base}/qa.json") and arm.existe(f"{base}/qa.sha256"):
        if pathlib.Path(arm.caminho_local(f"{base}/qa.sha256")).read_text().strip() == sha:
            ant = json.loads(pathlib.Path(arm.caminho_local(f"{base}/qa.json")).read_text(encoding="utf-8"))
            ctx.con.execute("UPDATE versoes SET estado=?, qa=? WHERE projeto=? AND id=? AND estado!='entregue'",
                            ("aprovada_qa" if ant["aprovado"] else "reprovada_qa", json.dumps(resumo_coluna(ant, f"{base}/qa.json"), ensure_ascii=False), p, v))
            return {"aprovado": ant["aprovado"], "reaproveitado": True, "resumo": resumo(ant), "sha256": sha,
                    "checagens": [x for x in ant["checagens"] if not x["ok"] and x["bloqueia"]]}
    stems = {n: str(arm.caminho_local(k)) for n, k in (mont.get("chaves", {}).get("stems") or {}).items()}
    mix = arm.caminho_local(mont["chaves"]["mix"]) if mont.get("chaves", {}).get("mix") else None
    evid = pathlib.Path(ctx.cfg.dados) / "tmp" / "qa" / p / v
    rel = conferir(final, edl, ctx.cfg, mix=mix, stems=stems, overlay_dir=mont.get("overlay_dir"), evidencias=evid,
                   fontes=Fontes(edl, arm, ctx.cfg.dados), video_chave=f"{base}/final.mp4", progresso=ctx.progresso)
    for arq in sorted(evid.glob("*")):
        if arq.is_file() and not arq.name.startswith("_"):
            arm.gravar(f"{base}/qa/{arq.name}", arq)
    import io
    arm.gravar(f"{base}/qa.json", io.BytesIO(json.dumps(rel, ensure_ascii=False, indent=1).encode()))
    arm.gravar(f"{base}/qa.sha256", io.BytesIO(sha.encode()))
    ctx.con.execute("UPDATE versoes SET estado=?, qa=? WHERE projeto=? AND id=?",
                    ("aprovada_qa" if rel["aprovado"] else "reprovada_qa", json.dumps(resumo_coluna(rel, f"{base}/qa.json"), ensure_ascii=False), p, v))
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
