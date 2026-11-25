import pathlib
import sys

import pytest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI.parents[2] / "packages" / "schemas" / "py"))

SCRATCH = pathlib.Path("/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/drako")


VARS_NUVEM = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_BACKUP_BUCKET", "R2_ENTREGAS_BUCKET",
              "R2_ENTREGAS_PUBLICO", "R2_MIDIA_BUCKET", "EDITOR_ESPELHO", "EDITOR_ESPELHO_TETO_GB", "EDITOR_ENTREGAS")


@pytest.fixture(autouse=True)
def _sem_nuvem_real(monkeypatch):
    """Nenhum teste fala com o Cloudflare de verdade: as chaves reais do R2 desta máquina somem do ambiente de todo teste
    (quem precisa liga variáveis falsas no próprio teste e injeta um cliente S3 falso)."""
    for n in VARS_NUVEM:
        monkeypatch.delenv(n, raising=False)


@pytest.fixture()
def dados(tmp_path, monkeypatch):
    monkeypatch.setenv("EDITOR_DADOS", str(tmp_path / "dados"))
    monkeypatch.setenv("EDITOR_NICE", "0")
    for n in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_BACKUP_BUCKET"):
        monkeypatch.delenv(n, raising=False)                  # chaves reais do R2 na máquina não vazam para o teste
    monkeypatch.setenv("EDITOR_SONDAR_LINK", "0")             # a rota de importar não confere o link na internet (test_sondar usa servidor local)
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "0")         # teste nunca baixa modelo da internet (quem precisa, liga no próprio teste)
    return tmp_path / "dados"


@pytest.fixture()
def material_real():
    # o scratchpad é apagado sem aviso (reinício, limpeza de disco): só roda com o material inteiro
    faltando = [n for n in ("cat.json", "seg/indice.json", "V2/edl.json", "V1/edl.json") if not (SCRATCH / n).exists()]
    if not SCRATCH.exists() or faltando:
        pytest.skip(f"material real do scratchpad incompleto nesta máquina (falta: {', '.join(faltando) or 'tudo'})")
    return SCRATCH
