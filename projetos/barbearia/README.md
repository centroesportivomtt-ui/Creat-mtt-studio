# Site de barbearia com agendamento pelo WhatsApp

Página única para barbearia: o cliente escolhe dia e horário, vê só os serviços que cabem naquela vaga, escolhe o profissional, preenche nome e WhatsApp e confirma. O site abre a conversa com a barbearia com a mensagem pronta (serviço, profissional, dia, hora, valor, nome e WhatsApp do cliente).

Não tem build, npm nem servidor. Para ver, dê dois cliques em `index.html`.

O exemplo vem montado com uma barbearia fictícia, a "Fio & Couro". **Tudo o que muda de uma barbearia para outra fica em um arquivo só: `config.js`.** Os outros arquivos não precisam ser abertos.

| arquivo | precisa mexer? |
|---|---|
| `config.js` | **Sim.** Nome, WhatsApp, endereço, horários, serviços, preços, equipe, recados, cores e textos. |
| `index.html`, `styles.css`, `efeito.css`, `agendamento.js`, `efeito.js`, `som.js` | Não. Eles leem tudo do `config.js` quando a página abre. |

---

## Parte 1 · Personalizar pelo `config.js`

Abra o `config.js` em qualquer editor de texto (Bloco de Notas, TextEdit, VS Code). Troque só o que está entre aspas ou os números. Regras gerais:

- Texto fica entre aspas simples: `'Barbearia do Zé'`. Se o texto tiver apóstrofo, use `\'` (ex.: `'D\'Ávila'`).
- Não apague vírgulas nem chaves `{ }` e colchetes `[ ]`.
- Marcadores entre chaves, como `{hora}` ou `{dia}`, são preenchidos pelo site. Mantenha-os quando reescrever uma frase.
- Depois de salvar, recarregue a página. Se a agenda mostrar "config.js não carregou", faltou uma vírgula ou aspa: desfaça a última mudança.

### `negocio`: quem é a barbearia

| campo | o que colocar | exemplo |
|---|---|---|
| `nome` | Nome completo. Vai para o rodapé, o Google Maps e a mensagem do WhatsApp. | `'Barbearia do Zé'` |
| `nomeCurto` | Nome curto, em letras grandes na abertura e gravado na lâmina. | `'Do Zé'` |
| `bordao` | Frase da casa, uma linha, embaixo do nome. | `'Corte na hora marcada.'` |
| `whatsapp` | Número que **recebe as reservas**. Só dígitos: 55 + DDD + número. O `5500000000000` que vem no arquivo é um marcador: **troque antes de publicar**. | `'5511912345678'` |
| `telefoneExibicao` | O mesmo número, do jeito que aparece na tela. | `'(11) 91234-5678'` |
| `endereco` | `rua`, `numero`, `bairro`, `cidade`, `uf`, `cep`. Também monta o link "Como chegar no Google Maps". | `rua: 'Rua das Flores', numero: '120'` |
| `instagram` | `usuario` (com @) e `url` (link completo, começando com `https://`). | `usuario: '@barbeariadoze'` |

### `pagina`: aba do navegador e Google

| campo | o que colocar |
|---|---|
| `titulo` | Texto da aba e do link no Google. Ex.: `'Barbearia do Zé · agende pelo celular'`. |
| `descricao` | Resumo de até uns 155 caracteres que o Google mostra embaixo do link. Cite o bairro e a cidade. |

### `funcionamento`: dias e horários

| campo | o que colocar |
|---|---|
| `semana` | Um item por dia: `0` = domingo, `1` = segunda ... `6` = sábado. Dia aberto: `{ abre: '09:00', fecha: '20:00' }`. Folga: `null`. |
| `passoMin` | De quantos em quantos minutos aparece um horário na lista (20 = 9h, 9h20, 9h40...). |
| `antecedenciaMin` | Até quantos minutos antes o cliente ainda pode marcar para hoje. |
| `diasNaFita` | Quantos dias aparecem para escolher (7 = a próxima semana). |

Exemplo, abrindo segunda à tarde e domingo de manhã:

```js
semana: {
  0: { abre: '08:00', fecha: '12:00' },
  1: { abre: '13:00', fecha: '19:00' },
  2: { abre: '09:00', fecha: '20:00' },
  // ...
}
```

### `servicos`: tabela de preços

Cada serviço tem cinco campos. Pode adicionar, apagar ou reordenar (a ordem é a da tabela).

| campo | o que colocar |
|---|---|
| `id` | Identificador interno, sem espaço nem acento, diferente dos outros. Ex.: `'corte-infantil'`. |
| `nome` | Nome que o cliente vê. |
| `preco` | **Número**, em reais, sem "R$" e com ponto nos centavos: `45` ou `47.5`. O site escreve "R$ 47,50". |
| `duracaoMin` | Duração em minutos. É ela que decide se o serviço cabe antes do próximo horário ocupado ou do fechamento. |
| `descricao` | Uma linha curta. |

```js
{
  id: 'corte-infantil',
  nome: 'Corte infantil',
  preco: 35,
  duracaoMin: 30,
  descricao: 'Até 10 anos, com calma e desenho na lateral se pedir.'
},
```

### `profissionais`: a equipe

| campo | o que colocar |
|---|---|
| `id` | Identificador interno, sem espaço nem acento. |
| `nome` | Nome ou apelido. |
| `especialidade` | Uma palavra (Navalha, Degradê, Barba...). |
| `bio` | Uma frase sobre a pessoa. |

### `avaliacoes`: recados de clientes

`texto`, `autor` e `detalhe` (ex.: `'cliente desde 2019'` ou o bairro). Use de 4 a 6. **Numa barbearia real, use recados reais, com autorização de quem escreveu.** Os que vêm no arquivo são do exemplo.

### `cores`: as quatro cores da marca

| campo | papel |
|---|---|
| `couro` | Fundo da página no tema escuro e cor da barra do navegador no celular. |
| `aco` | Cor do texto no tema escuro. |
| `latao` | Destaque: botões, preços, detalhes. |
| `giz` | Apoio: o quadro de recados. |

Use o formato `'#rrggbb'`. O tema claro é derivado dessas cores automaticamente. Depois de trocar, confira se o texto continua fácil de ler sobre o fundo (um verificador grátis: webaim.org/resources/contrastchecker, mínimo 4.5:1 entre `couro` e `aco`).

### `demo`

`ocupacaoFicticia: true` deixa alguns horários "ocupados" de mentira, para a agenda parecer movimentada numa apresentação. **Mude para `false` antes de entregar para uma barbearia de verdade.**

### `textos`: tudo o que está escrito na tela

Botões, títulos, avisos de erro, o letreiro do topo, o manifesto e a mensagem do WhatsApp. Pode reescrever à vontade, mantendo os marcadores.

| grupo | o que tem |
|---|---|
| `pular`, `agendar` | Link de pular para a agenda e botão do topo. |
| `manifesto` | `titulo`, `frases` (de 2 a 5) e `bordao` do bloco logo depois da abertura. |
| `hero` | Dica de arrastar a navalha e a frase que aparece quando ela fica afiada. |
| `letreiro` | Status no topo. `{hora}` = 15h40, `{dia}` = terça, `{n}` = número de horários. |
| `agenda` | Títulos de cada passo, rótulos dos campos, mensagens de erro e avisos de dia lotado. |
| `espelho` | A tela de conferência depois de confirmar. |
| `mensagemWhats` | A mensagem que chega no WhatsApp da barbearia. Marcadores: `{negocio}`, `{servico}`, `{profissional}`, `{dia}`, `{hora}`, `{preco}`, `{nome}`, `{whats}`. |
| `secoes` | Títulos das seções, links do rodapé e botões de tema e som. |

### Bom saber

- O `index.html` traz um texto de partida (da Fio & Couro) que o `config.js` substitui ao abrir a página. Não precisa trocar.
- **Não há servidor.** A reserva vai para a barbearia pelo WhatsApp; quem confirma de verdade é a barbearia, respondendo a conversa. O horário marcado só aparece "ocupado" no celular de quem marcou.
- Nome e WhatsApp do cliente ficam só no aparelho dele (`localStorage`), para o atalho "O de sempre". O site não manda nada para nenhum servidor.
- Sem JavaScript no navegador, a agenda não funciona e os links de WhatsApp (botão flutuante e rodapé) ficam escondidos, porque o número só entra pelo `config.js`. O visitante vê o aviso "marque pelo WhatsApp da barbearia". Se quiser um número visível mesmo assim, escreva-o à mão no `<noscript>` do `index.html`.
- Antes de publicar, faça o teste completo no celular do dono: marcar, confirmar e ver a mensagem chegar no WhatsApp da barbearia.

---

## Parte 2 · Publicar de graça

O site são arquivos estáticos: suba a pasta como está. Os arquivos que vão para o ar são `index.html`, `config.js`, `styles.css`, `efeito.css`, `agendamento.js`, `efeito.js` e `som.js` (o README pode ir junto; não atrapalha).

### GitHub Pages

1. Crie uma conta em github.com e clique em **New repository**. Dê um nome (ex.: `barbearia-do-ze`), marque **Public** e crie.
2. Na página do repositório, clique em **Add file > Upload files**, arraste os arquivos da pasta e clique em **Commit changes**.
3. Vá em **Settings > Pages**. Em **Source**, escolha **Deploy from a branch**; em **Branch**, escolha `main` e `/ (root)`. Salve.
4. Em um ou dois minutos o endereço aparece no topo dessa tela: `https://SEU-USUARIO.github.io/barbearia-do-ze/`.

### Cloudflare Pages

1. Crie uma conta grátis em dash.cloudflare.com.
2. No menu, abra **Workers & Pages > Create > Pages > Upload assets** (o nome do botão pode variar um pouco: procure a opção de enviar arquivos direto, sem Git).
3. Dê um nome ao projeto (vira o endereço), arraste a pasta e clique em **Deploy site**.
4. O site fica em `https://nome-do-projeto.pages.dev`. Para atualizar, abra o projeto e envie os arquivos de novo (**Create new deployment**).

### Netlify Drop

1. Abra app.netlify.com/drop.
2. Arraste a pasta inteira para a página.
3. Em segundos sai um endereço `https://nome-aleatorio.netlify.app`. Crie uma conta grátis (o próprio Netlify oferece) para o site não expirar e para trocar o nome em **Site configuration > Change site name**.

### Domínio próprio (opcional)

Compre o domínio (ex.: no Registro.br) e adicione-o no painel do serviço escolhido: GitHub em **Settings > Pages > Custom domain**, Cloudflare em **Custom domains** do projeto, Netlify em **Domain management**. Cada um mostra o registro DNS que você precisa criar.

Depois de publicado, coloque o link na bio do Instagram e no perfil da barbearia no Google.
