# ADR-006 · Motor v1.3: demonstração que vende, relógio do negócio e campos opcionais novos

Status: aceito · 10/11/2026 · Pixel (onda 3, pacote 3A)

## Contexto
A auditoria da onda 3 achou que as três demonstrações não fechavam a venda sozinhas: a compra levava para a home sem o nicho, não havia oferta depois do pedido montado, faltavam mapa e fotos, a tabela vinha depois do formulário, o "aberto agora" seguia o relógio do aparelho de quem visita e o rodapé tinha separador solto. Tudo isso mora no motor (`motor/v1/motor.js`), que é congelado por versão (ADR-001).

## Decisão
Versão **v1.3.0**, compatível: nenhum campo antigo muda, todo tenant v1 continua válido e abre igual nos dados. Três campos **opcionais** entram no `schema/tenant.schema.json`:

| campo | forma | uso |
|---|---|---|
| `fuso` | um dos 16 fusos do Brasil (`America/Bahia`, `America/Manaus`...) | relógio do negócio. Sem ele: fuso da UF do endereço; sem UF: `America/Bahia` |
| `galeria[]` | até 6 `{ src, alt, legenda, credito?, largura?, altura? }`, `src` = `galeria/<nome>.(webp\|avif\|jpg\|jpeg\|png)` | seção `#trabalhos` com 3 fotos ou mais. Na demonstração, `alt` e legenda começam por "Foto de exemplo" (foto) ou "Ilustração de exemplo" (desenho) e cada imagem leva o selo com esse mesmo rótulo |
| `recados[]` | até 3 `{ texto, autor }` | recado DE EXEMPLO, só em site-demonstração (slug `demo-*`), sempre com selo. Depoimento real continua em `avaliacoes[]` com origem e data |

`profissionais[]` já existia e não mudou. `meta.motorVersao` passa a ser gravado como `v1.3` (o padrão do schema já aceitava).

Mudanças de comportamento (todas no motor, sem dado de cliente):
1. **Relógio do negócio.** `CreatMotor.agoraNoNegocio()` devolve um `Date` cujos campos locais são o relógio de parede do negócio (Intl no fuso do tenant), com `ano`, `mes`, `dia`, `hora`, `minuto`, `diaSemana` e `fuso` como propriedades. Letreiro, linha "hoje" da tabela de horário e o `agendamento.js` usam essa função no lugar de `new Date()`.
2. **Letreiro curto.** "Aberto até 21h", "Abre às 5h30", "Abre amanhã às 9h"; aberto sem horário pedível hoje vira "Aberto · peça para amanhã às 9h". Texto `letreiroAberto`/`letreiroFechado` do tenant só vale se couber em 24 caracteres (o campo continua válido).
3. **Ordem das seções.** Manifesto, tabela da casa (com "Pedir este" em cada linha), trabalhos, pedido, equipe, recados, onde fica, perguntas. A citação do manifesto que repetia o bordão saiu.
4. **Demonstração.** Faixa de uma linha (`.faixa-demo` com `.selo-demo`, `<details>` "Como funciona" e `a.quero-assim`); textos do herói, do pedido e do espelho dizem que aqui o pedido vai para a Creat e no site do cliente vai para ele; mapa ilustrativo (centro da cidade de exemplo, nunca a rua de exemplo) com nota; seção `.fecho-demo` antes do rodapé e o mesmo bloco `#oferta-demo` logo depois do espelho de confirmação.
5. **Compra do nicho.** Faixa, fecho, espelho e rodapé da demonstração levam a `<home>/?nicho=<nicho>&utm_source=demo|rodape&utm_medium=ref&utm_campaign=demo-v1|rodape-v1&utm_content=<nicho>`, o mesmo destino dos anúncios. `/previa/?nicho=` foi descartado: a prévia lê só o fragmento `#k=` e abriria a barbearia com o aviso "Escolha o seu nicho" (`previa/previa.js`).
6. **Fecho sem preço à mão.** O build (`build-site.cjs --demonstracao`) escreve `CREAT_SITE.fecho = { titulo, linha, botao }` a partir de `dados/precos.json`; `scriptTenant` só copia o fecho com `demonstracao:true`. Sem fecho, título e botão saem do motor ("Este site, com o nome do seu negócio, pronto para você aprovar.", sem prazo, para nunca divergir de `dados/precos.json`) e a linha de preço não aparece.
7. **Rodapé.** Horário e WhatsApp em parágrafos separados (sem " · " solto), dias em minúsculas depois de "Horário de exemplo:", endereço "Centro, Cidade (UF)". Tabela: "Segunda a quinta".
8. **Topo e botões fixos.** `.topo.sem-pedir` enquanto o botão de pedir está no polegar; `#whats-flutuante.is-escondido` enquanto o herói está na tela; depois do ritual, o botão só desce para o polegar quando o nome (h1) já subiu acima de 96 px do pé da tela.
9. **Som desligado por padrão** no site (fora da prévia): o motor grava `site:<slug>:som = off` na primeira visita; liga pelo toque.
10. **Rótulo honesto da galeria.** Desenho da casa leva "Ilustração de exemplo", foto leva "Foto de exemplo" (chamar desenho de foto seria afirmação falsa, CDC art. 37). O motor lê o rótulo no começo do `alt` de cada imagem, não repete o prefixo que já veio e escreve o selo `.selo-foto` com esse rótulo; sem rótulo no texto, entra "Foto de exemplo".
11. **Preço zero.** Serviço com `preco: 0` (aula experimental, avaliação) aparece como "Grátis" na tabela e no pedido, nunca "R$ 0".

Validação (`scripts/producao/lib/validacao.cjs`): demonstração = slug `demo-*` (o `produzir.mjs` põe `cliente-` na frente de todo slug de cliente que começaria assim). Recado só em demonstração; na demonstração, imagem sem "Foto de exemplo" ou "Ilustração de exemplo" no começo do `alt` e da legenda é recusada; em site de cliente, "foto de exemplo", "ilustração de exemplo", "profissional de exemplo" e afins continuam recusados.

Produção (`scripts/producao/lib/tenant.cjs`): galeria e recados do preset nunca passam para prévia nem para cliente. Com `--demonstracao`, o arquivo versionado `demos/extras-<nicho>.json` (chaves `galeria`, `profissionais`, `recados`, `fuso` e `precos`) entra no tenant, para que gerar a demo de novo a partir de `demos/` reproduza o mesmo `tenant.json`. `precos` é um mapa `{ id do serviço: número >= 0 }`, não vira campo do tenant: vai para `servicos[].preco`. Com preço em todos os serviços, a nota da tabela é "Preços de exemplo. No seu site entram os seus valores.". Id de serviço que a demo não tem é erro.

## Consequências
- Sites de cliente no ar continuam abrindo com o tenant atual. Ao republicar o `motor/` deles, ganham o letreiro curto, a tabela antes do pedido com "Pedir este", o relógio do negócio, o rodapé corrigido e o som desligado por padrão. Nenhum ganha galeria, fecho ou faixa de demonstração.
- Prova: `scripts/testes/demonstracao.test.mjs` (tenant com e sem galeria, tenant antigo válido, cliente sem galeria não gera seção nem pasta, compra do nicho, fuso, letreiro, rodapé).
- Limite aceito: a galeria só aparece com 3 fotos ou mais; com menos, a seção não existe.

## Registro de mudanças compatíveis
- 11/11/2026: na demonstração, nome e WhatsApp do pedido ficam só na memória da página e o `:cliente` antigo é apagado ao abrir; o site entregue não muda. Mudança compatível sob v1.3.0, achado da segurança.
