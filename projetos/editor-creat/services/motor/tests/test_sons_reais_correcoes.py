"""M6, rodada de correção das revisões: um teste por bug corrigido. Servidor HTTP LOCAL e áudio sintético; nenhum teste
sai para a internet (a fixture `sem_internet` do `banco` recusa socket fora do loopback)."""
import copy
import json
import os
import shutil
import struct
import time
import types

import numpy as np
import pytest
from b_sons_reais import TranscritorFalso, banco, batida, item_de, ruido_rosa, sem_internet, wav_bytes  # noqa: F401 - fixtures
from test_sons_reais_resolvedor import AGUA, _com, _resolver, base  # noqa: F401 - fixture

import motor.sons_reais as SR
from motor.etapas import sons_reais as ESONS
from motor.etapas.montagem import mix as MIX
from motor.etapas.montagem import reais as REAIS
from motor.sons_reais import baixar as BX
from motor.sons_reais import indice as IX

A = 48000


@pytest.fixture()
def cfg(banco):
    return types.SimpleNamespace(dados=str(banco["dados"]), transcricao="faster-whisper")


@pytest.fixture()
def ouvido(monkeypatch):
    t = TranscritorFalso()
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: t)
    return t


def _db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.asarray(x, np.float64) ** 2)) + 1e-12)


# ---------------------------------------------------------------- revisão 1: o stem `reais` não é servido (licença)
def test_stem_reais_nunca_e_servido_nem_com_a_versao_entregue(dados, tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from motor import banco as BANCO
    from motor import config
    from motor.api.app import criar
    destino = tmp_path / "memoria"
    shutil.copytree(config.MEMORIA, destino)
    monkeypatch.setenv("EDITOR_MEMORIA", str(destino))
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    con = BANCO.conectar(config.carregar().banco)
    t = BANCO.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES (?,?,?,?,?)", ("p1", "t", t, t, json.dumps({})))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','entregue',?)", (t,))
    stems = dados / "armazenamento" / "saidas" / "p1" / "v1" / "stems"
    stems.mkdir(parents=True)
    (stems / "reais.flac").write_bytes(b"fLaC" + b"\0" * 64)          # sobra de uma montagem antiga
    (stems / "voz.flac").write_bytes(b"fLaC" + b"\0" * 64)
    cli = TestClient(criar())
    assert cli.get("/v1/arquivos/saidas/p1/v1/stems/voz.flac").status_code == 200         # entregue: a obra sai
    assert cli.get("/v1/arquivos/saidas/p1/v1/stems/reais.flac").status_code == 403       # o som do banco solto, nunca
    assert cli.head("/v1/arquivos/saidas/p1/v1/stems/reais.flac").status_code == 403


# ---------------------------------------------------------------- revisão 2: som direto -6 dB só onde o ambiente entrou
class _FontesFalsas:
    def audio(self, f):
        return "fonte"

    def offset(self, f):
        return 0.0


def _edl_direto(itens=()):
    return {"duracao": 5.0, "trilha": {"ganho_db": -14}, "master": {"lufs": -14, "tp": -1.0}, "sfx": [], "fontes": {}, "tom_sala": None,
            "planos": [{"id": "P1", "fonte": "a", "s0": 0.0, "t0": 0.0, "t1": 4.0, "som_direto_db": -12}], "sons_reais": list(itens)}


def test_som_direto_so_desce_onde_o_ambiente_real_de_fato_entrou(monkeypatch, tmp_path):
    monkeypatch.setattr(MIX, "ler_audio", lambda arq, s0, dur, cfg=None: np.full(int(round(dur * A)), 0.1, np.float32))
    edl = _edl_direto()
    N = 5 * A
    sem = MIX.som_direto(edl, _FontesFalsas(), N)
    com = MIX.som_direto(edl, _FontesFalsas(), N, ambiente_em=[(0.0, 4.0)])
    pouco = MIX.som_direto(edl, _FontesFalsas(), N, ambiente_em=[(3.5, 5.0)])           # cobre 12%: não mexe
    meio = slice(A, 3 * A)
    assert _db(sem[meio]) - _db(com[meio]) == pytest.approx(6.0, abs=0.01) and np.array_equal(pouco, sem)
    # o ambiente pedido não carregou (quase mudo): a pista não tem ambiente e o som direto fica como era
    it = {"id": "R01", "papel": "ambiente", "desc": "x", "t0": 0.0, "t1": 4.0, "ganho_db": -28.0, "fade": [1.2, 1.5]}
    pista, rel = REAIS.pista(edl, [{"item": it, "audio": ruido_rosa(A * 5, 3) * 1e-5, "id_banco": 1}], N)
    assert pista["ambiente_em"] == [] and rel["descartados"][0]["id"] == "R01"
    z = np.zeros((N, 2), np.float32)
    r = MIX.mixar(edl, np.zeros(N, np.float32), z, z, _FontesFalsas(), tmp_path / "a", reais=pista)
    assert r["direto_sob_real"] == []
    pista, _ = REAIS.pista(edl, [{"item": it, "audio": ruido_rosa(A * 5, 3), "id_banco": 1}], N)
    r = MIX.mixar(edl, np.zeros(N, np.float32), z, z, _FontesFalsas(), tmp_path / "b", reais=pista)
    assert r["direto_sob_real"] == ["P1"]


# ---------------------------------------------------------------- revisão 3: ganho com teto, quase mudo fica de fora
def test_ganho_tem_teto_e_o_quase_mudo_fica_de_fora():
    N = 10 * A
    it = {"id": "R01", "papel": "ambiente", "desc": "x", "t0": 0.0, "t1": 10.0, "ganho_db": -28.0, "fade": [1.2, 1.5]}
    x = ruido_rosa(A * 12, 21)
    base_lufs = REAIS.lufs(REAIS._hpf(x[:N], *REAIS.HPF_AMBIENTE))
    baixo = x * np.float32(10 ** ((-59.0 - base_lufs) / 20))                             # precisaria de +31 dB
    pista, rel = REAIS.pista({}, [{"item": it, "audio": baixo, "id_banco": 1}], N)
    assert rel["sons"][0]["ganho_db"] == pytest.approx(30.0) and _db(pista["ambiente"]) < -25
    for mudo in (x * 1e-6, np.zeros_like(x)):                                            # pausa de gravação / silêncio digital
        pista, rel = REAIS.pista({}, [{"item": it, "audio": mudo, "id_banco": 1}], N)
        assert rel["sons"] == [] and "quase mudo" in rel["descartados"][0]["motivo"] and np.abs(pista["ambiente"]).max() == 0
    pon = {"id": "R02", "papel": "pontual", "desc": "x", "t0": 2.0, "t1": 4.0, "ganho_db": -10.0, "fade": [0.005, 0.03]}
    pista, rel = REAIS.pista({}, [{"item": pon, "audio": np.repeat(batida(2.0, 0.6) * 1e-4, 2, 1), "id_banco": 2}], N)
    assert rel["sons"] == [] and "pancada" in rel["descartados"][0]["motivo"] and np.abs(pista["pontual"]).max() == 0


def test_ambiente_quase_mudo_no_download_da_vez_a_reserva(banco, cfg, ouvido):
    con = IX.abrir(None)
    url, wav, x, sr, caminho = banco["audio"][(101, "wav")]
    quieto = wav_bytes(x * 1e-3, sr)
    assert len(quieto) == len(wav)
    banco["srv"].arquivos[caminho] = quieto
    rel = SR.preparar({"sons_reais": [item_de(con, [101, 102])]}, cfg)
    assert [x["id_banco"] for x in rel["itens"]] == [102] and rel["pendentes"] == 0
    assert any("reserva" in a for a in rel["avisos"]) and not list(SR.pasta_cache(cfg).glob("101_*.flac"))


# ---------------------------------------------------------------- revisão 4: cabeçalho grande, canais, falha permanente
def _wav_bwf(x16: np.ndarray, canais: int, antes_fmt: int, depois_fmt: int) -> bytes:
    """WAV com chunks grandes (bext antes do fmt, iXML depois): o fmt e o data ficam além dos primeiros 64 KB."""
    fmt = struct.pack("<HHIIHH", 1, canais, A, A * 2 * canais, 2 * canais, 16)
    pcm = x16.astype("<i2").tobytes()

    def chunk(cid, corpo):
        return cid + struct.pack("<I", len(corpo)) + corpo + (b"\0" if len(corpo) & 1 else b"")
    corpo = b"WAVE" + chunk(b"bext", b"\1" * antes_fmt) + chunk(b"fmt ", fmt) + chunk(b"iXML", b"<x/>" * (depois_fmt // 4) + b"z") \
        + chunk(b"data", pcm)
    return b"RIFF" + struct.pack("<I", len(corpo)) + corpo


def test_cabecalho_alem_dos_64_kb_segue_a_lista_de_chunks(banco, cfg):
    import io

    import soundfile as sf
    x16 = (np.random.default_rng(4).standard_normal((3 * A, 2)) * 3000).astype(np.int16)
    arq = _wav_bwf(x16, 2, 200_000, 150_000)
    banco["srv"].arquivos["/download/fake-gdc-2024/bwf.wav"] = arq
    s = BX.Sessao(SR.pasta_cache(cfg))
    dados, info = BX.trecho_wav(s, banco["srv"].url("/download/fake-gdc-2024/bwf.wav"), 1.0, 1.0, tam_indice=len(arq))
    y, sr2 = sf.read(io.BytesIO(dados), dtype="int16")
    assert sr2 == A and np.array_equal(y, x16[A:2 * A]) and info["canais"] == 2
    assert banco["srv"].contar("/download/fake-gdc-2024/bwf.wav") == 4                     # 64 KB + 2 saltos de chunk + o pedaço
    assert info["bytes"] == s.bytes < 3 * 65536 + A * 4 + 1


def test_mais_de_2_canais_e_recusado_antes_de_baixar_o_pedaco(banco, cfg):
    x16 = (np.random.default_rng(5).standard_normal((2 * A, 4)) * 3000).astype(np.int16)
    arq = _wav_bwf(x16, 4, 10, 10)
    banco["srv"].arquivos["/download/fake-gdc-2024/quad.wav"] = arq
    s = BX.Sessao(SR.pasta_cache(cfg))
    with pytest.raises(BX.Indisponivel) as e:
        BX.trecho_wav(s, banco["srv"].url("/download/fake-gdc-2024/quad.wav"), 0.0, 1.5)
    assert "4 canais" in e.value.motivo and e.value.pendente is False
    assert banco["srv"].contar("/download/fake-gdc-2024/quad.wav") == 1 and s.bytes == 65536   # só o cabeçalho


def test_falha_que_depende_do_arquivo_nao_fica_pendente(banco, cfg):
    url, wav, *_ = banco["audio"][(101, "wav")]
    s = BX.Sessao(SR.pasta_cache(cfg))
    with pytest.raises(BX.Indisponivel) as e:                                              # tamanho diferente do índice
        BX.trecho_wav(s, url, 1.0, 1.0, tam_indice=len(wav) + 1)
    assert e.value.pendente is False
    banco["srv"].arquivos["/download/fake-gdc-2024/lixo.wav"] = b"\x00" * 200_000
    with pytest.raises(BX.Indisponivel) as e:                                              # não é WAV
        BX.trecho_wav(s, banco["srv"].url("/download/fake-gdc-2024/lixo.wav"), 1.0, 1.0)
    assert e.value.pendente is False and "cabeçalho inválido" in e.value.motivo
    s2 = BX.Sessao(SR.pasta_cache(cfg), teto_bytes=100_000)
    s2.bytes = 90_000                                                                      # outros sons gastaram o teto
    with pytest.raises(BX.Indisponivel) as e:
        BX.trecho_wav(s2, url, 1.0, 1.0)
    assert e.value.pendente is True                                                        # sozinho caberia: pendente


# ---------------------------------------------------------------- revisão 5: a transcrição não come o tempo de rede
def test_orcamento_de_rede_nao_conta_a_transcricao(banco, cfg):
    con = IX.abrir(None)
    t = {"t": 0.0}

    class Lento(TranscritorFalso):
        def transcrever(self, wav, **k):
            t["t"] += 300.0                                                                # faster-whisper em CPU, devagar
            return super().transcrever(wav, **k)
    s = BX.Sessao(SR.pasta_cache(cfg), teto_s=240.0, relogio=lambda: t["t"])
    itens = [item_de(con, [101]), item_de(con, [110], rid="R02", desc="floresta", t0=14, t1=24)]
    rel = SR.preparar({"sons_reais": itens}, cfg, transcritor=Lento(), sessao=s)
    assert [x["id_banco"] for x in rel["itens"]] == [101, 110] and rel["pendentes"] == 0 and t["t"] == 600.0
    assert s.resta_s() == pytest.approx(240.0)


# ---------------------------------------------------------------- revisão 6: depois do bloqueio, o cache continua valendo
def test_depois_do_403_o_som_do_cache_ainda_entra(banco, cfg, ouvido):
    con = IX.abrir(None)
    a = item_de(con, [101])
    SR.preparar({"sons_reais": [a]}, cfg)
    b = item_de(con, [110], rid="R02", desc="floresta", t0=14, t1=24)
    banco["srv"].modo["*"] = "403"
    n = banco["srv"].contar()
    rel = SR.preparar({"sons_reais": [b, a]}, cfg)
    assert [x["id"] for x in rel["itens"]] == ["R01"] and rel["itens"][0]["origem"] == "cache"
    assert [f["id"] for f in rel["faltaram"]] == ["R02"] and rel["pendentes"] == 1 and banco["srv"].contar() == n + 1


# ---------------------------------------------------------------- revisão 7: QA condena só o culpado
def _qa_com_cache(banco, cfg, tmp_path, stem=True):
    import soundfile as sf

    from motor.etapas import qa as QA
    con = IX.abrir(None)
    itens = [item_de(con, [101]), item_de(con, [110], rid="R02", desc="floresta", t0=14, t1=24)]
    rel = SR.preparar({"sons_reais": itens}, cfg, transcritor=TranscritorFalso())
    assert len(rel["itens"]) == 2
    stems = {}
    if stem:
        p = tmp_path / "stem_reais.flac"
        sf.write(str(p), ruido_rosa(A * 3, 31) * 0.1, A, subtype="PCM_24")
        stems["reais"] = p
    return QA, QA.Conferencia(tmp_path / "final.mp4", {"sons_reais": itens}, cfg, stems=stems, evidencias=tmp_path / "qa",
                              montagem={"sons_reais": {"itens": rel["itens"], "faltaram": [], "licenca": SR.LICENCA}})


def test_qa_com_voz_no_stem_condena_so_o_som_que_tem_a_voz(banco, cfg, tmp_path, monkeypatch):
    QA, c = _qa_com_cache(banco, cfg, tmp_path)
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: TranscritorFalso(com_voz={"stem", 110}))
    r = QA._rodar("sons_reais", c)
    assert r["ok"] is False and r["bloqueia"] and r["valor"]["com_voz"] == [110] and "#110" in r["detalhe"]
    assert SR.ler_com_voz(SR.pasta_cache(cfg)) == {110}                                    # o 101 continua valendo


def test_qa_stem_com_palavras_mas_nenhum_som_com_voz_e_alucinacao(banco, cfg, tmp_path, monkeypatch):
    QA, c = _qa_com_cache(banco, cfg, tmp_path)
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: TranscritorFalso(com_voz={"stem"}))
    r = QA._rodar("sons_reais", c)
    assert r["ok"] is True and "alucinação" in r["detalhe"] and SR.ler_com_voz(SR.pasta_cache(cfg)) == set()

    class Incerto(TranscritorFalso):                                                       # confiança 0,5: o QA não conta
        def transcrever(self, wav, **k):
            ws = [[0.1 * i, 0.1 * i + 0.08, w, 0.5] for i, w in enumerate(["olha", "aqui", "o", "riacho"])]
            return {"segmentos": [{"s": 0.0, "e": 0.4, "texto": "olha aqui o riacho", "palavras": ws}]}
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: Incerto())
    r = QA._rodar("sons_reais", c)
    assert r["ok"] is True and r["valor"]["palavras"] == 0


def test_qa_sem_o_stem_confere_cada_som_do_cache(banco, cfg, tmp_path, monkeypatch):
    QA, c = _qa_com_cache(banco, cfg, tmp_path, stem=False)
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: TranscritorFalso())
    assert QA._rodar("sons_reais", c)["ok"] is True
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: TranscritorFalso(com_voz={101}))
    r = QA._rodar("sons_reais", c)
    assert r["ok"] is False and r["valor"]["com_voz"] == [101]


# ---------------------------------------------------------------- revisão 8: erro inesperado não derruba EDL nem áudio
def test_erro_inesperado_no_resolvedor_de_sons_vira_aviso(base, monkeypatch):
    import validar

    def quebra(*a, **k):
        raise PermissionError("sem acesso ao cache")
    monkeypatch.setattr(ESONS, "resolver", quebra)
    edl = _resolver(base, _com({"B2": [AGUA]}))
    assert edl["sons_reais"] == [] and validar.erros("edl", edl) == []
    assert any("sons reais: falha inesperada (PermissionError" in a for a in edl["origem"]["avisos"])
    assert edl["origem"]["sons_reais"]["sem_som"][0]["desc"] == AGUA["desc"]


def test_indice_ilegivel_por_disco_vira_indisponivel(banco, monkeypatch):
    def quebra(p):
        raise PermissionError("sem permissão")
    monkeypatch.setattr(IX, "_sha256", quebra)
    with pytest.raises(IX.IndiceIndisponivel):
        IX.abrir(None)


def test_pista_que_quebra_ou_som_que_some_do_cache_fica_pendente(banco, monkeypatch, tmp_path):
    """A preparação deixou o som pronto, mas a pista quebrou (ou o arquivo sumiu do cache antes da mixagem): o filme sai,
    e a montagem NÃO é reaproveitada (senão ficaria sem o som para sempre)."""
    import test_sem_fala as TSF

    from motor import config
    from motor.etapas import montagem
    from motor.etapas.montagem import overlay as OV
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    from test_sons_reais_mix import _ctx
    monkeypatch.setattr(OV, "renderizar", lambda *a, **k: {"dir": None, "stats": {}})
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: TranscritorFalso())
    monkeypatch.setenv("EDITOR_FATOS", "0")
    mat = {"pasta": tmp_path, "an": [TSF._analise(c, str(TSF._clipe(tmp_path, c))) for c in TSF.CORES], "cat": TSF._catalogo(),
           "trilha": TSF._trilha_wav(tmp_path / "trilha.wav")}
    d = copy.deepcopy(TSF.DIRECAO)
    d["blocos"][2]["sons"] = [{"desc": "floresta de manhã", "busca": "forest morning birds", "papel": "ambiente"}]
    edl = TSF._resolver(mat, d)
    edl["formato"] = {"w": 180, "h": 320, "fps": 30}
    cfg = config.carregar()
    arm = ArmazenamentoLocal(cfg)
    arm.gravar_json("saidas/p_sf/v1/edl.json", edl)
    ctx = _ctx(cfg, arm)

    def quebra(*a, **k):
        raise FloatingPointError("conta da pista")
    with monkeypatch.context() as m:
        m.setattr(REAIS, "pista", quebra)
        montagem.etapa_montagem(ctx)
    sr = arm.ler_json("saidas/p_sf/v1/montagem.json")["sons_reais"]
    assert sr["itens"] == [] and sr["pendentes"] == 1 and "a pista quebrou" in sr["faltaram"][0]["motivo"]
    with monkeypatch.context() as m:
        m.setattr(SR, "carregar", lambda edl, cfg: [])                                     # outro filme limpou o cache no meio
        r = montagem.etapa_montagem(ctx)
    sr = arm.ler_json("saidas/p_sf/v1/montagem.json")["sons_reais"]
    assert not r.get("reaproveitada") and sr["pendentes"] == 1 and "sumiu do cache" in sr["faltaram"][0]["motivo"]
    r = montagem.etapa_montagem(ctx)
    mont = arm.ler_json("saidas/p_sf/v1/montagem.json")
    assert not r.get("reaproveitada") and mont["sons_reais"]["pendentes"] == 0 and len(mont["sons_reais"]["itens"]) == 1
    assert os.path.exists(mont["stems_locais"]["reais"]) and "reais" not in mont["chaves"]["stems"]
    assert montagem.etapa_montagem(ctx).get("reaproveitada")


# ---------------------------------------------------------------- revisão 9: cache e leitura lenta
def test_limpar_cache_varre_orfaos_velhos_e_poupa_os_recentes(tmp_path):
    cache = tmp_path / "c"
    (cache / "tmp").mkdir(parents=True)
    velho = time.time() - 7200
    arqs = {n: cache / n for n in (".101_x.999.flac.tmp", ".bloqueado_ate.999.tmp", ".indice.sqlite.1.2.tmp", "101_a.flac", "102_b.flac")}
    arqs["voz"] = cache / "tmp" / "_voz_101_a_999.wav"
    for p in arqs.values():
        p.write_bytes(b"\0" * 1000)
        os.utime(p, (velho, velho))
    novo = cache / ".102_y.1000.flac.tmp"
    novo.write_bytes(b"\0" * 10)
    os.utime(arqs["102_b.flac"], None)                                                     # usado agora (filme rodando)
    SR.limpar_cache(cache, 0.0)
    assert not any(p.exists() for n, p in arqs.items() if n != "102_b.flac")              # órfãos e o som velho saem
    assert arqs["102_b.flac"].exists() and novo.exists()                                   # o recente e o .tmp em curso ficam


def test_leitura_grande_tem_prazo_proporcional_ao_tamanho(tmp_path):
    t = {"t": 0.0}

    total = {"falta": 10 * 1024 * 1024}

    class Resp:
        def read(self, n):
            t["t"] += 0.2                                                                  # ~330 KB/s: lento, mas andando
            n = min(n, total["falta"])
            total["falta"] -= n
            return b"\0" * n

        def close(self):
            pass
    s = BX.Sessao(tmp_path, relogio=lambda: t["t"])
    dados = s.ler(Resp(), 10 * 1024 * 1024)                                                # 10 MB: 32 s, passa dos 30 s fixos
    assert len(dados) == 10 * 1024 * 1024


# ---------------------------------------------------------------- auditoria 2: o download confia no índice, não no EDL
def test_edl_adulterado_nao_baixa_nada_fora_do_indice(banco, cfg, ouvido):
    con = IX.abrir(None)
    it = item_de(con, [101, 102])
    outro = banco["audio"][(103, "wav")][4]
    it["url"] = banco["srv"].url(outro)                                                    # URL de outro arquivo, mesmo host
    it["reservas"][0]["trecho"] = [0.0, 500.0]                                             # trecho maior que o arquivo
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert rel["itens"] == [] and banco["srv"].contar() == 0 and rel["pendentes"] == 0
    assert "URL não é a do índice" in rel["faltaram"][0]["motivo"] and "trecho fora do arquivo" in rel["faltaram"][0]["motivo"]
    assert not BX.host_permitido("https://web.archive.org/web/2020/https://exemplo.com/x.wav")
    assert BX.host_permitido("https://ia800.us.archive.org/1/items/x/y.wav") and BX.host_permitido("https://dn720000.ca.archive.org/0/x.wav")
    assert BX.url_permitida("https://archive.org/download/item/arq.wav")
    assert not BX.url_permitida("https://ia800.us.archive.org/1/items/x/y.wav") and not BX.url_permitida("https://archive.org/details/x")
    assert not BX.url_permitida("https://archive.org/download/../details/x")


# ---------------------------------------------------------------- auditoria 3: recuo educado persiste e ouve o Retry-After
def test_retry_after_e_recuo_esgotado_valem_para_os_proximos_filmes(banco, cfg, ouvido):
    con = IX.abrir(None)
    it = item_de(con, [101])
    banco["srv"].modo[banco["audio"][(101, "wav")][4]] = "429_espera"
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert rel["itens"] and banco["dormidas"] == [30.0]                                    # esperou o que o servidor pediu
    t = {"t": 0.0}

    def dormir(seg):
        t["t"] += seg
    banco["srv"].modo["*"] = "503"
    b = item_de(con, [110], rid="R02", desc="floresta", t0=14, t1=24)
    s = BX.Sessao(SR.pasta_cache(cfg), teto_s=25.0, dormir=dormir, relogio=lambda: t["t"])
    rel = SR.preparar({"sons_reais": [b]}, cfg, sessao=s)
    assert rel["pendentes"] == 1 and (SR.pasta_cache(cfg) / ".recuo_ate").exists()
    n = banco["srv"].contar()
    rel = SR.preparar({"sons_reais": [b]}, cfg)                                            # o próximo filme nem pede
    assert banco["srv"].contar() == n and rel["pendentes"] == 1 and "esperar" in rel["faltaram"][0]["motivo"]
    assert SR.preparar({"sons_reais": [it]}, cfg)["itens"]                                 # o que está no cache entra


# ---------------------------------------------------------------- auditoria 5 e revisão 10
def test_numero_invalido_no_ambiente_nao_derruba_a_partida(monkeypatch):
    from motor import config
    monkeypatch.setenv("EDITOR_SONS_REAIS_MB", "muito")
    monkeypatch.setenv("EDITOR_CACHE_SONS_MB", "-3")
    c = config.carregar()
    assert c.sons_reais_mb == 150.0 and c.cache_sons_mb == 2000.0
    assert SR.teto_mb(types.SimpleNamespace(sons_reais_mb="x")) == 150.0


def test_pontual_wav_vem_inteiro_e_conferido_por_md5(banco, cfg, ouvido):
    con = IX.abrir(None)
    it = item_de(con, [107], papel="pontual", t0=2.0, t1=4.0, desc="porta-malas abrindo")
    assert it["formato"] == "wav" and it["trecho"] is None
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert rel["itens"][0]["verificacao"] == "md5" and banco["srv"].pedidos[-1][1] is None   # um pedido só, sem Range
