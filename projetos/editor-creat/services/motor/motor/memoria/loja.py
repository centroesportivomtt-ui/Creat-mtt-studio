"""Memória da casa (ARQUITETURA.md §10): regras, vocabulário, checagens, modelos de vídeo e casos.

Raiz: EDITOR_MEMORIA (testes usam uma cópia) ou projetos/editor-creat/memoria (versionada no git).
Toda reprovação do dono vira REGRA (entra no próximo prompt) + CHECAGEM (o QA ou o próprio EDL conferem), com origem.
Gravação atômica; nada de material de cliente aqui (logos de cliente ficam no armazenamento).

Na nuvem (vários contêineres, disco que some): regras.json e checagens.json, os ÚNICOS arquivos que mudam, moram num
objeto do R2 cada (`memoria/regras.json`, `memoria/checagens.json`) com escrita CONDICIONAL (If-Match no ETag lido;
If-None-Match:* na primeira gravação). Duas reprovações ao mesmo tempo em contêineres diferentes: a segunda recebe 412,
relê e refaz a mesclagem; nenhuma se perde. A pasta da raiz (EDITOR_MEMORIA, dentro da imagem) vira só SEMENTE e
continua sendo a fonte de modelos/ e casos/ (que só mudam por commit). Liga com EDITOR_MEMORIA_REMOTA=r2, ou sozinho
com EDITOR_SEM_ESTADO=1 + EDITOR_ARMAZENAMENTO=r2.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
from datetime import datetime, timezone

from motor import config
from motor.etapas.catalogo import norm, tokens


def _raiz() -> pathlib.Path:
    return pathlib.Path(os.environ.get("EDITOR_MEMORIA") or config.MEMORIA)


def _hoje() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _grava(caminho: pathlib.Path, obj) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    tmp = caminho.with_name(caminho.name + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, caminho)


MUTAVEIS = ("regras.json", "checagens.json")
PREFIXO_REMOTO = "memoria/"
TENTATIVAS_CAS = 8


class Conflito(Exception):
    """A versão remota mudou entre ler e gravar (412): reler e refazer."""


class MemoriaR2:
    """regras.json/checagens.json no R2 com escrita condicional pelo ETag. `cliente` = boto3 S3 (ou falso nos testes)."""

    def __init__(self, cliente=None, bucket: str | None = None):
        if cliente is None:
            from motor.provedores.armazenamento_r2 import criar_cliente, faltando
            falta = faltando()
            if falta:
                raise RuntimeError(f"memória no R2 desligada: faltam {', '.join(falta)}")
            cliente = criar_cliente()
        self.s3 = cliente
        self.bucket = bucket or os.environ.get("R2_BUCKET", "").strip()

    @staticmethod
    def _codigo(e) -> str:
        return str(getattr(e, "response", {}).get("Error", {}).get("Code", ""))

    def ler(self, nome: str):
        """(objeto, etag) ou None se ainda não existe no R2."""
        try:
            r = self.s3.get_object(Bucket=self.bucket, Key=PREFIXO_REMOTO + nome)
        except Exception as e:  # noqa: BLE001 - botocore ClientError
            if self._codigo(e) in ("NoSuchKey", "404", "NotFound"):
                return None
            raise
        corpo = r["Body"].read()
        return json.loads(corpo.decode("utf-8")), str(r.get("ETag", "")).strip('"')

    def gravar(self, nome: str, obj, etag: str | None) -> None:
        corpo = (json.dumps(obj, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
        cond = {"IfMatch": f'"{etag}"'} if etag else {"IfNoneMatch": "*"}
        try:
            self.s3.put_object(Bucket=self.bucket, Key=PREFIXO_REMOTO + nome, Body=corpo,
                               ContentType="application/json", **cond)
        except Exception as e:  # noqa: BLE001
            if self._codigo(e) in ("PreconditionFailed", "412", "ConditionalRequestConflict"):
                raise Conflito(nome) from e
            raise


def _remota_padrao():
    modo = os.environ.get("EDITOR_MEMORIA_REMOTA", "").strip().lower()
    if modo in ("local", "nenhuma", "0"):
        return None
    automatico = os.environ.get("EDITOR_SEM_ESTADO", "") == "1" and os.environ.get("EDITOR_ARMAZENAMENTO", "").strip() == "r2"
    if modo == "r2" or (not modo and automatico):
        return MemoriaR2()
    return None


class Loja:
    def __init__(self, raiz: pathlib.Path | str | None = None, *, remota=None):
        self.raiz = pathlib.Path(raiz) if raiz else _raiz()
        self.remota = remota if remota is not None else _remota_padrao()

    # ---------- leitura ----------
    def _ler_semente(self, nome: str, padrao):
        try:
            return json.loads((self.raiz / nome).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return padrao

    def _ler(self, nome: str, padrao):
        if self.remota is not None and nome in MUTAVEIS:
            r = self.remota.ler(nome)
            return r[0] if r is not None else self._ler_semente(nome, padrao)
        return self._ler_semente(nome, padrao)

    def _atualizar(self, nome: str, padrao, mudar) -> dict:
        """Ler-alterar-gravar. Remoto: condicional pelo ETag, relendo e refazendo `mudar` em conflito. Local: atômico
        (quem chama segura a trava de arquivo)."""
        if self.remota is None:
            obj = mudar(self._ler_semente(nome, padrao))
            _grava(self.raiz / nome, obj)
            return obj
        for _ in range(TENTATIVAS_CAS):
            atual = self.remota.ler(nome)
            obj, etag = (atual if atual is not None else (self._ler_semente(nome, padrao), None))
            novo = mudar(json.loads(json.dumps(obj)))
            try:
                self.remota.gravar(nome, novo, etag)
                return novo
            except Conflito:
                continue
        raise RuntimeError(f"memória: {nome} mudou {TENTATIVAS_CAS} vezes seguidas durante a gravação; tente de novo")

    def regras(self, tipo_video: str | None = None) -> list[dict]:
        todas = self._ler("regras.json", {"regras": []})["regras"]
        return [r for r in todas if not r.get("tipos") or not tipo_video or tipo_video in r["tipos"] or tipo_video == "auto"]

    def vocabulario(self) -> list[dict]:
        return self._ler("regras.json", {}).get("vocabulario", [])

    def checagens(self) -> list[dict]:
        return self._ler("checagens.json", {"checagens": []})["checagens"]

    def modelo(self, nome: str) -> dict:
        m = self._ler(f"modelos/{nome}.json", None)
        if m is None:
            m = self._ler("modelos/evento-reel.json", None)
        if m is None:
            raise FileNotFoundError(f"modelo de vídeo '{nome}' não existe em {self.raiz}/modelos")
        return m

    def nomes_modelos(self) -> list[str]:
        return sorted(p.stem for p in (self.raiz / "modelos").glob("*.json"))

    def modelos_para_prompt(self) -> str:
        linhas = []
        for n in self.nomes_modelos():
            m = self.modelo(n)
            linhas.append(f"- {n} ({'/'.join(m.get('tipos', []))}): {m.get('descricao', '')}")
        return "\n".join(linhas)

    def casos(self, tipo_video: str | None = None, n: int = 2) -> list[dict]:
        out = []
        for d in sorted((self.raiz / "casos").glob("*/caso.json")):
            c = json.loads(d.read_text(encoding="utf-8"))
            c["_dir"] = str(d.parent)
            if not tipo_video or tipo_video == "auto" or c.get("tipo_video") == tipo_video:
                out.append(c)
        return out[:n]

    def regras_para_prompt(self, tipo_video: str | None = None) -> str:
        """Bloco de regras da casa para o prompt do sistema (prefixo em cache). Reprovações do dono vêm primeiro."""
        rs = sorted(self.regras(tipo_video), key=lambda r: (not r["id"].startswith("r_dono_"), r["id"]))
        linhas = [f"- {r['texto']} [{r.get('origem', 'casa')}]" for r in rs]
        voc = self.vocabulario()
        if voc:
            linhas.append("- Vocabulário confirmado (a transcrição erra; o resolvedor já corrige na legenda): "
                          + "; ".join(f"{v['de']} -> {v['para']}" for v in voc))
        return "\n".join(linhas)

    def casos_para_prompt(self, tipo_video: str | None = None) -> str:
        linhas = []
        for c in self.casos(tipo_video):
            linhas.append(f"- caso {c['id']} ({c.get('tipo_video')}, {c.get('modelo')}): pedido «{c.get('pedido', '')[:160]}» · "
                          f"estrutura: {c.get('estrutura', '')} · nota do dono: {c.get('nota_dono', '—')}")
        return "\n".join(linhas)

    # ---------- reprovação do dono -> regra + checagem ----------
    def registrar_reprovacao(self, projeto: str, versao: str, motivo: str, *, cerebro=None) -> dict:
        """Ler-alterar-gravar das regras com trava de arquivo: duas reprovações ao mesmo tempo não perdem uma."""
        if self.remota is not None:     # a trava é a escrita condicional no R2 (vale entre contêineres)
            return self._registrar_reprovacao(projeto, versao, motivo, cerebro=cerebro)
        import fcntl
        with open(self.raiz / ".trava", "a+") as trava:
            fcntl.flock(trava, fcntl.LOCK_EX)
            try:
                return self._registrar_reprovacao(projeto, versao, motivo, cerebro=cerebro)
            finally:
                fcntl.flock(trava, fcntl.LOCK_UN)

    def _registrar_reprovacao(self, projeto: str, versao: str, motivo: str, *, cerebro=None) -> dict:
        motivo = " ".join(motivo.split())
        if not motivo:
            raise ValueError("motivo vazio")
        proposta = None
        uso = None
        if cerebro is not None and getattr(cerebro, "nome", "") == "anthropic":
            try:
                proposta, uso = cerebro.leve(tarefa="reprovacao", texto=motivo, esquema=ESQUEMA_PROPOSTA)
            except Exception:  # noqa: BLE001 - sem cérebro leve, a heurística resolve
                proposta = None
        if not isinstance(proposta, dict):
            proposta = propor_regra(motivo)
        h = hashlib.sha1(norm(motivo).encode()).hexdigest()[:8]
        origem = f"reprovação do dono · {projeto}/{versao} · {_hoje()}"
        regra = {"id": f"r_dono_{h}", "texto": proposta["regra"], "origem": origem, "data": _hoje(), "tipos": None, "motivo": motivo}
        chec = dict(proposta["checagem"], id=f"c_dono_{h}", origem=origem, motivo=motivo)
        chec.setdefault("gravidade", "bloqueia")
        def mudar_regras(reg):
            reg["regras"] = [r for r in reg.get("regras", []) if r["id"] != regra["id"]] + [regra]
            for v in proposta.get("vocabulario", []):
                if not any(norm(x["de"]) == norm(v["de"]) for x in reg.setdefault("vocabulario", [])):
                    reg["vocabulario"].append({"de": v["de"], "para": v["para"], "origem": origem})
            return reg

        def mudar_checagens(ch):
            ch["checagens"] = [c for c in ch.get("checagens", []) if c["id"] != chec["id"]] + [chec]
            return ch
        self._atualizar("regras.json", {"versao": "1", "regras": [], "vocabulario": []}, mudar_regras)
        self._atualizar("checagens.json", {"versao": "1", "checagens": []}, mudar_checagens)
        return {"regra": regra, "checagem": chec, "vocabulario": proposta.get("vocabulario", []), "uso": uso}

    # ---------- checagens que o próprio EDL responde (o QA da frente C chama) ----------
    def avaliar_edl(self, edl: dict) -> list[dict]:
        return [avaliar(c, edl) for c in self.checagens() if c.get("executor", "edl") == "edl"]


ESQUEMA_PROPOSTA = {
    "type": "object", "additionalProperties": False, "required": ["regra", "checagem", "vocabulario"],
    "properties": {
        "regra": {"type": "string"},
        "checagem": {"type": "object", "additionalProperties": False, "required": ["executor", "tipo", "params", "descricao"],
                     "properties": {"executor": {"enum": ["edl", "qa"]},
                                    "tipo": {"enum": ["legenda_proibida", "fecho_contem", "duracao_max", "duracao_min", "vazio_max_s",
                                                      "frase_repetida", "tom_sala_sem_voz", "logo_100", "revisao_humana"]},
                                    "params": {"type": "object", "additionalProperties": False,
                                               "properties": {"palavras": {"type": "array", "items": {"type": "string"}},
                                                              "texto": {"type": "string"}, "s": {"type": "number"}}},
                                    "descricao": {"type": "string"}}},
        "vocabulario": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["de", "para"],
                                                   "properties": {"de": {"type": "string"}, "para": {"type": "string"}}}},
    },
}

_ASPAS = r"[\"'“”‘’«»]"


def propor_regra(motivo: str) -> dict:
    """Heurística sem custo (cérebro fixture): transforma o motivo do dono em regra + checagem verificável."""
    m = motivo.strip()
    baixo = m.lower()
    # "não é X, é Y" / "é Y, não X" / "X está errado, o certo é Y"
    pares = [
        re.search(rf"n[ãa]o [ée] {_ASPAS}?([^,;.\"'”»]+?){_ASPAS}?\s*[,;]?\s*(?:e sim|[ée]|mas)\s+{_ASPAS}?([^,;.\"'”»]+){_ASPAS}?", m, re.I),
        re.search(rf"{_ASPAS}([^\"'”»]+){_ASPAS}\s*(?:est[áa] errad[oa]|errad[oa]).*?(?:certo|correto) [ée]\s*{_ASPAS}?([^\"'”».,;]+)", m, re.I),
    ]
    for p in pares:
        if p:
            errado, certo = p.group(1).strip(), p.group(2).strip()
            sobra_e = [w for w in tokens(errado) if w not in set(tokens(certo))] or tokens(errado)
            return {"regra": f"Legenda e texto: é \"{certo}\", nunca \"{errado}\" (o dono confirmou de ouvido).",
                    "checagem": {"executor": "edl", "tipo": "legenda_proibida", "params": {"palavras": sobra_e[:3]},
                                 "descricao": f"Legenda não pode ter \"{errado}\"; o certo é \"{certo}\"."},
                    "vocabulario": [{"de": errado, "para": certo}] if len(tokens(errado)) == len(tokens(certo)) else []}
    arroba = re.search(r"@[\w.]+", m)
    if arroba:
        return {"regra": f"O fecho mostra {arroba.group(0)}.", "checagem": {"executor": "edl", "tipo": "fecho_contem", "params": {"texto": arroba.group(0)},
                                                                             "descricao": f"Fecho com {arroba.group(0)}."}, "vocabulario": []}
    if re.search(r"repet|laço|loop", baixo):
        return {"regra": f"Nada de frase ou som se repetindo: {m}", "checagem": {"executor": "qa", "tipo": "frase_repetida", "params": {},
                                                                                "descricao": "Transcrever mix e stems; frase repetida reprova."}, "vocabulario": []}
    if re.search(r"logo", baixo):
        return {"regra": f"Logo sempre em alta, conferida a 100%: {m}", "checagem": {"executor": "qa", "tipo": "logo_100", "params": {},
                                                                                    "descricao": "Logo conferida em quadro cheio."}, "vocabulario": []}
    if re.search(r"long[oa]|comprid|cansativ|demor", baixo):
        return {"regra": f"Mais curto e direto: {m}", "checagem": {"executor": "edl", "tipo": "duracao_max", "params": {"s": 60.0},
                                                                  "descricao": "Duração máxima pedida pelo dono."}, "vocabulario": []}
    if re.search(r"parad|lent|ar morto|vazio|sem ritmo", baixo):
        return {"regra": f"Ritmo: nada de ar morto. {m}", "checagem": {"executor": "edl", "tipo": "vazio_max_s", "params": {"s": 0.8},
                                                                      "descricao": "Vazio máximo de 0,8 s."}, "vocabulario": []}
    return {"regra": f"Ajuste do dono: {m}", "checagem": {"executor": "qa", "tipo": "revisao_humana", "params": {"texto": m},
                                                          "descricao": "Conferir à mão antes de entregar."}, "vocabulario": []}


def avaliar(c: dict, edl: dict) -> dict:
    tipo, p = c["tipo"], c.get("params", {})
    ok, detalhe = True, ""
    if tipo == "legenda_proibida":
        proib = {norm(w) for w in p.get("palavras", [])}
        achadas = sorted({norm(str(w[2])) for w in edl.get("legendas", {}).get("palavras", [])} & proib)
        ok, detalhe = not achadas, (f"legenda tem {achadas}" if achadas else "")
    elif tipo == "fecho_contem":
        fechos = [json.dumps(m["props"], ensure_ascii=False) for m in edl.get("motion", []) if m["modelo"].startswith("fecho")]
        ok = any(p.get("texto", "") in f for f in fechos)
        detalhe = "" if ok else f"fecho sem {p.get('texto')}"
    elif tipo == "duracao_max":
        ok, detalhe = edl["duracao"] <= p.get("s", 1e9), f"{edl['duracao']:.1f} s"
    elif tipo == "duracao_min":
        ok, detalhe = edl["duracao"] >= p.get("s", 0), f"{edl['duracao']:.1f} s"
    elif tipo == "vazio_max_s":
        marcas = sorted([(v["t0"], v["t1"]) for v in edl.get("voz", [])] + [(m["de"], m["ate"]) for m in edl.get("motion", []) if m["modelo"] != "legenda"]
                        + [(f["t"], f["t"] + f.get("dur", 0.2)) for f in edl.get("fx", [])])
        fim, maior = 0.0, 0.0
        for a, b in marcas:
            maior = max(maior, a - fim)
            fim = max(fim, b)
        maior = max(maior, edl["duracao"] - fim)
        ok, detalhe = maior <= p.get("s", 1.2), f"maior vazio {maior:.2f} s"
    else:
        ok, detalhe = True, "fora do EDL"
    return {"id": c["id"], "tipo": tipo, "ok": ok, "gravidade": c.get("gravidade", "bloqueia"), "detalhe": detalhe}
