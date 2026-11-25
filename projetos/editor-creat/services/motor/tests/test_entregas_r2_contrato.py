"""Contrato com o script da creat-nuvem (`projetos/creat-nuvem/scripts/r2/r2_enviar.py`): a entrega do editor aparece na MESMA
página de entregas, no mesmo formato de índice. Se alguém mudar o script, este teste avisa antes de o painel quebrar."""
import datetime
import importlib.util
import json
import pathlib

import pytest

from motor import entregas_r2 as R
from s3_falso import S3Falso

SCRIPT = pathlib.Path(__file__).resolve().parents[4] / "creat-nuvem" / "scripts" / "r2" / "r2_enviar.py"


@pytest.fixture(scope="module")
def script():
    if not SCRIPT.is_file():
        pytest.skip("script da creat-nuvem não está neste checkout")
    spec = importlib.util.spec_from_file_location("r2_enviar_contrato", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_constantes_iguais(script):
    assert (R.PAINEL, R.INDICE) == (script.PAINEL, script.INDICE)
    assert R.FUSO.utcoffset(None) == script.FUSO.utcoffset(None)
    assert R.META == "_painel/e160f58517f4-meta.json" and R.META in SCRIPT.read_text(encoding="utf-8")


@pytest.mark.parametrize("nome", ["Cerveja Lavínia", "Nome_v12.MP4", "x-v3.jpg", "ação final.mov", "Super Kal / Natal 2026", "  "])
def test_funcoes_de_nome_iguais(script, nome):
    for f in ("sem_acento", "slug", "nome_arquivo", "raiz_versao"):
        assert getattr(R, f)(nome) == getattr(script, f)(nome), f


def test_indice_igual_ao_do_script(script, tmp_path, monkeypatch):
    s3 = S3Falso(pagina=2)
    for k, n in (("super-kal/2026-11-25-cerveja/Cerveja_v1.mp4", 9), ("super-kal/2026-11-25-cerveja/Cerveja_capa_v1.jpg", 3),
                 ("_teste-editor/x/y.mp4", 1), ("entregas.html", 4), ("raiz.mp4", 2), ("marcos/so-um-nivel.mp4", 5),
                 ("_painel/e160f58517f4-meta.json", 2), ("creat-mtt/2026-11-01-a/A_v2.mp4", 7)):
        s3.put_object(Bucket=script.DEPOSITO, Key=k, Body=b"x" * n)
    agora = datetime.datetime(2026, 11, 25, 15, 4, tzinfo=datetime.timezone.utc)

    class _DT(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return agora.astimezone(tz) if tz else agora
    monkeypatch.setattr(script.datetime, "datetime", _DT)
    monkeypatch.setattr(script.os.path, "exists", lambda p: False)          # sem painel.html: só o índice
    script.atualizar_painel(s3)
    do_script = s3.obj[(script.DEPOSITO, script.INDICE)]
    n = R.atualizar_indice(s3, script.DEPOSITO, agora)
    do_motor = s3.obj[(script.DEPOSITO, script.INDICE)]
    assert do_motor["corpo"] == do_script["corpo"]
    assert (do_motor["ContentType"], do_motor["CacheControl"]) == (do_script["ContentType"], do_script["CacheControl"])
    assert n == 3 and json.loads(do_motor["corpo"])["atualizado"] == "25/11/2026 12:04"
