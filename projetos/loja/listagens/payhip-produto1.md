# Payhip · Produto 1 · Agência de 15 agentes para Claude Code

**Onde colar cada campo** (Payhip > Products > Add product > Digital product):

| campo deste arquivo | onde fica no Payhip |
|---|---|
| Título | Product name |
| Preço | Price (moeda da loja em BRL) |
| Arquivo | Upload file: `projetos/loja/dist/creat-nuvem-agencia-15-agentes.zip` |
| Descrição | Description (o editor aceita negrito e listas; cole o texto e ajuste os títulos) |
| Tags | Product tags, se o seu painel mostrar o campo; senão, use as palavras na descrição |
| E-mail de entrega | mensagem ao comprador que vai junto com o link de download (o nome do campo varia: procure "message to buyers" ou "custom email" em Advanced options) |

---

## Título (52 caracteres)

Agência de 15 agentes para Claude Code · Creat Nuvem

## Preço

R$ 47,00

## Descrição

Uma equipe fixa de 15 agentes especialistas para o seu Claude Code. Você pede o trabalho pelo nome de quem faz: o diretor planeja, o designer cria os tokens, o frontend constrói, o revisor lê o diff, o QA testa no navegador.

**O que vem no zip**

- 15 agentes prontos em `.claude/agents/`: diretor, criativo, arquiteto, frontend, backend, designer, motion-3d, shader, som, copywriter, pesquisador, revisor, qa, segurança e devops. Cada um com cargo, regras de qualidade e a lista de ferramentas que deve usar.
- 6 skills da casa: ideação de conceitos, direção de arte, 3D com cara de desenho (kit Three.js incluso), verificação visual com prints em celular e desktop, navegador controlado por comandos e definição de pronto.
- O fluxo `agencia.js`, que passa o trabalho de agente em agente em ondas: conceito, plano, construção, revisão, QA, correções e entrega, com um `RELATORIO.md` parcial a cada etapa.
- A sede 3D: uma ilha em estilo desenho animado com os 15 personagens. No modo ao vivo, mostra quais agentes estão trabalhando na sua máquina e quantos tokens cada um usou.
- `GUIA.pdf` com 11 páginas: o que cada agente faz, quando chamar, dois exemplos de prompt por agente, o fluxo em ondas, custos de tokens, boas práticas, erros comuns e glossário.
- `CLAUDE.md` com as regras da casa e `README.md` com a instalação em 2 minutos.

**Para quem é**

Para quem já usa o Claude Code e quer separar o trabalho por especialidade, com revisão e teste no meio, em vez de pedir tudo para uma conversa só.

**O que você precisa saber antes de comprar**

- É compatível com o Claude Code. Não é um produto oficial da Anthropic e não tem vínculo com ela.
- Você precisa de uma assinatura ou conta do Claude Code ativa. O pacote não inclui acesso ao Claude.
- Cada agente consome tokens da sua conta. Um fluxo completo chama vários agentes e gasta mais que uma conversa comum. O guia mostra como medir e como gastar menos.
- As skills de navegador e verificação visual precisam do Playwright (`npm install -D playwright`), gratuito.
- A sede 3D carrega o Three.js por CDN, então precisa de internet para abrir.

**Licença**

Uso pessoal e comercial permitido, inclusive em projetos que você entrega a clientes. Não é permitido revender ou redistribuir o pacote.

Dúvidas antes de comprar: mttcreatt@gmail.com

## Tags

claude code, agentes de ia, subagentes, automação, desenvolvimento web, frontend, workflow, three.js, produtividade, português

## E-mail de entrega

Assunto: Sua agência Creat Nuvem chegou

Olá!

Obrigado pela compra. O link acima baixa o arquivo `creat-nuvem-agencia-15-agentes.zip`.

Para começar:

1. Descompacte o zip e abra o `README.md`. A instalação leva 2 minutos: copiar `.claude/` e `CLAUDE.md` para a raiz do seu repositório e instalar o Playwright.
2. Abra o Claude Code no repositório e peça: "Liste os agentes disponíveis". Os 15 nomes devem aparecer.
3. Leia a seção "Custos de tokens" do `GUIA.pdf` antes de rodar o fluxo completo pela primeira vez.

Lembrete: o pacote funciona com a sua assinatura do Claude Code e o uso dos agentes consome tokens da sua conta.

Se algo não funcionar, responda este e-mail ou escreva para mttcreatt@gmail.com com o que você pediu, o que apareceu na tela e a versão do Claude Code.

Bom trabalho!
Creat Nuvem
