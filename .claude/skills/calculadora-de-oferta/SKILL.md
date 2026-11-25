---
name: calculadora-de-oferta
description: Conta da oferta (unit economics em reais). A partir de um arquivo com preço, custos, CAC do anúncio, mensalidade e cancelamento, calcula o que cada venda deixa, o valor do cliente no tempo (LTV), o teto de CAC, em quantos meses o anúncio volta, o equilíbrio, o ano 1 mês a mês, o caixa necessário, os cenários de estresse e um veredito calculado (passa, não passa ainda, incompleto). Use quando o dono ou um agente disser "a conta fecha?", "faz as contas", "margem", "ponto de equilíbrio", "quanto posso pagar por cliente", "teto de CAC", "vale a pena anunciar", "unit economics", e antes de subir verba, mudar preço ou montar oferta para um nicho.
---

# Calculadora de oferta

Vem do `founder-cfo` do pacote founder-skill (Jake Schincariol, MIT, commit `fd9385b0`; ver `ORIGEM.md`). A conta central é a mesma do original (os testes reproduzem o exemplo dele número a número). O que a casa acrescentou é o que o original não tinha e a regra do dono exige: **reais com vírgula, CAC vindo do anúncio, mensalidade com cancelamento, LTV, teto de CAC, retorno do CAC e veredito que sai das contas**, nunca escrito à mão.

## A ferramenta

```bash
C="python3 -I -B /home/user/Creat-nuvem-VIBE-CODE/.claude/skills/calculadora-de-oferta/oferta.py"
$C <pasta>/dados.json --saida <pasta>/conta.md      # relatório
$C <pasta>/dados.json --json                        # os números, para outro agente ler
$C <pasta>/dados.json --preco "179,90"              # e se o preço fosse outro
$C <pasta>/dados.json --volume 0,8                  # e se vendesse 20% menos
```

Só biblioteca padrão, sem rede, sem comando. `--saida` só grava `.md` em pasta que já existe. Números de cliente ficam no scratchpad da sessão ou em pasta ignorada pelo git, nunca no repositório público.

## Passo 1: os números

Escreva `dados.json` no formato de `exemplo.json` (caso fictício). Todo número aceita `29.9`, `"29,90"`, `"1.500,00"` ou `"R$ 29,90"`; o que for ambíguo vira erro, nunca chute.

| campo | o que entra |
|---|---|
| `unidade` | o que se vende uma vez: Abertura, corte, pedido |
| `preco` | preço da venda única (0 se só houver mensalidade) |
| `custo_variavel` | custo de UMA venda: taxa do Pix, produção, comissão |
| `cac` | custo por venda vindo do anúncio: verba dividida por vendas pagas (Pix), nunca por clique ou conversa |
| `mensalidade` | `valor`, `custo_mensal` por cliente ativo, `cancelamento_mensal` de 0 a 1 |
| `custos_fixos_mensais` | o que se paga todo mês, venda ou não |
| `investimento_inicial` | gasto único antes de abrir (teste de anúncio, equipamento) |
| `plano_por_mes` ou `rampa_por_mes` | vendas por mês; a rampa tem 12 números (ou as versões `_por_dia` com `dias_por_mes`) |
| `capacidade_por_mes` | o máximo que dá para entregar |
| `regras` | `ltv_cac_minimo` (padrão 3), `retorno_cac_max_meses` (padrão 12), `exige_mensalidade` (true para oferta da Creat) |

De onde vêm os números, nesta ordem:
1. Medido: conta de anúncios (custo por Pix real, nunca por clique), contador do site, extrato do Pix, notas e orçamentos.
2. Preço público que dá para conferir, com o link e a data ao lado (em `fontes.md` na mesma pasta).
3. Estimativa, marcada como estimativa, com o raciocínio. Nunca apresentada como fato.

**A rampa é onde o plano mente.** Mês 1 quase nunca é o volume do plano. Se houver anúncio rodando, a rampa sai do custo por venda real; o painel de objeções **não** serve para estimar volume.

## Passo 2: rodar e ler o veredito

O relatório abre com o **veredito** e a tabela de checagens:

| checagem | passa quando |
|---|---|
| cada venda paga o próprio custo | preço maior que o custo variável |
| o cliente vale N vezes o CAC | LTV dividido pelo CAC chega ao mínimo das regras |
| o CAC volta em até N meses | venda única mais mensalidades (com cancelamento) pagam o anúncio no prazo |
| o ano 1 fecha no azul | lucro operacional do ano 1 maior ou igual a zero |
| o equilíbrio cabe na capacidade | só quando a capacidade foi informada |
| a oferta tem plano mensal | só quando `exige_mensalidade` (regra da casa: toda oferta da Creat tem mensalidade) |
| a mensalidade se paga e o cancelamento foi informado | quando há mensalidade |

- **passa**: nenhuma falha e nada faltando.
- **não passa ainda**: alguma checagem falhou. Diga qual e qual número muda o resultado.
- **incompleto**: falta um dado (o mais comum: CAC ou cancelamento). Não preencha com chute: diga o que falta e quem mede.

Depois vêm: uma venda linha a linha, a mensalidade, **LTV e teto de CAC** (o máximo que se pode pagar por venda e manter a regra), o equilíbrio, o ano 1 mês a mês com clientes ativos, o caixa necessário e a tabela **E se** (preço -10%, volume -20%, custo +15%, CAC +30%, cancelamento em dobro), cada linha com o próprio veredito.

## Passo 3: a nota de quem pediu

Em cima do relatório, em palavras simples e com número:
- **A margem**: o que cada venda deixa depois do anúncio, e a margem no plano.
- **O teto de CAC**: quanto dá para pagar por venda. É este o número que o `trafego` usa para decidir verba e pausa.
- **A linha a vigiar**: a premissa que mais muda o veredito, provada pelo cenário que a mexe.
- **Caixa**: quanto dinheiro precisa antes de se pagar.
- **Três jeitos de melhorar a conta**, cada um com o número que muda (rode o "e se", não chute).
- Uma vez: não é consultoria contábil; imposto, folha e estrutura passam pelo contador.

## Onde entra na casa

- `trafego` (Vento): teto de CAC e gatilho de verba saem daqui, não de conta solta em texto.
- `conversao` (Funil): quanto vale subir 1 ponto na taxa de prévia para Pix.
- `oferta-empilhada`: custo de cada bônus e da garantia antes de prometer.
- `estudar-referencia`: quando o vídeo do dono mostra um negócio, "a conta fecha?" é uma das perguntas.
- `edicao-de-video`: antes de editar um anúncio, confirme que a oferta que ele vende passa.

## O que nunca fazer

- Escrever o veredito à mão ou "arredondar" uma falha para passar.
- Usar CAC por clique, por visualização ou por conversa no lugar de CAC por venda.
- Citar saldo da conta de anúncios (regra do dono); use o custo por venda.
- Pôr números de cliente no repositório.

## Testes

```bash
cd /home/user/Creat-nuvem-VIBE-CODE && python3 -I -B -m unittest discover -s .claude/skills/calculadora-de-oferta/testes -v
```
