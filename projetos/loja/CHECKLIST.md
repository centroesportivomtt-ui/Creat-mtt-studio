# Checklist de lançamento: 90 minutos para pôr a loja no ar

Aqui está só o que exige você em pessoa: criar contas, enviar documentos, subir arquivos, colar textos e publicar. Todo o resto já está pronto em `projetos/loja/`.

Faça na ordem. Cada passo diz onde clicar e quanto tempo leva. Os nomes de menu das plataformas mudam com o tempo; se um não bater, procure o mais parecido.

**Os 4 produtos**

| produto | zip em `projetos/loja/dist/` | preço BRL | preço USD |
|---|---|---|---|
| 1 · Agência de 15 agentes para Claude Code | `creat-nuvem-agencia-15-agentes.zip` | R$ 47 | US$ 12 |
| 2 · Kit Toon 3D para Three.js | `kit-toon-3d-threejs.zip` | R$ 39 | US$ 9 |
| 3 · Site de barbearia com agendamento pelo WhatsApp | `site-barbearia-whatsapp.zip` | R$ 67 | US$ 15 |
| Lite · Creat Nuvem Lite (grátis, MIT) | `creat-nuvem-lite-gratis.zip` | grátis | grátis |

**Separe antes de começar:** documento com foto, CPF (ou CNPJ, se tiver MEI), dados bancários, uma conta PayPal e uma conta GitHub. Decida também quatro coisas, porque elas entram nos textos:

- o nome do titular que vai nas licenças (`[NOME_TITULAR]`);
- o e-mail de suporte (`[EMAIL_SUPORTE]`), de preferência um e-mail só para a loja;
- o endereço da página de vendas (`[LINK_LOJA]`), por exemplo `https://creat-nuvem-loja.pages.dev`;
- o endereço do repositório do Lite (`[LINK_LITE_REPO]`), por exemplo `https://github.com/SEU_USUARIO/creat-nuvem-lite-gratis`. Use esse nome de repositório: os comandos do README do Lite e do post do TabNews esperam a pasta `creat-nuvem-lite-gratis`.

---

## Tempo por etapa

| etapa | o que é | minutos |
|---|---|---|
| 1 | Conta no Payhip e meio de pagamento | 10 |
| 2 | Conta na Cakto e documentos | 10 |
| 3 | Contas no itch.io e no Ko-fi com PayPal | 10 |
| 4 | Preencher o que vai dentro dos zips, gerar e subir | 15 |
| 5 | Colar as listagens | 15 |
| 6 | Trocar os marcadores da página e dos textos | 8 |
| 7 | Publicar a página de vendas e o repositório do Lite | 10 |
| 8 | Testar uma compra de cada produto | 8 |
| 9 | Ler as regras e marcar os dias dos posts | 4 |
| 10 | Ler o que não fazer | 0 (leitura rápida) |
| **total** | | **90** |

A publicação de cada post (etapa 9) acontece depois, em dias separados, e leva uns 10 minutos por post. Ela não entra nos 90.

---

## 1. Payhip: loja principal em reais (10 min)

- [ ] **1.1** Crie a conta em https://payhip.com (botão de cadastro grátis). Use o e-mail de suporte. *(3 min)*
- [ ] **1.2** Nas configurações da loja, defina a moeda como **BRL**. *(1 min)*
- [ ] **1.3** Na área de pagamentos (Settings > Payments ou parecido), conecte PayPal ou Stripe. Se o painel oferecer **Mercado Pago**, conecte também para receber **Pix**. *(5 min)*
- [ ] **1.4** Se o Payhip não oferecer Mercado Pago na sua conta, siga sem Pix aqui. O Pix fica com a Cakto (etapa 2). *(1 min)*

## 2. Cakto: Pix e cartão no Brasil (10 min)

- [ ] **2.1** Crie a conta em https://cakto.com.br. *(3 min)*
- [ ] **2.2** Envie os documentos que o painel pedir (documento com foto, CPF ou CNPJ, dados bancários). *(7 min)*

> **Aviso:** a aprovação da conta e de cada produto pode levar dias. Não espere por ela: siga para a etapa 3. O Pix cai em D+1 (no dia útil seguinte). A Cakto trata os produtos como material educativo, por isso o produto 1 precisa do `GUIA.pdf` como item principal. As listagens da Cakto já trazem a justificativa educativa pronta.

## 3. itch.io e Ko-fi: vendas em dólar (10 min)

- [ ] **3.1** Crie a conta em https://itch.io (Register). *(3 min)*
- [ ] **3.2** No itch.io, em Settings > Payouts, conecte o **PayPal** para receber. *(2 min)*
- [ ] **3.3** Crie a conta em https://ko-fi.com (Sign up). *(3 min)*
- [ ] **3.4** No Ko-fi, em Settings > Payments, conecte o **PayPal** e ative a loja (Shop). *(2 min)*

## 4. Preencher, gerar e subir os zips (15 min)

As licenças, o guia e o README do Lite vão **dentro** dos zips. Preencha esses marcadores antes de gerar, ou o comprador recebe `[NOME_TITULAR]` no arquivo.

- [ ] **4.1** Troque `[NOME_TITULAR]` e `[EMAIL_SUPORTE]` nestes arquivos: `projetos/loja/produtos/LICENSE-creat-nuvem.txt`, `LICENSE-kit-toon.txt`, `LICENSE-barbearia.txt`, `LICENSE-lite.txt`, `produtos/kit-toon/LICENSE`, `produtos/agencia/GUIA.html` e `produtos/agencia/README.md`. Troque `[LINK_LOJA]` em `produtos/lite/README.md`. *(5 min)*
- [ ] **4.2** Gere o PDF de novo e depois os zips, na raiz do repositório: *(2 min)*
  ```sh
  node projetos/loja/gerar-guia.cjs
  node projetos/loja/empacotar.cjs --final
  ```
  O `--final` para com erro se sobrar algum marcador dentro de um zip, inclusive no texto do `GUIA.pdf` (lido com `pdftotext`, do pacote `poppler-utils`) e no `GUIA.html`. Também para se o `GUIA.pdf` for mais antigo que o `GUIA.html`, ou seja, se você esqueceu o `gerar-guia.cjs`. Se parar, ele mostra o arquivo e a linha: corrija e rode de novo.
- [ ] **4.3** Suba cada zip no lugar certo: *(8 min)*

| zip | Payhip | Cakto | itch.io | Ko-fi |
|---|---|---|---|---|
| `creat-nuvem-agencia-15-agentes.zip` | produto 1 | produto 1, como material de apoio; o item principal é o `GUIA.pdf` (`projetos/loja/produtos/agencia/GUIA.pdf`) | produto 1 | produto 1 |
| `kit-toon-3d-threejs.zip` | produto 2 | produto 2, anexado na lição 5 | produto 2 | produto 2 |
| `site-barbearia-whatsapp.zip` | produto 3 | produto 3, anexado na lição 1 | produto 3 | produto 3 |
| `creat-nuvem-lite-gratis.zip` | não sobe | não sobe | não sobe | não sobe; vai para o GitHub na etapa 7 |

Dá para fazer as etapas 4.3 e 5 juntas, produto por produto: crie o produto, suba o zip e cole o texto na mesma tela.

## 5. Colar as listagens (15 min)

Cada arquivo começa com uma tabela "onde colar cada campo". Copie campo por campo.

- [ ] **5.1** Payhip, em português: `projetos/loja/listagens/payhip-produto1.md`, `payhip-produto2.md`, `payhip-produto3.md`. Cole também o "E-mail de entrega" de cada um. *(5 min)*
- [ ] **5.2** Cakto, em português: `projetos/loja/listagens/cakto-produto1.md`, `cakto-produto2.md`, `cakto-produto3.md`. Nos produtos 2 e 3, cole cada lição do mini-guia como uma aula em texto. Anote o link de checkout de cada um no fim do arquivo. *(5 min)*
- [ ] **5.3** itch.io, em inglês: `projetos/loja/listagens/itchio-produto1.md`, `itchio-produto2.md`, `itchio-produto3.md`. *(3 min)*
- [ ] **5.4** Ko-fi, em inglês: `projetos/loja/listagens/kofi-produto1.md`, `kofi-produto2.md`, `kofi-produto3.md`. *(2 min)*

Publique os produtos nas plataformas, mas ainda não divulgue nada.

## 6. Trocar os marcadores da página e dos textos (8 min)

- [ ] **6.1** Ache todos os marcadores que sobraram, na raiz do repositório: *(1 min)*
  ```sh
  grep -rn '\[LINK_\|\[EMAIL' projetos/loja
  grep -rn '\[NOME_TITULAR\]\|\[POLITICA_REEMBOLSO\]' projetos/loja
  ```
  Ignore os resultados em `RELATORIO.md`, `CHECKLIST.md` e `empacotar.cjs`: lá o marcador é citado de propósito.
- [ ] **6.2** Em `projetos/loja/index.html`, troque: *(5 min)*
  - `[LINK_PAYHIP_PRODUTO_1]`, `[LINK_PAYHIP_PRODUTO_2]`, `[LINK_PAYHIP_PRODUTO_3]` pelos links dos produtos no Payhip (em reais);
  - `[LINK_PAYHIP_PRODUTO_1_USD]`, `_2_USD`, `_3_USD` pelos links em dólar. Como o Payhip cobra em BRL, use aqui os links do itch.io (ou do Ko-fi). Quem lê a página em inglês vê US$ e precisa pagar em US$;
  - `[LINK_LITE_REPO]` pelo endereço do repositório do Lite;
  - `[EMAIL_SUPORTE]` no `href` e no texto visível do link do rodapé;
  - `[POLITICA_REEMBOLSO]` na FAQ por uma política real e apague o selo "preencher" ao lado. Um texto possível: "Reembolso integral em até 7 dias após a compra. Escreva para o e-mail de suporte com o número do pedido." Esse prazo segue o direito de arrependimento do Código de Defesa do Consumidor (art. 49).
- [ ] **6.3** Nos textos de `projetos/loja/listagens/` e `projetos/loja/lancamento/`, troque `[EMAIL_SUPORTE]`, `[LINK_LITE_REPO]` e `[LINK_LOJA]`. Nas plataformas onde você já colou o texto, edite lá também. *(2 min)*

## 7. Publicar a página de vendas e o Lite (10 min)

- [ ] **7.1** Página de vendas. Publique **só** `projetos/loja/index.html` e a pasta `projetos/loja/assets/`. Nunca suba `dist/`, `produtos/`, `listagens/` nem os `.md`: isso entregaria os produtos de graça. *(5 min)*
  - **Cloudflare Pages** (https://pages.cloudflare.com): crie a conta, vá em Workers & Pages > Create > Pages > Upload assets, dê o nome do projeto (ele vira `nome.pages.dev`) e arraste uma pasta só com `index.html` e `assets/`.
  - **Ou GitHub Pages** (https://pages.github.com): crie um repositório público com `index.html` e `assets/` e ligue em Settings > Pages > Deploy from a branch > `main`.
- [ ] **7.2** Repositório do Lite no GitHub (https://github.com/new): crie um repositório **público** chamado `creat-nuvem-lite-gratis`, sem README. Depois, no terminal: *(5 min)*
  ```sh
  cd "$(mktemp -d)"
  unzip /CAMINHO/DO/REPO/projetos/loja/dist/creat-nuvem-lite-gratis.zip
  cd creat-nuvem-lite-gratis
  git init -b main && git add . && git commit -m "Creat Nuvem Lite"
  git remote add origin https://github.com/SEU_USUARIO/creat-nuvem-lite-gratis.git
  git push -u origin main
  ```
  Confira no GitHub se a pasta `.claude/` subiu. O upload pelo navegador pode pular pastas que começam com ponto; o terminal não pula.
- [ ] **7.3** Abra a página publicada no celular. Nenhum botão pode mostrar o selo tracejado "colar link". Se mostrar, falta um marcador da etapa 6.

## 8. Testar uma compra de cada produto (8 min)

- [ ] **8.1** Payhip: crie um cupom de 100% de desconto (área de cupons ou Marketing), compre os 3 produtos com ele e apague o cupom depois. *(3 min)*
- [ ] **8.2** Cakto: quando a conta for aprovada, crie um cupom de 100% ou compre de si mesmo pelo valor mínimo. *(2 min)*
- [ ] **8.3** itch.io e Ko-fi: compre de outra conta sua (ou peça a alguém de confiança) e reembolse em seguida. No itch.io, a página do produto também gera chaves de download para teste. *(2 min)*
- [ ] **8.4** Em cada compra, confira: o e-mail de entrega chegou, o link baixa o zip certo, o zip abre e o e-mail mostra o seu e-mail de suporte (e não `[EMAIL_SUPORTE]`). *(1 min)*

## 9. Divulgar, um post por dia (4 min agora, ~10 min por post depois)

- [ ] **9.1** Leia as regras antes de publicar: TabNews (https://www.tabnews.com.br, termos no rodapé), r/ClaudeAI (https://www.reddit.com/r/ClaudeAI/about/rules e o post fixado), Show HN (https://news.ycombinator.com/showhn.html), LinkedIn (https://www.linkedin.com/legal/professional-community-policies). *(3 min)*
- [ ] **9.2** Marque os dias na agenda. Cada post tem horário sugerido no topo do arquivo. *(1 min)*

| dia | post | arquivo | horário (Brasília) |
|---|---|---|---|
| semana 1, terça | TabNews | `projetos/loja/lancamento/tabnews.md` | 9h30 |
| semana 1, quarta | Reddit r/ClaudeAI | `projetos/loja/lancamento/reddit-claudeai.md` | 9h ET (10h ou 11h) |
| semana 1, quinta | dev.to | `projetos/loja/lancamento/devto.md` | 10h |
| antes da semana 2 | gravar o vídeo de 30 s | `projetos/loja/lancamento/roteiro-video-30s.md` | não publica sozinho |
| semana 2, terça | fio do X em português, com o vídeo | `projetos/loja/lancamento/x-pt.md` | 12h15 |
| semana 2, quarta | fio do X em inglês | `projetos/loja/lancamento/x-en.md` | 10h ET (11h ou 12h) |
| semana 2, quinta | Show HN | `projetos/loja/lancamento/showhn.md` | 8h a 10h ET (9h a 12h) |
| semana 2, sexta | LinkedIn em português, com o vídeo; links no primeiro comentário | `projetos/loja/lancamento/linkedin-pt.md` | 8h15 |

Regras de autopromoção que os textos já seguem; mantenha assim:

- No TabNews, no Reddit e no Show HN, o link é só o repositório grátis do Lite. Nada de link de venda.
- No LinkedIn, o corpo do post não tem link; o Lite e a loja vão no primeiro comentário, feito por você.
- Diga que você é o autor. O post do Reddit já abre com isso.
- Fique online nas primeiras horas para responder aos comentários.
- Um lugar por dia. Não cole o mesmo texto em vários subreddits.

## 10. O que NÃO fazer

- Não prometa renda, lucro, "dinheiro fácil" nem resultado financeiro. Nem em post, nem em resposta, nem em hashtag. O que se vende é um jeito de organizar o trabalho.
- Não diga nem dê a entender que é produto oficial da Anthropic. Não use o logo da Anthropic nem do Claude.
- Não faça spam: nada de mensagem direta em massa, de marcar desconhecidos ou de colar o link em discussões que não pediram.
- Não peça votos, nem a amigos. O Hacker News e o Reddit punem voto combinado.
- Não invente depoimento, avaliação ou número de vendas.
- Não publique `dist/` nem `produtos/` na página de vendas.
- Não ponha senha, chave de API ou `.env` no repositório do Lite.

---

## Se der errado

| o que aconteceu | o que fazer |
|---|---|
| `empacotar.cjs --final` parou com erro | Ele mostra `[produto] arquivo:linha` do marcador que sobrou. Troque o marcador e rode de novo. |
| O comprador recebeu `[EMAIL_SUPORTE]` no arquivo | Você subiu o zip antes da etapa 4.1. Preencha os marcadores, rode a etapa 4.2 e substitua o arquivo em todas as plataformas. |
| A Cakto recusou um produto | Responda à análise com a "Justificativa educativa" do arquivo da listagem. No produto 1, confirme que o `GUIA.pdf` está como item principal. Enquanto isso, venda pelo Payhip. |
| O Payhip não oferece Pix | Divulgue o link da Cakto para quem quer pagar com Pix. O link fica anotado no fim de cada `cakto-produtoN.md`. |
| O botão da página ainda mostra "colar link" | Falta trocar um marcador no `href`. Rode o primeiro `grep` da etapa 6.1 e publique a página de novo. |
| Em inglês, o botão leva para a página em reais | Falta trocar um `[LINK_PAYHIP_PRODUTO_N_USD]` pelo link do itch.io ou do Ko-fi. |
| A pasta `.claude/` não aparece no GitHub | Suba pelo terminal, com os comandos da etapa 7.2. |
| O e-mail de entrega não chegou | Olhe a caixa de spam. Confira se o texto de entrega foi salvo no produto e se o e-mail da conta está verificado na plataforma. |
| Um post foi removido pela moderação | Não publique de novo. Leia o motivo, ajuste à regra e, se fizer sentido, pergunte aos moderadores antes de tentar outra vez. |
| Um comprador pediu reembolso | Devolva dentro do prazo da sua política, sem discutir. Pergunte o que faltou: a resposta vira melhoria no README. |
