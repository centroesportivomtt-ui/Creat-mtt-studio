# Porta Aberta · Arquitetura e contratos (Fase 1, 1 página)

Cirro (T1), 08/11/2026. Fonte: `docs/briefing-porta-aberta-fase1.md` (raiz). Limites, listas e exemplos: `schema/*.schema.json` e o anexo `CONTRATOS-DETALHE.md`. Em conflito, o schema vence.

```
anúncio ?nicho=&utm_* ─▶ HOME (CreatPlaca+CreatSom, lê dados/*.json) ─abrir─▶ /previa/#k&n&c&p (noindex)
                          └▶ /abrir/#plano&… ─5 campos+aceite─▶ Asaas ─▶ /obrigado/ ─PEDIDO v1─▶ wa.me/suporte
Marcos cola o texto ─▶ produzir.mjs ─schema/pedido─▶ sites/<slug>/tenant.json ─schema/tenant─▶ build-site ─▶ dist/<slug>/
sede/index.html?marca=&modo=publico ◀─ estado-publico.json (vocabulário fechado)
Fase 2 grava os MESMOS contratos (TenantConfig v1, Pedido, EventoPedido), sem conversão.
```

**(a) Placa** `ritual/placa.js` → `window.CreatPlaca`: `montar(el, {nome?, onAberto?({nome, via}), onSemNome?()})` · `definirNome(nome)` · `abrir(via='botao')` · `reiniciar()`. Nome vazio: balança, não vira, chama `onSemNome`. Não valida, não guarda, não toca na URL.

**(b) Som** `assets/som/creat-som.js` → `window.CreatSom`: `armar()` · `sino()` · `giz()` · `plim()` · `clique()` · `silenciar(mudo?): boolean` · `mudo`. Antes do primeiro gesto, com aba oculta ou mudo: no-op. Mudo em `localStorage['creat:som']`.

**(c) Fragmento** `previa/#k=&n=&c=&p=&utm_*` (ordem fixa; `/abrir/` põe `plano=` na frente). Escreve com `encodeURIComponent`, lê com `URLSearchParams(location.hash.slice(1))`. Limites: anexo (c). Inválido degrada campo a campo, sem erro e sem `throw`. Só `textContent`. Query string só leva `?nicho=` e `utm_*`.

**(d) Dados** `dados/{precos,vagas,depoimentos,nichos}.json`, `fetch` sem cache, 3 s. Fresco = parseia, formato certo e ≤ 48 h (contadores); o preço de inauguração vale até 7 dias (ADR-005). Senão **fail-closed** (ADR-003): preço padrão, sem contador, sem inauguração, sem aviso. Regras por arquivo: anexo (d).

**(e) Checkout** `checkout.config.js` → `window.CREAT_CHECKOUT` (sem segredo): `{versao, whatsappSuporte, links, precosPadrao, linkValido(v), whatsappValido(v), lerPrecos(): Promise}`. Botão `<a data-checkout="…">`; link inválido = sem `href`, `aria-disabled`, "Link de pagamento em configuração". Formato e hosts aceitos: anexo (e).

**(f) localStorage** (sempre `try/catch`): `creat:som` · `creat:consentimento` · `creat:pedido:v1` (expira em 7 dias; botão "Esquecer meus dados"). WhatsApp de teste do visitante nunca é gravado. Sites entregues: prefixo `site:<slug>:`.

**(g) PEDIDO v1** = `schema/pedido.schema.json#/$defs/PedidoEntrada`. Linha 1 `PEDIDO v1`, depois `chave: valor` na ordem do schema. Linha a mais = inválido. Exemplo: `schema/exemplos/pedido.texto.valido.txt`.

**(h) Motor** `motor/v1/` + `motor/nichos/`: scripts clássicos, abrem por `file://`. Ordem `nichos/index.js` → `nichos/<k>.js` → `window.TENANT` → `motor/v1/*.js`. Preset: `CREAT_NICHOS[id] = {id, rotulo, paletas, tenantBase, textosPermitidos, ritual}`; `textosPermitidos` ⊂ chaves de `textos` do schema. O motor só lê `window.TENANT` e não guarda dado de cliente. O rodapé "Aberto pela Creat" não é campo do tenant: sai só com `build-site.cjs --sem-rodape`.

**(i) Sede** `?marca=` (≤ 28, só `fillText`) · `?modo=demo|publico|local` (padrão: `local` em localhost/file, `publico` fora) · `?lite=1`. `publico` lê só `estado-publico.json`, cuja `frase` sai de uma tabela fechada por agente (anexo (i)). `etapa` do EventoPedido usa os mesmos slugs.

**(j) Analytics** = `schema/evento.schema.json#/$defs/EventoAnalytics`. Nunca nome, cidade, WhatsApp, e-mail ou endereço. PostHog `posthog-js@1.447.3` com `persistence:'memory'`, `autocapture:false`, `disable_capture_url_hashes:true` e **`before_send` que corta o `#` de toda URL e descarta propriedade fora da lista** (bloqueante T5).

## Riscos (do mais grave ao menos grave)
1. **Nome do negócio vaza para o PostHog** via `$current_url` com `#n=`. Sem o `before_send` de (j) não publica; Muralha confere na rede.
2. **XSS na prévia** se `n`/`c` passarem por `innerHTML`. Crivo reprova.
3. **Preço de inauguração velho** (CDC art. 37) se `atualizar-vagas.cjs` parar: ADR-003 derruba para o padrão.
4. **Enum de nicho em 3 schemas e no registro**: nicho novo = versão nova num commit só.
5. **PEDIDO v1 editado à mão** no WhatsApp: `produzir.mjs` rejeita citando o campo, nunca adivinha.
6. **Pedido sem contato do dono** por desenho; se a Fase 2 precisar, versiona o schema.
