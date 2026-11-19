"""BACKUP diário do que não se refaz (fila do dono, item A): banco, memória da casa, pedidos, direções, EDLs, relatórios
de QA, análises e o livro de gastos. Vídeo e áudio ficam de fora (pesados; moram no volume).

    python -m motor.backup montar            # só monta o pacote em <dados>/backups e mostra o que entrou
    python -m motor.backup rodar             # monta e envia (precisa do destino configurado)

Destino: uma "solicitação de arquivos" do Dropbox do dono (envio sem chave, só upload). O endereço NUNCA fica no
repositório: vem de EDITOR_BACKUP_PEDIDO (variável da hospedagem) ou de `<dados>/backup_config.json`, gravado pela tela
"Backup" do Caderno. Junto do .zip vai um .json só com a memória (regras, vocabulário, checagens, casos, referências),
legível como texto: é por ele que a sessão de engenharia traz para o git o que o servidor aprendeu.

Nunca entram: `.segredos`, vídeo, áudio, imagem, modelos baixados, cache. Arquivo acima de 5 MB fica de fora e é
listado no MANIFESTO.json. O agendador (thread do motor) roda uma vez por dia; falha tenta de novo em 1 hora.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import sqlite3
import subprocess
import sys
import threading
import time
import zipfile

from motor import config

PEDIDO_OK = re.compile(r"^https://www\.dropbox\.com/request/[A-Za-z0-9]{8,40}$")
MAX_ARQUIVO = 5 * 1024 * 1024
MAX_TOTAL = 200 * 1024 * 1024
ENTRE_MANUAIS_S = 600
MANTER_LOCAIS = 3
INTERVALO_OK_S, INTERVALO_FALHA_S = 24 * 3600, 3600
SO_ESTES_EM_SAIDAS = {"edl.json", "qa.json", "montagem.json", "entrega.json", "cor.json"}
_TRAVA = threading.Lock()


def _agora() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _ler_json(p: pathlib.Path, padrao):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return padrao


def _gravar_json(p: pathlib.Path, obj, modo: int | None = None) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    if modo is not None:
        os.chmod(tmp, modo)
    os.replace(tmp, p)


# ---------------------------------------------------------------- destino
def pedido(cfg) -> str:
    """Endereço da solicitação de arquivos (variável da hospedagem ou tela Backup). '' = sem destino."""
    env = os.environ.get("EDITOR_BACKUP_PEDIDO", "").strip()
    if PEDIDO_OK.match(env):
        return env
    url = str(_ler_json(pathlib.Path(cfg.dados) / "backup_config.json", {}).get("pedido") or "").strip()
    return url if PEDIDO_OK.match(url) else ""


def configurar(cfg, url: str) -> None:
    url = (url or "").strip()
    if not PEDIDO_OK.match(url):
        raise ValueError("endereço não reconhecido: cole o link da solicitação de arquivos (https://www.dropbox.com/request/...)")
    _gravar_json(pathlib.Path(cfg.dados) / "backup_config.json", {"pedido": url, "em": _agora()}, 0o600)


# ---------------------------------------------------------------- pacote
def raiz_memoria() -> pathlib.Path:
    return pathlib.Path(os.environ.get("EDITOR_MEMORIA") or config.MEMORIA)


def exportar_memoria(raiz: pathlib.Path | None = None) -> dict:
    """A memória da casa num JSON só (texto): o que o git já tem e o que o servidor aprendeu."""
    raiz = pathlib.Path(raiz or raiz_memoria())
    r = _ler_json(raiz / "regras.json", {})
    casos = [c for c in (_ler_json(p, None) for p in sorted(raiz.glob("casos/*/caso.json"))) if c]
    refs = [x for x in (_ler_json(p, None) for p in sorted(raiz.glob("referencias/*.json"))) if x]
    return {"versao": "1", "exportado_em": _agora(), "regras": r.get("regras", []), "vocabulario": r.get("vocabulario", []),
            "checagens": _ler_json(raiz / "checagens.json", {}).get("checagens", []), "casos": casos, "referencias": refs}


def _copiar_banco(origem: pathlib.Path, destino: pathlib.Path) -> None:
    """Cópia consistente do SQLite em uso (API de backup do próprio SQLite; não copia o arquivo no meio de uma escrita)."""
    a = sqlite3.connect(f"file:{origem}?mode=ro", uri=True, timeout=30)
    try:
        b = sqlite3.connect(str(destino))
        try:
            a.backup(b)
        finally:
            b.close()
    finally:
        a.close()
    c = sqlite3.connect(str(destino))
    try:                                   # o link de download da versão pode ser pré-assinado (R2): não sai do servidor
        c.execute("UPDATE versoes SET link=NULL")
        c.commit()
        c.execute("VACUUM")
    except sqlite3.Error:
        pass
    finally:
        c.close()


def _sem_links(p: pathlib.Path) -> bytes:
    """entrega.json sem `link` nem `capa` (endereços que dão acesso ao vídeo sem login)."""
    d = _ler_json(p, {})
    if isinstance(d, dict):
        d = {k: v for k, v in d.items() if k not in ("link", "capa")}
    return json.dumps(d, ensure_ascii=False).encode("utf-8")


def _candidatos(dados: pathlib.Path, memoria: pathlib.Path):
    """(nome no zip, caminho) do que entra. Só JSON/JSONL/MD pequenos; nada de segredo, mídia, modelo ou cache."""
    for nome in ("gastos.jsonl", "diagnostico_direcao.json", "diagnostico_olho.json"):
        if (dados / nome).is_file():
            yield nome, dados / nome
    if memoria.is_dir():
        for p in sorted(memoria.rglob("*")):
            if p.is_file() and p.suffix in (".json", ".md") and not p.name.startswith("."):
                yield f"memoria/{p.relative_to(memoria).as_posix()}", p
    arm = dados / "armazenamento"
    for sub in ("projetos", "saidas", "derivados"):
        base = arm / sub
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*.json")):
            if not p.is_file() or "/qa/" in p.as_posix() or p.name.startswith("."):
                continue
            if sub == "saidas" and p.name not in SO_ESTES_EM_SAIDAS:
                continue
            if sub == "derivados" and p.name not in ("analise.json", "ingest.json", "uso_visao.json"):
                continue
            yield f"armazenamento/{p.relative_to(arm).as_posix()}", p
    refs = dados / "referencias"
    if refs.is_dir():
        for p in sorted(refs.rglob("*.json")):
            if p.is_file():
                yield f"referencias/{p.relative_to(refs).as_posix()}", p


def montar(cfg, pasta: pathlib.Path | None = None) -> dict:
    """Monta `editor-backup-AAAAMMDD-HHMM.zip` e `editor-memoria-AAAAMMDD-HHMM.json` (nomes sem acento)."""
    dados = pathlib.Path(cfg.dados)
    pasta = pathlib.Path(pasta or dados / "backups")
    pasta.mkdir(parents=True, exist_ok=True)
    carimbo = time.strftime("%Y%m%d-%H%M", time.gmtime())
    arq_zip, arq_mem = pasta / f"editor-backup-{carimbo}.zip", pasta / f"editor-memoria-{carimbo}.json"
    memoria = raiz_memoria()
    entrou, fora, total = [], [], 0
    tmp_zip = arq_zip.with_suffix(".zip.tmp")
    for resto in pasta.glob("*.zip.tmp"):               # sobra de uma montagem que caiu no meio
        resto.unlink(missing_ok=True)
    try:
        return _montar(cfg, dados, pasta, memoria, arq_zip, arq_mem, tmp_zip, entrou, fora, total)
    finally:
        tmp_zip.unlink(missing_ok=True)


def _montar(cfg, dados, pasta, memoria, arq_zip, arq_mem, tmp_zip, entrou, fora, total) -> dict:
    with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        if pathlib.Path(cfg.banco).is_file():
            tmp_db = pasta / f".motor-{os.getpid()}.db"
            try:
                _copiar_banco(pathlib.Path(cfg.banco), tmp_db)
                z.write(tmp_db, "motor.db")
                entrou.append({"nome": "motor.db", "bytes": tmp_db.stat().st_size})
            finally:
                tmp_db.unlink(missing_ok=True)
        for nome, p in _candidatos(dados, memoria):
            tam = p.stat().st_size
            if tam > MAX_ARQUIVO:
                fora.append({"nome": nome, "bytes": tam, "motivo": "maior que 5 MB"})
                continue
            if total + tam > MAX_TOTAL:
                fora.append({"nome": nome, "bytes": tam, "motivo": "pacote chegou ao teto de 200 MB"})
                continue
            total += tam
            if p.name == "entrega.json":
                z.writestr(nome, _sem_links(p))
            else:
                z.write(p, nome)
            entrou.append({"nome": nome, "bytes": tam})
        midia = [p for p in (dados / "armazenamento").rglob("*") if p.is_file() and p.suffix.lower() in (".mp4", ".mov", ".wav", ".flac", ".m4a", ".mp3")] \
            if (dados / "armazenamento").is_dir() else []
        manifesto = {"feito_em": _agora(), "commit": os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")[:7] or None, "arquivos": entrou, "fora": fora,
                     "midia_fora_do_backup": {"arquivos": len(midia), "bytes": sum(p.stat().st_size for p in midia)},
                     "nota": "Vídeo e áudio não entram (ficam no volume do servidor). Segredos nunca entram."}
        z.writestr("MANIFESTO.json", json.dumps(manifesto, ensure_ascii=False, indent=1))
    os.replace(tmp_zip, arq_zip)
    _gravar_json(arq_mem, exportar_memoria(memoria))
    antigos = sorted(pasta.glob("editor-backup-*.zip"))[:-MANTER_LOCAIS] + sorted(pasta.glob("editor-memoria-*.json"))[:-MANTER_LOCAIS]
    for p in antigos:
        p.unlink(missing_ok=True)
    h = hashlib.sha256()
    with open(arq_zip, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return {"zip": str(arq_zip), "memoria": str(arq_mem), "arquivos": len(entrou), "bytes": arq_zip.stat().st_size, "sha256": h.hexdigest(),
            "fora": len(fora), "midia_fora": manifesto["midia_fora_do_backup"]}


# ---------------------------------------------------------------- envio
def enviar(cfg, arquivos: list[str], url: str, *, limite_s: int = 900) -> tuple[bool, str]:
    """Envia pela solicitação de arquivos com o navegador do kit (o mesmo Chromium do render). Devolve (ok, última linha)."""
    script = config.KIT / "ferramentas" / "dropbox-enviar.cjs"
    # ambiente mínimo: o navegador não herda a chave do cérebro, o token do motor nem nada do editor
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "TMPDIR", "PLAYWRIGHT_BROWSERS_PATH", "NODE_PATH", "DROPBOX_PRINT", "DROPBOX_QUALQUER_HOST") if k in os.environ}
    env.update(DROPBOX_REMETENTE_NOME=os.environ.get("EDITOR_BACKUP_NOME", "Editor creatMTT"),
               DROPBOX_REMETENTE_EMAIL=os.environ.get("EDITOR_BACKUP_EMAIL", "entrega@creatmtt.com.br"))
    try:
        r = subprocess.run(["node", str(script), "--pedido", url, *arquivos], capture_output=True, text=True, timeout=limite_s, env=env, cwd=str(config.KIT))
    except subprocess.TimeoutExpired:
        return False, f"o envio passou de {limite_s} s"
    except OSError as e:
        return False, f"não rodou o envio: {type(e).__name__}"
    return r.returncode == 0, _sem_endereco(r.stdout + "\n" + r.stderr, url)


def _sem_endereco(saida: str, url: str) -> str:
    """Última linha útil da saída, sem o endereço do pedido (inteiro ou cortado) em lugar nenhum."""
    limpo = saida.replace(url, "<pedido>")
    limpo = re.sub(r"dropbox\.com/request/[A-Za-z0-9]*", "dropbox.com/request/<pedido>", limpo)
    linhas = [ln.strip() for ln in limpo.splitlines() if ln.strip()]
    uteis = [ln for ln in linhas if ln.startswith(("ok ", "erro "))] or linhas
    return (uteis[-1] if uteis else "")[:300]


# ---------------------------------------------------------------- estado e execução
def _arq_estado(cfg) -> pathlib.Path:
    return pathlib.Path(cfg.dados) / "backup_estado.json"


def estado(cfg) -> dict:
    """Para a saúde e a tela: nunca devolve o endereço do destino, só se existe."""
    e = _ler_json(_arq_estado(cfg), {})
    out = {"destino": "configurado" if pedido(cfg) else "falta configurar", "estado": e.get("estado", "nunca rodou")}
    if PEDIDO_OK.match(os.environ.get("EDITOR_BACKUP_PEDIDO", "").strip()):
        out["destino_fixo"] = True                      # veio da variável da hospedagem: a tela não troca
    for k in ("ultimo_ok", "ultima_tentativa", "bytes", "arquivos", "erro", "midia_fora"):
        if e.get(k) is not None:
            out[k] = e[k]
    if e.get("ultimo_ok_ts"):
        out["horas_desde_o_ultimo"] = round((time.time() - e["ultimo_ok_ts"]) / 3600, 1)
    return out


def rodar(cfg, *, enviar_fn=None) -> dict:
    """Monta e envia. Um por vez (trava). Sem destino, monta o pacote local e diz que falta configurar."""
    if not _TRAVA.acquire(blocking=False):
        return dict(estado(cfg), estado="rodando")
    try:
        ant = _ler_json(_arq_estado(cfg), {})
        novo = {k: ant.get(k) for k in ("ultimo_ok", "ultimo_ok_ts")}
        novo.update(ultima_tentativa=_agora(), ultima_tentativa_ts=time.time())
        try:
            pac = montar(cfg)
            novo.update(bytes=pac["bytes"], arquivos=pac["arquivos"], midia_fora=pac["midia_fora"])
            url = pedido(cfg)
            if not url:
                novo.update(estado="sem destino", erro="pacote montado no servidor, mas falta o endereço do Dropbox (tela Backup do Caderno)")
            else:
                ok, msg = (enviar_fn or enviar)(cfg, [pac["zip"], pac["memoria"]], url)
                if ok:
                    novo.update(estado="ok", ultimo_ok=_agora(), ultimo_ok_ts=time.time(), erro=None)
                else:
                    novo.update(estado="falha", erro=f"o Dropbox não confirmou o envio: {msg}")
        except Exception as e:  # noqa: BLE001 - o motivo fica visível na saúde
            novo.update(estado="falha", erro=f"{type(e).__name__}: {str(e)[:200]}")
        _gravar_json(_arq_estado(cfg), novo)
        return estado(cfg)
    finally:
        _TRAVA.release()


def espera_manual(cfg) -> float:
    """Segundos que faltam para aceitar outro pedido manual (cada um monta o pacote e abre um navegador)."""
    e = _ler_json(_arq_estado(cfg), {})
    return max(0.0, ENTRE_MANUAIS_S - (time.time() - float(e.get("ultima_tentativa_ts") or 0)))


def precisa_rodar(cfg, agora: float | None = None) -> bool:
    if not pedido(cfg):
        return False
    e = _ler_json(_arq_estado(cfg), {})
    agora = agora or time.time()
    if agora - float(e.get("ultimo_ok_ts") or 0) < INTERVALO_OK_S:
        return False
    return agora - float(e.get("ultima_tentativa_ts") or 0) >= INTERVALO_FALHA_S


def agendar(cfg, intervalo_s: int = 900) -> threading.Thread | None:
    """Thread do motor: a cada 15 min confere se já passou um dia do último backup bom. EDITOR_BACKUP=0 desliga."""
    if os.environ.get("EDITOR_BACKUP", "1").strip() == "0":
        return None

    def laco():
        time.sleep(120)                                  # deixa o motor subir
        while True:
            try:
                if precisa_rodar(cfg):
                    rodar(cfg)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(intervalo_s)
    t = threading.Thread(target=laco, daemon=True, name="backup")
    t.start()
    return t


def main(argv=None) -> int:
    cfg = config.carregar()
    cmd = (argv or sys.argv[1:] or ["montar"])[0]
    if cmd == "montar":
        print(json.dumps(montar(cfg), ensure_ascii=False, indent=1))
        return 0
    if cmd == "rodar":
        r = rodar(cfg)
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0 if r.get("estado") == "ok" else 1
    print("uso: python -m motor.backup montar|rodar")
    return 2


if __name__ == "__main__":
    sys.exit(main())
