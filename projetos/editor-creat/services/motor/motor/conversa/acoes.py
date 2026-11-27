"""As duas ações que a conversa faz com o toque do dono (plano 3.2): guarda de estado, cartão e execução.

- propor_ajuste: chama a MESMA função da rota POST /versoes/{v}/reprovar (api/direcao.reprovar), com o texto do
  cartão como motivo. Igual ao botão "Pedir ajuste": refaz direção, montagem e conferência, e vira regra da casa
  (vale para TODOS os projetos). Exceções (revisão de segurança, 25/11): se o texto repete um trecho de algo de fora
  lido nesta conversa (fala de vídeo, texto de cliente: os resultados marcados {"de_fora": ...}), o cartão avisa e o
  ajuste vale SÓ para este projeto, sem regra nem checagem; e o dono pode escolher "só neste projeto" no toque.
- propor_pedido: chama a MESMA função da rota POST /pedido (api/direcao.gravar_pedido) com os campos novos por cima
  do pedido.json atual.

A guarda roda ao criar o cartão e de novo no toque (sob trava por projeto no laço). Ela é mais estrita que os
botões: o ajuste só vale para a versão mais nova, entregue e não aprovada, com a fila do projeto vazia; o pedido só
antes de existir versão ou job de edição. As rotas antigas não mudam.
O cartão é montado aqui, pelo código: o modelo não escreve o resumo que o dono lê antes de tocar.
"""
from __future__ import annotations

import hashlib
import json
import re
import statistics

from motor import banco

ETAPAS_EDICAO = ("catalogo", "direcao", "montagem", "qa", "entrega")
RE_VERSAO = re.compile(r"^v([0-9]{1,3})$")
CUSTO_PADRAO_USD = 0.40
MINUTOS_PADRAO = 10
ROTULO_VOZES = {"auto": "automático", "uma": "uma voz", "varias": "várias vozes (conversa)"}
AJUSTAVEIS = ("entregue", "reprovada_qa", "erro")      # os mesmos do botão "Pedir ajuste" da tela
CAMPOS_PEDIDO = ("texto", "formato", "destino", "duracao_alvo", "obrigatorio", "proibido", "vozes", "ambiente")
NOME_CAMPO = {"texto": "Pedido", "formato": "Formato", "destino": "Onde vai sair", "duracao_alvo": "Duração",
              "obrigatorio": "Precisa ter", "proibido": "Não pode ter", "vozes": "Vozes", "ambiente": "Ambiente"}


def _num(v: str) -> int:
    m = RE_VERSAO.fullmatch(v or "")
    return int(m.group(1)) if m else -1


def _dados(con, pid: str) -> dict:
    r = con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()
    return json.loads(r["dados"] or "{}") if r else {}


def versoes(con, pid: str) -> list[dict]:
    vs = [dict(r) for r in con.execute("SELECT id, estado FROM versoes WHERE projeto=?", (pid,))]
    return sorted(vs, key=lambda v: _num(v["id"]))


def _outra_confirmacao(con, pid: str, tool_use_id: str | None) -> bool:
    r = con.execute("SELECT tool_use_id FROM conversa_espera WHERE projeto=? AND tipo='confirmacao'", (pid,)).fetchone()
    return r is not None and r["tool_use_id"] != tool_use_id


def guarda_ajuste(con, pid: str, versao: str, *, tool_use_id: str | None = None) -> str | None:
    """None = pode. Senão, o porquê em pt-BR simples (vai para o Nimbus e para o cartão 'Não deu')."""
    vs = versoes(con, pid)
    v = next((x for x in vs if x["id"] == versao), None)
    if v is None:
        return f"a versão {versao} não existe"
    # 27/11 (Bastidores do Super Kal): a versão que a conferência segurou também pede ajuste, como o botão da tela; senão o
    # projeto reprovado depois das 2 correções automáticas ficava sem saída nenhuma
    if v["estado"] not in AJUSTAVEIS:
        return f"a {versao} ainda não está pronta (está {v['estado']})"
    if versao in (_dados(con, pid).get("aprovadas") or {}):
        return f"a {versao} já foi aprovada"
    nova = vs[-1]["id"]
    if nova != versao:
        return f"a {versao} não é a mais nova; a mais nova é a {nova}"
    q = ",".join("?" * len(ETAPAS_EDICAO))
    if con.execute(f"SELECT 1 FROM jobs WHERE projeto=? AND etapa IN ({q}) AND estado IN ('pendente','rodando') LIMIT 1",
                   (pid, *ETAPAS_EDICAO)).fetchone():
        return f"a {versao} já está sendo refeita ou conferida; espere terminar"
    if _outra_confirmacao(con, pid, tool_use_id):
        return "já existe outro cartão esperando o seu toque"
    return None


def guarda_pedido(con, pid: str, *, tool_use_id: str | None = None) -> str | None:
    r = con.execute("SELECT estado FROM projetos WHERE id=?", (pid,)).fetchone()
    if r is None:
        return "projeto não encontrado"
    if r["estado"] not in ("recebendo", "lendo"):
        return "a edição já começou; para mudar agora, peça um ajuste da versão pronta"
    if con.execute("SELECT 1 FROM versoes WHERE projeto=? LIMIT 1", (pid,)).fetchone():
        return "já existe versão deste projeto; peça um ajuste da versão pronta"
    q = ",".join("?" * len(ETAPAS_EDICAO))
    if con.execute(f"SELECT 1 FROM jobs WHERE projeto=? AND etapa IN ({q}) AND estado IN ('pendente','rodando','feito') LIMIT 1",
                   (pid, *ETAPAS_EDICAO)).fetchone():
        return "a edição já começou; para mudar agora, peça um ajuste da versão pronta"
    if _outra_confirmacao(con, pid, tool_use_id):
        return "já existe outro cartão esperando o seu toque"
    return None


def pode(con, pid: str, cfg=None) -> dict:
    """O que a conversa pode propor agora (vai em ver_projeto.pode). Onda 3: troca de música, nota e o que dá para
    refazer (só as opções que a conversa pode propor; catálogo e direção são da tela)."""
    from motor import config as _config, refazer
    cfg = cfg or _config.carregar()
    vs = versoes(con, pid)
    ajuste = guarda_ajuste(con, pid, vs[-1]["id"]) if vs else "ainda não há versão pronta"
    pedido = guarda_pedido(con, pid)
    trilha = guarda_trilha(cfg, con, pid, {"versao": vs[-1]["id"], "trilha": None}) if vs else "ainda não há versão pronta"
    nota = guarda_nota(cfg, con, pid, {})
    out = {"propor_ajuste": ajuste is None, "propor_pedido": pedido is None, "propor_trilha": trilha is None, "anotar": nota is None}
    try:
        ops = refazer.opcoes(cfg, con, pid)["opcoes"]
    except Exception:  # noqa: BLE001 - sem as opções, a conversa só não propõe refazer
        ops = []
    outra = _outra_confirmacao(con, pid, None)
    out["refazer"] = [] if outra else [{k: o[k] for k in ("de", "versao", "arquivo_id", "n_video") if o.get(k) is not None}
                                       for o in ops if o.get("pela_conversa")]
    motivos = [(f"ajuste: {ajuste}" if ajuste else None), (f"pedido: {pedido}" if pedido else None),
               (f"trocar a música: {trilha}" if trilha else None), (f"nota: {nota}" if nota else None),
               (None if out["refazer"] else ("refazer: já existe outro cartão esperando o seu toque" if outra
                                              else "refazer: nada falhou que dê para refazer agora"))]
    porque = [p for p in motivos if p]
    if porque:
        out["porque"] = "; ".join(porque)
    return out


# ---------------- onda 3: refazer, trocar a música e nota (cartões montados pelo código) ----------------
MAX_NOTAS = 50
TEXTO_AJUSTE_FEITO = "Pedido de ajuste enviado. A direção recomeça; acompanhe na mesa."
TEXTO_AJUSTE_SO_AQUI = "Pedido de ajuste enviado, só para este projeto (não virou regra). A direção recomeça; acompanhe na mesa."
TEXTO_PEDIDO_FEITO = "Pedido trocado."
TEXTO_PEDIDO_DIRIGINDO = "Pedido trocado. A edição começou; acompanhe na mesa."
TEXTO_TRILHA_FEITO = "Feito. A música está sendo trocada; a versão nova aparece na mesa."
TEXTO_NOTA_FEITO = "Nota guardada."


def _mmss(t: float) -> str:
    t = max(0, int(round(float(t))))
    return f"{t // 60}:{t % 60:02d}"


def normalizar_refazer(con, pid: str, e: dict) -> dict:
    from motor import refazer
    out = {"de": e["de"]}
    if e["de"] == "leitura":
        if e.get("arquivo_id"):
            out["arquivo_id"] = e["arquivo_id"]
    else:
        out["versao"] = e.get("versao") or refazer.mais_nova(con, pid)
    return out


def guarda_refazer(cfg, con, pid: str, e: dict, *, tool_use_id: str | None = None) -> str | None:
    from motor import refazer
    if e.get("de") not in refazer.DE_CONVERSA:
        return "pela conversa dá para montar, conferir ou entregar de novo, ou ler de novo um vídeo"
    p = refazer.porque(cfg, con, pid, e["de"], versao=e.get("versao"), arquivo_id=e.get("arquivo_id"))
    if p:
        return p
    if _outra_confirmacao(con, pid, tool_use_id):
        return "já existe outro cartão esperando o seu toque"
    return None


def guarda_trilha(cfg, con, pid: str, e: dict, *, tool_use_id: str | None = None) -> str | None:
    from motor import refazer
    p = refazer.porque_trilha(cfg, con, pid, e.get("versao"), e.get("trilha"))
    if p:
        return p
    if _outra_confirmacao(con, pid, tool_use_id):
        return "já existe outro cartão esperando o seu toque"
    return None


def normalizar_nota(e: dict) -> dict:
    out = {"texto": " ".join(str(e.get("texto", "")).split())}
    if e.get("versao"):
        out["versao"] = e["versao"]
    if e.get("tempo_s") is not None:
        out["tempo_s"] = round(float(e["tempo_s"]), 1)
    return out


def guarda_nota(cfg, con, pid: str, e: dict, *, tool_use_id: str | None = None, cartoes: bool = True) -> str | None:
    if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
        return "projeto não encontrado"
    if len(_dados(con, pid).get("notas") or []) >= MAX_NOTAS:
        return f"o projeto já tem {MAX_NOTAS} notas"
    if e.get("versao") and con.execute("SELECT 1 FROM versoes WHERE projeto=? AND id=?", (pid, e["versao"])).fetchone() is None:
        return f"a versão {e['versao']} não existe"
    if cartoes and _outra_confirmacao(con, pid, tool_use_id):
        return "já existe outro cartão esperando o seu toque"
    return None


def cartao_nota(cfg, con, pid: str, e: dict) -> dict:
    onde = ""
    if e.get("tempo_s") is not None:
        onde += f" em {_mmss(e['tempo_s'])}"
    if e.get("versao"):
        onde += f" da {e['versao']}"
    c = {"acao": "nota", "titulo": "Guardar uma nota", "texto_exato": e["texto"], "faz": f"Guardar esta nota no projeto{onde}. Não refaz nada e não gasta.",
         "refaz": [], "comeca_agora": False, "custo_usd_est": 0.0, "minutos_est": 0.0, "vira_regra": False,
         "volta": "A nota fica na lista de notas do projeto (cabem até 50 por projeto).", "botao": "Guardar a nota"}
    if e.get("versao"):
        c["versao"] = e["versao"]
    if e.get("tempo_s") is not None:
        c["tempo_s"] = e["tempo_s"]
    return c


def anotar(cfg, pid: str, e: dict) -> dict:
    """Guarda a nota em projetos.dados.notas (BEGIN IMMEDIATE, guarda lida de novo lá dentro). Não refaz nada e não gasta."""
    import secrets
    from motor import refazer
    con = banco.conectar(cfg.banco)
    try:
        con.execute("BEGIN IMMEDIATE")
        try:
            p = guarda_nota(cfg, con, pid, e, cartoes=False)          # a espera deste cartão já foi tomada no toque
            if p:
                raise refazer.Recusa(p)
            nid = "n_" + secrets.token_hex(3)
            nota = {"id": nid, "texto": e["texto"][:500], "em": banco.agora_iso(), "por": "conversa"}
            if e.get("versao"):
                nota["versao"] = e["versao"]
            if e.get("tempo_s") is not None:
                nota["t"] = e["tempo_s"]
            r = con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()
            d = json.loads(r["dados"] or "{}")
            d.setdefault("notas", []).append(nota)
            con.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(d), pid))
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
    finally:
        con.close()
    return {"feito": True, "nota": nid}


def _exec_ajuste(cfg, pid, e, esp, so_neste_projeto):
    vira = bool((esp["cartao"].get("evento") or {}).get("vira_regra", True)) and not so_neste_projeto
    res = executar_ajuste(pid, e["versao"], e["o_que_mudar"], vira_regra=vira, vozes=e.get("vozes"), cfg=cfg)
    return res, (TEXTO_AJUSTE_FEITO if vira else TEXTO_AJUSTE_SO_AQUI)


def _exec_pedido(cfg, pid, e, esp, so_neste_projeto):
    res = executar_pedido(cfg, pid, e)
    return res, (TEXTO_PEDIDO_DIRIGINDO if res.get("dirigindo") else TEXTO_PEDIDO_FEITO)


def _exec_refazer(cfg, pid, e, esp, so_neste_projeto):
    from motor import refazer
    r = refazer.executar(cfg, pid, e["de"], versao=e.get("versao"), arquivo_id=e.get("arquivo_id"))
    v = e.get("versao")
    detalhe = {"montagem": f"Feito. A montagem da {v} recomeçou; acompanhe na mesa.",
               "conferencia": f"Feito. A conferência da {v} recomeçou.",
               "entrega": f"Feito. A {v} está sendo conferida e entregue de novo.",
               "leitura": f"Feito. O vídeo {r.get('n_video')} está sendo lido de novo."}[e["de"]]
    return {"feito": True, "refazendo": e["de"]}, detalhe


def _exec_trilha(cfg, pid, e, esp, so_neste_projeto):
    from motor import refazer
    return refazer.trocar_musica(cfg, pid, e["versao"], e["trilha"]), TEXTO_TRILHA_FEITO


def _exec_nota(cfg, pid, e, esp, so_neste_projeto):
    return anotar(cfg, pid, e), TEXTO_NOTA_FEITO


class Cartao:
    """Uma ação da conversa com toque: normalizar (vira a entrada do entrada_hash), guarda (ao criar e no toque), montar o
    cartão (texto do código) e executar (as funções das rotas; as novas abrem a própria transação e levantam Recusa)."""

    def __init__(self, normalizar, guarda, montar, executar):
        self.normalizar, self.guarda, self.montar, self.executar = normalizar, guarda, montar, executar


def _cartao_ajuste(cfg, con, pid, e, *, turno, tool_use_id, ja_lidos=None):
    return cartao_ajuste(cfg, con, pid, e, turno=turno, tool_use_id=tool_use_id, ja_lidos=ja_lidos)


def _cartao_pedido(cfg, con, pid, e, *, turno, tool_use_id, ja_lidos=None):
    c = cartao_pedido(cfg, con, pid, e, turno=turno, tool_use_id=tool_use_id)
    return _com_atencao(c, con, pid, " ".join(str(e.get(k) or "") for k in ("texto", "obrigatorio", "proibido")), ja_lidos)


ATENCAO_DE_FORA = "Este texto repete algo que veio de fora (fala de vídeo ou texto de cliente): “{trecho}”. Confira antes de tocar."


def _com_atencao(c: dict, con, pid: str, texto: str, ja_lidos) -> dict:
    """Revisão da onda 3: o aviso "repete algo que veio de fora" vale para todo cartão cujo texto o Nimbus escreveu (nota e
    pedido), não só para o ajuste. Uma fala de vídeo com instrução escondida não vira nota nem pedido sem o dono ver."""
    trecho = repete_de_fora(texto, textos_de_fora(con, pid, ja_lidos))
    if trecho is not None:
        c["atencao"] = ATENCAO_DE_FORA.format(trecho=trecho)
    return c


def _cartao_nota(cfg, con, pid, e, *, turno, tool_use_id, ja_lidos=None):
    c = {"turno": turno, "tool_use_id": tool_use_id, **cartao_nota(cfg, con, pid, e)}
    return _com_atencao(c, con, pid, e.get("texto") or "", ja_lidos)


def _com_ids(f):
    def montar(cfg, con, pid, e, *, turno, tool_use_id, ja_lidos=None):
        return {"turno": turno, "tool_use_id": tool_use_id, **f(cfg, con, pid, e)}
    return montar


def _cartao_refazer(cfg, con, pid, e):
    from motor import refazer
    return refazer.cartao_refazer(cfg, con, pid, e)


def _cartao_trilha(cfg, con, pid, e):
    from motor import refazer
    return refazer.cartao_trilha(cfg, con, pid, e)


CARTOES = {
    "propor_ajuste": Cartao(
        lambda cfg, con, pid, e: {"versao": e["versao"], "o_que_mudar": " ".join(e["o_que_mudar"].split()),
                                  **({"vozes": e["vozes"]} if e.get("vozes") in ("auto", "uma", "varias") else {})},
        lambda cfg, con, pid, e, tool_use_id=None: guarda_ajuste(con, pid, e["versao"], tool_use_id=tool_use_id),
        _cartao_ajuste, _exec_ajuste),
    "propor_pedido": Cartao(
        lambda cfg, con, pid, e: normalizar_pedido(e),
        lambda cfg, con, pid, e, tool_use_id=None: guarda_pedido(con, pid, tool_use_id=tool_use_id),
        _cartao_pedido, _exec_pedido),
    "propor_refazer": Cartao(lambda cfg, con, pid, e: normalizar_refazer(con, pid, e), guarda_refazer, _com_ids(_cartao_refazer), _exec_refazer),
    "propor_trilha": Cartao(lambda cfg, con, pid, e: {"versao": e["versao"], "trilha": e["trilha"]}, guarda_trilha,
                            _com_ids(_cartao_trilha), _exec_trilha),
    "anotar": Cartao(lambda cfg, con, pid, e: normalizar_nota(e), guarda_nota, _cartao_nota, _exec_nota),
}


# ---------------- custo e tempo do cartão (números do código) ----------------
def custo_e_minutos(cfg, con) -> tuple[float, float]:
    from motor.cerebro import gastos
    grupos: dict[tuple, float] = {}
    for d in gastos.ler(cfg):
        if d.get("o_que") in ("direcao", "critico"):
            k = (d.get("projeto"), d.get("versao"))
            grupos[k] = grupos.get(k, 0.0) + float(d.get("custo_usd") or 0)
    ult = list(grupos.values())[-5:]
    custo = round(statistics.mean(ult), 2) if ult else CUSTO_PADRAO_USD
    total_s = 0.0
    tem = False
    for etapa in ("direcao", "montagem", "qa"):
        ss = []
        for r in con.execute("SELECT dados FROM eventos WHERE tipo='etapa_fim' AND etapa=? ORDER BY id DESC LIMIT 5", (etapa,)):
            try:
                s = float((json.loads(r["dados"] or "{}") or {}).get("s") or 0)
            except (TypeError, ValueError):
                s = 0
            if s > 0:
                ss.append(s)
        if ss:
            tem = True
            total_s += statistics.mean(ss)
    minutos = max(1, round(total_s / 60)) if tem else MINUTOS_PADRAO
    return custo, float(minutos)


def entrada_hash(tool_use_id: str, entrada: dict) -> str:
    canon = json.dumps(entrada, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{tool_use_id}\n{canon}".encode("utf-8")).hexdigest()


def _pedido_atual(cfg, pid: str) -> dict:
    from motor.api.direcao import _armazem
    try:
        return _armazem(cfg).ler_json(f"projetos/{pid}/pedido.json", padrao={})
    except Exception:  # noqa: BLE001 - pedido ilegível: o cartão mostra tudo como novo
        return {}


def _fmt(v) -> str:
    if v is None or v == "" or v == []:
        return "—"
    if isinstance(v, list):
        return "; ".join(str(x) for x in v)
    if isinstance(v, float) and v.is_integer():
        return f"{int(v)} s"
    if isinstance(v, (int, float)):
        return f"{v} s"
    return str(v)


def normalizar_pedido(entrada: dict) -> dict:
    out = {}
    for k in CAMPOS_PEDIDO:
        if k not in entrada:
            continue
        v = entrada[k]
        if isinstance(v, str):
            v = v.strip()
        elif isinstance(v, list):
            v = [x.strip() if isinstance(x, str) else x for x in v]
            v = [x for x in v if x != ""]
        out[k] = v
    return out


_PALAVRA = re.compile(r"\w+", re.UNICODE)
N_GRAMA = 5


def _coletar_de_fora(x, out: list) -> None:
    if isinstance(x, dict):
        for k, v in x.items():
            if k == "de_fora" and isinstance(v, str):
                out.append(v)
            else:
                _coletar_de_fora(v, out)
    elif isinstance(x, list):
        for v in x:
            _coletar_de_fora(v, out)


def textos_de_fora(con, pid: str, ja_lidos: list | None = None) -> list[str]:
    """Tudo o que veio de fora e o modelo leu no capítulo atual: os resultados de ferramenta marcados {"de_fora": ...}.
    ja_lidos: tool_result da mesma resposta, ainda não gravados."""
    from motor.conversa import repo
    cap = repo.capitulo_atual(con, pid)
    blocos: list = list(ja_lidos or [])
    if cap is not None:
        for r in repo.linhas(con, pid, cap["capitulo"]):
            if r["papel"] in ("user", "parcial"):
                blocos.extend(r["conteudo"] or [])
    out: list[str] = []
    for b in blocos:
        if not isinstance(b, dict) or b.get("type") != "tool_result":
            continue
        c = b.get("content")
        if isinstance(c, str):
            try:
                c = json.loads(c)
            except ValueError:
                continue
        _coletar_de_fora(c, out)
    return out


def repete_de_fora(texto: str, fontes: list[str], n: int = N_GRAMA) -> str | None:
    """Trecho de n palavras seguidas (sem acento de caixa e pontuação) que o texto repete de alguma fonte de fora."""
    ps = [w.lower() for w in _PALAVRA.findall(texto or "")]
    if len(ps) < n:
        n = len(ps)
        if n < 3:
            return None
    meus: dict[tuple, int] = {}
    for i in range(len(ps) - n + 1):
        meus.setdefault(tuple(ps[i:i + n]), i)
    melhor: list[str] = []
    for f in fontes:
        fs = [w.lower() for w in _PALAVRA.findall(f or "")]
        for i in range(len(fs) - n + 1):
            j = meus.get(tuple(fs[i:i + n]))
            if j is None:
                continue
            k = n                                  # estende o trecho repetido o quanto der (o dono vê o trecho inteiro)
            while i + k < len(fs) and j + k < len(ps) and fs[i + k] == ps[j + k]:
                k += 1
            if k > len(melhor):
                melhor = fs[i:i + k]
    return " ".join(melhor[:40]) if melhor else None


def cartao_ajuste(cfg, con, pid: str, entrada: dict, *, turno: str, tool_use_id: str, ja_lidos: list | None = None) -> dict:
    custo, minutos = custo_e_minutos(cfg, con)
    v = entrada["versao"]
    trecho = repete_de_fora(entrada["o_que_mudar"], textos_de_fora(con, pid, ja_lidos))
    vozes_antes = _pedido_atual(cfg, pid).get("vozes") or "auto"
    muda_vozes = entrada.get("vozes") and entrada["vozes"] != vozes_antes
    c = {"turno": turno, "tool_use_id": tool_use_id, "acao": "ajuste", "versao": v, "titulo": f"Pedir ajuste da {v}",
         **({"mudancas": [{"campo": NOME_CAMPO["vozes"], "antes": ROTULO_VOZES.get(vozes_antes, vozes_antes),
                                "depois": ROTULO_VOZES[entrada["vozes"]]}]} if muda_vozes else {}),
         "texto_exato": entrada["o_que_mudar"], "refaz": ["direcao", "montagem", "qa"], "comeca_agora": True,
         "custo_usd_est": custo, "minutos_est": minutos, "vira_regra": trecho is None,
         "volta": (f"A {v} continua guardada. Vira regra da casa e vale para TODOS os projetos, como no botão Pedir ajuste."
                   if trecho is None else f"A {v} continua guardada. Vale só para este projeto: não vira regra da casa.")}
    if trecho is not None:
        c["atencao"] = (f"Este texto repete algo que veio de fora (fala de vídeo ou texto de cliente): “{trecho}”. "
                        "Confira antes de tocar. Por segurança, ele não vira regra da casa.")
    return c


def cartao_pedido(cfg, con, pid: str, entrada: dict, *, turno: str, tool_use_id: str) -> dict:
    atual = _pedido_atual(cfg, pid)
    mudancas = []
    for k in CAMPOS_PEDIDO:
        if k in entrada and entrada[k] != atual.get(k):
            mudancas.append({"campo": NOME_CAMPO[k], "antes": _fmt(atual.get(k)), "depois": _fmt(entrada[k])})
    d = _dados(con, pid)
    r = con.execute("SELECT SUM(estado='analisado') lidos, SUM(estado NOT IN ('analisado','falhou')) pendentes FROM arquivos WHERE projeto=?",
                    (pid,)).fetchone()
    comeca = bool(d.get("envio_fechado")) and (r["pendentes"] or 0) == 0 and (r["lidos"] or 0) > 0
    custo, minutos = custo_e_minutos(cfg, con)
    return {"turno": turno, "tool_use_id": tool_use_id, "acao": "pedido", "titulo": "Trocar o pedido",
            "texto_exato": entrada.get("texto", atual.get("texto", "")), "mudancas": mudancas,
            "refaz": ["direcao", "montagem", "qa"] if comeca else [], "comeca_agora": comeca,
            "custo_usd_est": custo if comeca else 0.0, "minutos_est": minutos if comeca else 0.0, "vira_regra": False,
            "volta": ("A edição começa agora." if comeca else "Guarda o pedido. A edição começa quando você tocar em Começar a edição.")}


# ---------------- execução (as mesmas funções das rotas antigas) ----------------
def executar_ajuste(pid: str, versao: str, texto: str, vira_regra: bool = True, *, vozes: str | None = None, cfg=None) -> dict:
    from motor.api import direcao
    if vozes and vozes != _pedido_atual(cfg, pid).get("vozes"):
        # a direção nova lê o pedido.json: grava o campo antes de pedir o ajuste (o resto do pedido fica igual)
        arm = direcao._armazem(cfg or __import__("motor.config", fromlist=["carregar"]).carregar())
        ped = arm.ler_json(f"projetos/{pid}/pedido.json", padrao={}) or {}
        if ped:
            arm.gravar_json(f"projetos/{pid}/pedido.json", {**ped, "vozes": vozes})
    r = direcao.reprovar(pid, versao, direcao.Reprovacao(motivo=texto, vira_regra=vira_regra))
    out = {"feito": True, "nova_direcao": bool(r.get("nova_direcao"))}
    if not vira_regra:
        out["so_neste_projeto"] = True
    return out


def executar_pedido(cfg, pid: str, entrada: dict) -> dict:
    from motor.api import direcao
    atual = _pedido_atual(cfg, pid)
    base = {k: atual.get(k) for k in ("tipo_video", "modo", "ambiente", "vozes", "duracao_alvo", "destino", "formato", "cliente",
                                      "obrigatorio", "proibido", "ajustes_de") if atual.get(k) is not None}
    corpo = direcao.PedidoEntrada(**{**base, **entrada})
    r = direcao.gravar_pedido(pid, corpo)
    return {"feito": True, "dirigindo": bool(r.get("dirigindo"))}


def agora() -> str:
    return banco.agora_iso()
