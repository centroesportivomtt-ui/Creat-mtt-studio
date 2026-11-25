# ADR-001 · Motor congelado: o motor v1 não muda por pedido; só o tenant.json muda

Status: aceito · 08/11/2026 · Cirro (T1)

## Contexto
A venda precisa rodar sem o dono e entregar em até 72 h. Se cada pedido puder alterar HTML, CSS ou JS, cada site vira um projeto único: o teste deixa de valer para os outros, o prazo depende de quem programa, a revisão vira leitura de código e a Fase 2 (serviço multi-tenant com o mesmo template do build) precisa reconciliar N variações. A barbearia Fio no Couro já provou o padrão "um arquivo de dados, o resto lê dele" (`window.FIO_CONFIG`).

## Opções
1. Gerar o site inteiro por IA a cada pedido. Rápido de começar, impossível de testar e de manter; abre espaço para injeção de prompt chegar ao código publicado.
2. Motor com ganchos de customização por pedido (CSS extra, blocos HTML livres). Flexível, mas cada exceção é uma nova superfície de bug e de XSS.
3. **Motor congelado por versão + TenantConfig validado por schema.** Um pedido só produz `tenant.json`.

## Decisão
Opção 3. `motor/v1/` é igual em todos os sites e só muda por versão (`v1.x` correção compatível; `v2` quando o formato do tenant muda). A IA preenche apenas os campos de texto da lista branca do preset; tudo passa por `schema/tenant.schema.json` (sem chave desconhecida, sem `demo.ocupacaoFicticia`) e por `validar-tenant.mjs`. Pedido do cliente que exige mudar o motor vira item de backlog do motor, nunca exceção num site. `meta.motorVersao` e `Pedido.versao_motor` registram a versão usada.

## Consequências
- Um teste do motor vale para todos os sites; a QA de cada pedido é só a do tenant (390 px, wa.me, console).
- O preço fechado é sustentável: o custo por pedido é uma chamada de IA e a conferência humana.
- O SAIR é trivial: motor + tenant.json abrem do disco.
- A Fase 2 serve qualquer site com o mesmo template (HTMLRewriter + tenant), sem retrabalho.
- Limite aceito: personalização visual fica em 3 paletas por nicho e nos textos. Quem quer layout próprio não é cliente do Porta Aberta.
- Mudança de schema exige versão nova do motor e migração dos tenants existentes; por isso o schema é estrito desde já.
