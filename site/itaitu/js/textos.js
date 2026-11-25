/* =====================================================================
   Trilhas de Itaitu · textos.js
   Verbo (copywriter), 20/11/2026. Dono único deste arquivo (ARQUITETURA, 1 e 6.5).

   Todos os textos da interface num lugar só. Módulo ES puro: não toca no
   DOM, não faz fetch e não guarda estado ao importar. O Node importa para teste.

   ---------------------------------------------------------------------
   COMO USAR
   ---------------------------------------------------------------------
   import { T, t, fraseApaga } from './textos.js';
   t('hora.nota', { min: 10 })                         'calculado pelo relevo, ±10 min'
   t('hora.sombra_cobre', { hora: '16:05', nome: 'Véu da Noiva' })
                                                       '16:05, a sombra da serra cobre o Véu da Noiva'
   T.tabuas.chamar_guia                                'Chamar um guia'
   T['tabua.chamar_guia']                              o mesmo texto (chave com ponto, ARQUITETURA 6.5)

   - t(chave, vars = {}, provisorio): troca cada {var} pelo valor. Chave
     ausente: devolve provisorio ?? chave e avisa uma vez com console.info.
     Var ausente: o {var} fica no texto, para o QA ver, e avisa uma vez.
     Número entra como veio: quem chama formata (numeroBR, duracaoTexto).
   - Chave com {casa} ou {parceiro} (cartão, cortesia, demo, título): chame
     textoDaCasa(chave, marca), nunca t() direto. A marca padrão não tem
     parceiro nem Instagram, e t() deixaria o {casa} na tela.
   - Artigo automático: {o:nome} {do:nome} {no:nome} {ao:nome} {pelo:nome}
     viram "o Véu", "das Arapongas", "na Geladeira", "ao Piancó", "pela ACAGI".
     Quem chama passa só o nome. O gênero sai da tabela GENERO ou da 1ª
     palavra: "Cachoeira do Urubu" vira "a Cachoeira do Urubu".
   - Apelidos de namespace (o mesmo objeto, dois nomes): tabua = tabuas,
     gravar = gravador, cache = armazenamento, rota = gps. Existem porque a
     ARQUITETURA (6.5) usa os nomes curtos nas chaves com ponto.
   - Lista (array) se lê direto em T (T.gps.rumos); t() só devolve texto.
   - Texto daqui e de JSON entra no DOM só por textContent.
   - Não altere T em execução: a marca do parceiro vem do JSON da marca.
   - Honestidade (ARQUITETURA 6.3), que estes textos carregam:
     toda hora de sol vem com "calculado pelo relevo, ±10 min" (confiança
     alta) ou ±15 min (media), por notaDeCalculo(incertezaMin(ponto));
     escurece e "volte com luz" não levam a nota; estimativa em múltiplo
     de 5; fato (chegada, início e fim da gravação) exato; a sombra nunca
     aparece só na cor, sempre com palavra; ponto sem coordenada não tem
     hora de sol. Sem emoji, sem promessa de ganho, sem dizer que é o
     primeiro ou o só do mundo (o SunTrail 3D existe). Pode dizer: nenhum
     app de trilha em português nem guia de hóspede faz isso.
   - Trocar de vale (Capão, Lençóis, Cipó, Veadeiros): troque VALE, os
     textos que citam Itaitu, a ACAGI e o Village, e as legendas.

   ---------------------------------------------------------------------
   FUNÇÕES (assinaturas fixas: outros módulos dependem delas)
   ---------------------------------------------------------------------
   fraseApaga({ nomeCurto, apagaHHMM, amanha })
     'A serra apaga o sol do Véu às 16:05.' · amanha: 'Amanhã, a serra apaga...'
     Sem apagaHHMM (sem sol direto no dia): 'Hoje o sol direto não chega ao Véu.'
     Opcional passou: true (o sol já foi): 'A serra apagou o sol do Véu às 16:05.'
   fraseSaiaAte({ nomeCurto, apagaHHMM, saiaHHMM, minutosDeSol })
     Frase que fica de pé sozinha (diz o lugar): 'Para ter 1 hora de sol no Véu, saia até 14:30.'
     saiaHHMM nulo e minutosDeSol > 0 (situação saia-agora): 'Saindo agora, ainda dá para ter 25 min de sol no Véu.'
     saiaHHMM nulo e minutosDeSol <= 0: 'Hoje não dá mais tempo de chegar ao Véu com sol: a serra apaga o sol às 16:05.'
     minutosDeSol padrão 60 ('1 hora'). Opcional amanha: true.
   fraseDaHora({ nomeCurto, apagaHHMM, saiaHHMM, minutosDeSol, amanha })
     A frase dos 5 segundos, inteira e sem repetir: 'A serra apaga o sol do Véu às 16:05.
     Para ter 1 hora de sol no poço, saia até 14:30.' Use esta OU as duas acima, não as três juntas.
   fraseVolteComLuz({ escureceHHMM, volteHHMM })
     'Escurece às 18:10. Para voltar com luz, saia do poço até 17:10.' (sem a nota de ±)
   fraseCartao({ chegadaHHMM, apagaHHMM, minutosDeSol })
     'Cheguei 15:52 · a serra apaga o sol 16:05 · 13 min de sol no poço'
     0 min ou chegada depois do apaga: 'Cheguei 16:20 · a serra apagou o sol 16:05 · poço na sombra da serra'
     Sem apagaHHMM (destino sem hora de sol): 'Cheguei 15:52'
     minutosDeSol vem pronto do cartao.js: apaga exibido menos max(chegada, nasce), nunca
     abaixo de 0. Esta função não faz essa conta. Sem minutosDeSol, a frase sai sem número:
     'Cheguei 15:52 · a serra apaga o sol 16:05' (chegada no apaga ou depois: a da sombra).
     A chegada é fato: passe exata (15:52). O apaga é o exibido (múltiplo de 5).
   notaCalculo           constante 'calculado pelo relevo, ±10 min' (confiança alta)
   notaDeCalculo(min)    'calculado pelo relevo, ±{min} min'; use com incertezaMin(ponto) (10 ou 15)
   notaNublado           constante: em dia nublado, escurece continua valendo
   avisoSemCoordenada    constante 'posição não confirmada: vá com guia'
   avisoAproximada       constante 'posição aproximada'
   textoAmanha           constante: aviso de que as horas na tela são de amanhã
   ariaRegua(horaHHMM, listaDeEstados)
     Para aria-live e aria-valuetext, sempre com a palavra:
     '16:05, a sombra da serra cobre o Véu e as Arapongas; sol no Coxinho'
     Cada item da lista: { nomeCurto | nome | id, estado | luz }, com estado
     'sol' | 'sombra' | 'noite' | 'sem-sol'; ou um texto pronto. Lista vazia: só a hora.
   ariaSombra(nomeCurto, estado)
     'A sombra da serra cobre o Véu.' · 'Sol no Véu.' · 'Hoje o sol direto não chega ao Véu.'
   nomeCurto(id, nome)
     Mapa por id (o id completo de pontos.geojson ou a chave curta): veu 'Véu',
     arapongas 'Arapongas', coxinho 'Coxinho', flores 'Flores', sossego 'Sossego',
     geladeira 'Geladeira', pianco 'Piancó', e os de fora da placa (urubu, santuario,
     indios, andorinhas, riachinho, sonhos). Fora do mapa: o nome inteiro. Sem nome: ''.
   comArtigo(forma, nome)   forma 'o'|'do'|'no'|'ao'|'pelo': comArtigo('do', 'Arapongas') 'das Arapongas'
   duracaoTexto(min)        25 '25 min' · 60 '1 hora' · 90 '1 h 30 min' · 120 '2 horas'
   numeroBR(valor, casas)   1.32 com 1 casa '1,3' (vírgula decimal)
   linhaDaPlaca(props, { semQuebra = true })
                            '3 min de carro · 2 km de trilha · ≈ 30 min · Fácil' (só o que existe);
                            cada trecho com semQuebra, a linha só quebra no ' · '
   semQuebra(texto)         '≈ 30 min' e '2 km' com espaço que não quebra (U+00A0), '30–40'
                            com U+2060 depois do traço (pedido do DESIGN.md, seção 6). As frases
                            de hora e a nota de ± usam espaço comum, para teste por texto achar.
   rumoTexto(graus)         250 'oeste' (8 rumos, de 45 em 45 graus)
   textoSMS({ coordenada | lat, lon, precisaoM, link })
     SMS do SOS numa parte só, garantido aqui: até 160 caracteres do alfabeto GSM-7.
     Por isso vai sem acento e sem °: com ç, ã ou °, o celular conta 70 por parte.
     Quando não cabe, sai o link e depois a precisão. A coordenada nunca sai.
     link: o ponto num mapa, não o endereço do app (o app não mostra onde a pessoa
     está). Ex.: 'https://maps.google.com/?q=-11.333108,-40.503572' (48 caracteres).
     'Preciso de ajuda em Itaitu, Jacobina BA. Posicao: -11.333108, -40.503572
     (precisao de 12 m). https://maps.google.com/?q=-11.333108,-40.503572' tem 141.
   cabeEmUmSMS(texto)       true se o texto tem só GSM-7 básico e até 160 caracteres (SMS_LIMITE)
   legendasDoCartao({ cachoeira, km, subidaM, instagram, parceiro, apagaHHMM, minutosDeSol,
                      chegadaHHMM, nasceHHMM })
     As legendas do compartilhar (1 a 5, as de T.cartao.legendas) e a 6, da Hora da
     Serra, que só aparece quem chegou com sol. Devolve [{ n, texto, curta, marcada, copiar }].
     Passe chegadaHHMM e nasceHHMM: quem chegou antes de o sol entrar no poço não
     "chegou com sol", e a 6 sai. Sem os dois, a 6 depende só de minutosDeSol > 0.
   textoDaCasa(chave, marca)
     Texto que depende da casa, escolhido pelo JSON da marca. Na marca padrão nunca sai
     {casa} nem {parceiro} na tela.
     cartao.compartilhado, cartao.legenda_copiada: pedem o @ do Instagram; sem @, a versão _sem_casa.
     cartao.cortesia, marca.cortesia, placa.cortesia: sem parceiro devolve '' (não desenhe a linha).
     demo.fase4: sem parceiro, demo.fase4_sem_casa. meta.titulo_marca: sem parceiro, T.meta.titulo.
     textoDaCasa('cartao.compartilhado', marcaPadrao)   'Pronto. Cartão compartilhado.'
     textoDaCasa('cartao.compartilhado', { instagram: 'https://www.instagram.com/casa/' })
                                                        'Pronto. Marque @casa no story.'
   VALE                     { nome, municipio, uf } do vale deste arquivo

   ---------------------------------------------------------------------
   CHAVES (namespace.chave {vars}: o que é e onde aparece)
   ---------------------------------------------------------------------
   app.nome                      nome do app na marca padrão (a marca do parceiro pode trocar)
   app.recurso                   nome do recurso-assinatura e do selo do cartão
   app.credito                   crédito discreto, no rodapé, no cartão e na placa
   app.slogan                    linha de posicionamento (cartão, placa, sobre)
   app.subtitulo                 a promessa em uma linha, sem número

   meta.idioma                   <html lang>
   meta.titulo                   <title> recomendado, até 60 caracteres
   meta.titulo_alternativo       2ª opção de <title>, até 60 caracteres
   meta.descricao                <meta name="description">, até 155 caracteres
   meta.og_titulo                og:title (prévia do WhatsApp e do Instagram)
   meta.og_descricao             og:description
   meta.og_tipo                  og:type
   meta.og_local                 og:locale
   meta.og_site                  og:site_name
   meta.url                      og:url e <link rel="canonical"> (endereço final do briefing)
   meta.og_imagem                og:image: vazio até o designer gerar arte/og.png (1200x630). Vazio: não ponha a tag
   meta.og_imagem_alt            og:image:alt
   meta.twitter_card             'summary'; troque para 'summary_large_image' quando houver og_imagem
   meta.h1                       o único h1 do index.html (pode vir de marca.nome_app)
   meta.titulo_marca {nome_app} {parceiro}   document.title em execução, só com parceiro
                                 (textoDaCasa; sem parceiro fica T.meta.titulo)
   meta.marcos_titulo            <title> do marcos.html
   meta.marcos_robots            <meta name="robots"> do marcos.html (não indexar)

   abertura.anuncio              #hora-live no início do dia correndo (0,5 s)
   abertura.anuncio_parado       #hora-live quando a abertura é pulada (movimento reduzido, economia)
   abertura.dica_arraste         dica curta junto da régua depois da abertura

   regua.rotulo                  aria-label do grupo .regua
   regua.controle                aria-label do input range
   regua.dica                    dica sobre a régua, na primeira visita
   regua.agora                   botão que volta a régua para a hora de agora
   regua.agora_curto             marca "agora" no trilho
   regua.inicio                  rótulo da ponta esquerda (nascer arredondado para cima)
   regua.fim                     rótulo da ponta direita (escurece arredondado para baixo)
   regua.evento_nascer {hora}    .regua__eventos: "nascer 05:10" (DESIGN.md 6)
   regua.evento_por {hora}       .regua__eventos: "pôr 17:50"
   regua.evento_escurece {hora}  .regua__eventos: "escurece 18:10"
   regua.janela                  legenda da faixa da janela de sol no trilho
   regua.sol                     palavra do data-luz="sol"
   regua.sombra                  palavra do data-luz="sombra"
   regua.marca_sol {nome} {hora}     title/aria da marca de um poço ainda com sol
   regua.marca_sombra {nome} {hora}  title/aria da marca de um poço já na sombra

   hora.nota {min}               nota de toda hora de sol (10 alta, 15 media)
   hora.nublado                  nota do dia nublado (constante notaNublado)
   hora.nublado_com_hora {escurece}   a mesma nota com a hora de escurecer
   hora.amanha                   selo .tabua__selo e rótulo de amanhã
   hora.amanha_aviso             aviso quando todas as horas são de amanhã (constante textoAmanha)
   hora.apaga                    dt "sol no poço até"
   hora.nasce                    dt "sol chega ao poço" (arredondado para cima)
   hora.saia_ate                 dt "saia até"
   hora.volte_com_luz            dt "volte com luz até"
   hora.escurece                 dt "escurece às" (sem nota de ±)
   hora.nascer                   rótulo do nascer do sol (#hora-horarios)
   hora.por                      rótulo do pôr do sol (#hora-horarios)
   hora.saindo_agora {min}       situação saia-agora na tábua
   hora.sol_foi                  situação sol-foi na tábua
   hora.sem_sol                  situação sem-sol na tábua
   hora.sem_tempo                situação sem-tempo (confirmado, sem tempo de placa: Urubu)
   hora.carro_da_placa           de onde vem o tempo de carro (sempre do Village, pela placa)
   hora.indisponivel             motor sem OffscreenCanvas ou init falhou
   hora.calculando               enquanto o motor ainda não respondeu
   hora.sombra_cobre {hora} {nome}   aria-valuetext e #hora-live: sombra sobre um poço
   hora.sol_em {hora} {nome}         aria-valuetext e #hora-live: sol num poço
   hora.faixa_destino {nome}     .faixa-saia__destino
   hora.faltam_escurecer {min}   alerta durante a gravação
   hora.volte_agora              ação do alerta de escurecer
   hora.escureceu                depois do escurece, com gravação em andamento
   hora.conferida_em_campo       ponto com sol_ajuste_min medido em campo
   hora.como_relevo              "como calculamos": de onde sai a hora de sol
   hora.como_saia                "como calculamos": a conta do saia até
   hora.como_volte               "como calculamos": a conta do volte com luz
   hora.como_arredonda           "como calculamos": múltiplos de 5, para o lado seguro
   hora.como_incerteza           "como calculamos": por que ±10 ou ±15
   hora.frase_apaga {nome} {hora}            molde de fraseApaga
   hora.frase_apaga_amanha {nome} {hora}     molde de fraseApaga com amanha
   hora.frase_apagou {nome} {hora}           molde de fraseApaga com passou
   hora.frase_sem_sol {nome}                 molde de fraseApaga sem apagaHHMM
   hora.frase_sem_sol_amanha {nome}          o mesmo, amanhã
   hora.frase_saia {sol} {nome} {hora}       molde de fraseSaiaAte
   hora.frase_saia_amanha {sol} {nome} {hora}  o mesmo, amanhã
   hora.frase_saia_poco {sol} {hora}         2ª frase de fraseDaHora
   hora.frase_saindo_agora {sol} {nome}      fraseSaiaAte na situação saia-agora
   hora.frase_sem_tempo_hoje {nome}          fraseSaiaAte quando não dá mais tempo
   hora.frase_sem_tempo_hoje_apaga {nome} {hora}   o mesmo, com a hora do apaga
   hora.frase_volte {escurece} {volte}       molde de fraseVolteComLuz
   hora.frase_escurece {escurece}            fraseVolteComLuz sem volteHHMM
   hora.frase_volte_so {volte}               fraseVolteComLuz sem escureceHHMM
   hora.aria_sombra {lista}                  parte de ariaRegua: poços na sombra
   hora.aria_sol {lista}                     parte de ariaRegua: poços com sol
   hora.aria_sem_sol {lista}                 parte de ariaRegua: poços sem sol direto no dia
   hora.aria_noite                           parte de ariaRegua: depois de escurecer

   tabuas.titulo_placa           título do grupo das 7 cachoeiras da placa
   tabuas.titulo_outros          título do grupo dos outros lugares
   tabuas.lista                  aria-label da <ul class="tabuas">
   tabuas.placa_linha {carro} {km} {trilha} {nivel}   .tabua__placa; prefira linhaDaPlaca, que trava a quebra
   tabuas.da_placa               aviso da própria placa: distâncias e tempos aproximados
   tabuas.confirmada             estado confirmada (quando precisar dizer)
   tabuas.aproximada             .tabua__aviso do estado aproximada (constante avisoAproximada)
   tabuas.aproximada_detalhe     por que a aproximada não tem hora de sol
   tabuas.sem_coordenada         .tabua__aviso do estado sem-coordenada (constante avisoSemCoordenada)
   tabuas.sem_coordenada_detalhe de onde vêm os números da tábua sem coordenada
   tabuas.chamar_guia            .tabua__guia (link do guia)
   tabuas.chamar_guia_dica       ao lado do Chamar um guia: combine com sinal
   tabuas.fincada                .tabua__fincada, trilha gravada em campo com a ACAGI
   tabuas.fincada_por {quem}     a mesma ideia para outro autor (artigo automático)
   tabuas.ver_no_mapa            ação de voar até o ponto
   tabuas.seguir_ate             ação de levar o GPS até o ponto
   tabuas.taxa                   rótulo da taxa
   tabuas.horario                rótulo do horário
   tabuas.riscos                 rótulo dos riscos
   tabuas.nivel                  rótulo do nível
   tabuas.outros_nomes {nomes}   nomes antigos (Clarindo, Jaqueira, Cocino...)
   tabuas.fonte {fonte}          de onde veio a posição
   tabuas.conferir               dado antigo: conferir no local
   tabuas.confianca.alta         grau de confiança da posição: alta
   tabuas.confianca.media        grau de confiança: media
   tabuas.confianca.baixa        grau de confiança: baixa
   tabuas.confianca.sem-coordenada   grau de confiança: sem coordenada
   tabuas.vazia                  lista vazia (dados não carregaram)

   faixa.rotulo                  .faixa-saia__rotulo
   faixa.destino {nome}          .faixa-saia__destino (igual a hora.faixa_destino)
   faixa.saindo_agora            rótulo da faixa na situação saia-agora
   faixa.saindo_agora_destino {min} {nome}   destino da faixa na situação saia-agora
   faixa.amanha                  selo da faixa quando as horas são de amanhã
   faixa.aria {hora} {nome}      aria-label da faixa inteira
   faixa.esconder                botão que esconde a faixa

   cartao.titulo                 título do <dialog> do cartão
   cartao.gerando                enquanto o worker desenha o relevo
   cartao.frase {chegada} {apaga} {min}   frase do cartão com sol
   cartao.frase_sombra {chegada} {apaga}  chegou na hora ou depois da sombra (sem "0 min")
   cartao.frase_sem_hora {chegada}        destino sem hora de sol
   cartao.frase_sem_minutos {chegada} {apaga}   fraseCartao sem minutosDeSol: a frase sem o número
   cartao.chegada_rotulo         rótulo "cheguei" sobre a hora de chegada (DESIGN.md 7, bloco I)
   cartao.apaga_rotulo           rótulo sobre a hora do apaga (bloco I)
   cartao.linha_sol {min}        linha dourada "15 min de sol no poço" (bloco I)
   cartao.linha_sombra           a mesma linha quando chegou com o poço na sombra
   cartao.numeros {km} {tempo} {sobe}     km, tempo e subida em uma linha (texto do compartilhar)
   cartao.rotulo_trilha | cartao.rotulo_tempo | cartao.rotulo_desnivel   rótulos das 3 colunas (bloco J)
   cartao.valor_km {km}          valor da coluna trilha ("2,0 km")
   cartao.valor_desnivel {m}     valor da coluna desnível ("+90 m")
   cartao.selo                   selo Hora da Serra (o canvas escreve em caixa alta)
   cartao.selo_janela {ini} {fim}         janela de sol no poço, dentro do selo ("06:10–16:05", bloco G)
   cartao.selo_sem_hora          selo sem janela (bloco G)
   cartao.luz_real {data} {hora}          a luz daquele minuto: nenhum cartão sai igual a outro (bloco D)
   cartao.pe {nome_app}          pé do cartão (bloco K)
   cartao.slogan_linhas          3 linhas de fecho do cartão (lista)
   cartao.cortesia {parceiro}    linha da marca do parceiro. Só com parceiro: na marca padrão a
                                 linha não existe (textoDaCasa devolve '')
   cartao.credito                "feito pela Creat"
   cartao.sem_destino            nome do destino quando a trilha não tem destino
   cartao.compartilhar           botão principal (Web Share com arquivo)
   cartao.baixar                 botão de download (quando o celular não compartilha)
   cartao.compartilhado {casa}   depois do compartilhar; {casa} é o @ do Instagram da marca
   cartao.compartilhado_sem_casa o mesmo sem @ (marca padrão ou parceiro sem Instagram)
   cartao.legenda_titulo         acima das legendas
   cartao.legenda_copiada {casa} depois do toque numa legenda; {casa} é o @ do Instagram
   cartao.legenda_copiada_sem_casa   o mesmo sem @ (use textoDaCasa, que escolhe)
   cartao.sem_sinal              compartilhar sem internet
   cartao.alt                    alt da prévia do cartão
   cartao.fechar                 fecha o <dialog>
   cartao.hashtags               vão no fim do texto copiado
   cartao.legendas               moldes das legendas (lista; use legendasDoCartao)

   demo.selo                     selo visível durante a demonstração
   demo.sair                     #hora-demo-controle: sair
   demo.pausar                   #hora-demo-controle: pausar
   demo.continuar                #hora-demo-controle: continuar
   demo.fase1                    legenda da fase 1 (0 a 8 s)
   demo.fase2 {nome} {hora}      legenda da fase 2 (8 a 30 s), por poço
   demo.fase3                    legenda da fase 3 (30 a 45 s): trilha SIMULADA, dito na tela
   demo.fase4                    legenda da fase 4 (45 a 60 s), com parceiro (fala da marca da casa)
   demo.fase4_sem_casa           a mesma fase na marca padrão (?demo=1 sem ?m=)
   demo.fim                      fim dos 60 s
   demo.vitrine                  aviso de que WhatsApp e links para fora ficam desligados (vitrine=1)
   demo.vitrine_curto            selo curto ao lado de um botão desligado
   demo.vitrine_sos {acao}       SOS na vitrine: 1º toque avisa, 2º toque em 5 s liga de verdade
   demo.vitrine_acao_ligar {numero}  o {acao} da ligação
   demo.vitrine_acao_sms         o {acao} do SMS

   destinos.titulo               título do painel de destinos (palavra que o público busca)
   destinos.buscar               placeholder da busca
   destinos.buscar_rotulo        <label> da busca
   destinos.sem_resultado {termo}   busca sem resultado
   destinos.grupo_placa          grupo das cachoeiras da placa
   destinos.grupo_outros         grupo dos outros lugares
   destinos.carro                sufixo do tempo de carro
   destinos.trilha               sufixo do km de trilha
   destinos.nivel                rótulo do nível
   destinos.taxa                 rótulo da taxa
   destinos.horario              rótulo do horário
   destinos.riscos               rótulo dos riscos
   destinos.notas                rótulo das notas
   destinos.outros_nomes {nomes} nomes antigos
   destinos.confianca            rótulo do grau de confiança
   destinos.confianca_niveis.alta | .media | .baixa | .sem-coordenada   texto de cada grau
   destinos.fonte {fonte}        fonte da posição
   destinos.aproximada           igual a avisoAproximada
   destinos.sem_coordenada       igual a avisoSemCoordenada
   destinos.so_na_lista          ponto sem coordenada: só na lista
   destinos.fechar               fecha #destino-detalhe

   marca.falar                   botão do WhatsApp da marca ("Falar com a pousada" do briefing; serve a camping)
   marca.falar_rotulo            aria-label do mesmo botão
   marca.instagram               botão do Instagram da marca
   marca.tipos.guia | .onde-comer | .hospedagem | .outro   título de cada grupo de parceiros
   marca.ver_no_mapa             parceiro com ponto_id
   marca.abrir {nome}            aria-label do link de um parceiro
   marca.precisa_sinal           link externo (Instagram, WhatsApp) sem internet
   marca.cortesia {parceiro}     linha "mapa cortesia do ..." no topo. Só com parceiro
                                 (textoDaCasa devolve '' na marca padrão)
   marca.credito                 "feito pela Creat"

   gps.ligar                     botão que liga o GPS
   gps.seguir                    modo seguir
   gps.parar_seguir              sai do modo seguir
   gps.procurando                esperando a 1ª posição
   gps.precisao {m}              precisão da posição
   gps.precisao_ruim {m}         precisão pior que 30 m
   gps.negado                    permissão negada
   gps.indisponivel              aparelho sem posição
   gps.demorou                   tempo esgotado
   gps.bussola                   botão do iOS para a bússola
   gps.bussola_negada            bússola negada
   gps.ate_destino {dist} {nome} distância até o destino
   gps.em_linha_reta {dist}      distância em linha reta
   gps.pela_trilha {dist}        distância restante pela trilha
   gps.rumo {rumo}               rumo (use rumoTexto)
   gps.tempo {tempo}             tempo estimado (use duracaoTexto)
   gps.linha_reta                rótulo da linha tracejada sem traçado (rota.linha_reta)
   gps.sem_tracado               destino sem traçado no mapa
   gps.fora_da_trilha {m}        mais de 40 m do traçado
   gps.de_volta                  voltou para o traçado
   gps.chegou {nome}             chegou ao destino
   gps.destino {nome}            destino escolhido
   gps.tirar_destino             limpa o destino
   gps.rumos                     8 rumos por extenso, a partir do norte (lista)
   gps.rumos_curtos              8 rumos abreviados (lista)

   gravador.titulo               título do painel Gravar
   gravador.gravar               botão que começa a gravar
   gravador.pausar               pausa
   gravador.continuar            retoma
   gravador.parar                para e abre o salvar
   gravador.gravando {km} {tempo}   estado durante a gravação
   gravador.pausada              estado pausado
   gravador.pausa_auto           pausa automática
   gravador.aviso_tela           Wake Lock: página web não grava com a tela bloqueada (gravar.aviso_tela)
   gravador.tela_acesa_falhou    sem Wake Lock
   gravador.trava                trava contra toque no bolso
   gravador.destravar            como soltar a trava
   gravador.recuperada           gravação reaberta depois de fechar o app
   gravador.nome                 <label> do nome da trilha
   gravador.nome_padrao {data}   nome sugerido
   gravador.destino              <label> do destino
   gravador.sem_destino          opção sem destino
   gravador.salvar               salva
   gravador.salva                confirmação
   gravador.descartar            descarta a gravação
   gravador.descartar_pergunta   confirmação do descartar
   gravador.manter_gravacao      desiste de descartar
   gravador.exportar_gpx         baixa o GPX
   gravador.importar_gpx         abre o seletor de arquivo
   gravador.importar_ajuda       ajuda do importar
   gravador.importada {nome}     GPX importado
   gravador.minhas_trilhas       título da lista
   gravador.vazia                lista vazia
   gravador.apagar               apaga uma trilha
   gravador.apagar_pergunta {nome}   confirmação do apagar
   gravador.manter               desiste de apagar
   gravador.resumo {km} {tempo} {sobe}   resumo ao parar
   gravador.passagem             ponto de passagem com nota (app particular)
   gravador.gerar_cartao         gera o cartão da trilha
   gravador.inicio {hora}        início da gravação (fato, exato)
   gravador.fim {hora}           fim da gravação (fato, exato)

   marcar.botao                  "Marcar ponto aqui"
   marcar.aguardando_gps         botão desabilitado sem posição
   marcar.precisao {m}           precisão no formulário
   marcar.precisao_ruim {m}      precisão pior que 30 m: fica aproximado
   marcar.titulo                 título do <dialog id="marcar-ponto">
   marcar.nome                   <label> do nome
   marcar.nome_ajuda             ajuda do nome
   marcar.nome_obrigatorio       erro sem nome
   marcar.tipo                   <label> do tipo
   marcar.nota                   <label> da nota
   marcar.nota_ajuda             ajuda da nota
   marcar.salvar                 salva o ponto
   marcar.cancelar               fecha sem salvar
   marcar.salvo                  confirmação
   marcar.meus_pontos            título da lista
   marcar.vazio                  lista vazia
   marcar.exportar_geojson       exporta GeoJSON
   marcar.exportar_gpx           exporta GPX
   marcar.apagar                 apaga um ponto
   marcar.apagar_pergunta {nome} confirmação do apagar
   marcar.manter                 desiste de apagar
   marcar.do_toque               ponto marcado pelo toque longo
   marcar.so_neste_celular       onde o ponto fica
   marcar.tipos.<tipo>           rótulo de cada tipo do contrato de pontos.geojson (+ porteira, ponte)

   perfil.titulo                 título do perfil de altitude
   perfil.indisponivel           sem altitude e sem motor
   perfil.do_relevo              fonte 'relevo'
   perfil.do_gps                 fonte 'gps'
   perfil.resumo {sobe} {desce} {min} {max}   aria-label do SVG e texto abaixo dele
   perfil.voce_esta_aqui         marca da posição no perfil

   mapa.toque_copiar             balão do toque longo: copiar
   mapa.coord_centro             botão de teclado: balão no centro do mapa
   mapa.copiada                  confirmação do copiar
   mapa.copiar_manual            sem permissão de área de transferência
   mapa.altitude {m}             altitude do relevo no balão
   mapa.distancia_voce {dist}    distância até o GPS no balão
   mapa.marcar                   botão do balão: marcar ponto aqui
   mapa.fechar                   fecha o balão
   mapa.modo_3d | mapa.modo_2d   rótulo dos botões 3D e 2D
   mapa.modo_3d_rotulo | mapa.modo_2d_rotulo   aria-label dos mesmos botões
   mapa.satelite | mapa.relevo   rótulo dos botões Satélite e Relevo
   mapa.satelite_rotulo | mapa.relevo_rotulo   aria-label dos mesmos botões
   mapa.satelite_nota            por que o padrão é o relevo, não a foto
   mapa.norte                    rótulo do botão do norte
   mapa.norte_rotulo             aria-label do botão do norte
   mapa.aproximar | mapa.afastar zoom
   mapa.creditos                 botão da atribuição

   sos.botao                     botão SOS fixo
   sos.botao_rotulo              aria-label do botão SOS
   sos.titulo                    título da tela SOS
   sos.decimal                   rótulo da coordenada em graus decimais
   sos.gms                       rótulo da coordenada em graus, minutos e segundos
   sos.precisao {m}              precisão da posição
   sos.hora {hora}               hora da posição (fato, exato)
   sos.sem_posicao               ainda sem GPS
   sos.sms                       botão sms:
   sos.sms_dica                  por que o SMS
   sos.ligar_193 | sos.ligar_192 | sos.ligar_190   botões tel:
   sos.o_que_dizer               o que falar na ligação
   sos.sem_sinal                 sem sinal para ligar
   sos.fechar                    fecha a tela SOS

   seguranca.titulo              título do painel de segurança
   seguranca.antes_de_sair       título dos avisos
   seguranca.emergencia          título dos telefones
   seguranca.ligar {numero} {nome}   botão tel: de info.emergencia
   seguranca.guias               título dos guias
   seguranca.guias_dica          como falar com a ACAGI
   seguranca.melhor_epoca        título da melhor época
   seguranca.taxas               título das taxas
   seguranca.horarios            título dos horários
   seguranca.acesso              título do acesso
   seguranca.fonte {fonte}       fonte de cada informação de info.json
   seguranca.quando {quando}     data de cada informação
   seguranca.conferir            selo de "conferir" de info.json
   seguranca.nao_confirmado      selo de confirmado: false
   seguranca.desatualizado       selo de desatualizado: true
   seguranca.volte_antes         regra fixa de volta
   seguranca.nao_substitui       o mapa não substitui o guia
   seguranca.bateria             bateria cheia

   armazenamento.progresso {pct} pré-cache em andamento (cache.progresso)
   armazenamento.pronto          pré-cache completo (cache.pronto)
   armazenamento.primeira_visita explicação na primeira visita
   armazenamento.guardar         começa o pré-cache
   armazenamento.guardar_resto   retoma o pré-cache depois de erro
   armazenamento.tamanho {mb}    quanto o mapa ocupa
   armazenamento.guardado_em {data}   data da versão guardada
   armazenamento.atualizar       botão "atualizar mapa" (com nova_versao)
   armazenamento.atualizando     atualização em andamento
   armazenamento.nova_versao     há versão nova
   armazenamento.atualizado      atualização concluída
   armazenamento.sem_sinal       sem internet, mapa guardado
   armazenamento.falhou          erro no pré-cache
   armazenamento.persistencia    persist() negado
   armazenamento.instalar        instalar na tela inicial (Android)
   armazenamento.instalar_iphone instalar no iPhone
   armazenamento.espaco {mb}     falta espaço

   economia.botao                botão do modo economia
   economia.descricao            o que o modo faz
   economia.ligado               anúncio ao ligar
   economia.desligado            anúncio ao desligar

   acessibilidade.titulo         título do bloco
   acessibilidade.contraste      botão data-contraste="sol"
   acessibilidade.contraste_descricao   o que o contraste faz
   acessibilidade.texto_grande   botão data-texto="grande"
   acessibilidade.pular          link "pular para o mapa"
   acessibilidade.menu           botão do menu
   acessibilidade.abrir {nome}   aria-label de abrir um painel
   acessibilidade.fechar {nome}  aria-label de fechar um painel
   acessibilidade.som            botão do som
   acessibilidade.som_ligado     anúncio
   acessibilidade.som_desligado  anúncio
   acessibilidade.movimento      aviso de movimento reduzido
   acessibilidade.mapa           aria-label do mapa

   informacoes.titulo            título do painel Informações
   informacoes.sobre             título do "sobre"
   informacoes.sobre_texto       o que é o mapa
   informacoes.creditos          título dos créditos (atribuicoes.json)
   informacoes.versao {versao}   versão do precache
   informacoes.atualizado {data} data do info.json

   erros.dados                   pontos ou base não carregaram
   erros.mapa                    sem WebGL
   erros.motor                   horas de sol indisponíveis
   erros.gpx                     arquivo não é GPX
   erros.gpx_vazio               GPX sem pontos
   erros.salvar                  IndexedDB recusou
   erros.compartilhar            Web Share com arquivo indisponível
   erros.copiar                  área de transferência recusou
   erros.cartao                  cartão falhou
   erros.fonte_cartao            fonte do cartão não carregou
   erros.link_offline            link externo sem internet
   erros.generico                falha não prevista

   placa.titulo                  título da placa física com QR (recomendado)
   placa.titulo_alternativo      2ª opção de título
   placa.subtitulo               linha abaixo do título
   placa.passos                  3 passos (lista)
   placa.cortesia {parceiro}     quem oferece. A placa só existe com parceiro (textoDaCasa)
   placa.endereco {url}          endereço por extenso, para quem não lê QR
   placa.emergencia              telefones
   placa.selo                    selo Hora da Serra
   placa.credito                 "feito pela Creat"

   marcos.titulo                 título do app particular
   marcos.confirmar              "Estou aqui: confirmar posição"
   marcos.confirmando {s}        média do GPS em andamento
   marcos.confirmado {n} {m}     média concluída
   marcos.precisao_ruim {m}      precisão que o pacote recusa
   marcos.novo_ponto             criar ponto novo
   marcos.pacote                 exportar pacote de atualização
   marcos.pacote_pronto {pontos} {trilhas}   pacote gerado
   marcos.vitrine                título da vitrine
   marcos.trocar_marca           escolher marca
   marcos.rodar_demo             rodar a demonstração da marca
   marcos.qr                     mostrar o QR do parceiro
   marcos.baixar_qr              baixar o QR em PNG
   marcos.caderno                título do caderno de vendas
   marcos.status.<status>        visitar, visitado, interessado, proposta, fechado
   marcos.negocio | marcos.nota | marcos.proximo_passo | marcos.data   campos do caderno
   marcos.exportar_csv           exporta o caderno
   marcos.kit                    título do kit de venda
   marcos.importar_kit           importa o .json do kit
   marcos.kit_ok                 kit guardado
   marcos.kit_invalido           arquivo não é kit
   marcos.pin_criar              1º uso: criar PIN
   marcos.pin_confirmar          repetir PIN
   marcos.pin_errado             PIN errado
   marcos.pin_aviso              o PIN é proteção de uso, não cofre
   marcos.sair_vitrine           como sair da vitrine
   marcos.so_aqui                o que fica só no aparelho
   ===================================================================== */

/* ---------- Vale deste arquivo ---------- */
export const VALE = Object.freeze({ nome: 'Itaitu', municipio: 'Jacobina', uf: 'BA' });

/* ---------- Textos usados em mais de um lugar (uma fonte só) ---------- */
const AVISO_APROXIMADA = 'posição aproximada';
const AVISO_SEM_COORDENADA = 'posição não confirmada: vá com guia';
const CHAMAR_GUIA = 'Chamar um guia';
const CREDITO = 'feito pela Creat';
const CONFIANCA = {
  alta: 'posição conferida em mais de uma fonte',
  media: 'posição de uma fonte só',
  baixa: 'posição estimada',
  'sem-coordenada': 'sem posição no mapa',
};
const TIPOS_DE_PONTO = {
  cachoeira: 'Cachoeira',
  poco: 'Poço',
  vila: 'Vila',
  praca: 'Praça',
  igreja: 'Igreja',
  hospedagem: 'Hospedagem',
  infra: 'Infraestrutura',
  pico: 'Pico',
  area: 'Área',
  mirante: 'Mirante',
  estacionamento: 'Estacionamento',
  'entrada-trilha': 'Entrada de trilha',
  porteira: 'Porteira',
  ponte: 'Ponte',
};

export const T = {
  app: {
    nome: 'Trilhas de Itaitu',
    recurso: 'Hora da Serra',
    credito: CREDITO,
    slogan: 'Todo mapa diz onde. Este diz quando.',
    subtitulo: 'Chegue ao poço com sol e volte com luz, mesmo sem sinal.',
  },

  meta: {
    idioma: 'pt-BR',
    titulo: 'Trilhas de Itaitu: mapa 3D das cachoeiras sem internet',
    titulo_alternativo: 'Cachoeiras de Itaitu: hora do sol em cada poço, sem sinal',
    descricao:
      'Mapa 3D das cachoeiras de Itaitu, Jacobina (BA), que funciona sem sinal. Mostra a hora em que a serra tira o sol de cada poço e quando voltar com luz.',
    og_titulo: 'A hora em que a serra tira o sol de cada cachoeira de Itaitu',
    og_descricao: 'Mapa 3D das cachoeiras que funciona sem sinal. Chegue ao poço com sol e volte com luz.',
    og_tipo: 'website',
    og_local: 'pt_BR',
    og_site: 'Trilhas de Itaitu',
    url: 'https://centroesportivomtt-ui.github.io/Creat-mtt-studio/itaitu/',
    og_imagem: '',
    og_imagem_alt: 'O vale de Itaitu em 3D, com a sombra da serra e a hora do sol em cada cachoeira.',
    twitter_card: 'summary',
    h1: 'Trilhas de Itaitu',
    titulo_marca: '{nome_app} · {parceiro}',
    marcos_titulo: 'Itaitu · Marcos',
    marcos_robots: 'noindex, nofollow',
  },

  abertura: {
    anuncio: 'O resto do dia passa sobre o vale. A sombra da serra cobre cada poço na hora calculada.',
    anuncio_parado: 'Horas de sol de hoje, calculadas pelo relevo.',
    dica_arraste: 'Arraste o sol na régua para ver a sombra da serra andar.',
  },

  regua: {
    rotulo: 'Régua do dia',
    controle: 'Hora na régua do dia',
    dica: 'Arraste o sol para ver a sombra da serra.',
    agora: 'Voltar para agora',
    agora_curto: 'agora',
    inicio: 'nascer do sol',
    fim: 'escurece',
    evento_nascer: 'nascer {hora}',
    evento_por: 'pôr {hora}',
    evento_escurece: 'escurece {hora}',
    janela: 'sol no poço',
    sol: 'sol',
    sombra: 'sombra',
    marca_sol: '{nome}: sol até {hora}',
    marca_sombra: '{nome}: na sombra desde {hora}',
  },

  hora: {
    nota: 'calculado pelo relevo, ±{min} min',
    nublado: 'Em dia nublado, a hora de escurecer continua valendo. A hora de sol é para sol direto.',
    nublado_com_hora: 'Em dia nublado, o “escurece às {escurece}” continua valendo. A hora de sol é para sol direto.',
    amanha: 'amanhã',
    amanha_aviso: 'Hoje a serra já tirou o sol dos poços. As horas na tela são de amanhã.',
    apaga: 'sol no poço até',
    nasce: 'sol chega ao poço',
    saia_ate: 'saia até',
    volte_com_luz: 'volte com luz até',
    escurece: 'escurece às',
    nascer: 'nascer do sol',
    por: 'pôr do sol',
    saindo_agora: 'saindo agora: {min} min de sol no poço',
    sol_foi: 'a serra já tirou o sol deste poço hoje',
    sem_sol: 'sem sol direto no poço hoje',
    sem_tempo: 'tempo de trilha fora da placa: combine com um guia',
    carro_da_placa: 'de carro a partir do Village (placa)',
    indisponivel: 'horas de sol indisponíveis neste aparelho',
    calculando: 'calculando a luz pelo relevo…',
    sombra_cobre: '{hora}, a sombra da serra cobre {o:nome}',
    sol_em: '{hora}, sol {no:nome}',
    faixa_destino: 'para 1 hora de sol {no:nome}',
    faltam_escurecer: 'Faltam {min} min para escurecer.',
    volte_agora: 'Comece a volta agora para sair da trilha com luz.',
    escureceu: 'Já escureceu. Ande devagar, com a lanterna do celular. Emergência: 193.',
    conferida_em_campo: 'hora conferida em campo',
    como_relevo:
      'O app calcula onde o sol está a cada minuto e quando a serra fica na frente dele, para cada poço com posição confirmada.',
    como_saia:
      'Conta do “saia até”: a hora em que a serra apaga o sol, menos 1 hora de sol, menos o tempo de carro e o tempo mais lento de trilha da placa.',
    como_volte:
      'Conta do “volte com luz”: a hora de escurecer, menos o tempo mais lento de trilha da placa, menos 30 min de folga.',
    como_arredonda:
      'As horas aparecem de 5 em 5 minutos, arredondadas para o lado seguro: o sol some um pouco antes e chega um pouco depois do que a conta dá.',
    como_incerteza:
      'A margem é de 10 min quando a posição do poço foi conferida em mais de uma fonte e de 15 min quando vem de uma fonte só.',
    frase_apaga: 'A serra apaga o sol {do:nome} às {hora}.',
    frase_apaga_amanha: 'Amanhã, a serra apaga o sol {do:nome} às {hora}.',
    frase_apagou: 'A serra apagou o sol {do:nome} às {hora}.',
    frase_sem_sol: 'Hoje o sol direto não chega {ao:nome}.',
    frase_sem_sol_amanha: 'Amanhã o sol direto não chega {ao:nome}.',
    frase_saia: 'Para ter {sol} de sol {no:nome}, saia até {hora}.',
    frase_saia_amanha: 'Amanhã, para ter {sol} de sol {no:nome}, saia até {hora}.',
    frase_saia_poco: 'Para ter {sol} de sol no poço, saia até {hora}.',
    frase_saindo_agora: 'Saindo agora, ainda dá para ter {sol} de sol {no:nome}.',
    frase_sem_tempo_hoje: 'Hoje não dá mais tempo de chegar {ao:nome} com sol.',
    frase_sem_tempo_hoje_apaga: 'Hoje não dá mais tempo de chegar {ao:nome} com sol: a serra apaga o sol às {hora}.',
    frase_volte: 'Escurece às {escurece}. Para voltar com luz, saia do poço até {volte}.',
    frase_escurece: 'Escurece às {escurece}.',
    frase_volte_so: 'Para voltar com luz, saia do poço até {volte}.',
    aria_sombra: 'a sombra da serra cobre {lista}',
    aria_sol: 'sol {lista}',
    aria_sem_sol: 'sem sol direto hoje {lista}',
    aria_noite: 'já escureceu',
  },

  tabuas: {
    titulo_placa: 'Cachoeiras da placa',
    titulo_outros: 'Outros lugares',
    lista: 'Destinos, com a hora de sol de cada poço',
    placa_linha: '{carro} de carro · {km} km de trilha · {trilha} · {nivel}',
    da_placa: 'Distâncias e tempos da placa: aproximados, mudam com a estrada e a trilha.',
    confirmada: 'posição confirmada',
    aproximada: AVISO_APROXIMADA,
    aproximada_detalhe: 'Sem hora de sol até a posição ser confirmada no local.',
    sem_coordenada: AVISO_SEM_COORDENADA,
    sem_coordenada_detalhe: 'Ainda fora do mapa. Distância e tempo vêm da placa.',
    chamar_guia: CHAMAR_GUIA,
    chamar_guia_dica: 'Combine ainda na vila, onde o celular pega.',
    fincada: 'fincada pela ACAGI',
    fincada_por: 'fincada {pelo:quem}',
    ver_no_mapa: 'Ver no mapa',
    seguir_ate: 'Levar o GPS até aqui',
    taxa: 'taxa',
    horario: 'horário',
    riscos: 'atenção',
    nivel: 'nível',
    outros_nomes: 'outros nomes: {nomes}',
    fonte: 'fonte da posição: {fonte}',
    conferir: 'conferir no local',
    confianca: CONFIANCA,
    vazia: 'Nenhum destino carregou. Com sinal, recarregue a página.',
  },

  faixa: {
    rotulo: 'saia até',
    destino: 'para 1 hora de sol {no:nome}',
    saindo_agora: 'saindo agora',
    saindo_agora_destino: '{min} min de sol {no:nome}',
    amanha: 'amanhã',
    aria: 'Saia até {hora} para ter 1 hora de sol {no:nome}.',
    esconder: 'Esconder a faixa',
  },

  cartao: {
    titulo: 'Seu cartão da trilha está pronto',
    gerando: 'Desenhando o relevo com a luz da sua chegada…',
    frase: 'Cheguei {chegada} · a serra apaga o sol {apaga} · {min} min de sol no poço',
    frase_sombra: 'Cheguei {chegada} · a serra apagou o sol {apaga} · poço na sombra da serra',
    frase_sem_hora: 'Cheguei {chegada}',
    frase_sem_minutos: 'Cheguei {chegada} · a serra apaga o sol {apaga}',
    chegada_rotulo: 'cheguei',
    apaga_rotulo: 'a serra apaga o sol',
    linha_sol: '{min} min de sol no poço',
    linha_sombra: 'poço na sombra da serra',
    numeros: '{km} km de trilha · {tempo} · subida de {sobe} m',
    rotulo_trilha: 'trilha',
    rotulo_tempo: 'tempo',
    rotulo_desnivel: 'desnível',
    valor_km: '{km} km',
    valor_desnivel: '+{m} m',
    selo: 'Hora da Serra',
    selo_janela: '{ini}–{fim}',
    selo_sem_hora: 'sem hora de sol',
    luz_real: 'luz real de {data} às {hora}',
    pe: '{nome_app} · Hora da Serra',
    slogan_linhas: ['O mapa que diz quando:', 'chegar com sol,', 'voltar com luz.'],
    cortesia: 'mapa cortesia {do:parceiro}',
    credito: CREDITO,
    sem_destino: 'trilha em Itaitu',
    compartilhar: 'Compartilhar cartão',
    baixar: 'Salvar imagem',
    compartilhado: 'Pronto. Marque {casa} no story.',
    compartilhado_sem_casa: 'Pronto. Cartão compartilhado.',
    legenda_titulo: 'Escolha a legenda',
    legenda_copiada: 'Legenda copiada. Cole no post e marque {casa}.',
    legenda_copiada_sem_casa: 'Legenda copiada. Cole no post.',
    sem_sinal: 'Sem sinal agora. Salve o cartão e poste quando voltar à vila.',
    alt: 'Cartão da trilha: relevo com o traçado, a hora da chegada e a janela de sol no poço.',
    fechar: 'Fechar',
    hashtags: '#Itaitu #Jacobina #Bahia',
    legendas: [
      { n: 6, molde: 'A serra apaga o sol {do:cachoeira} às {apaga}. Eu sabia e cheguei com sol no poço.', curta: 'Cheguei com sol no poço.' },
      { n: 1, molde: 'Onde o sinal acaba, Itaitu começa. Hoje foi dia de {cachoeira}.', sem_destino: 'Onde o sinal acaba, Itaitu começa. Hoje foi dia de trilha.', curta: 'Onde o sinal acaba, Itaitu começa.' },
      { n: 2, molde: '{distancia} de trilha, {subida} de subida e uma recompensa chamada {cachoeira}.', sem_subida: '{distancia} de trilha e uma recompensa chamada {cachoeira}.', curta: 'Cada passo valeu.' },
      { n: 3, molde: 'Itaitu tem mais de 40 cachoeiras. Hoje risquei da lista: {cachoeira}.', curta: 'Itaitu tem mais de 40 cachoeiras.' },
      { n: 4, molde: 'Fui e voltei sem um pingo de sinal. {cachoeira}, Itaitu.', sem_destino: 'Fui e voltei sem um pingo de sinal. Itaitu, Bahia.', curta: 'Fui e voltei sem um pingo de sinal.' },
      { n: 5, molde: 'Na trilha não pega sinal, mas Itaitu pega de jeito. {cachoeira}.', sem_destino: 'Na trilha não pega sinal, mas Itaitu pega de jeito.', curta: 'Na trilha não pega sinal, mas Itaitu pega de jeito.' },
    ],
  },

  demo: {
    selo: 'demonstração',
    sair: 'Sair da demonstração',
    pausar: 'Pausar demonstração',
    continuar: 'Continuar demonstração',
    fase1: 'O resto do dia passa sobre o vale. A sombra sai do relevo, minuto a minuto.',
    fase2: '{nome}: sol no poço até {hora}',
    fase3: 'Trilha simulada para a demonstração. Na trilha de verdade, o GPS grava o seu caminho.',
    fase4: 'O cartão sai com a luz da chegada e a marca da casa.',
    fase4_sem_casa: 'O cartão sai com a luz real da chegada. Pronto para o story.',
    fim: 'Fim da demonstração.',
    vitrine: 'Na demonstração, WhatsApp e links para fora do app ficam desligados. As ligações de emergência continuam valendo.',
    vitrine_curto: 'na demonstração',
    vitrine_sos: 'Isto é a demonstração. Toque de novo em até 5 segundos para {acao} de verdade.',
    vitrine_acao_ligar: 'ligar para o {numero}',
    vitrine_acao_sms: 'mandar o SMS',
  },

  destinos: {
    titulo: 'Cachoeiras de Itaitu',
    buscar: 'Buscar cachoeira ou lugar',
    buscar_rotulo: 'Buscar por nome',
    sem_resultado: 'Nada com “{termo}”. Tente parte do nome, como “Véu”.',
    grupo_placa: 'Cachoeiras da placa',
    grupo_outros: 'Outros lugares',
    carro: 'de carro',
    trilha: 'de trilha',
    nivel: 'nível',
    taxa: 'taxa',
    horario: 'horário',
    riscos: 'atenção',
    notas: 'notas',
    outros_nomes: 'outros nomes: {nomes}',
    confianca: 'posição',
    confianca_niveis: CONFIANCA,
    fonte: 'fonte: {fonte}',
    aproximada: AVISO_APROXIMADA,
    sem_coordenada: AVISO_SEM_COORDENADA,
    so_na_lista: 'Este lugar ainda não tem posição no mapa: aparece só na lista.',
    fechar: 'Fechar detalhes',
  },

  marca: {
    falar: 'Falar com a recepção',
    falar_rotulo: 'Falar com a recepção pelo WhatsApp',
    instagram: 'Ver o Instagram',
    tipos: { guia: 'Guias', 'onde-comer': 'Onde comer', hospedagem: 'Onde ficar', outro: 'Mais em Itaitu' },
    ver_no_mapa: 'Ver no mapa',
    abrir: 'Abrir {nome}',
    precisa_sinal: 'Abre com internet: use na vila.',
    cortesia: 'Mapa cortesia {do:parceiro}',
    credito: CREDITO,
  },

  gps: {
    ligar: 'Mostrar onde estou',
    seguir: 'Seguir minha posição',
    parar_seguir: 'Parar de seguir',
    procurando: 'Procurando o GPS. Em céu aberto é mais rápido.',
    precisao: 'precisão de {m} m',
    precisao_ruim: 'GPS fraco: precisão de {m} m. Vá para céu aberto e espere um pouco.',
    negado:
      'A localização está bloqueada para esta página. Libere nas configurações do navegador e toque em Mostrar onde estou.',
    indisponivel: 'Este aparelho não informou a posição. Confira se a localização está ligada.',
    demorou: 'O GPS demorou para responder. Vá para céu aberto e toque em Mostrar onde estou.',
    bussola: 'Usar a bússola do celular',
    bussola_negada: 'Sem acesso à bússola. O mapa fica com o norte para cima.',
    ate_destino: '{dist} até {o:nome}',
    em_linha_reta: '{dist} em linha reta',
    pela_trilha: '{dist} pela trilha',
    rumo: 'rumo {rumo}',
    tempo: 'cerca de {tempo}',
    linha_reta: 'direção em linha reta, não é o caminho',
    sem_tracado: 'Sem traçado desta trilha no mapa. Siga a placa e, na dúvida, vá com guia.',
    fora_da_trilha: 'Você está a {m} m da trilha. Volte para o traçado.',
    de_volta: 'De volta à trilha.',
    chegou: 'Você chegou {ao:nome}.',
    destino: 'Destino: {nome}',
    tirar_destino: 'Tirar o destino',
    rumos: ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'],
    rumos_curtos: ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'],
  },

  gravador: {
    titulo: 'Gravar trilha',
    gravar: 'Gravar trilha',
    pausar: 'Pausar',
    continuar: 'Continuar gravando',
    parar: 'Parar e salvar',
    gravando: 'Gravando: {km} km · {tempo}',
    pausada: 'Gravação pausada',
    pausa_auto: 'Pausado porque você parou. Volta a gravar quando você andar.',
    aviso_tela:
      'Página web não grava com a tela bloqueada. Deixe a tela acesa: o fundo fica quase preto para poupar bateria.',
    tela_acesa_falhou:
      'Este navegador não mantém a tela acesa sozinho. Desligue o bloqueio automático da tela enquanto grava.',
    trava: 'Tela travada contra toque no bolso.',
    destravar: 'Toque e segure para destravar',
    recuperada: 'Gravação recuperada. Ela continua de onde parou.',
    nome: 'Nome da trilha',
    nome_padrao: 'Trilha de {data}',
    destino: 'Destino da trilha',
    sem_destino: 'Sem destino',
    salvar: 'Salvar trilha',
    salva: 'Trilha salva neste celular.',
    descartar: 'Descartar gravação',
    descartar_pergunta: 'Descartar esta gravação? O traçado se perde.',
    manter_gravacao: 'Manter gravação',
    exportar_gpx: 'Exportar GPX',
    importar_gpx: 'Importar GPX',
    importar_ajuda: 'Escolha um arquivo .gpx do celular, como um baixado do Wikiloc.',
    importada: 'Trilha “{nome}” importada. Ela fica no celular e funciona sem internet.',
    minhas_trilhas: 'Minhas trilhas',
    vazia: 'Nenhuma trilha gravada ainda. Toque em Gravar trilha quando sair para a cachoeira.',
    apagar: 'Apagar trilha',
    apagar_pergunta: 'Apagar a trilha “{nome}”? Não dá para desfazer.',
    manter: 'Manter trilha',
    resumo: '{km} km · {tempo} · subida de {sobe} m',
    passagem: 'Marcar passagem',
    gerar_cartao: 'Gerar cartão da trilha',
    inicio: 'início {hora}',
    fim: 'fim {hora}',
  },

  marcar: {
    botao: 'Marcar ponto aqui',
    aguardando_gps: 'aguardando o GPS',
    precisao: 'precisão de {m} m',
    precisao_ruim: 'Precisão de {m} m: o ponto fica marcado como aproximado.',
    titulo: 'Marcar ponto',
    nome: 'Nome do ponto',
    nome_ajuda: 'Até 60 letras. Exemplo: Porteira do Coxinho.',
    nome_obrigatorio: 'Dê um nome ao ponto para salvar.',
    tipo: 'Tipo',
    nota: 'Nota',
    nota_ajuda: 'Até 280 letras: o que alguém precisa saber neste ponto.',
    salvar: 'Salvar ponto',
    cancelar: 'Cancelar',
    salvo: 'Ponto salvo neste celular.',
    meus_pontos: 'Meus pontos',
    vazio: 'Nenhum ponto marcado. Toque em Marcar ponto aqui quando estiver no lugar.',
    exportar_geojson: 'Exportar GeoJSON',
    exportar_gpx: 'Exportar GPX',
    apagar: 'Apagar ponto',
    apagar_pergunta: 'Apagar o ponto “{nome}”? Não dá para desfazer.',
    manter: 'Manter ponto',
    do_toque: 'Marcado pelo toque no mapa: fica como aproximado.',
    so_neste_celular: 'Seus pontos ficam só neste celular.',
    tipos: TIPOS_DE_PONTO,
  },

  perfil: {
    titulo: 'Perfil de altitude',
    indisponivel: 'Perfil de altitude indisponível agora.',
    do_relevo: 'altitude do relevo, ~37 m por pixel',
    do_gps: 'altitude do GPS',
    resumo: 'sobe {sobe} m, desce {desce} m, de {min} a {max} m de altitude',
    voce_esta_aqui: 'você está aqui',
  },

  mapa: {
    toque_copiar: 'Copiar coordenada',
    coord_centro: 'Coordenada do centro do mapa',
    copiada: 'Coordenada copiada.',
    copiar_manual: 'Selecione o texto e copie.',
    altitude: 'altitude {m} m',
    distancia_voce: 'a {dist} de você',
    marcar: 'Marcar ponto aqui',
    fechar: 'Fechar',
    modo_3d: '3D',
    modo_2d: '2D',
    modo_3d_rotulo: 'Ver o mapa em 3D',
    modo_2d_rotulo: 'Ver o mapa em 2D',
    satelite: 'Satélite',
    relevo: 'Relevo',
    satelite_rotulo: 'Ver a foto de satélite de 2016',
    relevo_rotulo: 'Ver o relevo aceso pelo sol de agora',
    satelite_nota: 'Foto de satélite de 2016: as sombras dela são de outro dia.',
    norte: 'Norte',
    norte_rotulo: 'Voltar o norte para cima',
    aproximar: 'Aproximar',
    afastar: 'Afastar',
    creditos: 'Créditos do mapa',
  },

  sos: {
    botao: 'SOS',
    botao_rotulo: 'SOS: ver minha posição e ligar para a emergência',
    titulo: 'Sua posição agora',
    decimal: 'graus decimais',
    gms: 'graus, minutos e segundos',
    precisao: 'precisão de {m} m',
    hora: 'posição das {hora}',
    sem_posicao: 'Ainda sem posição do GPS. Vá para céu aberto e espere. A ligação funciona sem a posição.',
    sms: 'Enviar minha posição por SMS',
    sms_dica: 'SMS às vezes passa onde a internet não passa.',
    ligar_193: 'Ligar 193 · Bombeiros',
    ligar_192: 'Ligar 192 · SAMU',
    ligar_190: 'Ligar 190 · Polícia',
    o_que_dizer: 'Na ligação, diga: Itaitu, Jacobina, Bahia. Depois leia a coordenada devagar.',
    sem_sinal: 'A ligação não completou? Mande o SMS também: às vezes ele passa.',
    fechar: 'Fechar',
  },

  seguranca: {
    titulo: 'Segurança e emergência',
    antes_de_sair: 'Antes de sair',
    emergencia: 'Emergência',
    ligar: 'Ligar {numero} · {nome}',
    guias: 'Guias de Itaitu',
    guias_dica: 'Fale com a ACAGI pelo Instagram @guiasdeitaitu, ainda na vila, onde o celular pega.',
    melhor_epoca: 'Melhor época',
    taxas: 'Taxas',
    horarios: 'Horários',
    acesso: 'Como chegar',
    fonte: 'fonte: {fonte}',
    quando: 'informação de {quando}',
    conferir: 'conferir no local',
    nao_confirmado: 'não confirmado',
    desatualizado: 'pode estar desatualizado',
    volte_antes: 'Volte antes de escurecer.',
    nao_substitui: 'O mapa ajuda, mas não substitui o guia.',
    bateria: 'Saia com a bateria cheia.',
  },

  armazenamento: {
    progresso: 'Guardando o mapa no celular: {pct}%',
    pronto: 'Pronto para usar sem internet',
    primeira_visita: 'Fique no Wi-Fi até aparecer “Pronto para usar sem internet”. Depois o mapa abre sem sinal.',
    guardar: 'Guardar o mapa no celular',
    guardar_resto: 'Guardar o que faltou',
    tamanho: 'O mapa ocupa {mb} MB neste celular.',
    guardado_em: 'Mapa guardado em {data}.',
    atualizar: 'Atualizar mapa',
    atualizando: 'Atualizando. O mapa de agora continua funcionando até terminar.',
    nova_versao: 'Há uma versão nova do mapa. Atualize quando tiver sinal.',
    atualizado: 'Mapa atualizado.',
    sem_sinal: 'Sem internet agora. O mapa guardado continua funcionando.',
    falhou: 'Parte do mapa não foi guardada porque a conexão caiu. Com sinal, toque em Guardar o que faltou.',
    persistencia: 'O navegador pode apagar o mapa se faltar espaço no celular. Instale na tela inicial para proteger o mapa.',
    instalar: 'Instalar na tela inicial',
    instalar_iphone: 'No iPhone: toque em Compartilhar e depois em Adicionar à Tela de Início.',
    espaco: 'Falta espaço no celular para guardar o mapa. Libere cerca de {mb} MB e toque em Guardar o que faltou.',
  },

  economia: {
    botao: 'Modo economia',
    descricao: 'Mapa em 2D, sem animação e sem som. As horas continuam na tela.',
    ligado: 'Modo economia ligado.',
    desligado: 'Modo economia desligado.',
  },

  acessibilidade: {
    titulo: 'Leitura e contraste',
    contraste: 'Contraste para sol forte',
    contraste_descricao: 'Preto e branco puros, para ler sob sol forte.',
    texto_grande: 'Texto grande',
    pular: 'Pular para o mapa',
    menu: 'Menu',
    abrir: 'Abrir {nome}',
    fechar: 'Fechar {nome}',
    som: 'Som',
    som_ligado: 'Som ligado.',
    som_desligado: 'Som desligado.',
    movimento: 'Movimento reduzido: o dia não corre e os voos viram saltos.',
    mapa: 'Mapa 3D do vale de Itaitu',
  },

  informacoes: {
    titulo: 'Informações',
    sobre: 'Sobre o mapa',
    sobre_texto:
      'Mapa 3D do vale, com relevo, ruas e rios. A hora de sol de cada poço é calculada no próprio celular, pelo relevo, sem internet.',
    creditos: 'Créditos do mapa',
    versao: 'versão do mapa {versao}',
    atualizado: 'informações práticas de {data}',
  },

  erros: {
    dados: 'Os dados do mapa não carregaram. Com sinal, recarregue a página.',
    mapa: 'Este navegador não consegue desenhar o mapa. Abra o link no Chrome ou no Safari atualizado.',
    motor: 'Horas de sol indisponíveis neste aparelho. O mapa e o GPS funcionam normalmente.',
    gpx: 'Este arquivo não é um GPX que o app consiga ler. Escolha um .gpx com trilha ou pontos.',
    gpx_vazio: 'Este GPX não tem nenhum ponto. Escolha outro arquivo.',
    salvar: 'O celular não deixou salvar. Libere espaço e tente de novo.',
    compartilhar: 'Este celular não compartilha imagem por aqui. Toque em Salvar imagem.',
    copiar: 'Não deu para copiar. Toque e segure no texto para copiar.',
    cartao: 'O cartão não ficou pronto. Toque em Gerar cartão da trilha de novo.',
    fonte_cartao: 'A letra do cartão não carregou. O cartão sai com a letra do celular.',
    link_offline: 'Sem internet agora. Este botão abre quando o celular pegar sinal.',
    generico: 'Algo não funcionou aqui. Recarregue a página: o mapa guardado continua no celular.',
  },

  placa: {
    titulo: 'Aponte a câmera: esta placa vai com você.',
    titulo_alternativo: 'O sinal acaba na saída da vila. O mapa, não.',
    subtitulo: 'A hora em que a serra tira o sol de cada cachoeira, no seu celular. Funciona sem sinal.',
    passos: [
      'Com o Wi-Fi da casa, aponte a câmera para o QR.',
      'Espere aparecer “Pronto para usar sem internet”.',
      'Na trilha, abra pelo ícone. Funciona sem sinal.',
    ],
    cortesia: 'Cortesia {do:parceiro}. Sem cadastro e sem loja de aplicativos.',
    endereco: 'Ou digite: {url}',
    emergencia: 'Emergência: 192 SAMU · 193 Bombeiros · 190 Polícia',
    selo: 'Hora da Serra',
    credito: CREDITO,
  },

  marcos: {
    titulo: 'Itaitu · Marcos',
    confirmar: 'Estou aqui: confirmar posição',
    confirmando: 'Fazendo a média do GPS: {s} s. Fique parado.',
    confirmado: 'Posição confirmada: {n} leituras, precisão de {m} m.',
    precisao_ruim: 'Precisão de {m} m: acima de 30 m o pacote recusa. Vá para céu aberto e repita.',
    novo_ponto: 'Criar ponto novo',
    pacote: 'Exportar pacote de atualização',
    pacote_pronto: 'Pacote pronto: {pontos} pontos e {trilhas} trilhas.',
    vitrine: 'Vitrine',
    trocar_marca: 'Trocar de marca',
    rodar_demo: 'Rodar demonstração',
    qr: 'Mostrar QR do parceiro',
    baixar_qr: 'Baixar QR em PNG',
    caderno: 'Caderno de vendas',
    status: { visitar: 'visitar', visitado: 'visitado', interessado: 'interessado', proposta: 'proposta', fechado: 'fechado' },
    negocio: 'Negócio',
    nota: 'Nota',
    proximo_passo: 'Próximo passo',
    data: 'Data',
    exportar_csv: 'Exportar CSV',
    kit: 'Kit de venda',
    importar_kit: 'Importar kit',
    kit_ok: 'Kit guardado neste celular.',
    kit_invalido: 'Este arquivo não é um kit de venda. Escolha o .json do kit (formato itaitu-kit, versão 1).',
    pin_criar: 'Crie um PIN de 4 dígitos para travar a vitrine.',
    pin_confirmar: 'Digite o PIN de novo.',
    pin_errado: 'PIN errado. Tente de novo.',
    pin_aviso: 'O PIN é proteção de uso, não cofre: impede que alguém saia da vitrine sem querer.',
    sair_vitrine: 'Toque e segure para sair da vitrine',
    so_aqui: 'Fica só neste celular. Nada vai para a internet.',
  },
};

/* ---------- Apelidos de namespace (mesmo objeto, dois nomes) ---------- */
const APELIDOS = [
  ['tabua', 'tabuas'],
  ['gravar', 'gravador'],
  ['cache', 'armazenamento'],
  ['rota', 'gps'],
];
for (const [apelido, real] of APELIDOS) {
  Object.defineProperty(T, apelido, { value: T[real], enumerable: false, writable: true, configurable: true });
}

/* ---------- Busca e troca ---------- */
const temProprio = (obj, chave) => Object.prototype.hasOwnProperty.call(obj, chave);

function buscar(chave) {
  if (typeof chave !== 'string' || !chave) return undefined;
  let no = T;
  for (const parte of chave.split('.')) {
    if (no === null || typeof no !== 'object' || !temProprio(no, parte)) return undefined;
    no = no[parte];
  }
  return no;
}

function definir(chave, valor) {
  const partes = chave.split('.');
  const ultima = partes.pop();
  const pai = buscar(partes.join('.'));
  if (pai && typeof pai === 'object') pai[ultima] = valor;
}

const avisados = new Set();
function avisarUmaVez(id, mensagem) {
  if (avisados.has(id)) return;
  avisados.add(id);
  try {
    if (typeof console !== 'undefined' && typeof console.info === 'function') console.info(`[textos] ${mensagem}`);
  } catch {
    /* sem console: segue */
  }
}

const VAR = /\{(?:(o|do|no|ao|pelo):)?([A-Za-z_][A-Za-z0-9_]*)\}/g;

function preencher(texto, vars, chave) {
  const valores = vars && typeof vars === 'object' ? vars : {};
  return texto.replace(VAR, (inteiro, forma, nome) => {
    const v = valores[nome];
    if (v === undefined || v === null || v === '') {
      avisarUmaVez(`${chave}|${nome}`, `falta {${nome}} em "${chave}"`);
      return inteiro;
    }
    const s = String(v);
    return forma ? comArtigo(forma, s) : s;
  });
}

/** Texto da chave com as variáveis trocadas. Chave ausente: provisorio ?? chave. */
export function t(chave, vars = {}, provisorio) {
  const valor = buscar(chave);
  if (typeof valor === 'string') return preencher(valor, vars, chave);
  avisarUmaVez(`chave|${chave}`, `chave sem texto: "${chave}"`);
  return preencher(String(provisorio ?? chave), vars, chave);
}

/* Chaves com ponto também em T: T['hora.nota'] lê o mesmo que T.hora.nota. */
(function ligarChavesComPonto() {
  const percorrer = (obj, prefixo) => {
    for (const k of Object.keys(obj)) {
      const caminho = `${prefixo}.${k}`;
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) percorrer(v, caminho);
      else if (!temProprio(T, caminho)) {
        Object.defineProperty(T, caminho, {
          get: () => buscar(caminho),
          set: (novo) => definir(caminho, novo),
          enumerable: false,
          configurable: true,
        });
      }
    }
  };
  for (const ns of Object.keys(T)) percorrer(T[ns], ns);
  for (const [apelido, real] of APELIDOS) percorrer(T[real], apelido);
})();

/* ---------- Artigo e gênero ---------- */
// ms: o · fs: a · mp: os · fp: as · '': sem artigo (nome de cidade, @perfil)
const GENERO = {
  veu: 'ms', 'veu da noiva': 'ms', arapongas: 'fp', coxinho: 'ms', flores: 'fp', sossego: 'ms',
  geladeira: 'fs', pianco: 'ms', urubu: 'ms', santuario: 'ms', indios: 'mp', andorinhas: 'fp',
  riachinho: 'ms', sonhos: 'mp', acagi: 'fs',
  cachoeira: 'fs', poco: 'ms', pico: 'ms', mirante: 'ms', vila: 'fs', praca: 'fs', igreja: 'fs',
  torre: 'fs', parque: 'ms', entrada: 'fs', ponto: 'ms', trilha: 'fs', village: 'ms', camping: 'ms',
  pousada: 'fs', hotel: 'ms', chale: 'ms', estacionamento: 'ms', porteira: 'fs', ponte: 'fs',
  fonte: 'fs', nascente: 'fs', passagem: 'fs', serra: 'fs', recepcao: 'fs',
  itaitu: '', jacobina: '',
};
const FORMAS = {
  o: { ms: 'o', fs: 'a', mp: 'os', fp: 'as', '': '' },
  do: { ms: 'do', fs: 'da', mp: 'dos', fp: 'das', '': 'de' },
  no: { ms: 'no', fs: 'na', mp: 'nos', fp: 'nas', '': 'em' },
  ao: { ms: 'ao', fs: 'à', mp: 'aos', fp: 'às', '': 'a' },
  pelo: { ms: 'pelo', fs: 'pela', mp: 'pelos', fp: 'pelas', '': 'por' },
};

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpo = (s) => (typeof s === 'string' ? s.trim() : s === null || s === undefined ? '' : String(s).trim());

function generoDe(nome) {
  const base = semAcento(nome).toLowerCase().trim();
  if (!base || base.startsWith('@')) return '';
  if (temProprio(GENERO, base)) return GENERO[base];
  const primeira = base.split(/[\s,·:()-]+/)[0];
  if (temProprio(GENERO, primeira)) return GENERO[primeira];
  if (/as$/.test(primeira)) return 'fp';
  if (/(os|es)$/.test(primeira)) return 'mp';
  if (/a$/.test(primeira)) return 'fs';
  return 'ms';
}

/** comArtigo('do', 'Arapongas') -> 'das Arapongas'. Forma: 'o' | 'do' | 'no' | 'ao' | 'pelo'. */
export function comArtigo(forma, nome) {
  const n = limpo(nome);
  if (!n) return '';
  const tabela = FORMAS[forma];
  if (!tabela) return n;
  const artigo = tabela[generoDe(n)];
  return artigo ? `${artigo} ${n}` : n;
}

/* ---------- Números e tempo ---------- */
const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 1.32 -> '1,3' (casas = 1). Vazio ou inválido -> ''. */
export function numeroBR(valor, casas = 1) {
  const n = num(valor);
  if (n === null) return '';
  return n.toFixed(Math.max(0, Math.min(6, casas | 0))).replace('.', ',');
}

/** 25 -> '25 min' · 60 -> '1 hora' · 90 -> '1 h 30 min' · 120 -> '2 horas'. */
export function duracaoTexto(min) {
  const n = num(min);
  if (n === null || n < 0) return '';
  const m = Math.round(n);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  if (resto === 0) return h === 1 ? '1 hora' : `${h} horas`;
  return `${h} h ${resto} min`;
}

const paraMinutos = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(limpo(hhmm));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Tempo e distância que não quebram no fim da linha (pedido do DESIGN.md, 6):
 * '≈ 30 min' e '2 km' ganham espaço que não quebra (U+00A0); '30–40' ganha
 * U+2060 depois do traço, para não partir em '30–' / '40' no texto grande.
 */
export function semQuebra(texto) {
  return limpo(texto)
    .replace(/≈ /g, '≈ ')
    .replace(/(\d) (min|h|km|m)\b/g, '$1 $2')
    .replace(/\bh (\d)/g, 'h $1')
    .replace(/(\d)–(\d)/g, '$1–⁠$2');
}

/**
 * Linha da placa na tábua: só junta o que existe. Cada trecho sai com
 * semQuebra; a linha só quebra entre trechos, no ' · '.
 * { semQuebra: false } devolve com espaços comuns (para comparar em teste).
 */
export function linhaDaPlaca({ carro_tempo, trilha_km, trilha_tempo, nivel } = {}, { semQuebra: travar = true } = {}) {
  const partes = [];
  if (limpo(carro_tempo)) partes.push(`${limpo(carro_tempo)} de carro`);
  const km = num(trilha_km);
  if (km !== null) partes.push(`${Number.isInteger(km) ? String(km) : numeroBR(km, 1)} km de trilha`);
  if (limpo(trilha_tempo)) partes.push(limpo(trilha_tempo));
  if (limpo(nivel)) partes.push(limpo(nivel));
  return partes.map((p) => (travar ? semQuebra(p) : p)).join(' · ');
}

/** 250 -> 'oeste'. Azimute em graus, 0 = norte, sentido horário. */
export function rumoTexto(graus) {
  const n = num(graus);
  if (n === null) return '';
  const g = ((n % 360) + 360) % 360;
  return T.gps.rumos[Math.round(g / 45) % 8];
}

/* ---------- Nomes curtos ---------- */
const NOMES_CURTOS = {
  'cachoeira-veu-da-noiva': 'Véu', veu: 'Véu',
  'cachoeira-das-arapongas': 'Arapongas', arapongas: 'Arapongas',
  'cachoeira-do-coxinho': 'Coxinho', coxinho: 'Coxinho',
  'cachoeira-das-flores': 'Flores', flores: 'Flores',
  'cachoeira-do-sossego': 'Sossego', sossego: 'Sossego',
  'poco-da-geladeira': 'Geladeira', geladeira: 'Geladeira',
  'cachoeira-do-pianco': 'Piancó', pianco: 'Piancó',
  'cachoeira-do-urubu': 'Urubu', urubu: 'Urubu',
  'cachoeira-do-santuario': 'Santuário', santuario: 'Santuário',
  'cachoeira-dos-indios': 'Índios', indios: 'Índios',
  'cachoeira-das-andorinhas': 'Andorinhas', andorinhas: 'Andorinhas',
  'cachoeira-do-riachinho': 'Riachinho', riachinho: 'Riachinho',
  'cachoeira-dos-sonhos': 'Sonhos', sonhos: 'Sonhos',
};

/** nomeCurto('cachoeira-veu-da-noiva', 'Cachoeira Véu da Noiva') -> 'Véu'. Fora do mapa: o nome inteiro. */
export function nomeCurto(id, nome) {
  const chave = limpo(id).toLowerCase();
  if (chave && temProprio(NOMES_CURTOS, chave)) return NOMES_CURTOS[chave];
  return limpo(nome);
}

/* ---------- Constantes de honestidade ---------- */
export const notaCalculo = t('hora.nota', { min: 10 });
export const notaNublado = T.hora.nublado;
export const avisoSemCoordenada = AVISO_SEM_COORDENADA;
export const avisoAproximada = AVISO_APROXIMADA;
export const textoAmanha = T.hora.amanha_aviso;

/** 'calculado pelo relevo, ±{min} min'. Passe incertezaMin(ponto): 10 (alta) ou 15 (media). */
export function notaDeCalculo(min = 10) {
  const n = num(min);
  return t('hora.nota', { min: n === null ? 10 : Math.round(n) });
}

/* ---------- Frases da Hora da Serra ---------- */
const nomeOuPoco = (nome) => limpo(nome) || 'poço';

/** 'A serra apaga o sol do Véu às 16:05.' */
export function fraseApaga({ nomeCurto: nome, apagaHHMM, amanha = false, passou = false } = {}) {
  const n = nomeOuPoco(nome);
  const hora = limpo(apagaHHMM);
  if (!hora) return t(amanha ? 'hora.frase_sem_sol_amanha' : 'hora.frase_sem_sol', { nome: n });
  if (amanha) return t('hora.frase_apaga_amanha', { nome: n, hora });
  return t(passou ? 'hora.frase_apagou' : 'hora.frase_apaga', { nome: n, hora });
}

/** 'Para ter 1 hora de sol no Véu, saia até 14:30.' (fica de pé sozinha) */
export function fraseSaiaAte({ nomeCurto: nome, apagaHHMM, saiaHHMM, minutosDeSol, amanha = false } = {}) {
  const n = nomeOuPoco(nome);
  const saia = limpo(saiaHHMM);
  const apaga = limpo(apagaHHMM);
  const sol = num(minutosDeSol);
  if (saia) {
    const quanto = duracaoTexto(sol !== null && sol > 0 ? sol : 60);
    return t(amanha ? 'hora.frase_saia_amanha' : 'hora.frase_saia', { sol: quanto, nome: n, hora: saia });
  }
  if (sol !== null && sol > 0) return t('hora.frase_saindo_agora', { sol: duracaoTexto(sol), nome: n });
  if (apaga) return t('hora.frase_sem_tempo_hoje_apaga', { nome: n, hora: apaga });
  return t('hora.frase_sem_tempo_hoje', { nome: n });
}

/** A frase dos 5 segundos: 'A serra apaga o sol do Véu às 16:05. Para ter 1 hora de sol no poço, saia até 14:30.' */
export function fraseDaHora({ nomeCurto: nome, apagaHHMM, saiaHHMM, minutosDeSol, amanha = false } = {}) {
  const primeira = fraseApaga({ nomeCurto: nome, apagaHHMM, amanha });
  const saia = limpo(saiaHHMM);
  if (!limpo(apagaHHMM) || !saia) return primeira;
  const sol = num(minutosDeSol);
  return `${primeira} ${t('hora.frase_saia_poco', { sol: duracaoTexto(sol !== null && sol > 0 ? sol : 60), hora: saia })}`;
}

/** 'Escurece às 18:10. Para voltar com luz, saia do poço até 17:10.' */
export function fraseVolteComLuz({ escureceHHMM, volteHHMM } = {}) {
  const escurece = limpo(escureceHHMM);
  const volte = limpo(volteHHMM);
  if (escurece && volte) return t('hora.frase_volte', { escurece, volte });
  if (escurece) return t('hora.frase_escurece', { escurece });
  if (volte) return t('hora.frase_volte_so', { volte });
  return '';
}

/**
 * 'Cheguei 15:52 · a serra apaga o sol 16:05 · 13 min de sol no poço' e as variações honestas.
 * O número só vem de minutosDeSol, que o cartao.js calcula com max(chegada, nasce).
 * Sem ele, a frase sai sem número: aqui não se faz conta de minutos de sol.
 */
export function fraseCartao({ chegadaHHMM, apagaHHMM, minutosDeSol } = {}) {
  const chegada = limpo(chegadaHHMM);
  const apaga = limpo(apagaHHMM);
  if (!chegada) return '';
  if (!apaga) return t('cartao.frase_sem_hora', { chegada });
  const min = num(minutosDeSol);
  if (min === null) {
    // Só escolhe o tempo do verbo: chegou no apaga ou depois, o poço já estava na sombra.
    const a = paraMinutos(apaga);
    const c = paraMinutos(chegada);
    if (a !== null && c !== null && c >= a) return t('cartao.frase_sombra', { chegada, apaga });
    return t('cartao.frase_sem_minutos', { chegada, apaga });
  }
  const inteiro = Math.max(0, Math.floor(min));
  if (inteiro === 0) return t('cartao.frase_sombra', { chegada, apaga });
  return t('cartao.frase', { chegada, apaga, min: inteiro });
}

/* ---------- Leitor de tela: a sombra sempre com palavra ---------- */
const juntarComE = (itens) =>
  itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;

function lerItem(item) {
  if (typeof item === 'string') return { texto: limpo(item) };
  if (!item || typeof item !== 'object') return null;
  const nome = limpo(item.nomeCurto) || (item.id ? nomeCurto(item.id, item.nome) : limpo(item.nome));
  const estado = limpo(item.estado ?? item.luz).toLowerCase();
  if (!nome || !estado) return null;
  return { nome, estado };
}

/** '16:05, a sombra da serra cobre o Véu e as Arapongas; sol no Coxinho' */
export function ariaRegua(horaHHMM, listaDeEstados = []) {
  const hora = limpo(horaHHMM);
  const grupos = new Map();
  const prontos = [];
  for (const bruto of Array.isArray(listaDeEstados) ? listaDeEstados : []) {
    const item = lerItem(bruto);
    if (!item) continue;
    if (item.texto) {
      prontos.push(item.texto);
      continue;
    }
    if (!grupos.has(item.estado)) grupos.set(item.estado, []);
    grupos.get(item.estado).push(item.nome);
  }
  const partes = [];
  for (const [estado, nomes] of grupos) {
    if (estado === 'sombra') partes.push(t('hora.aria_sombra', { lista: juntarComE(nomes.map((n) => comArtigo('o', n))) }));
    else if (estado === 'sol') partes.push(t('hora.aria_sol', { lista: juntarComE(nomes.map((n) => comArtigo('no', n))) }));
    else if (estado === 'sem-sol') partes.push(t('hora.aria_sem_sol', { lista: juntarComE(nomes.map((n) => comArtigo('no', n))) }));
    else if (estado === 'noite') partes.push(T.hora.aria_noite);
  }
  partes.push(...prontos);
  const unicas = [...new Set(partes.filter(Boolean))];
  if (!hora) return unicas.join('; ');
  return unicas.length ? `${hora}, ${unicas.join('; ')}` : hora;
}

const maiuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** 'A sombra da serra cobre o Véu.' · 'Sol no Véu.' */
export function ariaSombra(nome, estado) {
  const n = limpo(nome);
  const e = limpo(estado).toLowerCase();
  if (!n) return '';
  if (e === 'sombra') return `${maiuscula(t('hora.aria_sombra', { lista: comArtigo('o', n) }))}.`;
  if (e === 'sol') return `${maiuscula(t('hora.aria_sol', { lista: comArtigo('no', n) }))}.`;
  if (e === 'sem-sol') return t('hora.frase_sem_sol', { nome: n });
  if (e === 'noite') return `${maiuscula(T.hora.aria_noite)}.`;
  return '';
}

/* ---------- SOS ---------- */
/** Uma parte de SMS no alfabeto GSM-7. Com ç, ã ou °, o celular passa a contar 70 por parte. */
export const SMS_LIMITE = 160;

// Fora daqui, o caractere não é GSM-7 básico ou vale 2 no SMS: só ASCII visível, menos ` [ \ ] ^ { | } ~
const FORA_DO_SMS = /[^A-Za-z0-9 !"#$%&'()*+,\-./:;<=>?@_]/g;

/** Texto com caracteres que valem 1 no SMS: tira acento, troca °, ′, ″ e ·, corta o resto. */
function paraSMS(texto) {
  return semAcento(limpo(texto))
    .replace(/[\u00A0\u2060]/g, ' ')
    .replace(/[°º]/g, ' ')
    .replace(/[′‘’]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/·/g, '/')
    .replace(/[–—]/g, '-')
    .replace(FORA_DO_SMS, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** true se o texto cabe numa parte de SMS: só GSM-7 básico e até 160 caracteres. */
export function cabeEmUmSMS(texto) {
  return typeof texto === 'string' && texto.length <= SMS_LIMITE && texto.match(FORA_DO_SMS) === null;
}

/**
 * SMS do SOS numa parte só, garantido aqui (cabeEmUmSMS). Quando não cabe,
 * sai o link e depois a precisão. A coordenada nunca sai.
 * link: o ponto num mapa (ex.: https://maps.google.com/?q=lat,lon), não o endereço do app.
 * Link com caractere fora do GSM-7 básico não entra, para não estragar o endereço.
 */
export function textoSMS({ coordenada, lat, lon, precisaoM, link } = {}) {
  const la = num(lat);
  const lo = num(lon);
  const coord = paraSMS(coordenada) || (la !== null && lo !== null ? `${la.toFixed(6)}, ${lo.toFixed(6)}` : '');
  const p = num(precisaoM);
  const precisao = p !== null && p > 0 ? ` (precisao de ${Math.max(1, Math.round(p))} m)` : '';
  const url = limpo(link);
  const comLink = /^https:\/\/\S+$/.test(url) && paraSMS(url) === url ? ` ${url}` : '';
  const lugar = paraSMS(`${VALE.nome}, ${VALE.municipio} ${VALE.uf}`);
  const montar = (prec, lk) => `Preciso de ajuda em ${lugar}.${coord ? ` Posicao: ${coord}${prec}.` : ''}${lk}`;
  for (const [prec, lk] of [[precisao, comLink], [precisao, ''], ['', '']]) {
    const s = montar(prec, lk);
    if (s.length <= SMS_LIMITE) return s;
  }
  return montar('', '');
}

/* ---------- Legendas do cartão ---------- */
const arrobaDoInstagram = (url) => {
  const m = /instagram\.com\/([A-Za-z0-9._]{1,30})\/?/i.exec(limpo(url));
  return m ? `@${m[1]}` : '';
};

/**
 * Legendas do compartilhar (1 a 5) + a 6 (Hora da Serra).
 * Regras: legenda termina no @ (sem ponto colado); sem Instagram entra o nome da casa;
 * sem casa (marca padrão) a frase do crédito sai inteira; sem cachoeira a 3 e a 6 saem;
 * subida abaixo de 30 m tira esse trecho da 2; sem km a 2 sai; a 6 só existe com sol no poço.
 * A 6 diz "cheguei com sol no poço": com chegadaHHMM e nasceHHMM, sai quando a chegada foi
 * antes de o sol entrar no poço; com chegadaHHMM, sai quando a chegada foi no apaga ou depois.
 * Devolve [{ n, texto, curta, marcada, copiar }], a marcada primeiro.
 */
export function legendasDoCartao({
  cachoeira, km, subidaM, instagram, parceiro, apagaHHMM, minutosDeSol, chegadaHHMM, nasceHHMM,
} = {}) {
  const destino = limpo(cachoeira);
  const arroba = arrobaDoInstagram(instagram);
  const casa = arroba || limpo(parceiro);
  const comCasa = (texto, ligacao) => {
    if (!casa) return texto;
    const sem = texto.replace(/\.$/, '');
    return `${sem}${ligacao(casa)}`;
  };
  const de = (c) => (c.startsWith('@') ? `de ${c}` : comArtigo('do', c));
  const em = (c) => (c.startsWith('@') ? `em ${c}` : comArtigo('no', c));
  const molde = (n) => T.cartao.legendas.find((l) => l.n === n);
  const saida = [];
  const sol = num(minutosDeSol);
  const apaga = limpo(apagaHHMM);
  const chegadaMin = paraMinutos(chegadaHHMM);
  const nasceMin = paraMinutos(nasceHHMM);
  const apagaMin = paraMinutos(apaga);
  const chegouSemSol =
    (chegadaMin !== null && nasceMin !== null && chegadaMin < nasceMin) ||
    (chegadaMin !== null && apagaMin !== null && chegadaMin >= apagaMin);

  const montar = (n, campo, vars) => preencher(molde(n)[campo], vars, 'cartao.legendas');

  if (destino && apaga && sol !== null && sol > 0 && !chegouSemSol) {
    saida.push({ n: 6, texto: comCasa(montar(6, 'molde', { cachoeira: destino, apaga }), (c) => `. Mapa ${de(c)}`), curta: molde(6).curta });
  }
  {
    const base = destino ? montar(1, 'molde', { cachoeira: destino }) : montar(1, 'sem_destino', {});
    saida.push({ n: 1, texto: comCasa(base, (c) => `, com o mapa ${de(c)}`), curta: molde(1).curta });
  }
  const quilometros = num(km);
  if (quilometros !== null) {
    const subida = num(subidaM);
    const vars = { distancia: `${numeroBR(quilometros, 1)} km`, cachoeira: destino || VALE.nome };
    const base =
      subida !== null && subida >= 30
        ? montar(2, 'molde', { ...vars, subida: `${Math.round(subida)} m` })
        : montar(2, 'sem_subida', vars);
    saida.push({ n: 2, texto: comCasa(base, (c) => `. Saí ${de(c)}`), curta: molde(2).curta });
  }
  if (destino) {
    saida.push({ n: 3, texto: comCasa(montar(3, 'molde', { cachoeira: destino }), (c) => `. Base: ${c}`), curta: molde(3).curta });
  }
  {
    const base = destino ? montar(4, 'molde', { cachoeira: destino }) : montar(4, 'sem_destino', {});
    saida.push({ n: 4, texto: comCasa(base, (c) => `. Mapa no bolso: ${c}`), curta: molde(4).curta });
  }
  {
    const base = destino ? montar(5, 'molde', { cachoeira: destino }) : montar(5, 'sem_destino', {});
    saida.push({ n: 5, texto: comCasa(base, (c) => `. Fiquei ${em(c)}`), curta: molde(5).curta });
  }
  return saida.map((l, i) => ({ ...l, marcada: i === 0, copiar: `${l.texto}\n\n${T.cartao.hashtags}` }));
}

/* ---------- Textos que dependem da casa (o parceiro da marca) ---------- */
/**
 * Texto que depende da casa, escolhido pelo JSON da marca (marcas/<slug>.json).
 * Na marca padrão (parceiro e instagram vazios) nunca sai {casa} nem {parceiro} na tela.
 * "Marque" pede o @: parceiro sem Instagram também recebe a versão _sem_casa.
 */
export function textoDaCasa(chave, marca) {
  const m = marca && typeof marca === 'object' ? marca : {};
  const arroba = arrobaDoInstagram(m.instagram);
  const parceiro = limpo(m.parceiro);
  const nomeApp = limpo(m.nome_app) || T.app.nome;
  switch (chave) {
    case 'cartao.compartilhado':
    case 'cartao.legenda_copiada':
      return arroba ? t(chave, { casa: arroba }) : t(`${chave}_sem_casa`);
    case 'cartao.cortesia':
    case 'marca.cortesia':
    case 'placa.cortesia':
      return parceiro ? t(chave, { parceiro }) : '';
    case 'demo.fase4':
      return t(parceiro ? 'demo.fase4' : 'demo.fase4_sem_casa');
    case 'meta.titulo_marca':
      return parceiro ? t(chave, { nome_app: nomeApp, parceiro }) : T.meta.titulo;
    default:
      return t(chave, { casa: arroba || parceiro, parceiro, nome_app: nomeApp });
  }
}
