# ADR-004 · Executor 24/7 da Fase 2: GitHub Actions privado ou VPS

Trilho (T10), 08/11/2026. Status: **substituído pela decisão D1 (10/11/2026)**. O texto original fica abaixo, sem alteração, como histórico.

## Substituído pela D1 (pacote 1C da onda 1, Trilho, 10/11/2026)

**Decisão D1:** quem produz o site é a **sessão principal do Claude Code**, acordada por uma **tarefa agendada** (pacote 1D, `docs/EXECUTOR.md`) que lê a entidade `PedidoPortaAberta` do app Base44. Os textos do site são escritos por **agentes dessa sessão** e gravados num arquivo JSON. Não há API paga, não há GitHub Actions de produção e não há VPS.

Por que a D1 substitui as opções A e B:
1. **A chamada paga nunca rodou.** O caminho por `ANTHROPIC_API_KEY` só foi exercitado com fixture (achado PV-02). Depender dele para o primeiro pedido pago era apostar a garantia de 72 h numa chamada nunca vista funcionando, e exigia chave do Console e cartão.
2. **Sem conta nova, sem cartão, sem servidor.** A sessão principal já existe e já é usada pela agência. A opção A pedia repositório privado, Environment com segredos e leitura dos termos do Actions; a B pedia manutenção de máquina. A D1 não pede nada disso.
3. **Mesma régua de segurança.** O agente redator recebe só `sites/<slug>/redator.json`: nicho, nome, cidade, bairro, funcionamento e serviços estruturados, cada campo conferido por regex (`scripts/producao/lib/textos.cjs`). Nunca e-mail, WhatsApp, responsável, rua, número, CEP, origem ou texto livre bruto. A resposta dele passa pela **mesma lista branca** do caminho por API (`IA.aplicarSaida`), pelo **portão de conteúdo** (`lib/bloqueio.cjs`: ofensa, termo sexual, marca, alegação de saúde, promessa de ganho, injeção, código) e pelo `validar-tenant` (que agora também recusa domínio solto, entidade HTML, `@` e telefone diferente do WhatsApp do pedido). WhatsApp e endereço entram por código, a partir do pedido.
4. **Quem aprova é o cliente.** `produzir.mjs --rascunho` gera o build final e uma cópia dele com a faixa "Rascunho para a sua aprovação. Ainda não está no ar." em `/sites/<slug>--r-<id>/` (id de 16 caracteres por crypto, meta noindex, sem sitemap). O botão "Aprovar e colocar no ar" chama `POST /api/pa/aprovarRascunho` (pacote 1A) com uma de duas credenciais (seção "Canal de aprovação" abaixo). Aprovado, a tarefa publica o MESMO build em `/sites/<slug>/` e apaga o rascunho (`publicar-site.cjs --aprovado`).

### Canal de aprovação (correção da conferência, 10/11/2026)
O texto anterior dizia que o token do `#t=` bastava. Não basta: o e-mail ao comprador está desligado (SendEmail dá 422 sem domínio verificado), o token só existia no contêiner do executor e morria com ele, e `/obrigado/` devolve `rascunho_url` sem `#t=`. O cliente abria o rascunho e via o botão desligado. Agora há três caminhos, nesta ordem:
1. **Mesmo aparelho (o padrão).** Sem `#t=`, o `rascunho.js` LÊ (nunca grava) `localStorage['creat:pedido:v1']` da mesma origem e, com `id` no formato `^PA-[0-9A-Z]{10}$` e `segredo` no formato `^[A-Za-z0-9_-]{21}[AQgw]$`, liga o botão e manda `{slug, pedido_id, segredo}`, que o `aprovarRascunho` do 1A já aceita. Depende de a vitrine gravar o `id` do servidor e o `segredo` nessa chave (pedido ao dono de `assets/vitrine.js`; hoje ela grava id de 8 caracteres e nenhum segredo, e então o botão fica desligado, falha fechada).
2. **Link com token.** `#t=<token>` continua valendo e tem preferência.
3. **Link pelo suporte** (quem não volta ao aparelho, e hoje todo pedido, porque os caminhos 1 e o e-mail estão desligados): o suporte gera um link novo com `node scripts/producao/link-aprovacao.cjs --dir <slug_rascunho> --json`, em qualquer contêiner, sem precisar do `rascunho.json` antigo. O comando cria um token novo e imprime o link e o `token_hash`; o link só vale depois de `gravarRascunho {id, slug, token_hash}` de reenvio (troca o hash, zera as tentativas, invalida o link anterior e regrava `rascunho_em`). Quem e quando, com o passo a passo: `docs/EXECUTOR.md`, passo (i), item 3. A tarefa executora grava o rascunho e avisa (`ALERTA`); a pessoa que atende o WhatsApp do Suporte Creat gera o link, grava o hash, manda pelo WhatsApp que o próprio comprador informou no pedido (mensagem do pedido pago, não prospecção) até 2 horas depois do alerta no horário de atendimento, e registra `Operacao link_aprovacao_<id>`; sem esse registro, a tarefa volta a alertar a cada despertar. O token aparece só na saída do comando e na mensagem ao cliente. Provado no ensaio, linha 6 (aprovação só com o link, num navegador sem nada salvo).
Sem nenhuma das três, a faixa diz "Abra este rascunho no aparelho em que você fez o pedido, ou fale com o suporte pelo botão Pedir ajuste."

### robots.txt do rascunho (correção da conferência)
O texto anterior chamava de proteção o `robots.txt` com `Disallow: /` dentro de `/sites/<slug>--r-<id>/`. Buscador só lê `robots.txt` na raiz do domínio: esse arquivo não protege nada e fica só para o caso de alguém copiar a pasta para a raiz de outro domínio. A proteção real é a meta `noindex, nofollow` no `index.html` do rascunho, mais o endereço imprevisível (cerca de 82 bits) e a ausência de sitemap. Feito em 10/11 (fecho da onda 1, pacote 1F): `scripts/montar-publico.cjs` grava `dist/publico/robots.txt` com `User-agent: *`, `Allow: /` e `Disallow: /sites/*--r-`, e o `checar.cjs` (seção 7) confere o texto, que a regra barra o rascunho e não barra `/`, `/abrir/` nem os sites finais de exemplo. Vale no ar só depois da próxima publicação da vitrine (hoje `/robots.txt` dá 404). Fecho 2 da onda 1 (10/11): o marcador do rascunho passou de `-r-` para `--r-` (`/sites/<slug>--r-<id>/`), porque robots.txt não tem classe de caractere e `Disallow: /sites/*-r-` barrava também o site FINAL de um negócio com R no nome ("Barbearia do R" em Feira de Santana vira `barbearia-do-r-feira-de-santana`). O `slugSeguro` (`scripts/producao/lib/tenant.cjs`) junta hífen repetido, então nenhum slug final tem `--`, e o `checar.cjs` (seção 7) falha se a regra barrar `/sites/barbearia-do-r-feira-de-santana/`. Mudaram juntos: `RE.slugRascunho` (`schema/pedido-regras.mjs` e `src/lib/pa/regras.js` do app), `RE_DIR` e `dirRascunho` (`scripts/producao/lib/rascunho.cjs`), `link-aprovacao.cjs` e o teste do produzir. Nenhum rascunho real existia com o formato antigo. Limite que continua: (b) página barrada no robots.txt não é lida, e o buscador não vê a meta `noindex`: se um link de rascunho vazar, o endereço pode aparecer sem conteúdo. A meta `noindex` continua sendo a proteção principal; `X-Robots-Tag: noindex` em `/sites/*--r-*/` fica para quando a hospedagem permitir cabeçalhos.

### Portão de conteúdo, rodada 2 (correção da conferência)
- Antes de qualquer regra, o texto é desarmado: NFKC (letra e dígito de largura total viram comuns), sem caractere de formato (largura zero, inversão de texto), sem acento. Caractere de formato no texto é motivo por si (categoria `disfarce`).
- Categoria `contato`: domínio, `www`, `@`, `wa.me` e telefone que não é o WhatsApp do pedido, inclusive disfarçados (`exemplo[.]com`, `golpe ponto com`, `arroba`, dígitos de largura total, número ditado por extenso).
- Injeção em inglês ("disregard previous instructions", "you are now", "System:").
- Categoria `formato` (`checarNegocio`): `pagina.titulo` precisa conter o nome do negócio do pedido, e nenhum texto pode citar nome próprio de duas palavras ou mais que não seja do pedido (nome, cidade, bairro, serviços, vocabulário do preset). Pega textos escritos para outro cliente.
- O `validar-tenant` usa o mesmo desarme.

### Slug reservado (correção da conferência)
O `.gitignore` versiona as pastas `sites/demo-<nome>` e o repositório é público. Fora de `--demonstracao`, todo slug que começa com `demo-`, `teste-` ou `ensaio-` (do nome digitado ou de `--slug`) ganha o prefixo `cliente-` no código (`slugSeguro` em `lib/tenant.cjs`). Um cliente chamado "Demo Studio" vira `sites/cliente-demo-studio-<cidade>/`, que o git ignora.

Comandos (todos sem rede e sem chave):

| passo | comando | saída |
|---|---|---|
| 1. preparar | `node scripts/producao/produzir.mjs --pedido <arq>` | código 4, `sites/<slug>/redator.json` |
| 2. escrever | agente redator lê `redator.json` e grava o JSON de textos (com `"pedido": "<id>"`) | arquivo de textos |
| 3. produzir | `node scripts/producao/produzir.mjs --pedido <arq> --textos <json> --rascunho` | código 0 (`rascunho_pronto`), 1 (inválido), 3 (teste do site), 5 (`em_revisao`) |
| 4. publicar rascunho | `node scripts/producao/publicar-site.cjs --slug <slug> --rascunho` | zip de `/sites/<slug>--r-<id>/` e o passo a passo |
| 5. depois do "Aprovar" | `node scripts/producao/publicar-site.cjs --slug <slug> --aprovado` | zip de `/sites/<slug>/` e o passo que apaga o rascunho |

O caminho por API continua no código, **desligado**: só roda com `--api` (e `ANTHROPIC_API_KEY`, `CREAT_CAMBIO`). Se um dia voltar, a régua acima vale igual.

### Origem dos sites de cliente (achado PV-16)
Hoje a vitrine, `/abrir/`, `/obrigado/` e `/sites/<slug>/` dividem a mesma origem (`creat-nuvem-404b1994.base44.app`), e o Base44 não lê `_headers`.
- **Agora:** CSP por meta em `motor/v1/template.html`, que vale para todo site de cliente, rascunho e pacote SAIR. Só scripts da mesma origem, nenhum script inline, `connect-src 'self'`, `img-src 'self' data:`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-src 'none'`, `worker-src 'none'`. Afrouxado o mínimo e registrado no próprio template: o CSS do Google Fonts (`style-src` e `font-src`), UM `<style>` do motor por hash (CSS_VIVO de `efeito.js`) e os 9 atributos `style` da poeira do gesto da academia por hash (`style-src-attr 'unsafe-hashes'`, `rituais/barra.js`). O `build-site.cjs` recusa o build se o motor mudar e os hashes não baterem, e o `testar-site.cjs` trata qualquer violação de CSP como falha. Limite conhecido: CSP por meta não cobre `frame-ancestors` (a hospedagem já manda `X-Frame-Options: DENY`) nem isola o `localStorage` da vitrine; isso só a origem própria resolve.
- **Regra:** o primeiro site de cliente real só pode ser publicado com essa CSP no `index.html` (o build atual já sai com ela; demos antigas em `dist/demo-*` saem com ela no próximo build).
- **Depois:** subdomínio próprio para os sites de cliente quando o **D7** (domínio da Creat) sair. Aí `CREAT_URL_SITES` passa a `https://{slug}.<domínio>/` ou a outra origem, e a vitrine deixa de dividir origem com os sites.

### O que não foi verificado (D1)
- A aprovação em produção: depende das funções do pacote 1A publicadas (`aprovarRascunho`) e do endereço real da função na hospedagem. O botão foi exercitado contra um servidor local que simula a função.
- A aprovação pelo pedido guardado no aparelho em produção: depende da vitrine gravar `id` e `segredo` em `creat:pedido:v1` (pedido ao dono de `assets/vitrine.js`). Exercitada só contra o servidor local, com um registro fictício.
- O tempo de um pedido de ponta a ponta na tarefa agendada (medir no ensaio do pacote 1D).

---

## Texto original (08/11/2026, proposto)

Pergunta de venda: o pedido pago precisa virar site no ar sem o Marcos acordado. Quem roda o `produzir.mjs` às 3 da manhã?

## Contexto
- Fase 2 (briefing §19): Worker + D1 recebem o webhook do Asaas, reconfirmam o pagamento e gravam o Pedido. Falta **quem executa** a produção: `produzir.mjs` (Node 22, uma chamada à API do Claude, `validar-tenant`, `build-site`, Playwright/Chromium a 390 px, `custo.json`) e depois o deploy do site.
- Cada pedido roda alguns minutos (Chromium + uma chamada de API). Estimativa: **5 a 10 min por pedido** (não medido; medir no primeiro pedido real).
- Regras que valem para os dois: chave `ANTHROPIC_API_KEY` do Console no cofre do executor, nunca no repositório; dados do cliente (`sites/`, `pedidos/`, `dist/`) nunca no git; o executor não recebe texto livre de cliente com permissão de deploy (patch JSON validado, briefing §19).

## Opções

### A. GitHub Actions em repositório privado (disparo por evento)
O Worker da Fase 2, depois de reconfirmar o pagamento, chama `repository_dispatch` (token fino só com `actions:write` nesse repositório). Um `workflow` roda `produzir.mjs` e o deploy. Um `schedule` a cada 15 min serve de rede de segurança para pedido que ficou parado.

| | |
|---|---|
| **Prós** | Sem servidor para manter, atualizar ou proteger. Ambiente limpo a cada pedido (nada de cliente sobra no disco). Segredos em *Environments* com revisão obrigatória se quiser. Log de cada pedido guardado no próprio run. Mesmo lugar do código e do CI. Chromium e Node prontos no `ubuntu-24.04`. |
| **Contras** | Fila e atraso: runner hospedado pode demorar a subir, e `schedule` não tem hora exata (atrasos de vários minutos são documentados pelo GitHub; não verificado nesta data). Job limitado a 6 h (sobra). Termos de uso do Actions restringem uso "não relacionado ao projeto de software do repositório"; produzir e publicar sites a partir do próprio motor é build/deploy, mas é zona cinza (**risco a confirmar lendo os termos**). Dependência de uma plataforma só. |
| **Custo** | Plano Free da organização: **2.000 min/mês de Linux** em repositório privado; acima disso cerca de **US$ 0,006/min** (redução de 01/01/2026). Proposta de taxa de plataforma de US$ 0,002/min em repositório privado a partir de 01/03/2026, com status incerto. Fontes: changelog do GitHub, 16/12/2025 (https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/), e agregadores (https://cicdcost.com/github-actions-pricing-changes-2026), lidos por busca em 08/11/2026: **não verificado na página oficial de preços**. Conta: a 8 min por pedido, 2.000 min cobrem cerca de **250 pedidos/mês por R$ 0**. Acima, 8 min × US$ 0,006 × R$ 5,50 ≈ **R$ 0,26 por pedido**. |
| **Risco** | Baixo de segurança (sem porta aberta, sem SSH). Médio de termos (zona cinza acima). Baixo de lock-in: o job é `node scripts/producao/produzir.mjs`, roda igual em qualquer máquina. |

### B. VPS (máquina virtual sempre ligada)
Um processo (systemd + fila no D1 ou no próprio Worker) consulta pedidos pagos e roda `produzir.mjs`.

| | |
|---|---|
| **Prós** | Começa na hora, sem fila de runner. Sem limite de minutos. Pode manter Chromium aquecido. Sem dúvida de termos de uso. |
| **Contras** | Alguém precisa manter: atualizações de segurança, disco, Node, Chromium, reinício, monitor, backup. Chave da API fica num disco que pode vazar. Dados de cliente acumulam no disco se a limpeza falhar. Cobrança em euro ou dólar no cartão internacional, com IOF (ver `docs/stack-ferramentas-2026.md`, item 0.3). Para "a venda rodar sem o dono", é mais uma coisa que pode parar de madrugada. |
| **Custo** | Referência Hetzner CX23 (2 vCPU, 4 GB): **€ 5,99/mês** após os reajustes de abril e junho de 2026 (Better Stack, revisão de out/2026: https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/; VPSBenchmarks: https://www.vpsbenchmarks.com/hosters/hetzner/plans/cx23), com relatos de criação de servidor bloqueada para novos clientes até 20/10/2026 (https://findstack.com/resources/hetzner-price-increase-2026). Lido por busca em 08/11/2026, **não verificado na página oficial**. Em reais: cerca de **R$ 40/mês** com IOF (câmbio do euro estimado em R$ 6,40, **não verificado**). VPS em data center no Brasil (Hostinger, Locaweb, Magalu Cloud) aceitaria Pix em alguns casos: **não pesquisado**. Custo escondido: horas de manutenção. |
| **Risco** | Médio de segurança (porta SSH, chave em disco, patch atrasado). Médio de operação (sem ninguém de plantão). Baixo de lock-in. |

## Decisão recomendada
**A. GitHub Actions privado, disparado por evento**, com estas condições:
1. Repositório privado numa organização da Creat (ver `CHECKLIST-REPOSITORIO-PRIVADO.md`) antes de qualquer segredo de produção.
2. Segredos em um *Environment* `producao` (`ANTHROPIC_API_KEY`, `CLOUDFLARE_API_TOKEN`), restrito ao branch principal; actions de terceiros fixadas por SHA; `permissions:` mínimas no workflow.
3. `concurrency` por pedido (`group: pedido-${{ id }}`) para não produzir duas vezes; idempotência pelo id do pedido no D1.
4. Nada de cliente vira artefato público do run: `sites/` e `dist/` vão direto para o deploy e somem com o runner; log sem nome, WhatsApp ou e-mail.
5. **Gatilho de troca para VPS (ou Cloudflare Containers, a avaliar)**: passar de 200 pedidos/mês, fila do runner acima de 10 min em mais de 5% dos pedidos, ou leitura dos termos do Actions que proíba o uso. A troca custa pouco porque o job é um comando só.

Por quê: tira o Marcos do meio (nada para manter), custa R$ 0 até um volume que a Fase 2 ainda não tem, e não deixa chave nem dado de cliente parado num disco. O prazo prometido é 72 h; alguns minutos de fila não ameaçam o prazo.

## O que não foi verificado
- Página oficial de preços do GitHub Actions e status da taxa de plataforma de US$ 0,002/min (a rede desta sessão não alcançou github.com/pricing; só busca).
- Texto atual dos termos adicionais do Actions sobre uso não relacionado ao projeto.
- Preço oficial da Hetzner em 08/11/2026 e câmbio do euro.
- Tempo real de um pedido no runner (medir no primeiro pedido).
- Cloudflare Containers como terceira opção (mesma conta do deploy): não pesquisado nesta tarefa; a revisão semanal do stack deve olhar.
