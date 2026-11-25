"""Etapa ESPELHO (por arquivo enviado): guarda uma cópia do original no Cloudflare R2 (depósito creat-editor-midia).

DESLIGADA por padrão (EDITOR_ESPELHO=0): cada GB espelhado custa a saída do Railway (US$ 0,05/GB, uma vez) e, acima de 10 GB
guardados, o R2 cobra o mês. Liga só com o "pode" do dono: EDITOR_ESPELHO=1 + R2_MIDIA_BUCKET + as chaves do R2.

- a chave no R2 é IGUAL à chave local (`entrada/<projeto>/<arquivo>.<ext>`): a virada futura para o ArmazenamentoR2 não copia nada;
- envio multipart de 64/32 MB com no máximo 2 conexões (a edição continua usando a máquina);
- só vira 'guardado' depois de `head_object` com o tamanho igual ao do disco;
- nunca levanta erro de rede: vira 'pendente' e o laço do worker tenta de novo; o original continua no editor;
- teto (EDITOR_ESPELHO_TETO_GB, padrão 9) para ficar no espaço grátis do R2: acima dele o arquivo fica 'fora_do_teto'.
"""
from __future__ import annotations

import os
import time

from motor import banco
from motor.etapas import etapa

REPETIR_S = 15 * 60
POR_VOLTA = 5


def bucket() -> str:
    return os.environ.get("R2_MIDIA_BUCKET", "").strip()


def ligado() -> bool:
    return os.environ.get("EDITOR_ESPELHO", "0").strip() == "1" and bool(bucket()) and \
        all(os.environ.get(n, "").strip() for n in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"))


def teto_bytes() -> int:
    try:
        gb = float(os.environ.get("EDITOR_ESPELHO_TETO_GB", "9") or 9)
    except ValueError:
        gb = 9.0
    return int(gb * (1 << 30))


def cliente_s3():
    from motor.backup import _r2_cliente
    return _r2_cliente()


def guardados_bytes(con) -> int:
    return int(con.execute("SELECT COALESCE(SUM(bytes),0) n FROM nuvem WHERE estado='guardado'").fetchone()["n"])


def _gravar(con, chave, projeto, nbytes, estado, erro=None, proxima=None):
    con.execute("""INSERT INTO nuvem (chave, projeto, bytes, estado, conferido_em, erro, tentativas, proxima) VALUES (?,?,?,?,?,?,1,?)
                   ON CONFLICT (chave) DO UPDATE SET bytes=excluded.bytes, estado=excluded.estado, conferido_em=excluded.conferido_em,
                   erro=excluded.erro, tentativas=nuvem.tentativas+1, proxima=excluded.proxima""",
                (chave, projeto, int(nbytes), estado, banco.agora_iso() if estado == "guardado" else None, erro, proxima))


def guardar(con, arm, projeto: str, chave: str, s3=None) -> str:
    """Sobe um original para o R2 e confere. Devolve o estado gravado em `nuvem`."""
    if arm is None or not arm.existe(chave):
        return "sem_original"
    local = arm.caminho_local(chave)
    tam = os.path.getsize(local)
    r = con.execute("SELECT estado, bytes FROM nuvem WHERE chave=?", (chave,)).fetchone()
    if r and r["estado"] == "guardado" and int(r["bytes"]) == tam:
        return "guardado"
    if guardados_bytes(con) + tam > teto_bytes():
        _gravar(con, chave, projeto, tam, "fora_do_teto", erro="espaço grátis do Cloudflare cheio")
        return "fora_do_teto"
    try:
        c = s3 or cliente_s3()
        b = bucket()
        h = None
        try:
            h = c.head_object(Bucket=b, Key=chave)
        except Exception:  # noqa: BLE001 - ainda não existe lá
            h = None
        if not h or int(h.get("ContentLength", -1)) != tam:
            from boto3.s3.transfer import TransferConfig
            c.upload_file(str(local), b, chave, Config=TransferConfig(multipart_threshold=64 << 20, multipart_chunksize=32 << 20,
                                                                      max_concurrency=2))
            h = c.head_object(Bucket=b, Key=chave)
        remoto = int(h.get("ContentLength", -1))
        if remoto != tam:
            raise IOError(f"o R2 guardou {remoto} bytes, esperado {tam}")
        _gravar(con, chave, projeto, tam, "guardado")
        return "guardado"
    except Exception as e:  # noqa: BLE001 - sem conexão: tenta de novo sozinho, o original continua no editor
        from motor.backup import _SEGREDO
        _gravar(con, chave, projeto, tam, "pendente", erro=_SEGREDO.sub("***", f"{type(e).__name__}: {str(e)[:160]}"),
                proxima=time.time() + REPETIR_S)
        return "pendente"


@etapa("espelho")
def etapa_espelho(ctx) -> dict:
    if not ligado():
        return {"pulado": "espelho desligado"}
    r = ctx.con.execute("SELECT chave FROM arquivos WHERE projeto=? AND id=?", (ctx.projeto, ctx.alvo)).fetchone()
    if r is None:
        return {"pulado": "arquivo não existe mais"}
    return {"estado": guardar(ctx.con, ctx.armazenamento, ctx.projeto, r["chave"])}


def enfileirar(con, projeto: str, aid: str) -> None:
    if ligado():
        banco.enfileirar(con, "espelho", projeto, aid, prioridade=9)


def volta(con, agora: float | None = None) -> int:
    """Laço do worker (a cada 15 min): rearma os pendentes cuja hora chegou e recupera arquivos antigos que nunca foram
    espelhados, até 5 por volta, do mais novo para o mais velho, parando no teto."""
    if not ligado():
        return 0
    agora = agora or time.time()
    n = 0
    for r in con.execute("""SELECT a.projeto, a.id FROM nuvem n JOIN arquivos a ON a.chave=n.chave AND a.projeto=n.projeto
                            WHERE n.estado='pendente' AND COALESCE(n.proxima,0) <= ?""", (agora,)).fetchall():
        banco.enfileirar(con, "espelho", r["projeto"], r["id"], prioridade=9)
        n += 1
    livre = teto_bytes() - guardados_bytes(con)
    if livre <= 0:
        return n
    antigos = con.execute("""SELECT a.projeto, a.id, a.bytes FROM arquivos a LEFT JOIN nuvem n ON n.chave=a.chave
                             WHERE n.chave IS NULL AND a.estado IN ('ingerido','analisado') AND a.chave LIKE 'entrada/%'
                               AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.etapa='espelho' AND j.projeto=a.projeto AND j.alvo=a.id
                                               AND j.estado IN ('pendente','rodando'))
                             ORDER BY a.criado DESC LIMIT ?""", (POR_VOLTA,)).fetchall()
    for r in antigos:
        if int(r["bytes"] or 0) > livre:
            break
        livre -= int(r["bytes"] or 0)
        banco.enfileirar(con, "espelho", r["projeto"], r["id"], prioridade=9)
        n += 1
    return n


def resumo(con, projeto: str) -> dict | None:
    """Para GET /projetos/{pid}: None quando desligado (a tela não mostra nada)."""
    if not ligado():
        return None
    total = con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=? AND chave LIKE 'entrada/%'", (projeto,)).fetchone()["n"]
    g = {r["estado"]: (r["n"], r["b"]) for r in con.execute(
        "SELECT estado, COUNT(*) n, COALESCE(SUM(bytes),0) b FROM nuvem WHERE projeto=? GROUP BY estado", (projeto,))}
    return {"guardados": g.get("guardado", (0, 0))[0], "total": total, "bytes": g.get("guardado", (0, 0))[1],
            "pendentes": g.get("pendente", (0, 0))[0], "fora_do_teto": g.get("fora_do_teto", (0, 0))[0],
            "teto_gb": round(teto_bytes() / (1 << 30), 1)}
