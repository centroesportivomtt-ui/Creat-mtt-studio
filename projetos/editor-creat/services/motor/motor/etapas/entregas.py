"""Etapa ENTREGAS (por versão aprovada pelo dono): sobe o filme e a capa para a página de entregas no Cloudflare R2.

Roda DEPOIS do "Corta! Aprovada" (nunca dentro da rota de aprovar: o celular cairia no tempo limite). Regras:
- só sobe o arquivo aprovado: sha256 do final.mp4 igual ao do entrega.json;
- idempotente: objeto já lá com o mesmo tamanho e o mesmo sha256 não sobe de novo;
- a versão aprovada por último ganha: a anterior sai da página (marcada 'substituida');
- legenda: só grava se a pasta não tem legenda ou se a que está lá foi o editor que pôs;
- NUNCA levanta erro de rede: grava 'pendente' com o motivo e a hora da próxima tentativa (o laço do worker rearma a cada
  15 min). Assim um Cloudflare fora do ar nunca põe o projeto entregue em "erro".
"""
from __future__ import annotations

import io
import json
import pathlib
import time

from motor import banco, entregas_r2 as R
from motor.etapas import etapa

ESTADOS_NA_PAGINA = ("no_ar", "pendente", "enviando")


class _Recusa(Exception):
    """Não adianta tentar de novo (versão não aprovada, arquivo diferente do aprovado)."""


class _Pendente(Exception):
    """Subiu (ou não) mas a conferência não fechou: tenta de novo mais tarde."""


def _dados(con, p) -> dict:
    r = con.execute("SELECT dados FROM projetos WHERE id=?", (p,)).fetchone()
    return json.loads(r["dados"] or "{}") if r else {}


def _gravar(con, p, v, **campos) -> dict:
    def mexer(d):
        e = d.setdefault("entregas", {}).setdefault(v, {})
        if e.get("estado") == "retirando" and campos.get("estado") in ("enviando", "no_ar", "pendente"):
            campos.pop("estado")             # o dono reprovou no meio do envio: a retirada ganha (a etapa retira no fim)
        e.update(campos)
    return banco.atualizar_dados(con, p, mexer)["entregas"][v]


def _hhmm(ts: float) -> str:
    import datetime
    return datetime.datetime.fromtimestamp(ts, R.FUSO).strftime("%H:%M")


def _limpo(e: Exception) -> str:
    from motor.backup import _SEGREDO
    return _SEGREDO.sub("***", f"{type(e).__name__}: {str(e)[:180]}") if not isinstance(e, (_Recusa, _Pendente)) else str(e)


def _emitir(con, p, v, msg, estado):
    banco.emitir(con, p, "estado", etapa="entrega", alvo=v, mensagem=msg, dados={"entregas": estado})


def _apagar(s3, b, *chaves):
    for k in chaves:
        if k:
            s3.delete_object(Bucket=b, Key=k)


def _mais_nova(d: dict) -> str | None:
    """Versão aprovada por último entre as que estão (ou iam) para a página."""
    apr, ent = d.get("aprovadas") or {}, d.get("entregas") or {}
    cand = [v for v, e in ent.items() if e.get("estado") in ESTADOS_NA_PAGINA and v in apr]
    if not cand:
        return None
    num = lambda v: int(v.lstrip("v")) if v.lstrip("v").isdigit() else 0          # noqa: E731
    return max(cand, key=lambda v: (str(apr[v].get("em") or ""), num(v)))


def _enviar(ctx, s3, v: str) -> dict:
    con, arm, p, cfg = ctx.con, ctx.armazenamento, ctx.projeto, ctx.cfg
    b = R.bucket()
    ver = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (p, v)).fetchone()
    d = _dados(con, p)
    if ver is None or ver["estado"] != "entregue" or v not in (d.get("aprovadas") or {}):
        raise _Recusa("a versão não está aprovada (só o filme com 'Corta! Aprovada' vai para a página de entregas)")
    base = f"saidas/{p}/{v}"
    if arm is None or not arm.existe(f"{base}/final.mp4") or not arm.existe(f"{base}/entrega.json"):
        raise _Recusa("o filme desta versão não está mais no editor")
    ent = json.loads(pathlib.Path(arm.caminho_local(f"{base}/entrega.json")).read_text(encoding="utf-8"))
    from motor.etapas.montagem.comum import sha256_arquivo
    final = pathlib.Path(arm.caminho_local(f"{base}/final.mp4"))
    sha = sha256_arquivo(final)
    if not ent.get("sha256") or sha != ent["sha256"]:
        raise _Recusa("o arquivo final não é o mesmo que foi aprovado (sha256 diferente): nada subiu")
    e = (d.get("entregas") or {}).get(v) or {}
    cliente = e.get("cliente") or R.CLIENTE_PADRAO
    nome = con.execute("SELECT nome FROM projetos WHERE id=?", (p,)).fetchone()["nome"]
    data = d.get("entregas_data") or R.hoje_bahia()
    pasta = R.pasta_de(cliente, data, nome)
    vk, ck = R.chaves_da_versao(pasta, nome, v)
    mais_nova = _mais_nova(d)
    if mais_nova and mais_nova != v:                       # o dono já aprovou outra depois desta: esta não volta à página
        _apagar(s3, b, *(k for k in (e.get("video_k"), e.get("capa_k")) if k))
        R.atualizar_indice(s3, b)
        return {"estado": "substituida", "substituida_por": mais_nova}
    _gravar(con, p, v, estado="enviando", cliente=cliente, pasta=pasta)

    subiu, nbytes = R.subir(s3, b, final, vk, sha)
    capa = pathlib.Path(arm.caminho_local(f"{base}/capa.jpg")) if arm.existe(f"{base}/capa.jpg") else None
    if capa is not None:
        R.subir(s3, b, capa, ck, sha256_arquivo(capa))
    _gravar(con, p, v, video_k=vk, capa_k=ck if capa is not None else None, bytes=nbytes)

    # versões anteriores saem da página: as que o editor pôs (mesmo em outro cliente) e, como o script, a mesma raiz na pasta
    trocadas = []
    for v2, e2 in ((d.get("entregas") or {}).items()):
        if v2 != v and e2.get("estado") in ESTADOS_NA_PAGINA:
            _apagar(s3, b, *(k for k in (e2.get("video_k"), e2.get("capa_k")) if k and k not in (vk, ck)))
            _gravar(con, p, v2, estado="substituida", substituida_por=v, proxima=None, proxima_ts=None)
            trocadas.append(v2)
    for k in (vk, ck) if capa is not None else (vk,):
        R.apagar_versoes_anteriores(s3, b, pasta, k)
    # legenda do post (a que o editor gerou), sem nunca passar por cima da que o dono registrou pelo chat
    chave_meta = pasta.rstrip("/")
    leg_editor = (d.get("entregas_legenda") or {}).get(chave_meta)
    pos = R.mexer_legenda(s3, b, pasta, ent.get("legenda_post") or None, leg_editor) if ent.get("legenda_post") else None
    if pos:
        banco.atualizar_dados(con, p, lambda dd: dd.setdefault("entregas_legenda", {}).__setitem__(chave_meta, pos))
    n = R.atualizar_indice(s3, b)
    url = R.url_publica(vk)
    ok, status = _conferir(url, nbytes)
    recibo = {"versao": v, "cliente": cliente, "pasta": pasta, "video": vk, "capa": ck if capa is not None else None, "bytes": nbytes,
              "sha256": sha, "subiu_agora": subiu, "video_url": url, "painel": R.url_painel(cliente), "head_publico": status,
              "conferido": ok, "indice_itens": n, "legenda": "do editor" if pos else "mantida", "trocou": trocadas,
              "em": banco.agora_iso()}
    arm.gravar(f"{base}/entregas.json", io.BytesIO(json.dumps(recibo, ensure_ascii=False, indent=1).encode()))
    if not ok:
        raise _Pendente(f"o filme subiu, mas o endereço público ainda não confere (resposta {status})")
    _gravar(con, p, v, estado="no_ar", painel=R.url_painel(cliente), video_url=url,
            capa_url=R.url_publica(ck) if capa is not None else None, motivo=None, proxima=None, proxima_ts=None,
            pendente_desde=None, acao=None, em=banco.agora_iso())
    R.marcar_ok(cfg)
    _emitir(con, p, v, f"Filme {v} na página de entregas ({R.nome_cliente(cliente)}).", "no_ar")
    return {"estado": "no_ar", "subiu": subiu, "bytes": nbytes, "trocou": trocadas}


def _conferir(url, nbytes):
    return R.conferir_publico(url, nbytes)


def _retirar(ctx, s3, v: str) -> dict:
    con, p = ctx.con, ctx.projeto
    b = R.bucket()
    d = _dados(con, p)
    e = (d.get("entregas") or {}).get(v) or {}
    _apagar(s3, b, *(k for k in (e.get("video_k"), e.get("capa_k")) if k))
    pasta = e.get("pasta")
    outra = any(v2 != v and e2.get("estado") == "no_ar" and e2.get("pasta") == pasta for v2, e2 in (d.get("entregas") or {}).items())
    if pasta and not outra:
        chave_meta = pasta.rstrip("/")
        leg = (d.get("entregas_legenda") or {}).get(chave_meta)
        if leg:
            R.mexer_legenda(s3, b, pasta, None, leg)
            banco.atualizar_dados(con, p, lambda dd: (dd.get("entregas_legenda") or {}).pop(chave_meta, None))
    R.atualizar_indice(s3, b)
    _gravar(con, p, v, estado="retirada", motivo=None, proxima=None, proxima_ts=None, pendente_desde=None, acao=None,
            em=banco.agora_iso())
    _emitir(con, p, v, f"Versão {v} retirada da página de entregas.", "retirada")
    return {"estado": "retirada"}


def _s3():
    return R.cliente_s3()


@etapa("entregas")
def etapa_entregas(ctx) -> dict:
    con, p, v = ctx.con, ctx.projeto, ctx.alvo
    acao = (ctx.job.get("entrada") or {}).get("acao") or "enviar"
    if not v or not R.ligado():
        return {"pulado": "entregas no Cloudflare desligadas"}
    try:
        s3 = _s3()
        if acao == "retirar":
            return _retirar(ctx, s3, v)
        out = _enviar(ctx, s3, v)
        if out.get("estado") == "substituida":
            _gravar(con, p, v, estado="substituida", substituida_por=out["substituida_por"], proxima=None, proxima_ts=None)
            return out
        if ((_dados(con, p).get("entregas") or {}).get(v) or {}).get("estado") == "retirando":
            return _retirar(ctx, s3, v)                    # o dono reprovou enquanto subia
        return out
    except _Recusa as e:
        _gravar(con, p, v, estado="falhou", motivo=str(e), proxima=None, proxima_ts=None)
        _emitir(con, p, v, f"Não deu para mandar a versão {v} para as entregas: {e}", "falhou")
        return {"estado": "falhou", "motivo": str(e)}
    except Exception as e:  # noqa: BLE001 - rede, Cloudflare, permissão: o filme está seguro no editor; tenta de novo sozinho
        prox = time.time() + R.REPETIR_S
        atual = ((_dados(con, p).get("entregas") or {}).get(v) or {})
        _gravar(con, p, v, estado="pendente", motivo=_limpo(e), proxima_ts=prox, proxima=_hhmm(prox), acao=acao,
                pendente_desde=atual.get("pendente_desde") or time.time())
        return {"estado": "pendente", "motivo": _limpo(e)}
