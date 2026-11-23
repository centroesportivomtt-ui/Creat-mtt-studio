"""D2 (20/11): réguas de fala com os casos reais da Lavínia (19/11), em áudio SINTÉTICO com as mesmas medidas.
1) voz distante do homem da equipe: dentro do começo da peça (F0 ~150 Hz contra ~260 Hz dela) e numa peça que é TODA a voz
   dele longe do microfone (antes virava só "NÃO VERIFICADO", pelo motivo errado);
2) falso positivo de consoante: pré-sonorização do "g" (tom perto do dela, encostada na palavra) e "xi" final fraco não reprovam;
3) começo da peça a 120 ms de outra fala da mesma fonte (o "-zer" de "freezer") reprova."""
import numpy as np
import pytest

from test_qa_fala import SR, _AssinadorUmaVoz, _conferir, _edl, _fonte, _voz, _voz_peca  # noqa: F401

DB = lambda d: 10 ** (d / 20)  # noqa: E731


@pytest.fixture(autouse=True)
def _sem_modelo_de_voz(monkeypatch):
    from motor.etapas import falante
    monkeypatch.setattr(falante, "Assinador", _AssinadorUmaVoz)


def _mix(dur, trechos, sr=16000, ruido=0.0005):
    x = (ruido * np.random.default_rng(5).standard_normal(int(dur * sr))).astype(np.float32)
    for a, d, f0, amp in trechos:
        w = _voz(d, f0, amp, sr)
        i = int(a * sr)
        x[i:i + len(w)] += w[:len(x) - i]
    return x


# ------------------------------------------------------------------ régua (funções puras)
def test_consoante_encostada_com_tom_dela_nao_e_voz_de_fora():
    from motor import audio_fala as A
    ela = (0.6, 1.6, 260, DB(-12))
    g = A.vozes_de_fora(_mix(2.6, [(0.38, 0.20, 300, DB(-30)), ela]), 16000, continuidade=True)        # "g" de "Goiaba"
    assert g == [], g
    # 1,24 x o tom dela: fora da continuidade antiga (1,2), dentro de ±25%: quem segura é a regra nova da consoante encostada
    alto = _mix(2.6, [(0.38, 0.20, 322, DB(-30)), ela])
    assert A.vozes_de_fora(alto, 16000, continuidade=True) == []
    import motor.audio_fala as M
    orig = M._encostado
    try:
        M._encostado = lambda *a, **k: False
        assert A.vozes_de_fora(alto, 16000, continuidade=True), "sem a regra nova o 'g' alto reprovaria"
    finally:
        M._encostado = orig
    xi = A.vozes_de_fora(_mix(2.8, [(0.2, 1.6, 255, DB(-12)), (1.84, 0.26, 215, DB(-21))]), 16000, continuidade=True)  # "xi"
    assert xi == [], xi
    solta = A.vozes_de_fora(_mix(3.0, [(0.2, 1.4, 260, DB(-12)), (2.3, 0.4, 255, DB(-30))]), 16000, continuidade=True)  # longe, solta
    assert solta and solta[0]["motivo"] == "longe"


def test_peca_toda_de_outra_voz_com_referencia_do_filme():
    from motor import audio_fala as A
    so_ele = _mix(0.7, [(0.08, 0.5, 145, DB(-30))])
    assert A.vozes_de_fora(so_ele, 16000, continuidade=True) == []                 # sozinha, ela é a "fala principal" de si mesma
    r = A.vozes_de_fora(so_ele, 16000, continuidade=True, ref={"f0": 258.0, "nivel": None})
    assert r and r[0]["motivo"] == "tom" and r[0]["f0"] < 170
    linhas = A.tom_estavel(_mix(0.7, [(0.08, 0.5, 145, DB(-46))]), 16000)
    assert linhas and abs(linhas[0]["f0"] - 145) < 12
    assert A.tom_estavel(_mix(1.0, []), 16000) == []                              # ruído não forma linha de tom
    sr, n = 16000, 16000
    zumbido = (0.5 * DB(-47) * np.sin(2 * np.pi * 110 * np.arange(n) / sr)).astype(np.float32) + _mix(1.0, [])
    assert A.tom_estavel(zumbido, sr) == []                                       # freezer/ar-condicionado: tom parado
    queda = _mix(1.6, [(0.1, 1.2, 260, 0.3)])                                      # a cauda da fala dela não é outra pessoa
    assert A.tom_estavel(queda, sr, nivel_fala=A.referencia([queda], sr)["nivel"]) == []


def test_comeco_colado_em_outra_fala():
    from motor import audio_fala as A
    x = _mix(3.0, [(0.5, 0.6, 230, 0.3), (1.22, 0.24, 230, 0.3), (1.75, 0.6, 230, 0.3)])
    env = A.envelope(x, 16000)
    assert A.comeco_colado(env, 1.22) is not None                                  # "-zer": 120 ms depois de "free", sílaba solta
    ok, motivo = A.corte_inicial_ok(env, 1.22)
    assert not ok and "ms depois de outra fala" in motivo
    assert A.comeco_colado(env, 1.75) is None and A.corte_inicial_ok(env, 1.75)[0]   # 290 ms de pausa: frase nova
    assert A.comeco_colado(env, 0.45) is None                                      # nada antes
    corrida = A.envelope(_mix(3.0, [(0.3, 0.6, 230, 0.3), (1.0, 1.5, 230, 0.3)]), 16000)
    assert A.comeco_colado(corrida, 1.0) is None and A.corte_inicial_ok(corrida, 1.0)[0]   # jump cut em fala corrida ("| acho que...")


# ------------------------------------------------------------------ checagem inteira (voz_externa)
@pytest.fixture()
def fonte_c(tmp_path):
    """Ela 260 Hz em 0,8-2,5 e 3,5-5,5; o homem da equipe, longe (-24 dB abaixo), 150 Hz em 0,12-0,44 ("Vai, pode ir") e
    sozinho em 6,0-6,5 ("vem"), bem abaixo do nível de fala."""
    trechos = [(0.12, 0.32, 150, DB(-24)), (0.8, 1.7, 260, 0.3), (3.5, 2.0, 262, 0.3), (6.0, 0.5, 140, DB(-40))]
    return {"C": {"chave": str(tmp_path / "nao_existe.mp4"), "audio": str(_fonte(tmp_path, "c", 7.0, trechos))}}


def test_voz_externa_pega_o_homem_no_comeco_e_na_peca_so_dele(tmp_path, dados, fonte_c):
    voz = [_voz_peca("B2.1.0", 0.0, 2.6, 0.0, "goiaba", fonte="C"), _voz_peca("B3", 3.4, 5.6, 2.6, "abacaxi", fonte="C"),
           _voz_peca("B2.0.0a", 5.9, 6.6, 4.8, "vem", fonte="C")]
    rel, c = _conferir(tmp_path, _edl(fontes=fonte_c, voz=voz, duracao=5.5), ["voz_externa"])
    assert not rel["aprovado"]
    ids = {a["id"]: a for a in c["valor"]["achados"]}
    assert "B2.1.0" in ids and ids["B2.1.0"]["s"][0] < 0.5                        # o "Vai, pode ir" no começo da peça
    assert "B2.0.0a" in ids and "outra pessoa" in ids["B2.0.0a"]["motivo"]         # motivo certo, não só "não verificado"
    assert "B2.0.0a" not in {s["id"] for s in c["valor"]["nao_verificados"]}
    assert "B3" not in ids                                                         # a peça dela passa


def test_voz_externa_varias_pessoas_libera_o_tom(tmp_path, dados, fonte_c):
    voz = [_voz_peca("B2.1.0", 0.0, 2.6, 0.0, "goiaba", fonte="C")]
    edl = _edl(fontes=fonte_c, voz=voz, duracao=3.0, origem={"vozes": "varias"})
    rel, c = _conferir(tmp_path, edl, ["voz_externa"])
    assert rel["aprovado"], c["detalhe"]
    assert c["valor"]["permitidos"]


def test_voz_externa_auto_conversa_equilibrada_so_relata(tmp_path, dados):
    from test_qa_fala import _fonte as fonte
    trechos = [(0.2, 2.0, 255, 0.3), (2.6, 2.0, 140, 0.3)]                     # ela e ele, mesmo tempo, mesmo microfone
    fontes = {"D": {"chave": str(tmp_path / "x.mp4"), "audio": str(fonte(tmp_path, "d", 5.0, trechos))}}
    voz = [_voz_peca("A", 0.1, 2.3, 0.0, "oi", fonte="D"), _voz_peca("B", 2.5, 4.7, 2.2, "oi", fonte="D")]
    rel, c = _conferir(tmp_path, _edl(fontes=fontes, voz=voz, duracao=4.5), ["voz_externa"])
    assert rel["aprovado"], c["detalhe"]
    # "só o apresentador": ela fala mais e a voz dele entra numa peça -> reprova pelo tom contra a voz principal do filme
    trechos = [(0.2, 2.0, 255, 0.3), (2.6, 1.0, 140, 0.3), (4.0, 2.0, 258, 0.3)]
    fontes = {"E": {"chave": str(tmp_path / "x.mp4"), "audio": str(fonte(tmp_path, "e", 6.5, trechos))}}
    voz = [_voz_peca("A", 0.1, 2.3, 0.0, "oi", fonte="E"), _voz_peca("B", 2.5, 3.7, 2.2, "vai", fonte="E"),
           _voz_peca("C", 3.9, 6.1, 3.4, "oi", fonte="E")]
    rel, c = _conferir(tmp_path, _edl(fontes=fontes, voz=voz, duracao=5.6, origem={"vozes": "uma"}), ["voz_externa"])
    assert not rel["aprovado"] and [a["id"] for a in c["valor"]["achados"]] == ["B"], c["detalhe"]
