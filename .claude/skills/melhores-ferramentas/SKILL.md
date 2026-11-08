---
name: melhores-ferramentas
description: Regra permanente da Creat Nuvem — antes de usar, recomendar ou integrar qualquer ferramenta (software, serviço, modelo de IA, plataforma de anúncio, pagamento, hospedagem, biblioteca), consulte o estudo atual em docs/stack-ferramentas-2026.md, use a melhor comprovada para a função e, se houver indício de algo superior, verifique com fonte e proponha a troca. Custo não é critério de exclusão; resultado é.
---

# Sempre a melhor ferramenta

Ordem do dono: para toda função, usar o que existe de melhor, **comprovado, datado e estudado**, independentemente do custo. Autonomia para executar o melhor; obrigação de registrar o porquê.

## Antes de escolher qualquer ferramenta
1. Abra `docs/stack-ferramentas-2026.md` e procure a função. Se há uma ferramenta nº 1 com data recente, **use-a**. Não invente alternativa por hábito.
2. Se a função não está no estudo, ou a entrada tem mais de 30 dias, ou você viu sinal de algo superior (lançamento, benchmark, mudança de preço, incidente de segurança): **pesquise antes de decidir**. Mínimo: página oficial de preço, um comparativo de 2025-2026 e uma avaliação agregada (G2, Capterra, Artificial Analysis, Product Hunt) ou benchmark. Traga URL e data.
3. Critérios, nesta ordem: resultado comprovado para a função · integração com os agentes (API ou MCP) · funciona para pessoa física/MEI no Brasil, com Pix quando for cobrança · risco (banimento, segurança, lock-in) · custo (último critério; só desempata).
4. Se a escolha for diferente do estudo, **atualize o estudo**: acrescente a linha com a ferramenta, o motivo, a fonte e a data, e avise no RELATORIO.md do projeto.

## Durante a execução
- Use a ferramenta no nível máximo que ela oferece (API, MCP, automação), não no manual, sempre que isso tirar o dono do meio.
- Ao integrar: versão fixada, chave em variável de ambiente, nunca no repositório.
- Ao recomendar ao dono: diga o preço em reais, se tem plano grátis, o que exige dele (conta, cartão, documento) e o que ela destrava em venda.

## Automação
Uma tarefa agendada semanal ("Revisão do stack") refaz a pesquisa por categoria com refutadores e atualiza `docs/stack-ferramentas-2026.md`, a página publicada e o Drive. Quando ela rodar, trate o documento novo como a fonte de verdade.

## O que nunca fazer
- Escolher pela ferramenta que "todo mundo usa" sem checar se ainda é a melhor.
- Deixar o custo vetar a melhor opção sem perguntar ao dono.
- Usar API não oficial de WhatsApp em número de cliente, conectores não oficiais de Meta Ads, ou plano grátis com termos que proíbem uso comercial em projeto de cliente.
