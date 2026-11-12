#!/usr/bin/env python3
"""Calculadora de oferta da Creat Nuvem. Só biblioteca padrão, sem rede, sem executar comando.

Adaptada de founder-cfo/unit_economics.py (Jake Schincariol, MIT, commit fd9385b0; ver ORIGEM.md e LICENSE),
com o que a casa precisa e o original não tinha: reais e vírgula decimal, custo por venda vindo do anúncio
(CAC), mensalidade com cancelamento, valor do cliente no tempo (LTV), prazo de retorno do CAC, teto de
CAC e um veredito calculado (passa, não passa ainda, incompleto), nunca escrito à mão.

    python3 -I oferta.py dados.json
    python3 -I oferta.py dados.json --saida relatorio.md
    python3 -I oferta.py dados.json --json
    python3 -I oferta.py dados.json --preco "179,90" --volume 0.8

Entrada (ver exemplo.json nesta pasta; todo número pode vir como 29.9, "29,90", "1.500,00" ou "R$ 29,90"):

    negocio                nome, para o relatório
    unidade                o que se vende uma vez: "venda", "Abertura", "corte" (unidade_plural opcional)
    preco                  preço da venda única (pode ser 0 se só houver mensalidade)
    custo_variavel         [{rotulo, custo}] custo de UMA venda: taxa do Pix, produção, comissão
    custos_fixos_mensais   [{rotulo, custo}] o que se paga todo mês, venda ou não venda
    investimento_inicial   [{rotulo, custo}] gasto único antes de abrir (opcional)
    cac                    custo para conseguir uma venda: anúncio dividido pelas vendas (opcional)
    mensalidade            {valor, custo_mensal, cancelamento_mensal} (opcional; cancelamento de 0 a 1)
    plano_por_mes          vendas por mês quando estiver rodando (ou plano_por_dia + dias_por_mes)
    rampa_por_mes          12 números: vendas em cada mês do ano 1 (ou rampa_por_dia; padrão = plano)
    capacidade_por_mes     o máximo que dá para entregar num mês (ou capacidade_por_dia; opcional)
    regras                 {ltv_cac_minimo (padrão 3), retorno_cac_max_meses (padrão 12), exige_mensalidade (padrão false)}

Todo número do relatório sai desse arquivo. Nada é buscado nem chutado. Campo que falta vira erro ou
"incompleto", nunca preenchimento.
"""

import argparse
import json
import math
import os
import re
import sys

HORIZONTE = 36  # meses: teto da vida do cliente quando o cancelamento é zero (que é irreal e vira alerta)
RETORNO_MAX = 60


class ErroNumeros(Exception):
    pass


# ── números em português ──────────────────────────────────────────────────────
_SO_MILHAR = re.compile(r"\d{1,3}(?:\.\d{3})+")


def numero(v, campo="valor"):
    """Lê 29.9, "29,90", "1.500,00", "1.500" (mil e quinhentos), "0.125", "R$ 29,90". Estranho vira erro, nunca chute."""
    if isinstance(v, bool):
        raise ErroNumeros("%s não é número: %r" % (campo, v))
    if isinstance(v, (int, float)):
        if math.isnan(v) or math.isinf(v):
            raise ErroNumeros("%s não é número finito" % campo)
        return float(v)
    if not isinstance(v, str):
        raise ErroNumeros("%s não é número: %r" % (campo, v))
    s = v.replace(" ", " ").strip()
    s = re.sub(r"^R\$\s*", "", s)
    s = s.replace(" ", "")
    neg = s.startswith("-")
    if neg:
        s = s[1:]
    if not s or not re.fullmatch(r"[0-9.,]+", s):
        raise ErroNumeros("%s não é número: %r" % (campo, v))
    if "," in s:
        if s.count(",") > 1:
            raise ErroNumeros("%s tem mais de uma vírgula: %r" % (campo, v))
        inteiro, dec = s.split(",")
        if "." in inteiro and not _SO_MILHAR.fullmatch(inteiro):
            raise ErroNumeros("%s tem ponto de milhar fora do lugar: %r" % (campo, v))
        if not inteiro or not dec:
            raise ErroNumeros("%s está incompleto: %r" % (campo, v))
        s = inteiro.replace(".", "") + "." + dec
    elif s.count(".") > 1 or (_SO_MILHAR.fullmatch(s) and s.split(".")[0] != "0"):
        if not _SO_MILHAR.fullmatch(s):
            raise ErroNumeros("%s tem ponto de milhar fora do lugar: %r" % (campo, v))
        s = s.replace(".", "")
    try:
        r = float(s)
    except ValueError:
        raise ErroNumeros("%s não é número: %r" % (campo, v))
    return -r if neg else r


def reais(v, casas=2):
    sinal = "-" if v < 0 else ""
    if casas == 0:
        t = "{:,.0f}".format(abs(round(v)))
    else:
        t = "{:,.2f}".format(abs(v))
    return "%sR$ %s" % (sinal, t.replace(",", "X").replace(".", ",").replace("X", "."))


def inteiro(v):
    return "{:,.0f}".format(v).replace(",", ".")


def dec1(v):
    return ("%.1f" % v).replace(".", ",")


def pct(v):
    return ("%.0f%%" % (v * 100)) if v is not None and not math.isinf(v) else "sem conta"


def _soma(itens, campo):
    total = 0.0
    if itens is None:
        return 0.0
    if not isinstance(itens, list):
        raise ErroNumeros("%s precisa ser uma lista de {rotulo, custo}" % campo)
    for i, it in enumerate(itens):
        if not isinstance(it, dict) or "custo" not in it:
            raise ErroNumeros("%s[%d] precisa de 'custo'" % (campo, i))
        total += numero(it["custo"], "%s[%d].custo" % (campo, i))
    return total


def carregar(caminho):
    try:
        with open(caminho, encoding="utf-8") as fh:
            dados = json.load(fh)
    except FileNotFoundError:
        raise ErroNumeros("arquivo não existe: %s" % caminho)
    except json.JSONDecodeError as e:
        raise ErroNumeros("%s não é JSON válido: %s" % (caminho, e))
    if not isinstance(dados, dict):
        raise ErroNumeros("%s precisa ser um objeto JSON" % caminho)
    return dados


def _volume(spec, volume):
    """Vendas por mês no plano e na rampa de 12 meses, e os dias por mês (None quando o volume é por mês)."""
    tem_dia = "plano_por_dia" in spec or "rampa_por_dia" in spec
    tem_mes = "plano_por_mes" in spec or "rampa_por_mes" in spec
    if tem_dia and tem_mes:
        raise ErroNumeros("use volume por dia OU por mês, não os dois")
    if not tem_dia and not tem_mes:
        raise ErroNumeros("informe 'plano_por_mes' ou 'rampa_por_mes' (12 números), ou as versões por dia")
    dias = numero(spec.get("dias_por_mes", 30), "dias_por_mes") if tem_dia else None
    if dias is not None and dias <= 0:
        raise ErroNumeros("dias_por_mes precisa ser maior que zero")
    fator = dias if tem_dia else 1.0
    sufixo = "por_dia" if tem_dia else "por_mes"
    plano = numero(spec["plano_" + sufixo], "plano_" + sufixo) * fator * volume if ("plano_" + sufixo) in spec else None
    rampa = spec.get("rampa_" + sufixo)
    if rampa is None:
        rampa = [plano] * 12
    else:
        if not isinstance(rampa, list) or len(rampa) != 12:
            raise ErroNumeros("'rampa_%s' precisa de 12 números, um por mês" % sufixo)
        rampa = [numero(x, "rampa_%s[%d]" % (sufixo, i)) * fator * volume for i, x in enumerate(rampa)]
    if plano is None:
        plano = rampa[-1]
    if plano < 0 or any(x < 0 for x in rampa):
        raise ErroNumeros("volume não pode ser negativo")
    cap = None
    if "capacidade_por_mes" in spec:
        cap = numero(spec["capacidade_por_mes"], "capacidade_por_mes")
    elif "capacidade_por_dia" in spec:
        cap = numero(spec["capacidade_por_dia"], "capacidade_por_dia") * (dias or 30)
    return plano, rampa, dias, cap


def analisar(spec, preco=None, volume=1.0, mult_custo=1.0, mult_cac=1.0, mult_cancelamento=1.0):
    """Devolve um dicionário com todo número do relatório. Função pura, fácil de testar."""
    if "preco" not in spec and preco is None:
        raise ErroNumeros("falta 'preco'")
    p = numero(preco if preco is not None else spec["preco"], "preco")
    mens = spec.get("mensalidade")
    if mens is not None and not isinstance(mens, dict):
        raise ErroNumeros("'mensalidade' precisa ser {valor, custo_mensal, cancelamento_mensal}")
    if p < 0 or (p == 0 and not mens):
        raise ErroNumeros("preco precisa ser maior que zero (ou zero com mensalidade)")
    var = _soma(spec.get("custo_variavel"), "custo_variavel") * mult_custo
    fixos = _soma(spec.get("custos_fixos_mensais"), "custos_fixos_mensais")
    invest = _soma(spec.get("investimento_inicial"), "investimento_inicial")
    cac = numero(spec["cac"], "cac") * mult_cac if spec.get("cac") is not None else None
    if cac is not None and cac < 0:
        raise ErroNumeros("cac não pode ser negativo")
    regras = spec.get("regras") or {}
    ltv_min = numero(regras.get("ltv_cac_minimo", 3), "regras.ltv_cac_minimo")
    retorno_max = numero(regras.get("retorno_cac_max_meses", 12), "regras.retorno_cac_max_meses")
    exige_mens = bool(regras.get("exige_mensalidade", False))

    valor_m = custo_m = canc = None
    if mens:
        if "valor" not in mens:
            raise ErroNumeros("mensalidade precisa de 'valor'")
        valor_m = numero(mens["valor"], "mensalidade.valor")
        custo_m = numero(mens.get("custo_mensal", 0), "mensalidade.custo_mensal") * mult_custo
        if mens.get("cancelamento_mensal") is not None:
            canc = min(1.0, numero(mens["cancelamento_mensal"], "mensalidade.cancelamento_mensal") * mult_cancelamento)
            if canc < 0:
                raise ErroNumeros("cancelamento_mensal vai de 0 a 1 (0,08 = 8% saem por mês)")
    plano, rampa, dias, cap = _volume(spec, volume)

    contrib = p - var
    contrib_pct = contrib / p if p else None
    contrib_cac = contrib - (cac or 0.0)
    contrib_m = (valor_m - custo_m) if mens else 0.0
    sobrevive = (1.0 - canc) if canc is not None else 1.0  # sem cancelamento informado, conta como 0 e marca incompleto
    equilibrio_mes = math.inf if contrib_cac <= 0 else fixos / contrib_cac
    ativos_pagam_fixos = (fixos / contrib_m) if mens and contrib_m > 0 else None
    if mens:
        meses_vida = (sobrevive / canc) if canc else float(HORIZONTE)
        meses_vida = min(meses_vida, float(HORIZONTE))
    else:
        meses_vida = 0.0
    ltv = contrib + contrib_m * meses_vida
    ltv_cac = (ltv / cac) if cac else None
    teto_cac = ltv / ltv_min if ltv_min > 0 else None
    retorno_cac = None
    if cac is not None:
        acum, k, peso = contrib, 0, 1.0
        while acum < cac and k < RETORNO_MAX and contrib_m > 0:
            k += 1
            peso *= sobrevive
            acum += contrib_m * peso
        retorno_cac = k if acum >= cac else None
    margem_plano = ((contrib_cac - (fixos / plano if plano else math.inf)) / p) if p else None

    meses, acumulado, ativos, retorno_inv = [], -invest, 0.0, None
    vendas_antes = 0.0
    for m, vendas in enumerate(rampa, start=1):
        ativos = (ativos + vendas_antes) * sobrevive if mens else 0.0
        receita = vendas * p + ativos * (valor_m or 0.0)
        custo_var = vendas * var + ativos * (custo_m or 0.0)
        aquisicao = vendas * (cac or 0.0)
        lucro = receita - custo_var - aquisicao - fixos
        acumulado += lucro
        if retorno_inv is None and acumulado >= 0:
            retorno_inv = m
        meses.append({"mes": m, "vendas": vendas, "ativos": ativos, "receita": receita, "variavel": custo_var,
                      "aquisicao": aquisicao, "fixos": fixos, "lucro": lucro, "acumulado": acumulado})
        vendas_antes = vendas
    lucro_ano = sum(x["lucro"] for x in meses)
    receita_ano = sum(x["receita"] for x in meses)
    caixa = -min([-invest] + [x["acumulado"] for x in meses])
    m12 = meses[-1]
    margem_m12 = (m12["lucro"] / m12["receita"]) if m12["receita"] else None

    unid = spec.get("unidade", "venda")
    unid_pl = spec.get("unidade_plural", unid + "s")
    alertas = []
    if contrib <= 0:
        alertas.append("Cada %s perde dinheiro antes dos custos fixos: o preço está abaixo do custo variável." % unid)
    elif contrib_cac <= 0 and not mens:
        alertas.append("O anúncio come a %s inteira: o CAC passa do que cada %s deixa." % (unid, unid))
    if cap is not None and equilibrio_mes > cap and not math.isinf(equilibrio_mes):
        alertas.append("O equilíbrio pede %s %s por mês e a capacidade é %s." % (inteiro(math.ceil(equilibrio_mes)), unid_pl, inteiro(cap)))
    if cap is not None and plano > cap:
        alertas.append("O plano (%s por mês) passa da capacidade (%s)." % (inteiro(plano), inteiro(cap)))
    if lucro_ano < 0:
        alertas.append("O ano 1 fecha no vermelho na operação (%s)." % reais(lucro_ano, 0))
    if invest and retorno_inv is None:
        alertas.append("O investimento inicial não volta dentro do ano 1.")
    if mens and canc is None:
        alertas.append("Falta o cancelamento mensal: sem ele o valor da mensalidade fica inflado.")
    if mens and canc == 0:
        alertas.append("Cancelamento zero é irreal; a vida do cliente foi limitada a %d meses." % HORIZONTE)
    if mens and contrib_m <= 0:
        alertas.append("A mensalidade não paga o próprio custo mensal.")

    return {
        "negocio": spec.get("negocio", ""), "unidade": unid, "unidade_plural": unid_pl,
        "preco": p, "custo_variavel": var, "contribuicao": contrib, "contribuicao_pct": contrib_pct,
        "cac": cac, "contribuicao_apos_cac": contrib_cac, "custos_fixos": fixos, "investimento": invest,
        "mensalidade": valor_m, "custo_mensal": custo_m, "cancelamento": canc, "contribuicao_mensal": contrib_m,
        "meses_de_vida": meses_vida, "ltv": ltv, "ltv_cac": ltv_cac, "teto_cac": teto_cac, "retorno_cac_meses": retorno_cac,
        "plano_por_mes": plano, "dias_por_mes": dias, "capacidade_por_mes": cap,
        "equilibrio_por_mes": equilibrio_mes, "equilibrio_por_dia": (equilibrio_mes / dias) if dias else None,
        "ativos_que_pagam_fixos": ativos_pagam_fixos, "margem_no_plano": margem_plano, "margem_mes_12": margem_m12,
        "receita_ano1": receita_ano, "lucro_ano1": lucro_ano, "ano1_apos_investimento": lucro_ano - invest,
        "retorno_investimento_mes": retorno_inv, "caixa_necessario": caixa, "meses": meses, "alertas": alertas,
        "regras": {"ltv_cac_minimo": ltv_min, "retorno_cac_max_meses": retorno_max, "exige_mensalidade": exige_mens},
        "itens_variaveis": spec.get("custo_variavel") or [], "itens_fixos": spec.get("custos_fixos_mensais") or [],
        "itens_investimento": spec.get("investimento_inicial") or [],
    }


def veredito(a):
    """Cada checagem: (nome, estado, detalhe), estado em ok / falha / incompleto / não se aplica."""
    r = a["regras"]
    c = []
    c.append(("cada %s paga o próprio custo" % a["unidade"], "ok" if a["contribuicao"] > 0 else "falha",
              "sobra %s por %s antes do anúncio" % (reais(a["contribuicao"]), a["unidade"])))
    if a["cac"] is None:
        c.append(("o cliente vale %s vezes o CAC" % inteiro(r["ltv_cac_minimo"]), "incompleto", "falta o cac (custo por venda vindo do anúncio)"))
        c.append(("o CAC volta em até %s meses" % inteiro(r["retorno_cac_max_meses"]), "incompleto", "falta o cac"))
    else:
        if a["cac"] == 0:
            c.append(("o cliente vale %s vezes o CAC" % inteiro(r["ltv_cac_minimo"]), "ok", "CAC zero"))
        else:
            c.append(("o cliente vale %s vezes o CAC" % inteiro(r["ltv_cac_minimo"]),
                      "ok" if a["ltv_cac"] >= r["ltv_cac_minimo"] else "falha",
                      "LTV %s / CAC %s = %s" % (reais(a["ltv"]), reais(a["cac"]), dec1(a["ltv_cac"]))))
        rc = a["retorno_cac_meses"]
        c.append(("o CAC volta em até %s meses" % inteiro(r["retorno_cac_max_meses"]),
                  "ok" if rc is not None and rc <= r["retorno_cac_max_meses"] else "falha",
                  ("volta no mês %d" % rc if rc else "volta na própria venda") if rc is not None else "não volta em %d meses" % RETORNO_MAX))
    c.append(("o ano 1 fecha no azul", "ok" if a["lucro_ano1"] >= 0 else "falha", "lucro operacional %s" % reais(a["lucro_ano1"], 0)))
    if a["capacidade_por_mes"] is None:
        c.append(("o equilíbrio cabe na capacidade", "não se aplica", "capacidade não informada"))
    elif math.isinf(a["equilibrio_por_mes"]) and a["mensalidade"] is not None:
        c.append(("o equilíbrio cabe na capacidade", "não se aplica", "a venda única não paga o anúncio; o equilíbrio vem das mensalidades (veja o ano 1)"))
    else:
        cabe = a["equilibrio_por_mes"] <= a["capacidade_por_mes"]
        c.append(("o equilíbrio cabe na capacidade", "ok" if cabe else "falha",
                  "precisa de %s, cabe %s por mês" % ("nunca" if math.isinf(a["equilibrio_por_mes"]) else inteiro(math.ceil(a["equilibrio_por_mes"])), inteiro(a["capacidade_por_mes"]))))
    if a["mensalidade"] is None:
        c.append(("a oferta tem plano mensal", "falha" if r["exige_mensalidade"] else "não se aplica",
                  "regra da casa: toda oferta da Creat tem mensalidade" if r["exige_mensalidade"] else "sem mensalidade neste negócio"))
    else:
        c.append(("a mensalidade se paga", "ok" if a["contribuicao_mensal"] > 0 else "falha",
                  "sobra %s por cliente ativo por mês" % reais(a["contribuicao_mensal"])))
        c.append(("o cancelamento foi informado", "ok" if a["cancelamento"] is not None else "incompleto",
                  pct(a["cancelamento"]) + " ao mês" if a["cancelamento"] is not None else "falta mensalidade.cancelamento_mensal"))
    estados = [e for _, e, _ in c]
    if "falha" in estados:
        final = "não passa ainda"
    elif "incompleto" in estados:
        final = "incompleto"
    else:
        final = "passa"
    return final, c


def cenarios(spec):
    """Os testes de estresse que todo plano precisa aguentar."""
    base = analisar(spec)
    linhas = [("Plano", base), ("Preço -10%", analisar(spec, preco=base["preco"] * 0.9)),
              ("Volume -20%", analisar(spec, volume=0.8)), ("Custo variável +15%", analisar(spec, mult_custo=1.15))]
    if base["cac"]:
        linhas.append(("CAC +30%", analisar(spec, mult_cac=1.3)))
    if base["mensalidade"] is not None and base["cancelamento"]:
        linhas.append(("Cancelamento em dobro", analisar(spec, mult_cancelamento=2.0)))
    return linhas


def relatorio(spec, a):
    u, up = a["unidade"], a["unidade_plural"]
    fim, checagens = veredito(a)
    L = ["# Conta da oferta: %s" % (a["negocio"] or "sem nome"), ""]
    L.append("Todo número abaixo sai do arquivo de entrada. Nada foi buscado nem chutado. Não é consultoria contábil: "
             "imposto, folha e estrutura passam pelo contador antes de o dinheiro se mexer.")
    L += ["", "## Veredito: %s" % fim, "", "| checagem | estado | conta |", "| --- | --- | --- |"]
    for nome, estado, det in checagens:
        L.append("| %s | %s | %s |" % (nome, estado, det))
    L += ["", "## Uma %s" % u, "", "| linha | por %s |" % u, "| --- | ---: |", "| Preço | %s |" % reais(a["preco"])]
    for it in a["itens_variaveis"]:
        L.append("| %s | -%s |" % (it.get("rotulo", "custo"), reais(numero(it["custo"]))))
    L.append("| **Contribuição** (o que cada %s deixa para pagar os fixos) | **%s** (%s) |" % (u, reais(a["contribuicao"]), pct(a["contribuicao_pct"])))
    if a["cac"] is not None:
        L.append("| CAC (anúncio por %s) | -%s |" % (u, reais(a["cac"])))
        L.append("| **Depois do anúncio** | **%s** |" % reais(a["contribuicao_apos_cac"]))
    if a["mensalidade"] is not None:
        L += ["", "## A mensalidade", ""]
        L.append("- %s por mês, custo de %s por cliente ativo: sobra **%s**." % (reais(a["mensalidade"]), reais(a["custo_mensal"]), reais(a["contribuicao_mensal"])))
        L.append("- Cancelamento: %s ao mês. Vida esperada: **%s mensalidades** por cliente." % (pct(a["cancelamento"]) if a["cancelamento"] is not None else "não informado", dec1(a["meses_de_vida"])))
        if a["ativos_que_pagam_fixos"] is not None:
            L.append("- Clientes ativos que pagam os fixos sozinhos: **%s**." % inteiro(math.ceil(a["ativos_que_pagam_fixos"])))
    L += ["", "## Quanto vale um cliente e quanto dá para pagar por ele", ""]
    L.append("- **Valor do cliente (LTV, antes do anúncio): %s.**" % reais(a["ltv"]))
    if a["teto_cac"] is not None:
        L.append("- **Teto de CAC** para manter %s vezes: **%s por %s.** Acima disso o anúncio não se paga." % (inteiro(a["regras"]["ltv_cac_minimo"]), reais(a["teto_cac"]), u))
    if a["cac"] is not None:
        rc = a["retorno_cac_meses"]
        L.append("- CAC de hoje: %s. Volta %s." % (reais(a["cac"]), ("na própria venda" if rc == 0 else "no mês %d" % rc) if rc is not None else "em mais de %d meses" % RETORNO_MAX))
    L += ["", "## Equilíbrio", "", "Custos fixos: %s por mês (%s)." % (reais(a["custos_fixos"], 0), ", ".join(
        "%s %s" % (it.get("rotulo", "custo"), reais(numero(it["custo"]), 0)) for it in a["itens_fixos"]) or "nenhum informado"), ""]
    be = a["equilibrio_por_mes"]
    txt = "nunca (cada %s perde dinheiro depois do anúncio)" % u if math.isinf(be) else "%s %s por mês" % (inteiro(math.ceil(be)), up)
    if a["equilibrio_por_dia"] is not None and not math.isinf(be):
        txt += " (%s por dia)" % inteiro(math.ceil(a["equilibrio_por_dia"]))
    L.append("- **Equilíbrio só com a venda única: %s.** Na rampa, um mês pode perder mesmo acima disso, porque o anúncio e os fixos chegam antes das mensalidades." % txt)
    if a["margem_no_plano"] is not None:
        L.append("- **Margem no plano** (%s %s por mês): **%s** de cada venda, depois de todo custo." % (inteiro(a["plano_por_mes"]), up, pct(a["margem_no_plano"])))
    if a["margem_mes_12"] is not None:
        L.append("- Margem do mês 12, com mensalidades: %s." % pct(a["margem_mes_12"]))
    if a["capacidade_por_mes"] is not None:
        L.append("- Capacidade: %s por mês." % inteiro(a["capacidade_por_mes"]))
    L += ["", "## Ano 1, mês a mês", "", "| mês | %s | ativos | receita | lucro | acumulado (depois de %s de investimento) |" % (up, reais(a["investimento"], 0)),
          "| ---: | ---: | ---: | ---: | ---: | ---: |"]
    for m in a["meses"]:
        L.append("| %d | %s | %s | %s | %s | %s |" % (m["mes"], inteiro(m["vendas"]), inteiro(m["ativos"]), reais(m["receita"], 0), reais(m["lucro"], 0), reais(m["acumulado"], 0)))
    L += ["", "- **Lucro operacional do ano 1: %s** sobre %s de receita." % (reais(a["lucro_ano1"], 0), reais(a["receita_ano1"], 0)),
          "- Depois do investimento de %s: %s." % (reais(a["investimento"], 0), reais(a["ano1_apos_investimento"], 0)),
          "- Investimento de volta: %s." % ("mês %d" % a["retorno_investimento_mes"] if a["retorno_investimento_mes"] else "não volta no ano 1"),
          "- Caixa necessário até se pagar: **%s**." % reais(a["caixa_necessario"], 0), "",
          "## E se", "", "| cenário | veredito | margem no plano | equilíbrio por mês | lucro do ano 1 |", "| --- | --- | ---: | ---: | ---: |"]
    for nome, s in cenarios(spec):
        be = s["equilibrio_por_mes"]
        L.append("| %s | %s | %s | %s | %s |" % (nome, veredito(s)[0], pct(s["margem_no_plano"]),
                                                "nunca" if math.isinf(be) else inteiro(math.ceil(be)), reais(s["lucro_ano1"], 0)))
    L.append("")
    if a["alertas"]:
        L += ["## Alertas", ""] + ["- %s" % x for x in a["alertas"]]
    else:
        L.append("Sem alerta nestes números. Eles valem o que valem as entradas: confira cada custo com orçamento real.")
    return "\n".join(L) + "\n"


def _pode_gravar(caminho):
    if not caminho.endswith(".md"):
        raise ErroNumeros("--saida precisa terminar em .md")
    pasta = os.path.dirname(os.path.abspath(caminho))
    if not os.path.isdir(pasta):
        raise ErroNumeros("a pasta de --saida não existe: %s" % pasta)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Calculadora de oferta da Creat Nuvem.")
    ap.add_argument("dados", help="o arquivo JSON com os números")
    ap.add_argument("--saida", help="grava o relatório aqui (.md)")
    ap.add_argument("--json", action="store_true", help="imprime os números em JSON")
    ap.add_argument("--preco", help="preço de teste, sem mexer no arquivo (aceita '179,90')")
    ap.add_argument("--volume", default="1", help="multiplica todo volume (0,8 = 20%% menos vendas)")
    args = ap.parse_args(argv)
    try:
        spec = carregar(args.dados)
        if args.preco is not None:
            spec = dict(spec, preco=numero(args.preco, "--preco"))
        vol = numero(args.volume, "--volume")
        if vol <= 0:
            raise ErroNumeros("--volume precisa ser maior que zero")
        if vol != 1.0:
            spec = dict(spec)
            for k in ("plano_por_dia", "plano_por_mes"):
                if k in spec:
                    spec[k] = numero(spec[k], k) * vol
            for k in ("rampa_por_dia", "rampa_por_mes"):
                if isinstance(spec.get(k), list):
                    spec[k] = [numero(x, k) * vol for x in spec[k]]
        a = analisar(spec)
        if args.saida:
            _pode_gravar(args.saida)
        if args.json:
            out = {k: v for k, v in a.items() if not k.startswith("itens_")}
            out["equilibrio_por_mes"] = None if math.isinf(out["equilibrio_por_mes"]) else out["equilibrio_por_mes"]
            out["veredito"], chk = veredito(a)
            out["checagens"] = [{"checagem": n, "estado": e, "conta": d} for n, e, d in chk]
            print(json.dumps(out, indent=1, ensure_ascii=False))
            return 0
        texto = relatorio(spec, a)
    except ErroNumeros as e:
        print("erro: %s" % e, file=sys.stderr)
        return 2
    if args.saida:
        with open(args.saida, "w", encoding="utf-8") as fh:
            fh.write(texto)
        print("gravado %s (veredito: %s)" % (args.saida, veredito(a)[0]))
    else:
        sys.stdout.write(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main())
