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
