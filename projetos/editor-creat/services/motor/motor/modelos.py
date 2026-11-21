"""Baixa (uma vez) os modelos locais do motor no boot do servidor, em segundo plano: o primeiro filme não espera o download
e a saúde (/api/saude -> modelos) mostra cedo se a hospedagem alcança os endereços. Cada modelo confere o próprio sha256.
uso: python -m motor.modelos"""
from __future__ import annotations


def navegador(cfg) -> dict:
    """O Chromium do kit (render dos filmes e envio do backup) acha o Playwright? Grava em <dados>/modelos/navegador.json
    para a saúde mostrar (o envio do backup caiu em 20/11 porque não achava; antes ninguém via)."""
    import json
    import pathlib
    import subprocess
    from motor import config
    try:
        r = subprocess.run(["node", "-e", "const p=require('./ferramentas/comum.cjs').playwright(); console.log(p.chromium ? 'ok' : 'sem chromium')"],
                           cwd=str(config.KIT), capture_output=True, text=True, timeout=60)
        ok = r.returncode == 0 and "ok" in r.stdout
        erro = None if ok else ((r.stderr or r.stdout).strip().splitlines() or ["?"])[0][:160]
    except Exception as e:  # noqa: BLE001
        ok, erro = False, f"{type(e).__name__}"
    out = {"ok": ok, "erro": erro}
    p = pathlib.Path(cfg.dados) / "modelos" / "navegador.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out))
    return out


def baixar() -> dict:
    from motor import config
    from motor.etapas import falante, pessoa
    cfg = config.carregar()
    from motor import qualidade_voz
    from motor.etapas.montagem import dfn3
    return {"pessoa": pessoa._modelo(cfg) is not None, "voz": falante._modelo(cfg) is not None,
            "limpeza_voz": dfn3._pasta(cfg) is not None, "medidor_voz": qualidade_voz._modelo(cfg) is not None,
            "navegador": navegador(cfg)["ok"]}


if __name__ == "__main__":
    print(baixar())
