"""Chamada REAL ao Claude (paga). Só roda com ANTHROPIC_API_KEY e EDITOR_AUTORIZADO_PAGO=1 (autorização do dono)."""
import json
import os

import pytest

pytestmark = pytest.mark.pago


@pytest.mark.skipif(not (os.environ.get("ANTHROPIC_API_KEY") and os.environ.get("EDITOR_AUTORIZADO_PAGO") == "1"),
                    reason="pago: precisa de ANTHROPIC_API_KEY e da autorização do dono (EDITOR_AUTORIZADO_PAGO=1)")
def test_direcao_real_opus(tmp_path, material_real):
    from motor import config
    from motor.cerebro.anthropic_api import CerebroAnthropic
    from motor.etapas import catalogo
    from motor.etapas.direcao import dirigir_e_resolver
    from motor.ferramentas import cat_legado
    from motor.memoria.loja import Loja
    an = cat_legado.converter(material_real, tmp_path, "p_drako17", energia=False)
    ped = {"texto": "Reel de bastidor da creat.MTT na cobertura do evento: a fala do Marcos é a base", "tipo_video": "bastidor", "duracao_alvo": 90}
    cat, txt = catalogo.montar(an, ped, "p_drako17")
    r = dirigir_e_resolver(cerebro=CerebroAnthropic(config.carregar()), loja=Loja(), catalogo=cat, catalogo_txt=txt, pedido=ped,
                           analises={a["arquivo"]["id"]: a for a in an}, trilhas=[])
    (tmp_path / "uso_1.json").write_text(json.dumps(r["usos"], ensure_ascii=False))
    assert r["direcao_tokens"] <= 4000
