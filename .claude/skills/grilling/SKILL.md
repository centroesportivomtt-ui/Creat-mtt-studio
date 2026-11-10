---
name: grilling
description: Interrogatório do plano (grilling). Enche um plano, uma decisão ou uma ideia de perguntas, em rodadas, até não sobrar nada assumido em silêncio. Use quando o dono disser "me interroga", "grilling", "grill", "sabatina", "testa meu plano", "me enche de pergunta", e por dentro, sem ele pedir, antes de distribuir qualquer plano com 3 ou mais ondas ou qualquer gasto novo de dinheiro.
---

# Grilling: o plano só anda depois de aguentar as perguntas

Vem da skill `grilling` de Matt Pocock (mattpocock/skills, licença MIT, ver `ORIGEM.md`), adaptada às regras do dono.

## A ideia

Todo plano é uma **árvore de decisões**: cada decisão abre outras que dependem dela. A **fronteira** é o conjunto de decisões que já podem ser tomadas agora, porque tudo de que elas dependem está resolvido. Trabalha-se em **rodadas**: pergunta-se a fronteira inteira de uma vez, as respostas empurram a fronteira para a frente, recalcula-se e vem a próxima rodada. Pergunta que depende de outra ainda aberta fica para a rodada seguinte.

Duas regras que não mudam:

1. **Fato é trabalho nosso, nunca do dono.** Se a pergunta se responde olhando o repositório, a conta de anúncios, o site no ar, um documento ou uma fonte, um agente vai buscar. Enquanto ele busca, só as perguntas que dependem daquele fato esperam; o resto da rodada segue.
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
- Fecha quando a fronteira esvazia: nenhuma decisão em aberto, nada assumido. Aí devolva o **plano fechado** em bloco curto (decisão, porquê, quem executa) e execute.
- Se ele parar de responder no meio: decisão reversível segue pela recomendada e fica registrada; decisão sem volta espera.

## Modo interno (padrão em plano grande, sem incomodar o dono)

O dono mandou decidir sem perguntar o que dá para decidir. Então o interrogatório acontece **dentro da agência**:

1. O `diretor` desenha a árvore de decisões do plano.
2. Um agente cético (esforço alto) faz as perguntas da fronteira. Outro responde com evidência. Fato sem fonte não fecha pergunta.
3. Cada decisão cai em uma de três caixas:
   - **Fato:** alguém busca e traz com fonte.
   - **Decisão reversível** (texto, layout, ordem das ondas, qual agente, qual ferramenta já aprovada): decide-se pela evidência e registra-se o porquê.
   - **Decisão só do dono** (dinheiro novo ou aumento de verba, serviço pago, dado pessoal dele ou de terceiros, nome e imagem de cliente, parecer jurídico, apagar algo, mudar preço ou produto): vai para **uma única rodada** a ele, no formato acima, no fim. Nunca em conta-gotas.
4. O plano só é distribuído quando a fronteira interna esvazia. As perguntas feitas e as respostas ficam no relatório.

## O que perguntar sempre

- Para quem é, e essa pessoa chega como? (desconhecido de outra cidade, por anúncio, no celular)
- O que prova que funciona **no ar**, e não só em teste local? Quem confere e com que comando?
- Onde isso quebra em silêncio? (rede lenta, celular pequeno, sem consentimento de medição, sem JavaScript)
- O que depende do dono estar acordado? Dá para tirar essa dependência?
- Quanto custa se der errado e como se desfaz?
- Qual é o número que diz que deu certo, e em quanto tempo ele aparece?
- O que estamos assumindo sem ter olhado?
