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
- O contador de vagas só desce com `atualizar-vagas.cjs --vendeu` a cada pedido pago. Sem isso a rotina publica um contador maior que o real. Ideal: `produzir.mjs` ou webhook do Asaas chamar `--vendeu`.
- A sede pública mostra demonstração; o andamento do pedido chega pelo WhatsApp. A publicação ao vivo (`publicar-estado.cjs` a cada 1 a 2 min) não existe. Os fluxos reais precisam seguir o padrão `pedido-*`.
- O link da inauguração no Asaas deve ter limite de pagamentos e data de fim; a rotina sai com código 2 se o link real persistir após o fim.
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
