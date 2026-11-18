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
    if not SCRATCH.exists():
        pytest.skip("material real do scratchpad não está nesta máquina")
    return SCRATCH
