# Kal animado (AJUSTE 7) · relatório

## Modelo e custo
- Kling 2.5 Turbo Std image-to-video (720x1280, 24 fps, 5 s), a partir de kal_mascote_bracos.png composto sobre verde #00B140 9:16 (`src/in_*.jpg`). US$ 0,1575 por clipe, 3 clipes, **US$ 0,4725** no total (detalhes em ../GASTOS.md). Nenhuma tomada descartada.
- Teste primeiro (entrega, o movimento mais difícil): rosto, cabelo, polo com logo super kal e relógio dourado mantidos → os outros dois foram gerados no mesmo modelo.
- A arte "BORA PRA CIMA!" não serve de quadro inicial (o letreiro cobre o corpo e o modelo deformaria as letras). O soco saiu da arte dos braços cruzados; o letreiro "BORA PRA CIMA!" deve entrar como tipografia do motion.

## Entregas (RGBA PNG, 1080x1920, personagem cortado na borda de baixo = sobe "de trás" da borda)
Cada PNG é um quadro nativo do modelo. **Tocar a 30 fps = 1,25x (recomendado, mais punch, sem interpolação)**; a 24 fps fica na velocidade real.
| pasta | quadros | duração a 30 fps | conteúdo / pontos de corte (quadro) |
|---|---|---|---|
| `1_chegada/` | 97 | 3,23 s | braços cruzados → solta os braços (q 6–20) → cruza de novo (q 24–37) → piscada satisfeita encurtada (q 38–45, era 1,3 s de olhos fechados, acelerada 4x) → sorriso para a câmera parado (q 46–97). Subir pela borda nos q 1–15 com overshoot. |
| `2_entrega/` | 121 | 4,03 s | descruza (q 1–18) → **aponta para a ESQUERDA do quadro** (mão direita dele, olhar para o lado, q 20–48) → volta para a câmera (q 48–58) → **joinha** (q 60–96) → joinha duplo (q 100–121). Boca abre em "ô" nos q 76–80 e 100–112: sair no q ~96. A tela/senha deve ficar à esquerda dele (não espelhar: a logo inverteria). |
| `3_soco/` | 121 | 4,03 s | descruza e prepara (q 1–40; boca em "ô" de empolgação nos q 24–34) → **soco para cima** q 42–54 (punho no alto, câmera do modelo acompanha) → segura o punho q 55–121. Whip vertical no pico do soco (q ~50–54). |

## Conferência
- Rosto a 100% contra a arte em 3+ quadros de cada clipe (`raw/faces_*.jpg`): mesmo rosto, cachos, sobrancelhas, sorriso, polo preta com friso amarelo e logo, relógio dourado. Expressões de animação (olhar para o lado, "ô" de empolgação) sem deformar.
- Recorte (`py/key.py`): alpha por dominância do verde com cor de fundo medida por quadro, unmix da cor de borda (sem franja verde), despill (G ≤ max(R,B)), ciscos e furinhos limpos, choke leve + borda suave 0,6 px, upscale 1,5x premultiplicado (Lanczos). Borda a 100% sobre branco e magenta: limpa (`qa/bordas_100.png`). Cachos com contorno fino; luz de recorte (rim) quente do próprio modelo.
- Prévias: `qa/previa_xadrez.mp4` (3 clipes) e `qa/previa_superkal.mp4` (chegada no P13 com overshoot, entrega no P14, soco no P16; folha `qa/previa_superkal_folha.jpg`).

## Integração sugerida
- Escala 0,75–0,8 do quadro (Kal com 810–864 px de largura), base colada na borda de baixo: não há chão, então **não usar sombra projetada**. Usar sombra de contato/oclusão como gradiente escuro na base do plano real (−45 a −55 % de luz nos últimos ~400 px, como na prévia) e sombra suave atrás do corpo (desfoque 40 px, 35 %, deslocada 20 px para baixo).
- Casar com o plano: contraste +4 %, saturação −5 %, grão igual ao do plano, leve desfoque de movimento só na subida e no whip. O Kal é mais quente e mais limpo que os planos: puxar 3–5 % para a cor do ambiente (luz branca fria do Super Kal).
- Som (foley próprio): tecido no cruzar/descruzar, pop leve na chegada, estalo seco no joinha, impacto + ar no soco casado com o whip.
- Fontes brutas: `raw/*_t1.mp4` (verde, para refazer o recorte se precisar). Folhas de contato em `raw/`.
