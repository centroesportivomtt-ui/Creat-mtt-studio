"""Link de aprovação para o cliente (item F da fila do dono).

O dono gera, numa versão ENTREGUE, um link exclusivo: token aleatório de 256 bits (43 caracteres), com validade e revogável.
O link abre uma página pública mínima com o player daquela versão e dois botões: "Aprovar" e "Pedir ajuste".

Regras:
- O token nunca é guardado: o banco tem só o sha256 dele (backup e banco vazados não abrem link nenhum). Ele aparece uma vez,
  na hora de gerar; perdeu, gera outro (o anterior da mesma versão é revogado na hora).
- O link só existe quando o dono clica para gerar. Um link ativo por versão.
- Link vencido, revogado ou de versão que deixou de estar entregue (o dono reprovou depois) não abre mais nada.
- Pelo link só se vê aquela versão (vídeo final e capa) e só se responde uma vez; nada mais do editor fica acessível.
- A resposta vira evento do projeto e aparece no Caderno como pedido do cliente. Nunca vira regra da casa sozinha:
  quem decide se o pedido vira reprovação (e regra) é o dono.
"""
from __future__ import annotations

import hashlib
import re
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from motor import banco

ESQUEMA = """
CREATE TABLE IF NOT EXISTS links_cliente (
  id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, projeto TEXT NOT NULL, versao TEXT NOT NULL, titulo TEXT NOT NULL,
  criado TEXT NOT NULL, expira TEXT NOT NULL, revogado TEXT, vistas INTEGER NOT NULL DEFAULT 0, visto_em TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0, resposta TEXT, texto TEXT, nome TEXT, respondido TEXT, tratado TEXT
);
CREATE INDEX IF NOT EXISTS links_cliente_proj ON links_cliente (projeto, versao);
"""
RE_TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")
RE_ID = re.compile(r"^lc_[a-f0-9]{12}$")
DIAS_PADRAO, DIAS_MAX = 7, 30
MAX_TENTATIVAS = 6           # envios de resposta por link (validação recusada conta); depois disso o link só mostra o vídeo
TEXTO_MAX, NOME_MAX = 600, 60


class LinkFechado(Exception):
    """Link conhecido, mas vencido, revogado ou de versão que não está mais entregue."""


def preparar(con) -> None:
    con.executescript(ESQUEMA)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


@contextmanager
def _tx(con):
    """Transação de verdade: o banco abre em autocommit (isolation_level=None), onde `with con` não protege nada."""
    con.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        con.execute("ROLLBACK")
        raise
    con.execute("COMMIT")


def _limpa(s: str | None, n: int) -> str:
    # sem caractere de controle (mantém a quebra de linha) e sem os invisíveis de direção/largura zero que disfarçam o texto
    s = re.sub(r"[\x00-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]", "", s or "")
    return re.sub(r"[ \t]+", " ", s).strip()[:n]


def gerar(con, projeto: str, versao: str, *, dias: int = DIAS_PADRAO, titulo: str | None = None) -> dict:
    """Cria o link (e revoga o ativo anterior da mesma versão). Devolve o token UMA vez."""
    preparar(con)
    dias = max(1, min(int(dias), DIAS_MAX))
    token = secrets.token_urlsafe(32)
    agora = _agora()
    lid = "lc_" + secrets.token_hex(6)
    expira = _iso(agora + timedelta(days=dias))
    with _tx(con):                      # dois cliques ao mesmo tempo: um espera o outro e só um link fica ativo
        v = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (projeto, versao)).fetchone()
        if v is None:
            raise LookupError("versão não encontrada")
        if v["estado"] != "entregue":
            raise ValueError("só gero link de versão entregue (conferida pelo QA)")
        p = con.execute("SELECT nome FROM projetos WHERE id=?", (projeto,)).fetchone()
        titulo = _limpa(titulo, 80) or _limpa(p["nome"] if p else "", 80) or "Vídeo para aprovação"
        con.execute("UPDATE links_cliente SET revogado=? WHERE projeto=? AND versao=? AND revogado IS NULL", (_iso(agora), projeto, versao))
        con.execute("INSERT INTO links_cliente (id, hash, projeto, versao, titulo, criado, expira) VALUES (?,?,?,?,?,?,?)",
                    (lid, _hash(token), projeto, versao, titulo, _iso(agora), expira))
        banco.emitir(con, projeto, "cliente", etapa="entrega", alvo=versao,
                     mensagem=f"Link de aprovação da {versao} gerado para o cliente (vale {dias} dia{'s' if dias > 1 else ''}).",
                     dados={"link": lid, "expira": expira})
    return {"id": lid, "token": token, "caminho": f"/c/{token}", "expira": expira, "versao": versao, "titulo": titulo}


def _linha_publica(con, token: str):
    """Linha do link pelo token. None = não existe (ou token malformado). LinkFechado = existe mas não abre mais."""
    if not isinstance(token, str) or not RE_TOKEN.match(token):
        return None
    preparar(con)
    r = con.execute("SELECT * FROM links_cliente WHERE hash=?", (_hash(token),)).fetchone()
    if r is None:
        return None
    if r["revogado"] or r["expira"] <= _iso(_agora()):
        raise LinkFechado("este link venceu ou foi trocado; peça um novo a quem te mandou")
    v = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (r["projeto"], r["versao"])).fetchone()
    if v is None or v["estado"] != "entregue":
        raise LinkFechado("esta versão foi retirada para ajuste; peça um novo link a quem te mandou")
    return r


def abrir(con, token: str, *, contar: bool = True) -> dict | None:
    """O que a página pública mostra. Conta a visita (o primeiro acesso vira evento para o dono)."""
    r = _linha_publica(con, token)
    if r is None:
        return None
    if contar:
        with _tx(con):
            con.execute("UPDATE links_cliente SET vistas=vistas+1, visto_em=? WHERE id=?", (_iso(_agora()), r["id"]))
            if r["vistas"] == 0:
                banco.emitir(con, r["projeto"], "cliente", etapa="entrega", alvo=r["versao"],
                             mensagem=f"O cliente abriu o link da {r['versao']}.", dados={"link": r["id"]})
    return {"titulo": r["titulo"], "versao": r["versao"], "expira": r["expira"],
            "resposta": r["resposta"], "texto": r["texto"] if r["resposta"] else None, "respondido": r["respondido"],
            "pode_responder": r["resposta"] is None and r["tentativas"] < MAX_TENTATIVAS}


def chave_de(con, token: str, qual: str) -> str | None:
    """Chave no armazenamento do arquivo que o link pode servir: só o vídeo final e a capa daquela versão."""
    r = _linha_publica(con, token)
    if r is None:
        return None
    return f"saidas/{r['projeto']}/{r['versao']}/" + {"video": "final.mp4", "capa": "capa.jpg"}[qual]


def responder(con, token: str, acao: str, texto: str | None = None, nome: str | None = None) -> dict | None:
    r = _linha_publica(con, token)
    if r is None:
        return None
    if r["resposta"] is not None:
        raise PermissionError("a resposta deste link já foi enviada")
    if r["tentativas"] >= MAX_TENTATIVAS:
        raise OverflowError("muitas tentativas neste link; fale com quem te mandou")
    with _tx(con):
        con.execute("UPDATE links_cliente SET tentativas=tentativas+1 WHERE id=?", (r["id"],))
    texto, nome = _limpa(texto, TEXTO_MAX), _limpa(nome, NOME_MAX)
    if acao not in ("aprovar", "ajuste"):
        raise ValueError("resposta desconhecida")
    if acao == "ajuste" and len(texto) < 3:
        raise ValueError("escreva em poucas palavras o que quer ajustar")
    quando = _iso(_agora())
    quem = f" ({nome})" if nome else ""
    msg = (f"O cliente{quem} aprovou a {r['versao']}." if acao == "aprovar"
           else f"O cliente{quem} pediu ajuste na {r['versao']}: “{texto[:160]}{'…' if len(texto) > 160 else ''}”")
    with _tx(con):
        cur = con.execute("UPDATE links_cliente SET resposta=?, texto=?, nome=?, respondido=? WHERE id=? AND resposta IS NULL",
                          (acao, texto or None, nome or None, quando, r["id"]))
        if cur.rowcount != 1:                       # duas abas respondendo ao mesmo tempo: vale a primeira
            raise PermissionError("a resposta deste link já foi enviada")
        banco.emitir(con, r["projeto"], "cliente", etapa="entrega", alvo=r["versao"], mensagem=msg,
                     dados={"link": r["id"], "resposta": acao})
    return {"resposta": acao, "respondido": quando}


def _dono(r) -> dict:
    d = dict(r)
    d.pop("hash", None)
    d["ativo"] = not d["revogado"] and d["expira"] > _iso(_agora())
    return d


def listar(con, projeto: str | None = None, *, limite: int = 50) -> list[dict]:
    """Para o dono (sem token: ele não existe no banco)."""
    preparar(con)
    if projeto:
        q = con.execute("SELECT * FROM links_cliente WHERE projeto=? ORDER BY criado DESC LIMIT ?", (projeto, limite))
    else:
        q = con.execute("SELECT l.*, p.nome AS projeto_nome FROM links_cliente l LEFT JOIN projetos p ON p.id=l.projeto "
                        "WHERE l.resposta IS NOT NULL ORDER BY l.respondido DESC LIMIT ?", (limite,))
    return [_dono(r) for r in q]


def revogar(con, lid: str) -> dict:
    preparar(con)
    r = con.execute("SELECT * FROM links_cliente WHERE id=?", (lid,)).fetchone()
    if r is None:
        raise LookupError("link não encontrado")
    if not r["revogado"]:
        with _tx(con):
            con.execute("UPDATE links_cliente SET revogado=? WHERE id=?", (_iso(_agora()), lid))
            banco.emitir(con, r["projeto"], "cliente", etapa="entrega", alvo=r["versao"],
                         mensagem=f"Link do cliente da {r['versao']} desligado.", dados={"link": lid})
    return _dono(con.execute("SELECT * FROM links_cliente WHERE id=?", (lid,)).fetchone())


def revogar_versao(con, projeto: str, versao: str) -> int:
    """O dono reprovou a versão: os links dela fecham de vez (não reabrem se a versão voltar a ser entregue)."""
    preparar(con)
    cur = con.execute("UPDATE links_cliente SET revogado=? WHERE projeto=? AND versao=? AND revogado IS NULL", (_iso(_agora()), projeto, versao))
    return cur.rowcount


def tratar(con, lid: str) -> dict:
    """O dono marca o pedido do cliente como resolvido no Caderno (não vira regra: para isso ele reprova a versão)."""
    preparar(con)
    r = con.execute("SELECT * FROM links_cliente WHERE id=?", (lid,)).fetchone()
    if r is None or r["resposta"] is None:
        raise LookupError("pedido não encontrado")
    with _tx(con):
        con.execute("UPDATE links_cliente SET tratado=COALESCE(tratado, ?) WHERE id=?", (_iso(_agora()), lid))
    return _dono(con.execute("SELECT * FROM links_cliente WHERE id=?", (lid,)).fetchone())
