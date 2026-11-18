# Marcas limpas para tela cheia (rodada 2, AJUSTES 4, 5 e 6)

Todas conferidas a 100% num quadro 1080x1920 (prancha_100.png; quadros inteiros em _conf/quadros/).
Regra de uso: nunca ampliar PNG acima do tamanho nativo; para logo maior que ~1000 px na tela, usar o SVG.

| arquivo | medidas | o que é | onde usar |
|---|---|---|---|
| ctmtt_logo.svg | viewBox 757x145 | CT MTT vetorizado: CT vinho #5f0304 (potrace) + MTT branco (polígono reto) + ™ (potrace) | selo "RIACHÃO · CT MTT, A BASE", qualquer tamanho |
| ctmtt_logo_2400.png | 2400x460 RGBA | render do SVG | tela cheia (até 2400 px de largura) |
| drako_dragao_nome_horizontal.png | 4099x1501 RGBA | dragão + barra (halter) + ELITE DRAKO GYM, do vetor oficial drako_logo.svg, sem o anel de texto | selo "CHEGAMOS EM VALENTE · ELITE DRAKO GYM" |
| drako_dragao_nome_vertical.png | 2127x2693 RGBA | mesmo, empilhado (dragão em cima, nome embaixo) | quadro vertical, fecho de bloco |
| drako_dragao.png | 2127x1494 RGBA | só o dragão com o halter | ícone / transição |
| superkal_logo.svg | viewBox 1206x1588 | Super Kal vetorizado (amarelo #fdbd02, branco, GRUPO refeito em Montserrat SemiBold letra a letra no ângulo do original) | logo do Super Kal em tela cheia |
| superkal_logo_vetor_2400.png | 2400x3160 RGBA | render do SVG, sem sombra | tela cheia (mais nítido que o original) |
| superkal_logo_sem_sombra_alfa.png | 2048x2048 RGBA | original com a sombra separada matematicamente (sem halo escuro) | quando o motion fizer a própria sombra |
| superkal_logo_alfa.png | 2048x2048 RGBA | original do dono (já tinha alfa, com sombra suave preta) | só referência / uso pequeno |
| superkal_logo_sobre_preto.png | 2048x2048 RGB | original sobre preto | onde não houver alfa |
| creatmtt_logo_oficial_alfa.png | 3933x981 RGBA | logo oficial creat.MTT STUDIO (copiada de assets/brand), tem brilho suave intencional em volta de "creat" | assinatura/fecho, mapa do ecossistema |
| creat_studio_producao_alfa.png | 1774x887 RGBA | "● REC creat.MTT STUDIO · EM PRODUÇÃO" com alfa limpa | abertura e vinhetas entre rotas |
| creat_bastidores_alfa.png | 1774x887 RGBA | claquete "creat.MTT STUDIO BASTIDORES" com alfa limpa | abertura / fecho |

## Conferência
- CT MTT: vetor sobreposto ao original na mesma escala: diferença média de alfa 1,3/255, nenhuma área relevante fora (mapa em _conf/ct_diff.png: vermelho = só no original, verde = só no vetor). Junção T/M sem fresta.
- Super Kal vetor x original: diferença média de alfa 2,6/255; GRUPO conferido em zoom (_conf/sk_grupo_cmp.png).
- Elite Drako: render do drako_logo.svg idêntico ao drako_logo_4k.png (diferença 0).
- creat EM PRODUÇÃO e BASTIDORES: os originais tinham um véu de alfa 1 a 14 cobrindo o retângulo inteiro (vira caixa cinza sobre fundo claro ou em movimento). Removido o véu longe das bordas (49 mil e 31 mil px) e alfa 245 a 254 levada a 255 (o miolo ficava 1 a 2% transparente).

## Atenção
- O vinho do CT (#5f0304) quase some sobre fundo escuro: no selo, usar placa clara, contorno/brilho branco sutil ou fundo de imagem mais claro atrás do CT.
- A logo oficial creat.MTT é PNG 3933 px (sem vetor); serve até a largura total do quadro sem ampliar.
- Há uma segunda logo creat.MTT (drako/V2/kit/assets/marca/logo_creatMTT_claro.png, 1212 px, outra caligrafia). Não usar como oficial; os selos que o dono mandou seguem a de 3933 px.
- Scripts: _py/ctmtt.py (args 0.9 1.0 0.8 0.6), _py/superkal.py, _py/svg2png.cjs (svg -> png com alfa via Chromium).
