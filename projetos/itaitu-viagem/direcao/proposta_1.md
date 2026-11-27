PROPOSTA "ZOADA": dois filmes de Itaitu (H 16:9 e V 9:16), 104,4 s cada

Quadros conferidos nos proxies (folhas em /tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/conf/V.jpg, H.jpg, V2.jpg, K.jpg, W.jpg, Z.jpg). Conferi 40 planos. Os ajustes ao catálogo estão no fim.

== CONCEITO (vale para os dois filmes) ==
Título interno: ZOADA.
1. A viagem é contada pelo ouvido. Cinco camadas reais da viagem (motor, grilos, cigarras, água, gente) passam a vez uma para a outra, e a imagem obedece ao som.
2. Cada troca de camada é uma transição física da mata: folha na lente, corpo rente à câmera, chicote, estouro de sol, tampa do porta-malas.
3. A trilha original nasce da própria floresta. As cigarras gravadas viram o acorde da música, e o filme termina com a mata sozinha: o ecossistema continua depois da gente.

Texto na tela: só três coisas.
- Título "ITAITU" (fino, tracking +400) com "Chapada Diamantina · BA" embaixo.
- "Legendas do ecossistema": uma palavra minúscula em serifa itálica, no canto, com um pequeno glifo de onda, quando cada camada assume ("motor", "grilos", "cigarras", "água", "gente"). Dá novidade para o olho a cada seção e é verdade literal.
- Assinatura no fim.
Não uso marcador de dia, porque os blocos misturam 20/11 e 21/11.

== TRILHA (uma composição serve aos dois cortes) ==
- 100 bpm: batida de 0,6 s = 18 quadros a 30 fps; compasso de 2,4 s. Todos os cortes caem em múltiplos de 0,6.
- Ré menor dórico, instrumental, sem voz. Downtempo orgânico com toque afro-baiano: caxixi, shaker, berimbau em harmônico, sub-baixo, pad, vibrafone ou kalimba.
- Prompt de geração: "instrumental organic downtempo, 100 BPM, D dorian, caxixi, shaker, berimbau harmonics, warm sub bass, airy pad, vibraphone motif, cinematic travel, builds then halftime, no vocals". Gerar 2 a 3 seções e montar a curva por stems.
- Custo: Higgsfield só depois de pesquisar o preço com desconto, como manda a regra. ElevenLabs é pago e precisa da autorização do Marcos.

Seções e onde a música bate:
- 0–3,6 GANCHO: sem batida. Sub "tum" em 1,8 (estrela de sol).
- 3,6–19,2 ESTRADA: o grave do motor real vira o baixo (sidechain). Caixa entra em 14,4. Riser de motor em 18,6.
- 19,2–26,4 NOITE DE CHEGADA: filtro passa-baixa, sobram baixo e pad. Grilos na frente.
- 26,4–45,6 MATA: a percussão volta. As cigarras reais fazem o papel do chimbal.
- 45,6–50,4 RESPIRAÇÃO: corte total no quadro branco. A gravação real das cigarras do c08, congelada em espectro e afinada em Ré menor, vira o acorde.
- 50,4–67,2 ÁGUA: drop cheio, casado com a primeira imagem da água.
- 67,2–81,6 ALTO: meia-batida, aberto, vento da serra.
- 81,6–93,6 FESTA: J-cut de 0,6 s com a multidão. A música vira algo ouvido de longe, por trás do som de rua.
- 93,6–99,6 PARTIDA: o último acento em 99,6 cai junto com o golpe da tampa (H) ou com o estouro branco do sol (V).
- 99,6–104,4 FIM: só a mata, em fade.

Mix:
- Sem fala no filme. O "ducking" é ao contrário: a música abaixa de 4 a 6 dB sob os sons-evento (cachoeira, tampa, multidão).
- Tom de mata constante por baixo do filme inteiro, para nunca haver buraco. Sai de trechos sem voz: c21 0–6 s (-55 dB, limpo), c24 inteiro e c08/c11, que dão a cama de cigarras.
- No c11, o trecho 25–33 s tem queda de microfone: não usar esse áudio.
- Áudio direto mudo em todos os planos com bastidor: c05, c06, c19, c22, c25 0–3, c35 10,2–11,2.
- Música do carro (c30) e música do show (c41/c42): fora. Da festa fica só o som da multidão, filtrado, no máximo 2 a 3 s.
- Alvo de -14 LUFS, true peak -1 dBTP. O golpe da tampa do c44 tem pico de -0,6 dBFS na fonte: passar por limitador.

== LOOKS DE COR (ffmpeg: curvas, equilíbrio de cor, saturação seletiva, LUT) ==
Base comum: grão fino, halação leve nos realces, pele protegida por máscara de matiz.
- L1 Sertão laranja (c01): sombras para marrom quente, realces arredondados, laranja +15%, vinheta.
- L2 Cabine dourada (c02, c03, c31): pele quente, joelho nos realces para segurar a janela, contraste +.
- L3 Terra vermelha (c30, c34 chão, c26): balanço de branco +300 K, vermelho da terra +, verde puxado 8° para oliva, sombra levemente teal. O c30 vem frio e precisa esquentar.
- L4 Noite turquesa (c05, c06): pretos em azul-petróleo, mantém o poste azul, redução de ruído temporal (nlmeans/hqdn3d) antes do grão.
- L5 Mata esmeralda (c08–c12, c21–c27, c35, c36): verde profundo, menos verde-limão, flares em dourado, curva em S.
- L6 Âmbar d'água (c15, c16, c17, c19, c29): preserva o chá-âmbar, sobe os médios, sombra fria. Joelho alaranjado do c29: corrigir.
- L7 Serra dourada (c13, c37, c38, c43, c45): segura o teal do céu que já vem forte, realces quentes, capim limão contido, pele brilhante do c43 com joelho nos realces.
- L8 Festa (c41, c42): tungstênio do casario, pretos assentados. O magenta estourado na camisa do Marcos (c41, 15–30 s) sai por máscara de matiz e saturação.
- L9 Partida (c44, c45 janela): pastel quente, janela superexposta recuperada só até onde dá.

== FILME H, 1920x1080 a 30 fps ==
Formato de cada plano: tempo no filme | clipe e trecho da fonte | velocidade | recorte | look | transição de entrada | som | texto.

GANCHO
H01 0,0–1,5 | c44 0,0–1,5 | 1x | tela cheia | L9 | o som vem antes da imagem: cigarras cheias desde o quadro 0; a tampa abre por volta de 0,8 com clique e luz | foley real da tampa.
H02 1,5–3,6 | c38 0,3–1,35 | 0,5x (fonte 60 fps) | push digital de 100 para 106% | L7 | corte por luz (2 quadros de branco) | sub "tum" em 1,8 na estrela.

ESTRADA
H03 3,6–6,0 | c01 25,0–27,4 | 1x | recorte 16:9 da fonte V, janela 2160x1215 no sol e na linha de neblina | L1 | match de posição do sol + dissolve de 6 quadros | drone grave do c01 (corte abaixo de 40 Hz) | "ITAITU / Chapada Diamantina · BA" + legenda "motor".
H04 6,0–8,4 | c01 30,5–33,5 | 1,25x | recorte baixo, mandacaru cruzando o sol | L1 | corte na batida | whoosh casado com o mandacaru; a folhagem cobre o quadro na saída.
H05 8,4–12,0 | c02 37,0–40,6 | 1x | tela cheia | L2 | corte escondido no escuro da folhagem | interior do carro c02.
H06 12,0–14,4 | c02 16,0–18,4 | 1x | tela cheia (Glenda encosta no ombro dele) | L2 | flash de sol pela janela | caixa da trilha entra.
H07 14,4–19,2 | c30 8,0–22,4 | rampa de 4x para 2x, média 3x | escala 110% ancorada em cima para tirar o reflexo do painel | L3 | corte na batida | motor com pitch subindo. Sai por zoom digital de 100 para 160% através do ponto de fuga, nos últimos 6 quadros.

NOITE DE CHEGADA
H08 19,2–21,6 | c05 22,0–24,4 | 1x | recorte 16:9 na placa "Village Serra do Cruzeiro" | L4 | o zoom no ponto de fuga casa com o chicote do c05 | grilos (cama do c06, +20 dB, limpa) | legenda "grilos".
H09 21,6–24,0 | c06 54–72 | 7,5x (timelapse) | recorte do plano geral | L4 | corte seco | grilos + porta do carro. Borrar a placa do carro.
H10 24,0–26,4 | c05 10,6–13,0 | 1x | recorte em meio plano da Glenda com a mão na porta | L4 | corte seco | grilos. Sai com 4 quadros da cortina branca (c05 30,0).

MATA
H11 26,4–28,8 | c35 4,6–7,0 | 1x | tela cheia (fonte H) | L5 | cortina branca vira estouro de flare | cigarras sobem, percussão volta | legenda "cigarras".
H12 28,8–31,2 | c35 10,0–14,5 | 1,875x | tela cheia (tilt revela a trilha) | L5 | continuação | passos.
H13 31,2–33,6 | c14 22,0–24,4 | 1x | tela cheia (Glenda desce pelas pedras) | L5 | wipe pelo tronco | passos reais nas pedras.
H14 33,6–36,0 | c32 71,6–74,0 | 1x | tela cheia | L5, puxado para teal | corte seco | o corpo cobre a lente em 72–74 e vira wipe para o próximo.
H15 36,0–38,4 | c36 3,2–5,6 | 1x | recorte 16:9 no sol em estrela | L5 | sai do wipe de corpo | acento na estrela.
H16 38,4–40,8 | c34 5,5–9,1 | 1,5x | recorte 16:9 (tronco diagonal e flare) | L5 | corte na batida | vento e folhas.
H17 40,8–43,2 | c34 17,5–22,3 | 2x | recorte 16:9 rente ao chão vermelho | L3 | whip para baixo | whoosh.
H18 43,2–45,6 | c11 9,5–12,5 | 1,25x | recorte 16:9 da copa com o sol (fonte 1584: ampliar 1,21x e nitidez) | L5 | corte por cor | o flare estoura em branco.

RESPIRAÇÃO (pulo do gato do H)
H19 45,6–48,6 | c13 18,0–18,75 | 0,25x (fonte 120 fps nativa) | tela cheia (feixe de luz na neblina) | L7 | branco | a trilha e a mata param juntas; entra o acorde das cigarras congeladas.
H20 48,6–50,4 | c13 24,6–25,05 | 0,25x | tela cheia | L7 | corte | a folha sobe e cobre a lente; corte escondido.

ÁGUA
H21 50,4–52,8 | c29 5,0–7,4 | 1x | recorte 16:9 dos pés na água corrente (ampliar 1,21x) | L6 | a folha abre na água | DROP + riacho real do c29 | legenda "água".
H22 52,8–55,2 | c29 17,5–19,9 | 1x | recorte 16:9 | L6 | corte | o joelho cobre a tela em 19 s e vira wipe de pele.
H23 55,2–57,6 | c16 18,4–20,8 | 1x | recorte 16:9 do poço | L6 | entra pelo chicote real (18,5–18,9) | whoosh de ar + cachoeira entra cheia.
H24 57,6–60,0 | c16 20,8–22,3 | 0,625x (fonte 60 fps) | recorte 16:9 | L6 | continuação | cachoeira.
H25 60,0–62,4 | c15 49,6–52,0 | 1x | recorte do poço âmbar visto de cima | L6 | match de água | água.
H26 62,4–64,8 | c19 57,0–59,4 | 1x | recorte 16:9: água no canto e o Marcos pisando nas pedras | L6 | corte | passos e água.
H27 64,8–67,2 | c25 21,0–23,4 | 1x | recorte 16:9 da Glenda (sorriso e joinha) | L5 | corte | mata. Sai pelo tronco que cobre o quadro.

ALTO
H28 67,2–72,0 | c37 4,0–13,6 | 2x | tela cheia (flare, depois revelação do vale) | L7 | wipe pelo tronco | meia-batida + vento da serra | legenda "vento".
H29 72,0–74,4 | c13 0,0–6,0 | 2,5x | tela cheia (panorâmica do vale) | L7 | continuação do pan.
H30 74,4–76,8 | c43 13,3–17,5 | 1,75x | recorte 16:9 do capim e do vale | L7 | corte casado com a saída de quadro.
H31 76,8–79,2 | c43 25,0–28,5 | 1,46x | recorte 16:9 com o flare e o rosto em contra-plongée | L7 | corte por flare.
H32 79,2–81,6 | c39 7,0–9,4 | 1x | recorte 16:9 da porteira com céu azul | L5 | corte | o vento cai; nos últimos 0,6 s entra a multidão (J-cut).

FESTA
H33 81,6–84,0 | c42 0,6–3,0 | 1x | recorte 16:9 do casario e do holofote | L8 | a pessoa de boné cruzando a lente serve de cobertura | multidão | legenda "gente".
H34 84,0–88,8 | c41 14,0–18,8 | 1x | recorte 16:9 dos dois rostos olhando para cima | L8 | corte.
H35 88,8–91,2 | c41 37,0–39,4 | 1x | recorte em contra-plongée | L8 | corte.
H36 91,2–93,6 | c41 44,6–47,0 | 1x | recorte | L8 | sai pelo chicote com borrão de luzes.

PARTIDA
H37 93,6–96,0 | c45 52,0–54,4 | 1x | tela cheia (Marcos pela janela do carro, serra em contraluz) | L9 | corte por luz, noite vira dia | a mata volta, a multidão some.
H38 96,0–98,6 | c44 21,8–24,4 | 1x | tela cheia (ele volta ao porta-malas, de pequeno a grande) | L9.
H39 98,6–99,7 | c44 24,4–25,5 | 1x | tampa fecha | golpe real em 25,4 da fonte = 99,6 no filme, junto com o último acento da trilha | corte para preto.
H40 99,7–104,4 | preto | assinatura: "creat.MTT"; a frase-convite está em pendências. A mata sozinha, em fade.
Pulo do gato do H: além da respiração, a tampa abre o filme e a tampa fecha o filme. A viagem inteira cabe dentro do porta-malas.

== FILME V, 1080x1920 a 30 fps (corte próprio) ==
GANCHO
V01 0,0–2,4 | c36 3,0–5,4 | 1x | tela cheia | L5 | abre já em movimento, com cigarras no máximo | folha cruza a lente, sol em estrela em cerca de 1,5 s + sub "tum".
V02 2,4–3,6 | c27 0,0–1,2 | 1x | tela cheia | L5 | chicote verde (só como transição) | whoosh. O "Eita" fica mudo.

ESTRADA
V03 3,6–6,0 | c01 0,0–3,5 | 1,46x | tela cheia (sol com flare e retrovisor) | L1 | sai do borrão do chicote | motor | "ITAITU" + legenda "motor".
V04 6,0–8,4 | c01 6,8–9,8 | 1,25x | tela cheia (poça refletindo o sol) | L1.
V05 8,4–10,8 | c02 38,6–41,0 | 1x | recorte 9:16 (1215x2160) no perfil do Marcos sob luz dourada | L2.
V06 10,8–13,2 | c31 13,0–15,4 | 1x | Glenda olhando pela janela | L2 | wipe pelo braço e volante.
V07 13,2–15,0 | c03 3,8–5,6 | 1x | chicote até o console | L2.
V08 15,0–19,2 | c30 8,0–22,4 | rampa, média 3,43x | recorte 9:16 centrado na estrada | L3 | zoom pelo ponto de fuga na saída.

NOITE DE CHEGADA
V09 19,2–21,6 | c05 22,0–24,4 | 1x | placa, com o chicote | L4 | grilos | legenda "grilos".
V10 21,6–24,0 | c06 0,0–10,0 | 4,17x (timelapse do Marcos saindo com as sacolas) | L4.
V11 24,0–26,4 | c05 5,6–8,0 | 1x | Glenda olha por cima do ombro | L4 | a cortina branca cobre a lente em 7–8 e vira a saída.

MATA
V12 26,4–28,8 | c08 9,8–12,8 | 1,25x | Glenda vira na trilha | L5 | a cortina branca vira flare | legenda "cigarras".
V13 28,8–31,2 | c10 1,0–3,6 | 1,08x | Marcos olha para o alto | L5.
V14 31,2–33,6 | c11 37,0–39,4 | 1x | contra-plongée, Glenda ao fundo, sol em estrela | L5.
V15 33,6–36,0 | c34 5,0–9,5 | 1,875x | avanço com o tronco diagonal | L5.
V16 36,0–38,4 | c34 17,5–21,1 | 1,5x | rente ao chão vermelho | L3 | whip para baixo. A textura vermelha casa com a terra do V17.

RELÉ DE CORPOS (pulo do gato do V)
V17 38,4–40,8 | c26 6,9–9,3 | 1x | Glenda vem pela trilha vermelha e passa rente à lente | L3.
V18 40,8–43,2 | c21 7,6–10,0 | 1x | Marcos sob a moldura de palmeira; o ombro cobre a tela em 9,8–10 | L5.
V19 43,2–45,6 | c22 4,4–6,8 | 1x | Marcos cruza a lente e sai pela direita | L5.
Cada corpo esconde o corte. Um acento de percussão cai em 40,8, 43,2 e 45,6. No c26 e no c22 o corpo não cobre 100% da tela: push digital de 110 a 118% nos últimos 4 quadros. São três passos, como se fosse uma caminhada só.

RESPIRAÇÃO
V20 45,6–48,0 | c25 19,6–20,8 | 0,5x (fonte 60 fps) | Glenda se vira e sorri | L5 | silêncio, só o acorde das cigarras.
V21 48,0–50,4 | c16 16,2–18,6 | 1x | o casal no poço | L6 | corte no borrão do chicote, exatamente em 50,4.

ÁGUA
V22 50,4–53,4 | c16 18,6–22,3 | 1,23x | poço e cachoeira | L6 | DROP + cachoeira | legenda "água".
V23 53,4–55,8 | c29 7,6–10,0 | 1x | pés no riacho | L6.
V24 55,8–58,2 | c19 47,5–49,9 | 1x | Marcos agachado na poça; o corpo cobre e vira wipe | L6.
V25 58,2–60,6 | c19 62,0–64,4 | 1x | perfil na pedra, água âmbar | L6.
V26 60,6–63,0 | c17 105,0–108,5 | 1,46x | giro da câmera até a cachoeira | L6.
V27 63,0–65,4 | c25 9,0–11,4 | 1x | Glenda de braços abertos no tronco | L5.
V28 65,4–67,2 | c25 28,5–30,3 | 1x | Glenda espia entre os troncos; os troncos fecham o quadro | L5.

ALTO
V29 67,2–72,0 | c45 22,0–28,0 | 1,25x | recorte 9:16 do paredão com flare | L7 | meia-batida | legenda "vento".
V30 72,0–74,4 | c43 13,3–17,5 | 1,75x | capim e vale | L7.
V31 74,4–76,8 | c43 25,0–28,5 | 1,46x | flare e contra-plongée heroico | L7.
V32 76,8–79,2 | c39 0,0–3,0 | 1,25x | o tronco funciona como portal e revela a porteira | L5.
V33 79,2–81,6 | c39 6,5–8,9 | 1x | Glenda escala a porteira | L5 | J-cut da multidão.

FESTA
V34 81,6–84,0 | c42 0,6–3,0 | 1x | multidão e holofote | L8 | legenda "gente". Cortar antes de 5,0 s: a mulher olha para a câmera.
V35 84,0–88,8 | c41 12,0–16,8 | 1x | o casal encantado | L8.
V36 88,8–92,4 | c41 35,0–38,6 | 1x | abraço, depois cabeças para trás olhando o céu | L8.
V37 92,4–93,6 | c41 45,6–46,8 | 1x | chicote com borrão de luzes | L8.

PARTIDA
V38 93,6–96,0 | c45 52,0–54,4 | 1x | recorte 9:16 do Marcos bebendo água na janela | L9.
V39 96,0–99,6 | c15 163,0–166,6 | 1x | o sol atravessa as folhas, Marcos em silhueta; o flare engole o quadro em branco no último acento | L7.
V40 99,6–104,4 | branco que vira o sol | "creat.MTT" escuro sobre o branco | a mata sozinha.
Fechamento do V: o filme abre e fecha numa estrela de sol.

Retenção:
- Planos de 1,2 a 4,8 s, média de 2,6 s.
- Novidade para o olho ou para o ouvido a cada compasso (2,4 s).
- O som de cada seção começa antes da imagem (J-cut).
- O V usa 27 clipes diferentes, o H usa 24. Nenhum plano se repete dentro do mesmo filme.

== TÉCNICO ==
- Converter para 30 fps constante: c32 (44,87), c34 (53), c35 (41,7), c43 (36,4), c45 (26,6), c44 (24,09), c41/c42 (24), c17 (24).
- Câmera lenta só onde a fonte permite: c13 a 120 fps; c16, c25, c38 e c37 a 60 fps.
- Estabilizar com vidstab (cortar o mínimo e conferir que não ondula): c11, c12, c19, c22, c25, c27, c29, c34, c41, c43 e o c15 final.
- Fontes de 1584 px recortadas em 16:9 só nos planos H18, H21, H22 e H26: ampliar 1,21x com nitidez.
- Borrar placa de carro: c06, c32, c45.
- Não usados: c04, c33 e c40 (vêm girados 90°), c07 (bastidor), c48 (duplicata do c44), c49 (duplicata do c43 sem o flare), c46 e c28 (fracos).

== AJUSTES AO CATÁLOGO, VISTOS NOS QUADROS ==
- c44: a tampa está fechada em 0–0,5 e abre por volta de 0,8–1,3. Em 1,5 o Marcos já está em quadro, sem camisa. Fecha em 25,0–25,5, com o golpe medido em 25,4 s (pico de -0,6 dBFS). Depois de fechar, a tela não fica escura: aparece o vidro claro. Por isso o corte para preto é feito na edição.
- c45 22–28 é praticamente o mesmo quadro do c37 (mesmo mirante, mesmo ângulo, outro dia). Por isso c37/c38 entram só no H e c45 só no V.
- c16: o chicote real acontece em 18,5–18,9.
- c27 0–2,2: o chicote termina em pescoço e ombro, não no rosto. Serve só como transição.
- c21: o ombro cobre a tela de verdade em 9,8–10. No c22 e no c26 a cobertura é parcial, daí o push digital.
- c01 32 s: há uma massa escura (teto ou objeto) na base do quadro. O plano corta em 33,5.

== PENDÊNCIAS PARA O DONO (decisão dele) ==
1. Frase-convite do fim. Proposta: "Sua viagem vira filme." + "creat.MTT". O @ da conta precisa ser confirmado antes de entrar.
2. Aparece logo de terceiro no boné azul: c27 (fica só o chicote de 1,2 s) e c18 (não usado). Nada crítico na montagem atual.
3. Planos com o Marcos sem camisa: H01, H14, H22, H26, H38/H39, V18, V19, V24, V31, V39. São da viagem real, mas vale a aprovação dele.
4. A trilha gerada tem custo: ElevenLabs precisa de autorização; Higgsfield, só depois da pesquisa de desconto.