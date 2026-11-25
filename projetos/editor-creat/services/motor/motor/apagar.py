"""Apagar um projeto (onda 3, seção 7). Só pela tela, nunca pela conversa; um projeto por vez, com o nome digitado.

Ordem (D27): diário em <dados>/apagar/<pid>.json -> banco numa transação (BEGIN IMMEDIATE, com as recusas lidas dentro
dela) -> arquivos em segundo plano. A varredura do worker (`varrer`, a cada 15 min) limpa o que sobrar por 7 dias.

O que fica de propósito: o livro de gastos (gastos.jsonl), as regras e os casos que nasceram do projeto, os caches por
conteúdo (cache/olho, cache/fatos, cache/planos) e os backups já feitos. Nada aqui recebe lista: uma chamada, um pid.

Defesas contra apagar o que não devia:
- o pid passa em ^p_[a-z0-9]{4,40}$ antes de qualquer coisa (sem barra, ponto nem maiúscula);
- todo DELETE é `WHERE projeto=?` (ou `WHERE id=?`) com o pid como parâmetro; nunca LIKE;
- chave do armazenamento conferida uma a uma (`startswith(prefixo)` + validar_chave); no disco local, link simbólico é
  apagado só como link e pasta só se o pai resolvido é a base esperada;
- os arquivos só são limpos se o projeto NÃO existe no banco (nada de projeto vivo é tocado, nem pela varredura).
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import re
import shutil
import threading
import time

from motor import banco, config

log = logging.getLogger("motor.apagar")

RE_PID = re.compile(r"^p_[a-z0-9]{4,40}$")
RE_DIARIO = re.compile(r"^p_[a-z0-9]{4,40}\.json$")
TABELAS = ("conversa_espera", "conversa_msgs", "conversa_capitulos", "links_cliente", "nuvem", "eventos", "jobs", "versoes", "arquivos")
PREFIXOS = ("entrada/", "derivados/", "projetos/", "saidas/")
GUARDA_DIAS = 7
INTENCAO_VELHA_S = 10 * 60
FRASE_JOB = {"ingest": "um vídeo está chegando", "analise": "o editor está lendo um vídeo", "catalogo": "a direção está trabalhando",
             "direcao": "a direção está trabalhando", "montagem": "a montagem está rodando", "qa": "a conferência está rodando",
             "entrega": "a entrega está rodando", "entregas": "o filme está indo para a página de entregas (ou saindo dela)",
             "espelho": "a cópia do material para o Cloudflare está rodando"}
NA_PAGINA = ("no_ar", "pendente", "enviando")
FICA = ["O livro de gastos (o que já foi gasto continua contado).",
        "As regras e os casos que nasceram deste projeto (apague as regras no Caderno, se quiser).",
        "As cópias nos backups: no Cloudflare somem em até 30 dias; as do Dropbox ficam."]
CONVERSA_RODANDO = "a conversa está respondendo agora neste projeto; toque em Parar a resposta ou espere terminar"
NOME_ERRADO = "o nome não confere; digite o nome do projeto como aparece no topo"


class Recusa(Exception):
    def __init__(self, status: int, frase: str):
        super().__init__(frase)
        self.status, self.frase = status, frase


def pid_valido(pid) -> bool:
    return isinstance(pid, str) and bool(RE_PID.match(pid))


def mesmo_nome(a: str, b: str) -> bool:
    """O teclado do iPhone põe maiúscula sozinho: compara sem caixa e com espaços normalizados (acento conta)."""
    return " ".join(str(a or "").split()).casefold() == " ".join(str(b or "").split()).casefold()


def _agora_iso() -> str:
    return banco.agora_iso()


def _dados(con, pid: str) -> dict:
    r = con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()
    try:
        return json.loads(r["dados"] or "{}") if r else {}
    except ValueError:
        return {}


def _ordem_v(v: str) -> int:
    m = re.match(r"^v([0-9]{1,3})$", v or "")
    return int(m.group(1)) if m else 10 ** 6


def entregas_na_pagina(d: dict) -> list[dict]:
    """Versões que estão (ou vão, ou estão saindo) na página de entregas, pela ordem."""
    out = []
    for v, e in sorted((d.get("entregas") or {}).items(), key=lambda x: _ordem_v(x[0])):
        est = (e or {}).get("estado")
        if est in (*NA_PAGINA, "retirando"):
            item = {"versao": v, "estado": est}
            if est == "retirando" and e.get("proxima"):
                item["proxima"] = str(e["proxima"])[:5]
            out.append(item)
    return out


def recusa_banco(con, pid: str) -> str | None:
    """Recusas 2 e 3 da seção 7.2 (lidas dentro da transação de quem apaga)."""
    r = con.execute("SELECT etapa FROM jobs WHERE projeto=? AND estado IN ('pendente','rodando') ORDER BY estado='rodando' DESC, "
                    "atualizado DESC LIMIT 1", (pid,)).fetchone()
    if r is not None:
        return f"{FRASE_JOB.get(r['etapa'], 'a mesa está trabalhando')} agora; espere terminar para apagar"
    from motor import entregas_r2
    if entregas_r2.ligado():
        for e in entregas_na_pagina(_dados(con, pid)):
            if e["estado"] in NA_PAGINA:
                return f"a {e['versao']} está na página de entregas; tire de lá primeiro (botão Tirar da página) e apague depois"
            frase = f"a {e['versao']} está saindo da página de entregas; espere terminar"
            return frase + (f" (tento de novo sozinho às {e['proxima']})" if e.get("proxima") else "")
    return None


def _tem_tabela(con, nome: str) -> bool:
    return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (nome,)).fetchone() is not None


def _contar(con, pid: str) -> dict:
    a = con.execute("SELECT COUNT(*) n, COALESCE(SUM(bytes),0) b FROM arquivos WHERE projeto=?", (pid,)).fetchone()
    links = 0
    if _tem_tabela(con, "links_cliente"):
        links = con.execute("SELECT COUNT(*) n FROM links_cliente WHERE projeto=? AND revogado IS NULL AND expira > ?",
                            (pid, _agora_iso())).fetchone()["n"]
    return {"videos": int(a["n"]), "bytes": int(a["b"]),
            "versoes": int(con.execute("SELECT COUNT(*) n FROM versoes WHERE projeto=?", (pid,)).fetchone()["n"]),
            "mensagens_conversa": int(con.execute("SELECT COUNT(*) n FROM conversa_msgs WHERE projeto=?", (pid,)).fetchone()["n"]),
            "links_cliente_ativos": int(links)}


def previa(con, pid: str, *, conversa_rodando: bool = False) -> dict:
    """R13: o que vai, o que fica e se pode agora (pode=false traz a frase da recusa)."""
    r = con.execute("SELECT nome FROM projetos WHERE id=?", (pid,)).fetchone()
    if r is None:
        raise Recusa(404, "projeto não encontrado")
    from motor import entregas_r2
    from motor.etapas import espelho
    d = _dados(con, pid)
    porque = CONVERSA_RODANDO if conversa_rodando else recusa_banco(con, pid)
    out = {"pode": porque is None, "nome": r["nome"], "vai_apagar": _contar(con, pid), "na_pagina": [], "fica": list(FICA)}
    if porque:
        out["porque"] = porque
    pagina = entregas_na_pagina(d)
    restos: dict = {}
    if entregas_r2.ligado():
        out["na_pagina"] = pagina
    else:
        no_ar = [e["versao"] for e in pagina]
        if no_ar:
            restos["pagina_desligada"] = no_ar
    if not espelho.ligado():
        n = con.execute("SELECT COUNT(*) n FROM nuvem WHERE projeto=? AND estado='guardado'", (pid,)).fetchone()["n"]
        if n:
            restos["copia_material"] = int(n)
    if restos:
        out["restos_previstos"] = restos
    return out


# ---------------- diário ----------------
def _pasta_diario(cfg) -> pathlib.Path:
    return pathlib.Path(cfg.dados) / "apagar"


def _diario(cfg, pid: str) -> pathlib.Path:
    if not pid_valido(pid):
        raise ValueError("pid inválido")
    return _pasta_diario(cfg) / f"{pid}.json"


def _gravar_diario(cfg, pid: str, d: dict) -> None:
    p = _diario(cfg, pid)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def _ler_diario(p: pathlib.Path) -> dict | None:
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return d if isinstance(d, dict) else None


def _apagar_diario(cfg, pid: str) -> None:
    try:
        _diario(cfg, pid).unlink(missing_ok=True)
    except OSError:
        pass


def _marcar_apagado(cfg, pid: str, base: dict | None = None) -> dict:
    t = time.time()
    d = {**(base or {}), "pid": pid, "fase": "apagado", "em": _agora_iso(), "em_ts": t, "ate_ts": t + GUARDA_DIAS * 86400,
         "ate": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t + GUARDA_DIAS * 86400))}
    _gravar_diario(cfg, pid, d)
    return d


# ---------------- apagar (o banco) ----------------
def apagar(cfg, pid: str, nome: str, *, limpar_agora: bool = True) -> dict:
    """R14, já com a trava da conversa presa por quem chama. Levanta Recusa(404|409|422) sem ter apagado nada."""
    if not pid_valido(pid):
        raise Recusa(404, "projeto não encontrado")
    con = banco.conectar(cfg.banco)
    try:
        from motor import cliente
        cliente.preparar(con)
        if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
            raise Recusa(404, "projeto não encontrado")
        _gravar_diario(cfg, pid, {"pid": pid, "criado": _agora_iso(), "criado_ts": time.time(), "fase": "intencao"})
        try:
            con.execute("BEGIN IMMEDIATE")
            try:
                r = con.execute("SELECT nome FROM projetos WHERE id=?", (pid,)).fetchone()
                if r is None:
                    raise Recusa(404, "projeto não encontrado")
                porque = recusa_banco(con, pid)
                if porque:
                    raise Recusa(409, porque)
                if not mesmo_nome(nome, r["nome"]):
                    raise Recusa(422, NOME_ERRADO)
                contagem = _contar(con, pid)
                for t in TABELAS:
                    con.execute(f"DELETE FROM {t} WHERE projeto=?", (pid,))      # nome da tabela é constante do código
                if con.execute("DELETE FROM projetos WHERE id=?", (pid,)).rowcount != 1:
                    raise RuntimeError("o projeto não saiu do banco")
                con.execute("COMMIT")
            except BaseException:
                con.execute("ROLLBACK")
                raise
        except BaseException:
            _apagar_diario(cfg, pid)
            raise
    finally:
        con.close()
    _marcar_apagado(cfg, pid, {"contagem": contagem})
    log.info("projeto %s apagado do banco; os arquivos saem em segundo plano", pid)
    if limpar_agora:
        threading.Thread(target=_limpar_seguro, args=(cfg, pid), daemon=True, name=f"apagar-{pid}").start()
    return {"apagado": True, "arquivos": "apagando"}


def _limpar_seguro(cfg, pid: str) -> None:
    try:
        limpar_arquivos(cfg, pid)
    except Exception:  # noqa: BLE001 - a varredura do worker tenta de novo
        log.exception("limpeza dos arquivos de %s falhou; a varredura tenta de novo", pid)


# ---------------- limpar (os arquivos) ----------------
def _apagar_chave(arm, chave: str) -> None:
    """Uma chave do armazenamento. No local, nada de seguir link: parte do caminho que é link simbólico recusa; o próprio
    arquivo sendo link, só o link some (o alvo, dentro ou fora do armazenamento, fica)."""
    from motor.provedores.armazenamento_local import ChaveInvalida, validar_chave
    validar_chave(chave)
    if getattr(arm, "nome", "") == "local":
        raiz = pathlib.Path(arm.raiz)
        atual = raiz
        partes = chave.split("/")
        for parte in partes[:-1]:
            atual = atual / parte
            if atual.is_symlink():
                raise ChaveInvalida(f"caminho com link simbólico: {chave!r}")
        alvo = raiz / chave
        if alvo.is_symlink():
            alvo.unlink()
            return
    arm.apagar(chave)


def nome_do_projeto(nome: str, pid: str) -> bool:
    """A pasta é deste projeto: `<pid>` exato, ou `import_<pid>_*` / `ingest_<pid>_*` em tmp/ (o "_" depois do pid impede
    casar outro projeto cujo id começa igual)."""
    return nome == pid or nome.startswith((f"import_{pid}_", f"ingest_{pid}_"))


def _limpar_pasta(base: pathlib.Path, alvo: pathlib.Path, pid: str, rel: dict) -> None:
    try:
        if alvo.is_symlink():
            alvo.unlink()
            rel["apagados"] += 1
            return
        if not alvo.exists():
            return
        if alvo.resolve().parent != base.resolve() or not nome_do_projeto(alvo.name, pid):
            rel["recusados"] += 1
            return
        if alvo.is_dir():
            shutil.rmtree(alvo)
        else:
            alvo.unlink()
        rel["apagados"] += 1
    except OSError as e:
        rel["restos"].append(f"{base.name}/{alvo.name}: {type(e).__name__}")


def pastas_locais(cfg, pid: str) -> list[tuple[pathlib.Path, pathlib.Path]]:
    dados = pathlib.Path(cfg.dados)
    out = []
    for raiz in (dados / "armazenamento", dados / "cache" / "r2"):
        for pref in ("entrada", "derivados", "projetos", "saidas"):
            out.append((raiz / pref, raiz / pref / pid))
    for nome in ("montagem", "qa", "entrega"):
        out.append((dados / "tmp" / nome, dados / "tmp" / nome / pid))
    tmp = dados / "tmp"
    if tmp.is_dir():
        for padrao in (f"import_{pid}_", f"ingest_{pid}_"):
            for p in sorted(tmp.glob(padrao + "*")):
                if p.name.startswith(padrao):
                    out.append((tmp, p))
    return out


def _s3_espelho():
    from motor.etapas import espelho
    return espelho.cliente_s3()


def limpar_arquivos(cfg, pid: str, con=None) -> dict:
    """Apaga os arquivos de um projeto que já saiu do banco. Seguro de repetir. Projeto que existe: não toca em nada."""
    rel = {"apagados": 0, "recusados": 0, "restos": []}
    if not pid_valido(pid):
        rel["recusados"] += 1
        return rel
    proprio = con is None
    con = con or banco.conectar(cfg.banco)
    try:
        if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is not None:
            rel["vivo"] = True
            return rel
        from motor.provedores import armazenamento_de
        from motor.provedores.armazenamento_local import ChaveInvalida
        try:
            arm = armazenamento_de(cfg)
        except Exception as e:  # noqa: BLE001
            arm = None
            rel["restos"].append(f"armazenamento: {type(e).__name__}")
        if arm is not None:
            for pref in PREFIXOS:
                prefixo = f"{pref}{pid}/"
                try:
                    chaves = list(arm.listar(prefixo))
                except ChaveInvalida:
                    rel["recusados"] += 1          # a pasta do projeto aponta para fora (link): não segue
                    continue
                except Exception as e:  # noqa: BLE001
                    rel["restos"].append(f"{pref}: {type(e).__name__}")
                    continue
                for chave in chaves:
                    if not isinstance(chave, str) or not chave.startswith(prefixo):
                        continue
                    try:
                        _apagar_chave(arm, chave)
                        rel["apagados"] += 1
                    except ChaveInvalida:
                        rel["recusados"] += 1
                    except Exception as e:  # noqa: BLE001
                        rel["restos"].append(f"{chave[:80]}: {type(e).__name__}")
        for base, alvo in pastas_locais(cfg, pid):
            _limpar_pasta(base, alvo, pid, rel)
        from motor.etapas import espelho
        if espelho.ligado():
            try:
                s3, b = _s3_espelho(), espelho.bucket()
                prefixo = f"entrada/{pid}/"
                from motor.entregas_r2 import _lista
                for o in _lista(s3, b, prefixo):
                    k = o.get("Key") or ""
                    if k.startswith(prefixo):
                        s3.delete_object(Bucket=b, Key=k)
                        rel["apagados"] += 1
            except Exception as e:  # noqa: BLE001 - sem rede: a varredura tenta de novo
                rel["restos"].append(f"espelho: {type(e).__name__}")
        # linha que chegou atrasada (um evento do áudio da conversa que estava no meio): de novo, só se o projeto não existe
        from motor import cliente
        cliente.preparar(con)
        con.execute("BEGIN IMMEDIATE")
        try:
            if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
                for t in TABELAS:
                    rel["apagados"] += con.execute(f"DELETE FROM {t} WHERE projeto=?", (pid,)).rowcount
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
    finally:
        if proprio:
            con.close()
    d = _ler_diario(_diario(cfg, pid)) or {}
    if d.get("fase") == "apagado":
        d.update(ultima_volta=_agora_iso(), recusados=rel["recusados"], restos=rel["restos"][:20])
        _gravar_diario(cfg, pid, d)
    return rel


def varrer(con, agora: float | None = None) -> dict:
    """Volta do worker: termina apagamentos interrompidos e limpa o que chegou depois (envio do tus que terminou depois
    do apagar) por 7 dias. Diário de intenção com o projeto vivo há mais de 10 min: a transação não confirmou; some o diário
    e nada do projeto é tocado."""
    cfg = config.carregar()
    agora = agora if agora is not None else time.time()
    out = {"limpos": 0, "encerrados": 0, "intencoes_descartadas": 0}
    pasta = _pasta_diario(cfg)
    if not pasta.is_dir():
        return out
    for arq in sorted(pasta.iterdir()):
        if not RE_DIARIO.match(arq.name) or not arq.is_file() or arq.is_symlink():
            continue
        pid = arq.name[:-5]
        d = _ler_diario(arq)
        if d is None:
            continue
        vivo = con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is not None
        if d.get("fase") == "intencao":
            if vivo:
                if agora - float(d.get("criado_ts") or 0) > INTENCAO_VELHA_S:
                    arq.unlink(missing_ok=True)
                    out["intencoes_descartadas"] += 1
                continue
            d = _marcar_apagado(cfg, pid, d)
        if d.get("fase") != "apagado":
            continue
        if vivo:            # diário que diz "apagado" com o projeto no banco: nunca toca nos arquivos; o diário sai
            log.warning("varredura: diário de %s diz apagado, mas o projeto existe; nada foi tocado", pid)
            arq.unlink(missing_ok=True)
            continue
        limpar_arquivos(cfg, pid, con)
        out["limpos"] += 1
        if agora > float(d.get("ate_ts") or 0):
            arq.unlink(missing_ok=True)
            out["encerrados"] += 1
    return out
