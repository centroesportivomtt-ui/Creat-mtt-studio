#!/usr/bin/env python3
"""Reconstroi indice.sqlite e indice.jsonl.gz a partir dos metadados do archive.org.

Uso:
  python3 construir_indice.py --meta <pasta_com_json> [--baixar-meta] --saida <pasta>

--baixar-meta  baixa /metadata/<item> de cada item (1 pedido por vez, com pausa e recuo
               exponencial em 429/503; para se bloquear).
So biblioteca padrao. Nao baixa audio nenhum.
"""
import argparse, gzip, json, os, re, sqlite3, sys, time, urllib.parse, urllib.request, urllib.error

# (item do archive.org, pacote/ano, prioridade). Menor prioridade = fonte principal.
# Espelhos repetidos do mesmo pacote entram marcados como duplicata (principal=0).
ITENS = [
    ("game-audio-gdc",                                   "GDC 2015", 1),
    ("SonnissGameAudioGDCPart2",                         "GDC 2016", 1),
    ("game-audio-gdcpart-3",                             "GDC 2017", 1),
    ("game-audio-gdcpart-4",                             "GDC 2018", 1),
    ("game-audio-gdcpart-5",                             "GDC 2019", 1),
    ("SonnissGameAudioGDCPart6",                         "GDC 2020", 1),
    ("gdc-2023-game-audio-bundle",                       "GDC 2023", 1),
    ("sonniss-gdc-2024-game-audio-bundle-normalized",    "GDC 2024", 1),
    ("sonniss-gdc-2026-game-audio-bundle-normalized",    "GDC 2026", 1),
    # espelhos (mesmo conteudo, outro item): servem de reserva se o principal falhar
    ("sonniss-gdc-2015-game-audio-bundle-normalized",    "GDC 2015", 2),
    ("sonniss-gdc-2016-game-audio-bundle-normalized",    "GDC 2016", 2),
    ("game-audio-gdcpart-2",                             "GDC 2016", 2),
    ("sonniss-gdc-2017-game-audio-bundle-normalized",    "GDC 2017", 2),
    ("SonnissGameAudioGDCPart3",                         "GDC 2017", 2),
    ("sonniss-gdc-2018-game-audio-bundle-normalized",    "GDC 2018", 2),
    ("SonnissGameAudioGDCPart4",                         "GDC 2018", 2),
    ("sonniss-gdc-2019-game-audio-bundle-normalized",    "GDC 2019", 2),
    ("GameAudioGDCPart5",                                "GDC 2019", 2),
    ("game-audio-gdcpart-6",                             "GDC 2020", 2),
    ("sonniss-gdc-2020-game-audio-bundle-normalized",    "GDC 2020", 2),
    ("game-audio-gdcpart-7",                             "GDC 2023", 2),
    ("sonniss-gdc-2023-game-audio-bundle-normalized",    "GDC 2023", 2),
    ("SonnissGameAudioGDC",                              "GDC 2015", 2),
]
AUDIO = (".wav", ".flac", ".aif", ".aiff")
UA = "creatMTT-sfx-indice/1.0 (uso interno; 1 pedido por vez)"


def baixar_meta(pasta):
    os.makedirs(pasta, exist_ok=True)
    for item, _, _ in ITENS:
        dest = os.path.join(pasta, item + ".json")
        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
            continue
        espera = 10
        for tent in range(5):
            try:
                req = urllib.request.Request("https://archive.org/metadata/" + item, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=120) as r:
                    open(dest, "wb").write(r.read())
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 503) and tent < 4:
                    print(item, e.code, "recuando", espera, "s"); time.sleep(espera); espera *= 2
                else:
                    sys.exit("bloqueado/erro %s em %s: parando (nao troco de rota)" % (e.code, item))
        time.sleep(1.5)


# ---------- categorias (pt) inferidas do nome ----------
def R(p):
    return re.compile(p, re.I)

CAT = [
    # agua
    ("agua", R(r"\b(water|waters|stream|brook|creek|river|rivulet|waterfall|cascade|splash\w*|drip\w*|pond|puddle|fountain|bubbl\w+|rapids|flowing|babbling|trickl\w+|lake|cistern|gurgl\w+|plop\w*)\b")),
    ("rio", R(r"\b(river|stream|brook|creek|rivulet|rapids|babbling|flowing water|trickl\w+|running water)\b")),
    ("cachoeira", R(r"\b(waterfall|waterfalls|cascade|falls)\b")),
    ("respingo", R(r"\b(splash\w*|drip\w*|plop\w*|droplet\w*|water drops?)\b")),
    ("mar_ondas", R(r"\b(ocean|sea|surf|shore|beach|waves?|seaside|coast\w*|harbou?r)\b")),
    ("chuva", R(r"\b(rain|raining|rainfall|drizzle|downpour|shower)\b")),
    ("trovao", R(r"\b(thunder\w*|lightning)\b")),
    # passos
    ("passos", R(r"\b(foot ?steps?|steps|footfalls?|walking|walks?|running|runs?|jog\w*|boots?|shoes?|sneakers?|barefoot|sandals?|heels?|stomp\w*|tread\w*|trudg\w*|marching)\b")),
    ("passos_terra", R(r"\b(dirt|soil|earth|ground|trail|path|footpath|dusty|dust)\b")),
    ("passos_folhas", R(r"\b(leaves|leaf|foliage|autumn|crunchy|dry leaves|forest floor)\b")),
    ("passos_cascalho", R(r"\b(gravel|pebbles?|rocks?|stones?|rocky|crushed)\b")),
    ("passos_mato", R(r"\b(grass|brush|bush\w*|undergrowth|weeds?|vegetation|meadow|field|reeds?|ferns?)\b")),
    ("passos_lama", R(r"\b(mud|muddy|swamp|marsh|bog|wet ground)\b")),
    ("passos_areia", R(r"\b(sand|sandy|dune\w*)\b")),
    ("passos_neve", R(r"\b(snow|ice|icy|frost\w*)\b")),
    # vegetacao / vento
    ("folhas", R(r"\b(leaves|leaf|foliage|rustl\w+|undergrowth|shrub|fern|ferns|bushes|bush|vegetation|canopy)\b")),
    ("galhos", R(r"\b(branch\w*|twigs?|sticks?|log|logs|snap\w*|crack\w*|wood chips?|timber)\b")),
    ("mato_capim", R(r"\b(grass|grasses|reeds?|brush|weeds?|meadow|field|savann?ah|cornfield|wheat|crops?)\b")),
    ("vento", R(r"\b(wind|winds|windy|breeze|gust\w*|gale|blizzard|draft|howling)\b")),
    ("vento_arvores", R(r"\b(tree|trees|forest|woods|woodland|canopy|pine|eucalyptus|leaves|branches|jungle)\b")),
    # animais / ambientes
    ("passaros", R(r"\b(birds?|birdsong|bird song|chirp\w*|tweet\w*|robin|sparrow\w*|owls?|crows?|ravens?|parrots?|toucan|doves?|pigeons?|songbirds?|cuckoo|woodpecker|finch\w*|thrush|blackbird|seagulls?|gulls?|nightingale|rooster|cockerel|hen|hawk|eagle|dawn chorus)\b")),
    ("insetos", R(r"\b(insects?|crickets?|cicadas?|grasshoppers?|bugs?|bees?|wasps?|mosquito\w*|flies|fly buzz|beetles?|locusts?|katydids?|buzzing|cigarra|grilo)\b")),
    ("sapos", R(r"\b(frogs?|toads?|croak\w*|amphibians?)\b")),
    ("animais", R(r"\b(dogs?|cats?|horses?|cows?|cattle|sheep|goats?|pigs?|monkeys?|animals?|wolf|wolves|lion|bear|deer|elephant|livestock|donkey|duck|geese|goose)\b")),
    ("floresta_ambiente", R(r"\b(forest|woods|woodland|jungle|rainforest|nature|natural|countryside|wilderness|meadow|farm|rural|park|garden|outdoors?|savann?ah|swamp|tropical|campsite|camping|mountains?|valley|hills?|lake)\b")),
    ("noite", R(r"\b(night|nighttime|evening|dusk|midnight|nocturnal|crickets?|owls?)\b")),
    ("manha_dia", R(r"\b(morning|dawn|daytime|day time|sunrise|day)\b")),
    ("ambiente", R(r"\b(ambi\w*|amb|atmos\w*|soundscape|room tone|roomtone|background)\b")),
    ("fogo", R(r"\b(fire|fires|flame\w*|burn\w*|torch|campfire|bonfire|crackl\w*|embers?|fireplace|blaze)\b")),
    # carro
    ("carro", R(r"\b(cars?|vehicles?|veh\w*|porsche|citroen|qashqai|renault|fiat|honda|hyundai|kia|volvo|subaru|mazda|opel|peugeot|skoda|jaguar|tesla|lexus|trucks?|suv|sedan|hatchback|van|pick ?up|jeep|auto|automobile|coupe|minivan|taxi|bus|buses|limo|mustang|audi|bmw|toyota|nissan|ford|land rover|defender|cadillac|mercedes|volkswagen)\b")),
    ("carro_porta", R(r"\b(car|vehicle|truck|suv|sedan|auto|jeep|van|taxi|cadillac|audi|bmw|toyota|nissan|ford|land rover|defender|mustang)\b.*\b(doors?)\b|\b(doors?)\b.*\b(car|vehicle|truck|suv|sedan|jeep|van|taxi|cadillac|audi|bmw|toyota|nissan|ford|land rover|defender|mustang)\b")),
    ("carro_porta_malas", R(r"\b(trunk|boot lid|tailgate|liftgate|lift gate|hatchback|hatch|rear door|rear gate|rear hatch|boot)\b")),
    ("carro_motor", R(r"\b(engine\w*|motor\w*|idle|idling|revs?|revving|ignition|start ?up|starts?|diesel|v8|v6|exhaust|accelerat\w*|decelerat\w*|throttle)\b")),
    ("carro_interior", R(r"\b(interior|int|inside|cabin|cockpit|in-?car|passenger|dashboard|steering|seat ?belts?|from inside|driver)\b")),
    ("cinto", R(r"\b(seat ?belts?|safety belt|buckle\w*|belt)\b")),
    ("pneu", R(r"\b(tires?|tyres?|skid\w*|wheels?|burnout|drift\w*|squeal\w*)\b")),
    ("estrada_terra", R(r"\b(gravel|dirt road|dirt|offroad|off-road|unpaved|rally|dust|mud)\b")),
    ("carro_passando", R(r"\b(pass ?by|passby|passing|drive ?by|driveby|fly ?by|flyby|approach\w*|fast|speed)\b")),
    ("carro_buzina_alarme", R(r"\b(horn|honk\w*|alarm|beeps?|remote|key ?fob|lock|unlock|locking|central lock)\b")),
    ("moto", R(r"\b(motorcycles?|motorbikes?|scooters?|moped|bikes?|yamaha|harley|rajdoot|ducati)\b")),
    # portas e objetos
    ("porta", R(r"\b(doors?|latch\w*|knobs?|handles?|hinge|creak\w*|slam\w*|deadbolt|keys?|locks?|gate)\b")),
    ("porta_vidro", R(r"\b(glass door|sliding door|slider|slide door|patio|shop door|storefront|sliding|window|glass)\b")),
    ("vidro", R(r"\b(glass|window|bottle|shatter\w*|jar)\b")),
    ("madeira", R(r"\b(wood|wooden|plank|timber|log|logs|crate|chest)\b")),
    ("metal", R(r"\b(metal\w*|iron|steel|chain\w*|clang\w*|anvil|rust\w*|scrap)\b")),
    ("tecido", R(r"\b(cloth\w*|fabric\w*|garments?|jackets?|leather|cotton|linen|shirts?|t-?shirt|sleeve|zipper|zip|velcro|textile|denim|coat|sheet|blanket|rustle)\b")),
    # transicoes
    ("whoosh", R(r"\b(whoosh\w*|woosh\w*|swoosh\w*|swish\w*|swipe\w*|swing\w*|whip\w*|flyby|fly ?by|pass ?by|passby|zip|sweep\w*|air movement|woof)\b")),
    ("impacto", R(r"\b(impacts?|hits?|thuds?|booms?|slams?|punch\w*|crash\w*|bang\w*|smash\w*|thump\w*|blows?|drop\w*|stinger|cinematic hit|sub drop|low hit|deep hit|braam)\b")),
    ("riser", R(r"\b(risers?|rises?|rising|build ?ups?|build|uplifters?|tension|swell\w*|crescendo|accelerat\w*|ascend\w*|whoosh rise|riser)\b")),
    ("transicao", R(r"\b(transitions?|transit|sweep\w*|reverse\w*|rewind|swell\w*|stinger|hit and tail|reveal|logo|intro|outro|cinematic|trailer|trailer hit)\b")),
    ("explosao", R(r"\b(explosions?|explod\w*|blasts?|detonat\w*|bomb|boom)\b")),
    ("arma", R(r"\b(guns?|gunshots?|rifles?|pistols?|shotgun|weapons?|firearms?|bullets?|machine ?gun|sword|blade|swords)\b")),
    ("ui_interface", R(r"\b(ui|interface|button\w*|click\w*|menu|beeps?|notification|pop\w*|toggle|switch\w*|hud|ping)\b")),
    ("musica", R(r"\b(music|musical|song|melody|chord\w*|theme|piano|guitar|drums?|orchestra\w*|choir|synth\w*|stinger|cue)\b")),
    ("multidao", R(r"\b(crowds?|people|audience|stadium|walla|gathering|market|bar|restaurant|cafe|festival|party|applause|cheer\w*|chatter|mob|protest|queue)\b")),
    ("cidade", R(r"\b(city|urban|street\w*|traffic|town|downtown|metro|subway|train|tram|station|plaza|avenue|roads?|sidewalk|highway|intersection|siren|industrial)\b")),
    ("interior_casa", R(r"\b(house|home|kitchen|bathroom|bedroom|apartment|office|room|household|domestic|appliance\w*|fridge|microwave|clock)\b")),
    ("voz", R(r"\b(voices?|vocals?|speech|speak\w*|talk\w*|dialogue|dialog|conversation\w*|whisper\w*|scream\w*|shout\w*|yell\w*|laugh\w*|cry\w*|cough\w*|sneez\w*|breath\w*|grunt\w*|moan\w*|singing|singer|sings?|kids?|child\w*|man|woman|male|female|monologue|narrat\w*|announcer|walla|crowd|people|chant\w*|choir|human|exertion|efforts?|pain|death)\b")),
    ("sci_fi_design", R(r"\b(sci-?fi|futuristic|alien|robot\w*|designed|magic\w*|spell\w*|laser|energy|portal|cyber\w*|mech|synth\w*|drone|abstract|glitch)\b")),
]
CAT_ORDER = [c for c, _ in CAT] + ["vento_capim"]

txt_atual = [""]
NEG_VEIC = R(r"\b(tanks?|tankietka|cromwell|centurion|tiger ii|panzer|bomber|blenheim|yacht|boats?|ships?|aircraft|helicopter|submarine|locomotive|howitzer|artillery|tracked)\b")

# categorias compostas (precisam de duas condicoes)
def derivar(cats):
    s = set(cats)
    out = set(cats)
    if "passos" not in s:
        for k in ("passos_terra", "passos_folhas", "passos_cascalho", "passos_mato", "passos_lama", "passos_areia", "passos_neve"):
            out.discard(k)
    else:
        if not (s & {"passos_terra", "passos_folhas", "passos_cascalho", "passos_mato", "passos_lama", "passos_areia", "passos_neve"}):
            pass
    if "carro" not in s:
        for k in ("carro_porta", "carro_porta_malas", "carro_motor", "carro_interior", "pneu", "estrada_terra", "carro_passando", "carro_buzina_alarme", "cinto"):
            out.discard(k)
    if NEG_VEIC.search(txt_atual[0]):
        out -= {"carro", "carro_porta", "carro_porta_malas", "carro_motor", "carro_interior", "pneu", "estrada_terra",
                "carro_passando", "carro_buzina_alarme", "cinto"}
    if "vento_arvores" in out and "vento" not in s:
        out.discard("vento_arvores")
    if "carro_porta" in out and "porta" not in out:
        out.add("porta")
    if "mato_capim" in out and "vento" in s:
        out.add("vento_capim")
    return out

# palavras para marcar risco de voz humana
RX_VOZ = R(r"\b(voices?|vocals?|speech|speak\w*|talk\w*|dialogue|dialog|conversation\w*|whisper\w*|scream\w*|shout\w*|yell\w*|laugh\w*|cry\w*|walla|crowds?|people|kids?|child\w*|chatter|announcer|narrat\w*|chant\w*|choir|singer|singing|human|monologue|market|restaurant|cafe|festival|party|audience|stadium|bar)\b")
RX_CANAIS = [
    (R(r"5\.1|7\.1|surround|lcrls"), "surround"),
    (R(r"ambisonic|\bb[- ]?format|wxyz|\bfoa\b"), "ambisonico"),
    (R(r"\b(ms|mid[- ]?side|ortf|xy|ab|stereo|lr|binaural|nos)\b"), "estereo"),
    (R(r"\bmono\b|\bm\b"), "mono"),
]


def texto_limpo(s):
    s = re.sub(r"\.(wav|flac|aiff?)$", "", s, flags=re.I)
    s = re.sub(r"[_\-/\\,;:()\[\]{}#+&.]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def categorizar(lib, stem):
    txt = texto_limpo(lib + " " + stem)
    txt_atual[0] = txt
    achou = [c for c, rx in CAT if rx.search(txt)]
    # ruido: palavras genericas muito amplas so contam se aparecerem no NOME (nao so na biblioteca)
    nome = texto_limpo(stem)
    amplas = {"ambiente", "multidao", "voz", "musica", "ui_interface", "cidade", "interior_casa", "sci_fi_design",
              "impacto", "transicao", "riser", "carro_passando", "manha_dia", "noite", "floresta_ambiente",
              "porta_vidro", "vidro", "madeira", "metal"}
    final = []
    for c in achou:
        rx = dict(CAT)[c]
        if c in amplas and not rx.search(nome):
            continue
        final.append(c)
    final = derivar(final)
    ordem = sorted(final, key=CAT_ORDER.index)
    return ordem, bool(RX_VOZ.search(nome)) or ("voz" in ordem)


def canal(txt):
    for rx, nome in RX_CANAIS:
        if rx.search(txt):
            return nome
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--baixar-meta", action="store_true")
    a = ap.parse_args()
    if a.baixar_meta:
        baixar_meta(a.meta)
    os.makedirs(a.saida, exist_ok=True)

    linhas = []
    vistos = {}
    for item, pacote, prio in sorted(ITENS, key=lambda t: t[2]):
        f = os.path.join(a.meta, item + ".json")
        if not os.path.exists(f):
            print("sem metadados:", item); continue
        d = json.load(open(f))
        grupos = {}
        for x in d.get("files", []):
            nome = x["name"]
            if not nome.lower().endswith(AUDIO):
                continue
            base, ext = nome.rsplit(".", 1)
            g = grupos.setdefault(base, {})
            g[ext.lower()] = x
        for base, g in grupos.items():
            partes = base.split("/")
            stem = partes[-1]
            lib = partes[-2] if len(partes) > 1 else ""
            pasta_raiz = "/".join(partes[:-1])
            wav = g.get("wav") or g.get("aif") or g.get("aiff")
            fl = g.get("flac")
            ref = wav or fl
            dur = None
            for v in (wav, fl):
                if v and v.get("length"):
                    try:
                        dur = float(v["length"]); break
                    except ValueError:
                        pass
            ch_txt = texto_limpo(stem)
            cats, voz = categorizar(lib, stem)
            chave = (re.sub(r"[^a-z0-9]", "", lib.lower()), re.sub(r"[^a-z0-9]", "", re.sub(r"\.(wav|flac|aiff?)$", "", stem.lower())))
            principal = 0
            if chave not in vistos:
                vistos[chave] = True
                principal = 1
            def url(x, ext):
                if not x:
                    return ""
                return "https://archive.org/download/%s/%s" % (item, urllib.parse.quote(x["name"]))
            linhas.append({
                "id": 0, "item": item, "pacote": pacote, "principal": principal,
                "biblioteca": lib, "nome": stem, "caminho": ref["name"],
                "caminho_wav": wav["name"] if wav else "", "caminho_flac": fl["name"] if fl else "",
                "tam_wav": int(wav["size"]) if wav and wav.get("size") else 0,
                "tam_flac": int(fl["size"]) if fl and fl.get("size") else 0,
                "dur_s": dur, "canais": canal(ch_txt),
                "url_wav": url(wav, "wav"), "url_flac": url(fl, "flac"),
                "categorias": cats, "risco_voz": voz,
                "md5_wav": wav.get("md5", "") if wav else "", "md5_flac": fl.get("md5", "") if fl else "",
            })
    def _k(r):
        return (re.sub(r"[^a-z0-9]", "", r["biblioteca"].lower()), re.sub(r"[^a-z0-9]", "", re.sub(r"\.(wav|flac|aiff?)$", "", r["nome"].lower())))
    # espelho com FLAC: se o item principal so tem WAV, herda o FLAC de um espelho identico
    flac_espelho = {}
    for r in linhas:
        if r["url_flac"]:
            flac_espelho.setdefault(_k(r), r)
    for r in linhas:
        r["item_flac"] = r["item"] if r["url_flac"] else ""
        if not r["url_flac"]:
            e = flac_espelho.get(_k(r))
            if e:
                r["url_flac"], r["tam_flac"], r["caminho_flac"], r["md5_flac"], r["item_flac"] = (
                    e["url_flac"], e["tam_flac"], e["caminho_flac"], e["md5_flac"], e["item"])
    for i, r in enumerate(linhas, 1):
        r["id"] = i

    # jsonl.gz
    with gzip.open(os.path.join(a.saida, "indice.jsonl.gz"), "wt", encoding="utf-8", compresslevel=9) as fh:
        for r in linhas:
            fh.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n")

    # sqlite
    db = os.path.join(a.saida, "indice.sqlite")
    if os.path.exists(db):
        os.remove(db)
    con = sqlite3.connect(db)
    c = con.cursor()
    c.execute("""CREATE TABLE sons(id INTEGER PRIMARY KEY, item TEXT, pacote TEXT, principal INTEGER, biblioteca TEXT,
        nome TEXT, caminho TEXT, caminho_wav TEXT, caminho_flac TEXT, tam_wav INTEGER, tam_flac INTEGER, dur_s REAL,
        canais TEXT, item_flac TEXT, url_wav TEXT, url_flac TEXT, categorias TEXT, risco_voz INTEGER, md5_wav TEXT, md5_flac TEXT)""")
    c.executemany("INSERT INTO sons VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
        (r["id"], r["item"], r["pacote"], r["principal"], r["biblioteca"], r["nome"], r["caminho"], r["caminho_wav"],
         r["caminho_flac"], r["tam_wav"], r["tam_flac"], r["dur_s"], r["canais"], r["item_flac"], r["url_wav"], r["url_flac"],
         " ".join(r["categorias"]), int(r["risco_voz"]), r["md5_wav"], r["md5_flac"]) for r in linhas])
    fts = True
    try:
        c.execute("CREATE VIRTUAL TABLE busca USING fts5(nome, biblioteca, categorias, pacote, tokenize='unicode61 remove_diacritics 2')")
        c.executemany("INSERT INTO busca(rowid,nome,biblioteca,categorias,pacote) VALUES(?,?,?,?,?)",
                      [(r["id"], texto_limpo(r["nome"]), texto_limpo(r["biblioteca"]), " ".join(r["categorias"]), r["pacote"]) for r in linhas])
    except sqlite3.OperationalError as e:
        fts = False
        print("FTS5 indisponivel:", e)
    c.execute("CREATE INDEX i_item ON sons(item)")
    c.execute("CREATE INDEX i_prin ON sons(principal)")
    c.execute("CREATE TABLE meta(chave TEXT PRIMARY KEY, valor TEXT)")
    c.execute("INSERT INTO meta VALUES('fts5',?)", (str(int(fts)),))
    c.execute("INSERT INTO meta VALUES('gerado_em',?)", (time.strftime("%Y-%m-%d"),))
    con.commit(); con.close()
    print("linhas:", len(linhas), "principais:", sum(r["principal"] for r in linhas), "fts5:", fts)


if __name__ == "__main__":
    main()
