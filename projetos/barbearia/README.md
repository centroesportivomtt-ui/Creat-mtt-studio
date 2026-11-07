# Barbearia Fio & Couro

Site de demonstração da **Creat Nuvem** para barbearias: página única com agendamento online e o ritual de afiar a navalha no couro.

- **Momento-assinatura:** ao abrir, o cliente passa a navalha no couro com o polegar (ou com o mouse, as setas ou o espaço). Quatro passadas e a lâmina fica afiada, o nome brilha e o botão "Agendar horário" sobe até a mão.
- **Confirmação pelo mesmo gesto:** a reserva é confirmada passando a navalha numa tira de couro menor. Quem não quer ou não pode arrastar tem Enter ou Espaço com foco na tira e o botão "Confirmar sem arrastar".

O agendamento começa pelo horário: o cliente escolhe o dia e a hora, e a lista mostra só os serviços que cabem antes do próximo horário ocupado ou do fechamento. No topo, um letreiro mostra o status real ("Aberto agora · próximo horário livre 15h40", "Fechado · abre terça às 9h").

## Arquivos

| arquivo | para que serve |
|---|---|
| `index.html` | Estrutura da página: letreiro, hero com o couro, manifesto, agendamento, tabela de preços, equipe, recados, endereço e rodapé. |
| `styles.css` | Identidade visual: tokens de cor (couro, aço, latão, giz), tema escuro e claro, tipografia e layout. |
| `config.js` | **Todos os dados e textos da barbearia.** Concentra tudo o que muda de um cliente para outro; o `index.html` só precisa de ajustes pontuais (veja "Como vender para outra barbearia"). |
| `agendamento.js` | Lê o `config.js`, aplica as cores, monta as listas, calcula o letreiro, a agenda (dias, horários, serviços que cabem), valida o formulário, grava a reserva e abre o WhatsApp. |
| `efeito.js` | O couro (canvas), a navalha com física de mola, o brilho, o medidor de fio e a tira de confirmação com as alternativas acessíveis. |
| `efeito.css` | Estilos só das peças que o `efeito.js` monta (navalha e tira). |
| `som.js` | Microssons sintetizados em Web Audio (passada, "tiiing", trava da cadeira) e o botão de som. Nenhum arquivo de áudio. |

Os módulos conversam por eventos do navegador (`fio:passada`, `fio:afiada`, `fio:confirmar`, `fio:reservado`), por isso cada um pode ser trocado sem mexer nos outros.

## Como abrir

Não há build, npm nem dependência para instalar. As fontes vêm do Google Fonts.

1. Dê dois cliques em `index.html`. Abre direto do disco.
2. Opcional, um servidor local (mais próximo de como fica publicado):

```sh
cd projetos/barbearia
python3 -m http.server 8000
# abra http://localhost:8000
```

Para ver como fica no celular, use o modo de dispositivo do navegador (F12, ícone do celular) em 390px de largura.

## Como vender para outra barbearia

Quase tudo se troca no `config.js`; os poucos ajustes manuais no `index.html` estão listados no fim desta seção. Os nomes abaixo são os campos reais do arquivo. Marcadores entre chaves, como `{hora}` e `{dia}`, são preenchidos pelo código: mantenha-os ao reescrever um texto.

| campo | o que é | cuidado |
|---|---|---|
| `negocio.nome` | Nome completo ("Barbearia Fio & Couro"). | Aparece no topo, no hero e na mensagem do WhatsApp. |
| `negocio.nomeCurto` | Versão curta ("Fio & Couro"). | Usado onde o nome completo não cabe. |
| `negocio.bordao` | Frase da casa. | Uma linha. |
| `negocio.whatsapp` | Número que recebe as reservas. | **Só dígitos, com DDI 55 e DDD**: `5511987654321`. Sem espaço, `+`, traço ou parêntese. |
| `negocio.telefoneExibicao` | O mesmo número formatado para a tela. | `(11) 98765-4321`. |
| `negocio.endereco` | `rua`, `numero`, `bairro`, `cidade`, `uf`, `cep`. | Também gera o link "Como chegar no Google Maps". Confira o link depois de trocar. |
| `negocio.instagram` | `usuario` (com @) e `url` (link completo do perfil). | |
| `funcionamento.semana` | Horário de cada dia: `0` = domingo ... `6` = sábado. | `null` = folga. Para abrir, use `{ abre: 'HH:MM', fecha: 'HH:MM' }`. |
| `funcionamento.passoMin` | Intervalo entre um horário e o próximo na lista, em minutos. | Hoje 20. |
| `funcionamento.antecedenciaMin` | Quanto tempo antes o cliente ainda pode marcar para hoje, em minutos. | Hoje 20. |
| `funcionamento.diasNaFita` | Quantos dias aparecem na fita de datas. | Hoje 7. |
| `servicos` | Lista com `id`, `nome`, `preco`, `duracaoMin` e `descricao`. | `preco` é **número** em reais, sem "R$". `duracaoMin` em minutos, e é ela que decide se o serviço cabe no horário. `id` sem espaço nem acento. |
| `profissionais` | Lista com `id`, `nome`, `especialidade` (uma palavra) e `bio` (uma frase). | Aparecem nos chips do agendamento e na seção da equipe. |
| `avaliacoes` | Recados do quadro: `texto`, `autor`, `detalhe`. | Use de 4 a 6. **Para cliente real, use recados reais**, com autorização de quem escreveu. |
| `cores` | As 4 cores da marca: `couro` (fundo), `aco` (texto), `latao` (destaque), `giz` (apoio). | Aplicadas como variáveis CSS ao abrir a página. O tema claro é derivado no `styles.css`. Confira o contraste AA entre `couro` e `aco`. |
| `demo.ocupacaoFicticia` | `true` deixa alguns horários ocupados de mentira para a agenda parecer viva na apresentação. | **Desligue (`false`) antes de entregar a uma barbearia real.** |
| `textos` | Tudo o que aparece em botões, avisos e títulos: `pular`, `agendar`, `hero`, `letreiro`, `agenda`, `espelho`, `mensagemWhats` e `secoes`. | Mantenha os marcadores `{hora}`, `{dia}`, `{n}`, `{negocio}`, `{servico}`, `{profissional}`, `{preco}`, `{nome}` e `{whats}`. |

Exemplo: trocar um serviço e a cor de destaque.

```js
servicos: [
  {
    id: 'corte-infantil',
    nome: 'Corte infantil',
    preco: 35,          // número, sem "R$"
    duracaoMin: 30,     // minutos
    descricao: 'Até 10 anos, com paciência e desenho na lateral se pedir.'
  },
  // ...os outros serviços
],

cores: {
  couro: '#1f1612',
  aco: '#d9dde0',
  latao: '#c0783f',   // novo destaque, cobre no lugar do latão
  giz: '#e9efe6'
},
```

O que **não** está no `config.js` e pode precisar de ajuste manual no `index.html`:

- A seção de **manifesto** (`<section id="manifesto">`): o texto foi escrito para a Fio & Couro.
- O `<title>`, a `<meta name="description">` (cita Vila Mariana) e a `<meta name="theme-color">` no topo do arquivo.
- Os dois blocos `<noscript>`: o da seção de agenda (link `wa.me/5511987654321` e texto `(11) 98765-4321`) e o do rodapé (`Telefone e WhatsApp: (11) 98765-4321`). O JavaScript não os atualiza, porque só aparecem para quem está sem JavaScript; e robôs que leem o HTML cru também os veem. Troque pelo número novo.
- Os valores de partida dos links no HTML (`href` do WhatsApp e do Instagram, `@fioecouro`, `(11) 98765-4321`): o JavaScript os substitui pelo `config.js` ao abrir a página, mas é bom trocar também para que o HTML cru não mostre a barbearia antiga.

## Como o agendamento funciona, e seus limites

- **Não há servidor.** A reserva fica gravada no `localStorage` do aparelho do cliente (chave `fio:agendamentos`) e a barbearia recebe o pedido pelo **WhatsApp**: ao confirmar, o site abre `wa.me` com a mensagem pronta (serviço, profissional, dia, hora, preço, nome e WhatsApp do cliente).
- **Um cliente não vê a reserva de outro.** O horário só aparece "ocupado" no aparelho de quem marcou. Quem controla a agenda de verdade é a barbearia, respondendo no WhatsApp.
- O atalho "O de sempre" aparece só para quem já marcou antes naquele aparelho e preenche serviço e profissional.
- Com `demo.ocupacaoFicticia: true`, parte dos horários aparece ocupada de mentira. Serve só para apresentação.

Próximo passo pago sugerido: integrar com o **Google Agenda** ou com um pequeno backend, para que os horários ocupados sejam os mesmos para todos os clientes e a barbearia veja a agenda num lugar só.

## Publicar de graça

A pasta é um site estático: basta subir os 8 arquivos (os 7 acima e este README). Nenhum precisa de build.

### (a) GitHub Pages

1. Crie um repositório em github.com (por exemplo `barbearia-fio-e-couro`), público.
2. Suba o conteúdo desta pasta para a raiz do repositório, na branch `main` (pelo botão "Add file > Upload files" ou com git).
3. No repositório: **Settings > Pages > Build and deployment > Source: Deploy from a branch**. Em **Branch**, escolha `main` e a pasta `/ (root)`. Salve.
4. Em um ou dois minutos o site fica em `https://SEU-USUARIO.github.io/barbearia-fio-e-couro/`. O link aparece no topo da mesma tela de Pages.

Se preferir subir a pasta `projetos/barbearia` dentro de um repositório maior, escolha a pasta `/docs` em Pages e copie os arquivos para `docs/`, porque o Pages só aceita `/ (root)` ou `/docs`.

### (b) Netlify Drop

1. Abra `https://app.netlify.com/drop`.
2. Arraste a pasta `barbearia` inteira para a página.
3. Pronto: o Netlify devolve uma URL do tipo `https://nome-aleatorio.netlify.app`. Crie uma conta gratuita para o site não expirar e para trocar o nome em **Site configuration > Change site name**.

### (c) Vercel

1. Em `https://vercel.com/new`, importe o repositório do GitHub.
2. **Framework Preset: Other**. Deixe **Build Command** e **Output Directory** vazios (se a pasta estiver dentro de um repositório maior, aponte **Root Directory** para ela).
3. Clique em **Deploy**. A URL fica `https://nome-do-projeto.vercel.app`.

**Domínio próprio:** compre o domínio (por exemplo no Registro.br) e adicione-o nas configurações de domínio do provedor escolhido (GitHub: Settings > Pages > Custom domain; Netlify: Domain management; Vercel: Settings > Domains), seguindo o registro DNS que ele indicar.

## Acessibilidade e privacidade

- **Teclado:** "Pular para agendar" é o primeiro item focável. No hero, setas e espaço fazem as passadas. Na tira de confirmação, Enter ou Espaço confirma. O foco fica sempre visível.
- **Movimento reduzido:** com `prefers-reduced-motion`, a navalha já aparece afiada, sem lampejo nem vibração, e a confirmação vira só o botão comum.
- **"Confirmar sem arrastar":** botão comum logo abaixo da tira, sempre disponível (atende à WCAG 2.5.7).
- **Som:** só toca depois do primeiro toque, é curto e baixo, e pode ser desligado no botão fixo. A escolha fica lembrada no aparelho (`fio:som`).
- **Sem canvas:** o couro cai para um gradiente em CSS e o site continua utilizável.
- **Privacidade:** nome e WhatsApp do cliente ficam só no `localStorage` do aparelho dele. O site não envia nada a servidor nenhum; o único destino é a conversa de WhatsApp que o próprio cliente abre. Os textos digitados nunca são inseridos como HTML.

## Checklist de entrega para o cliente

1. `config.js` trocado: nome, WhatsApp (só dígitos, com 55), endereço, Instagram, horários, serviços com preço e duração, equipe e cores.
2. `demo.ocupacaoFicticia` em `false` e recados em `avaliacoes` reais e autorizados.
3. No `index.html`: manifesto, `<title>`, `description`, `theme-color`, os dois `<noscript>` (WhatsApp e telefone) e os valores de partida dos links de WhatsApp e Instagram ajustados para a nova barbearia.
4. Teste de ponta a ponta no celular do dono: marcar um horário, confirmar e ver a mensagem chegar no WhatsApp da barbearia; conferir o link do Google Maps e do Instagram.
5. Site publicado (GitHub Pages, Netlify ou Vercel), URL enviada ao cliente e colocada na bio do Instagram e no perfil do Google.
