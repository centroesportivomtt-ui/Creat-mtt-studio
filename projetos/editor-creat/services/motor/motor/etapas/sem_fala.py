"""Filme SEM fala, cortado pela música (peça M3; pedido do dono, 25/11: "as músicas têm que estar hiperconectadas…
cada cena interaja com a outra e cada conexão, momento e transição, junto com a música"; "ordem cronológica"; "foco nos
vídeos de mais alta qualidade"; sem plano morto nem tremor forte).

O resolvedor de sempre monta em cima da voz (a fala é a espinha). Quando a direção vem com `sem_fala: true` (ou nenhum
bloco tem fala), a espinha passa a ser a TRILHA, e este módulo decide sozinho trechos e durações:

1. grade: bpm e fase da trilha. A música começa num compasso inteiro escolhido para a VIRADA cair no começo do bloco do
   auge (trilha.drop_em; sem ele, o bloco de função virada/clímax ou o de maior intensidade) e para a música cobrir o filme.
2. blocos: os de antes do auge repartem o trecho até a virada, os de depois repartem o resto; cada fronteira cai num
   compasso inteiro, puxada para a troca de parte da música quando há uma a menos de 1,5 compasso.
3. planos: a duração vem da energia da PARTE da música naquele ponto (1 = 3 e 2 compassos, 2 = 2, 3 = 1, 4 = 2 batidas,
   5 = 1-1-2 batidas; no máximo 6 s); sem mapa da música, vale a intensidade do bloco. Todo corte na batida; nenhum plano atravessa troca
   de parte nem de bloco.
4. material: janelas boas de cada clipe (momentos do catálogo, os melhores trechos da M2 em `clipe.movimento.melhores`,
   ou o clipe inteiro), sem trecho tremido forte nem borrado quando o sinal existe (série da M2 ou `movimento.tremidos`),
   clipe inteiro mole fora. O plano mais forte do material abre a virada; os outros seguem a ordem em que foram gravados
   (`arquivo.gravado_em`), espalhados por todo o material bom, sem repetir trecho.
5. câmera lenta (vel < 1) só em fonte de 60 fps ou mais: na parte calma ou no efeito "lento" pedido pelo diretor.
6. som: trilha cheia, sem ducking (não há voz para abrir espaço); o som direto da fonte entra baixo por baixo.

Com fala, nada aqui roda: o resolvedor segue 100% como antes.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import itertools
import json
import math

from motor import movimento as MV

ENERGIA_BATIDAS = {1: (12, 8), 2: (8,), 3: (4,), 4: (2,), 5: (1, 1, 2)}   # batidas por plano, pela energia da parte
PLANO_MIN_S = 0.4        # abaixo disto o olho não registra o plano (bpm muito rápido: junta batidas)
PLANO_MAX_S = 6.0        # parte calma em bpm lento: 3 compassos a 60 bpm seriam 12 s, ar morto (retenção)
FPS_LENTO = 59.0         # 59,94 conta como 60
SOM_DIRETO_DB = -12      # som da fonte sob a trilha: -35 dB no mix (a montagem soma -23)
JANELA_MIN_S = 0.5
POOL_FATOR = 2.5         # material bom guardado para espalhar: 2,5x o que o filme consome
FUSO_PADRAO = _dt.timezone(_dt.timedelta(hours=-3))   # data sem fuso (nome do arquivo) vale como horário de Brasília
TREMIDOS_NO_CATALOGO = 3   # o catálogo (M2) guarda só os 3 piores trechos tremidos de cada clipe
PLANOS_AVISO = 400         # acima disto a montagem (ffmpeg por plano) fica lenta, sobretudo em 4K


def ativo(direcao: dict) -> bool:
    """O filme é sem fala? `sem_fala` explícito manda (true liga, false desliga); sem o campo, liga quando nenhum bloco
    tem fala (sem voz não há espinha de fala).

    Mudança intencional da M3: direção antiga só com cobertura e sem nenhuma fala, que antes ia para o resolvedor de
    sempre (e saía sem espinha), agora é cortada pela música. Quem quiser o comportamento antigo manda `sem_fala: false`."""
    blocos = direcao.get("blocos") or []
    pedido = direcao.get("sem_fala")
    if pedido is not None:
        return pedido is True
    return bool(blocos) and not any(b.get("falas") for b in blocos)


# ---------------------------------------------------------------- grade da música
class Grade:
    """Batida e compasso no tempo do FILME (a música começa em `ini` segundos da trilha)."""

    def __init__(self, bpm: float, fase: float, medido: bool):
        self.bpm, self.medido = float(bpm), medido
        self.b = 60.0 / self.bpm
        self.c = 4 * self.b
        self.fase_musica = float(fase or 0.0)
        self.ini = 0.0

    def batida(self, t: float) -> float:
        """Batida mais perto de t no filme. A música sempre entra num tempo da trilha (fase + compassos inteiros), então
        a grade do filme é múltiplos de b a partir de 0 — inclusive na emenda de música curta (ver `_emendas`)."""
        return round(round(t / self.b) * self.b, 4)

    def compasso(self, t: float, base: float = 0.0) -> float:
        return round(base + round((t - base) / self.c) * self.c, 4)


def _grade(R, trilha) -> Grade:
    if trilha and trilha.get("bpm"):
        return Grade(trilha["bpm"], trilha.get("fase", 0.0), bool(trilha.get("bpm_medido", True)))
    R.avisos.append("filme sem fala sem bpm de trilha: cortes numa grade de 120 bpm")
    return Grade(120.0, 0.0, False)


def _bloco_do_auge(d: dict) -> int:
    """Índice do bloco que recebe a virada: o marcado pelo diretor; senão o de função virada/clímax; senão o mais intenso."""
    blocos = d["blocos"]
    alvo = (d.get("trilha") or {}).get("drop_em")
    for k, b in enumerate(blocos):
        if b["id"] == alvo:
            return k
    for k, b in enumerate(blocos):
        if b.get("funcao") in ("virada", "climax"):
            return k
    return max(range(len(blocos)), key=lambda k: (blocos[k].get("intensidade", 3), -k))


def _musica_no_filme(R, trilha, g: Grade, D: float, k: int, n: int) -> tuple[float, float | None, bool]:
    """(ini, virada no filme, cabe) — ini em compassos inteiros a partir da fase, para o filme começar num tempo forte.
    A virada mira a fração do filme que os blocos de antes ocupam (entre 25% e 60%: crescendo curto não prepara, longo
    cansa), e cada bloco de antes ganha pelo menos 1 compasso."""
    f = g.fase_musica
    td = float((trilha or {}).get("dur") or 0.0)
    if not trilha:
        return 0.0, None, False
    if td <= 0:                                              # duração desconhecida: entra na fase, sem alinhar virada
        return round(f, 4), None, False
    j_max = math.floor((td - D - f) / g.c + 1e-6)
    if j_max < 0:                                            # música mais curta que o filme: emenda por compassos
        R.avisos.append(f"a música ({_br(td, 1)} s) é mais curta que o filme ({_br(D, 1)} s): emenda por compassos, "
                        "sem alinhar a virada no auge")
        return round(f, 4), None, False
    v = trilha.get("virada")
    if v is None or not g.medido:
        return round(f, 4), None, True
    ideal = 0.0 if k == 0 else min(0.6 * D, max(0.25 * D, D * k / n))
    cands = []
    for j in range(0, j_max + 1):
        vf = float(v) - f - j * g.c
        if vf < k * g.c - 1e-6:                              # cada bloco de antes da virada precisa de 1 compasso
            break
        if k == 0 and abs(vf) > 1e-6:                         # auge no 1o bloco: a música entra já na virada
            continue
        if vf <= D - (n - k) * g.c + 1e-6:
            cands.append((abs(vf - ideal), j, vf))
    if not cands:
        R.avisos.append(f"a virada da música ({_br(float(v), 1)} s) não coube no auge do filme: a música toca do começo")
        return round(f, 4), None, True
    _, j, vf = min(cands)
    return round(f + j * g.c, 4), round(vf, 4), True


def _br(x: float, casas: int = 2) -> str:
    return f"{x:.{casas}f}".replace(".", ",")


def _emendas(g: Grade, td: float, D: float) -> list[list[float]]:
    """Música mais curta que o filme: emenda por compassos inteiros contados a partir da FASE (o primeiro tempo).

    A emenda antiga do resolvedor começa no segundo 0 da trilha; com fase != 0 as batidas da música cairiam em
    fase + m*b no filme e todo corte da grade (múltiplos de b) ficaria fora do tempo. Começando em `fase`, cada pedaço
    tem compassos inteiros e a batida da música volta a coincidir com a grade do filme."""
    f = g.fase_musica
    bloco = g.c * max(1, math.floor((td - f) / g.c + 1e-6)) if td > 0 else D
    out, t = [], 0.0
    while t < D - 1e-6:
        d = min(bloco, D - t)
        out.append([round(t, 3), round(f, 3), round(f + d, 3), 0.05 if (t > 0 or f > 0) else 0.0])
        t += d
    return out


def _secoes_no_filme(trilha, g: Grade, D: float) -> list[dict]:
    """Partes da música no tempo do filme. A troca de parte vem de uma energia suavizada em 4 s e chega adiantada ou
    atrasada perto da virada; a virada é medida pela subida sustentada e cai na batida, então a troca a menos de 1,5
    compasso dela passa a ser a própria virada (o auge do corte começa junto com o estouro da música).

    As fronteiras já saem na batida do filme: é com elas que a grade de planos lê a energia E decide onde não cortar,
    então as duas leituras precisam ser a mesma (senão uma fatia de 0,1 s da parte calma decide um plano de 6 s que
    atravessa a troca real). Parte menor que 1 batida some."""
    v = (trilha or {}).get("virada")

    def ajusta(t: float) -> float:
        return float(v) if v is not None and abs(t - float(v)) <= 1.5 * g.c else t
    out = []
    for s in (trilha or {}).get("secoes") or []:
        a = g.batida(max(0.0, ajusta(float(s["t0"])) - g.ini))
        b = g.batida(min(D, ajusta(float(s["t1"])) - g.ini))
        if b - a < g.b - 1e-6 or b <= 0 or a >= D:
            continue
        out.append({"t0": a, "t1": min(D, b), "energia": int(s["energia"])})
    return out


def _dividir(a: float, b: float, n: int, g: Grade, trocas: list[float]) -> list[float]:
    """n-1 fronteiras entre a e b: compasso inteiro (contado de a), puxado para a troca de parte mais perto (< 1,5 compasso)."""
    out, ant = [], a
    for i in range(1, n):
        x = a + (b - a) * i / n
        perto = [t for t in trocas if a + g.b < t < b - g.b and abs(t - x) <= 1.5 * g.c]
        y = min(perto, key=lambda t: abs(t - x)) if perto else g.compasso(x, a)
        if y <= ant + g.b - 1e-6 or y >= b - g.b + 1e-6:     # pouco espaço: cai na batida mais perto, sem encostar
            y = min(max(g.batida(x), ant + g.b), b - g.b * (n - i))
        out.append(round(y, 4))
        ant = y
    return out


# ---------------------------------------------------------------- material
def _quando(R, c: dict, idx: int):
    """Chave cronológica: gravado_em da análise (com ou sem fuso), depois a ordem do catálogo (que já é a de gravação)."""
    s = (R.an[c["arquivo"]].get("arquivo") or {}).get("gravado_em")
    ts = None
    if s:
        try:
            d = _dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
            ts = (d if d.tzinfo else d.replace(tzinfo=FUSO_PADRAO)).timestamp()
        except ValueError:
            ts = None
    return (ts is None, ts or 0.0, idx)


def _subtrair(iv: list[tuple[float, float]], fora: list[tuple[float, float]]) -> list[tuple[float, float]]:
    for x0, x1 in fora:
        novos = []
        for a, b in iv:
            if x1 <= a or x0 >= b:
                novos.append((a, b))
                continue
            if x0 > a:
                novos.append((a, x0))
            if x1 < b:
                novos.append((x1, b))
        iv = novos
    return iv


def _ruins(R, c: dict) -> list[tuple[float, float]]:
    """Trechos mortos do clipe: tremor forte ou imagem borrada (série da M2), ou os `tremidos` do catálogo sem a série."""
    serie = R._serie(c["id"]) if hasattr(R, "_serie") else None
    out = []
    if serie and serie.get("t"):
        esc = R._escala_tremor(c["id"], 1.0)
        p = float(serie.get("passo") or MV.PASSO)
        # série sem uma das listas (versão antiga da M2) não pode zerar o outro veto: falta vale como neutro
        for t, tr, nit in itertools.zip_longest(serie["t"], serie.get("tremor") or [], serie.get("nitidez") or [],
                                                fillvalue=None):
            if t is None:
                break
            tr = 0.0 if tr is None else tr
            nit = 1.0 if nit is None else nit
            if tr * esc > MV.LIMIAR_FORTE or nit < MV.NITIDEZ_BORRADO:
                out.append((float(t), float(t) + p))
    else:
        tremidos = (c.get("movimento") or {}).get("tremidos") or []
        for x in tremidos:
            out.append((float(x[0]), float(x[1])))
        if len(tremidos) >= TREMIDOS_NO_CATALOGO and hasattr(R, "avisos"):
            R.avisos.append(f"{c['id']}: o catálogo guarda só {TREMIDOS_NO_CATALOGO} trechos tremidos e não há série de "
                            "movimento: pode haver mais tremor fora deles")
    return out


def _clipe_morto(c: dict) -> str | None:
    mv = c.get("movimento") or {}
    if mv.get("borrado_pct", 0.0) >= 0.5:
        return "borrado na maior parte"
    if mv.get("nitidez_rel", 1.0) < 0.35:
        return "inteiro mole perto do resto do material"
    return None


def _nota_clipe(R, c: dict) -> float:
    """Qualidade do clipe (0-1): nota de imagem da M2 quando existe; recorte que amplia a fonte perde na proporção."""
    mv = c.get("movimento") or {}
    q = float(mv.get("nota", 0.7)) if mv else 0.7
    amp = mv.get("ampliacao") or (R._ampliacao(c["id"]) if hasattr(R, "_ampliacao") else None) or 1.0
    return q / amp if amp > 1.0 else q


def _janelas_do_clipe(R, c: dict, idx: int, momentos: list[dict] | None = None) -> list[dict]:
    a = R.an[c["arquivo"]]
    m = a["midia"]
    if not m.get("tem_video", True):
        return []
    dur = float(m.get("duracao") or c.get("dur") or 0.0)
    base = []
    if momentos is not None:
        base = [(mm["t0"], mm["t1"], mm["nota"] / 5.0) for mm in momentos]
    else:
        base = [(mm["t0"], mm["t1"], mm["nota"] / 5.0) for mm in c.get("momentos") or []]
        base += [(x[0], x[1], float(x[2])) for x in (c.get("movimento") or {}).get("melhores") or []]
        if not base:
            base = [(0.0, dur, 0.5)]
    trechos = [(t["ini"] + 0.2, (t.get("fim") or dur) - 0.2) for t in a.get("derivados", {}).get("trechos") or []] or [(0.1, dur - 0.1)]
    ruins = _ruins(R, c)
    qc = _nota_clipe(R, c)
    out = []
    for x0, x1, q in sorted(base):
        iv = []
        for t0, t1 in trechos:                                 # só onde o arquivo existe
            lo, hi = max(x0, t0), min(x1, t1)
            if hi - lo >= JANELA_MIN_S:
                iv.append((lo, hi))
        for lo, hi in _subtrair(iv, ruins):
            if hi - lo >= JANELA_MIN_S:
                out.append({"c": c, "a": round(lo, 3), "b": round(hi, 3), "q": q * (0.4 + 0.6 * qc), "quando": _quando(R, c, idx)})
    # janelas que se sobrepõem (momento x melhor trecho) viram uma só: o mesmo trecho nunca conta duas vezes
    unidas = []
    for w in sorted(out, key=lambda w: w["a"]):
        if unidas and w["a"] <= unidas[-1]["b"]:
            unidas[-1]["b"] = max(unidas[-1]["b"], w["b"])
            unidas[-1]["q"] = max(unidas[-1]["q"], w["q"])
        else:
            unidas.append(dict(w))
    return unidas


def _cronologica(jan: list[dict]) -> list[dict]:
    return sorted(jan, key=lambda w: (w["quando"], w["a"]))


def _livres(jan: list[dict], usados: dict) -> list[dict]:
    out = []
    for w in jan:
        for a, b in _subtrair([(w["a"], w["b"])], usados.get(w["c"]["id"], [])):
            if b - a >= JANELA_MIN_S:
                out.append({**w, "a": a, "b": b})
    return out


def _selecionar(jan: list[dict], precisa: float) -> list[dict]:
    """Foco no material de mais alta qualidade: as melhores janelas até POOL_FATOR x o consumo do filme. Cada janela a
    mais do MESMO clipe vale 15% menos, para o filme não sair inteiro de um clipe só (cena conversando com cena)."""
    restantes, pegos, total, por_clipe = list(jan), [], 0.0, {}
    while restantes and total < POOL_FATOR * precisa:
        w = max(restantes, key=lambda w: w["q"] * 0.85 ** por_clipe.get(w["c"]["id"], 0))
        restantes.remove(w)
        pegos.append(w)
        total += w["b"] - w["a"]
        por_clipe[w["c"]["id"]] = por_clipe.get(w["c"]["id"], 0) + 1
    return _cronologica(pegos)


def _refinar(R, w: dict, a: float, n: float, folga: float) -> float:
    """Dentro da janela, o começo mais nítido e firme entre a e a + folga (série da M2); sem série, fica em a."""
    serie = R._serie(w["c"]["id"]) if hasattr(R, "_serie") else None
    if not serie or folga < 0.1:
        return a
    s0 = MV.melhor_trecho(serie, n, a, min(w["b"], a + n + folga), escala=R._escala_tremor(w["c"]["id"], 1.0))[0]
    return min(max(a, s0), w["b"] - n)


def _usar(usados: dict, cid: str, a: float, b: float) -> None:
    usados.setdefault(cid, []).append((a, b))


def _distribuir(R, jan: list[dict], pedidos: list[float], usados: dict) -> list[tuple[dict, float] | None]:
    """Espalha os planos (na ordem do filme) pelo material em ordem de gravação, sem voltar no tempo e sem repetir trecho.

    O material vira uma fita só (as janelas em ordem cronológica, uma atrás da outra); cada plano mira o ponto da fita
    que divide a sobra igualmente entre os planos, então o filme percorre o dia inteiro em vez de gastar o começo.
    Plano que não cabe mais à frente volta None (quem chama tenta outro material)."""
    jan = _livres(jan, usados)
    if not jan or not pedidos:
        return [None] * len(pedidos)
    T = sum(w["b"] - w["a"] for w in jan)
    N = sum(pedidos)
    sobra = max(0.0, T - N)
    inicio, acc = [], 0.0
    for w in jan:
        inicio.append(acc)
        acc += w["b"] - w["a"]
    out, cursor, cum = [], 0.0, 0.0
    for i, n in enumerate(pedidos):
        alvo = max(cursor, cum + sobra * (i + 0.5) / len(pedidos))
        cum += n
        achou = None
        for k, w in enumerate(jan):
            fim_fita = inicio[k] + (w["b"] - w["a"])
            if fim_fita < alvo + 1e-6 or w["b"] - w["a"] < n - 1e-6:
                continue
            a = w["a"] + max(0.0, alvo - inicio[k])
            a_min = w["a"] + max(0.0, cursor - inicio[k])      # nunca antes do que já foi usado nesta fita
            if a + n > w["b"]:
                a = w["b"] - n
            if a < a_min - 1e-6:
                continue
            a = _refinar(R, w, a, n, min(w["b"] - n - a, max(0.5, sobra / len(pedidos))))
            achou = (w, round(a, 4))
            cursor = inicio[k] + (a + n - w["a"])
            break
        if achou:
            _usar(usados, achou[0]["c"]["id"], achou[1], achou[1] + n)
        out.append(achou)
    return out


def _livre_qualquer(jan: list[dict], n: float, usados: dict) -> tuple[dict, float] | None:
    """Último recurso antes de repetir: qualquer trecho livre do tamanho certo (melhor nota), mesmo fora da ordem."""
    cands = [w for w in _livres(jan, usados) if w["b"] - w["a"] >= n - 1e-6]
    if not cands:
        return None
    w = max(cands, key=lambda w: w["q"])
    _usar(usados, w["c"]["id"], w["a"], w["a"] + n)
    return w, w["a"]


def _repetir(R, jan: list[dict], n: float) -> tuple[dict, float]:
    """Último dos últimos: repete o melhor trecho que comporta o plano; se nenhum comporta, o mais longo. O começo é
    puxado para trás quando preciso, para o plano nunca pedir imagem depois do fim do arquivo."""
    cabem = [w for w in jan if w["b"] - w["a"] >= n - 1e-6]
    w = max(cabem, key=lambda w: w["q"]) if cabem else max(jan, key=lambda w: w["b"] - w["a"])
    dur = float(R.an[w["c"]["arquivo"]]["midia"].get("duracao") or w["b"])
    return w, round(max(0.0, min(w["a"], dur - n - 0.05)), 4)


def _mais_forte(R, jan: list[dict], n: float, usados: dict) -> tuple[dict, float] | None:
    """O plano da virada: a janela de maior nota (nota do momento x qualidade do clipe x nota de imagem do melhor trecho)."""
    melhor = None
    for w in _livres(jan, usados):
        if w["b"] - w["a"] < n - 1e-6:
            continue
        serie = R._serie(w["c"]["id"]) if hasattr(R, "_serie") else None
        a, nota = w["a"], 1.0
        if serie:
            a, _, nota = MV.melhor_trecho(serie, n, w["a"], w["b"], escala=R._escala_tremor(w["c"]["id"], 1.0))
            a = min(max(w["a"], a), w["b"] - n)
        elif w["b"] - w["a"] > n + 0.3:                       # sem série: o meio do momento (o auge da ação costuma estar ali)
            a = w["a"] + (w["b"] - w["a"] - n) / 2
        s = w["q"] * (0.5 + 0.5 * nota)
        if melhor is None or s > melhor[0] + 1e-9:
            melhor = (s, w, round(a, 4))
    if melhor is None:
        return None
    _usar(usados, melhor[1]["c"]["id"], melhor[2], melhor[2] + n)
    return melhor[1], melhor[2]


# ---------------------------------------------------------------- principal
def resolver(R) -> dict:
    from motor.etapas.resolvedor import ErroResolucao
    d, blocos_d = R.d, R.d["blocos"]
    descartadas = sum(len(b.get("falas") or []) for b in blocos_d)
    if descartadas:                                          # sem_fala: true com fala na direção: não some calado
        R.avisos.append(f"filme sem fala: {descartadas} fala(s) da direção ignorada(s) (sem_fala: true); "
                        "para usar a voz, mande sem_fala: false")
    explicitos = {}
    for b in blocos_d:
        if b.get("cobertura"):
            faltam = [cb["m"] for cb in b["cobertura"] if cb["m"] not in R.mom]
            R.problemas += [f"momento {m} não existe no catálogo" for m in faltam]
            explicitos[b["id"]] = [cb for cb in b["cobertura"] if cb["m"] in R.mom]
    if R.problemas:
        raise ErroResolucao(R.problemas)

    jan_todas = []
    for idx, c in enumerate(R.cat["clipes"]):
        motivo = _clipe_morto(c)
        if motivo:
            R.avisos.append(f"{c['id']} fora do filme sem fala: {motivo}")
            continue
        jan_todas += _janelas_do_clipe(R, c, idx)
    if not jan_todas:
        raise ErroResolucao(["filme sem fala: nenhum trecho aproveitável no catálogo (tudo tremido, borrado ou curto)"])

    trilha = R._trilha()
    g = _grade(R, trilha)
    alvo = float(d["duracao_alvo"])
    util = sum(w["b"] - w["a"] for w in jan_todas)
    D = alvo
    if util < D:
        R.avisos.append(f"material bom soma {_br(util, 1)} s, menos que o alvo de {alvo:.0f} s: o filme encurta para não repetir trecho")
        D = util
    D = max(2 * g.b, math.floor(D / g.b + 0.5 + 1e-9) * g.b)
    if D > util + 1e-6:
        D -= g.b
    D = round(D, 4)

    n = len(blocos_d)
    k = _bloco_do_auge(d)
    g.ini, vf, cabe = _musica_no_filme(R, trilha, g, D, k, n)
    secoes = _secoes_no_filme(trilha, g, D) if cabe else []
    trocas = sorted({g.batida(s["t0"]) for s in secoes if 0 < s["t0"] < D})

    # blocos: antes da virada / da virada em diante
    if vf is not None and k > 0:
        cortes = _dividir(0.0, vf, k, g, trocas) + [vf] + _dividir(vf, D, n - k, g, trocas)
    else:
        cortes = _dividir(0.0, D, n, g, trocas)
    bordas = [0.0] + sorted(cortes) + [D]
    L_blocos = [{"id": b["id"], "funcao": b["funcao"], "intensidade": b["intensidade"], "t0": round(bordas[i], 4), "t1": round(bordas[i + 1], 4)}
                for i, b in enumerate(blocos_d)]
    inicio_auge = L_blocos[k]["t0"]

    def energia(t: float, b: dict) -> int:
        s = next((s for s in secoes if s["t0"] - 1e-6 <= t < s["t1"] - 1e-6), None)
        return int(s["energia"]) if s else int(b.get("intensidade", 3))

    # grade de planos
    planos_g = []
    for bd, bl in zip(blocos_d, L_blocos):
        t, passo = bl["t0"], 0
        while t < bl["t1"] - 1e-6:
            e = max(1, min(5, energia(t, bd)))
            pat = ENERGIA_BATIDAS[e]
            nb = pat[passo % len(pat)]
            passo += 1
            if abs(t - inicio_auge) < 1e-6:
                nb = max(nb, 2)                                   # o plano mais forte fica no ar o bastante para ser visto
            dur = nb * g.b
            while dur < PLANO_MIN_S - 1e-6:
                dur += g.b
            while dur > PLANO_MAX_S + 1e-6 and dur - g.c >= PLANO_MIN_S:
                dur -= g.c
            fim = t + dur
            tr = next((x for x in trocas if t + 1e-6 < x < fim - 1e-6), None)
            if tr is not None:
                fim = tr                                          # o plano não atravessa a troca de parte da música
            fim = min(fim, bl["t1"])
            if bl["t1"] - fim < max(PLANO_MIN_S, g.b) - 1e-6:
                fim = bl["t1"]                                    # resto curto demais entra neste plano
            planos_g.append({"t0": round(t, 4), "t1": round(fim, 4), "e": e, "bloco": bd["id"],
                             "lento": e <= 2 and fim - t >= 1.5, "forte": abs(t - inicio_auge) < 1e-6})
            t = fim

    # material: virada -> blocos com cobertura escolhida pelo diretor -> resto em ordem de gravação
    usados: dict = {}
    escolha: list = [None] * len(planos_g)
    jan_bloco = {}
    for bid, cbs in explicitos.items():
        jan = []
        for cb in cbs:
            c, mm = R.mom[cb["m"]]
            idx = next(i for i, x in enumerate(R.cat["clipes"]) if x["id"] == c["id"])
            jan += _janelas_do_clipe(R, c, idx, [mm])
        jan_bloco[bid] = _cronologica(jan)
    lento_pedido = {bid for bid, cbs in explicitos.items() if any(cb.get("efeito") == "lento" for cb in cbs)}

    i_forte = next((i for i, p in enumerate(planos_g) if p["forte"]), None)
    if i_forte is not None:
        p = planos_g[i_forte]
        pool = jan_bloco.get(p["bloco"]) or jan_todas
        escolha[i_forte] = _mais_forte(R, pool, p["t1"] - p["t0"], usados) or _mais_forte(R, jan_todas, p["t1"] - p["t0"], usados)
    for bid, jan in jan_bloco.items():
        idx = [i for i, p in enumerate(planos_g) if p["bloco"] == bid and escolha[i] is None]
        for i, r in zip(idx, _distribuir(R, jan, [planos_g[i]["t1"] - planos_g[i]["t0"] for i in idx], usados)):
            escolha[i] = r
    # bloco do diretor cujos momentos acabaram: completa AGORA, antes de a distribuição geral picotar o material
    # (depois dela só sobram retalhos menores que o plano e o bloco cairia em repetição)
    fora_do_pedido: dict = {}
    for i, p in enumerate(planos_g):
        if escolha[i] is None and p["bloco"] in jan_bloco:
            escolha[i] = _livre_qualquer(jan_todas, p["t1"] - p["t0"], usados)
            if escolha[i] is not None:
                fora_do_pedido[p["bloco"]] = fora_do_pedido.get(p["bloco"], 0) + 1
    idx = [i for i, p in enumerate(planos_g) if escolha[i] is None and p["bloco"] not in jan_bloco]
    precisa = sum(planos_g[i]["t1"] - planos_g[i]["t0"] for i in idx)
    pool = _selecionar(_livres(jan_todas, usados), precisa)
    for i, r in zip(idx, _distribuir(R, pool, [planos_g[i]["t1"] - planos_g[i]["t0"] for i in idx], usados)):
        escolha[i] = r
    fora_de_ordem = repetidos = 0
    for i, p in enumerate(planos_g):
        if escolha[i] is not None:
            continue
        n_s = p["t1"] - p["t0"]
        escolha[i] = _livre_qualquer(jan_todas, n_s, usados)
        if escolha[i] is not None:
            if p["bloco"] in jan_bloco:                       # o bloco tinha momentos do diretor, e eles acabaram
                fora_do_pedido[p["bloco"]] = fora_do_pedido.get(p["bloco"], 0) + 1
            else:
                fora_de_ordem += 1
            continue
        escolha[i] = _repetir(R, jan_todas, n_s)
        repetidos += 1
    if fora_de_ordem:
        R.avisos.append(f"filme sem fala: {fora_de_ordem} plano(s) fora da ordem de gravação (o material em ordem acabou)")
    for bid, q in fora_do_pedido.items():
        R.avisos.append(f"filme sem fala: {q} plano(s) do bloco {bid} sem material livre nos momentos pedidos: "
                        "usam outro trecho do catálogo")
    if repetidos:
        R.avisos.append(f"filme sem fala: {repetidos} plano(s) repetem trecho (material curto para o filme)")
    if len(planos_g) > PLANOS_AVISO:
        R.avisos.append(f"filme sem fala com {len(planos_g)} planos (mais de {PLANOS_AVISO}): a montagem vai demorar; "
                        "considere um filme mais curto ou uma trilha de energia menor")

    # planos
    zooms = R.m.get("intensidade", {})
    lento_vel = float(R.m.get("cobertura", {}).get("lento_vel", 0.5))
    planos, sem_lento = [], set()
    for k_p, (pg, (w, s0)) in enumerate(zip(planos_g, escolha)):
        c = w["c"]
        midia = R.an[c["arquivo"]]["midia"]
        fps = float(midia.get("fps") or 0.0)
        n_s = pg["t1"] - pg["t0"]
        vel = 1.0
        quer_lento = pg["lento"] or pg["bloco"] in lento_pedido
        if quer_lento and not pg["forte"]:
            if fps >= FPS_LENTO:
                vel = round(max(lento_vel, R.formato["fps"] / fps), 4)
                s0 = s0 + n_s * (1 - vel) / 2                    # o meio do trecho escolhido, em câmera lenta
            elif pg["bloco"] in lento_pedido and c["id"] not in sem_lento:
                sem_lento.add(c["id"])
                R.avisos.append(f"{c['id']}: câmera lenta pedida, mas a fonte tem {fps:.0f} fps (só 60 fps ou mais fica liso): vai em 1x")
        z = zooms.get(str(pg["e"]), {}).get("zoom", 1.0)
        zoom = 1.0 if k_p % 2 == 0 else z                          # corte de escala entre planos vizinhos
        extra = {}
        if midia.get("tem_audio", True) and vel == 1.0:
            extra["som_direto_db"] = SOM_DIRETO_DB                # o lugar respira por baixo da música
        if pg["forte"]:
            extra["flash"] = [[0.0, 0.12, 0.8]]
        p = R._plano("P", pg["bloco"], pg["t0"], pg["t1"], c["id"], s0, vel, zoom, **extra)
        if pg["forte"]:                                           # a virada: punch no plano mais forte
            z0 = p["enquadre"][0]
            p["enquadre"] = [[0, 1.0, z0[2], z0[3]], [1, 1.15, z0[2], z0[3]]]
        planos.append(p)
    if hasattr(R, "_qualidade_planos"):
        R._qualidade_planos(planos)
    R._ampliados = {}
    for i, p in enumerate(planos):
        p["id"] = f"P{i:02d}"
        p.pop("_clipe", None)
        amp = p.pop("_amp", 1.0)
        if amp > 1.0 + 1e-3:
            R._ampliados[p["id"]] = amp

    # motion, fx e som (o mesmo motor do filme com fala: gancho, textos, transições de bloco, fecho)
    fecho_dur = float(R.m["fecho"]["dur"])
    fecho_t = max(L_blocos[-1]["t0"], math.floor(max(0.0, D - fecho_dur) / g.b + 1e-9) * g.b)
    L = {"blocos": L_blocos, "voz": [], "cobs": [], "janelas": {}, "fecho_t": round(fecho_t, 4), "duracao": D}
    motion, fx, sfx = R._motion(L)
    if not (d.get("trilha") or {}).get("drop_em") and vf is not None:      # auge escolhido aqui: o impacto também
        fx.append({"tipo": "impacto", "t": round(inicio_auge, 3), "dur": 0.2, "forca": 1.0})
        if R.m.get("sfx", {}).get("drop"):
            sfx.append({"t": round(inicio_auge, 3), "som": R.m["sfx"]["drop"], "g": -3, "pan": 0})
        fx.sort(key=lambda x: x["t"])
        sfx.sort(key=lambda x: x["t"])
    if hasattr(R, "_casar_transicoes"):
        R._casar_transicoes(planos, fx, sfx)                  # whip no sentido em que a câmera já vai (M2)
    if abs(D - alvo) > 0.1 * alvo:
        R.avisos.append(f"duração {D:.1f} s fora de ±10% do alvo {alvo:.0f} s")

    tm = R.m.get("trilha", {})
    if trilha and not cabe:                                   # música curta: emenda alinhada na fase (a grade continua na batida)
        tr_edl = {"chave": trilha["chave"], "bpm": trilha["bpm"], "fase": trilha.get("fase", 0.0),
                  "emendas": _emendas(g, float(trilha.get("dur") or 0.0), D),
                  "ganho_db": tm.get("ganho_db", -14), "ducking": {"db": 0.0, "desce": 0.4, "sobe": 0.55},
                  "acorde_final": round(L["fecho_t"] + 0.6, 3)}
    elif trilha:
        tr_edl = {"chave": trilha["chave"], "bpm": trilha["bpm"], "fase": trilha.get("fase", 0.0),
                  "emendas": [[0.0, round(g.ini, 3), round(g.ini + D, 3), 0.05 if g.ini > 0 else 0.0]],
                  "ganho_db": tm.get("ganho_db", -14), "ducking": {"db": 0.0, "desce": 0.4, "sobe": 0.55},
                  "acorde_final": round(L["fecho_t"] + 0.6, 3)}
    else:
        tr_edl = R._trilha_edl(trilha, L)
        tr_edl["ducking"] = {"db": 0.0, "desce": 0.4, "sobe": 0.55}
    musica = {"inicio": round(g.ini, 3), "bpm": g.bpm, "virada_filme": vf, "bloco_auge": blocos_d[k]["id"],
              "partes": [[round(s["t0"], 2), round(s["t1"], 2), s["energia"]] for s in secoes]}
    edl = {
        "versao": "1", "projeto": R.projeto,
        "origem": {"direcao": hashlib.sha256(json.dumps(d, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16],
                   "catalogo": R.cat.get("projeto"), "modelo": R.m["id"], "vel_aplicada": 1.0, "avisos": R.avisos,
                   "conceito": d.get("conceito"), "alem_do_pedido": d.get("alem_do_pedido", []), "modo": "sem_fala", "musica": musica,
                   **({"ampliacao": R._ampliados} if R._ampliados else {})},
        "formato": dict(R.formato), "duracao": D, "vel_fala": 1.0, "blocos": L_blocos,
        "fontes": R._fontes({p["fonte"] for p in planos}), "voz": [], "planos": planos, "motion": motion,
        "legendas": {"modelo": R.m.get("legenda", {}).get("modelo", "legenda"), "y": R.m.get("legenda", {}).get("y", 0.62), "palavras": []},
        "fx": fx, "trilha": tr_edl, "sfx": sfx, "tom_sala": None,
        "master": {"lufs": -14, "tp": -1.0, "crf": 17},
        "qa": {"logos": [{"t": round(L["fecho_t"] + 0.6, 3), "chave": R.m["fecho"]["logo"]}]
               + ([{"t": round(L["fecho_t"] + 0.6, 3), "chave": f"marcas/{d['fecho']['logo_cliente']}/logo.png"}] if d["fecho"].get("logo_cliente") else []),
               "falas_confirmadas": [], "riscos": list(d.get("riscos", [])) + R.avisos},
    }
    return edl
