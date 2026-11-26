---
name: social-media
description: Padrão fixo de social media da creat.MTT, o mesmo para toda empresa que ela atende (creat.MTT, Super Kal, Elite Drako Gym, Brabus Lounge, Lavínia Cervejas, CT MTT e cliente novo). Cada mês, cada empresa recebe 5 frentes, nesta ordem - estratégia do mês, agenda na Google Agenda com a cor da empresa, carrossel pronto em PNG, apresentação do plano em PDF e o atendente do Direct - tudo entregue no Dropbox em /Marcos/<EMPRESA>/Social Media <Mês>/. Use quando o dono disser "plano do mês", "social media do <empresa>", "faz o carrossel", "monta a agenda", "apresentação do mês", "respostas do Direct", "atendente do Direct", "padrão creat.MTT", "roda o mês do <empresa>", ou quando entrar empresa nova.
---

# Social media creat.MTT (padrão fixo)

Nasceu em 26/11/2026 do post que o dono mandou (@socialmediadeelite, "Skills do Claudinho que todo social media deveria usar", registro em `docs/referencias/README.md`). O post promete 5 "skills" com telas de apps que não existem; aqui está a versão que existe de verdade, funciona com o que a casa já tem e não custa nada por mês.

**Regra de ouro:** uma empresa, uma pasta por mês, as mesmas 5 frentes, a mesma ordem. O dono não precisa explicar de novo: ele diz "roda dezembro do Super Kal" e a casa faz tudo.

## O sistema em um comando

Depois que o Verbo grava os 5 textos do mês numa pasta (`estrategia-<mês>.md`, `agenda.json`, `carrossel.json`, `apresentacao.json`, `atendente-direct.md`, e a ficha, se houver):

```bash
node .claude/skills/social-media/rodar-mes.cjs --empresa "Super Kal" --mes janeiro --ano 2027 \
     --textos <scratchpad>/<empresa>/textos --saida <scratchpad>/<empresa>/mes
```

O script confere tudo e barra o que estiver errado: data fora do mês, hora inválida, texto que estoura o cartão, número sem fonte, etiqueta cortada. Também gera o carrossel e a apresentação, monta a pasta de entrega igual à do Dropbox e grava o `manifesto.json`. O manifesto lista cada arquivo com o nome final e o nome de envio, e traz os eventos da Google Agenda já com `[EMPRESA]` e a cor da empresa (`empresas.json`). O resto é feito pelos conectores, seguindo o manifesto: Dropbox (seção 6) e Google Agenda (seção 2).

Empresa nova: uma linha em `empresas.json`, com a próxima cor livre, e um arquivo de marca em `modelos/marcas/<empresa>.json` (veja `modelos/LEIA-ME.md`).

**Automação mensal (pronta para ligar):** no dia 24 de cada mês, às 05h38 (horário da Bahia), uma tarefa agendada roda o mês seguinte de cada empresa que já tem pasta "Social Media" no Dropbox. Ela entrega tudo em "0 - Para aprovar" e avisa o dono pelo celular. Nada é publicado sem o "pode" dele. Em 26/11 a criação da tarefa foi barrada pela trava de permissão da sessão; liga com o "pode" do dono.

## 0. A ficha da empresa (uma vez por empresa)

Sem ficha não se faz o mês. O modelo está em `ficha-da-empresa.md` (nesta pasta). A ficha preenchida mora **no Dropbox, nunca no repositório** (repositório é público): `/Marcos/<EMPRESA>/Social Media <Mês>/4 - Textos/<EMPRESA> - Ficha da empresa.md`, e cada mês novo leva uma cópia atualizada.

Preencha com o que já existe antes de perguntar: pastas da empresa no Dropbox, legendas e vídeos entregues, `kit-edicao-17-11/marcas/` (logos e cores do Super Kal, Elite Drako e CT MTT), o perfil público da empresa. Pergunte ao dono só o que nenhuma fonte responde, numa mensagem só.

## 1. Estratégia do mês (Verbo)

Arquivo: `4 - Textos/<EMPRESA> - Estrategia de <mês>.md`. Uma frase de objetivo com o número que mede, pilares e proporção, calendário dia a dia (hora da Bahia, pilar, formato, ideia, se depende de gravação), datas do comércio no mês, o que não postar e como saber se funcionou. Continua o mês anterior; só muda pilar com número na mão. Tudo o que é hipótese vem marcado como hipótese.

Junto, em dados: `7 - Projeto editável/agenda.json`, lista de `{data, inicio, fim, titulo, pilar, descricao}`, com post, gravação (1 h, um ou dois dias antes) e "Aprovar peças da semana" (domingo à noite, 30 min).

## 2. Agenda na Google Agenda (rotina)

A agenda do dono é uma só para todas as empresas; **a cor diz de quem é o compromisso** e o título começa com o nome da empresa entre colchetes.

| empresa | cor (colorId) |
|---|---|
| creat.MTT | Tomate, vermelho (11) |
| Creat Nuvem | Pavão, azul (7) |
| Super Kal | Banana, amarelo (5) |
| Elite Drako Gym | Grafite (8) |
| CT MTT (Centro Esportivo) | Manjericão, verde (10) |
| Brabus Lounge | Uva, roxo (3) |
| Lavínia Cervejas | Tangerina, laranja (6) |
| empresa nova | a primeira cor livre de: Flamingo (4), Mirtilo (9), Sálvia (2), Lavanda (1); registre aqui e em `empresas.json` |

Provado em 26/11: o conector cria evento com cor (`colorId`) e no fuso da agenda do dono (America/Bahia).

Como criar (conector do Google Calendar, agenda principal do dono):
1. Antes de criar, procure com `list_events` (`fullText` = `[<EMPRESA>]`, intervalo do mês) e não duplique o que já existe.
2. `create_event` para cada item do `agenda.json`: `summary` = `[<EMPRESA>] <titulo>`, `colorId` da tabela, `description` com a descrição e o caminho do texto no Dropbox, `notificationLevel` = `NONE`, sem convidados. Gravação ganha lembrete de 60 min (`overrideReminders` popup); post e aprovação, 15 min.
3. Fuso: deixe o servidor resolver (a agenda do dono está em America/Bahia). Não passe `timeZone`.
4. Confira com `list_events` que o número de eventos criados bate com o `agenda.json` e escreva a contagem no LEIA PRIMEIRO.

## 3. Carrossel (Paleta, sem custo)

Texto: `7 - Projeto editável/carrossel.json` (Verbo), no formato de `modelos/exemplo-carrossel.json`. Arte, a partir da pasta `modelos/`:

```bash
node .claude/skills/social-media/modelos/render-carrossel.cjs <carrossel.json> <scratchpad>/<empresa>/carrossel [--marca modelos/marcas/<empresa>.json]
```

Gera um PNG 1080x1350 por cartão e a `prancha.jpg`. **Abra a prancha e cada cartão antes de entregar** (nada cortado, nada colado na borda, letra legível no celular). A marca de outra empresa entra trocando só o `--marca` (cores, logo, @, fontes); a primeira vez de cada empresa cria `modelos/marcas/<empresa>.json` com o logo tratado de `kit-edicao-17-11/marcas/tratadas/`.

Entrega: `0 - Para aprovar/Imagens/` até o "pode" do dono; aprovado, vai para `3 - Imagens/`. Nome: `<EMPRESA> - <tema curto> - cartao 1.png`. Legenda em `4 - Textos/<EMPRESA> - <tema curto> - legenda.md`.

Publicar: só com o "pode" do dono, agendado pelo Metricool (como o plano de 13/11 fez), nunca direto.

## 4. Apresentação do plano (PDF)

Roteiro: `7 - Projeto editável/apresentacao.json` (Verbo), formato de `modelos/exemplo-apresentacao.json`, 8 a 10 slides. Arte:

```bash
node .claude/skills/social-media/modelos/render-apresentacao.cjs <apresentacao.json> <saida.pdf> [--marca ...]
```

Serve para o dono enxergar o mês numa tela e para mostrar o plano ao dono da empresa cliente. Entrega em `5 - Relatórios/<EMPRESA> - Plano de <mês> - apresentacao.pdf`. Abra os PNGs de conferência antes de entregar.

## 5. Atendente do Direct

Arquivo: `4 - Textos/<EMPRESA> - Atendente do Direct.md`. Contém quem é a empresa, o que vende, tom, as 12 perguntas mais prováveis com resposta curta e verdadeira, quando passar para uma pessoa, o que nunca dizer e as automações por palavra-chave.

Ligar, em duas fases:
- **Agora, grátis e oficial:** respostas por palavra-chave e perguntas frequentes na Caixa de entrada do Meta Business Suite (passo a passo no plano do Instagram de 13/11, seção 6). A conta é da empresa: o dono ou o cliente liga; a casa entrega o texto pronto para colar.
- **IA respondendo sozinha (ManyChat + Claude ou a IA da própria Meta):** só com o "pode" do dono, depois da leitura da política da Meta e com custo mensal na mesa (pesquisa de 26/11 em `docs/referencias/README.md`). Nunca DM para quem não pediu contato; comentário vira Direct só pela automação oficial e dentro do prazo da Meta.

## 6. Entrega no Dropbox (regra oficial)

```
/Marcos/<EMPRESA>/Social Media <Mês>/
    LEIA PRIMEIRO.md            uma tela: o que é, onde está cada coisa, o que aprovar agora
    0 - Para aprovar/Imagens/   carrossel até o "pode"
    3 - Imagens/                carrossel aprovado
    4 - Textos/                 estratégia, ficha, atendente do Direct, legendas
    5 - Relatórios/             apresentação em PDF
    7 - Projeto editável/       agenda.json, carrossel.json, apresentacao.json
```

- No conector do Dropbox, `/Marcos` aparece como `/Creat.MTT Studio`.
- Texto entra pelo conector (`create_file`). PNG e PDF entram por `projetos/creat-nuvem/scripts/dropbox-enviar.cjs`, com `DROPBOX_REMETENTE_NOME` igual ao nome da EMPRESA, por uma solicitação de arquivos da pasta (`list_file_requests`; se a pasta não tiver uma, crie com `create_file_request` apontando para ela).
- Medido em 26/11:
  - O Dropbox descarta em silêncio o arquivo que tem acento no nome **ou em qualquer pasta do caminho local**. O `rodar-mes.cjs` já monta tudo sem acento.
  - O Dropbox acrescenta "<remetente> - " na frente do nome do arquivo. Por isso o envio sai sem o prefixo da empresa.
  - Depois do envio, renomeie com `move` para o nome final, com acento (está no manifesto), e liste a pasta para conferir.
- Só existe pasta com conteúdo. Versão trocada vai para `9 - Versões antigas` na mesma rodada.
- Projeto novo entra na lista de `/Marcos/COMO ESTÁ ORGANIZADO - regra oficial.md`.

## 7. Fechamento da rodada

Antes de dizer pronto (skill `padrao-de-entrega`): pranchas olhadas, contagem de eventos conferida, pasta do Dropbox listada de novo depois do envio, LEIA PRIMEIRO atualizado. Resposta ao dono: link da pasta, o que aprovar, o que depende dele (gravações, "pode" de publicação, ligar a automação) e o bloco **Conselho do Diretor**.

## O que este padrão não faz

- Não publica nem responde Direct sozinho sem o "pode" do dono.
- Não inventa número, depoimento nem preço de serviço que o dono não deu.
- Não depende de alcance orgânico para a tese da casa: o perfil é vitrine de apoio; aquisição é anúncio pago (skill `consciencia`).
