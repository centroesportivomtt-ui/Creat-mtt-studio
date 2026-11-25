# Posts do plano Vitrine · o ciclo do mês

Verbo (pacote 2B, onda 2), 10/11/2026. Achado PV-11. Base: termos, cláusula 11 (versão 2); `docs/EXECUTOR.md`, "Ciclo mensal do Vitrine"; decisão do plano de qualidade de 10/11/2026 sobre o Metricool e o plano Vitrine.

**Estado: NÃO PROVADO.** O ciclo nunca rodou com cliente real. Ele só conta como provado quando o primeiro mês de um cliente Vitrine fechar com as 4 entregas registradas (etapa 9). Até lá, o Vitrine não leva selo de "recomendado" e nenhum anúncio promete posts.

## O que o cliente compra (e nada além disso)

Cada frase pública sobre posts aponta para uma etapa deste documento. Frase nova sobre posts só entra no site, nos termos ou no WhatsApp com a etapa correspondente aqui.

| frase pública | onde aparece | etapa que cumpre |
|---|---|---|
| "4 posts por mês para o seu Instagram, com imagem e legenda" | `conteudo/home.json` (Vitrine, inclui), termos cláusulas 4 e 11, faq `instagram` | 2 e 3 |
| "a partir dos dados do seu site (serviços, horários, endereço e cores)" | termos cláusula 11 | 2 e 3 |
| "chegam pelo WhatsApp do Suporte Creat na primeira semana de cada mês do plano; no primeiro mês, em até 7 dias do site no ar" | termos cláusula 11, V1 de `marketing/whatsapp-scripts.md` | 1 e 5 |
| "aprovados por você" / "você aprova cada post, pede ajuste ou recusa" | home.json, termos cláusula 11, V1 | 6 |
| "Nada é publicado no seu Instagram sem o seu sim; silêncio não aprova" | termos cláusula 11, faq `instagram`, V1 e V2 | 6, 7 e 8 |
| "entregues prontos para você publicar, com a legenda para copiar" | home.json, termos cláusulas 4 e 11 | 5 |
| "A Creat não acessa o seu Instagram e nunca pede a sua senha" | termos cláusula 11, home.json (precisaTer) | regra 1 |
| "Posts não usados no mês não acumulam" | termos cláusula 11 | 8 |
| "o plano pausa alterações e posts" (7 dias de atraso) | termos cláusula 8, R10b | 10 |
| "R$ {{precos.planos.vitrine}} por mês ... 4 posts prontos por mês para você publicar" | F4 e R2 de `marketing/whatsapp-scripts.md` | 2 a 5 |

## Regras que valem em todo o ciclo

1. **Sem acesso ao Instagram do cliente.** A Creat não publica, não agenda e não pede senha nem login. Quem publica é o cliente, no perfil dele.
2. **Sem serviço pago.** O ciclo usa só o que a casa já tem: o tenant do site, o redator, o portão de conteúdo e o Chromium da casa para gerar a imagem. O Metricool (ou outra ferramenta de agendamento) só entra depois do primeiro Vitrine pago **e** do "sim" do dono à P5, porque o plano que agenda nas marcas dos clientes é pago (cerca de R$ 142 por mês com IOF, `docs/stack-ferramentas-2026.md`). Entrando, a cláusula 11 dos termos muda antes, e o cliente conecta a conta dele por conta própria.
3. **Só dado real do cliente.** Serviço, preço, horário, endereço e cores vêm do tenant aprovado do site. Nada de promoção, desconto, prazo ou número que o cliente não mandou. Nenhuma promessa de resultado ("mais clientes", "lote cheio").
4. **Pessoas só com autorização.** Foto com pessoa só se o cliente mandou e disse que tem a autorização dela (R6). Sem foto do cliente, a imagem usa tipografia e cores do site, sem banco de imagens com rosto.
5. **Dado pessoal fora do repositório.** Imagens, legendas e respostas do cliente não entram no git (`.gitignore` já barra `sites/` de cliente e `pedidos/`). Registros em `Operacao` levam só id do pedido, mês e contagem.
6. **WhatsApp só 1:1, com quem já é cliente.** No máximo o V1 e um lembrete (V2) por mês.

## O mês do plano

- O 1º mês do plano começa no dia em que o site entra no ar (`no_ar_em`), ou um mês depois, se o cliente ganhou o 1º mês grátis por atraso nosso (`garantia_mes_gratis`, termos cláusula 5). Os posts valem também no mês grátis.
- Cada mês seguinte começa no mesmo dia do mês da primeira cobrança.
- "Primeira semana do mês do plano" = do dia 1 ao dia 7 desse mês, contado do dia em que ele começa.

## As etapas

| # | quem | quando | o quê | prova |
|---|---|---|---|---|
| 1 | sessão executora (`docs/EXECUTOR.md`) | no primeiro despertar de cada mês do plano; no 1º mês, no primeiro despertar depois de `no_ar_em` | lista os pedidos `no_ar` com plano `vitrine` ou `vitrine_anual`, sem `desistiu_em` e sem pausa por atraso, e abre `Operacao posts_<pedido_id>_<AAAAMM>` com `{estado: "a_fazer"}` | a linha em `Operacao` |
| 2 | redator (o mesmo de `docs/EXECUTOR.md`, passo (e)) | no mesmo despertar | escreve 4 legendas a partir do tenant aprovado, um tema por post: (1) um serviço do site, com o preço se o site tiver; (2) como pedir horário pelo WhatsApp; (3) endereço e horário de funcionamento; (4) o diferencial que o cliente escreveu no site. Cada legenda com até 600 caracteres, o link do site e nenhuma hashtag inventada sobre resultado | `posts.json` no contêiner, sem dado pessoal além do que já está no site |
| 3 | sessão executora | no mesmo despertar | monta cada imagem em 1080 x 1350 px num HTML com as cores e a tipografia do site e a foto do cliente, se houver, e gera o PNG com o Chromium da casa (o mesmo de `verificacao-visual`). Confere o PNG: texto legível a 390 px, nada cortado, contraste AA | os 4 PNG e o print de conferência no contêiner |
| 4 | sessão executora | no mesmo despertar | passa legendas e imagens pelo portão de conteúdo: preço igual ao do site, sem palavra proibida, sem promessa de resultado, sem emoji, português do Brasil. Falhou: `estado: "revisao"` e aviso ao suporte | saída 0 do portão |
| 5 | sessão executora e suporte | sessão no mesmo despertar; suporte até 2 horas depois do aviso, no horário de atendimento (segunda a sábado, das 9h às 19h) | a sessão publica o pacote do mês num endereço que não é indexado e não é adivinhável (`/sites/<slug>--p-<12 ou mais caracteres aleatórios>/`, com `noindex`, no mesmo molde do rascunho), com as 4 imagens, cada legenda com o botão "Copiar a legenda" e o botão "Baixar a imagem"; grava `estado: "enviado"` e avisa o suporte. O suporte manda as 4 imagens e o V1 pelo WhatsApp do Suporte Creat, com o link do pacote | `Operacao posts_<pedido_id>_<AAAAMM>` com `enviado_em`; a mensagem enviada |
| 6 | cliente e suporte | quando o cliente responder | o cliente responde por número: SIM, AJUSTE (com o que mudar) ou NÃO. SIM: o post está pronto para ele publicar. AJUSTE: volta às etapas 2 a 5 só daquele post, até 2 rodadas no mês. NÃO: o post sai do pacote | `Operacao` com `aprovados`, `ajustes` e `recusados` (só números) |
| 7 | suporte | 3 dias depois do V1, uma vez, só se o cliente não respondeu | manda o V2 | a mensagem enviada |
| 8 | ninguém | depois do V2 | silêncio não aprova: nada é publicado e nada mais é mandado sobre os posts daquele mês. O pacote some do endereço no fim do mês do plano. Posts não usados não acumulam | `estado: "fechado"` no fim do mês |
| 9 | sessão executora | no fim de cada mês do plano | fecha o registro do mês: 4 posts entregues no prazo da etapa 5 (sim ou não), quantos aprovados. Entrega fora do prazo vira aviso ao suporte e conta no resumo diário (`docs/ROTINA-DIARIA.md`) | `estado: "fechado"` com `no_prazo: true` ou `false` |
| 10 | sessão executora | enquanto houver mensalidade 7 dias ou mais em atraso (termos, cláusula 8; R10b) | não abre o mês (etapa 1). Pago o atraso, o mês abre no despertar seguinte | ausência da linha do mês e o aviso ao suporte |

## O que ainda não existe (para o diretor distribuir antes do primeiro Vitrine pago)

- O molde de imagem dos posts e o gerador de PNG (etapa 3). Hoje não há script.
- O pacote do mês publicado com `noindex` (etapa 5). O molde do rascunho (`scripts/producao/lib/rascunho.cjs`) é o ponto de partida.
- A leitura do mês do plano e dos registros `posts_*` na sessão executora (etapas 1, 9 e 10). `docs/EXECUTOR.md` cita o ciclo, mas não tem o passo escrito.
- Um ensaio com um pedido de teste (`eh_teste: true`) no plano Vitrine, do V1 ao fechamento, antes do primeiro cliente real.

Enquanto qualquer um desses faltar, vender o Vitrine depende de alguém fazer as etapas 2 a 5 à mão no prazo. O coordenador decide se o Vitrine continua à venda nessas condições; o texto público não muda por isso, porque a promessa é a mesma.
