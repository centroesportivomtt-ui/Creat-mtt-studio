"""Testes do oferta.py. Rodar da raiz da casa:
python3 -I -m unittest discover -s .claude/skills/calculadora-de-oferta/testes -v
O primeiro grupo reproduz os números do exemplo original de founder-cfo (Jake Schincariol, MIT, commit fd9385b0),
para provar que a conta central não mudou na adaptação."""

import importlib.util
import json
import math
import os
import shutil
import tempfile
import unittest

PASTA = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("oferta_casa", os.path.join(PASTA, "oferta.py"))
of = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(of)


def original():
    """O café de matcha fictício do exemplo original, só com os nomes dos campos traduzidos."""
    return {
        "negocio": "café fictício do exemplo original", "unidade": "copo", "preco": 6.50,
        "custo_variavel": [{"rotulo": "matcha", "custo": 0.92}, {"rotulo": "leite", "custo": 0.38},
                           {"rotulo": "copo", "custo": 0.24}, {"rotulo": "taxa do cartão", "custo": 0.20}],
        "custos_fixos_mensais": [{"rotulo": "equipe", "custo": 15500}, {"rotulo": "aluguel", "custo": 11040}],
        "investimento_inicial": [{"custo": 8400}, {"custo": 6900}, {"custo": 4250}, {"custo": 1850}, {"custo": 2380}, {"custo": 1500}],
        "dias_por_mes": 30, "capacidade_por_dia": 600, "plano_por_dia": 383,
        "rampa_por_dia": [140, 170, 195, 215, 235, 250, 262, 272, 280, 287, 290, 292],
    }


def exemplo():
    with open(os.path.join(PASTA, "exemplo.json"), encoding="utf-8") as fh:
        return json.load(fh)


class ContaOriginal(unittest.TestCase):
    def test_reproduz_o_exemplo_original(self):
        a = of.analisar(original())
        self.assertAlmostEqual(a["contribuicao"], 4.76, places=2)
        self.assertEqual(round(a["margem_no_plano"] * 100), 38)
        self.assertEqual(math.ceil(a["equilibrio_por_dia"]), 186)
        self.assertEqual(round(a["lucro_ano1"]), 93926)
        self.assertEqual(a["investimento"], 25280)
        self.assertEqual(a["retorno_investimento_mes"], 8)
        self.assertEqual(round(a["caixa_necessario"]), 34092)
        self.assertEqual(a["alertas"], [])

    def test_preco_abaixo_do_custo_vira_alerta_e_falha(self):
        s = original()
        s["preco"] = 1.50
        a = of.analisar(s)
        self.assertTrue(math.isinf(a["equilibrio_por_mes"]))
        self.assertTrue(any("perde dinheiro" in x for x in a["alertas"]))
        self.assertEqual(of.veredito(a)[0], "não passa ainda")

    def test_equilibrio_acima_da_capacidade(self):
        s = original()
        s["capacidade_por_dia"] = 150
        a = of.analisar(s)
        self.assertTrue(any("capacidade é 4.500" in x for x in a["alertas"]))

    def test_cenarios_andam_para_o_lado_certo(self):
        base = of.analisar(original())
        barato = of.analisar(original(), preco=base["preco"] * 0.9)
        menos = of.analisar(original(), volume=0.8)
        self.assertLess(barato["lucro_ano1"], base["lucro_ano1"])
        self.assertGreater(barato["equilibrio_por_mes"], base["equilibrio_por_mes"])
        self.assertLess(menos["lucro_ano1"], base["lucro_ano1"])
        self.assertEqual(len(of.cenarios(original())), 4)  # sem CAC e sem mensalidade

    def test_entrada_ruim_e_recusada_nao_chutada(self):
        s = original()
        s["rampa_por_dia"] = [100] * 11
        with self.assertRaises(of.ErroNumeros):
            of.analisar(s)
        s = original()
        del s["preco"]
        with self.assertRaises(of.ErroNumeros):
            of.analisar(s)
        s = original()
        s["custo_variavel"][0]["custo"] = "muito"
        with self.assertRaises(of.ErroNumeros):
            of.analisar(s)
        s = original()
        s["plano_por_mes"] = 100
        with self.assertRaises(of.ErroNumeros):
            of.analisar(s)  # por dia e por mês ao mesmo tempo

    def test_sem_cac_fica_incompleto(self):
        fim, chk = of.veredito(of.analisar(original()))
        self.assertEqual(fim, "incompleto")
        self.assertIn("incompleto", [e for _, e, _ in chk])


class Numeros(unittest.TestCase):
    def test_virgula_decimal_e_ponto_de_milhar(self):
        casos = {"29,90": 29.9, "1.500,00": 1500.0, "R$ 29,90": 29.9, "R$29,90": 29.9, "1.500": 1500.0,
                 "1.500.000": 1500000.0, "29.90": 29.9, "0.125": 0.125, "0,08": 0.08, "-12,5": -12.5,
                 "R$ 1.234,56": 1234.56, 7: 7.0, 2.5: 2.5}
        for entrada, esperado in casos.items():
            self.assertAlmostEqual(of.numero(entrada), esperado, places=6, msg=repr(entrada))

    def test_estranho_vira_erro(self):
        for ruim in ("", "abc", "1,2,3", "12.34,5.6", "1.50,00", "US$ 10", ",5", "5,", True, None, [1], float("nan")):
            with self.assertRaises(of.ErroNumeros, msg=repr(ruim)):
                of.numero(ruim)

    def test_formato_em_reais(self):
        self.assertEqual(of.reais(1234.5), "R$ 1.234,50")
        self.assertEqual(of.reais(-93926.4, 0), "-R$ 93.926")
        self.assertEqual(of.dec1(5.55), "5,5" if ("%.1f" % 5.55) == "5.5" else "5,6")


class Recorrencia(unittest.TestCase):
    def test_exemplo_da_casa(self):
        a = of.analisar(exemplo())
        self.assertAlmostEqual(a["contribuicao"], 177.03, places=2)
        self.assertAlmostEqual(a["contribuicao_mensal"], 42.5, places=2)
        self.assertAlmostEqual(a["meses_de_vida"], 0.92 / 0.08, places=6)
        self.assertAlmostEqual(a["ltv"], 177.03 + 42.5 * 11.5, places=2)
        self.assertEqual(a["retorno_cac_meses"], 0)  # a Abertura já paga o anúncio
        self.assertAlmostEqual(a["teto_cac"], a["ltv"] / 3, places=6)
        self.assertEqual(math.ceil(a["equilibrio_por_mes"]), 9)  # 510 / 57,03
        self.assertEqual(a["meses"][0]["ativos"], 0)
        self.assertAlmostEqual(a["meses"][1]["ativos"], 4 * 0.92, places=6)
        self.assertAlmostEqual(a["meses"][2]["ativos"], (4 * 0.92 + 6) * 0.92, places=6)
        self.assertEqual(of.veredito(a)[0], "passa")
        self.assertEqual(len(of.cenarios(exemplo())), 6)

    def test_cac_alto_reprova_e_mostra_o_mes_de_retorno(self):
        s = exemplo()
        s["cac"] = "400,00"
        a = of.analisar(s)
        self.assertEqual(a["retorno_cac_meses"], 8)  # 177,03 + 42,5 x (0,92 + 0,92² + ... + 0,92^8) = 415 passa de 400 no 8º mês; no 7º dá 393
        fim, chk = of.veredito(a)
        self.assertEqual(fim, "não passa ainda")
        self.assertEqual(dict((n, e) for n, e, _ in chk)["o cliente vale 3 vezes o CAC"], "falha")

    def test_sem_cancelamento_fica_incompleto(self):
        s = exemplo()
        del s["mensalidade"]["cancelamento_mensal"]
        a = of.analisar(s)
        self.assertEqual(of.veredito(a)[0], "incompleto")
        self.assertTrue(any("Falta o cancelamento" in x for x in a["alertas"]))

    def test_cancelamento_zero_tem_teto(self):
        s = exemplo()
        s["mensalidade"]["cancelamento_mensal"] = 0
        a = of.analisar(s)
        self.assertEqual(a["meses_de_vida"], of.HORIZONTE)
        self.assertTrue(any("irreal" in x for x in a["alertas"]))

    def test_regra_da_casa_exige_mensalidade(self):
        s = exemplo()
        del s["mensalidade"]
        fim, chk = of.veredito(of.analisar(s))
        self.assertEqual(fim, "não passa ainda")
        self.assertEqual(dict((n, e) for n, e, _ in chk)["a oferta tem plano mensal"], "falha")

    def test_volume_por_mes_e_capacidade(self):
        s = exemplo()
        s["capacidade_por_mes"] = 5
        fim, chk = of.veredito(of.analisar(s))
        self.assertEqual(dict((n, e) for n, e, _ in chk)["o equilíbrio cabe na capacidade"], "falha")


class Linha(unittest.TestCase):
    def test_saida_so_md_e_codigos(self):
        d = tempfile.mkdtemp()
        try:
            ex = os.path.join(PASTA, "exemplo.json")
            self.assertEqual(of.main([ex, "--saida", os.path.join(d, "x.txt")]), 2)
            self.assertEqual(of.main([ex, "--saida", os.path.join(d, "nao-existe", "x.md")]), 2)
            self.assertEqual(of.main([ex, "--saida", os.path.join(d, "conta.md"), "--preco", "179,90", "--volume", "0,8"]), 0)
            with open(os.path.join(d, "conta.md"), encoding="utf-8") as fh:
                texto = fh.read()
            self.assertIn("R$ 179,90", texto)
            self.assertIn("## Veredito:", texto)
            self.assertEqual(of.main([os.path.join(d, "nada.json")]), 2)
        finally:
            shutil.rmtree(d)

    def test_relatorio_sem_emoji_nem_simbolo_de_dolar(self):
        texto = of.relatorio(exemplo(), of.analisar(exemplo()))
        self.assertNotIn("$ ", texto.replace("R$ ", ""))
        self.assertFalse(any(ord(ch) > 0x2000 for ch in texto))


if __name__ == "__main__":
    unittest.main()
