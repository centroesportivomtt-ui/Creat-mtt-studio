"""Mão na frente da letra (27/11, filme Black do Super Kal): mão e braço passam por cima da legenda; rosto nunca; ruído
de borda (pedaço de pele minúsculo) não morde o texto."""
import numpy as np

from motor.etapas.montagem import maos as MAOS

W, H = 540, 960
PELE = (120, 150, 200)    # BGR de pele (YCrCb dentro da faixa)
CAMISA = (40, 40, 40)


def cena(com_mao=True, ruido=False):
    img = np.full((H, W, 3), (200, 180, 30), np.uint8)          # fundo da loja (não é pessoa)
    a = np.zeros((H, W), np.float32)
    a[100:960, 120:420] = 1.0                                   # silhueta da pessoa
    img[100:960, 120:420] = CAMISA
    img[120:330, 190:350] = PELE                                # rosto no alto da silhueta
    a[120:330, 190:350] = 1.0
    if com_mao:
        img[560:700, 60:260] = PELE                             # mão levantada cruzando a altura da legenda
        a[560:700, 60:260] = 1.0
    if ruido:
        img[600:603, 400:403] = PELE                            # 3x3 px: ruído de borda
    return img, a


def test_mao_entra_rosto_nao():
    img, a = cena()
    m = MAOS.pele_maos(img, a)
    s = MAOS.REDUCAO
    assert m[(600 // s), (150 // s)], "a mão tem que estar na máscara"
    assert not m[(220 // s), (270 // s)], "o rosto nunca vai por cima do texto"
    assert not m[(800 // s), (270 // s)], "a camiseta não é mão"


def test_sem_pessoa_sem_mao():
    img, _ = cena()
    assert not MAOS.peso_maos(img, np.zeros((H, W), np.float32)).any()


def test_ruido_pequeno_nao_morde_a_letra():
    img, a = cena(com_mao=False, ruido=True)
    assert not MAOS.pele_maos(img, a).any()


def test_por_cima_devolve_a_mao_sobre_a_legenda():
    img, a = cena()
    com_texto = img.copy()
    com_texto[620:660, 40:500] = (255, 255, 255)                # legenda branca atravessando mão e camiseta
    peso = MAOS.peso_maos(img, a)
    out = MAOS.por_cima(com_texto, img, peso)
    assert tuple(out[640, 150]) == PELE, "sobre a mão, a mão aparece"
    assert tuple(out[640, 350]) == (255, 255, 255), "sobre a camiseta, a letra continua"
    assert tuple(out[640, 470]) == (255, 255, 255), "fora da pessoa, a letra continua"


def test_forca_zero_desliga():
    img, a = cena()
    assert not MAOS.peso_maos(img, a, 0.0).any()


def _video_pessoa(tmp_path):
    """270x480: fundo azul; 'rosto' de pele no alto e 'mão' de pele cruzando a altura da legenda, dentro da pessoa falsa."""
    import subprocess
    arq = tmp_path / "pessoa.mp4"
    pele = "0xC89678"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x2060c0:s=270x480:r=30:d=1", "-vf",
                    f"drawbox=x=112:y=128:w=46:h=70:color={pele}:t=fill,drawbox=x=106:y=296:w=58:h=50:color={pele}:t=fill",
                    "-pix_fmt", "yuv420p", str(arq)], check=True)
    return str(arq)


def _legenda(tmp_path):
    import cv2
    d = tmp_path / "ov"
    d.mkdir()
    for k in range(30):
        o = np.zeros((480, 270, 4), np.uint8)
        o[310:330, 20:250] = (255, 255, 255, 255)
        cv2.imwrite(str(d / f"quadro_{k:05d}.png"), o)
    return str(d)


def _compor(tmp_path, pessoa):
    import cv2
    from motor.etapas.montagem.comp import compor
    from tests.test_pessoa import RecortadorFalso
    edl = {"formato": {"w": 270, "h": 480, "fps": 30}, "duracao": 1.0, "fx": [],
           "planos": [{"id": "P1", "t0": 0.0, "t1": 1.0, "pessoa": pessoa}]}
    saida = tmp_path / "f.mp4"
    r = compor(edl, {"P1": {"arquivo": _video_pessoa(tmp_path)}}, _legenda(tmp_path), None, saida, recortador=RecortadorFalso(), crf=12)
    cap = cv2.VideoCapture(str(saida))
    cap.read()
    ok, fr = cap.read()
    cap.release()
    assert ok
    return r, fr


def test_compor_mao_por_cima_da_legenda(tmp_path):
    r, fr = _compor(tmp_path, {"pele": 0.3})
    assert r["pessoa"]["maos_quadros"] > 0
    assert fr[320, 135].min() < 200, "sobre a mão aparece a mão, não a letra branca"
    assert fr[320, 60].min() > 225, "fora da pessoa a letra continua branca"


def test_compor_maos_na_frente_zero_deixa_a_letra(tmp_path):
    r, fr = _compor(tmp_path, {"pele": 0.3, "maos_na_frente": 0})
    assert r["pessoa"]["maos_quadros"] == 0
    assert fr[320, 135].min() > 225
