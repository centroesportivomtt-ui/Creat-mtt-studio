"""Reel "O Mestre" (conceito 3): FX `revela` e `salto`, looks da praça, schema e as extensões de que o filme precisa
(congelar quadro, desfoque local com sigma, legenda própria sem a legenda padrão). Sem material real, rápidos."""
import json
import pathlib
import subprocess

import numpy as np
import pytest

from motor import config
from motor.etapas.montagem import fx

W, H = 108, 192                       # 1/10 do quadro: origem, raios e espessuras escalam junto
REV = {"tipo": "revela", "t": 0.45, "dur": 1.9, "modo": "abre", "origem": [356, 384], "rmax": 1810, "soft": 40, "amp": 70, "seed": 7}


def _cinza(v=100, w=W, h=H):
    img = np.empty((h, w, 3), np.uint8)
    img[:] = v
    return img


def _neg_esperado(v):
    base = np.array([0x2F, 0x74, 0xC8], np.float32) / 255.0          # #C8742F em BGR
    return np.clip(((255.0 - v) * (0.65 + 0.35 * base) - 128) * 0.85 + 128, 0, 255)


# ---------------------------------------------------------------- revela: abre
def test_revela_abre_antes_tudo_negativo_depois_tudo_positivo():
    img = _cinza(100)
    antes = fx.aplicar(img.copy(), 0.2, [REV], [])                  # antes de t: negativo laranja puro, sem menisco
    assert np.allclose(antes[0, 0], _neg_esperado(100), atol=1)
    assert np.ptp(antes.reshape(-1, 3), axis=0).max() == 0            # o quadro inteiro, sem borda
    assert antes[0, 0, 2] > antes[0, 0, 0]                            # laranja: R > B
    depois = fx.aplicar(img.copy(), 0.45 + 1.9 + 0.01, [REV], [])    # depois da frente: o positivo intacto
    assert np.array_equal(depois, img)
    assert fx.janela(REV) == (0.0, pytest.approx(2.35))               # sem plano: vale desde 0


def test_revela_abre_no_meio_frente_menisco_e_formula():
    img = _cinza(100)
    tt = 0.45 + 0.95                                                  # meio: r = rmax/2 = 905 px
    assert fx.raio_revela(REV, tt) == pytest.approx(905, abs=1e-6)
    out = fx.aplicar(img.copy(), tt, [REV], []).astype(np.float32)
    m = fx.mascara_revela(REV, tt, W, H)
    assert m[38, 36] == 1.0 and out[38, 36, 0] == pytest.approx(100 + 0, abs=1)      # perto da origem: positivo
    assert m[-1, -1] == 0.0 and np.allclose(out[-1, -1], _neg_esperado(100), atol=1)  # longe: negativo
    borda = (m > 0.3) & (m < 0.7)
    assert borda.any()
    mm = m[..., None]
    esperado = np.clip(100 * mm + _neg_esperado(100) * (1 - mm) + 38 * (1 - np.abs(2 * mm - 1)), 0, 255)
    assert np.abs(out - esperado).max() <= 1.0                        # saída = pos·m + neg·(1−m) + menisco
    meio = out[borda].mean(0) - (100 * mm + _neg_esperado(100) * (1 - mm))[borda].mean(0)
    assert (meio > 25).all()                                          # o menisco clareia a borda (+38 no m = 0,5)


def test_revela_e_deterministica_pela_seed():
    img = (np.random.default_rng(3).random((H, W, 3)) * 255).astype(np.uint8)
    tt = 1.2
    a = fx.aplicar(img.copy(), tt, [REV], [])
    b = fx.aplicar(img.copy(), tt, [dict(REV)], [])
    assert np.array_equal(a, b)
    c = fx.aplicar(img.copy(), tt, [dict(REV, seed=8)], [])
    assert not np.array_equal(a, c)                                   # outra semente, outra borda
    assert not np.array_equal(fx.mascara_revela(REV, tt, W, H), fx.mascara_revela(dict(REV, seed=8), tt, W, H))


def test_revela_sem_rmax_cobre_o_quadro_ate_o_fim():
    e = {k: v for k, v in REV.items() if k != "rmax"}
    m = fx.mascara_revela(e, 0.45 + 1.9, W, H)
    assert m.min() == 1.0                                             # termina sem sobra de negativo (sem pulo no fim)



def test_revela_rmax_curto_reprova_o_edl_e_o_minimo_cobre_ate_o_fim():
    """rmax 1760 com origem [356,384] deixava negativo no último quadro (canto a 1698 px + amp + soft = 1808,08)."""
    from motor.etapas import ErroDefinitivo
    from motor.etapas.montagem import validar_edl
    assert fx.rmax_minimo([356, 384]) == pytest.approx(1808.08, abs=0.01)
    curto = dict(REV, rmax=1760)
    assert fx.mascara_revela(curto, 0.45 + 1.9, W, H).min() < 1.0            # o defeito: sobra negativo no fim
    assert fx.mascara_revela(REV, 0.45 + 1.9, W, H).min() == 1.0              # 1810: termina limpo
    edl = json.loads((config.SCHEMAS / "exemplos" / "edl.json").read_text())
    edl["fx"] = [curto]
    assert any("rmax 1760" in x and "mínimo 1809" in x for x in fx.problemas(edl))
    with pytest.raises(ErroDefinitivo, match="rmax 1760"):
        validar_edl(edl)
    edl["fx"] = [dict(REV), {k: v for k, v in REV.items() if k != "rmax"}]
    assert fx.problemas(edl) == []
    validar_edl(edl)


def test_problemas_do_edl_salto_e_camadas_de_revelacao():
    edl = {"formato": {"fps": 30}, "planos": [{"id": "A", "t0": 0.0, "t1": 1.0}, {"id": "B", "t0": 1.0, "t1": 2.0}],
           "fx": [{"tipo": "salto", "t": 1.0}, {"tipo": "salto", "t": 1.5}],
           "motion": [{"id": "r", "modelo": "revelacao", "de": 0, "ate": 2,
                       "props": {"frentes": [{"de": 0.45, "dur": 1.9, "origem": [356, 384], "rmax": 1760}, {"dur": 1.0}],
                                 "latentes": [{"texto": "a", "frente": 0}, {"texto": "b", "frente": 2}, {"texto": "c"}]}},
                      {"id": "s", "modelo": "transicao", "de": 0.9, "ate": 1.1, "props": {"tipo": "salto", "entra": ["ok", "tarde", "some"]}},
                      {"id": "ok", "modelo": "chip", "de": 0.9, "ate": 2}, {"id": "tarde", "modelo": "chip", "de": 1.0, "ate": 2}]}
    pr = fx.problemas(edl)
    assert len(pr) == 6, pr
    assert any(x.startswith("fx[1] salto t=1.5") for x in pr)                 # fora do corte; o de t=1.0 passa
    assert any("frentes[0]: rmax 1760" in x for x in pr) and any("frentes[1]: frente sem início" in x for x in pr)
    assert any("latentes[1]: frente 2 inexistente" in x for x in pr)
    assert any("'tarde' entra em 1" in x for x in pr) and any("'some'" in x and "não existe" in x for x in pr)
    assert not any("'ok'" in x for x in pr)

# ---------------------------------------------------------------- revela: fecha
def test_revela_fecha_cresce_de_baixo_e_fica_negativo():
    e = {"tipo": "revela", "t": 5.0, "dur": 1.0, "modo": "fecha", "ate": 8.0}
    img = _cinza(160)
    assert fx.janela(e) == (5.0, 8.0)
    assert np.array_equal(fx.aplicar(img.copy(), 4.9, [e], []), img)  # antes: positivo intacto
    meio = fx.aplicar(img.copy(), 5.5, [e], [])
    assert np.allclose(meio[-1, W // 2], _neg_esperado(160), atol=1)   # embaixo (perto de [540,1980]): já negativo
    assert np.array_equal(meio[0, W // 2], img[0, W // 2])             # no topo: ainda positivo
    fim = fx.aplicar(img.copy(), 7.5, [e], [])
    assert np.allclose(fim[0, 0], _neg_esperado(160), atol=1) and np.ptp(fim.reshape(-1, 3), axis=0).max() == 0
    assert np.array_equal(fx.aplicar(img.copy(), 8.0, [e], []), img)  # passou de `ate`: fora da janela


def test_preparar_usa_os_limites_do_plano():
    planos = [{"id": "a", "t0": 0.0, "t1": 3.0}, {"id": "b", "t0": 3.0, "t1": 9.0}]
    abre = dict(REV, t=3.4)
    fecha = {"tipo": "revela", "t": 4.0, "modo": "fecha"}
    fechado = {"tipo": "revela", "t": 4.0, "modo": "fecha", "ate": 5.5}
    p = fx.preparar([abre, fecha, fechado, {"tipo": "whip", "t": 3.0}], planos)
    assert p[0]["desde"] == 3.0 and fx.janela(p[0]) == (3.0, pytest.approx(5.3))
    assert p[1]["ate"] == 9.0 and fx.janela(p[1]) == (4.0, 9.0)
    assert p[2]["ate"] == 5.5                                         # `ate` explícito vence
    assert p[3] == {"tipo": "whip", "t": 3.0} and "desde" not in abre  # não altera o EDL original
    assert fx.meio(REV) == pytest.approx(1.4)                         # o QA de olho olha no meio da frente


# ---------------------------------------------------------------- salto
def test_salto_linha_preta_na_emenda_e_vizinhos():
    sai, entra = _cinza(200), _cinza(60)
    e = {"tipo": "salto", "t": 2.0}
    a, b = fx.janela(e)
    assert (a, b) == (pytest.approx(1.9), pytest.approx(2.1))
    tt = 1.95                                                         # antes do corte: k = 0,5^1,6
    k = (1 - abs(tt - 2.0) / 0.1) ** 1.6
    emenda = H - int(round(H * 0.5 * k))
    out = fx.aplicar(sai.copy(), tt, [e], [], {"seguinte": lambda: entra, "anterior": None})
    assert out[emenda, 5].max() <= 20 and out[emenda - 1, 5].max() <= 20   # linha #120D0A de 24 px (2,4 px aqui)
    assert out[5, 5, 0] == 200 and out[-1, 5, 0] == 60                # em cima o que sai, embaixo o que entra
    depois = fx.aplicar(entra.copy(), 2.0, [e], [], {"anterior": sai})   # no corte: emenda no meio (H/2)
    assert depois[H // 2, 5].max() <= 20 and depois[5, 5, 0] == 200 and depois[-1, 5, 0] == 60
    sem = fx.aplicar(entra.copy(), 2.05, [e], [])                     # sem vizinho: película vazia (breu)
    assert tuple(sem[0, 5]) == (0x0A, 0x0D, 0x12)
    assert np.array_equal(fx.aplicar(sai.copy(), 2.2, [e], []), sai)  # fora da janela: intacto


def test_salto_borra_na_vertical():
    img = np.zeros((H, W, 3), np.uint8)
    img[:, ::4] = 255                                                 # listras verticais: borrão vertical não as apaga
    img2 = img.copy()
    img2[::4, :] = 128                                                # listras horizontais: o borrão as apaga
    out = fx.aplicar(img2.copy(), 1.99, [{"tipo": "salto", "t": 2.0}], [], {"seguinte": img2})
    col = out[20:60, 1, 0].astype(int)
    assert np.ptp(col) < np.ptp(img2[20:60, 1, 0].astype(int))       # perdeu contraste na vertical
    assert np.ptp(out[30, :, 0].astype(int)) > 100                    # a horizontal continua nítida


def _mp4(arq, cor, s=f"{W}x{H}", d=1.0):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={cor}:s={s}:r=30:d={d}",
                    "-pix_fmt", "yuv420p", str(arq)], check=True)


def test_salto_na_composicao_mostra_os_dois_planos(tmp_path):
    from motor.etapas.montagem import comp
    a, b = tmp_path / "a.mp4", tmp_path / "b.mp4"
    _mp4(a, "0xC8C8C8")
    _mp4(b, "0x3C3C3C")
    edl = {"formato": {"w": W, "h": H, "fps": 30}, "duracao": 2.0, "fx": [{"tipo": "salto", "t": 1.0}],
           "planos": [{"id": "A", "t0": 0.0, "t1": 1.0}, {"id": "B", "t0": 1.0, "t1": 2.0}]}
    res = comp.compor(edl, {"A": {"arquivo": str(a)}, "B": {"arquivo": str(b)}}, None, None, tmp_path / "f.mp4", nice=0)
    assert res["quadros"] == 60
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(tmp_path / "f.mp4"), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    q = np.frombuffer(raw, np.uint8).reshape(-1, H, W)
    antes = q[29]                                                    # último quadro do A (k alto): A em cima, B embaixo
    assert antes[3].mean() > 150 and antes[-3].mean() < 90
    depois = q[30]                                                   # 1o do B: A (anterior) em cima, B embaixo, emenda no meio
    assert depois[3].mean() > 150 and depois[-3].mean() < 90 and depois[H // 2].mean() < 40
    assert q[10].mean() > 150 and q[50].mean() < 90                  # longe do corte: cada plano inteiro


def test_revela_na_composicao_respeita_o_inicio_do_plano(tmp_path):
    from motor.etapas.montagem import comp
    a, b = tmp_path / "a.mp4", tmp_path / "b.mp4"
    _mp4(a, "0x404040")
    _mp4(b, "0x404040")
    edl = {"formato": {"w": W, "h": H, "fps": 30}, "duracao": 2.0,
           "fx": [{"tipo": "revela", "t": 1.2, "dur": 0.5, "modo": "abre"}],
           "planos": [{"id": "A", "t0": 0.0, "t1": 1.0}, {"id": "B", "t0": 1.0, "t1": 2.0}]}
    comp.compor(edl, {"A": {"arquivo": str(a)}, "B": {"arquivo": str(b)}}, None, None, tmp_path / "f.mp4", nice=0)
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(tmp_path / "f.mp4"), "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    q = np.frombuffer(raw, np.uint8).reshape(-1, H, W)
    assert abs(q[15].mean() - 64) < 12                               # plano A: antes do plano da revelação, positivo
    assert q[32].mean() > 120                                         # plano B antes de t: negativo (claro)
    assert abs(q[58].mean() - 64) < 12                                # depois da frente: positivo


# ---------------------------------------------------------------- looks, schema e extensões
def test_looks_da_praca_carregam_e_aplicam():
    from motor.etapas import cor as C
    L = C.LOOKS["matriz_pos_chuva"]
    assert (L["lift"], L["gamma"], L["gain"]) == ([0.012, 0.010, 0.008], [1.0, 1.0, 1.02], [1.03, 1.0, 0.96])
    assert (L["con"], L["sat"], L["pele"], L["alvo"], L["wb"]) == (0.10, 0.92, 0.75, 0.46, 0.4)
    M = C.LOOKS["matriz_memoria"]
    assert M["sat"] == 0.85 and M["gain"] == [1.04, 1.0, 0.95] and M["lift"] == L["lift"] and M["con"] == L["con"]
    memoria = json.loads((config.MEMORIA / "cor" / "looks.json").read_text(encoding="utf-8"))["looks"]
    assert memoria["matriz_pos_chuva"] == L and memoria["matriz_memoria"] == M
    img = (np.random.default_rng(5).random((96, 54, 3)) * 255).astype(np.uint8)
    for nome in ("matriz_pos_chuva", "matriz_memoria"):
        out = C.aplicar(img, nome, None)
        assert out.shape == img.shape and out.dtype == np.uint8 and not np.array_equal(out, img)


def test_schema_aceita_revela_e_salto():
    from validar import erros
    edl = json.loads((config.SCHEMAS / "exemplos" / "edl.json").read_text())
    edl["fx"] = [dict(REV), {"tipo": "revela", "t": 40.0, "dur": 1.0, "modo": "fecha", "origem": [540, 1980], "ate": 44.0},
                 {"tipo": "salto", "t": 12.0, "dur": 0.2, "forca": 1.0}, {"tipo": "revela", "t": 1, "desde": 0}]
    edl["planos"][0]["desfocar"] = [[0.3, 0.4, 0.7, 0.6, 24]]
    assert erros("edl", edl) == []
    for ruim in ({"tipo": "revela", "t": 1, "modo": "meio"}, {"tipo": "revela", "t": 1, "origem": [1]},
                 {"tipo": "revela", "t": 1, "seed": 1.5}, {"tipo": "salto", "t": 1, "inventado": 1}):
        edl["fx"] = [ruim]
        assert erros("edl", edl), ruim


def test_congelar_quadro_por_rampa():
    from motor.etapas.montagem.planos import tempos_fonte
    p = {"id": "B9c", "t0": 50.0, "t1": 51.5, "fonte": "a", "s0": 171.0, "rampa": [[0, 171.0], [1, 171.0]]}
    ts = tempos_fonte(p, 45, 30)
    assert np.all(ts == 171.0)                                        # 1,5 s no mesmo quadro da fonte


def test_desfoque_local_com_sigma():
    from motor.etapas.montagem.planos import desfoca
    img = np.zeros((480, 270, 3), np.uint8)
    img[:, ::6] = 255                                                 # listras de 1 px a cada 6
    caixa = [0.1, 0.1, 0.9, 0.9]
    padrao = desfoca(img, [caixa])                                    # sem o 5o valor: sigma 16 (o de sempre)
    fraco = desfoca(img, [caixa + [8]])                               # 8 px no quadro de 1080 = 2 px aqui
    forte = desfoca(img, [caixa + [96]])                              # 96 px no quadro de 1080 = 24 px aqui
    assert all(np.array_equal(x[:10], img[:10]) for x in (padrao, fraco, forte))   # fora da caixa: intacto
    vizinho = lambda x: np.abs(np.diff(x[240, 100:170, 0].astype(int))).max()   # noqa: E731  (listra que sobra)
    assert vizinho(img) == 255 and vizinho(fraco) > vizinho(padrao) and vizinho(forte) <= 6   # 255 -> resto de arredondamento


def test_legenda_revelada_desliga_a_padrao_e_o_qa_continua_conferindo():
    from motor.etapas.montagem.overlay import cena_do_edl
    from motor.etapas.qa import Conferencia
    edl = json.loads((config.SCHEMAS / "exemplos" / "edl.json").read_text())
    edl["motion"] = [m for m in edl["motion"] if m["modelo"] != "legenda"] + [
        {"id": "lr", "modelo": "legenda_revelada", "de": 1.0, "ate": 3.0,
         "props": {"frases": [{"de": 1.0, "ate": 2.6, "texto": "o pessoal da *creat* / tá aqui"}]}}]
    modelos = [c["modelo"] for c in cena_do_edl(edl)["camadas"]]
    assert "legenda" not in modelos and "legenda_revelada" in modelos  # sem legenda dobrada
    c = Conferencia.__new__(Conferencia)
    c.edl = edl
    assert [w[2] for w in c.palavras_legenda()] == [w[2] for w in sorted(edl["legendas"]["palavras"])]  # QA usa as palavras
    edl["legendas"]["palavras"] = []
    pal = c.palavras_legenda()                                        # sem palavras: as frases entram, sem os asteriscos
    assert [w[2] for w in pal] == ["o", "pessoal", "da", "creat", "tá", "aqui"]   # a quebra " / " não vira palavra
    assert pal[0][0] == 1.0 and pal[-1][1] == pytest.approx(2.6)


def test_zona_segura_ignora_tela_cheia_e_continua_pegando_texto_fora(tmp_path):
    """O preto inicial da `revelacao` e o papel cheio não são texto fora da zona; legenda fora da zona continua reprovando."""
    import cv2
    from types import SimpleNamespace
    from motor.etapas.qa import zona_segura as Z
    d = tmp_path / "ov"
    d.mkdir()
    cheio = np.zeros((1920, 1080, 4), np.uint8)
    cheio[..., 3] = 255                                               # preto de abertura: overlay 100% opaco
    cv2.imwrite(str(d / "quadro_00000.png"), cheio)
    leg = np.zeros((1920, 1080, 4), np.uint8)
    leg[1700:1760, 96:900, 3] = 255                                   # texto abaixo da base (1920 − 440 = 1480)
    cv2.imwrite(str(d / "quadro_00003.png"), leg)
    edl = {"duracao": 0.2, "motion": [{"id": "r", "modelo": "revelacao", "de": 0, "ate": 0.2, "props": {}}]}
    c = SimpleNamespace(overlay_dir=str(d), edl=edl, W=1080, H=1920, FPS=30, quadro=lambda t: None)
    r = Z.checar(c)
    assert not r["ok"] and r["valor"]["quadros_fora"] == 1 and r["valor"]["pior_t"] == 0.1   # só a legenda
    (d / "quadro_00003.png").unlink()
    assert Z.checar(c)["ok"]
    edl["motion"][0]["modelo"] = "papel"                              # o papel é tela cheia por definição
    cv2.imwrite(str(d / "quadro_00003.png"), leg)
    assert Z.checar(c)["ok"]
