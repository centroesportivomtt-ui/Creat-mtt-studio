# ADR-002 · Estado da prévia e do checkout no fragmento da URL, sem backend

Status: aceito · 08/11/2026 · Cirro (T1)

## Contexto
A Fase 1 não tem servidor, banco nem conta (decisão do briefing). A prévia precisa ser compartilhável ("copiar link"), sobreviver ao recarregamento e viajar da home para `/previa/`, `/abrir/` e o PEDIDO v1. A regra dura 3 proíbe dado pessoal em query string. O nome do negócio não é dado pessoal sensível, mas também não deve parar em log de servidor, CDN ou Referer.

## Opções
1. Query string (`?n=`): vai para logs da Cloudflare, Referer e analytics. Rejeitada.
2. localStorage apenas: não compartilha link e some ao trocar de aparelho.
3. Backend com id curto: exige servidor e banco agora (Fase 2).
4. **Fragmento (`#k=&n=&c=&p=&utm_*`)**: o navegador não envia o fragmento ao servidor nem no Referer.

## Decisão
Opção 4, com o formato e os limites de `ARQUITETURA.md` (c). Query string só para `?nicho=` e `utm_*` vindos de anúncio; a home os copia para o fragmento. Dados de contato (responsável, WhatsApp, endereço, e-mail) nunca vão para a URL: ficam em `localStorage['creat:pedido:v1']` entre `/abrir/` e `/obrigado/` e saem do aparelho só quando o próprio dono envia o PEDIDO v1 pelo WhatsApp.

## Consequências
- Zero infraestrutura; a vitrine pode ser publicada como arquivos estáticos (Cloudflare ou Base44).
- Link compartilhável e sem estado no servidor; a Fase 2 guarda o mesmo objeto em `Pedido.previa_config` sem conversão.
- Risco: bibliotecas de analytics leem `location.href` com o fragmento. Mitigação obrigatória: `before_send` do PostHog cortando o `#` (ARQUITETURA, risco 1).
- Qualquer pessoa pode montar um link de prévia com qualquer nome. Por isso a prévia é `noindex`, rotulada como prévia e só renderiza texto (nunca HTML) do fragmento.
- Sem verificação de pagamento nesta fase: `/obrigado/` não afirma pagamento confirmado; a conferência é humana até o webhook da Fase 2.
