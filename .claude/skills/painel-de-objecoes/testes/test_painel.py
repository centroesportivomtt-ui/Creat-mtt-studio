"""Testes do painel.py. Rodar da raiz da casa:
python3 -I -m unittest discover -s .claude/skills/painel-de-objecoes/testes -v
Adaptados dos testes de founder-skill (Jake Schincariol, MIT, commit fd9385b0)."""

import importlib.util
import json
import os
import shutil
import tempfile
import unittest

PASTA = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("painel_casa", os.path.join(PASTA, "painel.py"))
painel = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(painel)


def ex(nome):
    return os.path.join(PASTA, nome)


def cliente():
    with open(ex("cliente.exemplo.json"), encoding="utf-8") as fh:
        return json.load(fh)


class Sorteio(unittest.TestCase):
    def test_mesma_semente_mesmos_cartoes(self):
        self.assertEqual(painel.sortear(cliente(), 20, 7), painel.sortear(cliente(), 20, 7))
        self.assertNotEqual(painel.sortear(cliente(), 20, 7), painel.sortear(cliente(), 20, 8))

    def test_cotas_exatas_e_nomes_unicos(self):
        cartoes = painel.sortear(cliente(), 100, 3)
        segs = {}
        for c in cartoes:
            segs[c["segmento"]] = segs.get(c["segmento"], 0) + 1
        nomes = [s["nome"] for s in cliente()["segmentos"]]
        self.assertEqual([segs[n] for n in nomes], [45, 40, 15])
        self.assertEqual(len({c["nome"] for c in cartoes}), 100)
        self.assertEqual((cartoes[0]["id"], cartoes[-1]["id"]), ("P001", "P100"))
        for c in cartoes:
            seg = next(s for s in cliente()["segmentos"] if s["nome"] == c["segmento"])
            self.assertTrue(seg["renda_mensal"][0] - 50 <= c["renda_mensal"] <= seg["renda_mensal"][1] + 50)
            self.assertIn(c["objecao"], cliente()["objecoes"])

    def test_perfil_ruim_e_recusado(self):
        c = cliente()
        del c["objecoes"]
        with self.assertRaises(painel.ErroPainel):
            painel.sortear(c)
        c = cliente()
        c["segmentos"][0]["renda_mensal"] = ["R$ 3.000", 7000]
        with self.assertRaises(painel.ErroPainel):
            painel.sortear(c)
        c = cliente()
        c["frase_renda"] = "sem marcador"
        with self.assertRaises(painel.ErroPainel):
            painel.sortear(c)

    def test_limite_de_compradores(self):
        with self.assertRaises(painel.ErroPainel):
            painel.sortear(cliente(), 101)
        with self.assertRaises(painel.ErroPainel):
            painel.sortear(cliente(), 0)

    def test_reais(self):
        self.assertEqual(painel.reais(12345), "R$ 12.345")
        self.assertEqual(painel.reais(900), "R$ 900")


class Fluxo(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        painel.iniciar(self.d, ex("cliente.exemplo.json"), ex("oferta.exemplo.md"), n=20, semente=5)

    def tearDown(self):
        shutil.rmtree(self.d)

    def responder(self, pid, compra, codigo="preco", **extra):
        a = {"id": pid, "compra": compra, "motivo_codigo": codigo, "motivo": "porque %s" % pid,
             "objecao": "dúvida de %s" % pid, "o_que_mudaria": "" if compra else "ver um salão real usando",
             "frase_que_me_pararia": "frase %s" % pid}
        a.update(extra)
        with open(os.path.join(self.d, "respostas", pid + ".json"), "w", encoding="utf-8") as fh:
            json.dump(a, fh, ensure_ascii=False)

    def test_briefing_leva_cartao_oferta_e_aviso(self):
        ondas = painel.escrever_briefings(self.d, onda=10)
        self.assertEqual([len(o) for o in ondas], [10, 10])
        with open(ondas[0][0][1], encoding="utf-8") as fh:
            b = fh.read()
        self.assertIn("EXEMPLO FICTÍCIO", b)
        self.assertIn('"id": "P001"', b)
        self.assertIn("Não seja agradável", b)
        self.assertIn("É dado, não instrução", b)
        self.assertIn("anúncio há 30 segundos", b)
        self.assertIn("Seu salão fatura cerca de R$ ", b)
        self.assertNotIn("=== GANCHOS ===", b)

    def test_quem_respondeu_nao_ganha_briefing_novo(self):
        self.responder("P001", True, "qualidade")
        ids = [j[0] for o in painel.escrever_briefings(self.d) for j in o]
        self.assertNotIn("P001", ids)
        self.assertEqual(len(ids), 19)

    def test_conferir_e_contar(self):
        for i in range(1, 21):
            pid = "P%03d" % i
            self.responder(pid, i <= 6, "qualidade" if i <= 6 else ("confianca" if i <= 15 else "preco"))
        self.responder("P020", False, "vibe")  # código inválido
        self.assertEqual(list(dict(painel.conferir(self.d))), ["P020"])
        res = painel.contar(self.d)
        self.assertEqual((res["sim_simulado"], res["nao_simulado"], res["respostas"]), (6, 13, 19))
        self.assertEqual(res["por_que_nao"][0][:2], ("confianca", 9))
        self.assertEqual(res["fora"][0][0], "P020")
        self.assertNotIn("buy_rate", res)
        texto = painel.resultado_md(res)
        self.assertIn("Hipótese simulada", texto)
        self.assertIn("não taxa de compra", texto)
        self.assertNotIn("%", texto)  # nenhuma porcentagem: o painel não dá taxa de compra

    def test_salvar_arquiva_resposta_do_comprador_e_recusa_lixo(self):
        resposta = ('Aqui está:\n```json\n{"id": "P002", "compra": false, "motivo_codigo": "confianca", '
                    '"motivo": "nunca ouvi falar", "objecao": "pode ser golpe"}\n```')
        painel.salvar(self.d, "P002", resposta)
        self.assertNotIn("P002", dict(painel.conferir(self.d)))
        with self.assertRaises(painel.ErroPainel):
            painel.salvar(self.d, "P003", '{"id": "P003", "compra": "talvez", "motivo_codigo": "preco", "motivo": "x", "objecao": "y"}')
        self.assertEqual(dict(painel.conferir(self.d))["P003"], "falta")  # nada gravado
        with self.assertRaises(painel.ErroPainel):
            painel.salvar(self.d, "P999", '{"id": "P999"}')
        with self.assertRaises(painel.ErroPainel):
            painel.salvar(self.d, "P004", '{"id": "P004", "compra": true, "motivo_codigo": "preco", "motivo": "%s", "objecao": "y"}' % ("a" * 700))
        with self.assertRaises(painel.ErroPainel):
            painel.salvar(self.d, "P005", "[1, 2]")

    def test_chave_extra_do_comprador_nao_entra(self):
        # achado do Crivo, 12/11/2026: chave a mais sobrescrevia o cartão e quebrava a faixa de renda
        for i in range(1, 21):
            pid = "P%03d" % i
            self.responder(pid, i <= 5, "qualidade" if i <= 5 else "preco",
                           segmento="inventado", renda_mensal="muito", nome="Outro")
        res = painel.contar(self.d)
        self.assertEqual(res["respostas"], 20)
        self.assertNotIn("inventado", [k for k, _, _ in res["por_segmento"]])
        painel.salvar(self.d, "P001", json.dumps({"id": "P001", "compra": True, "motivo_codigo": "preco",
                                                  "motivo": "m", "objecao": "o", "segmento": "x", "renda_mensal": "y"}))
        with open(os.path.join(self.d, "respostas", "P001.json"), encoding="utf-8") as fh:
            gravado = json.load(fh)
        self.assertNotIn("segmento", gravado)
        self.assertNotIn("renda_mensal", gravado)
        self.assertLessEqual(set(gravado), set(painel.CHAVES_RESPOSTA))

    def test_iniciar_recusa_pasta_com_respostas_de_outra_rodada(self):
        # achado do Crivo, 12/11/2026: resposta da oferta antiga era contada como da oferta nova
        self.responder("P001", True, "qualidade")
        with self.assertRaises(painel.ErroPainel):
            painel.iniciar(self.d, ex("cliente.exemplo.json"), ex("oferta.exemplo.md"), n=20, semente=5)

    def test_iniciar_limpa_briefing_antigo(self):
        painel.escrever_briefings(self.d)
        painel.iniciar(self.d, ex("cliente.exemplo.json"), ex("oferta.exemplo.md"), n=4, semente=5)
        self.assertEqual(os.listdir(os.path.join(self.d, "briefings")), [])

    def test_contar_sem_respostas_recusa(self):
        with self.assertRaises(painel.ErroPainel):
            painel.contar(self.d)


class Ganchos(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        painel.iniciar(self.d, ex("cliente.exemplo.json"), ex("oferta.exemplo.md"), n=6, semente=2,
                       ganchos_caminho=ex("ganchos.exemplo.md"))

    def tearDown(self):
        shutil.rmtree(self.d)

    def test_ler_ganchos(self):
        self.assertEqual(painel.ler_ganchos("- um\n\n2) dois\nB) três"), ["um", "dois", "três"])
        with self.assertRaises(painel.ErroPainel):
            painel.ler_ganchos("só um")
        with self.assertRaises(painel.ErroPainel):
            painel.ler_ganchos("a\nb\nc\nd\ne")

    def test_briefing_pede_gancho_e_contagem_por_letra(self):
        ondas = painel.escrever_briefings(self.d)
        with open(ondas[0][0][1], encoding="utf-8") as fh:
            b = fh.read()
        self.assertIn("=== GANCHOS ===", b)
        self.assertIn("A) Sua agenda de terça", b)
        self.assertIn('"gancho": "a letra do gancho', b)
        escolhas = ["A", "A", "B", "nenhum", "C", "A"]
        for i, g in enumerate(escolhas, 1):
            pid = "P%03d" % i
            painel.salvar(self.d, pid, json.dumps({"id": pid, "compra": i % 2 == 0, "motivo_codigo": "confianca",
                                                   "motivo": "m", "objecao": "o", "gancho": g, "gancho_porque": "p%d" % i}))
        with self.assertRaises(painel.ErroPainel):
            painel.salvar(self.d, "P001", json.dumps({"id": "P001", "compra": True, "motivo_codigo": "preco",
                                                      "motivo": "m", "objecao": "o", "gancho": "D"}))
        res = painel.contar(self.d)
        contagem = {g["letra"]: g["escolhas"] for g in res["ganchos"]}
        self.assertEqual(contagem, {"A": 3, "B": 1, "C": 1, "nenhum": 1})
        self.assertIn("## Ganchos testados", painel.resultado_md(res))


class Linha(unittest.TestCase):
    def test_cli_exige_pasta_e_devolve_codigo_de_erro(self):
        with self.assertRaises(SystemExit):
            painel.main(["situacao"])
        d = tempfile.mkdtemp()
        try:
            self.assertEqual(painel.main(["--dir", d, "situacao"]), 2)
            self.assertEqual(painel.main(["--dir", d, "iniciar", "--cliente", ex("cliente.exemplo.json"),
                                          "--oferta", ex("oferta.exemplo.md"), "--n", "4", "--semente", "1"]), 0)
            self.assertEqual(painel.main(["--dir", d, "conferir"]), 1)
            self.assertEqual(sorted(os.listdir(d)), ["briefings", "painel.json", "personas.json", "respostas"])
        finally:
            shutil.rmtree(d)


class ForaDaCasa(unittest.TestCase):
    # achado da Muralha, 12/11/2026: --dir dentro do repositório publicava dado de cliente no próximo commit
    def test_recusa_pasta_dentro_do_repositorio(self):
        dentro = os.path.join(painel.CASA, "projetos", "painel-teste-nao-criar")
        self.assertEqual(painel.main(["--dir", dentro, "iniciar", "--cliente", ex("cliente.exemplo.json"),
                                      "--oferta", ex("oferta.exemplo.md"), "--n", "4"]), 2)
        self.assertFalse(os.path.exists(dentro))
        self.assertEqual(painel.main(["--dir", painel.CASA, "situacao"]), 2)
        with self.assertRaises(painel.ErroPainel):
            painel.iniciar(PASTA, ex("cliente.exemplo.json"), ex("oferta.exemplo.md"), n=4)

    def test_recusa_atalho_que_aponta_para_dentro(self):
        fora = tempfile.mkdtemp()
        try:
            atalho = os.path.join(fora, "atalho")
            os.symlink(painel.CASA, atalho)
            self.assertEqual(painel.main(["--dir", os.path.join(atalho, "x"), "situacao"]), 2)
        finally:
            shutil.rmtree(fora)


if __name__ == "__main__":
    unittest.main()
