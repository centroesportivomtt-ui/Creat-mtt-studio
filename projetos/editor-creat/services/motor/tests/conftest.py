import pathlib
import sys

import pytest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI.parents[2] / "packages" / "schemas" / "py"))

SCRATCH = pathlib.Path("/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/drako")


@pytest.fixture()
def dados(tmp_path, monkeypatch):
    monkeypatch.setenv("EDITOR_DADOS", str(tmp_path / "dados"))
    monkeypatch.setenv("EDITOR_NICE", "0")
    return tmp_path / "dados"


@pytest.fixture()
def material_real():
    # o scratchpad é apagado sem aviso (reinício, limpeza de disco): só roda com o material inteiro
    faltando = [n for n in ("cat.json", "seg/indice.json", "V2/edl.json", "V1/edl.json") if not (SCRATCH / n).exists()]
    if not SCRATCH.exists() or faltando:
        pytest.skip(f"material real do scratchpad incompleto nesta máquina (falta: {', '.join(faltando) or 'tudo'})")
    return SCRATCH
