# Roteiros de vídeo · 15 s · 9:16

Verbo (T3), 08/11/2026. Três vídeos para a calibragem (ver `anuncios.md`). Base: seção 12 do briefing e o formato de `projetos/loja/lancamento/roteiro-video-30s.md`.

## Regras para os três

- **Formato**: 1080 × 1920, 15 s, 30 fps, MP4 (H.264). Uma versão por nicho quando o roteiro mostrar o nome do negócio.
- **Sem depender de som**: a mensagem fecha só com a legenda. Som baixo e opcional: o sininho da placa e o "plim" do WhatsApp, que já existem na página.
- **Legenda queimada no vídeo** (não use a legenda automática da Meta): fonte Lilita One, mínimo 64 px, tinta `#1E1B2E` sobre faixa `#FFC93C` com contorno de 4 px, ou papel `#FFFDF6` sobre `#1E1B2E`. Fica dentro da área segura: 250 px livres no topo e 340 px livres embaixo (é onde o Instagram e o Facebook põem botões).
- **Nome fictício claramente fictício**, com o selo "nome fictício" na tela sempre que o nome aparecer:
  - barbearia: **Barbearia Navalha Fictícia**
  - salão: **Salão Esmalte Fictício**
  - academia: **Studio Barra Fictícia**
  - Cidade: deixar em branco. Nunca usar nome, rosto ou WhatsApp de pessoa ou negócio real sem autorização escrita.
- **WhatsApp na tela**: gravar com um número de teste da Creat, desfocado ou coberto pela faixa "número de teste". Nunca mostrar número pessoal.
- **Gravação**: tela real do celular a 390 px (gravação nativa do iPhone ou Android) ou o Chromium da skill `navegador` em 390 × 844 com escala 2 (gera 780 × 1688; ampliar para 1080 × 1920 sem distorcer, com faixa de fundo `--ceu`).
- **Proibido**: tela piscando (política de vídeo da Meta), antes e depois, preço ou prazo na legenda, depoimento, pessoa real, "agenda".
- **Teste final**: assistir no celular, sem som, de braço esticado. Se a legenda não lê, aumente.

## Pasta de assets sugerida

```
marketing/assets/videos/
  R1-placa/
    bruto/            gravações de tela sem corte (uma por nicho)
    legendas.txt      as legendas deste arquivo, uma por linha, com o tempo
    R1-barbearia-v1.mp4
    R1-salao-v1.mp4
    R1-academia-v1.mp4
    capa-R1.png       primeiro quadro, 1080 x 1920
  R2-sem-amarra/
    bruto/
    cartoes/          os 3 cartões de texto exportados em PNG 1080 x 1920
    R2-salao-v1.mp4
    R2-barbearia-v1.mp4
  R3-equipe/
    bruto/
    R3-geral-v1.mp4
  som/                opcional: sino.wav e plim.wav gravados da própria página
```

O nome do arquivo final é o `utm_content` sem o número do texto: o vídeo `R1-barbearia-v1.mp4` acompanha os anúncios `A1-barbearia-v1`, `A2-barbearia-v1` e `A3-barbearia-v1`.

---

## R1 · A placa (ângulo A)

Grave a home com `?nicho=barbearia` (uma versão por nicho).

| tempo | o que aparece na tela | ação | legenda queimada |
|---|---|---|---|
| 0,0 a 2,0 s | A home no celular. A placa FECHADO balança na correntinha. Campo do nome vazio. | Nada. Deixe balançar. | Seu negócio aberto na internet. |
| 2,0 a 5,0 s | O polegar digita "Barbearia Navalha Fictícia". As letras aparecem a giz na borda da placa. A placa gira e mostra ABERTO com o nome. | Digitar, depois arrastar a placa para baixo. | Digite o nome. Vire a placa. · selo "nome fictício" |
| 5,0 a 11,0 s | A prévia sobe em tela cheia. Rolar devagar: letreiro, tabela de serviços com o rótulo "exemplo", botão de pedido. Tocar "Testar no meu WhatsApp", escolher serviço e horário, enviar. O WhatsApp abre com o pedido e apita. | Rolar, tocar, enviar. Corte seco no apito. | O site pronto em segundos. · O pedido de horário chega no seu WhatsApp. |
| 11,0 a 15,0 s | Quadro final fixo: fundo `--ceu`, a placa ABERTO no centro, o botão "Abrir meu negócio" desenhado embaixo. | Nenhuma. | Veja o seu grátis. Só paga se gostar. |

Cuidados: grave com o preset atual da barbearia (corte, degradê, barba, corte + barba, pezinho). Pigmentação saiu do preset em 08/11/2026 porque a Meta a trata como procedimento cosmético 18+; se ela voltar à tabela da casa, não grave o R1 desse nicho até tirar a linha da prévia. A faixa "Prévia · os serviços e preços são exemplo" precisa aparecer em pelo menos 1 s do trecho 5 a 11 s. O número de WhatsApp na tela do WhatsApp fica coberto pela faixa "número de teste".

---

## R2 · Sem amarra (ângulo B)

Três cartões de texto e depois a prévia. Grave a prévia com `?nicho=salao` (versão principal da calibragem) e repita para barbearia.

| tempo | o que aparece na tela | ação | legenda queimada |
|---|---|---|---|
| 0,0 a 3,0 s | Cartão 1: fundo `--papel`, borda de nanquim, sombra dura. | O cartão entra empurrado da direita (sem piscar). | Site e pedido de horário no seu WhatsApp. |
| 3,0 a 6,0 s | Cartão 2, mesmo estilo, fundo `--sol`. | Entra por cima do 1. | Sem fidelidade. Sem multa. |
| 6,0 a 9,0 s | Cartão 3, fundo `--ceu`. | Entra por cima do 2. | Se sair, você leva o site e os arquivos. |
| 9,0 a 13,0 s | A prévia do "Salão Esmalte Fictício" rolando devagar, com a faixa "exemplo" visível. | Rolar da abertura até o botão de pedido. | Veja o seu pronto antes de decidir. · selo "nome fictício" |
| 13,0 a 15,0 s | Quadro final: fundo `--ceu`, "Abrir meu negócio" desenhado. | Nenhuma. | Mensalidade só com o site no ar. |

Cuidados: a palavra "posts" não entra neste vídeo, porque posts são só do Vitrine e o vídeo não tem espaço para explicar o plano. O texto do anúncio (B1) já diz "no plano Vitrine".

---

## R3 · A equipe (ângulo C)

Grave a sede com `?marca=Barbearia%20Navalha%20Ficticia&modo=demo`. O modo demo mostra a legenda "Demonstração" da própria sede o tempo todo: **ela não pode ser cortada, coberta ou desfocada.** Se a sede pública (`?modo=publico`) estiver mostrando um pedido real da Creat, não grave: o pedido é de outra pessoa.

| tempo | o que aparece na tela | ação | legenda queimada |
|---|---|---|---|
| 0,0 a 3,0 s | A ilha da sede de longe, nuvens passando, a legenda "Demonstração" no canto. | Câmera parada. | É esta equipe que monta o seu site. |
| 3,0 a 7,0 s | A câmera chega à fachada. A placa mostra "Barbearia Navalha Fictícia" e "ABERTO PELA CREAT NUVEM". | Arrastar devagar para aproximar da fachada. | Com o nome do seu negócio na fachada. · selo "nome fictício" |
| 7,0 a 11,0 s | Os personagens nas mesas acendem um a um: Verbo escrevendo, Paleta nas cores, Lupa com o celular. | Tocar em um personagem para mostrar a frase dele ("escrevendo os textos"). | Você assiste. · Cena de demonstração. |
| 11,0 a 15,0 s | Quadro final: fundo `--ceu`, a placa ABERTO, "Abrir meu negócio" desenhado. | Nenhuma. | Digite o nome e veja a placa virar. |

Cuidados: a legenda "Cena de demonstração" fica na tela de 7 a 11 s, além do "Demonstração" da sede. O vídeo não pode sugerir que o espectador está vendo um pedido real acontecendo.

---

## Texto para acompanhar os vídeos no orgânico (Instagram e Facebook da Creat)

- **R1**: Digite o nome do seu negócio, vire a placa e veja o site pronto, com pedido de horário no seu WhatsApp. Grátis para ver. Link na bio.
- **R2**: Sem fidelidade, sem multa. Se sair, você leva o site e os arquivos; se tiver domínio próprio, ele fica no seu nome. Veja o seu site pronto antes de decidir. Link na bio.
- **R3**: Esta é a sede da Creat. Cada personagem é uma etapa do seu site. Cena de demonstração com nome fictício. Link na bio.

Link da bio: `{{site.url}}/?utm_source=instagram&utm_medium=organico&utm_campaign=bio` (ver `utm.md`).
