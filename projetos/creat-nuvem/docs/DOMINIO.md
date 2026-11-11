# Domínio do Porta Aberta (endereço único)

Atualizado em 11/11/2026 (pacote H2, Trilho). Decisão do coordenador: o endereço canônico é **https://nuvem.creatmtt.com.br**.

## O que foi feito

| quando | o quê | prova |
|---|---|---|
| 10/11/2026 | O dono criou no Registro.br, zona `creatmtt.com.br`, a entrada `CNAME` de nome `nuvem` para `base44.onrender.com`. Sem custo. | clique P3 de `docs/CLIQUES-DO-DONO.md`, marcado como feito |
| 10/11/2026 | Domínio personalizado verificado no app Base44 `6aefffe66b684db9404b1994`, com cadeado. | `conferir-no-ar.cjs`, grupo E: certificado do emissor WE1, válido, 89 dias de prazo em 11/11 |
| 11/11/2026 | O canônico virou o padrão de tudo, num lugar só: `ENDERECO` em `scripts/producao/lib/comum.cjs`. Os outros scripts leem de lá. | `scripts/testes/endereco-montagem.test.mjs` (12 testes, inclusive "nenhum outro script escreve o endereço") |
| 11/11/2026 | A vitrine (sitemap, robots), os sites e as demos (canonical, og:url, sitemap, robots, link da home), o link de aprovação do rascunho, o pedido montado pelo executor (prévia) e o passo a passo do `publicar-site` nascem no canônico. | `npm test`, `checar.cjs` ("endereço único") |
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

Tudo em código lê `ENDERECO` de `lib/comum.cjs`. Para voltar ao antigo sem editar nada:

```bash
cd projetos/creat-nuvem
export CREAT_HOST=https://creat-nuvem-404b1994.base44.app
node scripts/montar-publico.cjs          # sitemap e robots no antigo
node scripts/conferir-no-ar.cjs          # conferência no antigo
```

Os sites gerados com `CREAT_HOST` saem com canonical e home no antigo. Para desligar o salto da vitrine, o pacote H1 tira `nuvem.creatmtt.com.br` de `canonico` em `CREAT_ENDERECO` (`checkout.config.js`) e publica de novo; o canônico nunca redireciona, então não há laço. Para voltar de vez, troque `ENDERECO.canonico` em `lib/comum.cjs` e rode `npm test`. O DNS não precisa mudar: os dois endereços continuam ligados ao mesmo app. **Não apague** a entrada `CNAME nuvem` no Registro.br.

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
- O marcador `{{HOST}}` já é trocado e travado na montagem, mas as páginas ainda não o usam (são do pacote H1). Quando uma página precisar do endereço no HTML, ela usa `{{HOST}}`.
- Verificar o domínio novo na Meta antes dos anúncios novos e trocar os links do Stripe e do portal, no ato do coordenador.
