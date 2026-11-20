"""Item 4 (20/11), defeito apontado pelo dono no vídeo da cerveja: o Ruan DITA a frase, a Lavínia repete, e o filme saiu com a
voz dele. Áudio sintético (homem ~140 Hz ditando, mulher ~255 Hz repetindo) e assinatura de voz falsa por altura da voz
(sem baixar modelo): o catálogo separa as duas vozes, marca o ditado e o resolvedor usa a repetição dela."""
import numpy as np
import pytest

import validar
from b_sintetico import TRILHAS, direcao

FRASE = "vem comigo que eu vou te mostrar a cerveja certa"


class AssinadorPorTom:
    """Vozes diferentes = vetores diferentes, decididos pela altura da voz (homem x mulher)."""
    disponivel = True

    def __init__(self, *_a, **_k):
        pass

    def assinar(self, x, sr, minimo=0.8):
        from motor.etapas.falante import tom_hz
        if len(x) < minimo * sr:
            return None
        t = tom_hz(x, sr)
        if not t:
            return None
        return np.array([1.0, 0.0, 0.0] if t > 190 else [0.0, 1.0, 0.0], np.float32)


def _voz(dur, f0, amp=0.3, sr=16000):
    t = np.arange(int(dur * sr)) / sr
    fase = 2 * np.pi * np.cumsum(f0 * (1 + 0.01 * np.sin(2 * np.pi * 5 * t))) / sr
    x = sum(np.sin(k * fase) / k for k in range(1, int(3500 // f0) + 1))
    return (amp * x / (np.abs(x).max() + 1e-9) * (0.6 + 0.4 * np.abs(np.sin(np.pi * t / 0.18)))).astype(np.float32)


def _palavras(texto, s0, passo=0.3):
    out, t = [], s0
    for w in texto.split():
        out.append([round(t, 2), round(t + passo - 0.04, 2), w, 0.9])
        t += passo
    return out


def _cenario():
    """0,5-3,5 s: ela fala (abertura); 5,0-8,0 s: ELE dita; 8,6-11,6 s: ela repete; tudo isso num segmento só da transcrição
    (o Whisper juntou ditado e repetição), como no material real."""
    sr = 16000
    x = (0.0005 * np.random.default_rng(3).standard_normal(13 * sr)).astype(np.float32)   # pausa de 0,6 s entre ditado e repetição
    abertura = "oi gente hoje eu vim no super kal mostrar"
    for s0, texto, f0 in ((0.5, abertura, 255), (5.0, FRASE, 140), (8.6, FRASE, 258)):
        v = _voz(len(texto.split()) * 0.3, f0)
        i = int(s0 * sr)
        x[i:i + len(v)] += v
    p1 = _palavras(abertura, 0.5)
    p2 = _palavras(FRASE, 5.0) + _palavras(FRASE, 8.6)
    segs = [{"s": p1[0][0], "e": p1[-1][1], "texto": abertura, "falante": None, "conf": 0.9, "palavras": p1},
            {"s": p2[0][0], "e": p2[-1][1], "texto": FRASE + " " + FRASE, "falante": None, "conf": 0.9, "palavras": p2}]
    from b_sintetico import analise
    a = analise(dur=13.0, falante=None)
    a["transcricao"]["segmentos"] = segs
    a["visao"]["momentos"] = []
    return a, x


def test_dividir_e_semelhanca():
    from motor.etapas.vozes import dividir, semelhanca
    seg = {"s": 0, "e": 3, "texto": "a b c d", "falante": None, "palavras": [[0, .2, "a", .9], [.25, .4, "b", .9], [1.0, 1.2, "c", .9], [1.25, 1.4, "d", .9]]}
    p = dividir(seg)
    assert [x["texto"] for x in p] == ["a b", "c d"] and p[1]["s"] == 1.0
    assert semelhanca("vem comigo que eu vou", "Vem comigo, que eu vou!") == 1.0
    assert semelhanca("vem comigo que eu vou", "obrigada pela visita") == 0.0


def test_rotular_separa_o_ditado_da_repeticao():
    from motor.etapas import vozes
    a, x = _cenario()
    novas = vozes.rotular([a], lambda _a: (x, 0.0), assinador=AssinadorPorTom())
    segs = novas[0]["transcricao"]["segmentos"]
    assert [s["voz"] for s in segs] == ["A", "B", "A"]                        # ela, ele, ela
    assert segs[1]["ditado"] == {"s": segs[2]["s"], "arquivo": "a001"} and "ditado" not in segs[2]
    assert a["transcricao"]["segmentos"][1]["texto"].count("vem") == 2        # a análise original não foi mexida


def test_sem_modelo_nada_muda():
    from motor.etapas import vozes

    class Sem:
        disponivel = False
    a, x = _cenario()
    assert vozes.rotular([a], lambda _a: (x, 0.0), assinador=Sem()) == [a]


@pytest.fixture()
def cat_e_analise(dados, tmp_path, monkeypatch):
    import soundfile as sf
    from motor import config
    from motor.etapas import catalogo, falante
    monkeypatch.setattr(falante, "Assinador", AssinadorPorTom)
    a, x = _cenario()
    wav = tmp_path / "fonte.wav"
    sf.write(wav, x, 16000)

    class Arm:
        def caminho_local(self, _chave):
            return wav
    cat, txt = catalogo.montar([a], {"texto": "reel da cerveja"}, "p_t", armazenamento=Arm(), cfg=config.carregar())
    return cat, txt, a


def test_catalogo_mostra_o_ditado(cat_e_analise):
    cat, txt, _ = cat_e_analise
    falas = cat["clipes"][0]["falas"]
    assert [f["voz"] for f in falas] == ["A", "B", "A"]
    assert falas[1]["ditado"] == falas[2]["id"] and "ditado" not in falas[2]
    assert f"vozB DITADO→{falas[2]['id']}" in txt and "use F.., nunca o ditado" in txt
    assert validar.erros("catalogo", cat) == []


def test_resolvedor_troca_o_ditado_pela_repeticao(cat_e_analise):
    from motor.etapas import resolvedor
    from motor.memoria.loja import Loja
    cat, _, a = cat_e_analise
    falas = cat["clipes"][0]["falas"]
    d = direcao()
    d["gancho"]["troca"] = None
    d["blocos"] = [{"id": "B1", "funcao": "gancho", "intensidade": 4, "cobertura": [], "texto_tela": [], "chips": [], "saida": "corte_batida",
                    "falas": [{"id": falas[1]["id"], "de": "vem comigo", "ate": "cerveja certa", "corrigir": None, "imagem": "falante"}]}]
    d["trilha"]["drop_em"] = "B1"
    loja = Loja()
    r = resolvedor.Resolvedor(d, cat, {a["arquivo"]["id"]: a}, loja.modelo("evento-reel"), TRILHAS, vocabulario=loja.vocabulario())
    edl = r.resolver()
    s0s = [v["s0"] for v in edl["voz"]]
    assert s0s and min(s0s) >= 8.4                                             # a voz dela (8,6 s), nunca o ditado dele (5,0 s)
    assert any("ditado da equipe" in m for m in r.avisos)


def test_resolvedor_usa_a_repeticao_inteira_quando_as_palavras_nao_batem(cat_e_analise):
    """Plano B (revisão do Crivo): o diretor pediu um trecho do ditado com palavras que a repetição não tem; a repetição entra
    inteira, com aviso, e o filme NÃO falha."""
    from motor.etapas import resolvedor
    from motor.memoria.loja import Loja
    cat, _, a = cat_e_analise
    falas = cat["clipes"][0]["falas"]
    d = direcao()
    d["gancho"]["troca"] = None
    d["blocos"] = [{"id": "B1", "funcao": "gancho", "intensidade": 4, "cobertura": [], "texto_tela": [], "saida": "corte_batida",
                    "chips": [{"nome": "LAVINIA", "funcao": "nutricionista", "sobre": falas[2]["id"]}],
                    "falas": [{"id": falas[1]["id"], "de": "palavras que ninguem disse", "ate": None, "corrigir": None, "imagem": "falante"}]}]
    d["trilha"]["drop_em"] = "B1"
    loja = Loja()
    r = resolvedor.Resolvedor(d, cat, {a["arquivo"]["id"]: a}, loja.modelo("evento-reel"), TRILHAS, vocabulario=loja.vocabulario())
    edl = r.resolver()                                                         # não levanta ErroResolucao
    assert min(v["s0"] for v in edl["voz"]) >= 8.4
    assert any("entrou inteira" in m for m in r.avisos)
    assert any(m["id"].startswith("chip_") for m in edl["motion"])


def test_repeticao_colada_sem_pausa_e_apresentadora_falando_menos(monkeypatch):
    """Riscos do material real (Crivo): ditado e repetição sem pausa entre si, no mesmo pedaço; e a equipe falando MAIS que a
    apresentadora no projeto. Ainda assim: o ditado é marcado e a voz principal (A) é quem repete."""
    from motor.etapas import vozes
    sr = 16000
    frase = "olha que promocao boa de cerveja hoje"
    x = (0.0005 * np.random.default_rng(4).standard_normal(20 * sr)).astype(np.float32)
    longa = "bom dia pessoal a gente vai gravar agora o video da cerveja e depois o da fruta tudo certo"
    for s0, texto, f0 in ((0.3, longa, 140), (6.0, frase, 140), (8.1, frase, 255)):    # ele fala muito; ela só repete
        v = _voz(len(texto.split()) * 0.3, f0)
        i = int(s0 * sr)
        x[i:i + len(v)] += v
    p0 = _palavras(longa, 0.3)
    p1 = _palavras(frase, 6.0) + _palavras(frase, 8.1)                         # 0,14 s entre o fim do ditado e a repetição
    segs = [{"s": p0[0][0], "e": p0[-1][1], "texto": longa, "falante": None, "conf": 0.9, "palavras": p0},
            {"s": p1[0][0], "e": p1[-1][1], "texto": frase + " " + frase, "falante": None, "conf": 0.9, "palavras": p1}]
    from b_sintetico import analise
    a = analise(dur=20.0, falante=None)
    a["transcricao"]["segmentos"] = segs
    novas = vozes.rotular([a], lambda _a: (x, 0.0), assinador=AssinadorPorTom())
    s = novas[0]["transcricao"]["segmentos"]
    assert len(s) == 3                                                         # a repetição colada foi cortada no meio
    assert [p["voz"] for p in s] == ["B", "B", "A"]                            # A = quem repete (ela), mesmo falando menos
    assert s[1]["ditado"]["s"] == s[2]["s"]


def test_agrupar_linear():
    import time
    from motor.etapas.vozes import agrupar
    rng = np.random.default_rng(0)
    base = [np.eye(8)[0], np.eye(8)[1]]
    assin = [(base[i % 2] + 0.05 * rng.standard_normal(8)) for i in range(2000)]
    assin = [v / np.linalg.norm(v) for v in assin]
    t = time.time()
    g = agrupar(assin, [1.0] * 2000)
    assert time.time() - t < 3.0 and len(set(g)) == 2                          # 2000 pedaços em segundos, 2 vozes


def test_ditado_com_repeticao_no_take_seguinte_e_rotulos_A_B(dados, tmp_path, monkeypatch):
    """Dado real (cerveja, 20/11): o Ruan dita no take c1220 ("Agora vem comigo que eu vou te mostrar as menos calorias aqui do
    Super") e a Lavínia regrava no take SEGUINTE com outras palavras ("Vem comigo que hoje irei te mostrar as que tem menos
    calorias"). A equipe aparece com vozes diferentes (outro grupo) e falas curtas ("Valeu!"): tudo vira B."""
    import soundfile as sf
    from b_sintetico import analise
    from motor import config
    from motor.etapas import catalogo, falante
    monkeypatch.setattr(falante, "Assinador", AssinadorPorTom)
    sr = 16000
    dit = "agora vem comigo que eu vou te mostrar as menos calorias aqui do super"
    rep = "vem comigo que hoje irei te mostrar as que tem menos calorias"
    abertura = "quer tomar uma cerveja e nao quer sair da dieta entao presta atencao"

    def take(aid, nome, trechos, dur):
        x = (0.0005 * np.random.default_rng(len(aid)).standard_normal(int(dur * sr))).astype(np.float32)
        segs = []
        for s0, texto, f0 in trechos:
            v = _voz(len(texto.split()) * 0.3, f0)
            x[int(s0 * sr):int(s0 * sr) + len(v)] += v
            p = _palavras(texto, s0)
            segs.append({"s": p[0][0], "e": p[-1][1], "texto": texto, "falante": None, "conf": 0.9, "palavras": p})
        a = analise(aid=aid, nome=nome, dur=dur, falante=None)
        a["transcricao"]["segmentos"] = segs
        a["visao"]["momentos"] = []
        a["arquivo"]["chave"] = f"entrada/p_t/{aid}.wav"
        a["arquivo"]["gravado_em"] = f"2026-11-18T10:0{int(aid[-1])}:00-03:00"
        sf.write(tmp_path / f"{aid}.wav", x, sr)
        return a
    a1 = take("a001", "c1220.mov", [(0.3, abertura, 255), (5.0, dit, 140), (10.0, "valeu", 140)], 12.0)
    a2 = take("a002", "c1222.mov", [(3.6, rep, 258)], 9.0)

    class Arm:
        def caminho_local(self, chave):
            return tmp_path / chave.rsplit("/", 1)[1]
    cat, txt = catalogo.montar([a1, a2], {"texto": "cerveja"}, "p_t", armazenamento=Arm(), cfg=config.carregar())
    f1, f2 = cat["clipes"][0]["falas"], cat["clipes"][1]["falas"]
    ditado = next(f for f in f1 if "agora vem comigo" in f["texto"])
    assert ditado["voz"] == "B" and ditado["ditado"] == f2[0]["id"] and f2[0]["voz"] == "A"
    assert {f.get("voz") for f in f1 + f2} <= {"A", "B"}                     # sem C, D...: A ou "outra pessoa"
    valeu = next(f for f in f1 if f["texto"] == "valeu")
    assert valeu["voz"] == "B"                                                 # curto demais para assinatura: a altura diz
    assert f"DITADO→{f2[0]['id']}" in txt and validar.erros("catalogo", cat) == []


def test_casa_ditado():
    from motor.etapas.vozes import casa_ditado
    assert casa_ditado("Agora vem comigo que eu vou te mostrar as menos calorias aqui do Super",
                       "Vem comigo que hoje irei te mostrar as que tem menos calorias")
    assert not casa_ditado("vem comigo", "vem comigo")                        # curto demais: não é ditado
    assert not casa_ditado("pode cortar aí pessoal", "hoje eu vim mostrar a cerveja")
    assert not casa_ditado("pode ir que eu vou", "hoje eu vou te mostrar que essa cerveja tem menos calorias")   # só palavras de função
    assert not casa_ditado("vem comigo que", "agora vem comigo que eu vou te mostrar as menos calorias aqui")   # 3 palavras não bastam
    assert not casa_ditado("olha a cerveja aqui", "olha so que coisa linda essa gondola toda de frutas frescas hoje aqui")


def test_tres_vozes_viram_A_e_B_e_exclamacao_dela_continua_dela():
    """Três vozes (ela 255 Hz, Ruan 140, Xande 110) -> só A e B. Uma exclamação curta DELA, mais aguda (300 Hz, +18%), não vira B."""
    from b_sintetico import analise
    from motor.etapas import vozes

    class TresVozes(AssinadorPorTom):
        def assinar(self, x, sr, minimo=0.8):
            from motor.etapas.falante import tom_hz
            if len(x) < minimo * sr:
                return None
            tm = tom_hz(x, sr) or 0
            return np.array([1.0, 0, 0] if tm > 190 else ([0, 1.0, 0] if tm > 125 else [0, 0, 1.0]), np.float32)
    sr = 16000
    x = (0.0005 * np.random.default_rng(9).standard_normal(16 * sr)).astype(np.float32)
    falas = [(0.3, "oi gente hoje eu vim no super kal", 255), (4.0, "pode ir quando quiser", 140),
             (6.5, "mais uma vez do comeco", 110), (9.5, "nossa", 300), (11.0, "olha que lindo esse corredor", 255)]
    segs = []
    for s0, texto, f0 in falas:
        v = _voz(len(texto.split()) * 0.3, f0)
        x[int(s0 * sr):int(s0 * sr) + len(v)] += v
        p = _palavras(texto, s0)
        segs.append({"s": p[0][0], "e": p[-1][1], "texto": texto, "falante": None, "conf": 0.9, "palavras": p})
    a = analise(dur=16.0, falante=None)
    a["transcricao"]["segmentos"] = segs
    r = {s["texto"]: s.get("voz") for s in vozes.rotular([a], lambda _a: (x, 0.0), assinador=TresVozes())[0]["transcricao"]["segmentos"]}
    assert r["oi gente hoje eu vim no super kal"] == "A" and r["olha que lindo esse corredor"] == "A"
    assert r["pode ir quando quiser"] == "B" and r["mais uma vez do comeco"] == "B"       # Ruan e Xande: os dois são B
    assert r["nossa"] != "B"                                                   # a exclamação dela não vira "equipe"


def test_sem_data_nao_cruza_arquivos(dados, tmp_path, monkeypatch):
    """Take sem gravado_em: não dá para saber qual vem depois; o ditado não é procurado em outro arquivo."""
    from motor.etapas import vozes
    from b_sintetico import analise
    sr = 16000
    dit, rep = "agora vem comigo que eu vou te mostrar as menos calorias", "vem comigo que hoje irei te mostrar as menos calorias"

    def take(aid, s0, texto, f0, data):
        x = (0.0005 * np.random.default_rng(1).standard_normal(10 * sr)).astype(np.float32)
        v = _voz(len(texto.split()) * 0.3, f0)
        x[int(s0 * sr):int(s0 * sr) + len(v)] += v
        p = _palavras(texto, s0)
        a = analise(aid=aid, dur=10.0, falante=None)
        a["transcricao"]["segmentos"] = [{"s": p[0][0], "e": p[-1][1], "texto": texto, "falante": None, "conf": 0.9, "palavras": p}]
        a["arquivo"]["gravado_em"] = data
        return a, x
    a1, x1 = take("a001", 1.0, dit, 140, None)
    a2, x2 = take("a002", 1.0, rep, 255, None)
    aud = {"a001": x1, "a002": x2}
    novas = vozes.rotular([a1, a2], lambda a: (aud[a["arquivo"]["id"]], 0.0), assinador=AssinadorPorTom())
    assert "ditado" not in novas[0]["transcricao"]["segmentos"][0]
    a1["arquivo"]["gravado_em"], a2["arquivo"]["gravado_em"] = "2026-11-18T10:00:00-03:00", "2026-11-18T10:01:00-03:00"
    novas = vozes.rotular([a1, a2], lambda a: (aud[a["arquivo"]["id"]], 0.0), assinador=AssinadorPorTom())
    assert novas[0]["transcricao"]["segmentos"][0]["ditado"] == {"s": 1.0, "arquivo": "a002"}
