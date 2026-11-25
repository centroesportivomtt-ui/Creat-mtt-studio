# Fila única do Editor creat.MTT

Uma lista só para todas as sessões que trabalham no editor (branch `claude/editor-creat`, publicada sozinha no Railway).
Motivo: em 19/11 duas sessões fizeram as mesmas três checagens ao mesmo tempo e precisaram de várias junções manuais.

## Combinado entre as sessões (vale para todas)
1. **Antes de começar:** `git pull` na branch, ler esta fila e pegar o primeiro item **livre**.
2. **Reservar:** trocar `livre` por `em andamento · <id curto da sessão> · <data hora>` e dar push SÓ dessa linha, já. Se o push
   for recusado, outra sessão reservou antes: puxe e escolha outro item.
3. **Trabalhar** e, antes de cada push: puxar, juntar, rodar `cd services/motor && python -m pytest -q -m "not pago"` e
   `cd apps/web && pnpm install && pnpm tipos && pnpm aceite`. Nunca publicar com teste vermelho.
4. **Fechar:** marcar `feito · <commit> · <data>` e anotar o detalhe no fim do `PROGRESSO.md`.
5. Reserva parada há mais de 6 horas sem commit pode ser assumida por outra sessão (deixar uma linha dizendo isso).
6. Decisão que só o dono pode tomar: escrever em **Precisa do dono** abaixo, com o link exato da tela.

## Fila do dono (ordem dele, 19/11)
| item | o quê | estado |
|---|---|---|
| A | backup diário para o Dropbox | feito e funcionando em produção · 2e2ac49 · 1º backup real 20/11 15:52 |
| B | memória do servidor de volta ao git | feito em parte · 51fcc19 (memória no volume) + backup leva `editor-memoria-*.json`; falta a rotina que lê o backup e versiona |
| C | revisão com olho de IA antes de entregar | feito · 51fcc19 · segura a entrega desde 19/11 |
| D | checagens de fala (cortada, voz de fora, cobertura) | feito · c9e2b1e (integração das duas sessões) |
| E | biblioteca de trilhas e efeitos com licença | feito · bb750bd · efeitos da casa (Sonniss GDC) no kit; **trilhas: licença com ressalva, ver Precisa do dono** |
| D2 | réguas de fala, rodada 2 (dados reais da Lavínia, 19/11): voz distante abaixo do limiar vira tom < ~170 Hz contra a principal; falso positivo em consoante sonora (≥180 ms e tom fora de ±25%); início no meio de palavra da mesma voz (< 150 ms antes do s0) | feito · ver PROGRESSO 20/11 (falta conferir no material real: pedido à sessão da Lavínia) |
| F | link de aprovação para o cliente | feito · 7ab6ddc · 19/11 |
| G | agendar o post aprovado pelo Metricool | livre (precisa do dono: token do Metricool na hospedagem) |
| H | painel de gastos do mês | feito · 90781ea |
| L | link do Dropbox e envio do celular (21/11): conta de equipe gera link restrito; o editor agora confere o link na hora e explica o passo a passo | feito · f7128a8 · 21/11 |
| I | **verificação de fatos** (regra permanente do dono, 21/11): todo número, volume, caloria, preço ou alegação de produto da fala é listado; o editor confere a fonte oficial (fabricante, rótulo; varejista grande como reserva) e o rótulo visível no vídeo (OCR); corrige legenda e cartões, registra fonte e data no relatório e segura a entrega com número sem fonte. Caso real: "Amstel Ultra garrafa 269 ml" → long neck 275 ml / 72 kcal (lata 269 ml / 71 kcal) | feito · fdd6577 · 21/11 (a 1ª conferência paga real roda na próxima montagem da cerveja) |
| J | falso negativo da voz de fora no fim (cerveja v2, "vale…" do Xande): a checagem também olha o tom de sala/ambiente e o som sob o cartão final; o tom de sala só sai de trecho sem fala | feito · 241836d · 22/11 |

## Filme guiado por música e emoção (pedido do dono, 25/11: "instale tudo, no automático, e vá além")
| item | o quê | estado |
|---|---|---|
| M1 | o editor ouve a música (virada, partes, tom; auge do filme na virada) | feito · cdacad4 · 25/11 |
| M2 | movimento, tremor e nitidez a cada 0,5 s; decisão de estabilizar; recorte que amplia demais é recusado | em andamento · 01LA2wrMpbZ · 25/11 |
| M3 | modo filme sem fala: cortes pela música (partes e virada), melhor trecho de cada cena, ordem cronológica | em andamento · 01LA2wrMpbZ · 25/11 |
| M4 | emenda de duas ou mais músicas no mesmo tom e no tempo; cor viva como padrão; câmera lenta só de fonte 60/120 fps | em andamento · 01LA2wrMpbZ · 25/11 |
| M5 | portar o motor de render do Itaitu (transição casada com o movimento, looks por plano, moldura, mix com natureza) | AUTOMÁTICO: toda rodada confere se existe `projetos/itaitu-viagem/motor-render/`; existindo, portar para services/motor com teste e publicar, sem perguntar ao dono |
| M6 | banco de sons reais (kit-edicao-17-11/sfx-banco) ligado ao editor: som que acompanha a imagem | AUTOMÁTICO: quando a sessão do Itaitu commitar o índice |

## Comando oficial do dono (25/11, geral e permanente)
Palavras dele: "sem limites, sem fronteiras, observando tudo… o que os próprios creators do momento mais fazem… algo premium de fato"; "não quero só um modo de edição… dezenas e dezenas e dezenas de modos de edição diferentes"; "interpretação e leitura sobre o tipo de vídeo que foi gravado… log, RAW, 30 fps, 24 fps, 120 fps, modo cinema, câmera lenta, ou aqueles aplicativos que tiram o processamento da Apple"; "nunca, jamais me exportar os vídeos de uma forma que estrague os detalhes… ainda mais os vídeos gravados com um nível de filmagem superior".
| item | o quê | estado |
|---|---|---|
| O1 | leitura completa da gravação (log, RAW/ProRes, HDR/Dolby Vision, 10 bits, fps real e variável, modo cinema, câmera lenta, app sem processamento da Apple) e tratamento certo para cada uma | pesquisa em andamento · 25/11 |
| O2 | exportação que nunca estraga: cadeia de cor e bits preservada, taxa e codec pelo destino, conferência de qualidade contra a fonte | pesquisa em andamento · 25/11 |
| O3 | dezenas de modos de edição (biblioteca de estilos: ritmo, cor, tipografia, transição, som), escolhíveis no pedido | pesquisa em andamento · 25/11 |
| O4 | o que os creators premium fazem agora, virando técnica do editor | pesquisa em andamento · 25/11 |

## Mapa original (depois da fila do dono)
| item | o quê | estado |
|---|---|---|
| 1 | cor no estilo DaVinci | feito · 3713eda |
| 2 | rastreamento e máscara de pessoa | feito · 20/11 (texto atrás, fundo desfocado, destaque e pele tratada só na pessoa) |
| 3 | limpeza de voz por IA | feito · 21/11 (DeepFilterNet3 ONNX + medidor DNSMOS escolhe a mistura por fonte) |
| 4 | rótulo de quem fala (voz + rosto) | voz feita · 20/11 (voz A/B no catálogo, ditado da equipe trocado pela repetição, conferido no material real; ditado no projeto inteiro em 23/11); falta: rosto (YuNet + SFace, pesquisa de 23/11) |
| 5 | Drive e Dropbox direto no editor | livre |
| 6 | cenas por IA com custo à vista | livre |
| 7 | perguntas em camadas | livre |
| 8 | motion premium | feito · sessão Lavínia/homenagem (…TqPTUo) · 20/11 02:50 UTC · linguagem "Em Revelação" no ar (8212e2c, 9d3f8b6): camadas revelacao, legenda_revelada, laboratorio, papel (cartão com @ e CTA ajustável); FX revela e salto; looks matriz; Reel de bastidor entregue com QA 17/17 |
| 9 | tela Novidades | livre |

## Precisa do dono
- Trilhas: as 3 do ElevenLabs (plano Creator) estão no Dropbox (`/Creat.MTT Studio/creat.MTT/Kit de edição/Trilhas/`), mas os termos de música (09/10/2026) dizem Creator = "For Individual Use Only" e proíbem montar biblioteca de músicas com o que se gera. Uso comercial online, inclusive anúncio pago, é permitido; agência para cliente não está definido. Por isso NÃO entraram na biblioteca da casa. Caminhos: (a) a creat passa a gerar no plano Scale (empresa com menos de 10 pessoas); (b) e-mail à ElevenLabs confirmando o Creator para cliente; (c) biblioteca paga com licença de agência. Fonte: elevenlabs.io/music-terms.
