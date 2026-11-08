# Loja Creat Nuvem: relatório final

Pedido do dono: transformar a estrutura da agência em dinheiro, ao máximo. Resposta: empacotar o que já existe em 3 produtos pagos e uma versão Lite grátis, com página de vendas, listagens, posts de lançamento e checklist de 90 minutos. Tudo em `projetos/loja/` (mais correções em `projetos/barbearia/`). Nada em `sede/`, `.claude/` ou na raiz foi editado. Nenhum commit ou push.

**Veredito: o material está pronto, mas a loja NÃO pode ser publicada ainda.** Faltam dados que só o dono tem (marcadores abaixo) e os vereditos formais do revisor e da segurança.

## O que foi feito

| Produto | Preço | Zip (em `dist/`) |
|---|---|---|
| 1. Agência 15 agentes (agentes, skills, fluxo `agencia`, CLAUDE.md, sede, GUIA.pdf) | R$ 47 / US$ 12 | `creat-nuvem-agencia-15-agentes.zip` (32 arquivos) |
| 2. Kit Toon 3D (toon-kit.js, demo, Three.js local, README PT/EN) | R$ 39 / US$ 9 | `kit-toon-3d-threejs.zip` (7) |
| 3. Site de barbearia com agendamento por WhatsApp (config.js, README) | R$ 67 / US$ 15 | `site-barbearia-whatsapp.zip` (9) |
| Lite grátis (3 agentes + skill verificacao-visual, MIT) | grátis | `creat-nuvem-lite-gratis.zip` (7) |

Também entregues:
- `empacotar.cjs`: gera zips reprodutíveis (mesmo sha256), exclui arquivos proibidos, procura segredos e caminhos de máquina, avisa marcadores pendentes (`--final` os transforma em erro). Opções: `--verificar`, `--listar`, filtro por produto.
- `gerar-guia.cjs` e `produtos/agencia/GUIA.pdf` (11 páginas A4).
- `index.html`: página de vendas PT/EN, com 4 prints reais da sede em `assets/`.
- 12 listagens (Payhip, Cakto, itch.io, Ko-fi x 3 produtos), 8 posts em `lancamento/` (TabNews, Reddit, Show HN, X-PT, X-EN, dev.to, LinkedIn, roteiro de vídeo), `CHECKLIST.md` (10 etapas, 90 minutos).
- Correções de QA: servidor da sede do produto 1 só escuta em 127.0.0.1 (cópia própria; o original da casa não foi alterado), trava de caminho corrigida, agentes do Lite sem referência a skills ausentes, README do Kit com a pasta certa, Enter confirma a reserva na barbearia, links de WhatsApp escondidos sem JavaScript.

## Status dos critérios

| Critério | Status | Evidência (rodada nesta verificação final) |
|---|---|---|
| 4 zips em `dist/` e `unzip -t` | ok | os 4 sem erro; `empacotar.cjs --verificar` sai com 0 (CRC conferido) |
| Sem `.mcp.json`, `.verificacao`, `node_modules`, `estado.json`, `.env`, `.git`, `RELATORIO`; sem segredos nem `/home/` | ok | listagem dos 4 zips sem nenhum desses nomes; a varredura do script não achou segredo nem caminho |
| Produto 1: 15 agentes, workflows/agencia.js, CLAUDE.md, README, LICENSE, GUIA.pdf, sede/index.html | ok | 15 agentes e todos os arquivos presentes |
| Produto 1: "7 skills" | ok com ressalva | 7 pastas em `.claude/skills/`, mas `sede-ao-vivo` não tem SKILL.md; são 6 skills reais. Textos de venda dizem "6 skills da casa" |
| Lite: exatamente 3 agentes e 1 skill | ok | frontend, qa, revisor + verificacao-visual |
| GUIA.pdf: abre, 8-12 páginas A4, texto selecionável, PT | ok | `pdfinfo`: 11 páginas, A4; texto extraído com `pdftotext` |
| Demo do Kit extraída do zip, console limpo, 4 configurações | ok | zip extraído e servido em pasta própria: `olhar.cjs` "Tudo limpo". Giro, pulo squash and stretch e tema foram testados na T5; FPS só em WebGL por software |
| Barbearia: fluxo completo celular e desktop, WhatsApp correto, README | ok | zip extraído: "Tudo limpo"; fluxo completo testado nas etapas T3 e de correção (celular 390px e desktop). O fluxo não foi refeito nesta rodada final |
| `index.html` nas 4 configurações, PT/EN, placeholders `[LINK_PAYHIP_PRODUTO_N]` | ok | "Tudo limpo"; alternância testada na T4/T9; 12 linhas com marcadores |
| 12 listagens e posts de lançamento, limites, grep lorem/promessa de ganho = 0 | ok | 12 listagens e 8 posts. O grep só acha a regra "não prometa renda" nos arquivos de orientação, nenhuma promessa. Limites conferidos por script no T2/T8 |
| CHECKLIST.md completo, soma 90 min | ok | 10 etapas, tabela soma 90 (conferido no T8/T9) |
| git status só em `projetos/loja/` e `projetos/barbearia/`; sem commit | ok | nenhuma linha fora dessas pastas; último commit continua o anterior |
| Revisor (Crivo) e segurança (Muralha) aprovam `empacotar.cjs` e zips | não verificado | esses agentes não foram chamados nesta orquestração. Um papel de revisor/segurança foi feito por devops e qa, o que não substitui o veredito. Bloqueia a publicação |
| Build, lint e testes | não verificado | o projeto não tem; foram usados `node --check`, `--verificar` e `unzip -t` |
| Sem `[PREENCHER]` esquecido (padrão de entrega) | falhou (esperado) | `empacotar.cjs --final` sai com código 1 (veja abaixo) |
| FPS 60 em celular real | não verificado | sem GPU no ambiente |

## Pendências antes de vender (só o dono resolve)

1. Preencher `[NOME_TITULAR]` e `[EMAIL_SUPORTE]` nas 4 licenças (`produtos/LICENSE-*.txt`), no `GUIA.html` (2 vezes), no README da agência e no `index.html`.
2. Preencher `[LINK_LOJA]` e `[LINK_LITE_REPO]` (README do Lite, posts), `[LINK_PAYHIP_PRODUTO_1..3]` e as versões `_USD`, os links da Cakto nas listagens, e escrever `[POLITICA_REEMBOLSO]` na FAQ.
3. Depois de trocar o e-mail no `GUIA.html`: `node projetos/loja/gerar-guia.cjs`, e então `node projetos/loja/empacotar.cjs --final` precisa terminar com código 0.
4. Barbearia de demonstração: trocar o endereço e o Instagram do `config.js` por dados claramente fictícios, e o comentário "API para o QA" em `agendamento.js:1508`.
5. Conferir nomes de campos dos painéis Payhip, Cakto e Ko-fi (escritos sem acesso aos painéis) e se o Payhip aceita Pix/Mercado Pago; se não, Pix fica na Cakto.
6. Rodar `revisor` e `seguranca` (empacotador, zips, servidor da sede do produto 1, formulário da barbearia). Só publicar com ambos aprovados.
7. Decisão aberta: o servidor da sede da casa continua aberto à rede; só a cópia vendida foi corrigida. Alinhar exige aprovação do dono da sede.
8. Pequeno: a página abre em português por um instante antes de trocar para inglês na primeira visita.

## Como rodar

```
node --check projetos/loja/empacotar.cjs
node projetos/loja/empacotar.cjs --verificar     # gera os 4 zips e confere
node projetos/loja/empacotar.cjs --final         # só deve passar sem marcadores
node projetos/loja/gerar-guia.cjs                # regenera o GUIA.pdf (Playwright)
for z in projetos/loja/dist/*.zip; do unzip -tq "$z"; done
node .claude/skills/verificacao-visual/olhar.cjs projetos/loja/index.html
```
Os zips ficam fora do git (`projetos/loja/.gitignore`). Siga `CHECKLIST.md` para publicar.

## Próximos passos sugeridos

1. Resolver as pendências 1 a 3 e rodar `--final`.
2. Chamar `revisor` e `seguranca`; corrigir o que apontarem.
3. Seguir o `CHECKLIST.md` (90 minutos): produtos no Payhip, página no ar, Lite no GitHub, posts no calendário (um canal por dia; o LinkedIn é o único com link de venda).
4. Depois de 2 a 4 semanas de vendas, olhar qual canal converteu e dobrar nele; considerar prints próprios dos produtos 2 e 3.
