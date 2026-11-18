"""Material sintético da frente B (sem cliente): análises com palavras e uma direção que as cita."""
import copy


def analise(aid="a001", nome="20261118_100000.mov", projeto="p_t", falas=None, dur=30.0, falante="MARCOS"):
    falas = falas or [(1.0, "o pessoal da creit está aqui voando a filmagem capturando tudo"),
                      (6.0, "a gente trabalha com automação e inteligência"),
                      (11.0, "hoje foi um dia incrível de evento"), (22.0, "então sigam a create")]
    segs = []
    for s0, texto in falas:
        ws, t, pal = texto.split(), s0, []
        for w in ws:
            pal.append([round(t, 2), round(t + 0.3, 2), w, 0.3 if w in ("creit",) else 0.9])
            t += 0.34
        segs.append({"s": s0, "e": round(t, 2), "texto": texto, "falante": falante, "conf": 0.9, "palavras": pal})
    return {
        "versao": "1",
        "arquivo": {"id": aid, "projeto": projeto, "nome": nome, "chave": f"entrada/{projeto}/{aid}.mov", "bytes": 1000, "sha256": None,
                    "gravado_em": "2026-11-18T10:00:00-03:00"},
        "midia": {"duracao": dur, "tem_video": True, "tem_audio": True, "w": 1080, "h": 1920, "rotacao": 0, "fps": 30.0},
        "derivados": {"audio_wav": None, "quadros_chave": []},
        "transcricao": {"provedor": "fixture", "modelo": "t", "idioma": "pt", "vad": False, "segmentos": segs},
        "sinais": {"energia": {"passo": 0.02, "chave": ""}, "tremor": {"passo": 1.0, "media_px": 6.0, "trechos": []},
                   "cenas": [{"t0": 0, "t1": dur, "ambiente": "salao"}], "rostos": [{"t": 2.0, "caixas": [[0.4, 0.2, 0.2, 0.15]]}]},
        "visao": {"provedor": "fixture", "resumo": "Marcos fala no evento", "momentos": [
            {"t0": 14.0, "t1": 20.0, "tipo": "torcida", "desc": "torcida grita", "nota": 4},
            {"t0": 25.0, "t1": 29.0, "tipo": "broll", "desc": "salão vazio", "nota": 2}]},
    }


DIRECAO = {
    "versao": "1", "tipo_video": "evento", "modelo": "evento-reel", "duracao_alvo": 16, "vel_fala": 1.1,
    "conceito": "teste", "alem_do_pedido": [], "gancho": {"texto_tela": ["NÃO É SÓ", "FILMAR."], "troca": {"risca": "FILMAR", "para": "CONTAR"}},
    "blocos": [
        {"id": "B1", "funcao": "gancho", "intensidade": 4, "falas": [
            {"id": "F01.1", "de": "o pessoal da", "ate": "capturando tudo", "corrigir": [{"de": "voando a", "para": "Ruan na"}], "imagem": "falante"}],
         "cobertura": [], "texto_tela": [], "chips": [{"nome": "MARCOS", "funcao": "creat.MTT", "sobre": "F01.1"}], "saida": "whip"},
        {"id": "B2", "funcao": "prova", "intensidade": 5, "falas": [{"id": "F01.2", "de": None, "ate": None, "corrigir": None, "imagem": "misto"}],
         "cobertura": [{"m": "M01.1", "sobre": "F01.2", "dur": 1.0, "efeito": "punch"}, {"m": "M01.1", "sobre": None, "dur": 1.5, "efeito": "lento"}],
         "texto_tela": ["ABA 01"], "chips": [], "saida": "aba71"},
        {"id": "B3", "funcao": "convite", "intensidade": 5, "falas": [{"id": "F01.4", "de": "então sigam", "ate": "create", "corrigir": None, "imagem": "falante"}],
         "cobertura": [], "texto_tela": [], "chips": [], "saida": "corte_batida"},
    ],
    "trilha": {"id": "t_teste", "clima": "energia", "curva": [4, 5, 5], "drop_em": "B2"},
    "fecho": {"cta": "SEGUE A creat.MTT", "apoio": None, "arroba": "@creat.mtt", "logo_cliente": None},
    "riscos": [],
}
TRILHAS = [{"id": "t_teste", "clima": "energia", "bpm": 120.0, "dur": 60.0, "fase": 0.0, "chave": "/tmp/nao_existe.wav"}]


def direcao():
    return copy.deepcopy(DIRECAO)
