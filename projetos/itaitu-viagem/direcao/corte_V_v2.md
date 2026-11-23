# ITAITU · PULSO: corte V v2, rodada 3 (1080x1920, 30 fps, 104,9 s, 50 planos)

EDL: `direcao/edl_V_v2.json`. A saída fecha em 104,90 s sem buraco. Em cada plano, a duração na fonte, multiplicada pela velocidade e pela rampa, dá a duração na saída. Todos os trechos foram conferidos em `mov/`: nenhum passa de tremor 1,0, de pan 40 ou de giro 15, e o único na faixa 0,5–1,0 é a mão tampando a lente (seg 38, 0,72 s). Os recortes 9:16 foram conferidos em quadros reais.
A versão anterior está guardada em `scratchpad/itaitu_v3/edl_V_v2.backup_rodada2.json` e `corte_V_v2.backup_rodada2.md`.

## 1. A ideia (diferente do H)
O H conta a viagem pela paisagem; o V conta pelo casal. São quatro estados, cada um com a sua música, e um gancho de quatro relances que nenhum outro plano do filme repete.

- **Gancho em 0 s (Dancin, drop principal 80,10):** o perfil dele aceso pela luz dourada, ela espiando entre os troncos e olhando para a lente, o pico da serra e a praça à noite, com um corte a cada 2 batidas.
- **Carro:** a conversa entra no breakdown, e o build da chegada corta para o silêncio exatamente no bumbo do drop 2, um drop que nunca chega.
- **Mata sozinha (3,5 s):** depois vem o Loser na trilha, onde a pausa seca da música coincide com o corpo dele saindo do quadro e a volta da música revela o poço.
- **Noite e casal no Messy:** a mão vermelha na lente vira a noite, e o Messy fica com o casal até o beijo no refrão.
- **Fim:** a porta acesa do chalé, para onde a conversa do carro já apontava ("Olha só, essas aqui…", sobre os chalés da estrada).

## 2. Estrutura
| saída | bloco | música | planos |
|---|---|---|---|
| 0,00–4,00 | GANCHO | Dancin 80,10 (drop) | c43 perfil dourado · c25 Glenda espia e olha a lente · c45 pico da serra · c42 praça à noite |
| 4,00–17,26 | CARRO | Dancin drop até 96,3 | c30 túnel (ITAITU + GPS) · Glenda com o braço na janela (HUD 19.11 · 17:23 · 311 m) · ele dança no banco · plano de dois (c02) · ela sorri · ele gesticula e vira para ela, depois o contraplano dela no mesmo instante · o muque ao lado dela |
| 17,26–24,76 | CONVERSA | Dancin breakdown, 10 dB abaixo na fala | **c31, a voz real no carro: "Olha só, essas aqui…"** · plano de dois com sol lateral · contraplano dele · ela olha para ele e sorri |
| 24,76–38,88 | CHEGADA / PEGAR AS COISAS | Dancin build 104,9–118,98 | ele abre o porta-malas no mirante · ela ajeita a bolsa no carro · **as botas dele nas folhas** · ela sobe a trilha com a bolsa · ele de óculos na mata · contra-plongée · **a passada dele até encher o quadro (rampa até 0,5x)** → corte seco para o silêncio |
| 38,88–42,40 | SÓ NATUREZA | sem música | c19: ele entra de costas na mata fechada; som da mata limpa (c24) |
| 42,40–72,80 | TRILHA · LUZ · ÁGUA | Loser 130,33–160,73 | flare na trilha · folhas que abrem para o sol (0,5x) · Glenda no tronco de braços abertos (0,5x) · ele aponta o sol · ele sai rente à lente na pausa da música → **o poço com a cachoeira na volta (142,25)** · **pés nas pedras do riacho** · o poço visto da pedra (HUD 771 m) · ela desce as pedras · folhagem acesa a 0,25x (120 fps) · vale com raio de sol · trilha vermelha · ele olha a copa · a mão vermelha cobre a lente |
| 72,80–90,05 | O CASAL | Messy 36,97–54,22 | noite da chegada: ele leva as sacolas para o chalé · praça, ele sorri ao lado dela · ela olha para trás na trilha · ela abre os braços · ela gira e encara a lente · ele com a toalha sob as palmeiras · os dois olhando o céu da praça · o casal no poço a 0,61x |
| 90,05–98,73 | CLÍMAX | Messy 62,88–71,56 (refrão) | **O BEIJO no carro (2,7 s)** · ela vira e faz joinha (0,75x) · à noite, ela abre a porta do chalé e olha para trás |
| 98,73–104,90 | ASSINATURA | outro do Messy, sem voz (262,45) | os dois na porta acesa do chalé; "creat.MTT" entra em 101,6 s |

## 3. Mapa música × emoção × imagem
| música | trecho na fonte | saída | emoção | como encaixa |
|---|---|---|---|---|
| **m2 Dancin** | 80,10–118,98 | 0–38,88 | alegria, estrada, conversa, chegada | É o drop principal ("Dancing is what to do"), que o H não usa (o H usa 28,1–46,6 e 142,0–160,4). Cada corte cai no bumbo real, que vem 50 ms antes da grade. A conversa fica no breakdown, com a música 10 dB abaixo. O build acompanha a chegada, e o corte seco em 118,98 deixa o drop 2 sem chegar. |
| (nada) | — | 38,88–42,40 | entrar na mata | 3,5 s só de mata, sem voz e sem música. |
| **m1 Loser** | 130,33–160,73 | 42,40–72,80 | contemplação, deslumbre | A música entra na retomada depois da pausa de 130,0. A parada seca de 141,95–142,15 cai na saída dele do quadro, e a volta em 142,25 é o poço. A letra do trecho é "I get the message / Desperate times / I fell into you", e o corte vem antes de "Tried to correct it, what sh… I wrecked it" (164,4). O H usa 52,55–69,61. |
| **m3 Messy** | 36,97–54,22 + 62,88–71,56 + 262,45–268,62 | 72,80–104,90 | o casal, intimidade | A música entra no vermelho com "Listen to me". A emenda tem 16 batidas, com a mesma defasagem nas duas pontas, e pula as linhas com palavrão. O refrão limpo ("And I'm too perfect… I want to be me, is that not allowed?") cai no beijo. O outro, sem voz, acompanha a assinatura. O H usa 7,75–26,66. |

Loudness medida com ebur128 em cada trecho e levada a cerca de -14 LUFS antes do ducking: Dancin no drop -8,2 → ganho -5,8; Dancin no breakdown -13,5 → -0,5; Loser -9,4 → -4,6; Messy A -9,8 → -4,2; Messy B -7,8 → -6,5; o outro (-19,6) fica baixo de propósito, com -1,0.

## 4. Camadas de som
1. **Só natureza:** 38,88–42,40, com a mata do c24 (folhas, passarinho e passos leves). O medium não ouve voz nesse trecho, nem com o áudio normalizado.
2. **Música com natureza por baixo:** folhas do c36 sob o Loser; a cachoeira do c16 (12–17,5) sobe na revelação do poço; a pisada na água do c29 fica sob os pés no riacho; as pisadas em folha seca do c28 ficam sob as botas; o vento da estradinha do c32 (30–44) fica na chegada.
3. **Carro:** vento e rodagem do c02 (21–41,8, sem voz). Nenhuma música do rádio entra: o c04 fica mudo inteiro.
4. **Conversa (legendada):** c31, de 23,80 a 25,30, em sincronia com a imagem. Ouve-se "Olha só, essas aqui têm banh…", e a legenda mostra só "Olha só, essas aqui…", que é o que as 5 transcrições confirmam.
5. **Noite:** só os insetos e o silêncio do chalé (c06 14–20 e 26,3–32,5, sem voz). O show ao vivo do c41/c42 não entra.
6. **SFX:** impacto no drop (0,0), whoosh nos flashes do gancho, vazamento de luz com riser no túnel (4,0), corte seco da música para a mata (38,88), whoosh na saída dele do quadro (54,3), sub-impacto e flash escondendo a emenda do Messy (90,05), porta e insetos no fim.
7. **Mudos de propósito** (som direto com bastidor, rádio ou voz duvidosa): c04, c05, c06 110–116 (o medium normalizado ouviu "Eu estou fazendo o quê?" duas vezes), c08, c13 (vento no microfone), c15, c17, c18, c19, c22, c23, c30, c41, c42, c46.

## 5. Pulo do gato
- **O drop que não vem:** o build do Dancin sobe com a passada dele até encher o quadro, desacelera até 0,5x (60 fps reais) e, no bumbo do drop 2, entra o silêncio da mata.
- **A pausa da música vira corte:** a parada seca do Loser cai no corpo dele saindo do quadro, e a volta revela o poço.
- **Conversa vertical num take horizontal:** no c04 os dois rostos não cabem num 9:16, então o mesmo instante vira plano e contraplano (seg 10 e 11, com a fonte contínua).
- **Câmera lenta só onde a fonte permite:** c36 e c25 a 0,5x (60 fps), c13 a 0,25x (120 fps), c16 a 0,61x, c25 a 0,75x e a rampa do c22.
- **HUD só com dado real:** 311 m no carro (c04), 672 m em Itaitu (c30) e 771 m no poço (c17), todos tirados do GPS dos arquivos.

## 6. Conferências e pendências para a montagem
- **Em comum com o H:** 1 de 50 planos (2%), o beijo (c02 17,2–19,9), que é o único beijo do material. Nenhum trecho de música é usado pelos dois. Atenção: o `edl_H_v2.json` foi regravado às 17:18, durante esta revisão, e passou a usar trechos que o V tinha escolhido. O V trocou c43, c42, c31, c10, c24, c25 e c41 para fugir deles. Se o H mudar de novo, é preciso refazer o cruzamento.
- **Placas:** no c06, o zoom 1,3 com cy 0,38 deixa a placa fora (conferido em 0,5, 3,0, 110, 113 e 116). No c45, a tampa aberta cobre a traseira; mesmo assim, borrar com rastreio se aparecer algum caractere.
- **Ouvir no fone antes de fechar:** a fala do c31 (se a última palavra é "banheiro", "banheirinho" ou "banho ali"; a legenda só mostra a parte confirmada); as duas pontas da emenda do Messy (54,22 / 62,88); a entrada do outro em 262,45.
- **Depois da mixagem:** transcrever o mix final e cada stem de ambiente (c02, c32, c28, c24, c36, c16, c29, c06) e ler a lista inteira.
- **Logo creat.MTT:** usar o vetor e conferir a 100% num quadro 1080x1920.

## Revisão (rodada 3, resposta à crítica de nota 42)

### O que mudou (cada ponto conferido com quadros e números)
| ponto da crítica | conferência | o que foi feito |
|---|---|---|
| **Bloqueia: c16 18,0–20,12 e 18,0–18,69, tremor acima de 1,0** | **Procede.** `mov/c16`: em 18,0 tremor 1,46 e pan 54; em 18,5 tremor 1,80 e pan 75. A frase "nenhum trecho acima de 0,72" estava errada. | O c16 só entra nos trechos firmes: 19,50–21,99 (o poço, tremor 0,27) e 12,03–14,00 (o casal, 0,23). Os dois chicotes saíram. O mergulho agora é o corpo dele saindo do quadro (c20) na pausa da música. O texto da seção 6 foi corrigido. |
| **Bloqueia: ambiente c21 0–5,9 com "é isso mesmo, amor"** | **Procede.** | O c21 saiu de tudo, imagem e som. A ponte usa o som do c24, sem voz no medium (normalizado ou não). |
| **Bloqueia: vento do c13 com "Dança!" repetido** | **Procede.** | O som do c13 saiu. O c13 entra só como imagem, mudo. Todos os stems de ambiente foram transcritos com o medium: c24, c28, c36, c16, c29, c06 14–20, c06 26,3–32,5, c02 21–41,8 e c32 30–44 estão limpos. Nessa conferência caíram mais dois trechos: o c45 (o medium ouviu "E aí" cinco vezes) e o som direto do c06 110–116 ("Eu estou fazendo o quê?" duas vezes). |
| **Grave: o outro do Messy em 261,8 pega "ball"** | **Procede.** O medium ouve "get the f*** on" até 262,30. | O outro agora entra em 262,45, e o medium não ouve voz entre 262,3 e 276. **A varredura achou mais três defeitos que a crítica não apontou:** (1) o Messy A começava em 36,41, no rabo de "life" (36,30), e agora começa em 36,966; (2) terminava em 53,71, no meio de "be" (53,58), e agora termina em 54,22, antes de "Cause" (54,30); (3) o Messy B começava em 62,37 e trazia "been" (62,54), e agora começa em 62,88, antes de "And" (63,06). O Loser foi varrido de 126 a 172: o medium ouve "what sh… I wrecked it" em 164,4, e o trecho escolhido termina em 160,73. |
| **Grave: H × V (29 de 58 planos em comum)** | **Procede.** | Repertório refeito: **1 de 50 planos em comum (2%)**, só o beijo. Nenhuma música se repete entre os dois: o V usa Dancin 80,1–119, Loser 130,3–160,7, Messy 37–54, 62,9–71,6 e 262,5–268,6. Fala, final e transição para a mata também são próprios (o V não usa a tampa nem o c32). |
| **Grave: c41 cinco vezes; c25 e c16 repetidos** | **Procede.** | O c41 ficou com dois trechos (16,5–18,7 e 31,6–33,8). Nenhuma imagem se repete. Ver ressalva sobre o c25 abaixo. |
| **Grave: conversa no carro inexistente, Glenda fora do recorte** | **Procede.** O c04 31–35,2 é rádio mais vozes, e o medium ouve "…pro lado da piloto lá, velho? / Nem tu, amor! / Essa senhora aí, p…". | O c04 ficou mudo inteiro. O c04, o c02 e o c31 foram transcritos inteiros com os dois modelos, e só o **c31 23,8–25,3** tem conversa confirmável, que agora entra em sincronia e com legenda. Os planos de dois do c02 foram conferidos com os dois no quadro (cx 0,58 e 0,63), e o c04 virou plano e contraplano do mesmo instante. |
| **Grave: "Olha isso!" do c15 sem garantia** | **Procede.** Quatro passadas ouvem quatro frases diferentes ("O que você falou?", "O que você achou?", "O que é isso?", "oí, oí"). | A fala e a legenda saíram. O gesto de "olha isso" ficou na imagem: ele aponta o sol (c12 31,7–33,9), sem atribuir palavra. |
| **Grave: show ao vivo com letra sob o Messy** | **Procede.** | Todo o som do c41 e do c42 saiu. A noite fica com os insetos do c06, sem voz. |
| **Grave: c08 10,0–11,07 corta antes de ela virar** | **Procede.** | Agora é 11,00–12,09, e nos quadros 11,5 e 12,0 ela está de frente. |
| **Grave: final do c32 vazio, com "chicote" impossível** | **Procede.** | Final novo, que o H não tem: a porta acesa do chalé (c06 110–116,2), com os dois entrando e a assinatura em 101,6. |
| **Grave: placa do c06** | **Procede.** | O recorte com zoom 1,3 e cy 0,38 deixa a placa fora (conferido em 5 quadros). No c45 há instrução de borrar. |
| **Melhoria: c11 2,4–4,6 com a Glenda filmando** | **Procede.** | O trecho saiu. O c11 entra só em 44,6–46,1 (ele olhando a copa). |
| **Melhoria: c29 com tremor 0,72** | **Procede.** | A imagem do c29 saiu; fica só o som da água (2–8). |
| **Melhoria: c41 38–40,18 borrado** | **Procede.** | O trecho saiu. |
| **Melhoria: a ponte prometia 4,9 s e entregava 3,4 s** | **Procede.** | A ponte agora tem 3,52 s sem nenhuma música (38,88–42,40), e o texto diz exatamente isso. |
| **Melhoria: nível diferente entre as músicas** | **Procede.** | Ganhos calculados por ebur128 em cada trecho (ver seção 3). |
| **Melhoria: rádio do c04 sob a música** | **Procede.** | Nenhum rádio entra. |
| **Melhoria: c38 descrito como "folhagem vermelha"** | **Procede.** É capim verde. | O c38 agora entra em 4,4–6,6, descrito como o que se vê: vale com raio de sol e capim. |
| **Grave: legenda e tempos do "Olha isso" fora de sincronia** | **Procede.** | A fala saiu (ver acima). A legenda nova (17,60–19,06) foi tirada dos tempos de palavra do medium ("Olha" 23,85 → saída 17,61). |

### O que foi rejeitado ou atendido em parte, e por quê
- **"Dancin drop 1 (32–65)" e "Loser 143–175" como trechos alternativos:** rejeitados. O drop 1 colide com o Dancin do H (que agora usa 28,1–46,6), e o Loser 143–175 tem "what sh… I wrecked it" em 164,4. No lugar, entram o drop principal do Dancin (80,1–119), que nenhum dos dois usava, e o Loser 130,3–160,7.
- **"Tirar o c25 do gancho":** atendido em parte. O problema era a mesma imagem (Glenda vira e sorri, 20,6–21,6) no 2º segundo e no clímax. Agora o c25 entra três vezes com três ações distintas e sem trecho repetido: espiando entre os troncos (29,6, gancho), no tronco de braços abertos (8,5–10,0, trilha) e o joinha (20,55–23,0, clímax).
- **"Legenda de 2 a 3 s na conversa":** atendido em parte. A conversa entra com 1,5 s de fala legendada, porque só "Olha só, essas aqui…" se confirma em todas as transcrições. O resto da fala do c31 (28–45 s) tem palavras que mudam a cada passada, e legendar isso seria inventar.
- **"Refazer a varredura de palavrões na música inteira":** feita em todos os trechos usados e nas bordas (Loser 126–172, Messy 34–74 e 256–276). O resto das músicas não entra no filme. O Dancin não pôde ser transcrito (o medium devolve "Thanks for watching", alucinação de canto processado); vale a letra em `itaitu_h2/letras.json`, sem palavrão entre 64 e 128.
- **Repetição do c04 (8 planos no carro):** mantida de propósito. É um take de 2 minutos em que os dois rostos não cabem juntos num 9:16. Os recortes se alternam (Glenda com cx 0,36–0,42, ele com cx 0,74) e nenhum trecho da fonte se repete.


## ATUALIZAÇÃO DO DONO (vale sobre tudo acima)
Vídeo para o Instagram PESSOAL do Marcos: NADA de creat.MTT (sem "um filme creat.MTT", sem logo). O encerramento novo está no campo "assinatura" e nos "textos" da EDL.
