"""Item 2 (20/11): máscara de pessoa na composição: texto ATRÁS de quem fala (com posição escolhida para continuar legível)
e fundo desfocado. Recortador FALSO (máscara de um retângulo no meio): sem modelo, sem rede, rápido."""
import json
import subprocess

import numpy as np
import pytest

W, H, FPS = 270, 480, 30


class RecortadorFalso:
    """'Pessoa' = retângulo central (x 38-62%, y 25-100%), igual em todo quadro."""
    disponivel = True

    def __init__(self):
        self.planos = 0

    def novo_plano(self):
        self.planos += 1

    def alfa(self, bgr):
        h, w = bgr.shape[:2]
        a = np.zeros((h, w), np.float32)
        a[int(0.25 * h):, int(0.38 * w):int(0.62 * w)] = 1.0
        return a


def test_escolher_posicao():
    from motor.etapas.montagem.comp import escolher_posicao
    assert escolher_posicao({}, True) == (0.0, "sem pessoa na janela: texto normal")
    d, m = escolher_posicao({0.0: [0.2] * 10, -0.08: [0.1] * 10}, False)
    assert d == 0.0 and "20% coberto" in m                                     # a original já se lê: fica
    d, m = escolher_posicao({0.0: [0.6] * 10, -0.08: [0.5] * 10, -0.16: [0.12] * 10}, False)
    assert d == -0.16 and "deslocado" in m                                     # sobe até a pessoa cobrir pouco
    d, m = escolher_posicao({0.0: [0.7] * 10, -0.08: [0.6] * 10}, False)
    assert d is None and "na frente" in m                                      # nenhuma legível: texto na frente
    d, _ = escolher_posicao({0.0: [0.0] * 10, -0.08: [0.15] * 10}, False)
    assert d == -0.08                                                          # legível E com a pessoa passando na frente


def test_deslocar_corta_nas_bordas():
    from motor.etapas.montagem.comp import deslocar
    rgb = np.ones((10, 4, 3), np.uint16)
    al = np.full((10, 4, 1), 255, np.uint16)
    v = ("rgba", 5, 15, rgb, al)
    assert deslocar(v, 0, 20) is v
    s = deslocar(v, -8, 20)
    assert s[1] == 0 and s[2] == 7 and s[3].shape[0] == 7                       # 3 linhas saíram por cima
    assert deslocar(v, 30, 20) is None


def test_desfoque_sem_halo():
    from motor.etapas.montagem.comp import desfocar_fundo
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = (200, 60, 20)                                                     # fundo azul (BGR)
    img[::8] = (0, 0, 0)                                                       # textura no fundo (o desfoque tira)
    a = np.zeros((H, W), np.float32)
    a[150:400, 100:170] = 1.0
    img[150:400, 100:170] = (20, 20, 230)                                      # "pessoa" vermelha
    out = desfocar_fundo(img.copy(), a, 0.8)
    assert np.array_equal(out[150:400, 100:170], img[150:400, 100:170])        # a pessoa fica nítida
    assert out[20:100, 20:80, 0].std() < img[20:100, 20:80, 0].std() / 3      # o fundo borra (textura some)
    assert out[200:350, 92:98, 2].max() < 80                                   # colado na pessoa o fundo não fica vermelho


def _plano(tmp_path):
    arq = tmp_path / "p.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x2060c0:s={W}x{H}:r={FPS}:d=1",
                    "-pix_fmt", "yuv420p", str(arq)], check=True)
    return str(arq)


def _overlay_texto(tmp_path, y0, y1, n=30):
    import cv2
    d = tmp_path / "ov_atras"
    d.mkdir()
    for k in range(n):
        o = np.zeros((H, W, 4), np.uint8)
        o[y0:y1, 20:250] = (255, 255, 255, 255)                                # "texto" branco de lado a lado
        cv2.imwrite(str(d / f"quadro_{k:05d}.png"), o)
    return str(d)


def _compor(tmp_path, ov_atras, rec, planos=None):
    from motor.etapas.montagem.comp import compor
    edl = {"formato": {"w": W, "h": H, "fps": FPS}, "duracao": 1.0,
           "planos": planos or [{"id": "P1", "t0": 0.0, "t1": 1.0}], "fx": []}
    saida = tmp_path / "f.mp4"
    r = compor(edl, {"P1": {"arquivo": _plano(tmp_path)}}, None, None, saida, dir_overlay_atras=ov_atras, recortador=rec, crf=12)
    import cv2
    cap = cv2.VideoCapture(str(saida))
    ok, fr = cap.read()
    cap.release()
    assert ok
    return r, fr


def test_texto_atras_da_pessoa(tmp_path):
    # texto em y 300-340: a "pessoa" (x 38-62%) cobre ~28% da largura do texto, dentro do legível
    r, fr = _compor(tmp_path, _overlay_texto(tmp_path, 300, 340), RecortadorFalso())
    p = r["pessoa"]
    assert p["atras_quadros"] == 30 and p["janelas_atras"][0]["deslocamento"] == 0.0, p
    assert fr[320, 135].mean() < 200                                           # na pessoa: o plano, não o texto
    assert fr[320, 40].mean() > 230                                            # fora dela: o texto
    assert 0.2 < p["atras_oculto_max"] <= 0.30


def test_texto_atras_sobe_quando_a_pessoa_cobre_demais(tmp_path):
    from motor.etapas.montagem import comp
    import motor.etapas.montagem.comp as C

    class Larga(RecortadorFalso):
        def alfa(self, bgr):                                                   # pessoa larga do meio para baixo
            a = np.zeros(bgr.shape[:2], np.float32)
            a[int(0.45 * H):, int(0.15 * W):int(0.85 * W)] = 1.0
            return a
    r, fr = _compor(tmp_path, _overlay_texto(tmp_path, 260, 300), Larga())
    j = r["pessoa"]["janelas_atras"][0]
    assert j["deslocamento"] is not None and j["deslocamento"] < 0, j          # subiu para cima da cabeça
    y = int((280 / H + j["deslocamento"]) * H)
    assert fr[y, 135].mean() > 230                                             # o texto aparece inteiro lá em cima
    assert C.ZONA[0] * H <= (260 / H + j["deslocamento"]) * H and comp.OCULTO_MAX == 0.30


def test_sem_modelo_texto_por_cima_e_aviso(tmp_path):
    class SemModelo(RecortadorFalso):
        disponivel = False
    r, fr = _compor(tmp_path, _overlay_texto(tmp_path, 300, 340), SemModelo())
    assert fr[320, 135].mean() > 230 and r["pessoa"]["sem_modelo"]              # nunca some texto por falta de máscara


def test_overlay_separa_as_camadas():
    from motor.etapas.montagem.overlay import cena_do_edl
    edl = {"duracao": 3.0, "projeto": "p", "legendas": {"palavras": [[0.1, 0.4, "oi", 0]]},
           "motion": [{"id": "gancho", "modelo": "gancho", "de": 0, "ate": 1.5, "props": {}, "atras": True},
                      {"id": "chip", "modelo": "chip", "de": 1, "ate": 2, "props": {}}]}
    tras = cena_do_edl(edl, atras=True)["camadas"]
    frente = cena_do_edl(edl, atras=False)["camadas"]
    assert [c["id"] for c in tras] == ["gancho"] and "atras" not in tras[0]
    assert "gancho" not in [c["id"] for c in frente] and "chip" in [c["id"] for c in frente]
    assert any(c["modelo"] == "legenda" for c in frente)                       # legenda sempre na frente
    assert len(cena_do_edl(edl)["camadas"]) == len(tras) + len(frente)         # sem filtro: todas, como antes


def test_precisa_e_schema():
    import sys
    from motor import config
    from motor.etapas.pessoa import precisa
    assert not precisa({"motion": [], "planos": [{"id": "a"}]})
    assert precisa({"motion": [{"atras": True}], "planos": []})
    assert precisa({"motion": [], "planos": [{"fundo": {"desfoque": 0.6}}]})
    s = json.loads((config.SCHEMAS / "edl.schema.json").read_text())
    assert "atras" in s["properties"]["motion"]["items"]["properties"]
    assert "fundo" in s["properties"]["planos"]["items"]["properties"]
    sys.path.insert(0, str(config.SCHEMAS / "py"))


@pytest.mark.skipif(not __import__("os").environ.get("EDITOR_PESSOA"), reason="modelo real só com EDITOR_PESSOA apontando o ONNX")
def test_modelo_real_recorta_um_quadro():
    from motor import config
    from motor.etapas.pessoa import Recortador
    r = Recortador(config.carregar())
    assert r.disponivel
    a = r.alfa(np.zeros((640, 360, 3), np.uint8))
    assert a.shape == (640, 360) and a.dtype == np.float32 and a.max() <= 1.0


def test_cobertura_pela_pior_linha():
    from motor.etapas.montagem.comp import cobertura_por_linha
    texto = np.zeros((50, 100), np.float32)
    texto[5:15, 10:90] = 1.0                     # linha 1
    texto[25:35, 10:90] = 1.0                    # linha 2
    a = np.zeros((50, 100), np.float32)
    a[20:50, 30:70] = 1.0                        # a cabeça cobre só a linha de baixo, metade dela
    assert abs(cobertura_por_linha(texto, a) - 0.5) < 1e-6      # a média (25%) passaria; a pior linha (50%) não
