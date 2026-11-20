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
    assert (260 / H + j["deslocamento"]) >= C.ZONA[0] and comp.OCULTO_MAX == 0.30


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
    from motor import config
    from motor.etapas.pessoa import precisa
    assert not precisa({"motion": [], "planos": [{"id": "a"}]})
    assert precisa({"motion": [{"atras": True}], "planos": []})
    assert precisa({"motion": [], "planos": [{"fundo": {"desfoque": 0.6}}]})
    s = json.loads((config.SCHEMAS / "edl.schema.json").read_text())
    assert "atras" in s["properties"]["motion"]["items"]["properties"]
    assert "fundo" in s["properties"]["planos"]["items"]["properties"]


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


class RecortadorComMemoria(RecortadorFalso):
    """Caminho real da composição: máscara pequena guardada entre a passada prévia e a composição, e estado do modelo."""

    def __init__(self):
        super().__init__()
        self.chamadas = 0
        self._estado = [0, 0, 0, 0]

    def novo_plano(self):
        super().novo_plano()
        self._estado = [0, 0, 0, 0]

    def alfa_pequena(self, bgr):
        self.chamadas += 1
        self._estado = [self._estado[0] + 1] * 4                              # "memória": quantos quadros já viu
        return (RecortadorFalso.alfa(self, bgr) * 255).astype(np.uint8)

    def alfa(self, bgr):                                                       # como o real: passa pela máscara pequena
        from motor.etapas.pessoa import ampliar
        return ampliar(self.alfa_pequena(bgr), bgr.shape[1], bgr.shape[0])


def test_janela_atravessa_dois_planos_um_sem_arquivo_e_o_modelo_segue_quente(tmp_path):
    from motor.etapas.montagem.comp import compor
    rec = RecortadorComMemoria()
    vistos = []
    orig = rec.alfa_pequena

    def espia(bgr):
        vistos.append(rec._estado[0])
        return orig(bgr)
    rec.alfa_pequena = espia
    edl = {"formato": {"w": W, "h": H, "fps": FPS}, "duracao": 1.0, "fx": [],
           "planos": [{"id": "P1", "t0": 0.0, "t1": 0.5, "fundo": {"desfoque": 0.5}}, {"id": "P2", "t0": 0.5, "t1": 1.0}]}
    ov = _overlay_texto(tmp_path, 300, 340, n=10)                              # texto só nos 10 primeiros quadros (janela no P1)
    r = compor(edl, {"P1": {"arquivo": _plano(tmp_path)}, "P2": {"arquivo": None}}, None, None, tmp_path / "f.mp4",
               dir_overlay_atras=ov, recortador=rec, crf=12)
    p = r["pessoa"]
    assert p["atras_quadros"] == 10 and p["desfoque_quadros"] == 15
    assert rec.chamadas == 15                                                  # 10 na passada prévia + 5 do resto do P1: nada repetido
    assert vistos[10] == 10                                                    # depois da janela o modelo continua de onde parou


def test_janela_de_texto_atravessa_o_corte_sem_arquivo(tmp_path):
    from motor.etapas.montagem.comp import compor
    edl = {"formato": {"w": W, "h": H, "fps": FPS}, "duracao": 1.0, "fx": [],
           "planos": [{"id": "P1", "t0": 0.0, "t1": 0.5}, {"id": "P2", "t0": 0.5, "t1": 1.0}]}
    r = compor(edl, {"P1": {"arquivo": None}, "P2": {"arquivo": _plano(tmp_path)}}, None, None, tmp_path / "f.mp4",
               dir_overlay_atras=_overlay_texto(tmp_path, 300, 340), recortador=RecortadorComMemoria(), crf=12)
    assert r["quadros"] == 30 and r["pessoa"]["janelas_atras"]                 # sem AttributeError no corte


def test_modelo_sem_rede_e_sha256_errado(tmp_path, monkeypatch):
    import io
    from motor.etapas import pessoa as P

    class Cfg:
        dados = str(tmp_path)
    monkeypatch.delenv("EDITOR_PESSOA", raising=False)
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "0")
    monkeypatch.setattr(P, "_TENTOU", False)
    assert P._modelo(Cfg()) is None and not P.Recortador(Cfg()).disponivel
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "1")
    chamadas = []

    def falso_urlopen(req, timeout):
        chamadas.append(timeout)
        return io.BytesIO(b"nao e o modelo")
    monkeypatch.setattr(P.urllib.request, "urlopen", falso_urlopen)
    assert P._modelo(Cfg()) is None                                            # sha256 não confere: não carrega
    assert not list((tmp_path / "modelos").glob("*"))                          # e não deixa arquivo pela metade
    assert P._modelo(Cfg()) is None and chamadas == [20]                       # uma tentativa por processo, espera curta


# ------------------------------------------------------------------ parte 2: destaque e pele só na pessoa
def _pele_bgr():
    import cv2
    ycc = np.uint8([[[150, 155, 110]]])                                        # tom de pele no YCrCb (faixa de cor.mascara_pele)
    return cv2.cvtColor(ycc, cv2.COLOR_YCrCb2BGR)[0, 0].astype(np.int16)


def test_destaque_escurece_e_tira_cor_so_do_fundo():
    from motor.etapas.montagem.comp import destacar
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = (40, 160, 220)                                                    # fundo laranja de embalagem
    a = np.zeros((H, W), np.float32)
    a[200:, 100:170] = 1.0
    out = destacar(img.copy(), a, 1.0)
    f0, f1 = img[50, 50].astype(int), out[50, 50].astype(int)
    assert f1.sum() < f0.sum() * 0.85                                          # fundo mais escuro
    assert (f1.max() - f1.min()) < (f0.max() - f0.min()) * 0.7                 # e com menos cor
    assert abs(int(out[300, 135].sum()) - int(img[300, 135].sum()) * 1.05) <= 6   # a pessoa sobe só um pouco


def test_pele_so_na_pele_da_pessoa():
    from motor.etapas.montagem.comp import suavizar_pele
    rng = np.random.default_rng(1)
    base = _pele_bgr()
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = (90, 90, 90)
    tex = rng.integers(-14, 15, (H, W, 1))
    img[100:300, 90:180] = np.clip(base + tex[100:300, 90:180], 0, 255)       # rosto (pele) da pessoa, com textura
    img[100:300, 10:60] = np.clip(base + tex[100:300, 10:60], 0, 255)         # FUNDO com cor de pele (embalagem/madeira)
    img[320:460, 90:180] = (30, 30, 30)                                        # roupa da pessoa (não é pele)
    a = np.zeros((H, W), np.float32)
    a[90:470, 80:190] = 1.0
    out = suavizar_pele(img.copy(), a, 1.0)
    sd = lambda m: float(m.astype(np.float32).std(axis=(0, 1)).mean())        # textura por canal
    assert sd(out[130:270, 110:160]) < sd(img[130:270, 110:160]) * 0.85      # a pele dela fica mais lisa
    assert np.array_equal(out[100:300, 10:60], img[100:300, 10:60])            # o fundo cor de pele não é tocado
    assert np.array_equal(out[340:440, 100:170], img[340:440, 100:170])        # a roupa também não
    assert np.array_equal(suavizar_pele(img.copy(), np.zeros((H, W), np.float32), 1.0), img)   # sem pessoa, nada


def test_composicao_aplica_pele_e_destaque_por_plano(tmp_path):
    from motor.etapas.montagem.comp import compor
    edl = {"formato": {"w": W, "h": H, "fps": FPS}, "duracao": 1.0, "fx": [],
           "planos": [{"id": "P1", "t0": 0.0, "t1": 0.5, "pessoa": {"pele": 0.5}, "fundo": {"destaque": 0.6}},
                      {"id": "P2", "t0": 0.5, "t1": 1.0}]}
    arq = _plano(tmp_path)
    r = compor(edl, {"P1": {"arquivo": arq}, "P2": {"arquivo": arq}}, None, None, tmp_path / "f.mp4", recortador=RecortadorFalso(), crf=12)
    p = r["pessoa"]
    assert p["pele_quadros"] == 15 and p["destaque_quadros"] == 15 and p["quadros_mascara"] == 15   # só no plano que pede
    from motor.etapas.pessoa import precisa, usa_mascara
    assert usa_mascara(edl["planos"][0]) and not usa_mascara(edl["planos"][1]) and precisa(edl)


def test_pele_tamanho_impar_e_fundo_cor_de_pele_dentro_da_caixa():
    """A caixa da pele (meia resolução -> cheia) em quadro de tamanho ímpar, com fundo cor de pele DENTRO da caixa: quem
    protege o fundo é a máscara da pessoa, não a caixa."""
    from motor.etapas.montagem.comp import suavizar_pele
    rng = np.random.default_rng(2)
    h, w = 481, 271
    base = _pele_bgr()
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = np.clip(base + rng.integers(-14, 15, (h, w, 1)), 0, 255)         # TUDO cor de pele com textura
    a = np.zeros((h, w), np.float32)
    a[100:300, 60:120] = 1.0                                                   # pessoa à esquerda
    a[100:300, 160:220] = 1.0                                                  # e à direita: a caixa inclui o vão do meio
    out = suavizar_pele(img.copy(), a, 1.0)
    assert out.shape == img.shape
    assert np.array_equal(out[120:280, 132:148], img[120:280, 132:148])        # o vão (fundo) dentro da caixa fica intacto
    sd = lambda m: float(m.astype(np.float32).std(axis=(0, 1)).mean())
    assert sd(out[120:280, 70:110]) < sd(img[120:280, 70:110]) * 0.85
