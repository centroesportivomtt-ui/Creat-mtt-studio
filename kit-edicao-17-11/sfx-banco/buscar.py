#!/usr/bin/env python3
"""Busca no banco de efeitos sonoros reais da creat.MTT e baixa o arquivo escolhido.

Exemplos:
  python3 buscar.py "water stream" --max 20
  python3 buscar.py "agua passando"            # termos em portugues funcionam
  python3 buscar.py "pisada na terra" --sem-voz
  python3 buscar.py --cat cachoeira --max 30    # so por categoria
  python3 buscar.py --categorias                # lista as categorias e quantos sons cada uma tem
  python3 buscar.py --info 1234                 # detalhes de um som
  python3 buscar.py --baixar 1234 --para ~/sfx  # baixa (FLAC se existir; senao WAV)
  python3 buscar.py --baixar 1234 --para ~/sfx --trecho 10:60   # so 60 s a partir de 10 s (WAV, usa Range)

So biblioteca padrao. Baixa 1 arquivo por vez, com pausa e recuo em 429/503; se o archive.org
bloquear, PARA (nao troca de rota). Licenca: veja LEIA.md (uso comercial livre, proibido revender
os sons soltos ou redistribuir como biblioteca).
"""
import argparse, os, re, sqlite3, struct, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(AQUI, "indice.sqlite")
UA = "creatMTT-sfx-buscar/1.0 (uso interno; 1 download por vez)"

# pequeno dicionario pt -> en (cada entrada vira um grupo OR; grupos sao ligados por AND)
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


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def montar_consulta(q):
    toks = re.findall(r"[a-z0-9\*\-]+", sem_acento(q))
    grupos = []
    for t in toks:
        if t in STOP:
            continue
        if t in PT and PT[t]:
            termos = list(PT[t])
        else:
            tt = t.replace("-", " ").strip()
            termos = [t.replace("-", "")] if t not in ("porta-malas",) else PT["porta-malas"]
            if len(t) >= 5 and not t.endswith("*") and t.isalpha():
                termos = [t + "*"]
        g = []
        for x in termos:
            x = x.replace('"', "")
            g.append('"%s"*' % x[:-1] if x.endswith("*") else '"%s"' % x)
        grupos.append(g)
    return grupos


def fts_expr(grupos, modo):
    if not grupos:
        return ""
    if modo == "and":
        return " AND ".join("(" + " OR ".join(g) + ")" for g in grupos)
    return " OR ".join("(" + " OR ".join(g) + ")" for g in grupos)


def conectar():
    if not os.path.exists(DB):
        sys.exit("indice.sqlite nao encontrado ao lado do buscar.py")
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


def fmt_tam(n):
    return "%.1f MB" % (n / 1e6) if n else "-"


def mostrar(r, i=None):
    cats = r["categorias"].replace(" ", ",")
    dur = "%.1fs" % r["dur_s"] if r["dur_s"] else "?"
    voz = " [risco de voz]" if r["risco_voz"] else ""
    print("#%d  %s | %s | %s | %s %s%s" % (r["id"], r["nome"][:110], r["biblioteca"][:60], r["pacote"], dur, r["canais"] or "", voz))
    print("      %s  flac %s / wav %s  cat: %s" % ("", fmt_tam(r["tam_flac"]), fmt_tam(r["tam_wav"]), cats))


def buscar(args):
    con = conectar()
    filtros, params = [], []
    if not args.todos:
        filtros.append("s.principal=1")
    if args.cat:
        for c in args.cat:
            filtros.append("(' '||s.categorias||' ') LIKE ?"); params.append("% " + c + " %")
    if args.sem_voz:
        filtros.append("s.risco_voz=0")
    if args.dur_min is not None:
        filtros.append("s.dur_s>=?"); params.append(args.dur_min)
    if args.dur_max is not None:
        filtros.append("s.dur_s<=?"); params.append(args.dur_max)
    if args.ano:
        filtros.append("s.pacote=?"); params.append("GDC " + args.ano)
    if args.canais:
        filtros.append("s.canais=?"); params.append(args.canais)
    where = (" AND " + " AND ".join(filtros)) if filtros else ""
    rows = []
    if args.consulta:
        grupos = montar_consulta(args.consulta)
        vistos = set()
        for modo in ("and", "or"):
            expr = fts_expr(grupos, modo)
            if not expr:
                break
            sql = ("SELECT s.* FROM busca b JOIN sons s ON s.id=b.rowid WHERE busca MATCH ?" + where +
                   " ORDER BY bm25(busca, 6.0, 2.0, 3.0, 0.0) LIMIT ?")
            for r in con.execute(sql, [expr] + params + [args.max * 3]):
                if r["id"] not in vistos:
                    vistos.add(r["id"]); rows.append(r)
            if len(rows) >= args.max:
                break
            if modo == "and" and len(grupos) > 1 and rows:
                print("(poucos resultados com todos os termos; completando com resultados parciais)\n")
        rows = rows[:args.max]
        print("consulta FTS:", fts_expr(grupos, "and"), "\n")
    else:
        sql = "SELECT s.* FROM sons s WHERE 1=1" + where + " ORDER BY s.dur_s DESC LIMIT ?"
        rows = list(con.execute(sql, params + [args.max]))
    for r in rows:
        mostrar(r)
    print("\n%d resultado(s). Baixar: python3 buscar.py --baixar <#id> --para <pasta>" % len(rows))


def categorias():
    con = conectar()
    from collections import Counter
    cn = Counter()
    for (x,) in con.execute("SELECT categorias FROM sons WHERE principal=1"):
        cn.update(x.split())
    for c, n in sorted(cn.items(), key=lambda t: -t[1]):
        print("%-22s %d" % (c, n))


# ---------- download ----------
def _abrir(url, headers=None, tentativas=5, timeout=180):
    espera = 10
    for t in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=dict({"User-Agent": UA}, **(headers or {})))
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and t < tentativas - 1:
                print("  archive.org respondeu %d; recuando %ds" % (e.code, espera)); time.sleep(espera); espera *= 2
                continue
            if e.code in (403, 429, 503):
                sys.exit("BLOQUEADO (%d). Paro aqui; nao troco de rota. Tente de novo mais tarde." % e.code)
            raise
        except urllib.error.URLError as e:
            if t < tentativas - 1:
                time.sleep(espera); espera *= 2; continue
            raise


def ler_cabecalho_wav(url):
    """Le o cabecalho de um WAV remoto: retorna (fmt_bytes, canais, taxa, bits, data_off, data_len)."""
    with _abrir(url, {"Range": "bytes=0-65535"}, tentativas=3, timeout=40) as r:
        b = r.read()
    if b[:4] not in (b"RIFF", b"RF64") or b[8:12] != b"WAVE":
        raise ValueError("nao e WAV")
    pos, fmt, data_off, data_len = 12, None, None, None
    while pos + 8 <= len(b):
        cid = b[pos:pos + 4]; sz = struct.unpack("<I", b[pos + 4:pos + 8])[0]
        if cid == b"fmt ":
            fmt = b[pos + 8:pos + 8 + sz]
        elif cid == b"data":
            data_off, data_len = pos + 8, sz
            break
        pos += 8 + sz + (sz & 1)
    if fmt is None or data_off is None:
        raise ValueError("cabecalho WAV nao encontrado nos primeiros 64 KB")
    tag, ch, rate, _, _, bits = struct.unpack("<HHIIHH", fmt[:16])
    return fmt, ch, rate, bits, data_off, data_len


def baixar_trecho_wav(url, destino, ini_s, dur_s):
    fmt, ch, rate, bits, off, dlen = ler_cabecalho_wav(url)
    bloco = ch * bits // 8
    ini = int(ini_s * rate) * bloco
    n = int(dur_s * rate) * bloco
    if dlen in (0, 0xFFFFFFFF):
        dlen = None
    if dlen is not None:
        n = min(n, max(0, dlen - ini))
    a, bfim = off + ini, off + ini + n - 1
    with _abrir(url, {"Range": "bytes=%d-%d" % (a, bfim)}) as r:
        dados = r.read()
    dados = dados[: len(dados) - len(dados) % bloco]
    with open(destino, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 4 + 8 + len(fmt) + (len(fmt) & 1) + 8 + len(dados)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<I", len(fmt)) + fmt + (b"\0" if len(fmt) & 1 else b""))
        f.write(b"data" + struct.pack("<I", len(dados)) + dados)
    return {"canais": ch, "taxa": rate, "bits": bits, "duracao_s": len(dados) / bloco / rate}


def nome_seguro(s):
    s = sem_acento(s)
    s = re.sub(r"[^a-z0-9._ -]+", "", s)
    s = re.sub(r"\s+", "_", s.strip())
    return s[:120] or "som"


def baixar(args):
    con = conectar()
    r = con.execute("SELECT * FROM sons WHERE id=?", (args.baixar,)).fetchone()
    if not r:
        sys.exit("id %s nao existe" % args.baixar)
    pasta = os.path.expanduser(args.para or ".")
    os.makedirs(pasta, exist_ok=True)
    base = nome_seguro(r["biblioteca"].split(" - ")[0] + "__" + r["nome"])
    if args.trecho:
        ini, dur = [float(x) for x in args.trecho.split(":")]
        if not r["url_wav"]:
            sys.exit("este som so existe em FLAC; --trecho exige WAV")
        dest = os.path.join(pasta, base + "_%d-%ds.wav" % (ini, ini + dur))
        info = baixar_trecho_wav(r["url_wav"], dest, ini, dur)
        print("ok", dest, info)
        return
    usar_flac = (args.formato == "flac" and r["url_flac"]) or not r["url_wav"]
    url = r["url_flac"] if usar_flac else r["url_wav"]
    ext = "flac" if usar_flac else "wav"
    dest = os.path.join(pasta, base + "." + ext)
    tam = r["tam_flac"] if usar_flac else r["tam_wav"]
    print("baixando %s (%s) -> %s" % (r["nome"], fmt_tam(tam), dest))
    with _abrir(url) as resp, open(dest + ".parte", "wb") as f:
        while True:
            bloco = resp.read(1 << 20)
            if not bloco:
                break
            f.write(bloco)
    os.replace(dest + ".parte", dest)
    print("ok", dest)


def info(i):
    con = conectar()
    r = con.execute("SELECT * FROM sons WHERE id=?", (i,)).fetchone()
    if not r:
        sys.exit("id inexistente")
    for k in r.keys():
        print("%-12s %s" % (k, r[k]))


def main():
    ap = argparse.ArgumentParser(description="Busca no banco de SFX reais da creat.MTT")
    ap.add_argument("consulta", nargs="?", help="termos em portugues ou ingles")
    ap.add_argument("--max", type=int, default=20)
    ap.add_argument("--cat", action="append", help="filtra por categoria (pode repetir)")
    ap.add_argument("--sem-voz", action="store_true", help="esconde sons com risco de voz humana no nome")
    ap.add_argument("--dur-min", type=float); ap.add_argument("--dur-max", type=float)
    ap.add_argument("--ano", help="ex.: 2019"); ap.add_argument("--canais", choices=["mono", "estereo", "surround", "ambisonico"])
    ap.add_argument("--todos", action="store_true", help="inclui espelhos duplicados")
    ap.add_argument("--categorias", action="store_true")
    ap.add_argument("--info", type=int)
    ap.add_argument("--baixar", type=int, help="id do som")
    ap.add_argument("--para", help="pasta de destino")
    ap.add_argument("--formato", choices=["flac", "wav"], default="flac")
    ap.add_argument("--trecho", help="INI:DUR em segundos (so WAV, baixa apenas esse pedaco)")
    a = ap.parse_args()
    if a.categorias:
        categorias()
    elif a.info:
        info(a.info)
    elif a.baixar:
        baixar(a)
    elif a.consulta or a.cat:
        buscar(a)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
