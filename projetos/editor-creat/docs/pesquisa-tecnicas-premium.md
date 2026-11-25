# Frente O4: o que os creators e editores premium fazem em 2026, e o que o motor consegue fazer em CPU

Data da pesquisa: 25/11/2026. Código lido em `projetos/editor-creat` (só leitura; nada em `services/`, `apps/` ou `packages/` foi alterado). `docs/inteligencia/` só tem um README de 3 linhas (nenhum relatório semanal ainda), então não havia pesquisa anterior para não repetir.

Marcação usada:
- **[código]** = arquivo e linha lidos.
- **[fonte]** = URL aberta e lida nesta pesquisa (primária quando diz "primária").
- **[busca]** = só vi o título e o trecho na busca, não abri a página. Serve de exemplo, não de prova.
- **[medido]** = medi aqui, nesta máquina (4 CPUs, ffmpeg 6.1.1, OpenCV 5.1.0, quadro sintético 1080x1920, 20 repetições, `cv2.setNumThreads(2)`). Script em `/tmp/claude-0/-home-user-creat-mtt-studio/405b04e4-0871-5a29-ac04-4d1e835b28f9/scratchpad/bench.py`.
- **[proposta]** = decisão de projeto minha, não fato.
- **[não confirmado]** = sem fonte primária ou sem teste.

---

## 1. Resposta curta

1. O motor já tem a base de quase tudo que a lista pede: whip com direção medida da câmera, íris, salto de filme, revela, texto atrás da pessoa (RVM), destaque e pele tratada, rampa e congelamento básicos, legenda palavra por palavra, SFX no corte, ducking, corte na batida [código]. O que falta não é "ter o efeito", é **ligar o efeito ao ritmo da música e à fala** e **subir a qualidade do que já existe**.
2. Os três maiores ganhos por esforço são: **(a)** rampa de velocidade ancorada na batida com câmera lenta por fluxo óptico (hoje o trecho lento da rampa repete quadros), **(b)** gradação de filme permanente (halation + grão por luminância + curva), e **(c)** som em camadas com antecipação do som (J-cut de som 200 a 400 ms) e riser.
3. Os efeitos de "como fizeram isso?" que o motor **não tem** e que cabem em CPU: transição pela máscara da pessoa (reaproveita o RVM), texto preso à cena (rastreio de plano, 1,6 ms por quadro [medido]), congelamento com recorte e contorno, parallax 2.5D em foto (10 ms por quadro depois de um mapa de profundidade [medido]).
4. Dois riscos que mudam decisão: o **RVM é GPL-3.0** [fonte: github.com/PeterL1n/RobustVideoMatting], e só os pesos **Small** do Depth Anything V2 são Apache-2.0 (Base e Large são CC-BY-NC-4.0, uso não comercial) [fonte: github.com/DepthAnything/Depth-Anything-V2].
5. A maior parte dos números de retenção que circulam (3 s de retenção, legenda aumenta conclusão de 37% para 65%) vem de blogs sem método publicado. O que é oficial: Instagram diz que o texto do primeiro quadro funciona como título, 15 a 60 s é o ponto ideal, e os sinais de ranking são tempo assistido, curtidas e envios.
6. Cuidado com "brega": quase toda técnica abaixo vira clichê se aparecer em todo corte. Fonte secundária sugere 3 a 5 transições por vídeo de 30 s [fonte: domer.io, 06/10/2026]; trate como ponto de partida, não regra.

---

## 2. O que o motor tem hoje (com linha)

| Capacidade | Onde | Estado |
|---|---|---|
| Transições em quadro: whip, flash, impacto, zoomt, bloom, leak, rush, gagueira, foto, fade, aba71, mascara, match, revela, salto | `montagem/fx.py:21-24`, `packages/schemas/edl.schema.json` (enum de `fx[].tipo`) | existe. `match` é só marcador: "corte casado, nada a fazer na imagem" (`fx.py:12`) |
| Whip na direção da câmera | `resolvedor.py:665-681` usa `MV.direcao_do_movimento(serie, s - 0.25)` e o `pan_x` medido em `movimento.py` | existe |
| Medição de movimento, tremor e nitidez por 0,5 s | `movimento.py` (LK + afim parcial, 480 px, até 30 fps, limiar de estabilização 1,5 px, tremor forte 4 px, chicote 900 px/s) | existe |
| Estabilização com margem e zoom extra até +16% | `planos.py:5-9`, `render_plano` | existe; **não há hyperlapse** |
| Rampa de velocidade | `resolvedor.py:715-718`: 1,6x nos primeiros 35%, 0,4x entre 35% e 65%, ~1,37x no resto | existe, **posição do trecho lento fixa em porcentagem, sem ligação com a batida** (a única ligação com batida que achei é `_na_batida`, `resolvedor.py:318-333`, que alinha o início de bloco) |
| Câmera lenta | `planos.py:178-199`: mistura quadros vizinhos só quando `vel < 0,95` **sem rampa**; com `rampa`, `lento=False` e `indices_de_quadro` arredonda para o quadro mais próximo | **no trecho 0,4x da rampa, fonte de 30 fps repete cada quadro cerca de 2,5 vezes (tranco).** Em fonte de 120/240 fps o problema some, porque há quadros de sobra [proposta de teste] |
| Congelamento | `resolvedor.py:715-718`: `rampa` que segura o quadro na metade | existe, **sem recorte, sem contorno** |
| Texto atrás da pessoa | `comp.py:154-199` (`texto_atras`, `cobertura`, `escolher_posicao`), RVM em `etapas/pessoa.py` (~45 ms por quadro, `PROGRESSO.md:266`) | existe, com escolha automática da altura mais legível |
| Destaque da pessoa e fundo desfocado | `comp.py:89-122` (`desfocar_fundo`, `destacar`, ~12 ms por quadro, `PROGRESSO.md:283`) | existe |
| Pele tratada | `comp.py:123-152` (separação de frequências leve, só na pele da pessoa) | existe |
| Cor por ambiente | `planos.py:29-43` (tabela `COR`, LUT 1D + saturação) e `cor_looks.json` (lift/gamma/gain por canal, contraste em S, saturação, proteção de pele, alvo de luma, branco medido) | existe; **sem curva de filme, sem halation permanente, sem separação de tons** |
| Grão | `comp.py:286`: `noise=c0s=2:c0f=t+u` no encode | existe, **só 2 de 100 no canal de luminância, uniforme; não segue a luz, não tem tamanho** |
| Vinheta | `planos.py:141-147` | existe |
| Legendas palavra por palavra | `overlay.py:43-72` (quebra em pausa > 0,45 s ou pontuação, até 3 palavras, `y` 0,62, tamanho 94) + `kit/modelos/legenda.js` (palavra ativa âmbar, nunca pisca escuro) | existe; ênfase = 4o valor da palavra |
| Gancho cinético e fecho | `kit/modelos/gancho.js`, `gancho2.js`, `fecho2.js` | existe |
| Legenda de frase inteira | `kit/modelos/legenda_revelada.js` | existe |
| Som em camadas | `trilha.py:150-186` (SFX do kit: abre, chip, cta, embaralha, impacto, risco, whoosh_curto; sintético de reserva por nome, inclui riser), `mix.py` (ducking com ponte de 0,5 s, tom de sala, som direto, -14 LUFS, pico real) | existe; whoosh sai 0,12 s antes do corte (`resolvedor.py:779`); **só 7 sons na biblioteca da casa** [código: `packages/kit/assets/sfx`] |
| Antecipação de som (J-cut) | `voz[]` e `planos[]` têm `t0` independentes no EDL (`edl.schema.json`) | estruturalmente possível; **o resolvedor decidir o J/L-cut: não confirmado** (não achei no `resolvedor.py`) |
| Rastreio de plano para prender texto na cena | nenhum | não existe |
| Parallax 2.5D em foto, Ken Burns | nenhum (`grep` por parallax, profundidade, kenburns: vazio) | não existe |
| Hyperlapse | nenhum | não existe |
| Sincronismo com letra de música | `musica.py` mapeia bpm, virada, tom, seções [código]; nada de letra | não existe |

---

## 3. Tabela geral: técnica, classe e ordem pelo efeito no resultado

"Efeito" é meu juízo do quanto a técnica aumenta a reação "como fizeram isso?" e a retenção em Reels de 15 a 60 s [proposta]. A ordem de ataque (esforço contra efeito) está na seção 5.

| # | Técnica | Classe | CPU por quadro (só nos quadros afetados) | Risco de brega |
|---|---|---|---|---|
| 1 | Estrutura de retenção e gancho dos 2 primeiros segundos | **já tem** (ampliar) | desprezível | médio |
| 2 | Legendas cinéticas e punch-in de zoom | **já tem** (ajustar) | kit 43 ms (já pago) | médio |
| 3 | Rampa de velocidade na batida + câmera lenta por fluxo | **fácil** | ~29 ms só no trecho lento [medido] | baixo se na batida; alto fora dela |
| 4 | Som em camadas, riser, J-cut e L-cut | **fácil** a **médio** | áudio, barato | baixo se discreto |
| 5 | Gradação de filme: halation, grão, curva, bloom, separação de pele | **fácil** | ~42 ms halation, ~33 ms grão [medido] | médio |
| 6 | Texto atrás da pessoa | **já tem** | 45 ms [código] | médio |
| 7 | Cortes por movimento: match cut e whip | whip **já tem**; match real **médio** | ~2 ms | baixo |
| 8 | Transição com máscara da pessoa ou objeto | **médio** | ~50 ms (RVM + composição) | médio |
| 9 | Texto preso à cena (rastreio) | **médio** | ~2 ms rastreio + ~8 ms warp [medido/estimado] | baixo |
| 10 | Congelamento com recorte e contorno | **médio** | ~50 ms | médio |
| 11 | Zoom com parallax 2.5D em foto | **médio** | ~10 ms por quadro depois do mapa [medido] | médio a alto |
| 12 | Hyperlapse | **médio** (versão simples) / **difícil** (Kopf 2014) | ~8 ms fluxo para escolher quadros [medido, DIS] | baixo |
| 13 | Barras e moldura animada | **fácil** | kit, ~43 ms | alto se fixa em 9:16 |
| 14 | Sincronismo com a letra da música | **difícil** | modelo de alinhamento, não medido | médio |

---

## 4. Fichas por técnica

### 4.1 Estrutura de retenção e ganchos dos 2 primeiros segundos (já tem; ampliar)

**O que é.** O vídeo se paga nos primeiros segundos: quem sai no 3o segundo dá zero de tempo assistido.

**O que é oficial.**
- Instagram, guia de Reels 2026: "um texto de abertura forte no primeiro quadro pode ser tão poderoso quanto uma ótima miniatura"; sugere perguntar no primeiro quadro e responder poucos segundos depois; "de alta qualidade, original e envolvente desde o primeiro segundo". Reels vão de 3 s a 3 min, 15 a 60 s é o ponto ideal; 3 a 15 s para transições e frases curtas. [fonte, primária: https://about.instagram.com/blog/tips-and-tricks/how-to-make-instagram-reels ; os números de duração li pela newsletter https://thisweekinsocialmedia.com/p/instagram-s-own-rules-for-reels-reach de 29/09/2026 que cita o guia de 28/09/2026]
- Sinais de ranking: tempo assistido, curtidas por alcance, envios por alcance, ditos por Adam Mosseri [fonte: https://buffer.com/resources/instagram-algorithms, 12/11/2026; origem primária só vista em posts de Instagram na busca: https://www.instagram.com/p/Df11I47GgAr/ **[busca]**].
- YouTube Shorts: desde 31/03/2025 a visualização conta quando o Short começa a tocar; a métrica antiga virou "visualizações engajadas" no YouTube Analytics > modo avançado [fonte: https://support.google.com/youtube/thread/333869549/a-change-to-how-we-count-views-on-shorts e https://9to5google.com/2025/03/26/youtube-shorts-views-metric]. Consequência prática: o número público de views não mede mais retenção; meça pelo engajado.

**O que é número de blog, sem método.** Reels com mais de 60% de retenção em 3 s alcançam 5 a 10x mais que os com menos de 40%; conclusão de ~65% com legenda contra ~37% sem; envios por alcance de 1 a 2% é "forte", 3% ou mais "viral" [fonte: https://creatorlanehq.com/blog/instagram-algorithm-2026-mosseri-vs-measured, 28/06/2026, atualizado 30/08/2026, citando Metricool e Influencer Marketing Hub, sem amostra nem método]. **Não usar como meta do motor sem medir os Reels do próprio Marcos.**

**Como fazer por programa.** O resolvedor já monta gancho (`kit/modelos/gancho.js`, `gancho2.js`), mantém texto legível no quadro 0 (comentário em `gancho2.js`) e tem `trilha.drop_em` para a virada cair no começo de um bloco (`resolvedor.py:890-899`). Falta [proposta]: (a) **regra de controle no QA**: o primeiro quadro tem texto e rosto ou ação, e há um evento novo para olho ou ouvido a cada 2 a 3 s (o próprio relatório de cortes mede isso); (b) **gancho com pergunta e resposta em até 3 s** como modelo de direção; (c) **fecho que fecha o laço do gancho** (loop), pois o tempo assistido entra no ranking; (d) **medir o retorno**: guardar por Reel a retenção e os envios (a Metricool está conectada ao ambiente do Marcos, `mcp__Metricool`) e ajustar os limiares do QA com dado dele.

**CPU.** Nenhum custo extra. **Brega.** Gancho "pare de rolar" genérico. O texto do gancho deve vir da fala real (regra da casa: ousadia na forma, verdade no conteúdo).

### 4.2 Legendas cinéticas e punch-in (já tem; ajustar parâmetros)

**O que é.** Palavra por palavra, sincronizada com a fala, uma palavra de ênfase, zoom em pontos de ênfase. Padrão que os creators de negócio usam (estilo Hormozi).

**Números medidos por terceiros.**
- Estudo de 3 Shorts do Hormozi, quadro a quadro (n=3, parte de 13 vídeos e 4 creators): 1 a 4 palavras por tela, mediana 3; troca de grupo a cada 0,8 a 1,0 s; sans geométrica branca em caixa mista, sombra, sem caixa de fundo, sem emoji; extra-negrito em 1 palavra operativa por tela; posição de 48% a 66% da altura; cortes duros a cada 3,5 a 5,6 s; zero b-roll; alternância entre plano aberto e fechado; zoom lento em trechos parados > 8 s [fonte: https://writepanda.ai/blog/hormozi-style-shorts-editing, 04/07/2026; amostra pequena, o autor avisa].
- Outro guia: punch-ins de 10 a 20%, alternando enquadre centrado e mais fechado, em palavras de ênfase; legenda de 2 a 4 palavras; corte a cada 1 a 3 s [fonte: https://montage.app/blog/hormozi-style-editing, sem data na página; copyright 2026]. Os dois discordam no ritmo de corte (3,5 a 5,6 s contra 1 a 3 s): **não existe número único; calibrar com o Reel do Marcos**.
- "Destacar a palavra falada é mais fácil de acompanhar que destacar palavras 'importantes' aleatórias" [fonte: https://capsubs.com/blog/how-to-make-hormozi-style-captions, 20/10/2026 **[busca]**].

**O que o motor tem.** `overlay.py:43-72`: até 3 palavras por página, quebra em pausa > 0,45 s, `y` 0,62 (dentro da faixa 48 a 66%), tamanho 94; `legenda.js` marca a palavra ativa em âmbar sem piscar. Punch: `resolvedor.py` dá zoom 1,12 a 1,15 (`ef == "punch"`).

**Lacunas** [proposta]: o punch é decidido por plano, não por **palavra de ênfase**. Ligar o 4o valor da palavra (`ênfase`) ao zoom: quando a palavra enfática começa, `enquadre` sobe 1,0 para 1,12 a 1,15 em ~0,18 s e fica até o fim da frase; corte seguinte volta ao aberto. A palavra com pop de escala (1,0 para 1,12 em 80 ms) é só animação do kit.

**CPU.** O zoom é só o `enquadre` por quadros-chave já suportado (`planos.py`), custo zero extra. **Brega.** Zoom em toda frase; legenda amarela com contorno grosso em marca de luxo (o `monty.fast` lista isso como "quando não usar": https://monty.fast/blog/hormozi-style-captions **[busca]**).

### 4.3 Rampa de velocidade na batida + câmera lenta por fluxo óptico (fácil)

**O que é.** A velocidade do clipe muda em curva (rápido, depois câmera lenta no gesto, depois rápido) e o ponto de maior impacto cai **na batida**. É a técnica mais citada em tutoriais de CapCut para "edição cinematográfica".

**Exemplos.**
- Tutorial CapCut com curva de velocidade personalizada (Velocidade > Curva > Personalizada), marcar batidas antes e arrastar os pontos da curva para as marcas; usar fonte ≥ 60 fps e ligar a suavização por fluxo óptico no trecho lento; erros: rampa fora da batida, sem suavização, rampa só no 8o segundo [fonte: https://inkroy.com/learn/how-to-make-a-velocity-edit-in-capcut, 08/06/2026 (data da busca; a página não mostra data); números de velocidade: a página **não dá**].
- Vídeo: https://youtube.com/watch?v=ROJgCDcL1gk (12/03/2026) **[busca]**.

**Como fazer por programa.**
1. Batidas: `musica.mapa` já devolve `bpm`, fase e `virada` [código]. Para música sem grade estável, usar um rastreador de batidas treinado: **Beat This!** (ISMIR 2024, licença MIT, roda em CPU com `--gpu=-1`, devolve batidas e tempos fortes) [fonte: https://github.com/CPJKU/beat_this]. Não medi o tempo de CPU: **[não confirmado]**.
2. Rampa: em vez de `[0,0],[0.35..],[0.65..],[1..]` em porcentagem fixa (`resolvedor.py:715-718`), escolher o instante de pico do movimento (a série `movimento.py` dá `pan_x`, `pan_y` por 0,5 s; usar o máximo da aceleração) e **deslocar a rampa** para que o ponto lento caia na batida mais próxima. Perfil: ~1,5 a 2x antes, 0,3 a 0,5x por 1 a 2 batidas, ~1,2x depois, com curva suave (smoothstep já está em `interp_kf`). Os valores são proposta; a literatura que li não fixa números.
3. Câmera lenta sem tranco: quando o trecho for < 0,95x, **sintetizar quadros intermediários por fluxo óptico** em vez de repetir ou misturar. Receita barata em CPU: fluxo DIS em 270x480 (8,0 ms) e `cv2.remap` em 1080x1920 com o fluxo escalado (20,7 ms) = **~29 ms por quadro sintetizado** [medido]. Farneback no mesmo tamanho: 23,6 ms. O ffmpeg tem `minterpolate` e `framerate` [fonte: `ffmpeg -filters` local, 6.1.1] mas `minterpolate` com compensação de movimento é lento e cria artefatos em borda; **preferir a rota em OpenCV, que o motor já usa**. Em fonte de 120/240 fps nada disso é preciso: os quadros existem.
4. **Bug real a corrigir** (achado de código): com `rampa`, `camera_lenta()` retorna falso (`planos.py:178-180`), então o trecho de 0,4x de fonte 30 fps repete quadros. Hoje só a mistura simples vale para `vel` constante.

**CPU.** ~29 ms só nos quadros do trecho lento (ex.: 1 s de câmera lenta = 30 quadros = 0,9 s de CPU). **Brega.** Rampa fora da batida, rampa em todo corte. **No motor.** Já tem a rampa e o corte na batida; falta ancoragem na batida e interpolação (dificuldade **fácil**).

### 4.4 Som em camadas: whoosh, riser, impacto, ambiente real, J-cut e L-cut (fácil a médio)

**O que é.** Camadas: voz no topo, trilha por baixo, efeitos como acento, ambiente embaixo. O som da cena seguinte entra antes da imagem (J-cut); o som da cena que sai continua depois do corte (L-cut).

**Números de guias** (nenhum primário):
- Som da próxima cena entra **200 a 400 ms antes** da imagem; som de gancho nos primeiros **300 a 900 ms**; trilha desce 3 a 6 dB sob a voz; passa-alta na música em 100 a 150 Hz e no ambiente em 200 Hz ou mais; 3 ou 4 trilhas no máximo; risers e whooshes 6 a 10 dB abaixo do diálogo, e nunca sobre palavra que importa [fonte: https://domer.io/blog/reels-sound-effects-and-transitions-guide (06/10/2026) e https://domer.io/blog/j-cuts-l-cuts-audio-transitions-short-video-guide (27/09/2026, só o trecho da busca para os 6 a 10 dB)].
- Riser "sobe em altura, brilho ou volume por alguns segundos e termina em impacto numa revelação" [fonte: https://opussounds.directory/blog/whoosh-and-transition-sound-effects-for-video-editing, 06/10/2026 **[busca]**].
- Guia de mix para alto-falante de celular, ambiência, foley, SFX e música [fonte: https://vidplate.app/guides/sound-design-for-video, 16/11/2026 **[busca]**].

**O que o motor tem.** Ver tabela da seção 2. Já respeita "voz primeiro" (ducking com ponte de 0,5 s, voz >= 9 dB acima na banda da fala, `mix.py:1-12`), tom de sala só em trecho sem fala, master -14 LUFS e pico real.

**Lacunas e como fechar** [proposta]:
1. **Antecipar o som do corte**: o whoosh hoje sai 0,12 s antes do corte (`resolvedor.py:779`). O guia fala em 200 a 400 ms para o som de **cena** (ambiente da cena seguinte), não para o whoosh. Implementar `ambiente_antecipado`: cortar o som direto do plano seguinte e começá-lo 0,25 s antes do corte com fade de entrada de 150 ms. Dá para fazer em `mix.som_direto` (já faz fades de 40 ms).
2. **Riser** antes do impacto: sintético de reserva já existe (`trilha.py:104-147`, nomes "riser" e "reverse"); falta usar no EDL quando houver revelação (gancho para o corpo, `virada` da música).
3. **Biblioteca**: 7 sons licenciados no kit. Para variar (whoosh em 4 tamanhos, risers de 1 e 2 s, impactos graves, ambientes de rua e loja) é preciso comprar ou gerar biblioteca. A geração de efeitos por IA existe nos conectores (o conector ImagineArt expõe `generate_sound_effect` e o Higgsfield expõe `search_sound_effects`; não testei nenhum), **mas é serviço pago: pedir autorização ao Marcos antes**.
4. **Duck do whoosh sob a voz**: automático com o mesmo envelope da voz, -6 a -10 dB.
5. **Silêncio súbito** antes do impacto (200 a 300 ms) é recomendado em guia [fonte: https://nolanzdev.github.io/posts/short-video-sound-design, 24/10/2026 **[busca]**]; implementar como queda da trilha de 0,25 s antes do drop.

**CPU.** Áudio em numpy, ordem de segundos por vídeo. **Brega.** Whoosh em todo corte; risers longos; efeito alto demais. **Dificuldade.** Lacuna 1, 2 e 4: **fácil**. Biblioteca: **médio** (custo e licença).

### 4.5 Gradação de filme: halation, grão, bloom, curva de contraste, separação de pele (fácil)

**O que é.**
- **Halation**: a luz atravessa a emulsão, volta pela base do filme e cria um halo âmbar a vermelho em torno das altas luzes [fonte: https://darkroom.co/blog/2025-12-08-bloom-halation, 09/12/2025; https://videovillage.com/learn/filmbox/full-guide/negative/halation, Filmbox Pro 3.6.8, "halos de viés âmbar, principalmente em altas luzes e feições de alto contraste"].
- **Bloom**: luz que se espalha em volta das fontes brilhantes (lente), mais branco que o halation.
- **Grão**: ruído que depende da luz (mais visível em tons médios e sombras) e que tem tamanho.
- **Curva de filme**: ombro suave nas altas luzes e pé nas sombras.

**Parâmetros publicados** (todos de projetos não oficiais ou guias; nenhum fabricante de película):
- Pipeline `postfx` (Python, só CPU): halation **em luz linear**, com `threshold`, `radius_frac`, `tint`, `strength`, mistura "screen" avermelhada; LUT logo depois de linear para sRGB; **grão em sRGB, ponderado por luminância**, `luma` 0,018 (fino), 0,028 (médio), 0,040 (pesado); halation 0,7x em dia, 1,0x em noite com luz de interior, 1,7x em noite de neon; grão 0,2x em dia, 1,0x em interior à noite [fonte: https://github.com/0xBeycan/postfx, **projeto de um autor só; os valores de limiar, raio e cor não estão publicados**].
- Biblioteca de cadeias `lavfi` para halation, grão, gate weave, aberração cromática [fonte: https://github.com/SiddharthFulia/vfx-grain-lavfi **[busca]**, não verifiquei se as cadeias funcionam].
- Discussão de colorista: rodar o glow em espaço linear e misturar em "add" fica melhor [fonte: https://www.liftgammagain.com/forum/index.php?threads/simulating-film-halation.11461/, 26/09/2018; mais de 1 ano, mas é conhecimento de ofício estável].

**Como fazer por programa** [proposta, calibrar com olho em material do Marcos]:
1. Halation em 1/4 de resolução: limiar de luminância ~0,78 (200 de 255) com ganho 4, `GaussianBlur` com sigma ~10 px nessa escala (equivale a ~40 px em 1080x1920), tinta BGR (0,1; 0,35; 1,0), força 0,35 a 0,6, soma em luz linear (converter com LUT 256 para linear e voltar). Medido: **41,8 ms por quadro** para a versão sem conversão linear [medido]; a conversão adiciona 2 LUTs (~4 ms).
2. Grão: ruído gaussiano gerado em 1/2 resolução, escalado, ponderado por `1 - |luma - 0,5| * 1,2`, amplitude ~6 de 255, **fixo por quadro com semente do índice** (determinismo exigido pelo QA). Medido: **33,4 ms por quadro** [medido]. Alternativa mais barata: o filtro `noise` do ffmpeg com `allf=t+u` já está no encode, só sobe o valor e adiciona peso; custo ~0 no Python.
3. Curva de filme: já existe `cv2.LUT` (1,9 ms [medido]). Acrescentar à tabela `COR` e a `cor_looks.json` duas chaves, `ombro` e `pe`, aplicadas na LUT existente.
4. Separação de pele: o motor já tem `mascara_pele` (`cor.py`) e `pessoa`. Fundo ligeiramente mais frio e menos saturado, pele mais quente: é o que `destacar` e `cor_looks.json` já fazem com `pele` (0 a 1). Falta uma divisão de tons (sombras frias, altas luzes quentes) [proposta].
5. **Ordem** (importante): converter a fonte para Rec.709 antes de qualquer look. Se a fonte for Apple Log ou HDR, a conversão correta vem da frente O1 (leitura da gravação); aplicar halation ou LUT de contraste em Log sem converter dá resultado lavado e errado.
6. Substituir o `bloom` atual de janela: o FX `bloom` de `fx.py:285-288` usa `GaussianBlur` com sigma 28 em tela cheia e custa **191,9 ms por quadro** [medido]. A versão em 1/4 de resolução cai para ~40 ms. Em janela de 0,5 s (15 quadros) vai de 2,9 s para 0,6 s de CPU.

**CPU.** Halation + grão permanentes somam ~75 ms por quadro. Um Reel de 30 s = 900 quadros = ~68 s de CPU a mais em 1 thread. Para comparar, o custo já medido do motor: 4K HEVC a 142 ms por quadro e overlay a 43 ms por quadro efetivo (`PROGRESSO.md:22`). Acréscimo de ~25% no total. **Brega.** Halation forte vira "filtro de Instagram de 2016"; grão pesado esconde detalhe e piora a compressão do Instagram. Regra do dono: nunca estragar os detalhes, então grão ≤ 0,03 de luma e nunca antes de reduzir o ruído. **Dificuldade**: **fácil**.

### 4.6 Texto atrás da pessoa (já tem)

**O que é.** Texto entre a pessoa e o fundo, criando profundidade. Em 2026 o CapCut, o Premiere (ferramenta de máscara de objeto) e o After Effects fazem isso em um clique.

**Exemplos.** CapCut: texto no fundo, a mesma cópia do vídeo por cima com "Remover fundo" automático [fonte: https://capcut.com/resource/how-to-put-text-behind-a-person-in-capcut, 17/09/2026; limites que a própria página admite: pouca luz e contraste fraco falham, bordas pedem alta resolução e bitrate]. Premiere: "máscara de objeto" como rotoscopia [fonte: https://youtube.com/watch?v=SnRFJshvK3w, 11/02/2026 **[busca]**].

**No motor.** `comp.texto_atras`, `cobertura` e `escolher_posicao` (`comp.py:154-239`) já medem quanto da linha do texto a pessoa cobre e escolhem a altura; sem modelo, o texto fica por cima e o filme nunca perde texto.

**Lacunas** [proposta]: (a) borda do cabelo: o RVM usa um quarto da resolução (`REDUCAO = 0.4`, `LADO = 640`, `pessoa.py:29-30`); subir o refinamento com um *guided filter* de `cv2.ximgproc` na borda custa pouco mas depende de `opencv-contrib` (**[não confirmado]** se o ambiente tem). (b) **Licença**: o RVM é **GPL-3.0** [fonte: https://github.com/PeterL1n/RobustVideoMatting; o motor já registra em `PROGRESSO.md:261` que o uso é só no servidor]. Se o produto passar a ser distribuído a terceiros, avaliar a troca por modelo de licença permissiva (**[não confirmado]** qual; SAM 2 é Apache-2.0 [fonte: https://github.com/facebookresearch/sam2], mas os tempos publicados são todos em GPU A100 e a página não fala de CPU, então **não sei se é prático aqui**).

**Brega.** Texto atrás em toda cena. Regra [proposta]: no máximo 1 a 2 vezes por vídeo, no gancho ou no fecho.

### 4.7 Cortes por movimento: match cut e whip na direção da câmera (whip já tem; match médio)

**O que é.**
- **Whip pan**: o corte esconde-se no borrão de movimento de uma virada rápida da câmera; o corte fica no ponto de maior borrão [fonte: https://masteringmedia.net/post/creative-transition-in-music-video, 22/10/2026 **[busca]**]. Um *whip pan match cut* feito em pós liga dois planos pelo borrão, sem virada real [fonte: https://studiobinder.com/camera-shots/camera-movements/whip-pan-shot, 02/07/2025 **[busca]**].
- **Match cut**: liga dois planos por forma, movimento ou composição semelhantes [fonte: https://insta360.com/blog/tips/how-to-create-film-transitions.html, 24/06/2026 **[busca]**].
- 28 ideias de transição para Reels, TikTok e Shorts, com como filmar cada uma [fonte: https://www.usevyra.com/ideas/transition-ideas, 28/10/2026 **[busca]**].
- O CapCut vende "transição de câmera por IA": whip pan e match cut a partir de texto [fonte: https://capcut.com/resource/ai-camera-transitions-whip-pan-match-cut, 06/08/2026 **[busca]**].

**No motor.** Whip: `fx.py:272-283` desloca até 420 px × força e borra até 150 px, junto do corte; o resolvedor liga a **direção do whip ao `pan_x` medido** (`resolvedor.py:665-681`); isso é exatamente a recomendação dos guias (corte no ponto de maior borrão, na direção da câmera). `match` é rótulo.

**Como fazer um match cut real por programa** [proposta]:
1. Para os últimos 0,5 s do plano A e os primeiros 0,5 s do plano B, calcular um centro de interesse: centroide da máscara de pessoa (RVM) ou o ponto de maior saliência (gradiente) em 270x480.
2. Escolher pares com formas parecidas: correlação de histograma de bordas orientadas (HOG leve) entre o último quadro de A e o primeiro de B, restrita a candidatos do catálogo.
3. Alinhar com o `enquadre` de B: transladar o centro de B para o centro de A no corte e animar a diferença em ~0,3 s (o `enquadre` por quadros-chave já aceita `cx, cy`, `planos.py`).
4. Casar escala (pessoa grande no fim de A, pessoa grande no começo de B) e direção do movimento (`direcao_do_movimento` já mede).

**CPU.** Medição e alinhamento: dezenas de ms por corte, uma vez. Render: zero extra. **Brega.** Match cut forçado entre planos que não têm relação. **Dificuldade**: **médio**.

### 4.8 Transição com máscara da pessoa ou do objeto (médio)

**O que é.** A pessoa (ou um objeto) passa na frente da câmera ou é "recortada" e o plano seguinte aparece **dentro ou atrás da silhueta**. É o "como fizeram isso?" dos Reels de transição.

**Como fazer por programa** [proposta]:
- *Person wipe*: pegar a máscara `a` do plano A (RVM) nos últimos 0,3 s, **escalar a máscara de 1 para ~6x em torno do centróide** até cobrir o quadro, usar `a` como máscara alfa do plano B (`cv2.blendLinear`, 5,1 ms [medido]). O efeito: a pessoa "engole" a tela e o plano B nasce de dentro.
- *Silhouette reveal*: o plano B só aparece dentro da silhueta de A; a silhueta cresce.
- Os 57 `xfade` embutidos do ffmpeg 6.1.1 (wipe, slide, circlecrop, radial etc.) são **grátis** [fonte: `ffmpeg -h filter=xfade` local; a lista tem fade, wipeleft..wipedown, slideleft..slidedown, circlecrop, rectcrop, distance, fadeblack, fadewhite, radial, smoothleft..smoothdown, circleopen, circleclose, vertopen e outras; o filtro aceita valores de -1 a 57]. Servem de **reserva**, não de assinatura; o motor já tem transições próprias e o padrão da casa é a aba71.

**CPU.** RVM ~45 ms + composição ~5 ms + escala da máscara ~2 ms = **~50 ms por quadro**, só em ~10 a 15 quadros por transição. **Brega.** Transição de pessoa em todo corte. **Dificuldade**: **médio** (a máscara de pessoa e o `blendLinear` já existem, falta a coreografia e o QA da borda).

### 4.9 Texto preso à cena (rastreio de plano) (médio)

**O que é.** Um texto ou gráfico que parece pregado numa parede, mesa ou produto, e acompanha a câmera (rastreio planar, como o Mocha no After Effects).

**Como fazer por programa** [proposta]:
1. Escolher a superfície no quadro inicial (a análise já tem detecção de cena e de rosto; superfícies planas ficam como **marcação do diretor**: caixa normalizada em `motion[]`).
2. Rastrear: `goodFeaturesToTrack` na caixa + `calcOpticalFlowPyrLK` quadro a quadro + `findHomography` com RANSAC. **1,6 ms por quadro** em 270x480 com 200 pontos [medido]. O `movimento.py` já usa LK + afim parcial para a câmera inteira; aqui é a mesma ideia, com homografia restrita à região.
3. Aplicar: o kit renderiza a camada em PNG RGBA; a composição faz `cv2.warpPerspective` do PNG com a homografia acumulada (estimado ~8 ms por quadro em 1080x1920; **não medi**). Suavizar a trajetória (média móvel, como `planos.correcao`) para o texto não tremer.
4. Oclusão: se a pessoa passar na frente, usar a máscara RVM para pôr a pessoa por cima (a mesma ordem de `texto_atras`).

**Falha típica**: superfície sem textura, borrão de movimento forte (o `movimento.py` já marca `FALHAS_MAX = 0,3` como "rastreio não confiável"). Usar esse limiar para desistir e deixar o texto fixo na tela. **Brega.** Texto em 3D preso à cena em tudo; vale para endereço, preço ou nome do produto numa gôndola. **Dificuldade**: **médio**.

### 4.10 Congelamento com recorte e contorno (médio)

**O que é.** O vídeo congela, a pessoa é recortada com contorno branco ou colorido, o fundo escurece e dessatura (ou zoom lento), entra um texto, e o vídeo volta.

**No motor.** `ef == "congela"` segura o quadro (`resolvedor.py:715-718`). Falta o recorte.

**Como fazer** [proposta]: no quadro congelado, `a` do RVM → `cv2.dilate` (kernel ~9 px) menos a máscara original = contorno; cor do contorno da paleta da casa (âmbar #F5B84D está no kit); fundo com `destacar` forte (luz -45%, cor -60%) e zoom lento de 1,0 para 1,06 em 0,6 s; sombra projetada suave (blur da máscara deslocado). Como o quadro é parado, **a máscara se calcula uma vez** e o resto é composição barata (~10 ms por quadro): o custo real é de **um** quadro de RVM. **Brega.** Congelamento em toda frase de impacto; contorno grosso demais. **Dificuldade**: **médio-baixo** (fica entre fácil e médio porque a máscara é de um só quadro).

### 4.11 Zoom com parallax 2.5D em foto (médio)

**O que é.** Uma foto parada vira movimento de câmera com profundidade: o primeiro plano se move mais que o fundo. Muito usado em memória, viagem e antes e depois.

**Exemplos.** Projetos abertos: https://github.com/Lakshaaysharma/depth-parallax (Depth Anything V2 + deslocamento de pixel por profundidade, Python/OpenCV) **[busca]**; https://github.com/longweekendlabs/parallax-studio (foto vira loop 2.5D, local) **[busca]**; DepthFlow (renderizador de parallax por mapa de profundidade) citado em https://skills.lc/RyanRealty/RyanRealty/ryanrealty-ryanrealty-video-production-skills-depthflow-pipeline-skill-md **[busca]**.

**Modelo de profundidade e licença** [fonte, primária: https://github.com/DepthAnything/Depth-Anything-V2]:

| Modelo | Parâmetros | Licença |
|---|---|---|
| Small | 24,8 M | **Apache-2.0** |
| Base | 97,5 M | CC-BY-NC-4.0 (não comercial) |
| Large | 335,3 M | CC-BY-NC-4.0 (não comercial) |
| Giant | 1,3 B | CC-BY-NC-4.0, "em breve" |

A página oficial não fala de desempenho em CPU e remete a um exportador ONNX de comunidade (`fabio-sim/Depth-Anything-ONNX`). **Tempo do Small em CPU: não medi, não confirmado.** Como é por foto (uma vez, cacheável), mesmo alguns segundos por foto são aceitáveis.

**Como fazer por programa:** (1) depth do Small em ONNX (o motor já usa `onnxruntime` com RVM e DFN3) numa imagem de ~518 px; (2) normalizar para 0..1, suavizar; (3) por quadro, `cv2.remap` com `x + prof(x,y)·dx(t)`, `y + prof·dy(t)` e `BORDER_REPLICATE`; **10,3 ms por quadro** [medido]; (4) a câmera: `dx(t)` e zoom como trajetória smoothstep de 3 a 4 s; (5) **inpainting** das bordas que abrem (os buracos entre planos): `cv2.inpaint` ou repetir a borda; a falha visual mais comum é "esticar" a borda do primeiro plano. Para amplitudes pequenas (até ~3% da largura) não precisa de inpaint. **Fallback** simples: Ken Burns (`zoompan` do ffmpeg, filtro presente [fonte: `ffmpeg -filters` local]).

**Brega.** Foto com pessoa e amplitude grande deforma o rosto. Limitar o deslocamento a ≤ 2 a 3% da largura e **nunca em retrato** sem teste; é a regra de personagens do Marcos ("semelhança em primeiro lugar") aplicada a foto. **Dificuldade**: **médio**.

### 4.12 Estabilização e hyperlapse (estabilização já tem; hyperlapse médio)

**Estabilização**: já tem, e segue a regra do dono (medir o tremor de cada plano, estabilizar acima de 1,5 px, margem com zoom extra até +16%) [código]. O ffmpeg tem `vidstabdetect` e `vidstabtransform` e `deshake` [fonte: `ffmpeg -filters` local]; o motor preferiu LK próprio por plano. Sem ação.

**Hyperlapse.** O método de referência é Kopf, Cohen e Szeliski, "First-person Hyperlapse Videos", SIGGRAPH 2014 (reconstrução 3D da cena, otimização de caminho de câmera, renderização por proxy) [fonte: https://www.microsoft.com/en-us/research/publication/first-person-hyperlapse-videos/ ; https://szeliski.org/RichardSzeliski.htm]. **Isso é pesado demais para CPU de 4 núcleos e fora de escopo.** A versão prática [proposta]:
1. Acelerar 4 a 12x **escolhendo quadros**, não pulando uniformemente: para cada saída, escolher entre os quadros candidatos o que minimiza o deslocamento em relação ao anterior (fluxo DIS em 270x480: 8 ms por par [medido]; programação dinâmica sobre uma janela de ±(velocidade/2) quadros).
2. Estabilizar o resultado com o mesmo `planos.correcao`.
3. Fonte de 4K ou 2.7K com margem de zoom.

**CPU.** ~8 ms de análise por quadro candidato + estabilização existente. **Brega.** Baixo. **Dificuldade**: **médio** (a seleção por programação dinâmica é nova, o resto existe).

### 4.13 Barras e moldura animada (fácil)

**O que é.** Barras de cinema (letterbox) que abrem ou fecham, moldura com cantos e dados (HUD), contorno que se desenha, para dar "cara de filme" ou de marca.

**Cuidado de geometria** [conta minha]: 2,39:1 em largura 1080 dá **452 px de altura de imagem**, de 1920 px de quadro 9:16. Letterbox 2,39:1 verdadeiro em Reels deixa 76% do quadro preto; não serve. Barras só como **abertura** (começam em ~12% do quadro e abrem em 0,4 s) ou como recorte 1,85:1 em planos de paisagem. O kit já tem `hud.js`, `selo.js`, `chip.js`, `rotulo.js`, `fundo.js` (`packages/kit/kit/modelos`). A zona segura dos botões do Reels já é respeitada no kit (`ZONA`, `gancho2.js`; direita 120 px, esquerda 60 px). **Instagram não publica zona segura no guia oficial que li** [fonte: about.instagram.com, ver 4.1]: o número do kit é decisão interna, **não confirmado**.

**CPU.** Kit, ~43 ms por quadro efetivo [código]; barras fixas podem entrar no filtro de composição por quase nada. **Brega.** Barras permanentes; moldura em marca de supermercado. **Dificuldade**: **fácil**.

### 4.14 Sincronismo com a letra da música (difícil)

**O que é.** Legenda ou tipografia que acompanha a letra cantada, palavra por palavra (lyric video).

**Como fazer** [proposta]: (1) texto da letra vem **do cliente ou do Marcos**; (2) alinhamento forçado palavra por palavra: **WhisperX** usa alinhamento com wav2vec2, licença BSD-2, roda em CPU (`--device cpu --compute_type int8`), mas o README não lista português entre os modelos padrão (o suporte ao português **não está confirmado**) [fonte: https://github.com/m-bain/whisperX]; **ctc-forced-aligner** (MMS, ~1.100 idiomas, em CPU ou GPU) cobre português [fonte: https://github.com/MahmoudAshraf97/ctc-forced-aligner; tabela do artigo https://arxiv.org/html/2610.17782v1 **[busca]**]; (3) em música com voz cantada, o alinhamento erra mais, então separar os vocais antes. **Direito autoral**: usar a letra de música de terceiros em vídeo comercial exige licença; **não pesquisei a legislação brasileira, não confirmado**.

**CPU.** Modelo de 315 M parâmetros (MMS) [fonte: https://github.com/0xShug0/audio.cpp/blob/main/docs/models/mms_forced_aligner.md **[busca]**]; tempo em CPU **não medido**. **Brega.** Moderado. **Dificuldade**: **difícil**, e **baixa prioridade** para o Marcos (a fala dele é a base dos Reels, regra de 11/11/2026); o motor já tem legenda sincronizada com a fala.

---

## 5. Ordem de ataque sugerida (esforço contra efeito) [proposta]

1. **Rampa na batida + câmera lenta por fluxo** (4.3). Corrige um defeito real (tranco em fonte 30 fps) e é o efeito mais pedido. Fácil.
2. **Gradação de filme permanente** (4.5): halation em 1/4 de resolução, grão por luminância, curva de filme, bloom em 1/4. Fácil, mexe em toda peça.
3. **Som: ambiente antecipado, riser, queda de trilha antes do impacto** (4.4). Fácil. A biblioteca maior depende de autorização de gasto.
4. **Punch-in ligado à palavra de ênfase + QA de retenção do gancho** (4.1 e 4.2). Fácil.
5. **Congelamento com recorte** (4.10), **transição pela máscara da pessoa** (4.8) e **texto preso à cena** (4.9). Médios, reaproveitam o RVM e o `movimento.py`.
6. **Match cut de verdade** (4.7) e **parallax em foto** (4.11). Médios.
7. **Hyperlapse simples** (4.12). Médio.
8. **Letra de música** (4.14). Só se um cliente pedir.

Cada item precisa de **modo de edição** (frente O3) que o ligue ou desligue: a mesma técnica serve a vários modos com intensidades diferentes (ex.: halation 0 em "documental", 0,5 em "cinema", 0,8 em "noite de festa"). Fica como parâmetro da receita, não código novo por vídeo.

---

## 6. Medições de CPU (esta máquina)

Quadro 1080x1920, 20 repetições, 4 CPUs, OpenCV 5.1.0 com 2 threads. Imagem sintética: custo fixo de operação, o fluxo óptico pode variar com o conteúdo.

| Operação | ms por quadro |
|---|---|
| Halation (limiar + blur em 1/4 + tinta + soma) | 41,8 |
| Grão (ruído em 1/2 res, ponderado por luminância) | 33,4 |
| Bloom atual do motor (limiar + gauss sigma 28 em tela cheia) | **191,9** |
| Fluxo óptico DIS médio, 270x480 | 8,0 |
| Fluxo óptico Farneback, 270x480 | 23,6 |
| Quadro intermediário por `remap` em 1080x1920 com o fluxo | 20,7 |
| Parallax 2.5D (`remap` com mapa de profundidade) | 10,3 |
| Aberração cromática (desloca R e B) | 3,7 |
| Composição com máscara (`blendLinear`) | 5,1 |
| LUT por canal (`cv2.LUT`) | 1,9 |
| Rastreio de plano (LK 200 pontos + homografia RANSAC, 270x480) | 1,6 |
| Borrão radial (5 amostras de zoom) | 18,8 |

Do código e do `PROGRESSO.md`: RVM ~45 ms por quadro (`PROGRESSO.md:266`), destaque ~12 ms (`:283`), overlay ~43 ms efetivos (`:22`), decodificação 4K HEVC 142 ms (`:22`).

---

## 7. O que não deu para confirmar

- **Tempo de CPU** do Beat This!, do Depth Anything V2 Small em ONNX, do alinhador MMS/WhisperX: não medi (os modelos não estão nesta máquina). Só o que aparece na seção 6 foi medido.
- **Suporte a português do WhisperX**: o README não o lista; teste necessário. O MMS cobre português segundo o README do `ctc-forced-aligner`, mas não vi a taxa de erro em canto.
- **Se o ambiente tem `opencv-contrib`** (`ximgproc`, *guided filter*): não conferi.
- **Parâmetros numéricos de halation de um fabricante de película**: não achei. Os valores da seção 4.5 são ponto de partida meu; precisam de calibração com material real do Marcos.
- **Os números de retenção de blog** (3 s de retenção, 37% contra 65%, envios 1 a 2%): sem método publicado; não confirmados.
- **Os dois guias de ritmo de corte discordam** (3,5 a 5,6 s contra 1 a 3 s). Não há número único.
- **Zona segura do Reels**: o guia oficial que li não a cita; o valor do kit é interno.
- **Vídeos de exemplo** marcados **[busca]**: li o título e o trecho, não assisti. Servem de pista, não de prova de que o efeito fica como descrito.
- **Se o resolvedor decide J-cut/L-cut hoje**: o EDL permite, mas não achei a decisão no `resolvedor.py`.
- **Licença de uso de letra de música** em vídeo comercial no Brasil: não pesquisei.
- **Alternativa de licença permissiva ao RVM** com qualidade de borda equivalente em CPU: não confirmada (SAM 2 é Apache-2.0, mas só vi velocidade em GPU).
- **Páginas que o Marcos pode querer ver em detalhe e não abri**: `docs/inteligencia/` ainda não tem relatório semanal, então a comparação com pesquisas anteriores não foi possível; a revisão automática de quinta-feira vai gerar os primeiros.

---

## 8. Fontes (datas)

Primárias ou do próprio projeto:
- Instagram, guia de Reels 2026: https://about.instagram.com/blog/tips-and-tricks/how-to-make-instagram-reels (publicado 28/09/2026 segundo a newsletter; a página não traz data).
- Meta, Trial Reels (12/2024): https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first-see-what-perfoms-best/ (citado pela newsletter, não aberto).
- YouTube, mudança de contagem de views em Shorts (26/03/2025, vigente em 31/03/2025): https://support.google.com/youtube/thread/333869549/a-change-to-how-we-count-views-on-shorts e https://9to5google.com/2025/03/26/youtube-shorts-views-metric
- Depth Anything V2 (licenças e tamanhos): https://github.com/DepthAnything/Depth-Anything-V2
- RVM (GPL-3.0): https://github.com/PeterL1n/RobustVideoMatting
- SAM 2 (Apache-2.0): https://github.com/facebookresearch/sam2
- Beat This! (MIT): https://github.com/CPJKU/beat_this
- WhisperX (BSD-2): https://github.com/m-bain/whisperX
- ctc-forced-aligner: https://github.com/MahmoudAshraf97/ctc-forced-aligner
- Hyperlapse, Kopf e outros, SIGGRAPH 2014: https://www.microsoft.com/en-us/research/publication/first-person-hyperlapse-videos/
- FFmpeg 6.1.1, filtros (xfade com 57 transições, minterpolate, tmix, lagfun, lut3d, vidstab, deshake, zoompan, displace, remap, chromashift, blend): conferido com `ffmpeg -filters` e `ffmpeg -h filter=xfade` nesta máquina; documentação: https://ffmpeg.org/ffmpeg-filters.html (a página tem 592 mil caracteres; li só o início, o resto conferi pelo binário).

Secundárias (blogs, tutoriais, guias de ferramenta), todas de 2025 a 2026 salvo indicação: https://writepanda.ai/blog/hormozi-style-shorts-editing (04/07/2026), https://montage.app/blog/hormozi-style-editing, https://domer.io/blog/reels-sound-effects-and-transitions-guide (06/10/2026), https://inkroy.com/learn/how-to-make-a-velocity-edit-in-capcut, https://capcut.com/resource/how-to-put-text-behind-a-person-in-capcut (17/09/2026), https://darkroom.co/blog/2025-12-08-bloom-halation (09/12/2025), https://videovillage.com/learn/filmbox/full-guide/negative/halation, https://github.com/0xBeycan/postfx, https://www.liftgammagain.com/forum/index.php?threads/simulating-film-halation.11461/ (26/09/2018, mais de 1 ano), https://creatorlanehq.com/blog/instagram-algorithm-2026-mosseri-vs-measured (28/06/2026), https://buffer.com/resources/instagram-algorithms (12/11/2026), https://thisweekinsocialmedia.com/p/instagram-s-own-rules-for-reels-reach (29/09/2026).
