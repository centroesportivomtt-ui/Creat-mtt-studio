# Domínio do Porta Aberta (endereço único)

Atualizado em 11/11/2026 (pacote H2, Trilho). Decisão do coordenador: o endereço canônico é **https://nuvem.creatmtt.com.br**.

## O que foi feito

| quando | o quê | prova |
|---|---|---|
| 10/11/2026 | O dono criou no Registro.br, zona `creatmtt.com.br`, a entrada `CNAME` de nome `nuvem` para `base44.onrender.com`. Sem custo. | clique P3 de `docs/CLIQUES-DO-DONO.md`, marcado como feito |
| 10/11/2026 | Domínio personalizado verificado no app Base44 `6aefffe66b684db9404b1994`, com cadeado. | `conferir-no-ar.cjs`, grupo E: certificado do emissor WE1, válido, 89 dias de prazo em 11/11 |
| 11/11/2026 | O canônico virou o padrão de tudo, num lugar só: `ENDERECO` em `scripts/producao/lib/comum.cjs`. Os outros scripts leem de lá. | `scripts/testes/endereco-montagem.test.mjs` (inclusive "nenhum outro script escreve o endereço") |
| 11/11/2026 | A vitrine (sitemap, robots), os sites e as demos (canonical, og:url, sitemap, robots, link da home), o link de aprovação do rascunho, o pedido montado pelo executor (prévia) e o passo a passo do `publicar-site` nascem no canônico. | `npm test`, `checar.cjs` ("endereço único") |
| 11/11/2026 | Onde o canônico ainda é texto fixo fora de `comum.cjs` (canonical, og:url, og:image e JSON-LD das 6 páginas indexáveis, `CREAT_ENDERECO.canonico` do `checkout.config.js` e `ORIGEM` dos e-mails em `schema/pedido-regras.mjs`), uma trava compara com `ENDERECO.canonico`. Se o canônico mudar e um deles ficar para trás, reprova. | `checar.cjs` ("endereço único", 21 endereços fixos), `enderecosFixos()` de `comum.cjs`, `endereco-montagem.test.mjs` e `endereco.test.mjs` (os dois leem o canônico de `comum.cjs`) |
| 11/11/2026 | A página nova (pacote H1, `assets/canonico.js`, configuração `CREAT_ENDERECO {canonico, antigos}` em `checkout.config.js`) leva quem abre o antigo ao mesmo caminho no canônico, com consulta e fragmento, antes de medir, gravar ou pedir consentimento. **Ainda não publicada em 11/11 01:40Z.** | grupo E do `conferir-no-ar.cjs`: os 3 saltos saem NÃO VERIFICADO até a publicação; depois, saem ok ou defeito |

Os sites em `/sites/<slug>/` (motor congelado, ADR-001) **não** ganham redirecionamento. Eles respondem nos dois endereços e só passam a nascer com o canônico em canonical, og:url, sitemap e link da home.

## Os dois endereços hoje

| endereço | papel | o que responde |
|---|---|---|
| `https://nuvem.creatmtt.com.br` | canônico. Toda checagem e todo link novo saem daqui | as 8 páginas, as 3 demos, `/api/pa/*` |
| `https://creat-nuvem-404b1994.base44.app` | endereço antigo conhecido. Mesmo app, mesmo conteúdo | tudo igual ao canônico. Com a página nova no ar, a vitrine leva ao canônico; `/sites/` e `/api/pa/*` respondem no próprio antigo |

## O que ainda aponta para o antigo e quando muda

| o quê | onde | quando muda | quem decide |
|---|---|---|---|
| Links dos 6 anúncios ativos (`PA \| Site \| Feira` e `PA \| Site \| Salvador RMS`) | `marketing/utm.md`, "Anúncios no ar" | no ato de 13/11 (subida dos textos corrigidos, P1 b), no mesmo ato e com a validação tripla | coordenador, com o "sim" do dono na P1 |
| Volta do Mercado Pago (`back_urls` success, pending e failure) | 14 preferências do Porta Aberta, tabela em `docs/INTEGRACAO-PAGAMENTO.md`, "Endereço novo" | no ato de 13/11, por função isolada e temporária, só com a **ordem do coordenador** (é PUT em preferência do Mercado Pago) | coordenador |
| `notification_url` das preferências | aponta para `creatmtt.com.br/functions/...`, não para o antigo | não muda nesta troca | nenhum |
| Links do Stripe (after_completion) e retorno do portal | painel do Stripe | **não verificado**: este pacote não leu esses valores | coordenador, no mesmo ato |

Até 13/11 (horário da Bahia) o `validar-anuncio.cjs` aceita o antigo com o aviso "endereço antigo" e "antigo, redireciona" (ou "ainda sem salto", antes da página nova). De 14/11 em diante, link no antigo **reprova**. A data fica em `ENDERECO.antigoAceitoAte`. O `conferir-sites-no-ar.cjs` confere os sites nos dois endereços; o antigo deixa de bloquear depois dessa data, mas continua conferido.

## Por que o antigo nunca pode ser desligado

1. Anúncio e preferência guardam a URL inteira. Se o antigo cair, quem clica no anúncio vê erro e quem paga volta para uma página que não existe: o pagamento entra e a pessoa não vê o pedido.
2. Pix gerado antes da troca pode ser pago dias depois e volta pela URL antiga.
3. O pedido e o consentimento ficam salvos no aparelho **por endereço**. A página nova leva os dois do antigo ao canônico no fragmento `#m=v1.<...>` (não vai ao servidor nem no Referer). Sem o antigo no ar, essa ponte some.
4. Regra: o antigo continua no ar enquanto houver **qualquer** anúncio ativo, preferência válida ou Pix pendente apontando para ele. O grupo E do `conferir-no-ar.cjs` reprova se o antigo deixar de responder 200.

## Como voltar atrás

O canônico aparece em quatro lugares. `CREAT_HOST` só cobre o primeiro: os scripts e a montagem. Os outros três são texto fixo e só mudam editando o arquivo e publicando.

| lugar | o que lê o canônico | segue `CREAT_HOST`? |
|---|---|---|
| `ENDERECO` em `scripts/producao/lib/comum.cjs` | montagem (sitemap, robots), sites e demos novos, conferências, validador de anúncio, link de aprovação, prévia do executor | sim |
| `CREAT_ENDERECO` em `checkout.config.js` | o salto do antigo ao canônico (`assets/canonico.js`) e o link da prévia que a vitrine copia | não |
| as 6 páginas indexáveis (`index`, `abrir`, `obrigado`, `termos`, `privacidade`, `bastidores`) | canonical, og:url, og:image e JSON-LD | não |
| `ORIGEM` em `schema/pedido-regras.mjs`, copiado byte a byte para `src/lib/pa/regras.js` do app | os links dos e-mails ao cliente e ao suporte (obrigado, termos, aprovação do rascunho) | não |

O `checar.cjs` exige que os quatro sejam iguais a `ENDERECO.canonico`. Faça a volta nesta ordem. Entre os passos (b) e (d) o `checar.cjs` reprova de propósito: ele aponta o que ainda falta trocar.

**(a) Emergência: desligar o salto.** Em `checkout.config.js`, deixe `antigos: []` em `CREAT_ENDERECO` e publique a vitrine. O antigo para de levar ao canônico; os dois endereços seguem servindo o mesmo conteúdo. É o que resolve uma tela branca ou um laço no salto. O `checar.cjs` avisa ("salto DESLIGADO de propósito"), não reprova. Não tire o `canonico` do `CREAT_ENDERECO`: sem ele a configuração fica inválida e a vitrine cai num caminho que o H1 não documenta.

**(b) As 6 páginas.** Troque canonical, og:url, og:image e JSON-LD para o endereço de destino. Publique.

**(c) Os e-mails.** Troque `ORIGEM` em `schema/pedido-regras.mjs`, copie o arquivo byte a byte para `src/lib/pa/regras.js` do app e publique o app (compare os dois `sha256sum`, `docs/PEDIDO-API.md`). Até lá, os recibos seguem com links no canônico antigo.

**(d) A fonte dos scripts.** Para um teste rápido sem editar nada, `CREAT_HOST` troca o padrão dos scripts e da montagem:

```bash
cd projetos/creat-nuvem
export CREAT_HOST=https://creat-nuvem-404b1994.base44.app
node scripts/montar-publico.cjs          # sitemap e robots no antigo
node scripts/conferir-no-ar.cjs          # conferência no antigo
```

Para voltar de vez, troque `ENDERECO.canonico` (e `ENDERECO.antigo`, se o papel dos dois se inverter) em `lib/comum.cjs`, troque `CREAT_ENDERECO.canonico` no `checkout.config.js` para o mesmo valor e rode `npm test` e `node scripts/checar.cjs`. Os sites já entregues ficam com o canonical que tinham; os novos nascem no endereço de destino.

O DNS não precisa mudar: os dois endereços continuam ligados ao mesmo app. **Não apague** a entrada `CNAME nuvem` no Registro.br.

## Depois de publicar a página nova

Até a publicação, o grupo E prova o salto só por simulação local (dois hosts por roteamento, `endereco.test.mjs`). Isso não é prova de produção. Depois de publicar:

1. Rode de novo `node scripts/conferir-no-ar.cjs`. Os 3 saltos deixam de sair NÃO VERIFICADO e passam a contar: certo ou defeito.
2. Em celular real, internet móvel, abra no antigo uma URL de volta do Mercado Pago com `utm_source=teste-<agente>` (ex.: `/obrigado/?payment_id=99999999999&resultado=aprovado&utm_source=teste-trilho`). Tem de chegar ao canônico com caminho, consulta e fragmento.
3. Confira a ordem dos scripts que o Base44 injeta no `<head>` no ar: `checkout.config.js` e `assets/canonico.js` têm de vir antes de qualquer medição.
4. Com rede lenta, veja se o primeiro corpo do antigo aparece quando o canônico demora. Não pode haver tela branca.
5. Não publique antes de o achado de tela branca estar corrigido. Falhou no ar: passo (a) acima, corrige, publica e confere de novo.

## Como conferir

```bash
cd projetos/creat-nuvem
node scripts/conferir-no-ar.cjs            # grupo E: canônico 200 com cadeado (8 páginas, 3 demos), /api/pa nos dois, antigo 200, sem laço, salto do antigo
node scripts/conferir-no-ar.cjs --so-endereco   # só o grupo E (20 conferências)
node scripts/conferir-sites-no-ar.cjs      # os 3 sites nos dois endereços
```

Antes da publicação da página nova, os 3 saltos (`/`, `/abrir/?nicho=barbearia&utm_source=teste-pixel`, `/obrigado/?payment_id=99999999999&resultado=aprovado`) saem NÃO VERIFICADO e não reprovam. A detecção é automática: o HTML do canônico citar `assets/canonico.js`, ou a página trazer `window.CREAT_ENDERECO`, ou o salto já acontecer. Depois disso, salto que falhar é defeito no ar.

## Fica para a onda 4 (ficha 4F)

- `checar.cjs`: `node --check` de todos os `.cjs` de `.claude/skills` (não tem a ver com o endereço).
- O marcador `{{HOST}}` já é trocado e travado na montagem, mas as páginas ainda não o usam (são do pacote H1). Até lá, a trava dos endereços fixos do `checar.cjs` impede que elas fiquem para trás. Trocar o HTML por `{{HOST}}` tiraria o passo (b) da volta.
- Verificar o domínio novo na Meta antes dos anúncios novos e trocar os links do Stripe e do portal, no ato do coordenador.
