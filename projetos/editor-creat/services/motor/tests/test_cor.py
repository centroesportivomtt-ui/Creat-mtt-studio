"""Cor no estilo DaVinci: biblioteca por ambiente, medição, balanço por cena, pele protegida, antes/depois e QA."""
import json
import pathlib
import subprocess

import numpy as np
import pytest

from motor import config
from motor.etapas import cor as C

PELE_BGR = (120, 150, 200)


def _cena(fundo_bgr, pele=True, h=640, w=360):
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = fundo_bgr
    img += (np.random.default_rng(3).integers(0, 6, img.shape)).astype(np.uint8)
    if pele:
        img[250:400, 120:240] = PELE_BGR
    return img


def test_biblioteca_tem_os_cinco_ambientes_do_mapa():
    for nome in ("loja", "rua_dia", "rua_noite", "academia", "palco"):
        L = C.LOOKS[nome]
        assert L["nome"] and L["desc"] and len(L["gain"]) == len(L["lift"]) == len(L["gamma"]) == 3
        assert 0.2 <= L["alvo"] <= 0.6 and 0 <= L["pele"] <= 1 and 0 <= L["wb"] <= 1
    assert {x["id"] for x in C.catalogo()} == set(C.LOOKS)
    assert json.loads((config.MEMORIA / "cor" / "looks.json").read_text(encoding="utf-8"))["looks"].keys() == C.LOOKS.keys()


def test_medicao_le_histograma_branco_e_pele():
    m = C.medir(_cena((140, 125, 112)))                 # parede azulada (B > R)
    assert m["ganho_wb"][0] > 1.1 and m["ganho_wb"][2] < 0.9      # pede mais vermelho e menos azul
    assert len(m["hist"]) == 32 and sum(m["hist"]) == pytest.approx(1.0, abs=0.01)
    assert m["p2"] <= m["p50"] <= m["p98"]
    assert m["pele"] and C.PELE_FAIXA[0] <= m["pele"]["angulo"] <= C.PELE_FAIXA[1]
    assert C.medir(_cena((120, 120, 120), pele=False))["pele"] is None
    # com caixa de rosto, mede só dentro dela
    com_rosto = C.medir(_cena((140, 125, 112)), [[120 / 360, 250 / 640, 120 / 360, 150 / 640, 0.9]])
    assert com_rosto["pele"]["angulo"] == pytest.approx(m["pele"]["angulo"], abs=3)


def test_classifica_o_ambiente_pela_medicao():
    assert C.classificar(None) == "neutro"
    assert C.classificar(C.medir(_cena((125, 125, 125)))) == "loja"
    assert C.classificar(C.medir(_cena((20, 22, 28), pele=False))) == "rua_noite"
    palco = _cena((15, 10, 12), pele=False)
    palco[100:400, 60:300] = (230, 30, 200)             # refletor magenta
    assert C.classificar(C.medir(palco)) == "palco"
    rua = _cena((110, 120, 115), pele=False)
    rua[:200] = (235, 190, 140)                         # céu azul claro no topo
    assert C.classificar(C.medir(rua)) == "rua_dia"


def test_balanco_tira_a_dominante_e_leva_a_luz_ao_alvo():
    img = _cena((112, 100, 90), pele=False)              # escura e azulada
    m = C.medir(img)
    bal = C.balanco(m, "loja")
    assert bal["exp"] > 1.0 and bal["ganho"][0] > 1 > bal["ganho"][2]
    d = C.medir(C.aplicar(img, "neutro", bal))
    assert abs(d["ganho_wb"][0] - 1) < abs(m["ganho_wb"][0] - 1) * 0.6          # dominante caiu bem
    assert abs(d["p50"] - C.LOOKS["loja"]["alvo"]) < abs(m["p50"] - C.LOOKS["loja"]["alvo"])
    # noite e palco respeitam a luz do lugar: corrigem menos o branco
    assert abs(C.balanco(m, "palco")["ganho"][0] - 1) < abs(bal["ganho"][0] - 1)
    assert C.balanco(None, "loja") is None
    limites = C.balanco({**m, "p50": 0.03, "p98": 0.95}, "rua_dia")
    assert limites["exp"] <= 1.25                       # nunca empurra demais com altas perto do teto


def test_curvas_monotonicas_sem_corte_seco():
    x = np.linspace(0, 1, 256)
    for nome, L in C.LOOKS.items():
        for c in range(3):
            v = C.curva_canal(x, c, L, {"ganho": [1.2, 1.0, 1.2], "exp": 1.4})
            assert np.all(np.diff(v) >= -1e-9), nome
            assert (v >= 0.999).sum() <= 26, f"{nome}: ombro deveria segurar as altas"


def test_pele_protegida_da_saturacao_do_look(monkeypatch):
    img = _cena((60, 160, 90))                          # fundo verde saturado + pele
    monkeypatch.setitem(C.LOOKS, "_teste", {**C.LOOKS["neutro"], "con": 0.0, "sat": 1.5, "pele": 1.0})
    monkeypatch.setitem(C.LOOKS, "_teste0", {**C.LOOKS["neutro"], "con": 0.0, "sat": 1.5, "pele": 0.0})
    com, sem = C.aplicar(img, "_teste", None), C.aplicar(img, "_teste0", None)
    px = lambda o: o[300:350, 150:210].reshape(-1, 3).mean(0)                   # noqa: E731
    assert np.abs(px(com) - np.array(PELE_BGR)).max() < 4                       # pele ficou como estava
    assert np.abs(px(sem) - np.array(PELE_BGR)).max() > 12                      # sem proteção, saturou
    fundo = lambda o: o[20:80, 20:80].reshape(-1, 3).mean(0)                    # noqa: E731
    assert np.abs(fundo(com) - fundo(sem)).max() < 2                            # o resto recebe o look inteiro


def test_exporta_cube_para_o_davinci(tmp_path):
    arq = C.exportar_cube("loja", {"ganho": [1.05, 1.0, 0.95], "exp": 1.1}, tmp_path / "loja.cube", n=9)
    linhas = pathlib.Path(arq).read_text().splitlines()
    assert linhas[1] == "LUT_3D_SIZE 9"
    dados = [l for l in linhas if l and l[0].isdigit()]
    assert len(dados) == 9 ** 3
    v = np.array([[float(x) for x in l.split()] for l in dados])
    assert v.min() >= 0 and v.max() <= 1 and v[-1].min() > 0.9 and v[0].max() < 0.05


def test_resolvedor_usa_look_medido_e_pedido_vence():
    from motor.etapas.resolvedor import Resolvedor
    med = C.medir(_cena((112, 100, 90)))
    an = {"a.mp4": {"sinais": {"cenas": [{"t0": 0, "t1": 10, "ambiente": "frio-medio", "luz": 0.4, "look": "loja", "medicao": med},
                                         {"t0": 10, "t1": 20, "ambiente": "salao"}]}}}
    r = Resolvedor.__new__(Resolvedor)
    r.an, r.clipe, r.ambiente = an, {"c1": {"arquivo": "a.mp4"}}, None
    assert r._cor("c1", 5) == "loja" and r._balanco("c1", 5) == C.balanco(med, "loja")
    assert r._balanco("c1", 3) == r._balanco("c1", 8)           # a cena inteira recebe a mesma correção
    assert r._cor("c1", 15) == "salao" and r._balanco("c1", 15) is None and r._ambiente("c1", 5) == "frio-medio"
    r.ambiente = "academia"
    assert r._cor("c1", 5) == "academia" and r._balanco("c1", 5) == C.balanco(med, "academia")


def test_contratos_aceitam_look_medicao_e_balanco():
    import validar
    edl = json.loads((config.SCHEMAS / "exemplos" / "edl.json").read_text())
    edl["planos"][0].update(cor="rua_noite", balanco={"ganho": [1.05, 1.0, 0.96], "exp": 1.12})
    assert validar.erros("edl", edl) == []
    edl["planos"][0]["balanco"] = {"ganho": [1.0, 1.0], "exp": 1.0}
    assert validar.erros("edl", edl)
    ped = json.loads((config.SCHEMAS / "exemplos" / "pedido.json").read_text())
    assert validar.erros("pedido", {**ped, "ambiente": "academia"}) == []
    assert validar.erros("pedido", {**ped, "ambiente": "praia"})


def test_plano_grava_antes_e_depois_e_a_montagem_junta(tmp_path):
    from motor.etapas.montagem import revisao_cor
    from motor.etapas.montagem.planos import chave_plano, ler_antes_depois, limpar_cache, render_plano
    src = tmp_path / "s.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x506078:s=640x360:r=30:d=2",
                    "-vf", "drawbox=x=260:y=120:w=120:h=120:color=0xC89678:t=fill", "-pix_fmt", "yuv420p", str(src)], check=True)
    med = C.medir(_cena((112, 100, 90)))
    p = {"id": "P1", "t0": 0, "t1": 1.0, "fonte": "a", "s0": 0.2, "estab": "nao", "cor": "loja", "balanco": C.balanco(med, "loja")}
    fmt = {"w": 270, "h": 480, "fps": 30}
    saida = tmp_path / "cache" / "abc.mp4"
    saida.parent.mkdir()
    info = render_plano(p, str(src), 0.0, str(saida), fmt, nice=0)
    assert saida.exists() and info["cor"]["look"] == "loja" and info["cor"]["look_nome"] == "Interno de loja"
    lido = ler_antes_depois(str(saida))
    assert lido and pathlib.Path(lido["antes_jpg"]).stat().st_size > 500 and pathlib.Path(lido["depois_jpg"]).stat().st_size > 500
    assert lido["antes"]["p50"] != lido["depois"]["p50"] and len(lido["depois"]["hist"]) == 32
    # look novo e balanço entram na chave do cache; plano antigo (tabela legada) mantém a chave de antes
    assert chave_plano(p, ["x"], fmt) != chave_plano({**p, "balanco": {"ganho": [1, 1, 1], "exp": 1.0}}, ["x"], fmt)
    assert chave_plano(p, ["x"], fmt) != chave_plano({**p, "cor": "palco"}, ["x"], fmt)
    edl = {"planos": [p, {"id": "P2", "t0": 1.0, "t1": 2.0}]}
    cor = revisao_cor(edl, {"P1": {"arquivo": str(saida)}, "P2": {"arquivo": str(tmp_path / "nao.mp4")}}, tmp_path / "rev")
    assert [c["plano"] for c in cor] == ["P1"] and pathlib.Path(cor[0]["antes_jpg"]).exists()
    assert json.loads((tmp_path / "rev" / "cor.json").read_text())[0]["look"] == "loja"
    limpar_cache(saida.parent, 0)
    assert list(saida.parent.iterdir()) == []                    # o cache leva os arquivos de cor junto


def test_plano_legado_continua_igual(tmp_path):
    """Plano com look da tabela antiga e sem balanço: mesma chave de cache de antes (não rerenderiza o que já existe)."""
    from motor.etapas.montagem.comum import hash_obj
    from motor.etapas.montagem.planos import COR, VERSAO, chave_plano
    p = {"id": "P", "t0": 0, "t1": 1.0, "fonte": "a", "s0": 0.2, "cor": "salao"}
    fmt = {"w": 1080, "h": 1920, "fps": 30}
    q = {k: v for k, v in p.items()}
    q["t1"] = 1.0
    q.pop("t0")
    assert chave_plano(p, ["x"], fmt) == hash_obj(q, ["x"], fmt, COR["salao"], VERSAO)


def test_qa_cor_medida_avisa_sem_bloquear():
    from motor.etapas.qa import CHECAGENS, cor_medida

    class Conf:
        cor = []
    assert "cor_medida" in CHECAGENS and cor_medida.BLOQUEIA is False
    assert cor_medida.checar(Conf())["ok"]
    boa = {"p50": 0.45, "estouro": 0.01, "esmagado": 0.01, "pele": {"angulo": 126.0}}
    Conf.cor = [{"plano": "P1", "look": "loja", "antes": boa, "depois": boa}]
    r = cor_medida.checar(Conf())
    assert r["ok"] and r["valor"][0]["pele"] == [126.0, 126.0]
    Conf.cor = [{"plano": "P1", "look": "loja", "antes": boa, "depois": {**boa, "estouro": 0.12, "pele": {"angulo": 160.0}}}]
    r = cor_medida.checar(Conf())
    assert not r["ok"] and "estouradas" in r["detalhe"] and "160°" in r["detalhe"] and "já vinha" not in r["detalhe"]
    ruim = {**boa, "pele": {"angulo": 160.0}}
    Conf.cor = [{"plano": "P1", "look": "loja", "antes": ruim, "depois": ruim}]
    assert "já vinha assim do material" in cor_medida.checar(Conf())["detalhe"]


def test_visao_local_mede_cada_cena(tmp_path):
    import cv2
    from motor.provedores.visao_local import VisaoLocal

    class Cfg:
        dados = tmp_path
    quadros = []
    for i in range(6):
        img = _cena((125, 125, 125)) if i < 3 else _cena((20, 22, 28), pele=False)
        arq = tmp_path / f"q{i}.jpg"
        cv2.imwrite(str(arq), img)
        quadros.append((float(i), arq))
    import os
    os.environ["EDITOR_MODELOS_BAIXAR"] = "0"
    try:
        cenas = VisaoLocal(Cfg()).sinais(quadros)["cenas"]
    finally:
        os.environ.pop("EDITOR_MODELOS_BAIXAR", None)
    assert [c["look"] for c in cenas] == ["loja", "rua_noite"]
    assert all(c["medicao"]["hist"] and "ambiente" in c for c in cenas)
    import validar
    analise = json.loads((config.SCHEMAS / "exemplos" / "analise.json").read_text())
    analise["sinais"]["cenas"] = cenas
    assert validar.erros("analise", analise) == []


def test_quadro_de_uma_cor_so_nao_inventa_branco():
    """Lição do teste visual de 19/11: fundo verde (ou parede colorida) não tem área neutra; 'mundo cinza' ali
    empurrava a pele para o magenta. Sem neutro confiável, o branco não é tocado e céu não é confundido com verde."""
    verde = _cena((60, 180, 40))
    verde[:160] = (70, 200, 50)
    m = C.medir(verde)
    assert m["ganho_wb"] == [1.0, 1.0, 1.0] and not m["ceu"]
    bal = C.balanco(m, C.classificar(m))
    assert bal["ganho"] == [1.0, 1.0, 1.0]
    d = C.medir(C.aplicar(verde, "loja", bal))
    assert abs(d["pele"]["angulo"] - m["pele"]["angulo"]) < 4


def test_pele_trava_o_balanco_de_branco():
    m = C.medir(_cena((140, 125, 112)))
    torto = {**m, "ganho_wb": [1.25, 1.0, 1.25]}        # medição que empurraria tudo para o magenta
    g = C.balanco(torto, "loja")["ganho"]
    livre = [1 + C.LOOKS["loja"]["wb"] * 0.25, 1.0, 1 + C.LOOKS["loja"]["wb"] * 0.25]
    assert g[0] < livre[0] and g[2] < livre[2]          # recuou
    antes = C._dist_linha(C.angulo_rgb(m["pele"]["rgb"]))
    depois = C._dist_linha(C.angulo_rgb([c * k for c, k in zip(m["pele"]["rgb"], g)]))
    assert depois <= max(antes + 2.0, 6.0)
    assert C.angulo_rgb(m["pele"]["rgb"]) == pytest.approx(m["pele"]["angulo"], abs=4)   # mesma régua da medição


def test_neutro_e_palco_antigos_ficam_no_caminho_antigo():
    """Achado do revisor: 'neutro' e 'palco' existem nas duas tabelas. Sem balanço medido, o plano é de EDL antigo."""
    from motor.etapas.montagem.comum import hash_obj
    from motor.etapas.montagem.planos import COR, VERSAO, _look_novo, chave_plano
    fmt = {"w": 1080, "h": 1920, "fps": 30}
    for nome in ("neutro", "palco"):
        p = {"id": "P", "t0": 0, "t1": 1.0, "fonte": "a", "s0": 0.2, "cor": nome}
        q = {k: v for k, v in p.items() if k != "t0"}
        assert not _look_novo(p) and chave_plano(p, ["x"], fmt) == hash_obj(q, ["x"], fmt, COR[nome], VERSAO)
        assert _look_novo({**p, "balanco": {"ganho": [1, 1, 1], "exp": 1.0}})
    assert _look_novo({"cor": "loja"}) and not _look_novo({"cor": "salao"}) and not _look_novo({})


def test_looks_sobem_sem_o_arquivo_da_memoria(tmp_path, monkeypatch):
    """Achado do revisor: memória montada como volume antigo (sem cor/) não pode impedir o motor de subir."""
    monkeypatch.setattr(config, "MEMORIA", tmp_path)
    looks = C._carregar_looks()
    assert {"loja", "rua_dia", "rua_noite", "academia", "palco", "neutro"} <= set(looks)
    (tmp_path / "cor").mkdir()
    (tmp_path / "cor" / "looks.json").write_text(json.dumps({"looks": {"loja": {**looks["loja"], "sat": 1.2}}}))
    assert C._carregar_looks()["loja"]["sat"] == 1.2 and "palco" in C._carregar_looks()
    pacote = json.loads((pathlib.Path(C.__file__).with_name("cor_looks.json")).read_text())
    assert pacote == json.loads((pathlib.Path(__file__).resolve().parents[3] / "memoria" / "cor" / "looks.json").read_text())


def test_falha_na_revisao_de_cor_nao_derruba_o_plano(tmp_path, monkeypatch):
    from motor.etapas.montagem import planos as PL
    src = tmp_path / "s.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x180:r=30:d=1", "-pix_fmt", "yuv420p", str(src)], check=True)
    monkeypatch.setattr(PL, "gravar_antes_depois", lambda *a, **k: (_ for _ in ()).throw(OSError("disco cheio")))
    out = tmp_path / "p.mp4"
    info = PL.render_plano({"id": "P", "t0": 0, "t1": 0.5, "fonte": "a", "s0": 0.1, "estab": "nao", "cor": "loja"}, str(src), 0.0, str(out),
                           {"w": 270, "h": 480, "fps": 30}, nice=0)
    assert out.exists() and "disco cheio" in info["aviso_cor"] and "cor" not in info
