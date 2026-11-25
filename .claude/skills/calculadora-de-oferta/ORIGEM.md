# Origem

- Skill original: `founder-cfo` (com `unit_economics.py`), do pacote founder-skill de Jake Schincariol. Duas ideias do `founder-plan` (`compile.py`) entraram aqui: veredito calculado por regras e o estado "incompleto" em vez de chute.
- Fonte: https://github.com/Jakeschincariol/founder-skill, pastas `skills/founder-cfo/` e `skills/founder-plan/`, commit `fd9385b0cfe1b96bebce3898fbd506d73eff5a9d` (06/10/2026, commit único "v1.0").
- Licença: MIT, Copyright (c) 2026 Jake Schincariol. Texto integral abaixo e em `LICENSE` nesta pasta.
- Como chegou aqui: Reel do perfil @erickcastilio.ia sobre o pacote founder-skill, mandado pelo dono em 12/11/2026. Estudo integral pelo Radar no mesmo dia.
- Reputação: estrelas, forks e issues **não verificados**. Entrou copiado e revisado, nunca instalado. O `compile.py` **não** foi trazido: carrega o arquivo vizinho com `importlib` (executa no import), está preso à pasta `founder/` e a um piso de 25% de painel simulado, e usa símbolos de marcação que a casa não usa.

## O que mudou e por quê

| mudança | por quê |
|---|---|
| Moeda em reais, vírgula decimal, ponto de milhar, textos em português | O original tinha `$` fixo e inglês ("1 vendas a day" com a unidade "venda"). |
| Leitor de número em português (`numero()`) que aceita "29,90", "1.500,00", "R$ 29,90" e recusa o ambíguo | O `van_westendorp.py` do mesmo pacote transformava "29,90" em 2990 sem aviso; a casa não aceita esse tipo de erro silencioso. |
| CAC por venda, mensalidade, custo mensal, cancelamento, clientes ativos mês a mês, LTV, teto de CAC, retorno do CAC | Regra da casa: toda oferta tem plano mensal, e a aquisição é comprada. Sem isso o original era só calculadora de equilíbrio. |
| Veredito calculado (passa, não passa ainda, incompleto) com checagens listadas; regra `exige_mensalidade` | Ideia do `founder-plan`: o veredito sai das contas, e falta de dado aparece como incompleto. |
| Cenários CAC +30% e cancelamento em dobro, cada cenário com o próprio veredito | Os dois riscos que mais mudam a conta de quem vende por anúncio com mensalidade. |
| Volume por mês ou por dia (não os dois ao mesmo tempo) | Agência pensa por mês; negócio local (cortes, pedidos) por dia. |
| `--saida` só grava `.md` em pasta existente | O `--out` do original aceitava qualquer caminho. |
| Correção: o alerta de capacidade quebrava com equilíbrio infinito (achado pelos testes da casa); a frase "abaixo disso você perde todo mês" foi trocada por uma que vale com rampa | Defeitos 4 do estudo e um novo. |
| Exemplo fictício de site para salão no lugar do café de Toronto | Repositório público: só caso fictício marcado, sem número real de cliente nem de gasto. |

## Revisão de 12/11/2026 (Forja)

- `unit_economics.py` lido linha a linha: só biblioteca padrão (argparse, json, math, sys), sem rede, sem comando, sem variável de ambiente; escrita só em `--out`. A versão da casa usa argparse, json, math, os, re, sys, e o `os` só confere a pasta de saída.
- 17 testes próprios (`testes/test_oferta.py`). O primeiro grupo reproduz o exemplo original (4,76 por copo; 186 por dia; 38%; 93.926 no ano; investimento de 25.280; retorno no mês 8; caixa de 34.092): a conta central não mudou. Rodados com `python3 -I` a partir da pasta da casa: todos passam.
- Pendente antes do primeiro uso real: revisão da Muralha e do Crivo; primeira conta de verdade com números medidos.

## Licença do original (MIT), texto integral

MIT License

Copyright (c) 2026 Jake Schincariol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
