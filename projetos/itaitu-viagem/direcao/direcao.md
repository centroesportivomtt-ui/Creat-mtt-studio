# ZOADA: direção final (H 1920x1080 e V 1080x1920, 96 s cada, 30 fps)

## 0. O julgamento
As três propostas não vieram no texto da tarefa (o roteiro do workflow mandou só o pedido). Para não parar a linha, julguei três conceitos montados a partir da decupagem completa dos 48 clipes (folhas, quadros de cada trecho e análise de áudio).

| conceito | retenção | ousadia | verdade | viabilidade | vibe pedida | total |
|---|---|---|---|---|---|---|
| **A. ZOADA**: o som do carro é engolido pela mata; ecossistema de camadas; altitude real do GPS como contador; moldura que abre | 9 | 9 | 10 | 8 | 10 | **46** |
| B. Diário: ordem cronológica 19 → 22/11, cartões de dia | 6 | 5 | 10 | 10 | 7 | 38 |
| C. Elementos: terra, água, sol e noite como capítulos | 8 | 7 | 9 | 9 | 8 | 41 |

**Vence A.** Enxertos: de C, a espinha em blocos de elemento (mata → água → sol do cume → noite), que dá novidade a cada 10 a 15 s; de B, a verdade de datas e lugares (título "novembro 2026", HUD só com GPS que existe no arquivo, ordem do dia respeitada dentro de cada bloco).

## 1. Conceito
"Zoada" é a palavra do dono para o barulho da floresta. O filme começa dentro do carro, com o som alto, e quando a janela "abre" a mata engole o som: cigarras, vento, passos, água. A trilha original nasce do ritmo desses sons e vira um groove orgânico. A estrutura é a viagem inteira em 96 s: estrada, entrada na mata, ritmo da trilha, água, cume dourado, a noite com o som da praça e a volta. O fim é a moldura do carro de novo: pelo vidro traseiro, ele caminha para o verde.

## 2. Estrutura (100 BPM, compasso de 2,4 s; drop em 60,0 s nos dois)
| tempo | bloco | o que acontece | energia |
|---|---|---|---|
| 0–4,8 | gancho | 0 s: casal/motorista no carro com o som alto → chicote → vale em 120 fps a 0,25x → flare do sol. A mata engole o som em 1,2 s. | 4 |
| 4,8–14,4 | estrada | túnel de árvores, pôr do sol no alagado, ele sai do carro contraluz, anda até a lente e o corpo cobre o quadro. Título ZOADA. | 3 |
| 14,4–28,8 | entrada na mata | raios de sol, folhagem que varre a tela, ela desce a pedra, raio em câmera lenta, olhar dela, match de botas, riacho de costas. | 5 |
| 28,8–48 | ritmo da trilha | cortes a cada 1,2 s no tempo: avanço em câmera lenta, braços abertos no tronco, olhar para cima → copa (match), POV contra o sol, close extremo, regata MTT, corpo cobrindo a lente. | 7 |
| 48–60 | água (break) | a bateria sai, entram riacho âmbar e poço vermelho em 0,5x, pisadas nas pedras, o casal no poço, plano parado de fôlego. Riser. | 3 |
| 60–76,8 | cume (drop) | o sol estoura na serra (no H a moldura 2,39:1 abre para 16:9 cheio), névoa em 120 fps, rosto dourado, serra, porteira, vale aberto. | 9 |
| 76,8–86,4 | noite / som | a luz vermelha da mão sobre a lente (c34) vira noite; praça cheia, o casal olhando para cima; o som corta seco. | 8 |
| 86,4–96 | volta + assinatura | manhã, ele pela janela do carro contraluz; pelo vidro traseiro ele caminha para o verde; creat.MTT entra sobre a mata. | 2 |

Mapa de retenção: o olho ou o ouvido recebe algo novo a cada 1,2 a 2,4 s. Os planos longos (c46 4,6 s antes do drop e c44 7,6 s no fim) são respiros de propósito, sustentados por riser ou acorde final. Não há tela preta.

## 3. Pulo do gato
1. **O som do carro vira mata**: a música do carro (diegética, só 1,2 s) é fechada em low-pass e engolida pela zoada em estéreo largo; a trilha nasce em cima dela.
2. **Altitude real como contador**: HUD discreto (mono, 11 px de altura útil, branco 70%, canto inferior esquerdo) com coordenada e altitude tiradas do GPS de cada arquivo: 277 m na estrada, 665 m no mirante, 771 m no ponto mais alto (c17). Só nos clipes que têm GPS; nos outros o HUD some. Tudo verdadeiro.
3. **Transições feitas com a própria mata e com o corpo**: folhagem em primeiro plano (c14), corpo cobrindo a lente (c32 → c35, c21, c22), olhar para cima → copa (c11 → c10), botas → botas (c46/c29), flare como luz de transição, e o vermelho real da mão na lente (c34 32,6 s) virando a noite.
4. **Moldura**: o H roda em 2,39:1 até o drop e abre para 16:9 cheio quando o sol estoura na serra (60,0 s). O filme abre e fecha dentro do carro (janela lateral e vidro traseiro).
5. **Câmera lenta verdadeira**: c13 a 120 fps (0,25x); c15, c16, c19, c20, c22, c23, c25, c36, c37 e c38 a 60 fps (0,5x). Nada abaixo do que a fonte permite.

## 4. Looks (receitas nos JSON)
- **cabine**: interior do carro, pele quente e natural.
- **estrada_dourada**: pôr do sol, altas âmbar e sombras azul-petróleo.
- **mata_verde**: verdes esmeralda, amarelos-verdes contidos, pretos de filme e pele protegida.
- **cerrado_verde**: mirante ao sol duro; segura o céu e tira o verde-limão estourado.
- **agua_ambar**: tanino do riacho e do poço, âmbar e vermelho realçados.
- **cume_ouro**: c32, c37, c38, c43, c44, c45 e c46 já vieram com filtro teal/laranja do app. O look só casa: tira ciano e aquece as altas. Não empilhar outro LUT.
- **noite_som**: pretos firmes, luzes de palco preservadas, grão maior.
- **luz_vermelha**: a transição da mão (c34), com brilho.

Em todos, o grão é o último filtro. Fazer uma passada de casamento de cor entre planos vizinhos de fontes diferentes (iPhone cru e exportado com filtro).

## 5. Trilha
Original, 96 s, 100 BPM: downtempo orgânico afro-brasileiro (caxixi, alfaia, atabaque abafado, berimbau como textura, kalimba, baixo quente, vocal feminino sem letra). O prompt e a estrutura por seção estão nos JSON. Gerar com o modelo de melhor custo do momento (Higgsfield/ElevenLabs, regra de custo do dono): pedir 2 versões e escolher pela que acerta o drop em 60,0 s e o acorde em 93,6 s. As três músicas em `itaitu/musica/` (m1_loser, m2_dancin, m3_messy) são comerciais: servem só de referência de BPM e clima, não entram.

## 6. Sound design: ecossistema de camadas
Bases (só janelas sem fala; a lista está em `camadas_de_ambiente` nos JSON):
- carro: c02 0–48 s, c31, c30 13–22 s (música do som do carro: no máximo 1,2 a 2,4 s por vez, abafada e baixa, por causa de direito autoral no Instagram);
- mata: c32 (vento e pássaros), c36, c15 0–45 s;
- passos: c28 (folha seca), c29 1–31 s (pedra e água);
- água: c15 46–58 s (riacho), c16 12–23 s (queda);
- vento do mirante: c13 0–28 s, c14 0–28 s;
- noite: c42, c41 5–35 s (multidão e som ao vivo, curto e baixo).
Regras: (1) fala de bastidor nunca entra: c05, c06, c07, c17, c18, c19, c20, c21, c22, c23, c46 e c08 ficam mudos ou são usados só fora das janelas de fala. (2) Tom de sala e ambiente nunca vêm de trecho com voz. (3) c09–c14 têm nível alto sem fala: conferir no fone se é vento batendo no microfone; se for, trocar por c32/c36. (4) Passos, gotas e folhas caem no tempo da trilha. (5) Ducking não se aplica (não há fala), mas o ambiente sobe nos breaks (48–60 e 86,4–96) e desce no drop. (6) Antes de entregar, transcrever o mix final e os stems de ambiente e ler tudo: não pode aparecer palavra nenhuma.
SFX: chicote, folhas roçando, porta de carro, impacto e sub no drop, reverse cymbal, riser de 4,8 s antes de 60 s, sub drop na luz vermelha e corte seco de 0,3 s antes da manhã.

## 7. Texto na tela
- 4,8–8,4 s: **ZOADA** (fina, tracking largo) + "Itaitu · Bahia · novembro 2026" pequeno.
- HUD de GPS nos planos marcados (`texto.tipo = hud`).
- Assinatura (últimos 3,6 s): "creat.MTT" + "sua viagem merece um filme". Logo em vetor ou PNG de alta, conferida a 100% no quadro final.

## 8. Técnico e conferência
- cx e cy foram conferidos em quadros de início, meio e fim de cada trecho, recortados no formato de saída. As folhas de conferência estão em `scratchpad/itaitu_j/ver/`.
- Trocas feitas na conferência: c01 24–26 (tremido; trocado por 9–11,4), c28 (pés borrados; fora), c09 no H (borrado; fora), c20 no H (cortava a cabeça; reenquadrado em cy 0,33), c43 27 (contraluz escuro; trocado por 28,2/29), c16 11,0 (começava borrado; passou a 11,8), c22 (terminava vazio; cortado em 7,0), c27 (fim com borrão; trocado por 11,4–12,6), c11, c16 e c43 no H (cabeça ou queixo cortados; cy corrigido).
- Excluídos: c04, c33 e c40 (proxy deitado, rotação errada); c49 (duplicata do c43); c48 (duplicata do c44); c05/c06/c07 (noite de chegada com fala e luz ruim); c12 e c18 (selfie tremida).
- Estabilizar (vidstab, corte mínimo, sem borda preta nem ondulação) todos os planos com `estabilizar: true`. Os planos parados (c32, c39, c44, c45, c46, c17) ficam como estão.
- Fontes de 24 a 36 fps (c41, c42, c43, c44, c45) rodam só a 1,0x.
- Recorte entre formatos: fonte 4K vertical → 16:9 dá 2160x1215 (sobra resolução); fonte 1584x2816 → 16:9 dá 1584x891 (ampliação de 1,21x, aceitável, com nitidez leve). Fonte 4K horizontal → 9:16 dá 1215x2160.
