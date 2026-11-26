"""Onda 4, item 1 (D40 a D43): o ouvido fino no fluxo, primeiro passo do job `catalogo` (critérios 1.1 a 1.10; o 1.11 é a
medição local do large-v3 real, só com EDITOR_TESTE_MODELO_FINO=1).

O filho é FALSO (um script deste teste no lugar de `motor.etapas.escuta_filho`): a suíte nunca carrega o Whisper grande. Ele
grava num arquivo o que recebeu (dicas, ids, nomes das variáveis de ambiente, pid) e se comporta pelo EDITOR_FALSO_MODO:
ok | modelo (sai 5) | memoria (aloca acima do teto e dorme) | tempo (imprime o 1o arquivo e dorme)."""
from __future__ import annotations

import fcntl
import io
import json
import os
import pathlib
import sys
import time

import numpy as np
import pytest
import soundfile as sf
from b_sintetico import analise

from motor import banco, config
from motor.etapas import escuta as ESC

FALSO = r'''
import json, os, pathlib, subprocess, sys, time
t = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
modo = os.environ.get("EDITOR_FALSO_MODO", "ok")
reg = os.environ.get("EDITOR_FALSO_REGISTRO")
neto = subprocess.Popen(["sleep", "60"]) if modo in ("memoria", "tempo") else None
if reg:
    with open(reg, "a", encoding="utf-8") as f:
        f.write(json.dumps({"pid": os.getpid(), "neto": neto.pid if neto else None, "ids": [a["id"] for a in t["arquivos"]],
                            "oom": open("/proc/self/oom_score_adj").read().strip(), "modo_tarefa": oct(os.stat(sys.argv[1]).st_mode & 0o777),
                            "dicas": [a["dicas"] for a in t["arquivos"]], "env": sorted(os.environ), "modelo": t["modelo"],
                            "beam": t["beam"]}) + "\n")
if modo == "modelo":
    sys.exit(5)
print(json.dumps({"carregado": t["modelo"]}), flush=True)
for k, a in enumerate(t["arquivos"]):
    if modo == "memoria":
        buf = bytearray(400 * 1024 * 1024)
        for i in range(0, len(buf), 4096):
            buf[i] = 1
        time.sleep(60)
    if modo == "tempo" and k == 1:
        time.sleep(60)
    if modo == "lento":
        time.sleep(0.9)
    pal = [[1.0, 1.3, "Bacia", 0.9], [1.3, 1.45, "do", 0.9], [1.45, 1.9, "Jacuípe", 0.9], [2.0, 2.5, "Guerreiro", 0.9]]
    print(json.dumps({"id": a["id"], "segmentos": [{"s": 1.0, "e": 2.5, "texto": "Bacia do Jacuípe Guerreiro", "falante": None,
                      "conf": 0.9, "palavras": pal}], "trechos": 1, "segundos": 0.1}, ensure_ascii=False), flush=True)
'''


@pytest.fixture()
def projeto(tmp_path, dados, monkeypatch):
    """Projeto 'p' com 2 vídeos analisados (com fala) e um pedido com nomes; o filho falso no lugar do de verdade."""
    monkeypatch.setenv("EDITOR_WHISPER_MODELO_FINO", "large-v3")
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES ('p','t','dirigindo',?,?,?)",
                (banco.agora_iso(), banco.agora_iso(), json.dumps({"dicas": ["Sisal"]})))
    for aid in ("a001", "a002"):
        an = analise(aid, f"20261126_2000{aid[-1]}0.mov", projeto="p")
        base = f"derivados/p/{aid}"
        an["derivados"]["audio_wav"] = f"{base}/audio.wav"
        an["sinais"]["energia"] = {"passo": 0.05, "chave": f"{base}/energia.npy", "picos": [], "fala_pct": 0.4}
        x = (0.0005 * np.random.default_rng(1).standard_normal(16000 * 3)).astype(np.float32)
        buf = io.BytesIO()
        sf.write(buf, x, 16000, format="WAV")
        arm.gravar(f"{base}/audio.wav", io.BytesIO(buf.getvalue()))
        b = io.BytesIO()
        np.save(b, np.full(600, -20.0, np.float32))
        arm.gravar(f"{base}/energia.npy", io.BytesIO(b.getvalue()))
        arm.gravar_json(f"{base}/ingest.json", {"assinatura": f"ing-{aid}"})
        arm.gravar_json(f"{base}/analise.json", an)
    arm.gravar_json("projetos/p/pedido.json", {"versao": "1", "projeto": "p", "texto": "Anúncio da Black com o Guerreiro e o Sisal, "
                                               "gravado na Bacia do Jacuípe", "cliente": "super_kal", "vozes": "varias"})
    falso = tmp_path / "filho_falso.py"
    falso.write_text(FALSO, encoding="utf-8")
    registro = tmp_path / "registro.jsonl"
    monkeypatch.setenv("EDITOR_FALSO_REGISTRO", str(registro))
    monkeypatch.setattr(ESC, "comando", lambda tarefa: [sys.executable, str(falso), str(tarefa)])
    from motor.etapas import Contexto
    ctx = Contexto(con=con, cfg=config.carregar(), job={"id": "j1", "etapa": "catalogo", "projeto": "p", "alvo": None}, armazenamento=arm)
    return {"ctx": ctx, "arm": arm, "con": con, "registro": registro, "cfg": cfg}


def _rodar(pr):
    from motor.etapas import catalogo
    pr["ctx"] = pr["ctx"].__class__(con=pr["con"], cfg=config.carregar(), job=pr["ctx"].job, armazenamento=pr["arm"])
    return catalogo.rodar(pr["ctx"])


def _chamadas(pr) -> list[dict]:
    if not pr["registro"].exists():
        return []
    return [json.loads(x) for x in pr["registro"].read_text(encoding="utf-8").splitlines() if x.strip()]


def _modelo(pr, aid="a001"):
    return pr["arm"].ler_json(f"derivados/p/{aid}/analise.json")["transcricao"]["modelo"]


def _achados(pr, chave="catalogo.escuta") -> list[dict]:
    out = []
    for r in pr["con"].execute("SELECT dados FROM eventos WHERE tipo='passo'"):
        d = json.loads(r["dados"])
        if d.get("chave") == chave:
            out.append(d)
    return out


def _com_mesa(pr, fn):
    from motor.etapas import passos
    passos.abrir_raiz(pr["con"], {"projeto": "p", "etapa": "catalogo", "alvo": None})
    try:
        return fn()
    finally:
        passos.fechar_raiz()
        passos.soltar()


# ------------------------------------------------------------------ 1.1
def test_1_1_nomes_do_pedido_viram_dicas_e_a_transcricao_fina_entra(projeto):
    r = _rodar(projeto)
    ch = _chamadas(projeto)
    assert len(ch) == 1 and ch[0]["ids"] == ["a001", "a002"] and ch[0]["beam"] == 5
    dicas = ch[0]["dicas"][0]
    for nome in ("Bacia do Jacuípe", "Guerreiro", "Sisal", "Super Kal"):
        assert nome in dicas, dicas
    assert dicas.index("Guerreiro") < dicas.index("creat.MTT")               # pedido primeiro, a casa depois
    assert _modelo(projeto).endswith("+trechos") and _modelo(projeto, "a002") == "large-v3+trechos"
    fina = projeto["arm"].ler_json("derivados/p/a001/transcricao_fina.json")
    assert fina["modelo"] == "large-v3" and fina["transcricao"]["segmentos"][0]["texto"].startswith("Bacia do Jacuípe")
    cat = projeto["arm"].ler_json("projetos/p/catalogo.json")
    assert any("Jacuípe" in f["texto"] for c in cat["clipes"] for f in c["falas"]) and r["clipes"] == 2


def test_1_1_dicas_sem_repeticao_e_com_teto():
    d = ESC.dicas_do_pedido({"texto": "Quero o Guerreiro, o GUERREIRO e a Bacia do Jacuípe. Fazer com Sisal", "obrigatorio": ["Guerreiro"],
                             "cliente": "Super Kal"}, ["Sisal", "Amstel Ultra"], [{"para": "creat"}, {"para": "creat"}, {"para": "Black Friday"}])
    assert d[:4] == ["Guerreiro", "Bacia do Jacuípe", "Sisal", "Super Kal"], d
    assert "Quero" not in d and "Fazer" not in d and sum(1 for x in d if x.lower() == "creat") == 1 and "Black Friday" in d
    muitas = ESC.dicas_do_pedido({"texto": " ".join(f"Nome{k}" for k in range(80))})
    assert len(muitas) <= ESC.MAX_DICAS and len(ESC.prompt(muitas)) <= ESC.MAX_PROMPT + 1


# ------------------------------------------------------------------ 1.2
def test_1_2_modelo_que_nao_baixa_cai_na_transcricao_rapida(projeto, monkeypatch):
    monkeypatch.setenv("EDITOR_FALSO_MODO", "modelo")
    antes = projeto["arm"].ler_json("derivados/p/a001/analise.json")
    r = _com_mesa(projeto, lambda: _rodar(projeto))
    assert projeto["arm"].ler_json("derivados/p/a001/analise.json") == antes
    assert r["clipes"] == 2 and projeto["arm"].existe("projetos/p/catalogo.txt")
    estado = projeto["con"].execute("SELECT estado FROM projetos WHERE id='p'").fetchone()["estado"]
    assert estado == "dirigindo"
    fim = [a for a in _achados(projeto) if a["fase"] == "fim"]
    assert fim and "o modelo não baixou" in fim[0]["achado"] and "segui com a transcrição rápida" in fim[0]["achado"]


# ------------------------------------------------------------------ 1.3
def _morto(pid) -> bool:
    try:
        st = pathlib.Path(f"/proc/{pid}/stat").read_text()
    except OSError:
        return True
    return st[st.rindex(")") + 2] == "Z"


def test_1_3_filho_que_estoura_a_memoria_morre_rapido_e_leva_o_grupo(projeto, monkeypatch):
    monkeypatch.setenv("EDITOR_FALSO_MODO", "memoria")
    monkeypatch.setenv("EDITOR_ESCUTA_LIMITE_MB", "150")
    antes = projeto["arm"].ler_json("derivados/p/a001/analise.json")
    t0 = time.monotonic()
    r = _com_mesa(projeto, lambda: _rodar(projeto))
    dur = time.monotonic() - t0
    assert dur < 12, dur                                       # sem a vigia, o falso dormiria 60 s
    ch = _chamadas(projeto)[0]
    assert _morto(ch["pid"]) and _morto(ch["neto"])            # python e o processo que ele abriu: o grupo inteiro
    assert projeto["arm"].ler_json("derivados/p/a001/analise.json") == antes and r["clipes"] == 2
    fim = [a for a in _achados(projeto) if a["fase"] == "fim"][0]
    assert "memória do servidor" in fim["achado"] and fim["numeros"]["pico_mb"] > 150


def test_1_3_a_vigia_mata_em_ate_dois_segundos(projeto, monkeypatch, tmp_path):
    monkeypatch.setenv("EDITOR_FALSO_MODO", "memoria")
    monkeypatch.setenv("EDITOR_ESCUTA_LIMITE_MB", "150")
    t0 = time.monotonic()
    r = ESC.rodar_filho({"modelo": "x", "threads": 1, "beam": 5, "pausa": 0.6, "arquivos": [{"id": "a001", "dicas": None}]},
                        projeto["cfg"].dados, 60.0, lambda linha: None)
    assert r["motivo"] == "memoria" and r["s"] <= 2.0 + 1.0, r       # tempo do falso alocar (~0,5 s) + a vigia (<= 2 s)
    assert time.monotonic() - t0 < 6


# ------------------------------------------------------------------ 1.4
def test_1_4_tempo_estourado_guarda_o_que_ja_chegou(projeto, monkeypatch):
    monkeypatch.setenv("EDITOR_FALSO_MODO", "tempo")
    monkeypatch.setenv("EDITOR_ESCUTA_TEMPO_S", "2")
    r = _com_mesa(projeto, lambda: _rodar(projeto))
    assert _modelo(projeto, "a001") == "large-v3+trechos"           # impresso antes de o tempo acabar: fica fino
    assert _modelo(projeto, "a002") == "t"                          # o outro fica com a transcrição rápida
    ch = _chamadas(projeto)[0]
    assert _morto(ch["pid"]) and _morto(ch["neto"]) and r["clipes"] == 2
    fim = [a for a in _achados(projeto) if a["fase"] == "fim"][0]
    assert "passou do tempo" in fim["achado"] and "1 de 2 vídeos" in fim["achado"]


# ------------------------------------------------------------------ 1.5 e 1.6
def test_1_5_segunda_rodada_nao_chama_o_filho(projeto):
    _rodar(projeto)
    r2 = _rodar(projeto)
    assert len(_chamadas(projeto)) == 1 and r2.get("reaproveitado") is True
    assert _modelo(projeto) == "large-v3+trechos"


def test_1_6_refazer_a_leitura_reaplica_do_cache(projeto):
    _rodar(projeto)
    arm = projeto["arm"]
    an = arm.ler_json("derivados/p/a001/analise.json")
    an["transcricao"] = analise("a001", projeto="p")["transcricao"]        # a análise refeita volta com a transcrição rápida
    arm.gravar_json("derivados/p/a001/analise.json", an)
    assert _modelo(projeto) == "t"
    _rodar(projeto)
    assert len(_chamadas(projeto)) == 1 and _modelo(projeto) == "large-v3+trechos"


def test_1_6_pedido_novo_com_outro_nome_ouve_de_novo(projeto):
    _rodar(projeto)
    ped = projeto["arm"].ler_json("projetos/p/pedido.json")
    ped["texto"] += " e a Vinheta Nova"
    projeto["arm"].gravar_json("projetos/p/pedido.json", ped)
    _rodar(projeto)
    ch = _chamadas(projeto)
    assert len(ch) == 2 and "Vinheta Nova" in ch[1]["dicas"][0]


# ------------------------------------------------------------------ 1.7
def test_1_7_desligado_nao_abre_filho(projeto, monkeypatch):
    monkeypatch.setenv("EDITOR_WHISPER_MODELO_FINO", "0")
    antes = projeto["arm"].ler_json("derivados/p/a001/analise.json")
    _com_mesa(projeto, lambda: _rodar(projeto))
    assert _chamadas(projeto) == [] and _achados(projeto) == []
    assert projeto["arm"].ler_json("derivados/p/a001/analise.json") == antes


def test_1_7_video_sem_fala_nao_vai_ao_filho(projeto):
    arm = projeto["arm"]
    an = arm.ler_json("derivados/p/a002/analise.json")
    an["transcricao"]["segmentos"] = []
    an["sinais"]["energia"]["fala_pct"] = 0.0
    arm.gravar_json("derivados/p/a002/analise.json", an)
    _rodar(projeto)
    assert _chamadas(projeto)[0]["ids"] == ["a001"]


# ------------------------------------------------------------------ 1.8
def test_1_8_trava_presa_espera_e_cai_sem_erro(projeto, monkeypatch):
    monkeypatch.setenv("EDITOR_ESCUTA_TEMPO_S", "1")
    trava = pathlib.Path(projeto["cfg"].dados) / "tmp" / "escuta.lock"
    trava.parent.mkdir(parents=True, exist_ok=True)
    with open(trava, "a+") as fd:
        fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)       # outro projeto ouvindo
        t0 = time.monotonic()
        r = _com_mesa(projeto, lambda: _rodar(projeto))
        assert 0.9 <= time.monotonic() - t0 < 8
    assert _chamadas(projeto) == [] and r["clipes"] == 2 and _modelo(projeto) == "t"
    fim = [a for a in _achados(projeto) if a["fase"] == "fim"][0]
    assert "outro projeto está usando" in fim["achado"]


# ------------------------------------------------------------------ 1.9
def test_1_9_filho_nao_ve_segredo(projeto, monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "MOTOR_TOKEN", "EDITOR_SENHA", "EDITOR_ALGUM_TOKEN", "R2_SECRET_ACCESS_KEY", "DATABASE_URL"):
        monkeypatch.setenv(k, "nao-pode-vazar")
    _rodar(projeto)
    env = set(_chamadas(projeto)[0]["env"])
    assert not env & {"ANTHROPIC_API_KEY", "MOTOR_TOKEN", "EDITOR_SENHA", "EDITOR_ALGUM_TOKEN", "R2_SECRET_ACCESS_KEY", "DATABASE_URL"}, env
    amb = ESC.ambiente(3)
    assert amb["OMP_NUM_THREADS"] == "3" and not any(x in k.upper() for k in amb for x in ("KEY", "TOKEN", "SECRET", "SENHA"))


# ------------------------------------------------------------------ 1.10
def test_1_10_mesa_mostra_o_passo_com_o_radar(projeto):
    _com_mesa(projeto, lambda: _rodar(projeto))
    ini = [a for a in _achados(projeto) if a["fase"] == "inicio"]
    fim = [a for a in _achados(projeto) if a["fase"] == "fim"]
    assert ini and ini[0]["numeros"]["videos"] == 2
    assert fim and fim[0]["numeros"]["falas"] == 2 and fim[0]["achado"].startswith("Ouviu de novo 2 vídeos com o large-v3: 2 falas")
    eq = json.loads((config.SCHEMAS / "equipe.json").read_text(encoding="utf-8"))
    linha = next(p for p in eq["passos"] if p["chave"] == "catalogo.escuta")
    assert linha["agente"] == "Radar" and "{videos}" in linha["rodando"] and "{falas}" in linha["feito"]
    for chave in ("montagem.cortes", "montagem.sincronia"):
        assert any(p["chave"] == chave and p["agente"] == "Eco" for p in eq["passos"]), chave
    assert (config.RAIZ_REPO / "apps/web/lib/equipe.json").read_bytes() == (config.SCHEMAS / "equipe.json").read_bytes()


def test_queda_por_codigo_de_erro_mantem_os_que_chegaram():
    assert "falhou" in ESC.QUEDAS["erro"] and "não está instalado" in ESC.QUEDAS["sem_whisper"]


def test_limiar_desce_em_arquivo_baixo():
    assert ESC.limiar_de(np.full(100, -20.0)) == -38.0
    assert ESC.limiar_de(np.full(100, -40.0)) == -58.0


# ------------------------------------------------------------------ 1.11 (local, sem custo, fora do CI)
@pytest.mark.skipif(os.environ.get("EDITOR_TESTE_MODELO_FINO") != "1", reason="medição local do large-v3 real (EDITOR_TESTE_MODELO_FINO=1)")
def test_1_11_medicao_do_modelo_grande(tmp_path, dados, monkeypatch):
    """60 s com fala (EDITOR_TESTE_AUDIO=<wav> ou um sintético): pico de memória residente e segundos, para o relatório."""
    monkeypatch.setenv("EDITOR_WHISPER_MODELO_FINO", os.environ.get("EDITOR_TESTE_MODELO", "large-v3"))
    monkeypatch.setenv("EDITOR_ESCUTA_LIMITE_MB", "0")
    from motor.etapas.analise import energia
    wav = os.environ.get("EDITOR_TESTE_AUDIO")
    assert wav, "defina EDITOR_TESTE_AUDIO com um wav de ~60 s com fala"
    db = energia(pathlib.Path(wav))
    np.save(tmp_path / "energia.npy", db)
    dur = float(sf.info(wav).duration)
    linhas = []
    tarefa = {"modelo": ESC.modelo_fino(), "threads": ESC.threads(), "beam": ESC.beam(), "pausa": ESC.PAUSA_S,
              "arquivos": [{"id": "x", "wav": wav, "energia": str(tmp_path / "energia.npy"), "dur": dur, "limiar": ESC.limiar_de(db),
                            "dicas": ESC.prompt(["Super Kal", "Guerreiro", "Sisal", "Bacia do Jacuípe"])}]}
    r = ESC.rodar_filho(tarefa, config.carregar().dados, 1800.0, linhas.append)
    texto = " ".join(s["texto"] for s in (linhas[-1].get("segmentos") or [])) if linhas else ""
    print(json.dumps({"modelo": tarefa["modelo"], "audio_s": round(dur, 1), "pico_mb": r["pico_mb"], "s": r["s"], "threads": tarefa["threads"],
                      "falas": len(linhas[-1].get("segmentos") or []) if linhas else 0, "texto": texto[:300]}, ensure_ascii=False))
    assert r["motivo"] is None, r
    # a razão do item 1: acertar os nomes do caso real. Com o áudio do Black, EDITOR_TESTE_NOMES="Guerreiro,Sisal,Bacia do Jacuípe"
    # compara turbo e large-v3 (EDITOR_TESTE_MODELO); sem a variável, só mede memória e tempo
    nomes = [n.strip() for n in os.environ.get("EDITOR_TESTE_NOMES", "").split(",") if n.strip()]
    faltam = [n for n in nomes if n.lower() not in texto.lower()]
    assert not faltam, f"{tarefa['modelo']} não acertou {faltam}: {texto[:300]}"


def test_1_11_padrao_segue_o_criterio_de_memoria_e_large_v3_e_a_alavanca(monkeypatch):
    """Critério do plano (1.11): pico do large-v3 acima de 4 GB -> o padrão passa a turbo. Medido em 26/11: 4.322 MB e 81,5 s
    contra 2.131 MB e 24,6 s por 60 s de fala. ATENÇÃO: isto prova só a regra de memória e a alavanca; que o turbo acerta os
    nomes do caso real (Guerreiro, Sisal, Bacia do Jacuípe) NÃO está provado aqui (ver test_1_11_medicao_do_modelo_grande com
    EDITOR_TESTE_NOMES e o áudio do Black)."""
    monkeypatch.delenv("EDITOR_WHISPER_MODELO_FINO", raising=False)
    assert ESC.modelo_fino() == ESC.MODELO_PADRAO == config.Config().whisper_modelo_fino == "turbo"
    monkeypatch.setenv("EDITOR_WHISPER_MODELO_FINO", "large-v3")                     # a alavanca: um env, sem deploy de código
    assert ESC.modelo_fino() == "large-v3" and config.Config().whisper_modelo_fino == "large-v3"
    monkeypatch.setenv("EDITOR_WHISPER_MODELO_FINO", "0")
    assert ESC.modelo_fino() == "" and ESC.modelo_fino(config.Config()) == ""


# ------------------------------------------------------------------ revisão tripla: A6 (batimento) e S6 (tarefa 0600, sem preexec_fn)
def test_batimento_repete_a_ultima_frase_e_a_barra_anda(projeto, monkeypatch):
    """O batimento que renova o lease emitia etapa_progresso com mensagem None a cada 10 s e o site trocava "Ouvindo de novo
    o vídeo 1 de 2" por nada, com a barra parada em 10%. Agora repete a última frase e a fração."""
    monkeypatch.setenv("EDITOR_FALSO_MODO", "lento")
    monkeypatch.setattr(ESC, "BATIMENTO_S", 0.2)
    _com_mesa(projeto, lambda: _rodar(projeto))
    evs = [dict(r) for r in projeto["con"].execute("SELECT progresso, mensagem FROM eventos WHERE tipo='etapa_progresso' ORDER BY id")]
    assert len(evs) >= 4, evs                                        # houve batimento (o falso leva ~2 s)
    assert all(e["mensagem"] for e in evs), [e["mensagem"] for e in evs]
    msgs = [e["mensagem"] for e in evs]
    assert "Ouvindo de novo o vídeo 1 de 2" in msgs and "Ouvindo de novo o vídeo 2 de 2" in msgs
    i1 = msgs.index("Ouvindo de novo o vídeo 1 de 2")
    depois = [e["progresso"] for e in evs[i1:] if e["mensagem"].startswith("Ouvindo de novo o vídeo")]
    assert depois == sorted(depois) and max(depois) > 0.1, depois  # a barra anda conforme os vídeos chegam


def test_filho_nasce_com_oom_1000_e_a_tarefa_so_do_dono(projeto):
    _com_mesa(projeto, lambda: _rodar(projeto))
    ch = _chamadas(projeto)[0]
    assert ch["modo_tarefa"] == "0o600", ch["modo_tarefa"]
    assert ch["oom"] in ("1000", "0"), ch["oom"]                    # 0 só onde o /proc não deixa escrever (fora de Linux)
    import inspect
    assert "preexec_fn" not in inspect.getsource(ESC.rodar_filho)  # fork de processo com threads não roda código Python
