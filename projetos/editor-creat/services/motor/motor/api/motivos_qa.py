"""Motivos da conferência em frases do dono (onda 4, D51): uma tabela só, para a tela da versão segurada e, depois, a conversa.

`frase(checagem, duracao)` recebe o item do qa.json ({id, ok, bloqueia, detalhe, valor}) e devolve
{"id", "titulo", "frase", "quando"}. `quando` são os instantes NO FILME (segundos) que a própria checagem já grava no `valor`
(chaves "t", "pior_t", ou o par "t0"/"t1" de um trecho do filme); checagem que não grava tempo devolve None.
Tempo de FONTE ("s", "s0", "s1") nunca entra: ele não serve para levar o player ao ponto.
"""
from __future__ import annotations

TABELA: dict[str, tuple[str, str]] = {
    "fala_cortada": ("Fala cortada", "Uma fala foi cortada antes de terminar"),
    "voz_externa": ("Voz de fora", "Dá para ouvir a voz de alguém que não devia estar no filme"),
    "cobertura_sintonia": ("Boca fora de sincronia", "Aparece alguém falando fora de sincronia com a voz"),
    "frase_repetida": ("Frase em laço", "Uma frase se repete no fundo, como em laço"),
    "tom_sala_sem_voz": ("Fundo com conversa", "O som de fundo tem gente conversando"),
    "legenda_x_fala": ("Legenda diferente da fala", "A legenda não bate com o que foi dito"),
    "formato": ("Formato do arquivo", "O arquivo final não saiu no formato de entrega (tamanho, quadros por segundo ou codificação)"),
    "duracao": ("Duração", "O filme saiu com uma duração diferente da montada"),
    "sincronia": ("Som e imagem", "O som e a imagem do filme terminam em tempos diferentes"),
    "lufs": ("Volume", "O volume geral do filme está fora do padrão das redes"),
    "true_peak": ("Som estourando", "O som passa do pico e pode estourar no celular"),
    "quadros_pretos": ("Tela preta", "Aparece tela preta no meio do filme"),
    "zona_segura": ("Texto na borda", "Um texto fica embaixo dos botões do Instagram, fora da área segura"),
    "logo_100": ("Logo", "A logo não aparece inteira e nítida"),
    "legenda_sobre_rosto": ("Legenda no rosto", "A legenda cobre o rosto de quem fala"),
    "telas_desfocadas": ("Tela sem desfoque", "Uma tela que devia estar desfocada aparece legível"),
    "regra_memoria": ("Regra da casa", "Uma regra que você ensinou ao editor não foi seguida"),
    "cor_medida": ("Cor", "A cor de algum plano saiu do padrão (pele ou luz)"),
    "fatos": ("Número na tela", "Um preço ou número na tela não foi conferido"),
    "sons_reais": ("Efeito sonoro", "Um efeito sonoro do banco tem voz ou não entrou como pedido"),
    "olho_ia": ("Olho de IA", "A revisão por IA achou um defeito que segura a entrega"),
}

MAX_QUANDO = 6


def _tempos(valor, out: list[float], prof: int = 0) -> None:
    if prof > 6 or len(out) >= 40:
        return
    if isinstance(valor, dict):
        for k in ("t", "pior_t"):
            x = valor.get(k)
            if isinstance(x, (int, float)) and not isinstance(x, bool):
                out.append(float(x))
            elif isinstance(x, (list, tuple)) and x and isinstance(x[0], (int, float)) and not isinstance(x[0], bool):
                out.append(float(x[0]))
        if isinstance(valor.get("t0"), (int, float)) and isinstance(valor.get("t1"), (int, float)):
            out.append(float(valor["t0"]))
        for k, v in valor.items():
            if k not in ("t", "pior_t", "t0", "t1", "s", "s0", "s1") and isinstance(v, (dict, list)):
                _tempos(v, out, prof + 1)
    elif isinstance(valor, list):
        for v in valor[:60]:
            if isinstance(v, (dict, list)):
                _tempos(v, out, prof + 1)


def quando(valor, duracao: float | None = None) -> list[float] | None:
    """Instantes no filme (até 6, em ordem, sem repetir o mesmo segundo); None quando a checagem não grava tempo."""
    achados: list[float] = []
    _tempos(valor, achados)
    lim = (float(duracao) + 0.5) if isinstance(duracao, (int, float)) and duracao > 0 else None
    out: list[float] = []
    for t in sorted(achados):
        if t < 0 or (lim is not None and t > lim):
            continue
        t = round(t, 1)
        if not out or t - out[-1] >= 1.0:
            out.append(t)
        if len(out) >= MAX_QUANDO:
            break
    return out or None


def frase(checagem: dict, duracao: float | None = None) -> dict:
    cid = str(checagem.get("id") or "conferencia")
    titulo, texto = TABELA.get(cid, ("Conferência técnica", f"Uma conferência técnica não passou ({cid})"))
    return {"id": cid, "titulo": titulo, "frase": texto, "quando": quando(checagem.get("valor"), duracao)}


def motivos(qa: dict | None, duracao: float | None = None) -> list[dict]:
    """Só o que SEGURA a entrega (falhou e bloqueia), na ordem da conferência."""
    if not isinstance(qa, dict):
        return []
    return [frase(c, duracao) for c in qa.get("checagens") or [] if isinstance(c, dict) and not c.get("ok") and c.get("bloqueia", True)]
