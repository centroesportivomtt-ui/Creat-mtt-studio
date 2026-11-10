---
name: padrao-de-entrega
description: Definição de pronto da Creat Nuvem. Use antes de declarar qualquer tarefa concluída, ao escrever critérios de aceite, ou ao montar o relatório final de um projeto.
---

# Padrão de entrega

Nada é "pronto" sem passar por isto. Marque cada item como **ok**, **falhou** ou **não verificado** (com o motivo). Nunca marque ok o que não foi visto funcionando.

## Funciona
- [ ] Build, lint e testes do projeto rodam sem erro (mostre o comando e a saída).
- [ ] A página abre sem erro no console e sem requisição falhando (skill `verificacao-visual`).
- [ ] Fluxos principais exercitados de ponta a ponta.

## Celular e acessibilidade
- [ ] 390px de largura: sem rolagem horizontal, alvos de toque ≥ 44px, texto ≥ 11px.
- [ ] Teclado: tudo alcançável, foco visível.
- [ ] Contraste AA, `alt` em imagens, rótulo em todo campo.
- [ ] `prefers-reduced-motion` e tema escuro respeitados.

## No ar (regra do dono, 10/11/2026: "jamais deixe acontecer erros desse nível")
Teste local verde não prova nada sobre o site real. Em 09 e 10/11 dois defeitos graves ficaram no ar com todos os testes passando: a medição nunca carregou e as demonstrações abriam sem o formulário de pedido.
- [ ] Antes de publicar: travas locais do projeto (no Porta Aberta: `npm test`, `checar.cjs`, `conferir-moldura.cjs`, `conferir-boot.cjs`, que simula atraso de rede).
- [ ] **Depois de publicar, sempre:** a conferência no endereço de produção, em celular com agente de usuário real, passou inteira (no Porta Aberta: `node scripts/conferir-no-ar.cjs`). Cole a última linha da saída no relatório.
- [ ] O que depende de terceiro (medição, pagamento, WhatsApp) foi visto funcionando com o terceiro de verdade, não com simulação. O que não deu para ver vai como **não verificado**, com o motivo.
- [ ] Se a conferência no ar falhar: pausar os anúncios que levam àquela página, corrigir, publicar e conferir de novo. Só então religar.
- [ ] Ninguém escreve "publicado", "no ar" ou "funcionando" sem essa conferência. Quem revisa cobra a saída dela.

## Qualidade
- [ ] Revisado pelo `revisor` (veredito aprovado).
- [ ] Auditado pela `seguranca` se há formulário, login, API ou dado pessoal.
- [ ] Sem segredos no repositório; `.env.example` atualizado.
- [ ] Dependências novas com versão fixada.

## Experiência
- [ ] O momento-assinatura da direção de arte está lá e funciona no celular.
- [ ] Textos reais, sem lorem ipsum e sem `[PREENCHER]` esquecido.
- [ ] Carregamento: nada de tela branca; estado de carregamento desenhado.

## Relatório
O que foi feito · como rodar · status de cada item acima · o que ficou de fora e por quê · próximos passos sugeridos.
