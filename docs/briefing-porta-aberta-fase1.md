Leia primeiro as skills consciencia e melhores-ferramentas. Projeto em projetos/creat-nuvem/. Não faça commit nem push.

# BRIEFING DE CONSTRUÇÃO · PORTA ABERTA · FASE 1 "A Porta que vende"

Data: 08/11/2026 (domingo). Dono: Marcos, Creat.MTT Studio. Pasta do projeto: `projetos/creat-nuvem/`. Executar com o fluxo agencia: `args = { briefing: <este texto>, conceito: false, max_tarefas: 10 }`. O conceito já foi escolhido por júri; não gerar novos conceitos. Textos em português do Brasil, sem emoji, sem lorem ipsum.

## 0. Leitura obrigatória antes de qualquer tarefa
Skills: `consciencia`, `padrao-de-entrega`, `direcao-de-arte`, `toon-3d`, `melhores-ferramentas` (e `docs/stack-ferramentas-2026.md`), `ideacao` (só consulta). Referências reais no repositório: `projetos/barbearia/` (config.js, agendamento.js, efeito.js, efeito.css, som.js, styles.css, index.html, RELATORIO.md), `projetos/loja/index.html` (linguagem visual aprovada pelo dono: fontes Lilita One, Figtree e JetBrains Mono; tokens --ceu #CDEBFF, --papel #FFFDF6, --fundo #FBF6EA, --tinta #1E1B2E, --sol #FFC93C; sombra dura 4px 4px 0 tinta), `projetos/loja/assets/*.webp` (sede-ilha, sede-ao-vivo, sede-celular-escuro, sede-ficha-agente), `sede/index.html` (placa da fachada por volta da linha 518, modo ao vivo por volta da linha 1080, hoje busca `estado.json`), `sede/servidor.cjs`, `.claude/skills/sede-ao-vivo/estado.cjs`, `projetos/loja/lancamento/` (textos para devs já escritos), `.claude/workflows/agencia.js`.

## 1. O que estamos construindo
O **Porta Aberta**: produto único da Creat Nuvem para o dono de negócio local. Na home, o visitante digita o nome do negócio, escolhe o nicho, vira a placa de FECHADO para ABERTO e vê o site dele pronto (gerado no navegador a partir do modelo do nicho). Testa o pedido de horário no próprio WhatsApp. Escolhe o plano, paga por Pix ou cartão (link do Asaas) e envia o pedido por WhatsApp. A equipe de agentes produz o site num motor congelado; o cliente assiste na sede 3D com o nome dele na fachada. Mensalidade: Aberto R$ 147 ou Vitrine R$ 297. A página de dev (Bastidores) é secundária. Esta Fase 1 entrega a **vitrine, a prévia, o motor com 3 nichos, o checkout com placeholders marcados, a sede com marca, o kit de anúncios, os scripts de WhatsApp e o CLI de produção v0**. Servidor/Worker/painel/executor 24/7 são a Fase 2 (seção 19), mas os contratos de dados desta fase já são os que a Fase 2 vai consumir.

## 2. Decisões já tomadas (não reabrir; se algo as contradisser, registre no RELATORIO.md e siga a decisão)
- Produto único; Bastidores só em `/bastidores/` e no rodapé; nunca na primeira tela da home.
- Preços: Abertura R$ 497 (inauguração R$ 297 nas 20 primeiras vagas); Aberto R$ 147/mês; Vitrine R$ 297/mês (herói, rótulo "recomendado"); anual 12 por 10. Todos os valores, prazos e contadores vêm de `dados/precos.json` e `dados/vagas.json`, nunca escritos soltos no HTML.
- Prazo prometido: `prazoHoras: 72` no `precos.json` (vira 48 depois de medido). Relógio começa no Pix + 4 dados. Estourou, 1º mês do plano grátis. 7 dias de arrependimento (CDC art. 49). Mensalidade só com o site no ar. Sem fidelidade. SAIR leva site estático, domínio e arquivos.
- Fale "pedido de horário no seu WhatsApp", nunca "agenda" nem "agendamento garantido".
- Nichos no lançamento: barbearia, salão/estética, academia/studio. Outros 5 aparecem como "avise-me quando chegar o seu nicho" (mensagem de WhatsApp pré-preenchida para o Suporte Creat; sem servidor). Clínica/saúde: não aparece nem como lista de espera.
- Sem Google Places, sem backend próprio, sem banco nesta fase. Estado da prévia no fragmento da URL (#).
- Produção usa chave de API do Claude Console (Commercial Terms), nunca a assinatura Pro, nunca o agencia.js por pedido.

## 3. Regras duras (violar = reprovar)
1. Zero depoimento, avaliação, nota, foto de pessoa ou horário "ocupado" inventado em prévia, site entregue ou vitrine. Seção de prova social lê `dados/depoimentos.json`; sem item com `autorizadoEm`, a seção some (sem "em breve" falso). O `ocupacaoFicticia` do projeto barbearia NÃO entra no motor; o validador rejeita a chave.
2. Nada contradiz o CDC art. 37: contador de vagas e preço de inauguração só aparecem se o dado tiver `atualizado_em` de até 48 h; senão a página mostra o preço padrão e esconde o contador. Exemplos sempre rotulados "exemplo".
3. Nenhuma tela com dado pessoal em query string. O WhatsApp digitado pelo visitante nunca sai do aparelho dele (nem para analytics).
4. Placeholders de link só existem em `checkout.config.js`, escritos exatamente `[LINK_ASAAS_ABERTURA_INAUGURACAO]`, `[LINK_ASAAS_ABERTURA_PADRAO]`, `[LINK_CAKTO_BASTIDORES]`, `[WHATSAPP_SUPORTE_55DDDNUMERO]`. Enquanto existirem, os botões ficam desativados com o texto "Link de pagamento em configuração" e `scripts/checar-placeholders.cjs` FALHA o deploy. Nenhum outro `[PREENCHER]` pode sobrar.
5. Nada de roxo-azul genérico, mockup de celular flutuando, ícones em círculo em três colunas, emoji como marcador (skill direcao-de-arte).
6. Sem segredos no repositório; `.env.example` atualizado; dependências com versão fixada.
7. Anúncios e textos: sem promessa de ganho, sem antes e depois, sem comparação nominal com concorrente, sem afirmar estado negativo do espectador ("sua barbearia está fechada"), sem nome de cliente real sem autorização escrita.
8. Cada texto de termos/privacidade abre com a linha `REVISAO_JURIDICA_PENDENTE` até o Marcos aprovar.
9. O motor continua sendo script clássico (sem import/export) para o site entregue abrir do disco (duplo clique).

## 4. Estrutura de pastas
```
projetos/creat-nuvem/
  index.html                  home "A Porta"
  previa/index.html           runtime da prévia (lê #fragmento)
  abrir/index.html            plano + total + 5 campos + aceite + pagamento
  obrigado/index.html         pós-pagamento + PEDIDO v1 por WhatsApp
  bastidores/index.html       página secundária para devs
  termos/index.html  privacidade/index.html  404.html
  assets/                     tokens.css vitrine.css vitrine.js img/ svg/ som/creat-som.js
  ritual/placa.js  placa.css  componente da placa
  motor/v1/                   template.html motor.js agendamento.js efeito.js som.js styles.css
  motor/nichos/               index.js barbearia.js salao.js academia.js
  dados/                      precos.json vagas.json depoimentos.json nichos.json
  checkout.config.js
  conteudo/                   textos em JSON/MD (Verbo)
  marketing/                  anuncios.md roteiros-video.md whatsapp-scripts.md utm.md
  schema/                     tenant.schema.json pedido.schema.json evento.schema.json
  scripts/producao/           produzir.mjs validar-tenant.mjs build-site.cjs exportar-sair.cjs
  scripts/                    checar-placeholders.cjs atualizar-vagas.cjs checar.cjs
  scripts/testes/             fixtures + testes sem rede
  docs/                       ARQUITETURA.md DIRECAO.md ADR-*.md
  wrangler.toml  _headers  .env.example  RELATORIO.md
sede/ (existente)             index.html (editar) publicar-estado.cjs (novo) estado-publico.exemplo.json (novo)
```

## 5. Páginas

### 5.1 Home `/` (A Porta)
Ordem das seções (coluna única no celular; no desktop, texto à esquerda e placa à direita):
1. **Barra**: logo Creat Nuvem, links "Como funciona", "Preços", "Sede ao vivo", botão WhatsApp. Sem link de Bastidores.
2. **Hero**: placa FECHADO presa por correntinha, balançando 2 graus. H1: "Seu negócio aberto na internet." Subtítulo: "Digite o nome do seu negócio. Em segundos você vê o seu site pronto, testa o pedido no seu próprio WhatsApp e só paga se gostar." Campo "Nome do seu negócio" (label visível, 56 px de altura), chips de nicho (Barbearia, Salão e estética, Academia e studio ativos; Pet, Restaurante, Oficina, Tatuagem como "avise-me"), botão "Abrir meu negócio" sempre visível, dica "ou arraste a placa". Lê `?nicho=` e `utm_*` e preserva no fragmento e no PEDIDO.
3. **Prévia**: ao abrir, o site do visitante ocupa a tela por iframe de `previa/` com barra superior ("Prévia do seu site · copiar link") e barra inferior fixa: "Testar no meu WhatsApp" e "Quero este site no ar".
4. **Teste de verdade**: campo do WhatsApp do próprio visitante (máscara BR, validação), horário e serviço; abre `wa.me/<número dele>?text=...` com o pedido endereçado a ele mesmo. Nota: "Seu número fica só neste aparelho". Alternativa para quem não conseguir: animação do celular recebendo a mensagem dentro da página.
5. **Como funciona** em 4 passos: veja pronto (grátis); pague por Pix; acompanhe na sede; no ar, você aprova. Subseção "Como funciona de verdade": os agentes criaram o modelo e as regras; no seu pedido o texto é escrito por IA, conferido por regras automáticas e por uma pessoa da equipe.
6. **Preços**: cartão Abertura (preço padrão ou inauguração com vagas restantes, ver regra 2), dois cartões de plano (Aberto, Vitrine "recomendado") com lista do que inclui e do que NÃO inclui, bloco "O que você precisa ter" (WhatsApp Business app grátis; CPF ou CNPJ para o domínio .com.br; Instagram só no Vitrine; logo e fotos se tiver) e o contrato em 6 linhas (sem fidelidade, sem multa, domínio no seu nome, SAIR leva tudo, 7 dias de arrependimento, mensalidade só com o site no ar). Seção "Já tem agenda (Trinks, Booksy...)? O botão do seu site pode apontar para ela." Botões levam a `/abrir/#plano=...`.
7. **Sede ao vivo** (seção 10): "Veja quem monta o seu site".
8. **Prova**: lê `dados/depoimentos.json` (regra 1).
9. **Perguntas** (mínimo 10): É IA? Quem confere? Preciso de outra assinatura? E se eu já uso agenda? O domínio é meu? E se eu cancelar? E se passar do prazo? Preciso de Instagram? Serve para clínica? Meus dados?
10. **Chamada final** e **rodapé**: Creat.MTT Studio (titular, como na loja atual), e-mail de suporte, Termos, Privacidade, link discreto "Bastidores: como a equipe funciona por dentro".

### 5.2 `/previa/` (runtime)
Lê o estado do fragmento: `#k=barbearia&n=Barbearia%20do%20Ze&c=Campinas&p=2`. Monta o TenantConfig a partir do preset do nicho + nome + cidade + paleta (3 paletas por nicho com contraste AA verificado) e renderiza com `motor/v1`. `<meta name="robots" content="noindex">`. Sem requisições externas além de fontes. Funciona sem JS? Mostrar `<noscript>` com explicação.

### 5.3 `/abrir/`
Lê `#plano=aberto|vitrine&k=...&n=...`. Mostra: plano escolhido (troca em um toque), **total visível antes de pagar**: "Hoje: R$ X (Abertura). A partir do dia em que o site entrar no ar: R$ Y por mês. Sem fidelidade." Cinco campos obrigatórios com rótulo: responsável, WhatsApp que recebe os pedidos, endereço completo, horário de funcionamento (pré-preenchido pelo nicho), e-mail. Checkbox obrigatório de aceite (termos v1, início imediato da produção, entendimento do arrependimento de 7 dias). Botões "Pagar no Pix" e "Cartão em até 2x" (mesmo link do Asaas, escolhido por `precos.json`). Salva os campos em `localStorage` (aparelho) para a página seguinte. Mostra a garantia de prazo e a lista "o que acontece depois do pagamento". Sem criar conta.

### 5.4 `/obrigado/`
Não afirma que o pagamento foi confirmado. Texto: "Se você acabou de pagar, envie o pedido abaixo; a equipe confere o pagamento e começa." Mostra a janela da sede com o letreiro dele, o relógio de `prazoHoras`, o que esperar e o botão "Enviar pedido no WhatsApp". Monta a mensagem **PEDIDO v1** (linhas `chave: valor`): id (curto, gerado no navegador), plano, nicho, negocio, cidade, responsavel, whatsapp_negocio, endereco, horarios, email, origem (utm), previa (link), aceite_termos (data e versão). Se o `localStorage` estiver vazio, pede os campos de novo.

### 5.5 `/bastidores/`
Primeira linha visível, antes do preço: "Para quem quer montar a própria agência. Exige Claude Code, assinatura paga da Anthropic, por conta de quem compra." Depois: o que vem no pacote (15 agentes, skills, kit 3D toon, template Fio no Couro como exemplo de saída), preço R$ 67 (botão `[LINK_CAKTO_BASTIDORES]`), Lite grátis (e-mail), licença em linguagem simples (a licença da barbearia permite uso em projetos de clientes, proíbe revender o pacote como produto; ver `projetos/loja/produtos/LICENSE-*.txt`), link para voltar à home. Usa textos de `projetos/loja/lancamento/` como base, atualizando o preço.

### 5.6 `/termos/`, `/privacidade/`, `404.html`
Conteúdo de Verbo (seção 17, T3). Termos: serviço, prazo e garantia, arrependimento, reembolso proporcional no plano anual, régua de inadimplência, SAIR, propriedade do domínio e dos arquivos, uso da marca do cliente em conteúdo (consentimento), limites do "ilimitado", operador de dados. Privacidade: o que a vitrine coleta (nada pessoal antes do aceite), Pixel só após consentimento, retenção, contato do encarregado.

## 6. Ritual da placa (`ritual/placa.js`, `placa.css`)
API: `CreatPlaca.montar(elemento, { nome, onAberto })`, `CreatPlaca.reiniciar()`. A placa é um botão acessível (`role="button"`, foco visível, Enter/Espaço), com SVG de madeira com corrente. Arrastar para baixo mais de 40% da altura (Pointer Events, `touch-action: none` SOMENTE na placa para não travar a rolagem da página) ou tocar em "Abrir meu negócio" dispara: giro com mola (CSS 3D ou WAAPI, 600 ms, compressão e esticada leves, estilo do kit toon), ABERTO com o nome, `CreatSom.sino()`, `navigator.vibrate?.(30)`, `onAberto()`. Giz: as letras do nome aparecem na borda enquanto digita. `prefers-reduced-motion`: crossfade sem giro e sem som. Meta de desempenho: 60 fps em celular médio, sem WebGL. Teste no navegador: o gesto de arrastar não impede rolar a página fora da placa.

## 7. Motor e prévia (a generalização da barbearia)
Fonte: `projetos/barbearia/*`. Tarefa: transformar `window.FIO_CONFIG` em um **TenantConfig** (`window.TENANT`) lido por `motor/v1/`, mantendo script clássico e a experiência do Fio no Couro (letreiro de status, fita de dias, horários, ritual de confirmar, tema claro/escuro, som opcional). O motor não contém dado de cliente. Cada nicho é um preset em `motor/nichos/<nicho>.js` (textos, serviços de exemplo, fluxo de pedido, paletas, ritual).

### 7.1 TenantConfig v1 (campos; `schema/tenant.schema.json`, JSON Schema que rejeita campo desconhecido)
```
versao:1, slug, nicho ('barbearia'|'salao'|'academia'|...),
negocio:{ nome, nomeCurto, bordao, whatsapp (só dígitos, 55+DDD+8 ou 9 dígitos), telefoneExibicao,
          endereco:{rua,numero,bairro,cidade,uf,cep}, instagram:{usuario,url} },
pagina:{ titulo, descricao },
funcionamento:{ passoMin, antecedenciaMin, diasNaFita, semana:{0..6: null|{abre,fecha}} },
servicos:[{ id, nome, preco (número ou null = sob consulta), duracaoMin, descricao }],
profissionais:[{ id, nome, especialidade, bio }] (opcional),
avaliacoes:[{ texto, autor, origem:'dono'|'cliente_autorizado', aprovadoEm }] (vazio por padrão),
cores:{ fundo, texto, destaque, apoio },
agendamento:{ modo:'whatsapp'|'link_externo', urlExterna?, mensagem? },
textos:{ ...somente chaves da lista branca do preset },
meta:{ previa:boolean, motorVersao, criadoEm }
```
Campos proibidos: `demo.ocupacaoFicticia` e qualquer chave não listada.

### 7.2 Regras do motor
- "Pedir horário": dia, horário, serviço (e profissional, se houver), nome e WhatsApp do cliente final; gera mensagem para o WhatsApp do negócio. Nunca promete confirmação: o texto diz "o dono confirma pelo WhatsApp". Dados do cliente final ficam só no aparelho (como hoje), com "Esquecer meus dados".
- Na prévia (`meta.previa = true`), o botão final pede o WhatsApp de teste do visitante. No site entregue, abre `wa.me/<negocio.whatsapp>`.
- `agendamento.modo = 'link_externo'` troca o fluxo por um botão "Agendar" que abre `urlExterna`.
- Rodapé de todo site entregue: "Aberto pela Creat · veja o seu" com link para a home (UTM `origem=rodape`), desligável apenas pelo Marcos.
- Acessibilidade: alvos de toque de pelo menos 44 px, foco visível, contraste AA, `prefers-reduced-motion`, tema escuro.
- JSON-LD `LocalBusiness` gerado do tenant no site entregue.

### 7.3 Nichos da Fase 1
- **Barbearia**: preset a partir do Fio & Couro; ritual: afiar a navalha no couro com o polegar. Serviços de exemplo (corte, degradê, barba, corte + barba, pezinho, pigmentação) com preços de exemplo; sem equipe nem depoimentos de exemplo na prévia.
- **Salão, unhas, estética**: serviços de exemplo (corte, escova, coloração, manicure, pedicure, design de sobrancelha, hidratação); ritual: pincelar o esmalte (arrastar o pincel sobre a unha desenhada). Fora do preset: procedimentos de saúde, antes e depois.
- **Academia, studio, personal**: pedido = aula experimental ou avaliação; modalidades; preços "sob consulta" por padrão; ritual: levantar a barra. Caso real: Elite Drako Gym (só citar com autorização).
- Todos: paletas AA, bordão, manifesto curto, FAQ do nicho, mensagem do WhatsApp. Verbo escreve os textos; Pixel implementa.

## 8. Checkout (`checkout.config.js`)
Objeto único `CREAT_CHECKOUT` com: `whatsappSuporte`, `links:{ aberturaInauguracao, aberturaPadrao, bastidores }` (placeholders da regra 4), função `linkValido(valor)`, e leitura de `dados/precos.json`. Nada de chave, token ou segredo. Eventos de analytics em seção 14. Quando Marcos colar os links reais do Asaas, `scripts/checar-placeholders.cjs` deixa passar. Fase 2 troca o fluxo por webhook; o `checkout.config.js` continua como fonte dos preços.

`dados/precos.json`: `{ prazoHoras:72, abertura:{ padrao:497, inauguracao:{ ativa:true, preco:297, vagasTotal:20, vagasRestantes:20 } }, planos:{ aberto:147, vitrine:297 }, anualMesesPagos:10, atualizado_em:"ISO" }`. `dados/vagas.json`: `{ capacidade_dia:3, em_producao:0, vagas_hoje:3, atualizado_em:"ISO" }`. `scripts/atualizar-vagas.cjs` edita os dois com validação.

## 9. WhatsApp
Um número "Suporte Creat" (placeholder). Links `wa.me/<número>?text=<mensagem codificada>` para: dúvida, avise-me do nicho, PEDIDO v1, suporte. Botão flutuante "Chamar no WhatsApp" na home (alvo de 44 px, não cobre o CTA). Scripts do Business em seção 13.

## 10. Sede ao vivo com a marca do cliente
Editar `sede/index.html` com cirurgia mínima, sem quebrar o modo ao vivo atual:
- `?marca=Nome` (máx. 28 caracteres, só letras, números, espaço e `& . - '`, tudo escapado) redesenha a placa da fachada (`signTex`, canvas 1024x300) com o nome e a legenda "ABERTO PELA CREAT NUVEM". Sem o parâmetro, comportamento atual. `?marca=<script>` deve ficar inerte.
- `?modo=demo|publico|local`. `demo`: usa um estado fictício embutido, com a legenda "Demonstração" sempre visível. `publico`: busca `estado-publico.json` (nunca `estado.json`). `local`: comportamento atual para uso interno do Marcos com o servidor local.
- `?lite=1`: pixel ratio 1, sem sombras, limite de 30 fps; no celular a home mostra o poster `assets/img/sede-ilha.webp` com "Ver ao vivo" e só então carrega o 3D (lazy). 3D automático só no desktop. Fixar a versão do Three.js e registrar de onde vem.
- Novo `sede/publicar-estado.cjs`: lê o estado gerado por `.claude/skills/sede-ao-vivo/estado.cjs` e escreve `estado-publico.json` com vocabulário fechado derivado de (personagem, status), NUNCA do texto livre: por exemplo, Verbo trabalhando = "escrevendo os textos", Paleta = "escolhendo as cores", Pixel = "montando a página", Lupa = "testando no celular", Muralha = "conferindo segurança", Trilho = "publicando", Radar = "conferindo os dados", Nimbus = "organizando a fila". Remove caminhos, rótulos internos, nomes de fluxo, contagem de tokens e qualquer coisa que pareça cliente. Fluxos aparecem como "Pedido da Creat" ou "Projeto interno". Sem fluxo ativo: "A equipe espera o próximo pedido." Gera também `estado-publico.exemplo.json`.
- Honestidade: o painel público só mostra personagem trabalhando se o estado público o indicar. A legenda de demonstração nunca é apresentada como pedido real.
- Fase 2 (não fazer agora): link por token `/api/sede/:token`.

## 11. Bastidores: ver 5.5. O checkout é Cakto, fora do fluxo do Porta Aberta.

## 12. Kit de anúncios (`marketing/anuncios.md`, `roteiros-video.md`, `utm.md`)
Objetivo: material para o Marcos subir sem pensar. Estrutura: campanha de tráfego para a home com `?nicho=` (calibragem de 16 a 22/11) e, para janeiro, um conjunto Click-to-WhatsApp.
- **Ângulos** (3 variações de texto principal, 3 títulos e 2 descrições cada, por nicho): A "Prévia": "Digite o nome do seu negócio e veja o seu site pronto em segundos, com pedido de horário direto no seu WhatsApp. Sem cadastro. Você só paga se gostar." / título "Veja seu negócio aberto na internet". B "Sem amarra": "Site, pedido de horário no WhatsApp e posts todo mês por um preço fechado. Sem fidelidade e sem multa. Se sair, você leva tudo." / título "Seu site pronto. Sem amarra." C "A equipe": "É esta equipe que monta o seu site, e você pode assistir. Digite o nome do seu negócio e veja a placa virar para ABERTO." D "No ar antes do Natal": "Pedidos pagos até 15/12 entram no ar antes do Natal. Vagas limitadas por dia." (só se a capacidade em `vagas.json` for real). E (teste, evidência antiga): "O site grátis do Perfil da Empresa no Google acabou (Search Engine Journal, 29/02/2024). Veja o seu pronto em segundos."
- **Roteiros de 15 s em 9:16** (gravação de tela da prévia real com nome fictício claramente fictício, ou de cliente autorizado): R1 placa (0 a 2 s FECHADO; 2 a 5 s digita e vira; 5 a 11 s o site sobe e o WhatsApp apita; 11 a 15 s CTA); R2 sem amarra (três cartões de texto + prévia); R3 a equipe (sede com a placa do nome + legenda "você assiste"). Cada um com legenda queimada, sem depender de som, e com a pasta de assets.
- **Políticas**: Verbo e Lupa conferem cada texto contra as políticas de anúncio da Meta lidas no dia (registrar data e URL no arquivo); nada de atributo pessoal ou estado negativo do espectador; sem promessa de ganho; sem antes e depois.
- **UTM** (`utm.md`): `utm_source` = meta|instagram|whatsapp|indicacao|parceiro|bastidores|rodape; `utm_medium` = pago|organico|ref; `utm_campaign` = cal-nov26 etc.; `utm_content` = A1-barbearia-v1. Tudo é carregado até o PEDIDO v1 (campo origem).
- **Calibragem**: 1 campanha, 1 conjunto amplo (barbearia + salão), 3 criativos, R$ 40/dia por 7 dias, sem editar. Tabela de leitura com metas e regra de parada (copiar da seção 18 de aceite de métricas).

## 13. Scripts do WhatsApp Business (`marketing/whatsapp-scripts.md`)
Cada script com no máximo 4 linhas, tom direto, 1:1, sem disparo em massa, sem emoji. Entregar: saudação automática (com link da home e `?utm_source=whatsapp`); mensagem de ausência; respostas rápidas R1 "Quero ver" (link), R2 preços honestos (Abertura, Aberto, Vitrine, o que não inclui), R3 prazo e garantia, R4 "preciso ter alguma coisa?" (WhatsApp Business, CPF/CNPJ para domínio, logo e fotos se tiver), R5 pós-pagamento ("recebi, seu relógio de 72 h começa quando tiver os 4 dados"), R6 pedido de materiais, R7 prévia pronta e como aprovar, R8 no ar (Perfil no Google e domínio em passos), R9 lembrete de cobrança D-3, R10 atraso D+1 e D+7, R11 cancelamento e SAIR, R12 pedido de depoimento com autorização por escrito, R13 indicação (1 mês grátis), R14 objeções ("é caro", "já tenho Trinks", "não tenho Instagram", "e se eu quiser sair", "é robô?" com resposta honesta: IA monta, pessoa confere). Etiquetas sugeridas. Regra: nunca prometer o que o contrato não cobre.

## 14. Analytics e privacidade
PostHog (modo sem cookie, `persistence: 'memory'`) na vitrine: eventos `placa_vista`, `nicho_escolhido`, `nome_digitado`, `previa_gerada`, `reserva_teste`, `plano_visto`, `checkout_iniciado`, `pago_pagina` (carregou /obrigado), `sede_aberta`, `lista_espera_enviada`. Propriedades: nicho, plano, utm_*, dispositivo; NUNCA nome do negócio, WhatsApp, e-mail ou endereço. Pixel da Meta e Clarity só depois de aceite explícito no banner (aceitar e recusar com o mesmo destaque). Os sites dos clientes não carregam Pixel nem analytics de terceiros. `schema/evento.schema.json` descreve os eventos.

## 15. Produção v0 (CLI) e contratos da Fase 2
`scripts/producao/produzir.mjs --pedido <arquivo>` (aceita o texto PEDIDO v1 ou JSON):
1. Valida o pedido contra `schema/pedido.schema.json` e cria `sites/<slug>/tenant.json` parcial a partir do preset do nicho.
2. Faz **uma** chamada à API do Claude (variável `ANTHROPIC_API_KEY`; modelo por `CREAT_MODELO`, padrão o Sonnet vigente; consultar a skill `claude-api` para ids e preços), com saída estruturada para preencher somente `negocio.bordao`, `pagina.*`, `servicos[].descricao` e os campos de texto da lista branca do preset. O texto do pedido entra como DADO em bloco delimitado; o modelo não tem ferramentas. Em ambiente de teste a chamada é substituída por fixture (sem rede).
3. Valida de novo com `validar-tenant.mjs`: whatsapp no padrão e diferente de 5500000000000, horários que parseiam, preço numérico ou null, sem `ocupacaoFicticia`, avaliação sem origem rejeitada, campos acima do limite, termos proibidos (promessa de ganho, "garantido", antes e depois, preço de procedimento no nicho saúde). Erro cita o campo.
4. `build-site.cjs` gera `dist/<slug>/` (motor/v1 + tenant.json + index.html + sitemap, JSON-LD, noindex em prévia).
5. Teste no navegador headless (Playwright) a 390 px: sem rolagem horizontal, sem erro de console, href do wa.me igual ao número do pedido, texto maior ou igual a 11 px.
6. Registra `custo.json` (tokens, custo em reais por câmbio configurável) e `RELATORIO` do pedido.
7. `exportar-sair.cjs` gera o zip do SAIR: HTML estático autossuficiente que abre do disco, wa.me puro, sem requisição a domínio da Creat (grep no dist prova).
Deploy: comando `wrangler` documentado (Trilho), nunca com segredo no repositório.

Contratos que a Fase 2 consome (já devem existir como schema nesta fase): **TenantConfig v1**, **Pedido** {id, token_publico (128 bits, base64url), nicho, slug, status, plano, previa_config, materiais_recebidos_em, prazo_garantia_em, url_subdominio, dominio_proprio, dominio_vence_em, google_status, custo_ia, versao_motor}, **Evento** {pedido, estado, etapa, ts}. Estados: previa_gerada, checkout_iniciado, pago, em_producao, aguardando_aprovacao, no_ar, inadimplente_d1, inadimplente_d7, pausado, cancelado, cancelado_pelo_cliente, reembolsado_art49. Nenhum campo guarda mensagem de cliente final nem CPF/CNPJ (fica só no Asaas).

## 16. Infra, deploy e segurança
`wrangler.toml` com Workers Static Assets apontando para a pasta (a vitrine pode também ser publicada como arquivos estáticos no Base44 atual sem bloqueio; manter portável). `_headers`: CSP restritiva (fontes e analytics permitidos explicitamente), `X-Content-Type-Options`, `Referrer-Policy: no-referrer-when-downgrade`, `noindex` em `/previa/`. `.env.example` com `ANTHROPIC_API_KEY`, `CREAT_MODELO`, `CREAT_CAMBIO`, `CLOUDFLARE_API_TOKEN` (sem valores). Documentar em `docs/` o ADR do executor da Fase 2 (GitHub Actions privado ou VPS) e o checklist de repositório privado em organização da Creat. Atualizar `README.md` com a nova estrutura e corrigir a linha 17 de `docs/stack-ferramentas-2026.md` ("Claude Code (Pro) para construir; Claude API (Console) para produzir"). Remover do `.gitignore` nada; acrescentar `sites/`, `pedidos/` e `dist/` ao `.gitignore` (dados de cliente nunca no repositório).

## 17. Ondas e tarefas (no máximo 10; arquivos disjuntos dentro de cada onda)

### Onda 1 · fundação (paralelo)
- **T1 · Cirro · Arquitetura e contratos.** Escrever `docs/ARQUITETURA.md` e `docs/ADR-*.md`; criar `schema/tenant.schema.json`, `schema/pedido.schema.json`, `schema/evento.schema.json`; definir as APIs entre módulos: `CreatPlaca.montar`, `CreatSom.{armar,sino,giz,plim,silenciar}`, formato do fragmento da prévia, leitura de `dados/*.json` com regra de dado velho, `CREAT_CHECKOUT`. Arquivos: `docs/**`, `schema/**`. Aceite: schemas validam os fixtures; contratos escritos em 1 página; decisão motor congelado documentada.
- **T2 · Paleta · Direção de arte e tokens.** Ficha de direção da vitrine herdando a linguagem da loja (Lilita One, Figtree, JetBrains Mono, tokens existentes) e acrescentando o mundo da porta (madeira, correntinha, vidro de noite, giz), 3 paletas AA por nicho, SVGs da placa, correntinha, letreiro, ícones dos 3 rituais (navalha e couro, pincel e unha, barra e anilhas) no traço de desenho animado (nada de emoji, nada de círculo com ícone em três colunas). Arquivos: `assets/tokens.css`, `assets/vitrine.css`, `assets/svg/**`, `assets/img/**` (copiar os .webp da loja), `docs/DIRECAO.md`. Aceite: contraste AA documentado por paleta; tokens usados por todos os módulos; testes em 390 px.
- **T3 · Verbo · Conteúdo.** Todos os textos: home, planos, "como funciona de verdade", FAQ (10+), termos e privacidade (com linha `REVISAO_JURIDICA_PENDENTE`), textos dos presets dos 3 nichos (bordão, manifesto, serviços de exemplo, mensagens), Bastidores, kit de anúncios (seção 12), scripts do WhatsApp (seção 13), roteiros de vídeo, texto da lista de espera. Respeitar regras 1, 2, 7. Arquivos: `conteudo/**`, `marketing/**`. Aceite: sem promessa de ganho, sem "agenda", sem concorrente citado, sem emoji, números só do `precos.json`, políticas da Meta conferidas e registradas com data.

### Onda 2 · construção (paralelo)
- **T4 · Pixel · Motor v1 e prévia.** Seção 7: `motor/v1/**`, `motor/nichos/index.js` e `barbearia.js`, `previa/index.html`; generalizar a barbearia sem perder o Fio no Couro; sem ocupacaoFicticia; modo link_externo; rodapé viral; JSON-LD. Arquivos: `motor/v1/**`, `motor/nichos/index.js`, `motor/nichos/barbearia.js`, `previa/**`. Aceite: prévia abre em menos de 1,5 s local, sem erro de console, pedido de horário gera a mensagem certa, 390 px sem rolagem lateral, claro e escuro.
- **T5 · Pixel · Vitrine e checkout.** `index.html`, `abrir/**`, `obrigado/**`, `bastidores/**`, `termos/**`, `privacidade/**`, `404.html`, `assets/vitrine.js`, `checkout.config.js`, `dados/**`, `scripts/checar-placeholders.cjs`, `scripts/atualizar-vagas.cjs`, `scripts/checar.cjs`. Integra placa (T6), sons (T7) e prévia (T4) pelos contratos de T1; banner de consentimento; PostHog; leitura fail-closed dos dados. Aceite: seção 18.
- **T6 · Órbita · Placa e sede com marca.** `ritual/placa.js`, `ritual/placa.css`, edição de `sede/index.html`, novo `sede/publicar-estado.cjs` e `sede/estado-publico.exemplo.json` (seções 6 e 10). Aceite: gesto e botão equivalentes funcionam; `?marca=` e `?modo=` conforme o texto; `estado-publico.json` não contém `/`, `.cjs`, `scratchpad`, `tokens` nem rótulos internos (grep em teste); modo ao vivo local continua funcionando.
- **T7 · Eco · Som.** `assets/som/creat-som.js` com Web Audio sintetizado (sem arquivos de áudio): sininho de porta, giz, "plim" de notificação, clique; só arma após o primeiro gesto; botão de mudo persistido; volume baixo; silêncio com a aba oculta. Reaproveitar a abordagem de `projetos/barbearia/som.js`. Aceite: nenhum som antes de gesto; mudo persiste; API conforme T1.

### Onda 3 · nichos e fábrica v0 (paralelo)
- **T8 · Pixel · Nichos salão e academia.** `motor/nichos/salao.js`, `motor/nichos/academia.js`, rituais de confirmação (pincelar, levantar a barra) com os SVGs de T2, registro no `index.js` do motor, itens de lista de espera em `dados/nichos.json`. Aceite: os 3 nichos renderizam na prévia e passam no validador; 390 px; sem depoimento fictício.
- **T9 · Forja · Produção v0.** `scripts/producao/**` e `scripts/testes/**` (seção 15), com testes sem rede e sem chave. Aceite: fixture de pedido gera `dist/<slug>` que abre de `file://` sem erro; validador rejeita whatsapp 5500000000000, avaliação sem origem e `ocupacaoFicticia`; zip do SAIR sem referência a domínio da Creat; `custo.json` gravado; nenhum segredo.
- **T10 · Trilho · Infra e higiene do repositório.** `wrangler.toml`, `_headers`, `.env.example`, ajustes de `.gitignore`, `README.md`, linha 17 do `docs/stack-ferramentas-2026.md`, ADR do executor (GitHub Actions privado ou VPS) e checklist de transferência do repositório para uma organização da Creat e mudança para privado. Aceite: `checar-placeholders` roda no CI local; nenhuma chave no repositório (varredura documentada).

Depois da construção, o fluxo agencia roda QA (Lupa com `navegador` e `verificacao-visual`), Muralha e Crivo. Não pular.

## 18. Critérios de aceite (cada um verificável)
1. `node projetos/creat-nuvem/scripts/checar.cjs` passa (valida schemas, presets, `dados/*.json`, ausência de `ocupacaoFicticia`, ausência de emoji e de "agenda" nos textos públicos).
2. Home, `/previa/`, `/abrir/`, `/obrigado/`, `/bastidores/` abertas em 390 px e 1280 px, claro e escuro, sem erro de console e sem requisição falhando (`verificacao-visual`), sem rolagem horizontal, alvos maiores ou iguais a 44 px, texto maior ou igual a 11 px, prints olhados.
3. Fluxo no `navegador`: digitar nome, tocar "Abrir meu negócio", ver a prévia; o URL tem estado só no fragmento; nenhum dado pessoal em query string.
4. O gesto de arrastar a placa funciona e, fora dela, a página rola. Com `prefers-reduced-motion`, não há giro nem som.
5. Teste de verdade: com WhatsApp válido, abre `wa.me/<número dele>` com serviço, dia e hora; com inválido, mostra erro claro; o número não aparece em nenhuma requisição de rede.
6. `/abrir/`: total visível antes do pagamento; aceite obrigatório; botões desativados com placeholders; com links reais, o link certo (inauguração ou padrão) é usado.
7. Apagar `dados/vagas.json` ou deixá-lo com mais de 48 h: a página mostra preço padrão e esconde contador e inauguração, sem erro.
8. `/obrigado/` não afirma pagamento confirmado e monta PEDIDO v1 com todos os campos e a origem (utm).
9. Sede: `?marca=Barbearia%20do%20Ze` troca a placa; `?marca=<script>` fica inerte; `?modo=publico` não faz requisição a `estado.json`; grep no `estado-publico.json` não acha `/`, `.cjs`, `scratchpad`, `tokens`.
10. Bastidores: o aviso "exige Claude Code" vem antes do preço; não há link para Bastidores na primeira tela da home.
11. Antes do consentimento, nenhuma requisição ao Pixel nem ao Clarity; PostHog sem cookie; nenhuma propriedade de evento com nome, telefone, e-mail ou endereço.
12. `produzir.mjs` com fixture: gera `dist/<slug>`; abre de `file://`; zip do SAIR sem domínio da Creat; custo registrado; entrada inválida falha com mensagem do campo.
13. Os 3 nichos renderizam sem depoimento, nota ou horário inventado.
14. `scripts/checar-placeholders.cjs` FALHA enquanto houver `[LINK_` ou `[WHATSAPP_SUPORTE`, e passa quando o Marcos os trocar.
15. Peso da home sem a sede menor ou igual a 500 KB; sede só carrega sob demanda no celular; nenhuma tela branca (estado de carregamento desenhado).
16. Textos: português do Brasil, sem lorem ipsum, sem promessa de ganho, sem comparação nominal, sem emoji; termos e privacidade marcados `REVISAO_JURIDICA_PENDENTE`.
17. Revisor: veredito aprovado. Muralha: sem segredos, CSP, LGPD da vitrine, fronteira do pedido. Lupa: relatório com prints.

## 19. Fora de escopo agora (Fase 2 e 3), mas não construir nada que as impeça
Fase 2 (briefing próprio, 10 tarefas): Cloudflare Worker + D1 (pedidos, eventos); webhook do Asaas (token, idempotência por id de evento, reconfirmação do pagamento pela API, WAF liberado para IPs oficiais, resposta 200 rápida e fila); executor 24/7 com chave de API; painel do cliente por link mágico com alterações tipadas (patch JSON validado, sem texto livre para agente com permissão de deploy); sede por pedido com token e vocabulário fechado; serviço multi-tenant (Worker + KV ou D1 + HTMLRewriter com o mesmo template do build); domínio próprio por CNAME (Cloudflare for SaaS); régua de inadimplência; monitor diário e resumo das 8h; e-mail transacional (Resend). Fase 3: nichos pet, restaurante, oficina, tatuagem; Vitrine de Vagas; vídeo mensal da sede; Rua Creat; Balcão 24h; Impulso do Bairro; Creat Parceiro; "puxar do Google" ao vivo com atribuição; SEO local; teste A/B da sede; Ritual Sob Medida.

## 20. Relatório final
Seguir `padrao-de-entrega`: cada item ok, falhou ou não verificado, com motivo. Cada especialista acrescenta uma seção ao `projetos/creat-nuvem/RELATORIO.md` (o que fez, arquivos, como verificar, pendências). O relatório final lista: placeholders ainda abertos (links do Asaas, Cakto e WhatsApp de suporte), textos pendentes de revisão jurídica, números não verificados e o que depende do Marcos.