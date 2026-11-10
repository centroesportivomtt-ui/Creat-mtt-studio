---
name: grilling
description: Interrogatório do plano (grilling). Enche um plano, uma decisão ou uma ideia de perguntas, em rodadas, até não sobrar nada assumido em silêncio. Use quando o dono disser "me interroga", "grilling", "grill", "sabatina", "testa meu plano", "me enche de pergunta", e por dentro, sem ele pedir, antes de distribuir qualquer plano com 3 ou mais ondas ou qualquer gasto novo de dinheiro.
---

# Grilling: o plano só anda depois de aguentar as perguntas

Vem da skill `grilling` de Matt Pocock (mattpocock/skills, licença MIT, ver `ORIGEM.md`), adaptada às regras do dono.

## A ideia

Todo plano é uma **árvore de decisões**: cada decisão abre outras que dependem dela. A **fronteira** é o conjunto de decisões que já podem ser tomadas agora, porque tudo de que elas dependem está resolvido. Trabalha-se em **rodadas**: pergunta-se a fronteira inteira de uma vez, as respostas empurram a fronteira para a frente, recalcula-se e vem a próxima rodada. Pergunta que depende de outra ainda aberta fica para a rodada seguinte.

Duas regras que não mudam:

1. **Fato é trabalho nosso, nunca do dono.** Se a pergunta se responde olhando o repositório, a conta de anúncios, o site no ar, um documento ou uma fonte, um subagente de contexto limpo vai buscar. Enquanto ele busca, só as perguntas que dependem daquele fato esperam; o resto da rodada segue.
2. **Toda pergunta vem com a resposta recomendada**, escrita de modo que "sim" aceita a recomendação.

## Modo dono (ele pediu para ser interrogado)

Formato de uma rodada, sem emoji, no máximo 5 perguntas, cada uma curta:

```
P1 · <título>: <pergunta em uma ou duas frases; opções se houver>
Recomendo: <a resposta que eu daria e por quê, em uma linha>

P2 · <título>: ...
Recomendo: ...
```

- Ele pode responder "sim a tudo" ou "1 sim, 2 não, 3 a segunda opção". Áudio transcrito serve.
- Fecha quando a fronteira esvazia: nenhuma decisão em aberto, nada assumido. Aí devolva o **plano fechado** em bloco curto (decisão, porquê, quem executa) e **espere o dono responder "confirmo"** (ou equivalente claro) antes de executar. Sem confirmação, nada anda.
- Se ele parar de responder no meio: nada é executado. As respostas recomendadas ficam registradas como proposta, e a próxima conversa retoma da rodada em que parou.

## Modo interno (padrão em plano grande, sem incomodar o dono)

O dono mandou decidir sem perguntar o que dá para decidir. Então o interrogatório acontece **dentro da agência**:

1. O `diretor` desenha a árvore de decisões do plano.
2. Um agente cético (esforço alto) faz as perguntas da fronteira. Outro responde com evidência. Fato sem fonte não fecha pergunta.
3. Cada pergunta cai em uma de quatro caixas (fato vira `F1`, `F2`...; as três de decisão viram `D1`, `D2`...):
   - **Fato:** alguém busca e traz com fonte.
   - **Decisão reversível** (texto, layout, ordem das ondas, qual agente, qual ferramenta já aprovada): decide-se pela evidência e registra-se o porquê.
   - **Decisão só do dono:** dinheiro novo ou aumento de verba; serviço pago; dado pessoal dele ou de terceiros; nome e imagem de cliente; parecer jurídico; apagar algo; mudar preço ou produto; **permissões e configuração** (`settings`, `CLAUDE.md`, ganchos); **instalar ou executar código, programa ou skill de fora**; **publicar no ar ou ligar tráfego pago**; **enviar mensagem ou dado a terceiros ou a serviço externo**; **git push**. Vai para **uma única rodada** a ele, no formato acima, no fim. Aqui o limite de 5 perguntas não vale: junte todas, da mais cara para a mais barata. Nunca em conta-gotas. Nada disso anda sem o "confirmo" dele.
   - **Decisão mista** (parte técnica reversível, parte do dono, como fotos: o tratamento é reversível, a origem e o direito de uso são do dono): separe em duas. A parte reversível segue; a do dono vai para a rodada dele.
4. O plano só é distribuído quando a fronteira interna esvazia. As perguntas feitas e as respostas ficam no relatório.

Regras do modo interno:
- **Pedido a um agente só:** ele faz os três papéis (desenha a árvore, pergunta como cético e responde com evidência) e diz isso no relatório.
- **Onde fica:** as rodadas vão para o `RELATORIO.md` do projeto, numa seção "Grilling <data>", no formato `F1 · <fato> · fonte: <caminho, link ou comando>` e `D1 · <decisão> · caixa: reversível | dono | mista · porquê: ...`.
- **Documentos da casa em conflito:** vale o mais recente (pela data do arquivo ou do commit); registre qual foi superado e avise quem cuida dele para corrigir.
- **Fato que não dá para buscar** (sem fonte, sem acesso, caro demais): vira suposição declarada na seção "O que estamos assumindo", com o risco se estiver errada e quem confere depois. Não trave a rodada por ele.

## O que perguntar sempre

- Para quem é, e essa pessoa chega como? (desconhecido de outra cidade, por anúncio, no celular)
- O que prova que funciona **no ar**, e não só em teste local? Quem confere e com que comando?
- Onde isso quebra em silêncio? (rede lenta, celular pequeno, sem consentimento de medição, sem JavaScript)
- O que depende do dono estar acordado? Dá para tirar essa dependência?
- Quanto custa se der errado e como se desfaz?
- Qual é o número que diz que deu certo, e em quanto tempo ele aparece?
- O que estamos assumindo sem ter olhado?
