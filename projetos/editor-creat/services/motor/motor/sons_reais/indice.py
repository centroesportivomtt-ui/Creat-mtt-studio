"""Índice do banco de sons reais (peça M6): consulta em pt/en sobre as 7.546 gravações dos pacotes Sonniss #GameAudioGDC.

Porta de `kit-edicao-17-11/sfx-banco/buscar.py` como BIBLIOTECA: devolve dicts, nunca imprime e nunca sai do programa
(o `sys.exit` do script derrubaria a montagem). O dicionário PT, as palavras vazias, `montar_consulta`, `fts_expr` e o
ranking `bm25(busca, 6.0, 2.0, 3.0, 0.0)` (primeiro com E, depois completa com OU) são os mesmos do script.

Onde o índice vive:
- em produção o build do Railway só enxerga `projetos/editor-creat`, então o motor leva uma CÓPIA de `indice.jsonl.gz`
  (2,7 MB, só metadados, nenhum áudio) ao lado deste arquivo. Na primeira consulta ele monta
  `<dados>/cache/sons_reais/indice.sqlite` só com as linhas `principal=1` (espelhos ficam fora), a mesma tabela `sons` e o
  FTS5 `busca`. Grava num temporário e troca com `os.replace` (motor e worker dividem o volume). O sha256 do jsonl fica em
  `meta`; se a cópia mudar, o sqlite é refeito;
- `EDITOR_SFX_BANCO=<caminho.sqlite>` passa por cima (o índice do kit, em desenvolvimento).
Índice ausente, sem FTS5 ou corrompido levanta `IndiceIndisponivel`; quem chama transforma em aviso.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import pathlib
import re
import sqlite3
import threading
import unicodedata

JSONL = pathlib.Path(__file__).with_name("indice.jsonl.gz")
VERSAO_INDICE = "1"
COLUNAS = ("id", "item", "pacote", "principal", "biblioteca", "nome", "caminho", "caminho_wav", "caminho_flac", "tam_wav", "tam_flac",
           "dur_s", "canais", "item_flac", "url_wav", "url_flac", "categorias", "risco_voz", "md5_wav", "md5_flac")
RANKING = "bm25(busca, 6.0, 2.0, 3.0, 0.0)"
_TRAVA = threading.Lock()
_VISTO: dict = {}                     # (jsonl, tamanho, mtime) -> sha256 (o jsonl não é relido a cada consulta)


class IndiceIndisponivel(Exception):
    """Sem índice utilizável (arquivo ausente, sem FTS5, corrompido). Vira aviso; o filme sai sem sons reais."""


# dicionário pt -> en do buscar.py (cada entrada vira um grupo OU; grupos são ligados por E)
PT = {
    "agua": ["water"], "aguas": ["water"], "rio": ["river", "stream", "creek"], "riacho": ["stream", "creek", "brook"],
    "corrego": ["stream", "creek", "brook"], "cachoeira": ["waterfall", "cascade"], "queda": ["waterfall", "falls"],
    "respingo": ["splash", "drip"], "gota": ["drip", "drop"], "gotas": ["drip", "drop"], "poco": ["well", "pond", "cistern"],
    "lago": ["lake", "pond"], "mar": ["ocean", "sea", "waves"], "onda": ["waves", "wave"], "ondas": ["waves", "wave"],
    "passando": ["pass*", "flow*", "flowing"], "corrente": ["flowing", "stream", "running"], "correndo": ["running", "flowing"],
    "chuva": ["rain"], "chuvisco": ["drizzle", "rain"], "trovao": ["thunder"], "raio": ["lightning", "thunder"], "tempestade": ["storm"],
    "pisada": ["footstep*", "step*"], "pisadas": ["footstep*", "step*"], "passos": ["footstep*", "steps"], "passo": ["footstep*", "step"],
    "andando": ["walking", "walk"], "correr": ["running", "run"], "caminhando": ["walking", "walk"],
    "terra": ["dirt", "soil", "earth", "ground"], "barro": ["mud"], "lama": ["mud"], "areia": ["sand"], "cascalho": ["gravel"],
    "pedra": ["stone", "rock"], "pedras": ["stones", "rocks"], "neve": ["snow"], "grama": ["grass"], "capim": ["grass", "reeds"],
    "mato": ["grass", "brush", "bush*", "undergrowth", "foliage"], "folha": ["leaf", "leaves", "foliage"], "folhas": ["leaves", "leaf", "foliage"],
    "seca": ["dry"], "secas": ["dry"], "seco": ["dry"], "galho": ["branch*", "twig*", "stick*"], "galhos": ["branch*", "twig*", "stick*"],
    "samambaia": ["fern*", "foliage", "bush*"], "arvore": ["tree*"], "arvores": ["tree*"], "copa": ["canopy", "tree*", "leaves"],
    "eucalipto": ["eucalyptus", "forest", "tree*"], "floresta": ["forest", "jungle", "woods"], "mata": ["forest", "woods", "jungle"],
    "selva": ["jungle", "rainforest"], "natureza": ["nature", "forest"], "campo": ["field", "meadow", "countryside"],
    "vento": ["wind", "breeze", "gust*"], "brisa": ["breeze", "wind"], "rajada": ["gust*", "wind"],
    "passaro": ["bird*"], "passaros": ["bird*"], "ave": ["bird*"], "aves": ["bird*"], "tropical": ["tropical", "jungle", "rainforest", "thailand", "vietnam", "brazil"],
    "cigarra": ["cicada*"], "cigarras": ["cicada*"], "grilo": ["cricket*"], "grilos": ["cricket*"], "inseto": ["insect*"], "insetos": ["insect*"],
    "sapo": ["frog*"], "sapos": ["frog*"], "noite": ["night"], "manha": ["morning", "dawn"], "dia": ["day", "daytime"], "tarde": ["afternoon", "evening"],
    "ambiente": ["ambience", "ambient", "atmos*", "amb"], "ambiencia": ["ambience", "atmos*"],
    "carro": ["car", "vehicle"], "carros": ["car", "vehicle"], "porta": ["door"], "portas": ["door"], "malas": ["trunk", "tailgate", "hatch*"],
    "porta-malas": ["trunk", "tailgate", "hatch*"], "portamalas": ["trunk", "tailgate", "hatch*"], "tampa": ["lid", "trunk", "tailgate", "hatch*"],
    "traseira": ["rear", "trunk", "tailgate"], "abrindo": ["open*"], "abre": ["open*"], "abrir": ["open*"], "fechando": ["clos*"], "fecha": ["clos*"], "fechar": ["clos*"],
    "batendo": ["slam*", "close"], "cinto": ["seatbelt", "seat", "belt", "buckle*"], "fivela": ["buckle*"], "motor": ["engine", "motor"],
    "interior": ["interior", "int", "inside", "cabin"], "dentro": ["interior", "int", "inside", "cabin"], "fora": ["exterior", "ext", "outside"],
    "pneu": ["tire", "tyre"], "estrada": ["road", "dirt", "gravel"], "buzina": ["horn"], "moto": ["motorcycle", "motorbike"], "caminhao": ["truck"], "onibus": ["bus"],
    "vidro": ["glass"], "correr_porta": ["sliding"], "deslizando": ["slid*", "slide"], "tranca": ["lock*"], "trava": ["lock*"], "chave": ["key*"], "macaneta": ["handle*", "knob"],
    "whoosh": ["whoosh*", "swoosh*", "swish*"], "passagem": ["pass*", "whoosh*", "swish*"], "varada": ["swish*", "whoosh*"], "vara": ["rod", "pole", "stick", "swish*"],
    "tecido": ["cloth*", "fabric*"], "roupa": ["cloth*", "garment*", "fabric*"], "couro": ["leather"], "impacto": ["impact*", "hit*"], "pancada": ["hit*", "impact*", "thud*", "punch*"],
    "grave": ["low", "deep", "sub"], "baque": ["thud*", "impact*"], "explosao": ["explosion*", "blast*"], "subida": ["riser", "rise", "rising", "build*"],
    "riser": ["riser", "rising", "build*"], "transicao": ["transition*", "whoosh*", "sweep*", "riser", "impact*"], "cinema": ["cinematic", "trailer", "impact*", "whoosh*"],
    "cinematografico": ["cinematic", "trailer"], "fogo": ["fire", "flame", "campfire"], "fogueira": ["campfire", "fire", "bonfire"], "multidao": ["crowd"], "cidade": ["city", "urban", "street"],
    "rua": ["street", "road"], "trafego": ["traffic"], "sino": ["bell"], "campainha": ["doorbell", "bell"], "vozes": ["voice*", "voices"], "madeira": ["wood*"], "metal": ["metal*"],
    "pequena": ["small"], "pequeno": ["small"], "grande": ["large", "big"], "forte": ["heavy", "strong", "loud"], "fraco": ["light", "soft", "gentle"], "suave": ["soft", "gentle", "light"],
    "perto": ["close", "near"], "longe": ["distant", "far"], "distante": ["distant", "far"], "estereo": ["stereo"], "lento": ["slow"], "rapido": ["fast", "quick"],
    "de": None, "da": None, "do": None, "na": None, "no": None, "em": None, "um": None, "uma": None, "e": None, "com": None, "para": None, "a": None, "o": None, "as": None, "os": None,
}
STOP = {k for k, v in PT.items() if v is None}


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def montar_consulta(q: str) -> list[list[str]]:
    """Texto -> grupos de termos FTS (cada palavra pt vira o seu grupo em inglês; palavra desconhecida de 5+ letras vira
    prefixo). Igual ao buscar.py."""
    grupos = []
    for t in re.findall(r"[a-z0-9\*\-]+", sem_acento(q or "")):
        if t in STOP:
            continue
        if t in PT and PT[t]:
            termos = list(PT[t])
        else:
            termos = [t.replace("-", "")]
            if len(t) >= 5 and not t.endswith("*") and t.isalpha():
                termos = [t + "*"]
        g = []
        for x in termos:
            x = x.replace('"', "")
            if not x.strip("*"):
                continue
            g.append('"%s"*' % x[:-1] if x.endswith("*") else '"%s"' % x)
        if g:
            grupos.append(g)
    return grupos


def fts_expr(grupos: list[list[str]], modo: str) -> str:
    if not grupos:
        return ""
    junta = " AND " if modo == "and" else " OR "
    return junta.join("(" + " OR ".join(g) + ")" for g in grupos)


# ---------------------------------------------------------------- onde fica o sqlite
def _dados(cfg) -> pathlib.Path:
    """Pasta de dados: a da Config (ou do SimpleNamespace de teste); sem cfg (resolvedor), a mesma regra da Config."""
    d = getattr(cfg, "dados", None) if cfg is not None else None
    if d:
        return pathlib.Path(d)
    from motor import config
    return pathlib.Path(os.environ.get("EDITOR_DADOS", "").strip() or str(config.RAIZ_REPO / "dados"))


def pasta_cache(cfg) -> pathlib.Path:
    return _dados(cfg) / "cache" / "sons_reais"


def caminho_banco(cfg) -> tuple[pathlib.Path, bool]:
    """(caminho do sqlite, é o do kit por variável de ambiente?)."""
    manual = (getattr(cfg, "sfx_banco", None) if cfg is not None else None) or os.environ.get("EDITOR_SFX_BANCO", "").strip()
    if manual:
        return pathlib.Path(manual), True
    return pasta_cache(cfg) / "indice.sqlite", False


def _sha256(p: pathlib.Path) -> str:
    st = p.stat()
    k = (str(p), st.st_size, st.st_mtime_ns)
    if k not in _VISTO:
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for b in iter(lambda: f.read(1 << 20), b""):
                h.update(b)
        _VISTO[k] = h.hexdigest()
    return _VISTO[k]


def _linha(j: dict) -> tuple:
    cats = j.get("categorias") or []
    cats = " ".join(cats) if isinstance(cats, list) else str(cats)
    v = {**j, "categorias": cats, "risco_voz": 1 if j.get("risco_voz") else 0, "canais": j.get("canais") or "",
         "principal": 1 if j.get("principal") else 0}
    return tuple(v.get(c) for c in COLUNAS)


def montar(jsonl: pathlib.Path, destino: pathlib.Path) -> dict:
    """jsonl.gz -> sqlite (só principal=1), num temporário trocado de uma vez (os.replace). Devolve {linhas, sha256}."""
    jsonl, destino = pathlib.Path(jsonl), pathlib.Path(destino)
    if not jsonl.exists():
        raise IndiceIndisponivel(f"índice de sons reais ausente ({jsonl.name})")
    sha = _sha256(jsonl)
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(f".{destino.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.unlink(missing_ok=True)
    n = 0
    try:
        con = sqlite3.connect(str(tmp))
        try:
            con.execute("CREATE TABLE sons(id INTEGER PRIMARY KEY, item TEXT, pacote TEXT, principal INTEGER, biblioteca TEXT, nome TEXT, "
                        "caminho TEXT, caminho_wav TEXT, caminho_flac TEXT, tam_wav INTEGER, tam_flac INTEGER, dur_s REAL, canais TEXT, "
                        "item_flac TEXT, url_wav TEXT, url_flac TEXT, categorias TEXT, risco_voz INTEGER, md5_wav TEXT, md5_flac TEXT)")
            try:
                con.execute("CREATE VIRTUAL TABLE busca USING fts5(nome, biblioteca, categorias, pacote, tokenize='unicode61 remove_diacritics 2')")
            except sqlite3.OperationalError as e:
                raise IndiceIndisponivel(f"este Python não tem FTS5 ({e})") from e
            con.execute("CREATE TABLE meta(chave TEXT PRIMARY KEY, valor TEXT)")
            lote = []
            with gzip.open(jsonl, "rt", encoding="utf-8") as f:
                for linha in f:
                    if not linha.strip():
                        continue
                    j = json.loads(linha)
                    if not j.get("principal"):
                        continue
                    lote.append(_linha(j))
                    if len(lote) >= 2000:
                        _inserir(con, lote)
                        n += len(lote)
                        lote = []
            _inserir(con, lote)
            n += len(lote)
            con.executemany("INSERT INTO meta VALUES (?,?)", [("fonte_sha256", sha), ("versao", VERSAO_INDICE), ("linhas", str(n)), ("fts5", "1")])
            con.commit()
        finally:
            con.close()
        os.replace(tmp, destino)
    except (OSError, ValueError, sqlite3.DatabaseError, EOFError) as e:
        tmp.unlink(missing_ok=True)
        raise IndiceIndisponivel(f"não consegui montar o índice de sons reais ({type(e).__name__}: {e})") from e
    finally:
        tmp.unlink(missing_ok=True)
    return {"linhas": n, "sha256": sha}


def _inserir(con, lote: list[tuple]) -> None:
    if not lote:
        return
    con.executemany(f"INSERT INTO sons({','.join(COLUNAS)}) VALUES ({','.join('?' * len(COLUNAS))})", lote)
    con.executemany("INSERT INTO busca(rowid, nome, biblioteca, categorias, pacote) VALUES (?,?,?,?,?)",
                    [(r[0], r[5] or "", r[4] or "", r[16] or "", r[2] or "") for r in lote])


def _meta(p: pathlib.Path) -> dict:
    try:
        con = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
        try:
            return dict(con.execute("SELECT chave, valor FROM meta").fetchall())
        finally:
            con.close()
    except sqlite3.DatabaseError:
        return {}


def abrir(cfg=None, jsonl: pathlib.Path | None = None) -> sqlite3.Connection:
    """Conexão SÓ DE LEITURA ao índice, montando/refazendo o sqlite do cache quando preciso."""
    p, manual = caminho_banco(cfg)
    if not manual:
        fonte = pathlib.Path(jsonl or JSONL)
        if not fonte.exists():
            raise IndiceIndisponivel(f"índice de sons reais ausente ({fonte.name})")
        with _TRAVA:
            try:
                sha = _sha256(fonte)
                if not p.exists() or _meta(p).get("fonte_sha256") != sha:
                    montar(fonte, p)
            except OSError as e:                   # sem permissão, disco cheio: vira aviso, nunca derruba o EDL
                raise IndiceIndisponivel(f"não consegui ler o índice de sons reais ({type(e).__name__}: {e})") from e
    if not p.exists():
        raise IndiceIndisponivel(f"índice de sons reais não encontrado em {p.name}")
    try:
        con = sqlite3.connect(f"file:{p}?mode=ro", uri=True, check_same_thread=False)
        con.row_factory = sqlite3.Row
        con.execute("SELECT count(*) FROM sons").fetchone()
        con.execute("SELECT rowid FROM busca WHERE busca MATCH ? LIMIT 1", ('"water"',)).fetchall()
    except sqlite3.DatabaseError as e:
        raise IndiceIndisponivel(f"índice de sons reais ilegível ({type(e).__name__}: {e})") from e
    return con


# ---------------------------------------------------------------- consulta
def buscar(con: sqlite3.Connection, consulta: str, *, filtros: list[str] | None = None, params: list | None = None,
           limite: int = 60) -> list[dict]:
    """Busca como o buscar.py (E primeiro, depois completa com OU), sempre só nas linhas principais.

    Cada resultado é um dict da tabela `sons` + `pontos` (bm25: quanto MENOR, melhor) + `modo` ("and"/"or").
    Filtros extras entram como SQL PARAMETRIZADO (`s.dur_s >= ?` + params): nada de texto do pedido no SQL."""
    grupos = montar_consulta(consulta)
    if not grupos:
        return []
    onde = " AND ".join(["s.principal=1"] + list(filtros or []))
    vistos, out = set(), []
    for modo in ("and", "or"):
        expr = fts_expr(grupos, modo)
        sql = (f"SELECT s.*, {RANKING} AS pontos FROM busca JOIN sons s ON s.id=busca.rowid WHERE busca MATCH ? AND {onde} "
               f"ORDER BY pontos, s.id LIMIT ?")
        try:
            linhas = con.execute(sql, [expr] + list(params or []) + [int(limite)]).fetchall()
        except sqlite3.OperationalError as e:
            raise IndiceIndisponivel(f"consulta inválida no índice ({e})") from e
        for r in linhas:
            if r["id"] not in vistos:
                vistos.add(r["id"])
                out.append({**dict(r), "modo": modo})
        if len(out) >= limite or len(grupos) == 1:
            break
    return out[:limite]


def info(con: sqlite3.Connection, id_banco: int) -> dict | None:
    r = con.execute("SELECT * FROM sons WHERE id=?", (int(id_banco),)).fetchone()
    return dict(r) if r else None
