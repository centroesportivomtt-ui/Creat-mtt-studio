"""Verificação de fatos (item I, regra permanente do dono, 21/11/2026).

Palavras dele: "Sempre quando tiver informações assim, você confira oficialmente… e na legenda você bote de forma correta,
porque a pessoa pode ter falado errado, mas na legenda você corrige."

Roda no começo da montagem, antes de renderizar:
1. `alegacoes(edl)`: todo número com unidade (ml, litro, kcal, g, %, R$, graus…) que vai para a tela, na legenda ou num
   cartão do motion, vira uma alegação com o trecho, o tempo e onde está.
2. `conferir(...)`: uma chamada ao cérebro com busca na web (web_search, fonte oficial primeiro: fabricante, rótulo;
   varejista grande só como reserva) e os quadros do vídeo no momento de cada alegação (o rótulo visível é lido pela visão
   do modelo, o "OCR"). Volta, por alegação: confirmado / corrigido / sem_fonte, com o valor certo, a URL e a data.
3. `aplicar(...)`: corrige o número na legenda e nos cartões (a fala fica como foi dita; só a tela muda).
4. O relatório vai em edl.qa.fatos; a checagem de QA `fatos` segura a entrega se sobrar número sem fonte.

Custo: uma chamada por conjunto de alegações (cache pelo conteúdo: refazer a versão não paga de novo), no livro de gastos.
Desliga com EDITOR_FATOS=0. Sem a chave do cérebro, nada é conferido e o QA avisa (não inventa fonte).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import pathlib
import re
import subprocess
import time

log = logging.getLogger(__name__)

VERSAO = "f1"
# só o que é dado de PRODUTO (volume, peso, energia, teor, preço, temperatura): "há 30 anos" ou "3 dias" é fala da loja
_UNID = (r"ml|mililitros?|l|lt|litros?|kcal|calorias?|cal|kj|g|gr|gramas?|kg|quilos?|mg|miligramas?|%|por\s?cento|"
         r"reais|graus?|°c?|°|un|unidades?")
_NUM = r"\d+(?:[.,]\d+)*"
RE_ALEGACAO = re.compile(rf"(?:R\$\s?{_NUM}|{_NUM}\s?(?:{_UNID})(?![\wà-ú]))", re.I)
_SO_NUM = re.compile(_NUM)


# ---------------- 1. o que vai para a tela ----------------
def _frases_legenda(edl: dict, folga: float = 0.6, maximo: int = 16) -> list[dict]:
    pal = (edl.get("legendas") or {}).get("palavras") or []
    out, atual = [], []
    for i, w in enumerate(pal):
        if atual and (float(w[0]) - float(pal[atual[-1]][1]) > folga or len(atual) >= maximo):
            out.append(atual)
            atual = []
        atual.append(i)
    if atual:
        out.append(atual)
    return [{"onde": "legenda", "indices": ids, "de": float(pal[ids[0]][0]), "ate": float(pal[ids[-1]][1]),
             "texto": " ".join(str(pal[i][2]) for i in ids)} for ids in out]


def _textos(v, caminho=()):
    if isinstance(v, str):
        yield caminho, v
    elif isinstance(v, dict):
        for k, x in v.items():
            yield from _textos(x, caminho + (k,))
    elif isinstance(v, list):
        for k, x in enumerate(v):
            yield from _textos(x, caminho + (k,))


def _textos_motion(edl: dict) -> list[dict]:
    out = []
    for m in edl.get("motion") or []:
        for cam, txt in _textos(m.get("props") or {}):
            if cam and cam[-1] in ("cor", "fonte", "imagem", "chave", "modelo", "posicao", "alinhamento", "estilo"):
                continue
            out.append({"onde": "motion", "camada": m.get("id"), "caminho": list(cam), "de": float(m.get("de", 0)),
                        "ate": float(m.get("ate", 0)), "texto": txt})
    return out


def alegacoes(edl: dict) -> list[dict]:
    out = []
    for fonte in _frases_legenda(edl) + _textos_motion(edl):
        for m in RE_ALEGACAO.finditer(fonte["texto"]):
            out.append({**fonte, "id": f"F{len(out) + 1}", "trecho": m.group(0).strip()})
    return out


# ---------------- 2. conferência (cérebro + busca + rótulo no vídeo) ----------------
SISTEMA = """Você confere os fatos de um vídeo comercial em português do Brasil antes de ele ser publicado.
Cada alegação é um número que vai aparecer escrito na tela (legenda da fala ou cartão). A pessoa pode ter falado errado;
a tela tem de mostrar o valor CORRETO.

Como conferir cada alegação:
- Procure na web a fonte OFICIAL primeiro: site do fabricante ou da marca, ficha técnica, rótulo/embalagem oficial.
  Varejista grande (Pão de Açúcar, Carrefour, Assaí, Amazon…) só quando o oficial não tiver o dado.
- Olhe os quadros do vídeo: se o rótulo ou a embalagem aparece e dá para ler, use o que está escrito como prova.
- Atenção à variante: lata x garrafa x long neck, tamanho, versão (zero, ultra, light), sabor. O vídeo mostra qual é.
- "confirmado": o valor dito bate com a fonte. "corrigido": a fonte diz outro valor (dê o valor certo no MESMO formato do
  trecho, ex.: "275 ml"). "sem_fonte": não achou fonte confiável; não chute.
- Preço, desconto e quantidade de oferta da loja só se confirmam pelo PEDIDO DO CLIENTE (no contexto abaixo):
  se o pedido traz o valor, "confirmado" com fonte_tipo "pedido_do_cliente"; se não traz, "sem_fonte".
Responda SOMENTE com um objeto JSON, sem texto antes ou depois:
{"itens":[{"id":"F1","status":"confirmado|corrigido|sem_fonte","dito":"<trecho>","correto":"<valor certo no formato do trecho, ou igual ao dito>",
"produto":"<produto e variante conferidos>","fonte_url":"<url ou vazio>","fonte_tipo":"fabricante|rotulo_no_video|pedido_do_cliente|varejista|outro|nenhuma",
"observacao":"<uma frase curta>"}]}"""


def _quadro(fontes, edl: dict, t: float, destino: pathlib.Path) -> bytes | None:
    """Quadro da FONTE no tempo t do filme (antes da montagem não existe filme): plano em t -> arquivo e segundo."""
    for p in edl.get("planos") or []:
        try:
            if not float(p["t0"]) <= t < float(p["t1"]):
                continue
            s = float(p["s0"]) + (t - float(p["t0"])) * float(p.get("vel") or 1.0)
        except (KeyError, TypeError, ValueError):
            continue
        try:
            video = fontes.video(p["fonte"])
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, s):.3f}", "-i", str(video), "-frames:v", "1",
                            "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", str(destino)], check=True, timeout=60)
            return destino.read_bytes()
        except Exception as e:  # noqa: BLE001 - sem quadro: confere só pela web
            log.warning("fatos: sem quadro em %.2f s (%s)", t, e)
            return None
    return None


def _tem_plano(edl: dict, t: float) -> bool:
    for p in edl.get("planos") or []:
        try:
            if float(p["t0"]) <= t < float(p["t1"]):
                return True
        except (KeyError, TypeError, ValueError):
            continue
    return False


def _chave_cache(alegs: list[dict], contexto: str) -> str:
    base = json.dumps([[a["id"], a["trecho"], a["texto"]] for a in alegs] + [contexto, VERSAO], ensure_ascii=False)
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _json(texto: str) -> dict:
    from motor.cerebro.anthropic_api import _json_do_texto
    return json.loads(_json_do_texto(texto))


def perguntar(cfg, alegs: list[dict], contexto: str, quadros: dict[str, bytes]) -> tuple[dict, dict]:
    """Uma chamada com busca na web e os quadros. Devolve (resposta, uso com custo em US$)."""
    import base64

    from motor import config
    from motor.cerebro import orcamento
    cli = config.cliente_anthropic()
    modelo = os.environ.get("EDITOR_MODELO_FATOS", "").strip() or cfg.modelo_direcao
    conteudo = []
    for aid, jpg in quadros.items():
        conteudo.append({"type": "text", "text": f"Quadro do vídeo no momento de {aid}:"})
        conteudo.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                      "data": base64.standard_b64encode(jpg).decode()}})
    linhas = [f"Contexto do vídeo: {contexto or '(sem descrição)'}", f"Data de hoje: {time.strftime('%d/%m/%Y')}", "Alegações:"]
    linhas += [f"- {a['id']} · {a['onde']} aos {a['de']:.1f} s · trecho \"{a['trecho']}\" · frase: \"{a['texto']}\"" for a in alegs]
    conteudo.append({"type": "text", "text": "\n".join(linhas)})
    mensagens = [{"role": "user", "content": conteudo}]
    ferramentas = [{"type": "web_search_20260209", "name": "web_search", "max_uses": min(10, 2 + 2 * len(alegs)),
                    "user_location": {"type": "approximate", "country": "BR"}}]
    entrada = saida = lido = escrito = buscas = 0
    for _volta in range(4):                    # pause_turn: a busca longa devolve o turno; continua de onde parou
        with cli.beta.messages.stream(model=modelo, max_tokens=16000, thinking={"type": "adaptive"}, output_config={"effort": "medium"},
                                      system=SISTEMA, messages=mensagens, tools=ferramentas,
                                      betas=["server-side-fallback-2026-07-01"], fallbacks="default") as st:
            msg = st.get_final_message()
        u = msg.usage
        entrada += int(u.input_tokens or 0)
        saida += int(u.output_tokens or 0)
        lido += int(getattr(u, "cache_read_input_tokens", 0) or 0)
        escrito += int(getattr(u, "cache_creation_input_tokens", 0) or 0)
        buscas += int(getattr(getattr(u, "server_tool_use", None), "web_search_requests", 0) or 0)
        if msg.stop_reason == "pause_turn":
            mensagens = mensagens + [{"role": "assistant", "content": msg.content}]
            continue
        break
    if msg.stop_reason == "refusal":
        raise RuntimeError("o modelo recusou a conferência")
    texto = "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
    uso = orcamento.uso(getattr(msg, "model", modelo), entrada=entrada, saida=saida, cache_lido=lido, cache_escrito=escrito,
                        estimado=False, cerebro="anthropic", esforco="medium")
    uso["buscas"] = buscas
    uso["custo_usd"] = round(float(uso.get("custo_usd") or 0) + buscas * 0.01, 4)     # busca na web: US$ 10 a cada 1.000
    return _json(texto), uso


# ---------------- 3. correção na tela ----------------
def _numero(s: str) -> str | None:
    m = _SO_NUM.search(s or "")
    return m.group(0) if m else None


def _norm_num(s: str) -> str:
    return re.sub(r"[.,]", "", s or "")


_RE_UNID = re.compile(rf"(?:{_UNID})", re.I)


def _unidade(trecho: str) -> str:
    """Unidade do trecho ("269 ml" -> "ml", "R$ 4,99" -> "r$")."""
    t = (trecho or "").strip()
    if t.upper().startswith("R$"):
        return "r$"
    resto = _SO_NUM.sub("", t, count=1).strip()
    return resto.lower()


def aplicar(edl: dict, alegs: list[dict], itens: list[dict]) -> list[dict]:
    """Troca, na tela, o valor dito pelo correto: o número e, se a fonte mudou a unidade, a unidade também.
    Ancora no trecho que o MOTOR achou (não no que o modelo devolveu): o modelo pode reescrever o "dito"."""
    pal = (edl.get("legendas") or {}).get("palavras") or []
    por_id = {a["id"]: a for a in alegs}
    trocas = []
    for it in itens:
        a = por_id.get(it.get("id"))
        if not a or it.get("status") != "corrigido":
            continue
        dito, certo = a["trecho"], str(it.get("correto") or "").strip()
        nd, nc = _numero(dito), _numero(certo)
        ud, uc = _unidade(dito), _unidade(certo)
        if not nd or not nc:
            continue
        if _norm_num(nd) == _norm_num(nc) and ud == uc:
            continue                                   # "corrigido" que é igual ao dito: nada a trocar
        if a["onde"] == "legenda":
            ids = a["indices"]
            for k, i in enumerate(ids):
                tok = str(pal[i][2])
                n_tok = _numero(tok)
                if not n_tok or _norm_num(n_tok) != _norm_num(nd):
                    continue
                antes = [str(pal[j][2]) for j in ids[k:k + 2]]
                pal[i][2] = tok.replace(n_tok, nc, 1)
                if ud != uc:
                    if ud and ud in tok.lower():                       # "269ml" colado
                        pal[i][2] = re.sub(re.escape(ud), uc, pal[i][2], count=1, flags=re.I)
                    elif k + 1 < len(ids) and ud and _RE_UNID.fullmatch(re.sub(r"[^\w%°]", "", str(pal[ids[k + 1]][2])) or "x"):
                        j = ids[k + 1]
                        pal[j][2] = re.sub(re.escape(re.sub(r"[^\w%°]", "", str(pal[j][2]))), uc, str(pal[j][2]), count=1)
                    else:
                        pal[i][2] = tok                                 # não achei onde pôr a unidade: não troca pela metade
                        break
                trocas.append({"id": a["id"], "onde": "legenda", "t": float(pal[i][0]), "de": " ".join(antes),
                               "para": " ".join(str(pal[j][2]) for j in ids[k:k + 2])})
                break
        else:
            for m in edl.get("motion") or []:
                if m.get("id") != a["camada"]:
                    continue
                alvo = m["props"]
                for k in a["caminho"][:-1]:
                    alvo = alvo[k]
                velho = alvo[a["caminho"][-1]]
                novo = velho.replace(dito, certo if RE_ALEGACAO.fullmatch(certo) else dito.replace(nd, nc), 1)
                if novo != velho:
                    alvo[a["caminho"][-1]] = novo
                    trocas.append({"id": a["id"], "onde": "motion", "camada": a["camada"], "de": velho, "para": novo})
    feitas = {t["id"] for t in trocas}
    for it in itens:                                   # corrigido que não virou troca na tela NÃO pode passar como feito
        a = por_id.get(it.get("id"))
        if a and it.get("status") == "corrigido" and it["id"] not in feitas:
            nd, nc = _numero(a["trecho"]), _numero(str(it.get("correto") or ""))
            if not (nd and nc and _norm_num(nd) == _norm_num(nc) and _unidade(a["trecho"]) == _unidade(str(it.get("correto")))):
                it["status"], it["observacao"] = "sem_fonte", f"a correção para {it.get('correto')} não coube na tela: confira à mão"
    return trocas


# ---------------- 4. a etapa (chamada pela montagem) ----------------
def revisar(edl: dict, cfg, fontes=None, *, contexto: str = "", projeto: str | None = None, trabalho: pathlib.Path | None = None) -> dict:
    """Confere e corrige o EDL no lugar; grava o relatório em edl.qa.fatos e devolve o relatório."""
    rel = {"versao": VERSAO, "estado": "sem_numeros", "itens": [], "trocas": []}
    if os.environ.get("EDITOR_FATOS", "1").strip() == "0":
        rel["estado"] = "desligado"
        return _guardar(edl, rel)
    ja = (edl.get("qa") or {}).get("fatos") or {}
    alegs = alegacoes(edl)
    if not alegs:
        return _guardar(edl, rel)
    if ja.get("versao") == VERSAO and ja.get("estado") == "conferido" and _chave_cache(alegs, contexto) in (ja.get("chave"), ja.get("chave_saida")):
        return ja                                   # o EDL já foi conferido (e corrigido) nesta mesma forma: não paga de novo
    rel.update(alegacoes=[{k: a[k] for k in ("id", "onde", "de", "ate", "trecho", "texto")} for a in alegs])
    if cfg.provedor_efetivo("cerebro") != "anthropic":
        rel["estado"] = "nao_conferido"
        rel["motivo"] = "este motor está sem a chave do cérebro: os números não foram conferidos"
        return _guardar(edl, rel)
    chave = _chave_cache(alegs, contexto)
    arq = pathlib.Path(cfg.dados) / "cache" / "fatos" / f"{chave}.json"
    resp = uso = None
    if arq.exists():
        try:
            guardado = json.loads(arq.read_text(encoding="utf-8"))
            resp, uso = guardado["resposta"], dict(guardado["uso"], reaproveitado=True)
        except (ValueError, KeyError):
            resp = None
    guardar = resp is None
    if resp is None:
        quadros = {}
        if fontes is not None and trabalho is not None:
            trabalho.mkdir(parents=True, exist_ok=True)
            vistos = set()
            for a in alegs[:8]:                      # teto de 8 quadros por versão (custo)
                t = round((a["de"] + a["ate"]) / 2, 1)
                if t in vistos:
                    continue
                vistos.add(t)
                jpg = _quadro(fontes, edl, t, trabalho / f"fato_{a['id']}.jpg")
                if jpg:
                    quadros[a["id"]] = jpg
                elif _tem_plano(edl, t):
                    guardar = False                   # o quadro devia existir e falhou: não congela a resposta no cache
        from motor.cerebro import gastos
        try:
            resp, uso = perguntar(cfg, alegs, contexto, quadros)
        except Exception as e:  # noqa: BLE001 - API fora, recusa ou JSON inválido: o QA segura, nada é inventado
            rel["estado"] = "falhou"
            rel["motivo"] = f"a conferência falhou ({type(e).__name__}: {str(e)[:160]})"
            return _guardar(edl, rel)
        gastos.registrar(cfg, "fatos", {k: uso.get(k) for k in ("modelo", "entrada", "entrada_cache", "saida", "buscas", "custo_usd")}, projeto=projeto)
    validos = {a["id"] for a in alegs}
    itens = [it for it in (resp.get("itens") or []) if isinstance(it, dict) and it.get("id") in validos]
    vistos = {it["id"] for it in itens}
    faltou = [a for a in alegs if a["id"] not in vistos]
    itens += [{"id": a["id"], "status": "sem_fonte", "dito": a["trecho"], "correto": a["trecho"], "fonte_url": "", "fonte_tipo": "nenhuma",
               "observacao": "a conferência não respondeu sobre este número"} for a in faltou]
    if guardar and not faltou:                         # resposta incompleta não fica no cache: a próxima montagem pergunta de novo
        arq.parent.mkdir(parents=True, exist_ok=True)
        arq.write_text(json.dumps({"resposta": resp, "uso": uso, "em": time.strftime("%Y-%m-%dT%H:%M:%S")}, ensure_ascii=False), encoding="utf-8")
    for it in itens:
        if it.get("status") in ("confirmado", "corrigido") and not str(it.get("fonte_url") or "").startswith("http") \
                and it.get("fonte_tipo") not in ("rotulo_no_video", "pedido_do_cliente"):
            it["status"], it["observacao"] = "sem_fonte", "sem URL de fonte: não dá para afirmar"   # sem prova, não vale
    rel.update(estado="conferido", chave=chave, conferido_em=time.strftime("%Y-%m-%d"), itens=itens,
               uso={k: (uso or {}).get(k) for k in ("modelo", "buscas", "custo_usd", "reaproveitado")})
    rel["trocas"] = aplicar(edl, alegs, itens)
    rel["chave_saida"] = _chave_cache(alegacoes(edl), contexto)   # a forma já corrigida também conta como conferida
    return _guardar(edl, rel)


def _guardar(edl: dict, rel: dict) -> dict:
    edl.setdefault("qa", {})["fatos"] = rel
    return rel
