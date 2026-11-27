"""M6: download educado e cache dos sons reais, contra um servidor HTTP LOCAL (nenhum teste sai para a internet)."""
import io
import json
import threading
import time
import types

import numpy as np
import pytest
from b_sons_reais import TranscritorFalso, banco, item_de, sem_internet  # noqa: F401 - fixtures

import motor.sons_reais as SR
from motor.sons_reais import baixar as BX
from motor.sons_reais import indice as IX


@pytest.fixture()
def cfg(banco):
    return types.SimpleNamespace(dados=str(banco["dados"]), transcricao="faster-whisper")


@pytest.fixture()
def ouvido(monkeypatch):
    """Transcritor local falso (sem voz em nada, a não ser nos ids marcados)."""
    t = TranscritorFalso()
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: t)
    return t


def _con():
    return IX.abrir(None)


def _sessao(cfg, **k):
    return BX.Sessao(SR.pasta_cache(cfg), **k)


def test_trecho_vem_com_os_bytes_exatos_e_206_conferido(banco, cfg):
    import soundfile as sf
    url, wav, x, sr, caminho = banco["audio"][(101, "wav")]
    s = _sessao(cfg)
    dados, info = BX.trecho_wav(s, url, 10.0, 5.0, tam_indice=len(wav))
    y, sr2 = sf.read(io.BytesIO(dados), dtype="int16")
    orig, _ = sf.read(io.BytesIO(wav), dtype="int16")
    assert sr2 == 44100 and np.array_equal(y, orig[441000:441000 + 220500])      # exatamente o pedaço pedido
    assert info["verificacao"] == "cabecalho+tamanho" and info["canais"] == 2 and info["taxa"] == 44100
    faixas = [r for p, r in banco["srv"].pedidos if p == caminho]
    assert faixas[0] == "bytes=0-65535" and faixas[1].startswith("bytes=") and len(faixas) == 2
    a, b = (int(v) for v in faixas[1][6:].split("-"))
    assert b - a + 1 == 220500 * 4 and s.bytes == 65536 + 220500 * 4                 # só o pedaço, nada do resto do arquivo


def test_servidor_que_ignora_o_range_e_cortado_sem_baixar_o_arquivo(banco, cfg):
    url, *_, caminho = banco["audio"][(101, "wav")]
    banco["srv"].modo[caminho] = "ignora_range"
    s = _sessao(cfg)
    with pytest.raises(BX.Indisponivel) as e:
        BX.trecho_wav(s, url, 10.0, 5.0)
    assert "200" in e.value.motivo and s.bytes == 0
    time.sleep(0.3)
    assert banco["srv"].enviados < 16 * 1024 * 1024                                   # a conexão foi fechada no começo


def test_arquivo_inteiro_com_md5_e_md5_errado_vai_para_a_reserva(banco, cfg, ouvido):
    con = _con()
    it = item_de(con, [106, 111], papel="pontual", t0=2.0, t1=4.0, desc="porta-malas abrindo")
    caminho = banco["audio"][(106, "flac")][4]
    b = bytearray(banco["srv"].arquivos[caminho])
    b[-20] ^= 0xFF
    banco["srv"].arquivos[caminho] = bytes(b)                                        # o principal chega corrompido do servidor
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert [x["id_banco"] for x in rel["itens"]] == [111] and rel["itens"][0]["candidato"] == 1
    assert rel["itens"][0]["verificacao"] == "md5" and rel["pendentes"] == 0
    assert "MD5" in "".join(rel["avisos"]) or banco["srv"].contar(caminho) == 1
    assert any("reserva" in a for a in rel["avisos"])
    arq, meta = SR.ler_cache(SR.pasta_cache(cfg), it["reservas"][0])
    assert meta["md5"] == it["reservas"][0]["md5"] and meta["taxa"] == 48000 and meta["voz"]["verificado"]
    assert not list(SR.pasta_cache(cfg).glob("106_*.flac"))                          # o corrompido não ficou no cache


def test_429_recua_e_depois_baixa(banco, cfg, ouvido):
    con = _con()
    it = item_de(con, [101])
    banco["srv"].modo[banco["audio"][(101, "wav")][4]] = "429_uma_vez"
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert [x["id_banco"] for x in rel["itens"]] == [101] and banco["dormidas"] == [10.0]


def test_403_para_tudo_e_grava_o_bloqueio(banco, cfg, ouvido):
    con = _con()
    itens = [item_de(con, [101, 102]), item_de(con, [110], rid="R02", desc="floresta", t0=14, t1=24)]
    banco["srv"].modo["*"] = "403"
    rel = SR.preparar({"sons_reais": itens}, cfg)
    assert banco["srv"].contar() == 1 and rel["pedidos_http"] == 1                   # um 403 e mais nenhum pedido
    assert rel["itens"] == [] and rel["pendentes"] == 2
    ate = float((SR.pasta_cache(cfg) / ".bloqueado_ate").read_text())
    assert ate > time.time() + 3500
    rel2 = SR.preparar({"sons_reais": itens}, cfg)                                   # outro filme respeita o prazo
    assert banco["srv"].contar() == 1 and rel2["pendentes"] == 2 and "bloque" in rel2["faltaram"][0]["motivo"]


def test_servidor_fora_do_ar_vira_aviso(banco, cfg, ouvido):
    con = _con()
    it = item_de(con, [101, 102])
    banco["srv"].fechar()                                                            # o servidor cai (mesmo endereço do índice)
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert rel["itens"] == [] and rel["pendentes"] == 1 and "rede indisponível" in rel["faltaram"][0]["motivo"]
    assert rel["pedidos_http"] == 1                                                  # caiu a rede: a reserva nem tenta


def test_teto_de_bytes_e_de_tempo(banco, cfg, ouvido):
    con = _con()
    it = item_de(con, [101])
    pouco = types.SimpleNamespace(**vars(cfg), sons_reais_mb=0.01)
    rel = SR.preparar({"sons_reais": [it]}, pouco)
    # o cabeçalho sozinho (64 KB) já passa do teto inteiro: depende do arquivo, não da rede (não fica pendente)
    assert rel["itens"] == [] and "teto" in rel["faltaram"][0]["motivo"] and rel["bytes"] == 0 and rel["pendentes"] == 0
    relogio = {"t": 0.0}

    def dormir(s):
        relogio["t"] += s
    banco["srv"].modo["*"] = "503"
    s = BX.Sessao(SR.pasta_cache(cfg), teto_s=25.0, dormir=dormir, relogio=lambda: relogio["t"])
    rel = SR.preparar({"sons_reais": [it]}, cfg, sessao=s)
    assert relogio["t"] == 10.0 and "recuo" in rel["faltaram"][0]["motivo"]          # 10 s cabem, 20 s já não


def test_um_download_por_vez_no_servidor_inteiro(banco, cfg, ouvido):
    con = _con()
    a, b = item_de(con, [101]), item_de(con, [110], rid="R02", t0=1, t1=13)
    banco["srv"].atraso = 0.15
    erros = []

    def roda(it):
        try:
            SR.preparar({"sons_reais": [it]}, cfg)
        except Exception as e:  # noqa: BLE001
            erros.append(e)
    th = [threading.Thread(target=roda, args=(x,)) for x in (a, b)]
    for t in th:
        t.start()
    for t in th:
        t.join(30)
    assert not erros and banco["srv"].contar() == 4 and banco["srv"].max_ativos == 1


def test_segunda_preparacao_sai_do_cache_e_adulterado_baixa_de_novo(banco, cfg, ouvido):
    con = _con()
    it = item_de(con, [101])
    SR.preparar({"sons_reais": [it]}, cfg)
    n = banco["srv"].contar()
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert banco["srv"].contar() == n and rel["itens"][0]["origem"] == "cache" and rel["pedidos_http"] == 0
    arq, _ = SR.ler_cache(SR.pasta_cache(cfg), it)
    b = bytearray(arq.read_bytes())
    b[-10] ^= 0xFF
    arq.write_bytes(bytes(b))
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert banco["srv"].contar() == n + 2 and rel["itens"][0]["origem"] == "baixado"
    assert len(ouvido.chamadas) == 2                                                  # a voz é conferida uma vez por arquivo novo


def test_host_fora_da_lista_e_redirecionamento_sao_recusados(banco, cfg, ouvido, monkeypatch):
    s = _sessao(cfg)
    for url in ("https://exemplo.com.br/a.wav", "http://archive.org/download/x.wav", "https://archive.org.mal.com/x.wav",
                "file:///etc/passwd", "https://10.0.0.1/x"):
        with pytest.raises(BX.Indisponivel):
            s.abrir(url)
    assert BX.host_permitido("https://archive.org/download/x.wav") and BX.host_permitido("https://ia800.us.archive.org/1/x.wav")
    con = _con()
    it = item_de(con, [101])
    banco["srv"].modo["*"] = "redir"
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert rel["itens"] == [] and "redirecionamento" in rel["faltaram"][0]["motivo"]
    monkeypatch.setattr(BX, "HOSTS_TESTE", frozenset())                              # sem a liberação do teste, nem o loopback
    banco["srv"].modo.clear()
    n = banco["srv"].contar()
    rel = SR.preparar({"sons_reais": [item_de(con, [110])]}, cfg)
    assert rel["itens"] == [] and banco["srv"].contar() == n


def test_voz_escondida_vai_para_a_lista_negra_e_entra_a_reserva(banco, cfg, monkeypatch):
    con = _con()
    it = item_de(con, [101, 102])
    t = TranscritorFalso(com_voz={101})
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: t)
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert [x["id_banco"] for x in rel["itens"]] == [102]
    assert json.loads((SR.pasta_cache(cfg) / "com_voz.json").read_text())["ids"] == [101]
    assert SR.carregar({"sons_reais": [it]}, cfg)[0]["id_banco"] == 102               # o render também pula o da lista negra
    assert 101 not in [r["id"] for r in SR.escolher(con, {"desc": "água de riacho"}, papel="ambiente", necessario_s=12,
                                                     com_voz=SR.ler_com_voz(SR.pasta_cache(cfg)))]


def test_sem_transcritor_nao_baixa_nada(banco, cfg, monkeypatch):
    monkeypatch.setattr(SR, "transcritor_local", lambda cfg: None)
    con = _con()
    rel = SR.preparar({"sons_reais": [item_de(con, [101, 102])]}, cfg)
    assert rel["itens"] == [] and banco["srv"].contar() == 0 and "voz não conferida" in rel["faltaram"][0]["motivo"]
    assert rel["pendentes"] == 0


def test_carregar_so_le_o_cache(banco, cfg, ouvido, monkeypatch):
    con = _con()
    it = item_de(con, [101])
    assert SR.carregar({"sons_reais": [it]}, cfg) == []                               # nada no cache: nada, e sem rede
    SR.preparar({"sons_reais": [it]}, cfg)
    n = banco["srv"].contar()

    def proibido(*a, **k):
        raise AssertionError("carregar tentou usar a rede")
    monkeypatch.setattr(BX.Sessao, "abrir", proibido)
    out = SR.carregar({"sons_reais": [it]}, cfg)
    assert banco["srv"].contar() == n and out[0]["audio"].shape == (12 * 48000, 2) and out[0]["audio"].dtype == np.float32
    monkeypatch.setenv("EDITOR_SONS_REAIS", "0")
    assert SR.carregar({"sons_reais": [it]}, cfg) == []
    rel = SR.preparar({"sons_reais": [it]}, cfg)
    assert rel["itens"] == [] and "desligados" in rel["faltaram"][0]["motivo"]


def test_cache_respeita_o_teto(banco, cfg, ouvido):
    con = _con()
    a, b = item_de(con, [101]), item_de(con, [110], rid="R02")
    SR.preparar({"sons_reais": [a]}, cfg)
    time.sleep(0.02)
    SR.preparar({"sons_reais": [b]}, cfg)
    cache = SR.pasta_cache(cfg)
    so_b = sum(p.stat().st_size for p in cache.glob("110_*.flac")) / 1e6
    assert SR.limpar_cache(cache, so_b + 0.01) == 0                                    # usados agora: protegidos (filme rodando)
    assert SR.limpar_cache(cache, so_b + 0.01, protege_s=0) > 0                        # o mais antigo (101) sai primeiro
    assert not list(cache.glob("101_*")) and list(cache.glob("110_*.flac")) and (cache / "indice.sqlite").exists()
