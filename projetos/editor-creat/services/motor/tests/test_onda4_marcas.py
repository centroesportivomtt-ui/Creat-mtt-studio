"""Onda 4, item 5 (frente SITE+API): marca do cliente. Critérios 5.1 a 5.5 do plano (docs/plano-onda4-26-11.md, seção 4).

Sem rede: as imagens são geradas aqui com o Pillow (inclusive as maliciosas: HTML disfarçado, SVG, GIF e PNG animados e a
bomba de descompressão, um PNG que diz ter 60 000 x 60 000 px no cabeçalho).
"""
import io
import json
import struct
import zipfile
import zlib

import pytest
from PIL import Image

from motor import banco, config, marcas


def _png(w=2048, h=2048, alfa=True, cor=(200, 30, 40)) -> bytes:
    im = Image.new("RGBA", (w, h), (*cor, 255))
    if alfa:
        for x in range(0, w, max(1, w // 8)):           # um pedaço transparente: alfa de verdade
            im.putpixel((x, 0), (0, 0, 0, 0))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def _jpeg(w, h) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (w, h), (10, 120, 200)).save(b, "JPEG", quality=80)
    return b.getvalue()


def _bomba() -> bytes:
    """PNG válido de 1 px com o IHDR trocado para 60 000 x 60 000 (3,6 bilhões de pixels) e o CRC refeito."""
    b = bytearray(_png(1, 1, alfa=False))
    ihdr = 8                                             # depois da assinatura: tamanho(4) + "IHDR"(4) + dados(13) + crc(4)
    dados = bytearray(b[ihdr + 8: ihdr + 8 + 13])
    dados[0:8] = struct.pack(">II", 60_000, 60_000)
    b[ihdr + 8: ihdr + 8 + 13] = dados
    b[ihdr + 21: ihdr + 25] = struct.pack(">I", zlib.crc32(b"IHDR" + bytes(dados)) & 0xFFFFFFFF)
    return bytes(b)


def _apng() -> bytes:
    quadros = [Image.new("RGBA", (600, 600), (i * 60, 0, 0, 255)) for i in range(3)]
    b = io.BytesIO()
    quadros[0].save(b, "PNG", save_all=True, append_images=quadros[1:], duration=100, loop=0)
    return b.getvalue()


def _gif() -> bytes:
    quadros = [Image.new("P", (600, 600), i) for i in range(3)]
    b = io.BytesIO()
    quadros[0].save(b, "GIF", save_all=True, append_images=quadros[1:], duration=100, loop=0)
    return b.getvalue()


@pytest.fixture()
def cli(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    from motor.api.app import criar
    return TestClient(criar())


def _arm():
    from motor.provedores import armazenamento_de
    return armazenamento_de(config.carregar())


def _post(cli, rota, corpo, tipo="image/png"):
    return cli.post(f"/v1/marcas/{rota}", content=corpo, headers={"content-type": tipo})


# ---------------------------------------------------------------- 5.1
def test_5_1_png_2048_com_alfa_grava_logo_e_marca_json(cli, dados):
    r = _post(cli, "super-kal/logo", _png())
    assert r.status_code == 200, r.text
    assert r.json() == {"slug": "super-kal", "logo": True, "w": 2048, "h": 2048, "alfa": True}
    base = dados / "armazenamento" / "marcas" / "super-kal"
    assert (base / "logo.png").is_file()
    m = json.loads((base / "marca.json").read_text())
    assert m["slug"] == "super-kal" and m["nome"] == "Super Kal" and len(m["logo"]["sha256"]) == 64 and m["logo"]["alfa"] is True
    lista = cli.get("/v1/marcas").json()
    assert lista["fixos"] == ["super-kal", "creat-mtt", "marcos"]
    assert [(x["slug"], x["logo"]) for x in lista["marcas"]] == [("super-kal", True)] and lista["marcas"][0]["atualizado"]
    g = cli.get("/v1/marcas/super-kal/logo")
    assert g.status_code == 200 and g.headers["content-type"] == "image/png" and g.headers["x-content-type-options"] == "nosniff"
    assert "no-cache" in g.headers["cache-control"] and "private" in g.headers["cache-control"]
    assert Image.open(io.BytesIO(g.content)).size == (2048, 2048)


def test_5_1b_regravada_sem_metadados_reduzida_a_2048_e_jpeg_sem_alfa(cli, dados):
    im = Image.new("RGB", (3000, 1500), (0, 200, 0))
    b = io.BytesIO()
    exif = Image.Exif()
    exif[0x010E] = "segredo no exif"
    im.save(b, "JPEG", exif=exif)
    r = _post(cli, "Super Kal/logo", b.getvalue() + b"<script>alert(1)</script>", "image/jpeg")
    assert r.status_code == 200, r.text
    assert (r.json()["w"], r.json()["h"], r.json()["alfa"]) == (2048, 1024, False)
    salvo = (dados / "armazenamento" / "marcas" / "super-kal" / "logo.png").read_bytes()
    assert salvo.startswith(b"\x89PNG") and b"segredo" not in salvo and b"script" not in salvo
    assert Image.open(io.BytesIO(salvo)).mode == "RGBA"


# ---------------------------------------------------------------- 5.2
@pytest.mark.parametrize("corpo,tipo,status,frase", [
    (_jpeg(300, 200), "image/jpeg", 422, "imagem pequena demais: mande com pelo menos 512 px no lado maior"),
    (_apng(), "image/png", 422, "imagem animada não serve como logo"),
    (_gif(), "image/gif", 415, "tipo de arquivo não aceito"),
    (_gif(), "image/png", 422, "não é uma imagem válida"),
    (b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "image/svg+xml", 415, "tipo de arquivo não aceito"),
    (b"<html><body><script>alert(1)</script></body></html>", "image/png", 422, "não é uma imagem válida"),
    (b"\x89PNG\r\n\x1a\n" + b"\x00" * 200, "image/png", 422, "não é uma imagem válida"),
    (_bomba(), "image/png", 422, "imagem grande demais"),
    (b"", "image/png", 422, "não é uma imagem válida"),
])
def test_5_2_imagens_recusadas_com_frase_do_dono(cli, dados, corpo, tipo, status, frase):
    r = _post(cli, "super-kal/logo", corpo, tipo)
    assert r.status_code == status, r.text
    assert r.json()["detail"].startswith(frase)
    assert not (dados / "armazenamento" / "marcas" / "super-kal" / "logo.png").exists()
    assert cli.get("/v1/saude").status_code == 200             # o motor continua de pé


def test_5_2b_nove_mb_413_mesmo_com_content_length_mentiroso(cli):
    nove = b"\x89PNG\r\n\x1a\n" + b"\x00" * (9 * 1024 * 1024)
    assert _post(cli, "super-kal/logo", nove).status_code == 413
    # o teto vale para o que CHEGA, não só para o cabeçalho
    with pytest.raises(marcas.ErroImagem) as e:
        marcas.validar_imagem(nove, "image/png")
    assert e.value.status == 413


@pytest.mark.parametrize("cliente", ["-", "..", "...", "%20", "_"])
def test_5_2c_cliente_invalido(cli, cliente):
    r = _post(cli, f"{cliente}/logo", _png(600, 600))
    assert r.status_code in (404, 422), (cliente, r.status_code)
    if r.status_code == 422:
        assert r.json()["detail"] == "nome de cliente inválido"


def test_5_2d_slug_com_barra_nao_sai_da_pasta(cli, dados):
    assert _post(cli, "..%2F..%2Fx/logo", _png(600, 600)).status_code in (404, 422)
    assert not list((dados / "armazenamento").rglob("logo.png"))


# ---------------------------------------------------------------- 5.3
@pytest.mark.parametrize("nome", ["super_kal", "Super Kal", "SUPER-KAL", "super kal "])
def test_5_3_nomes_viram_super_kal(cli, dados, nome):
    r = _post(cli, f"{nome}/logo", _png(600, 600))
    assert r.status_code == 200 and r.json()["slug"] == "super-kal"
    assert (dados / "armazenamento" / "marcas" / "super-kal" / "logo.png").is_file()
    assert [p.name for p in (dados / "armazenamento" / "marcas").iterdir()] == ["super-kal"]


def test_trocar_e_apagar_logo(cli, dados):
    assert _post(cli, "super-kal/logo", _png(600, 600)).json()["w"] == 600
    sha1 = json.loads((dados / "armazenamento/marcas/super-kal/marca.json").read_text())["logo"]["sha256"]
    assert _post(cli, "super-kal/logo", _png(800, 800, cor=(1, 2, 3))).json()["w"] == 800
    sha2 = json.loads((dados / "armazenamento/marcas/super-kal/marca.json").read_text())["logo"]["sha256"]
    assert sha1 != sha2
    r = cli.post("/v1/marcas/super-kal/logo/apagar")
    assert r.status_code == 200 and r.json() == {"slug": "super-kal", "logo": False}
    assert cli.get("/v1/marcas/super-kal/logo").status_code == 404
    assert cli.get("/v1/marcas").json()["marcas"] == []


def test_mascote_precisa_de_alfa_e_pose_conhecida(cli):
    r = _post(cli, "super-kal/mascote/espiada", _png(700, 700, alfa=False))
    assert r.status_code == 422 and r.json()["detail"] == "o mascote precisa de fundo transparente"
    assert _post(cli, "super-kal/mascote/voando", _png(700, 700)).status_code == 404
    r = _post(cli, "super-kal/mascote/espiada", _png(700, 700))
    assert r.status_code == 200 and r.json()["pose"] == "espiada"
    m = cli.get("/v1/marcas").json()["marcas"][0]
    assert m["slug"] == "super-kal" and m["logo"] is False and m["mascote"] == ["espiada"]
    assert cli.get("/v1/marcas/super-kal/mascote/espiada").status_code == 200
    assert cli.post("/v1/marcas/super-kal/mascote/espiada/apagar").status_code == 200
    assert cli.get("/v1/marcas/super-kal/mascote/espiada").status_code == 404


def test_415_antes_de_ler_o_corpo(cli):
    r = cli.post("/v1/marcas/super-kal/logo", content=_png(600, 600), headers={"content-type": "application/octet-stream"})
    assert r.status_code == 415


# ---------------------------------------------------------------- 5.4 (ponta do site: o pedido leva o cliente normalizado)
def _projeto(pid="p_marca01"):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES (?,?,?,?)", (pid, "Super Kal - Black", t, t))
    con.close()
    return pid


@pytest.mark.parametrize("enviado,gravado", [("Super Kal", "super-kal"), ("super_kal", "super-kal"), ("super-kal", "super-kal"), ("", None)])
def test_5_4_pedido_normaliza_cliente(cli, dados, enviado, gravado):
    pid = _projeto()
    r = cli.post(f"/v1/projetos/{pid}/pedido", json={"texto": "anúncio de diálogo da Black", "cliente": enviado})
    assert r.status_code == 201, r.text
    assert r.json()["pedido"]["cliente"] == gravado
    ped = json.loads((dados / "armazenamento" / "projetos" / pid / "pedido.json").read_text())
    assert ped["cliente"] == gravado


@pytest.mark.parametrize("ruim", ["-", "---", "../"])
def test_5_4b_pedido_cliente_invalido_422(cli, ruim):
    pid = _projeto()
    assert cli.post(f"/v1/projetos/{pid}/pedido", json={"texto": "x", "cliente": ruim}).status_code == 422


def test_5_4c_logo_gravada_pela_api_e_vista_pelo_fecho(cli, dados):
    """A chave que a API grava é a mesma que a montagem (MOTOR-A) procura: `direcao.marca_existe`."""
    from motor.etapas import armazem_b
    from motor.etapas.direcao import marca_existe
    existe = marca_existe(armazem_b.Armazem(dados=dados, provedor=_arm()))
    assert existe("super-kal") is False
    assert _post(cli, "super_kal/logo", _png(600, 600)).status_code == 200
    assert existe("super-kal") is True and existe("creat-mtt") is False


# ---------------------------------------------------------------- 5.5
def test_5_5_backup_leva_marcas_e_apagar_projeto_nao_apaga(cli, dados):
    from motor import apagar as AP
    from motor import backup
    assert _post(cli, "super-kal/logo", _png(600, 600)).status_code == 200
    assert _post(cli, "super-kal/mascote/placa", _png(600, 600)).status_code == 200
    cfg = config.carregar()
    r = backup.montar(cfg)
    nomes = zipfile.ZipFile(r["zip"]).namelist()
    for n in ("armazenamento/marcas/super-kal/logo.png", "armazenamento/marcas/super-kal/marca.json",
              "armazenamento/marcas/super-kal/mascote/placa.png"):
        assert n in nomes
    pid = "p_marca02"
    _projeto(pid)
    AP.apagar(cfg, pid, "Super Kal - Black")
    assert (dados / "armazenamento" / "marcas" / "super-kal" / "logo.png").is_file()
    assert cli.get("/v1/marcas").json()["marcas"][0]["logo"] is True


def test_cli_semear(dados, tmp_path, capsys):
    arq = tmp_path / "superkal_logo_alfa.png"
    arq.write_bytes(_png(1024, 1024))
    assert marcas.main(["semear", "super_kal", str(arq)]) == 0
    assert json.loads(capsys.readouterr().out)["slug"] == "super-kal"
    pequeno = tmp_path / "p.jpg"
    pequeno.write_bytes(_jpeg(100, 100))
    assert marcas.main(["semear", "super-kal", str(pequeno)]) == 1
    assert marcas.main(["listar"]) == 0
    assert "super-kal: logo sim" in capsys.readouterr().out


# ------------------------------------------------------------------ revisão tripla, A7/S1: teto de pixels e um decodificador por vez
def test_png_pequeno_que_abriria_370_mb_e_recusado_pelo_cabecalho():
    """PNG sólido de 6300 x 6300 (~170 KB no disco) decodificava a ~370 MB extra na API. Agora o teto é 16 milhões de pixels,
    conferido no cabeçalho, antes de decodificar."""
    from motor import marcas
    b = io.BytesIO()
    Image.new("RGBA", (6300, 6300), (10, 120, 200, 255)).save(b, "PNG")
    assert len(b.getvalue()) < 300_000
    with pytest.raises(marcas.ErroImagem) as e:
        marcas.validar_imagem(b.getvalue(), "image/png")
    assert e.value.status == 422 and "16 milhões de pixels" in e.value.frase
    ok = io.BytesIO()
    Image.new("RGBA", (4000, 4000), (10, 120, 200, 0)).save(ok, "PNG")
    _png_ok, w, h, alfa = marcas.validar_imagem(ok.getvalue(), "image/png")      # 4000 x 4000 ainda entra (sai com 2048)
    assert (w, h, alfa) == (2048, 2048, True)


def test_decodificacao_e_uma_por_vez():
    import threading

    from motor import marcas
    ativos, pico, trava = [0], [0], threading.Lock()
    real = marcas._decodificar

    def contando(*a, **k):
        with trava:
            ativos[0] += 1
            pico[0] = max(pico[0], ativos[0])
        try:
            import time
            time.sleep(0.05)
            return real(*a, **k)
        finally:
            with trava:
                ativos[0] -= 1
    marcas._decodificar = contando
    try:
        img = _png(600, 600, alfa=True)
        ts = [threading.Thread(target=marcas.validar_imagem, args=(img, "image/png")) for _ in range(4)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
    finally:
        marcas._decodificar = real
    assert pico[0] == 1
