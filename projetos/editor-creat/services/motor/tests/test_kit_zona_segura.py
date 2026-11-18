"""QA de zona segura do motion kit: todo modelo de packages/kit/kit/modelos, com textos difíceis em português (curto, médio,
3 a 4 linhas, palavra gigante, acentos, preço, quebra forçada), fica dentro da zona segura em todos os instantes medidos.

Chama o verificador do kit (node packages/kit/ferramentas/zona.cjs), que mede as caixas reais do DOM no Chromium headless.
A matriz inteira (15 modelos medidos, ~135 casos, ~5000 instantes) roda em ~15 s, por isso não leva a marca `lento`;
`zona.cjs --rapido` existe para uso manual. Pula com motivo claro se faltar node, Playwright, Chromium ou o gsap do kit.
"""
import json
import pathlib
import shutil
import subprocess

import pytest

from motor import config
from motor.etapas.qa import zona_segura

KIT = config.KIT
ZONA_CJS = KIT / "ferramentas" / "zona.cjs"


def _motivo_para_pular() -> str | None:
    if not shutil.which("node"):
        return "node não está instalado"
    if not (KIT / "node_modules" / "gsap").exists():
        return "dependências do kit ausentes: rode `npm install --no-save gsap@3.12.5 three@0.160.0` em packages/kit"
    js = ("const c=require('./ferramentas/comum.cjs');const fs=require('fs');"
          "let e=c.cascaHeadless();if(!e){try{e=c.playwright().chromium.executablePath()}catch(x){console.log('SEM-PW '+x.message);process.exit(0)}}"
          "console.log(e&&fs.existsSync(e)?'OK':'SEM-CHROMIUM '+e)")
    r = subprocess.run(["node", "-e", js], cwd=KIT, capture_output=True, text=True, timeout=60)
    saida = (r.stdout or r.stderr).strip()
    if saida != "OK":
        return f"Chromium/Playwright indisponível para o kit: {saida[:200]}"
    return None


MOTIVO = _motivo_para_pular()
pytestmark = pytest.mark.skipif(MOTIVO is not None, reason=MOTIVO or "")


def _rodar(*args, timeout=300):
    return subprocess.run(["node", str(ZONA_CJS), *args], cwd=KIT, capture_output=True, text=True, timeout=timeout)


def _falhas(rel: dict) -> list[str]:
    out = []
    for m, r in rel["modelos"].items():
        if r.get("erro"):
            out.append(f"{m}: ERRO {r['erro']}")
        for k, c in (r.get("casos") or {}).items():
            if c.get("erro"):
                out.append(f"{m}/{k}: ERRO {c['erro']}")
            elif not c["ok"]:
                ruins = [i for i in c["instantes"] if not i["ok"]]
                p = c["pior"]
                out.append(f"{m}/{k}: {len(ruins)} instante(s) fora; pior {p['px']} px pela {p['lado']} em t={p['t']} s "
                           f"({p['tipo']} \"{p['txt']}\" caixa {p['caixa']}); instantes: {[i['t'] for i in ruins][:8]}")
            for x in c.get("cortes") or []:
                out.append(f"{m}/{k}: texto recortado \"{x['txt']}\" {x['px']} px (nunca aparece inteiro)")
        for e in r.get("erros") or []:
            out.append(f"{m}: erro do navegador {e[:160]}")
    for m in rel.get("sem_casos") or []:
        out.append(f"{m}: modelo sem casos em packages/kit/cenas/zona/casos.cjs")
    return out


def test_todos_os_modelos_ficam_na_zona_com_textos_longos(tmp_path):
    arq = tmp_path / "zona.json"
    r = _rodar("--json", str(arq))
    assert arq.exists(), f"o verificador não gerou o relatório:\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}"
    rel = json.loads(arq.read_text())
    falhas = _falhas(rel)
    assert not falhas and r.returncode == 0, "modelo × caso × instante fora da zona segura:\n" + "\n".join(falhas)
    # a matriz cobre o que prometemos: todo modelo descoberto está medido ou isento, com os 9 casos de texto
    modelos = sorted(p.stem for p in (KIT / "kit" / "modelos").glob("*.js"))
    assert sorted(rel["modelos"]) == modelos
    textos = {"curto", "medio", "longo", "infraestrutura", "estaticos", "eletrodomesticos", "acentos", "numeros", "quebra"}
    for m, info in rel["modelos"].items():
        if info.get("isento") or info.get("nota"):
            continue
        assert textos <= set(info["casos"]), f"{m} sem algum dos casos de texto: {textos - set(info['casos'])}"
        assert all(c["instantes_medidos"] >= 5 for c in info["casos"].values()), m
    assert rel["resumo"]["casos"] >= 120 and rel["resumo"]["instantes"] >= 3000


def test_negativo_cena_que_fura_a_zona_e_reprovada(tmp_path):
    arq = tmp_path / "neg.json"
    r = _rodar("--cena", "cenas/zona/negativo.json", "--json", str(arq))
    assert r.returncode == 1, f"a cena que fura a zona passou:\n{r.stdout}"
    rel = json.loads(arq.read_text())
    gig, rot = rel["camadas"]["gigante_sem_ajuste"], rel["camadas"]["rotulo_na_coluna"]
    assert not gig["ok"] and gig["pior"]["lado"] == "direita" and gig["pior"]["px"] > 500
    assert not rot["ok"] and rot["pior"]["lado"] == "direita" and rot["pior"]["px"] > zona_segura.TOL
    # controle: a mesma palavra gigante com o auto-ajuste ligado passa
    r2 = _rodar("--cena", "cenas/zona/positivo.json")
    assert r2.returncode == 0, r2.stdout


def test_modelo_novo_sem_caso_de_teste_falha(tmp_path):
    for p in (KIT / "kit" / "modelos").glob("*.js"):
        (tmp_path / p.name).write_text("")
    (tmp_path / "novo.js").write_text("export default function novo() {}\n")
    r = _rodar("--descobrir", "--modelos-dir", str(tmp_path), timeout=60)
    assert r.returncode == 1 and json.loads(r.stdout)["sem_casos"] == ["novo"]
    r = _rodar("--descobrir", timeout=60)
    assert r.returncode == 0 and json.loads(r.stdout)["sem_casos"] == []


def test_kit_e_motor_leem_a_mesma_zona():
    z = json.loads((KIT / "kit" / "zona.json").read_text())
    assert zona_segura.ZONA == z["zona"] and zona_segura.TOL == z["tolerancia"]
    assert zona_segura.TELA_CHEIA == set(z["tela_cheia"]) and zona_segura.ALFA == z["alfa_minimo"]
    nucleo = (KIT / "kit" / "nucleo.js").read_text()
    assert 'from "./zona.json"' in nucleo and "ZONA_CASA.zona" in nucleo
    assert '"zona.json"' in ZONA_CJS.read_text()
