# Briefing do dono: "Dia de trabalho na Maxima" (creat.MTT), 18/11/2026
Fonte: Dropbox /Creat.MTT Studio/Bastidores Creat 17 - 11 (19 vídeos, 8,3 GB, gravados 17/11 16:40 a 21:02).
Palavras do Marcos:
- "esse vídeo é sobre um dia de trabalho na Maxima, várias rotas, quero o modo ultra criativo, traga tudo que tiver de edição cinematográfica, use o melhor em cada fala e me entregue uma edição completa"
- "Eu, Marcos, Ruan no dia a dia mostrando nossos trabalhos, entregas e desafios"
- ABERTURA: Ruan falando no CT (centro esportivo). FECHO: a gente agradecendo no Rota, com os hambúrgueres.
- "toda a comunicação e imagens, trabalhe de maneira mais inteligente e ajustada possível, porque envolve várias camadas, cada sacada de cena, então máximo de atenção aos detalhes para a edição ficar rica"
Regras que valem: fala dele/deles é a base; retenção (gancho, sem ar morto, novidade a cada poucos segundos, convite final); personagens só reais (sem bonecos paralelos); legendas sem nomes de terceiros não confirmados; áudio natural (sem laço de tom de sala com voz; transcrever mix e stems antes de entregar); estabilizar tremidos; logo creat.MTT em alta; abre e fecha com logo animada; nunca entregar versão com erro conhecido.
Eficiência: baixar só o necessário depois da análise (o Dropbox bloqueia por volume de download).

## Ajuste do dono (18/11, mensagem 2)
Palavras dele: "Lembre que cada vídeo tem a questão da ordem… você olha cada detalhe para poder ter de fato a construção correta… Até a questão das transições mesmo. Tem a parte que eu estou filmando mesmo, [Ruan], que ele termina a fala e ele sai pela porta. E aí depois é meio que o que continua. É como se fosse uma sacada de transição. Em vez de aparecer [Ruan], apareceu. E aí o vídeo ele vai em transições… com as comunicações, com os locais e com todo o trabalho de edição que eu te passei."
- ORDEM: seguir a ordem real das gravações (hora em ordem.json / meta/*.json), salvo quando a narrativa pedir outra coisa e a troca não confundir o dia.
- SACADA DA PORTA: Ruan termina a fala (o Marcos filmando) e sai pela porta; o plano seguinte continua o movimento como transição (passa pela porta e aparece outra pessoa/outro lugar). Achar esse plano e o seguinte e casar o movimento (match cut de porta, whip, som da porta).
- O vídeo anda por transições ligadas às falas e aos locais (cada local com identidade, cada passagem motivada).
- Drive tem IMG_5226 (333,8 MB) que não está no Dropbox, e não tem o de 17:45:06 (593 MB) do Dropbox. Conferir a hora do IMG_5226 pelos metadados.

## Ajuste do dono (18/11, mensagem 3): o vídeo maior (v_210219, 21:02, 4,2 GB)
Palavras dele: "é um vídeo que tem uma iluminação muito ruim… foca… momentos ali que são mais bacanas no sentido ou da comunicação ou mostrando algo… ali se trata de conferir no espaço da prospecção de um novo negócio para poder gerir essa parte de imagem, de divulgação, de gestão que a Create faz. Então a comunicação tem que ser em torno disso também."
- Usar desse vídeo SÓ os melhores momentos (fala forte ou algo sendo mostrado). Luz ruim: tratar (subir sombras sem ruído, denoise temporal, cor noturna assumida/estilizada, grão fino, cortes curtos; nunca deixar "lavado").
- Tema desse bloco: visita de PROSPECÇÃO de um novo negócio; a creat.MTT vai cuidar de imagem, divulgação e gestão. Legendas e chips devem comunicar isso (sem inventar nome do cliente se não for dito/visível).

## Notas do Claude (coordenação)
- "dia de trabalho na Maxima": provavelmente "na máxima" (no ritmo máximo), não nome de empresa. Só tratar "Máxima" como nome se aparecer assim nas falas/imagens.
- IMG_5226 foi gravado às 23:27 (depois da prospecção das 21:02): candidato a fecho no Rota com hambúrgueres. Confirmar pela imagem.
- Fontes em 4K HEVC full range (yuvj420p/pc): NUNCA forçar in_range=tv na leitura (erro do V2 de 17/11).
- Fontes no Drive (link público): curl "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t" (IDs em tools/lista.tsv). ffmpeg não abre a URL direto (DNS só pelo proxy): baixar com curl, cortar, apagar. No máximo um arquivo grande no disco por vez; manter >= 1 GB livre.

## AJUSTE 4 DO DONO (18/11, 15:45), entra na rodada 2 por cima do corte da rodada 1
Palavras-chave dele: "começo, meio e fim"; "bastidores da creat fazendo acontecer"; "quando comunica sobre o Super Kal, aparecer a logo do Super Kal ou alguma animação"; "quando estiver no CT, aparecer a logo do CT MTT"; "a creat é a marca que opera todo o ecossistema das empresas que a gente fomenta; o CT é a base da operação, onde é a loja de suplementos"; "quando eu mostro algo na tela (celular), criar algo na tela para elucidar melhor, filtrar o texto da imagem e criar possibilidades em cima"; "pode usar a API Higgsfield (créditos) para criações e transições"; "Riachão (CT) → carro → Super Kal → carro com chuva forte (dilúvio) → Valente"; "a chuva tem que ser muito bem passada, sem imagem ruim"; "tratamento de imagem e voz na mesma sintonia no filme inteiro"; "nunca sound effects repetitivos ou de banco batido; nunca recriar sons fora da perspectiva do que está na tela".
Aplicação:
1. Arco claro: COMEÇO (CT em Riachão, a base, o Ruan abre) → MEIO (rotas: Super Kal entrega e desafio; estrada no dilúvio) → FIM (Valente/Elite Drako e o Rota com os hambúrgueres, agradecimento + convite).
2. Selo de lugar/marca animado a cada rota: "RIACHÃO · CT MTT, A BASE" com a logo do CT MTT; "SUPER KAL" com a logo do Super Kal; "VALENTE · ELITE DRAKO GYM" com a logo vetorial (drako/V1/mk/assets/marca/drako_logo.svg). Ecossistema: a logo creat.MTT liga os pontos num mapa de rota animado (creat = quem opera tudo).
3. Tela do celular/monitor: replicar em motion graphics o que a tela mostra (senhas da fila, ofertas nas TVs etc.), com zoom e callouts, sem inventar dados que não estão na imagem.
4. Chuva: estabilizar, tirar o ruído, levantar as sombras sem lavar e manter o preto; se o plano continuar ruim, usar melhor como textura (relâmpago, gotas no vidro em primeiro plano) e não por muito tempo.
5. Som: um timbre diferente para cada transição, casado com a ação real (porta, chuva, carro, bip do sistema). Nada de whoosh igual repetido; nada de som que não exista no mundo da cena.
6. Logos: só arquivo original ou vetor limpo, conferido a 100% num quadro 1080x1920.

## AJUSTE 5 DO DONO (18/11, ~15:50), rodada 2
- Chegada em Valente: selo animado "CHEGAMOS EM VALENTE" + logo Elite Drako (vetor).
- Prospecção (v_210219): o espaço se chama **BRABUS LOUNGE** (B-R-A-B-U-S L-O-U-N-G-E). Nome em tipografia cinematográfica diferenciada (não legenda comum). Comunicar o que está sendo conversado: prospectando, a creat cuidando de imagem, divulgação e gestão. Na fala dele (841 s): "a exclusividade é o diferencial… dentro do lounge".
- **Linha do tempo / cronologia na tela**: relógio do dia que avança entre as rotas, com horário aproximado (pode arredondar; o dono disse que não precisa ser exato). Base: horário das gravações (ordem.json, 16h40 até 23h27); o dono lembra do CT "em torno de 3 horas", então a abertura pode marcar "~15h" de forma aproximada (ex.: "TARDE · CT MTT"), e o resto segue os horários reais arredondados.
- Rotas que ficaram para depois (verdade, ditas nas falas): a captação especial na **Igreja Matriz de Riachão** ("hoje tinha missão de ir na igreja… mas estamos partindo agora para Valente") e a **Seleto** (confecção de fardamentos e camisas de marca; "depois Seleto", não deu por causa da demanda). Mostrar na agenda do dia como "remarcada / próxima rota" (riscado ou empurrado), o que reforça a demanda alta da creat. Nunca dizer que foram feitas.
- Riachão aparece nas falas como "Riachão do Jacuípe" (a transcrição saiu "reaction to the creep").
- Tudo com retenção: algo que as pessoas queiram assistir.

## AJUSTE 6 DO DONO (18/11), marcas enviadas, rodada 2
Arquivos em assets/marcas/ (originais do dono, boa resolução):
- superkal_logo.png (oficial, 2048) · kal_mascote_bora.png ("BORA PRA CIMA!", figurinha) · kal_mascote_bracos.png (braços cruzados, recorte). O "bonequinho" do Kal entra quando se fala do Super Kal / na empresa: aparece por baixo do quadro, dá um joinha/"legalzinho" e volta (peek-a-boo com squash & stretch e som real-ish suave). Nunca deformar a arte do mascote.
- drako_selo.png (4320): usar SÓ o dragão + nome (recortar o dragão com a barra, sem o círculo de texto), ou o vetor drako/V1/mk/assets/marca/drako_logo.svg.
- ctmtt_logo.png (1080, logo com ~745 px de largura): para tela cheia, vetorizar (potrace) e conferir a 100%.
- creat_studio_producao.png ("● REC creat.MTT STUDIO · EM PRODUÇÃO") e creat_bastidores.png (claquete "creat.MTT STUDIO BASTIDORES"): selos de bastidores para abertura, vinhetas entre rotas e fecho.
- Artes da creat com "modo": biblioteca de motion em /tmp/claude-0/-home-user-Creat-nuvem-VIBE-CODE/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/assets/look/motion (README.md): hud:edicao, hud:ultracode (grade dos 15 agentes), hud:operacao (checklist), hud:rec, hud:clock (relógio de/até, serve para a LINHA DO TEMPO), chip "● MODO X". Referência visual do "MODO ULTRACODE ATIVADO" em /tmp/claude-0/-home-user-Creat-nuvem-VIBE-CODE/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/oficial/_frames/ultra.jpg. Usar com estratégia: "modo operação em rota" (fala do Marcos) → chip/hud operacao; prospecção → "MODO PROSPECÇÃO"; edição/entrega → hud edicao. Sem exagero: 1 modo por bloco.

## AJUSTE 7 DO DONO (18/11): o Kal como personagem animado, cinematográfico
Pedido dele: o bonequinho entra como animação, em pontos estratégicos, interagindo com a tela e nas transições; "me surpreenda com o nível de qualidade".
Plano do Claude (apresentado ao dono):
- O Kal ganha movimento 3D de verdade: image-to-video no Higgsfield a partir da arte aprovada (kal_mascote_bracos.png / kal_mascote_bora.png), sobre fundo chroma liso, recortado depois (chave + matte limpa). Clipes curtos de 2 a 4 s. Rosto e roupa iguais à arte; tomada deformada é descartada. Antes: pesquisar preço/desconto, testar 1 clipe no modelo mais barato que dê qualidade, registrar o gasto.
- Integração no plano real: mesma cor/grade do ambiente, sombra de contato, desfoque de movimento, grão, parallax acompanhando a câmera (tracking), oclusão atrás de objetos reais quando couber.
- 3 aparições, não mais:
  1. CHEGADA NO SUPER KAL: a logo oficial se monta e o Kal sobe por trás da borda de baixo, cruza os braços e sorri para a câmera (o "dono da casa" recebendo a creat).
  2. NA ENTREGA (sistema de fila / TVs): o Kal aponta para a tela; o número da senha salta para a frente com destaque. Ele reage à entrega, joinha.
  3. TRANSIÇÃO DE SAÍDA: o soco "BORA PRA CIMA!" sobe e leva o quadro para cima (whip vertical) direto para a estrada na chuva.
- Som: foley próprio para cada ação dele (tecido, pop leve, impacto do soco), nada de cartoon de banco.

## AJUSTE 8 DO DONO (18/11): "a visão da creat" sobre o ambiente do cliente
Pedido dele: nas falas em que o ambiente não aparece bem (sobretudo à noite, prospecção no BRABUS LOUNGE), mostrar o ambiente "subindo" como uma visualização: o cliente fala do que quer, do que gosta, da visão dele, e a tela mostra como a mente da creat está construindo aquilo a partir da fala dele.
Execução:
- Ler a transcrição de v_210219 e marcar os trechos em que o dono do espaço descreve o que quer (exclusividade, lounge, público, ambiente, divulgação). Usar só o que foi dito.
- Construção em camadas, sincronizada com a fala: o quadro escuro real congela → linhas de blueprint/wireframe sobem do chão e desenham o espaço (paredes, balcão, luz) → a luz "acende" e aparece o conceito renderizado do lounge com a melhor cara possível (iluminação de cena, neon, gente curtindo) → volta para a cena real. Palavras-chave da fala dele surgem como notas de briefing ("EXCLUSIVIDADE", "O DIFERENCIAL") sendo anotadas.
- Conceito renderizado: image-to-image no Higgsfield a partir de quadros reais do espaço (mesma arquitetura, só melhor luz e clima), 2 a 4 imagens, com parallax/2.5D. Pesquisar preço e desconto antes e registrar o gasto.
- Verdade: rotular como visão/conceito ("A VISÃO DA creat.MTT", "CONCEITO"), nunca como foto real do lugar nem como trabalho já entregue.
- Funciona também para as demais cenas noturnas fracas: ilustrar, não esconder.

## AJUSTE 9 DO DONO (18/11): a chave e o carro piscando (IMG_5169 + IMG_5170, 16:58)
Fora do corte 1; entra na rodada 2, na ordem real (entre IMG_5168 e IMG_5172, no Super Kal). Liberdade criativa do Claude:
- IMG_5169 (1,9 s): close da mão do Ruan apertando a chave eletrônica no balcão. Achar o quadro exato do clique (polegar afundando) e congelar 2 a 3 quadros com zoom de punch no botão. Um anel de "sinal" sai do botão e atravessa a tela.
- O sinal "viaja": corte casado para IMG_5170, o carro preto parado do outro lado da rua. Medir o quadro em que os piscas acendem. Pisca 1 = flash âmbar que vira impact frame; pisca 2 = corte seguro para o próximo plano (as duas piscadas viram o ritmo da edição, casadas com a música).
- As motos que passam na frente do carro (0 a 2 s) servem de wipe natural para entrar no plano.
- HUD discreto do cadeado fechando (chip "● CARRO TRANCADO · MODO OPERAÇÃO" ou só o ícone), linguagem da biblioteca de motion.
- Som: trava de carro REAL (clique do botão + "bip" curto de alarme + o tranco das travas), com perspectiva: o clique perto e seco; o bip e as travas vêm de longe, com rua e ar em volta. Nada de som de desenho animado. Buscar gravação de foley real; se for gerar, que soe gravado na rua, não sintetizado.

## NOTAS DO COORDENADOR (18/11, 16:35) sobre os ativos prontos, valem para direção v2, VFX, motion e QA
- Kal animado conferido contra a arte (build/kal/qa/cmp_arte_vs_anim.jpg): fiel. Dois cuidados: (a) o mostrador do relógio saiu AZUL na animação; na arte é grafite/preto: dessaturar o azul só no mostrador (máscara local), sem tocar no dourado; (b) na prévia do soco o Kal ficou na frente do ROSTO de um homem real: proibido. O Kal nunca cobre rosto de pessoa real; posicionar no terço livre do quadro ou usar plano sem rosto em primeiro plano. Homem real que aparece é o cliente/equipe: tratar com respeito, nada de piada em cima do rosto.
- "BORA PRA CIMA!" entra como tipografia do motion junto do soco (a arte com letreiro não foi animada para não deformar letras).
- Gastos Higgsfield até aqui: Kal US$ 0,4725 + visão US$ 0,265 (build/GASTOS.md). Continuar registrando.
- O dono pediu "máxima dos máximos" e "o quanto antes": qualidade de cinema, sem retrabalho; conferir a 100% antes de devolver.

## AJUSTE 10 DO DONO (18/11, 16:40): TAMANHO DO KAL (prioridade alta, ele viu a prévia e reprovou o tamanho)
Palavras dele: "o boneco não precisa ser muito grande, pode ser menor, estratégico. Na tela, ali na área de segurança, aparece meio que com algum design, alguma forma de se comunicar, mas menor. Não é para ser enorme desse jeito não, pelo amor de Deus."
Regra: IGNORAR a escala 0,75 a 0,8 sugerida no relatório do Kal. O Kal entra PEQUENO: no máximo ~28 a 32% da largura do quadro (≈ 300 a 350 px de largura em 1080), dentro da zona segura (x 60 a 960, y 285 a 1480), num canto livre (de preferência canto inferior esquerdo ou direito da zona segura), sem cobrir rosto, legenda nem a ação. Ele vem com um elemento de design que o ancora e comunica: plaquinha/selo/aba da casa de onde ele sobe (peek por trás de um cartão, de um chip "SUPER KAL" ou da própria logo), com um balão/etiqueta curta quando fizer sentido ("BORA PRA CIMA!", joinha). É um comentarista discreto de canto, não o protagonista. Mesmo na transição do soco: ele pequeno dispara o movimento (o whip nasce do punho dele), sem ocupar a tela.
Conferir a 100% que continua nítido nesse tamanho (reduzir com Lanczos a partir do 1080).
