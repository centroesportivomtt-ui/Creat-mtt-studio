# Porta Aberta · Fase 1 "A Porta que vende" · RELATORIO FINAL

Projeto `projetos/creat-nuvem/` · 09/11/2026 · briefing em `docs/briefing-porta-aberta-fase1.md`.
O diário completo de cada agente (T1 a T10, ajustes do revisor e correções do QA) está em `docs/relatorio/DIARIO-COMPLETO.md` e em `docs/relatorio/T*.md`.

## Resumo
Vitrine com a placa que vira ABERTO, prévia gerada no navegador, motor com 3 nichos (barbearia, salão, academia), checkout com 4 placeholders, sede com a marca do cliente, kit de anúncios e CLI de produção v0 estão construídos, revisados, testados pelo QA e com as correções aplicadas. O deploy está travado de propósito até o Marcos trocar os 4 marcadores. Nada foi publicado, commitado ou pago.

## Como rodar (a partir de `projetos/creat-nuvem/`, Node 22)
```
npm ci
node scripts/checar.cjs                 # código 0
CREAT_TESTE_TMP=<pasta existente> npm test   # 43 de 43
node scripts/checar-placeholders.cjs    # código 1 enquanto houver marcador
node scripts/montar-publico.cjs         # monta dist/publico/
python3 -m http.server 8080 -d dist/publico
node ../../.claude/skills/verificacao-visual/olhar.cjs http://127.0.0.1:8080/
```
Produção de pedido: `.env` com `ANTHROPIC_API_KEY` e `CREAT_CAMBIO`, depois `node --env-file=.env scripts/producao/produzir.mjs --pedido <arquivo>`. Publicar só com o ok do Marcos: `wrangler@4.158.0 deploy`.

## O que foi feito
T1 contratos e schemas (Cirro) · T2 direção, tokens e desenhos (Paleta) · T3 textos e kit de marketing (Verbo) · T4 motor e prévia (Pixel) · T5 vitrine, checkout e dados (Pixel) · T6 placa e sede com marca (Órbita) · T7 som (Eco) · T8 salão e academia (Pixel) · T9 CLI de produção (Forja) · T10 deploy, headers e higiene (Trilho). Correções do QA: rolagem lateral em /abrir/, limites de nome, integridade de scripts do CDN, endereço unificado entre vitrine e produção, nome fora da query da sede, mudo na prévia, servidor da sede e trava do `--destino`, rotina diária de vagas, contagem "4 dados".

## Status dos critérios
| critério | status |
|---|---|
| `checar.cjs` código 0 (schemas, presets, dados, sem ocupacaoFicticia, emoji, "agenda") | ok, rodado agora |
| `npm test` (produção com fixture, sem rede e sem chave; rejeita whatsapp 5500000000000, avaliação sem origem, ocupacaoFicticia; zip SAIR sem domínio Creat; custo.json) | ok, 43 de 43 rodado agora |
| verificacao-visual: home, /abrir/, /obrigado/, /bastidores/, /termos/, prévia salão e prévia academia (390 e 1440, claro e escuro) | ok, "Tudo limpo" nas 7 rodado agora sobre `dist/publico`. Obs.: a ferramenta usa 1440 no desktop; 1280 foi coberto por scripts Playwright das tarefas |
| Prévia: nome só no fragmento, sem dado pessoal em query | ok (T4, T5, T6 e correção da sede, testado em rede) |
| Placa: arrastar >40% e botão equivalentes; rolagem fora da placa; reduced-motion sem giro e sem som | ok no Chromium; gesto em celular real não verificado |
| Som: nada antes do primeiro gesto, mudo persiste, vale na prévia | ok por contagem de fontes de áudio; timbre não ouvido em aparelho real |
| Teste de verdade: wa.me do número do visitante, inválido com erro, número fora da rede | ok (T4, T5) |
| /abrir/: total antes de pagar, aceite obrigatório, botões desativados com marcador, link certo com links de teste | ok (T5 e correções do QA) |
| Dados velhos (vagas ausente ou >48 h, depoimentos vazio) | ok (T5); rotina diária pronta mas desligada, nunca rodou no GitHub |
| /obrigado/ sem afirmar pagamento, PEDIDO v1 completo com origem | ok (T5, schema validado) |
| Sede: `?marca=` troca placa, `<script>` inerte, `?modo=publico` sem estado.json, estado público sem rótulos internos, modo local intacto | ok (T6 e correção; autoteste 22 ok) |
| Bastidores: "exige Claude Code" antes do preço, sem link na primeira tela da home | ok |
| Consentimento: sem Pixel e Clarity antes do aceite, PostHog sem cookie, sem PII em evento | ok com chaves de exemplo; chamada real ao PostHog, Pixel e Clarity não verificada na rede (sandbox bloqueia). Muralha precisa conferir `before_send` sem `#` com chaves reais |
| produzir.mjs com fixture gera dist/<slug> que abre de file:// | ok |
| 3 nichos sem depoimento, nota, foto de pessoa ou horário inventado | ok |
| checar-placeholders falha com marcadores e passa trocados; 4 marcadores só em `checkout.config.js`; sem `[PREENCHER]` | ok (grep: nenhum PREENCHER; a cópia em `dist/publico/checkout.config.js` também leva os marcadores) |
| Home sem sede <= 500 KB; sede só sob demanda no celular | ok (~167 KB mais ~53 KB de fontes, medido na T5) |
| Textos pt-BR, sem lorem, sem emoji, sem promessa de ganho, preços de `dados/*.json`, REVISAO_JURIDICA_PENDENTE, política da Meta datada | ok; "5 dados" não aparece mais em texto público (só neste diário) |
| Segredos: varredura (arquivos e 48 commits na T10; grep rápido agora) sem achados; `.env.example`; versões fixadas; `.gitignore` | ok |
| `dist/` fora do git | **falhou**: `dist/publico/` está versionado por snapshots automáticos e por regra no `.gitignore` da T9. Falta `git rm -r --cached projetos/creat-nuvem/dist` e ajustar o comentário do `.gitignore` |
| CSP e headers sem violação | ok em `wrangler dev` (T10); `_headers` aplicado pela Cloudflare real não verificado |
| Linha 17 de `docs/stack-ferramentas-2026.md` | ok |
| Hashes SRI (three@0.160.0, posthog-js@1.447.3) | não verificado contra o jsDelivr real (CDN bloqueado). Se divergir, a sede perde o 3D; alternativa: hospedar o three no domínio |
| Revisor (Crivo), QA (Lupa) e segurança (Muralha) | ok: rodaram, apontaram problemas, correções aplicadas e retestadas por testes e verificação visual. Uma segunda passada da Muralha com chaves reais e rede aberta ainda é necessária antes de publicar |
| Primeira produção real com a API | não verificado: sem `ANTHROPIC_API_KEY`. Custo real e qualidade dos textos pendentes; R$ 0,1028 é da fixture |

## Placeholders abertos (deploy travado)
Em `checkout.config.js`: `[LINK_ASAAS_ABERTURA_INAUGURACAO]`, `[LINK_ASAAS_ABERTURA_PADRAO]`, `[LINK_CAKTO_BASTIDORES]`, `[WHATSAPP_SUPORTE_55DDDNUMERO]`. Medição (`posthogChave`, `metaPixel`, `clarity`) em formato de exemplo, desligada. Textos: `{{empresa.documento}}`, `{{empresa.endereco}}`, `{{site.url}}`.

## Textos pendentes de revisão jurídica
`conteudo/termos.md` e `conteudo/privacidade.md` (linha `REVISAO_JURIDICA_PENDENTE` no topo). Pontos: MEI como consumidor (art. 49), liberação do SAIR após 7 dias, devolução proporcional do anual, régua de inadimplência, licença do motor no site exportado, e se a frase dos "4 dados" exige `termos-v2`.

## Números não verificados
Custo real por pedido e tabela `PRECOS` (cache da skill, 06/10/2026); câmbio R$ 5,50; preços do GitHub Actions e Hetzner (ADR-004); tempo por pedido no executor; metas da calibragem (a definir); prazo de 72 h (promessa do briefing); timbre do som e gesto em celular real; benchmark e ângulo E de anúncios (artigo do SEJ de 29/02/2024 não reaberto).

## Incoerências de oferta e atritos conhecidos (severidade alta)
- O contador de vagas só desce com `atualizar-vagas.cjs --vendeu` a cada pedido pago. Sem isso a rotina publica um contador maior que o real. Ideal: `produzir.mjs` ou webhook do Mercado Pago chamar `--vendeu`.
- A sede pública mostra demonstração; o andamento do pedido chega pelo WhatsApp. A publicação ao vivo (`publicar-estado.cjs` a cada 1 a 2 min) não existe. Os fluxos reais precisam seguir o padrão `pedido-*`.
- O link da inauguração no provedor (Mercado Pago: data de vencimento; Asaas: quantidade máxima) deve ter limite e data de fim; a rotina sai com código 2 se o link real persistir após o fim.
- Detalhe visual: sombra em L na caixinha "Aberto" dos dias em /abrir/ parece traço solto (Paleta).
- `projetos/loja/produtos/agencia/sede/servidor.cjs` ainda serve qualquer arquivo da pasta.

## Desvios do briefing
Quinto nicho da lista de espera chamado `outro`; pigmentação fora do preset da barbearia (política da Meta); R13 sem recompensa e sem `utm_content`; `pago_pagina` renomeado `pedido_enviado_pagina`; sede sem `?modo` vira `publico` fora de localhost, `file:` e artefato; `scripts/montar-publico.cjs` criado (arquivo extra); rodapé "Aberto pela Creat" removido no SAIR; preço do site entregue sempre "sob consulta".

## Depende do Marcos
1. Trocar os 4 marcadores e pôr as chaves de PostHog, Pixel e Clarity.
2. Informar CNPJ ou CPF, endereço, domínio final, e-mail de suporte e posts por mês do Vitrine.
3. Revisão jurídica; metas e regra de parada da calibragem de 16 a 22/11 (bloqueada até lá); decidir recompensa de indicação.
4. Em GitHub: secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, variável `ROTINA_VAGAS_ATIVA=true`, repositório privado (`docs/CHECKLIST-REPOSITORIO-PRIVADO.md`).
5. Aprovar o primeiro deploy e escolher o executor da Fase 2 (ADR-004).
6. Autorizar a primeira produção real com a chave do Console.

## Próximos passos
1. Remover `dist/` do índice do git. 2. Conferir os hashes SRI contra o jsDelivr. 3. Teste em celular real (gesto, som). 4. Muralha e Lupa com chaves reais e rede aberta (aba de rede sem `#`, `n=`, `c=`). 5. Automatizar `--vendeu` e a publicação do estado da sede. 6. Primeira produção real e conferência de custo. 7. Calibragem de anúncios em 16/11, se os bloqueios forem resolvidos.

## Entrega e demos, 09/11/2026

### Trilho · publicação dos sites no app Base44
Para que serve na venda: o site do cliente entra no ar no mesmo app da vitrine, em `https://creat-nuvem-404b1994.base44.app/sites/<slug>/`. Sai com um comando, hash conferido e sem risco de apagar o site de outro cliente.

- **Novo `scripts/producao/publicar-site.cjs`** (`npm run publicar-site -- --slug <slug> [--saida] [--destino] [--demo] [--json]`). O script confere `dist/<slug>/`: build válido, slug igual, lista branca de arquivos e nenhum link simbólico. Depois roda `testar-site.cjs`, grava `site-<slug>.zip` com `sites/<slug>/` (mtime fixo, então o mesmo build dá o mesmo sha256) e relê o zip para conferir. No fim, imprime o sha256 e os passos MCP: Drive `create_file` na pasta "Creat Nuvem" com `base64Content` `sha256:<hash>:<caminho>`, `share_file` anyoneWithLink e `run_command` no Base44 com `curl` + `sha256sum -c` + `python3 -m zipfile -e` + cp para `public/sites/<slug>`. Em seguida vêm `git log --oneline -1`, checkpoint e deploy. O script não faz upload nem deploy. Com `--demo`, exige a faixa "demonstração · nome fictício" e o WhatsApp 5575981151202.
- **Novo `docs/PUBLICACAO.md`** com os dois procedimentos. A vitrine apaga só a lista explícita dos seus caminhos de topo (`404.html _headers abrir assets bastidores checkout.config.js conteudo dados index.html motor obrigado previa privacidade ritual sede termos`) antes do `cp -r dist/publico/. public/`. Nunca apaga `public/sites`. `montar-publico.cjs` agora imprime essa lista e falha se a vitrine tiver `sites/` na raiz.
- **Endereços padrão** (`lib/comum.cjs`: `HOME_PADRAO`, `URL_SITES_PADRAO`). `CREAT_URL_SITES` vazio vira `https://creat-nuvem-404b1994.base44.app/sites/{slug}/` e `CREAT_HOME` vazio vira `https://creat-nuvem-404b1994.base44.app/`. Com `0`, cada um desliga. O padrão vale em `build-site.cjs` e `produzir.mjs`. `.env.example` atualizado, com a nova `CREAT_PUBLICAR_DESTINO`.
- **Decisão (segurança):** `produzir.mjs` deixou de usar a origem do link `previa` do pedido como home do rodapé. Esse campo vem do formulário e não pode decidir para onde aponta o link de um site entregue. A ordem agora é `--home` > `CREAT_HOME` > home da Creat. O host da prévia continua na varredura do SAIR.
- **SAIR:** passa `url: false` ao build e nunca herda o endereço da Creat. A varredura agora proíbe também o host do app Base44.
- **Testes:** `CREAT_TESTE_TMP=/tmp npm test` dá 49 de 49 (eram 47). Os 2 novos cobrem o endereço padrão, o `0` e o `{slug}` em subdomínio, e o `publicar-site` (zip, hash reprodutível, passos, recusa de slug com `;`, demo fora da regra e arquivo fora da lista branca).
- **Verificado à mão:** produção por fixture, depois `publicar-site` (exit 0, 18 arquivos, 93 KB, mesmo sha256 em duas rodadas). O zip abre com `python3 -m zipfile -e`. Servido por HTTP em `/sites/<slug>/`, o site montou no Chromium a 390 px com 2 wa.me e console limpo, porque os caminhos são relativos.
- **Não verificado:** upload no Drive, download no sandbox do Base44 e deploy. Essas etapas cabem ao chat principal. Também não sei se o Base44 redireciona `/sites/<slug>` (sem barra) para `/sites/<slug>/`; sem esse redirecionamento, os caminhos relativos quebram. O passo 6 do procedimento manda conferir.
- **Pendências:** (1) O `_headers` (CSP, cache) não vale no Base44. (2) O `robots.txt` e o `sitemap.xml` de cada site ficam em `/sites/<slug>/`, onde o Google não lê. Falta um `sitemap.xml` na raiz da vitrine listando os sites publicados. (3) Rodei `montar-publico.cjs` para conferir a lista, e isso remontou `dist/publico/` a partir da mesma fonte.

### Verbo + Pixel · 3 sites-demonstração pela esteira real e a seção "Veja um site entregue"
Para que serve na venda: quem chega pela vitrine vê, antes de pagar, um site entregue de verdade no nicho dele e testa o pedido de horário no próprio celular. O pedido do teste cai no WhatsApp do Suporte Creat, então a demonstração também é um canal de contato. Na faixa do topo, "Quero um assim" volta para a vitrine com `utm_source=demo`.

- **Pedidos e textos** em `demos/`: `pedido-{barbearia,salao,academia}.txt` (PEDIDO v1, Riachão do Jacuípe-BA, Centro, CEP 44640-000, WhatsApp 5575981151202, horários plausíveis, responsável e e-mail fictícios) e `resposta-ia-*.json`, com as respostas da IA escritas à mão pelo Verbo no formato exato da API (`--fixture-ia`). Cada resposta leva o campo `_nota` e `usage` zerado: nenhuma chamada foi paga e o custo.json registra R$ 0. Os textos não trazem preço, ano, nota, depoimento, nome de pessoa, comodidade nem "agenda", e todos passaram no `validar-tenant`.
- **Esteira real, sem chave:** `CREAT_CAMBIO=5.40 node scripts/producao/produzir.mjs --pedido demos/pedido-<k>.txt --fixture-ia demos/resposta-ia-<k>.json --slug demo-<k> --sem-sair --demonstracao --url https://creat-nuvem-404b1994.base44.app/sites/demo-<k>/ --home https://creat-nuvem-404b1994.base44.app`. As três rodadas saíram com código 0 e as 6 etapas ok. O teste headless de 390 px também passou: sem rolagem lateral, menor texto de 12 px, 2 links wa.me/5575981151202, console limpo e faixa presente. Saídas: `dist/demo-barbearia/`, `dist/demo-salao/`, `dist/demo-academia/` (17 arquivos cada) e `sites/demo-*/` (pedido, tenant, custo, RELATORIO e print-390). `publicar-site.cjs --demo` passou nos três; os zips ficaram no scratchpad.
- **Faixa "demonstração · nome fictício"** (o motor não tinha). Fiz uma mudança mínima e aditiva, motor **v1.1.0**, como opção do site `CREAT_SITE.demonstracao` e nunca como campo do tenant. O validador continua proibindo o bloco `demo` (ADR-001), e um teste cobre isso. A flag é `--demonstracao` em `produzir.mjs` e `build-site.cjs`. Efeitos: a faixa é a primeira coisa da página, com selo, a frase "Site feito pela esteira real da Creat Nuvem. O pedido de horário vai para o WhatsApp da Creat, não para um negócio." e o link "Quero um assim". A faixa também aparece no `<noscript>`. O site sai com `noindex, nofollow` e sem JSON-LD, porque negócio fictício não pode virar LocalBusiness no Google. O `robots.txt` fica Disallow e não há sitemap. `testar-site.cjs` ganhou `exigirFaixaDemo`, que falha se a faixa sumir ou sair do topo. Arquivos: `motor/v1/motor.js`, `motor/v1/styles.css` (`.faixa-demo a`, alvo de 44 px, foco visível), `scripts/producao/{produzir.mjs,build-site.cjs,testar-site.cjs}`. Sem a flag, o motor se comporta exatamente como antes.
- **Home:** a nova seção `#sites-demo` "Veja um site entregue" fica entre "Como funciona" e "Preços". São 3 cartões com links relativos `sites/demo-*/` (com barra final), o gesto de cada ritual e a nota "Feito pela esteira real, nome fictício. Nenhum desses negócios existe.". O texto mora em `conteudo/home.json` (`sitesDemo`, com `_regra`: não é prova social). A seção "Quem já abriu" continua escondida.
- **Verificado:** `olhar.cjs --cdn-local` nos três demos (celular e desktop, claro e escuro) deu "Tudo limpo", e olhei os prints. No `navegador`, a home montada (`dist/publico` + `sites/demo-*`) foi aberta no celular. Rolei até a seção, cliquei em "Abrir o salão" e o demo abriu com a faixa e console limpo. Também olhei o desktop escuro: 3 colunas, sem rolagem lateral. Fluxo completo na barbearia: dia → hora → Corte + barba → nome e WhatsApp → "Enviar sem arrastar" → o cartão de confirmação mostra "sob consulta" e o link `wa.me/5575981151202?text=…Corte + barba, quinta, 12/11 às 10h30…`. Console limpo. `node scripts/checar.cjs`: tudo certo, 3 avisos já conhecidos. `CREAT_TESTE_TMP=/tmp npm test`: 53 de 53, com o novo `scripts/testes/demonstracao.test.mjs`, que roda a esteira real nos 3 demos.
- **Pendências:** (1) Publicar os 3 zips em `public/sites/demo-*/` (chat principal, `docs/PUBLICACAO.md`). Antes disso, os links da home dão 404 no ar. (2) As fontes do Google não carregaram no sandbox, então os prints usam as fontes de reserva; no ar elas carregam. (3) Os endereços são plausíveis, mas os nomes de rua existem em muitas cidades. A faixa e a nota dizem que o negócio não existe. Se o Marcos preferir, troque por "s/n". (4) Quando a IA real rodar com chave, a regra 4 do SYSTEM continua exigindo "o dono confirma pelo WhatsApp". No salão, "a dona" soaria mais natural, mas mudar isso exige ajustar o prompt e o validador juntos.

## Entrega e demos, 09/11/2026

**Pixel.** Rodada de correções da revisão dos 3 sites-demonstração e da seção da home. Nada foi publicado: deploy, checkpoint, commit e push ficam com o chat principal.

**Alta: ordem do deploy (sites primeiro, vitrine depois).**
- `docs/PUBLICACAO.md` ganhou a **seção 0, "Ordem obrigatória"**: publique `demo-barbearia`, `demo-salao` e `demo-academia` (seção 1) antes da vitrine ou no mesmo deploy, e confira os 3 URLs com 200 antes e depois. A seção 2 agora tem esse pré-requisito e a conferência pós-deploy.
- Trava nova, `scripts/conferir-sites-no-ar.cjs` (`npm run conferir-sites-no-ar`). Ela lê os links `sites/<slug>/` de `dist/publico/` e faz `curl -L` em cada `/sites/<slug>/` no ar. Exige 200, pelo menos um `wa.me` e, nos demos, a faixa. Sai com 0 para liberar e 1 para bloquear. Usa curl porque o fetch do Node 22 não passa pelo proxy. Hoje, rodada às 17h20, ela dá **1: os 3 demos voltam 404 no ar**, então a vitrine nova ainda não pode subir. Contra um servidor local com `dist/local/`, deu 0.
- `montar-publico.cjs` agora imprime `sites que a vitrine linka: demo-academia demo-barbearia demo-salao` e o aviso de ordem.

**Média.**
- **Endereços:** os pedidos passaram a usar `Rua do Exemplo, s/n` (barbearia), `Travessa do Exemplo, s/n` (salão) e `Avenida do Exemplo, s/n` (academia), todos em Centro, Riachão do Jacuípe-BA, com o CEP geral da cidade, 44640-000. Nenhum número leva a um imóvel. No motor, quando `CREAT_SITE.demonstracao` está ligado, `mapaUrl` fica vazio: a demo não tem o botão "Como chegar no Google Maps". O site entregue continua com o link, e um teste cobre os dois casos.
- **Horário inventado. Decisão:** o horário fica, marcado como exemplo. Sem `funcionamento` o fluxo de pedir horário (fita de dias e horas), que é o que a demo vende, deixa de existir. Para não parecer fato, a faixa agora diz "Endereço e horários são de exemplo". O letreiro leva o selo `EXEMPLO` antes de "Aberto agora" ou "Fechado agora". "Horário da casa" ganhou o selo `EXEMPLO`, e "Onde fica" ganhou a nota "Endereço e horário de exemplo: este negócio não existe.". O rodapé começa com "Horário de exemplo:". Se o Marcos preferir tirar o horário de vez, a demo perde o pedido de horário.
- **Título da home:** "Veja um site entregue" virou **"Veja um site pronto"**, com o olho "Sites-demonstração", em `index.html` e em `conteudo/home.json`. O título antigo soava como cliente entregue.
- **Fatos inventados nas respostas de IA** (`demos/resposta-ia-*.json`): saíram "professor na sala", "turma pequena", "o nome de quem vai te receber", "garrafa de água", "toalha limpa", "cadeira limpa", "toalha quente/espuma no pincel", "o pagamento é feito na barbearia" e "o valor depende do comprimento e do tom". Ficaram só descrições do serviço e perguntas encaminhadas ao WhatsApp. As três respostas passaram no `validar-tenant`.

**Baixa.**
- Salão e academia não dizem mais "o dono confirma". Agora é "o salão confirma pelo WhatsApp" e "o studio confirma pelo WhatsApp". A regra 4 do SYSTEM (`scripts/producao/lib/ia.cjs`) passou a pedir o sujeito natural do nicho. O validador já aceitava qualquer "confirma pelo WhatsApp".
- Mensagem da academia (`motor/nichos/academia.js`): agora sai "Quero pedir um horário no studio: Aula experimental, quinta, 12/11 às 10h30. Pode confirmar por aqui?". Conferi no navegador.
- O placeholder e o erro do WhatsApp usam o DDD do negócio, `(75) 91234-5678`, com 11 só como reserva (`motor/v1/agendamento.js`).
- No salão, o rótulo "PINTE A UNHA." não encosta mais no dedo: `.palco-esmalte > .re-svg { margin-bottom: 5% }`, porque o dedo vai até y=204 num viewBox de 200.
- No herói da barbearia, `--gravado` passou de 52% para 62%. O contraste sobre o couro liso ficou acima de 5:1 (Poste 5,9, Selaria 5,9 e Lousa 5,4; antes, cerca de 4,4 no liso e 3,8 nos veios). O efeito continua "aço antes de afiar".
- No escuro, a faixa da demo fica sobre `--fundo-3`, com a tinta clara e um fio do destaque embaixo. Deixou de ser um bloco claro.
- Na academia, os "-- --" eram a marca do alto do ritual. Viraram uma linha tracejada de ponta a ponta com as pontas fechadas, que fica cheia no destaque quando a barra trava (`motor/v1/rituais/barra.js` e `rituais.css`).
- Teste local da home: `scripts/montar-local.cjs` monta `dist/local/` com a vitrine e os 3 demos em `sites/` (não vai para o git nem para o ar). Com ele, o clique em "Abrir o studio" abriu o demo.
- `publicar-site.cjs`: saiu o caminho fixo do scratchpad desta sessão. O destino padrão agora é `CREAT_PUBLICAR_DESTINO` ou `mkdtemp(<tmp>/creat-publicar-)`. `--demo` passa `exigirFaixaDemo` ao `testarSite`, que confere a faixa no topo e o noindex na página renderizada, e confere também `"demonstracao":true` e o noindex no HTML.
- `demonstracao.test.mjs`: apaga a pasta temporária no `test.after` (`CREAT_TESTE_MANTER` guarda). O teste do validador usa fixture própria. Ganhou 3 testes: Maps fora da demo, endereço `s/n` nos pedidos e a leitura dos links da trava.
- Motor: **v1.1.1**. Todas as mudanças são aditivas e, sem `--demonstracao`, o site entregue só muda o placeholder do DDD, o `--gravado` e os dois ajustes dos rituais.

**Verificado:**
- Os 3 demos foram refeitos pela esteira real (`produzir.mjs --fixture-ia --demonstracao`): código 0, 6 etapas ok, teste headless de 390 px ok.
- `CREAT_TESTE_TMP=/tmp npm test`: 56 de 56, com os 3 testes novos de `demonstracao.test.mjs`.
- `node scripts/checar.cjs`: tudo certo, com os 3 avisos `[PREENCHER]` já conhecidos.
- `olhar.cjs --cdn-local` nos 3 demos: "Tudo limpo" nos três. Olhei os prints do salão no desktop claro, da academia no celular claro e no desktop escuro e da barbearia no celular escuro.
- No navegador: home (`dist/local`) → "Abrir o studio" → quinta → 10h30 → Aula experimental → nome e WhatsApp → Enter. O wa.me sai certo e o console fica limpo. "Onde fica" aparece sem o link do Maps e com os selos.
- `publicar-site --demo` passou nos 3 com `exigirFaixaDemo`. **Os zips mudaram**, então descarte os antigos. Os novos estão em `<scratchpad>/zips/`:
  - barbearia `f3c09c28…`
  - salão `6ab2f243…`
  - academia `35c40d78…`

**Pendências:**
- (1) Publicar os 3 zips novos em `public/sites/demo-*/`, rodar `conferir-sites-no-ar.cjs` até sair com 0 e só então publicar a vitrine (`PUBLICACAO.md`, seção 0).
- (2) O CEP 44640-000 é o geral de Riachão, não aponta para imóvel. Mantido porque o formato do pedido exige CEP.
