# ADR-008 · Tarefa agendada que produz e publica os sites dos clientes

Trilho (devops), 10/11/2026. Estado: aceito, **não provado** (falta o ENSAIO de `docs/EXECUTOR.md`, seção 9). Pacote 1D da onda 1. Substitui a parte "quem executa" do ADR-004.

## Contexto

- Sem uma tarefa que rode sozinha, cada pedido pago depende de alguém abrir uma conversa. A promessa de 72 horas e a regra 3 da casa (a venda roda sem o dono) não se sustentam assim.
- O repositório é **público**. O branch de trabalho estava 9 commits à frente do `main`, e a sessão agendada clona o `main`: sem merge, ela roda código velho.
- Dado pessoal de cliente nunca vai ao git: `.gitignore` barra `sites/` de cliente e `pedidos/`. Cada despertar começa num contêiner novo e perde o que não foi gravado fora dele.
- Publicar exige o MCP do Base44. Nenhum agente manuseia token de admin (PEDIDO-API.md, seção 5). A trava de credenciais recusou gerar token de sessão do dono, e está certo.
- Um deploy no Base44 publica o app inteiro. Três quem publicam no mesmo app (executor, carimbo diário do 1F e coordenador) e nenhum sabia do outro.
- `PUBLICACAO.md` exigia o ok do Marcos em todo deploy: o dono no meio de cada entrega.

## Decisão

1. **Uma tarefa executora**, "Porta Aberta · executor", de hora em hora, segunda a sábado, 8h às 20h de Salvador (`CRON_TZ=America/Bahia 41 8-20 * * 1-6`), sessão nova a cada disparo, do `main`. Reserva: a cada 2 horas, se a cota apertar; a promessa "em até 2 horas" cobre as duas. Roteiro e prompt em `docs/EXECUTOR.md`.
2. **Ferramentas restritas.** Só o repositório e o MCP do Base44 do app Porta Aberta (`connectors: ["Base44"]`). Sem Meta Ads, Gmail, Drive, GitHub, Stripe nem Mercado Pago. Uma exceção nomeada: rodar o workflow "Porta Aberta · fechar R$ 297" do AutoCreatFlux ao 19º pago. O conector enxerga todos os apps da conta, então a restrição por app é da instrução; a segurança audita o histórico das sessões.
3. **Estado fora do contêiner.** O estado do pedido mora na entidade `PedidoPortaAberta`. O rascunho mora em `public/sites/<slug>--r-<id>/` e o build final, com manifesto sha256, em `porta-aberta/obras/<slug>--r-<id>/` do app (fora de `public/`, não servido). A aprovação só copia esse build final para `public/sites/<slug>/`: o cliente recebe o que aprovou, byte a byte, sem reconstrução. O token do rascunho nunca sai do contêiner.
4. **Trava de publicação** (`scripts/trava-deploy.cjs`, linhas de `Operacao`): troca atômica por `update_entities` condicional, TTL de 20 min, confirmação por releitura, no máximo 3 deploys por hora para todos os donos, parada geral por `Operacao.pausado` (qualquer linha viva ligada pausa, mesmo com linhas repetidas) e `ensaio_ok` exigido por padrão em todo rascunho e site final. O ensaio é a única exceção, com `--ensaio --pedido <id>` e a linha `ensaio_pedido` aberta pelo coordenador. Esquecer uma flag nunca libera um deploy. Antes do deploy, `git diff` no app tem de mostrar só os caminhos do passo; mudança alheia suspende o deploy. Deploy sempre de um checkpoint nomeado; falhou a conferência no ar, volta ao checkpoint anterior.
5. **O ok do deploy de site de cliente** deixa de ser o Marcos e passa a ser o conjunto de portões mais a aprovação do cliente (`PUBLICACAO.md`). Vitrine e motor continuam com `qa`, `seguranca` e "sites primeiro".
6. **A sessão não pausa anúncio.** Ela não tem Meta Ads. Conferência no ar falhou: rollback e `ALERTA:`. A pausa é do coordenador (regra 12).

## Branch

O coordenador faz o merge do branch de trabalho no `main` antes de criar a tarefa, depois de `git check-ignore` provar que nenhum `sites/<slug>` de cliente nem `pedidos/` entra, e com a varredura de segredos limpa. Mudança no roteiro entra no `main` pelo mesmo caminho; a tarefa sempre roda o `main` do momento do disparo.

## Como parar

- Na hora: `Operacao pausado = sim`. A sessão seguinte lê, responde "pausado" e não toca em nada.
- De vez: `update_trigger` com `enabled: false`. Não apagar: o histórico fica.
- Trava presa: vence em 20 minutos. Ninguém solta trava de outro dono.

## Consequências

- Mais: o pedido pago anda sem o dono; o dono só entra no estorno e em `a_conferir`.
- Menos: cada despertar consome cota de sessão (medir no primeiro ciclo, EXECUTOR.md seção 8); o e-mail ao comprador continua desligado até domínio verificado, então o link do rascunho depende de o cliente voltar a `/obrigado/` no mesmo aparelho.
- Risco **a aceitar pelo dono por escrito** (EXECUTOR.md, seção 10, D2): a restrição a um app é por instrução, e o conector enxerga também o app com tokens. Mitigação: a sessão lê só uma lista permitida de campos (sem e-mail e sem responsável), nenhum segredo é legível, e a segurança audita as 3 primeiras sessões e depois uma por semana. Alternativa: conta Base44 só do Porta Aberta.
- Pagamento em `a_conferir` é visto pela sessão a cada despertar e vira `ALERTA:` uma vez por pedido (EXECUTOR.md, passo b), porque o e-mail ao suporte depende do login do suporte no app.

## Alternativas descartadas

- **GitHub Actions publicando no Base44:** precisaria de token do Base44 em segredo do GitHub, num repositório público, e não tem o agente redator.
- **Gravar o build no git:** dado de cliente em repositório público. Proibido.
- **Reconstruir o site na aprovação:** o texto do redator mudaria e o cliente receberia algo diferente do que aprovou.
- **Uma tarefa que também pausa anúncios:** daria Meta Ads a uma sessão automática que lê texto de cliente. A pausa fica com o coordenador.
