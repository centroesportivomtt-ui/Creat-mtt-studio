# Cakto · Produto 3 · Mini-curso: site de barbearia com agendamento pelo WhatsApp

**Onde colar cada campo** (Cakto > Produtos > Criar produto; os nomes dos campos podem mudar no painel):

| campo deste arquivo | onde fica na Cakto |
|---|---|
| Nome do produto | Nome do produto |
| Tipo | Tipo/formato: curso ou material digital com área de membros |
| Categoria | Educação / Tecnologia (ou Negócios, se for a mais próxima) |
| Preço | Preço da oferta principal |
| Descrição | Descrição do produto |
| Justificativa educativa | Descrição detalhada, ou resposta à análise da Cakto se for pedida |
| Mini-guia incluído | Área de membros: crie um módulo "Mini-guia" e cole cada lição como uma aula em texto |
| Entrega | Na lição 1, anexe o zip como material de apoio |
| Mensagem pós-compra | Página de obrigado e e-mail de acesso |
| Link do checkout | Depois de criado, copie o link e anote em [LINK_CAKTO_PRODUTO_3] no fim deste arquivo. A página de vendas (`index.html`) aponta para o Payhip; use o link da Cakto onde você divulgar só em reais, ou troque o `href` do botão do produto 3 se preferir a Cakto |

---

## Nome do produto

Mini-curso: Site de Barbearia com Agendamento pelo WhatsApp

## Tipo e categoria

Curso em texto com material de apoio · Educação / Tecnologia

## Preço

R$ 67,00

## Descrição

Saiba como personalizar e publicar de graça o site de uma barbearia com agendamento pelo WhatsApp, sem programar do zero. São 5 lições curtas em texto: como o site funciona, como trocar todos os dados num arquivo só, como escolher cores com contraste legível, como testar antes de entregar e como publicar sem pagar hospedagem. O site completo vem como material de prática.

Pré-requisito: saber abrir e salvar um arquivo num editor de texto. Não precisa saber programar.

Não depende do Claude Code. Não há promessa de resultado financeiro: o curso ensina a montar e publicar o site.

## Justificativa educativa

O produto ensina, passo a passo, a adaptar e publicar um site estático para um pequeno negócio: estrutura de um site sem servidor, edição de um arquivo de configuração, acessibilidade de cores, teste em celular e publicação gratuita. O conteúdo didático é o mini-guia abaixo. O site (HTML, CSS, JavaScript e `config.js`) e o README são o material de prática que o aluno edita a cada lição.

## Mini-guia incluído (cole cada lição como uma aula)

### Lição 1 · Como o site funciona

O site é estático: um conjunto de arquivos que o navegador abre direto, sem servidor e sem banco de dados. Isso deixa a hospedagem gratuita e a manutenção simples.

O caminho de uma reserva:
1. O cliente escolhe o dia e o horário. O site mostra só os serviços que cabem antes do próximo horário ocupado ou do fechamento.
2. Ele escolhe o profissional, preenche nome e WhatsApp e confirma.
3. O site abre o WhatsApp da barbearia com a mensagem pronta: serviço, profissional, dia, hora, preço e nome.
4. A barbearia confirma respondendo a conversa.

O limite que você precisa explicar ao dono: a agenda de verdade é o WhatsApp. Um cliente não vê os horários que outro marcou, porque a reserva fica guardada só no aparelho de quem marcou.

Exercício: abra o `index.html` com dois cliques e faça uma reserva até a tela do WhatsApp.

### Lição 2 · Tudo num arquivo só: o config.js

Quase tudo o que muda de uma barbearia para outra está no `config.js`. Abra num editor de texto (Bloco de Notas, TextEdit ou VS Code) e troque, nesta ordem:

1. `negocio`: nome, nome curto, frase da casa, WhatsApp, telefone, endereço e Instagram. O WhatsApp vai **só com dígitos**, com 55 e DDD: `5511999998888`.
2. `pagina`: o título que aparece na aba do navegador e a descrição que o Google mostra (até uns 155 caracteres).
3. `funcionamento`: o horário de cada dia da semana (0 é domingo). `null` significa folga.
4. `servicos`: nome, preço (número, sem "R$") e duração em minutos. É a duração que decide se um serviço cabe num horário.
5. `profissionais`: nome, especialidade e uma frase.
6. `avaliacoes`: recados de clientes. Use só recados reais, com autorização de quem escreveu.
7. `demo`: desligue a ocupação de mentira (`false`) antes de entregar.

Mantenha as aspas, as vírgulas e os marcadores entre chaves, como `{hora}` e `{dia}`: o código preenche esses espaços.

Exercício: troque o nome, um serviço e o WhatsApp para o seu número. Recarregue a página e faça uma reserva de teste.

### Lição 3 · Cores que todo mundo consegue ler

O bloco `cores` tem 4 papéis: fundo, texto, destaque e apoio. Troque pelos tons da marca da barbearia, mas confira o contraste entre fundo e texto. A regra de acessibilidade (WCAG AA) pede contraste de pelo menos 4,5 para 1 em texto comum. Ferramentas gratuitas de verificação de contraste mostram o número na hora: cole as duas cores e confira.

Dica: se a marca tem uma cor forte, use-a como destaque, não como fundo. Botões e o nome brilhando chamam atenção; o texto continua legível.

Exercício: teste duas combinações de cor e escolha a que passa no AA.

### Lição 4 · Testar antes de entregar

Faça este roteiro no celular do dono da barbearia, não só no seu computador:

1. Abrir o site e ver o letreiro com o status certo ("Aberto agora" ou o próximo horário de abertura).
2. Marcar um horário, confirmar e ver a mensagem chegar no WhatsApp da barbearia.
3. Conferir o link do Google Maps e o do Instagram.
4. Ligar o modo escuro do celular e ver se tudo continua legível.
5. Conferir que a ocupação de mentira está desligada.

Exercício: anote qualquer texto que ainda fale da barbearia de exemplo e troque. Se o README apontar algum ajuste manual fora do `config.js`, faça agora.

### Lição 5 · Publicar de graça

Como o site é estático, serviços como GitHub Pages, Cloudflare Pages e Netlify publicam sem custo nos planos gratuitos (confira as regras atuais de cada um). O README traz o passo a passo de cada opção. O caminho mais curto é o Netlify Drop: arrastar a pasta do site para a página e receber um endereço.

Depois de publicar:
- Coloque o link na bio do Instagram e no perfil do Google da barbearia.
- Domínio próprio (como `nomedabarbearia.com.br`) é pago à parte, no Registro.br, e se liga ao site nas configurações do serviço escolhido.

Exercício final: publique o site de teste e abra o endereço no celular.

## Entrega

1. **Item principal:** o mini-guia acima, publicado como 5 aulas em texto na área de membros.
2. **Material de apoio:** `projetos/loja/dist/site-barbearia-whatsapp.zip`, anexado na lição 1.

## Mensagem pós-compra e e-mail de acesso

Assunto: Seu mini-curso do site de barbearia está liberado

Olá!

Seu acesso está liberado. Baixe o material de apoio, `site-barbearia-whatsapp.zip`, na lição 1, e siga as lições na ordem. Ao final da lição 2 você já tem o site com os dados da sua barbearia; ao final da lição 5, publicado.

Dúvidas: mttcreatt@gmail.com

Bons estudos!
Creat Nuvem

## Link do checkout da Cakto (anote aqui depois de criar)

[LINK_CAKTO_PRODUTO_3]
