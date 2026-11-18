# Chuva / estrada: receita de tratamento testada (rodada 2)

## Onde estão os planos
- EDL v1: P22 (IMG_5183 4,6-7,0 s, interior do carro), P23 (v_183901 0,5-4,5 s, para-brisa com faróis, 2x), P24 (v_183901 14,0-15,45 s, perfil do Ruan).
- Brutos: IMG_5183 (18:37:50, 47,2 s, 24 fps, yuv420p TV) e v_183901 (18:39:01, 29,5 s, 30 fps, yuvj420p FULL: não forçar in_range).

## Avaliação da v1 (build/video/planos, medidas em v1_medidas.json)
| plano | tremor (px a 1080) | preto (luma p1) | ruído temporal na sombra | problema |
|---|---|---|---|---|
| P22 | 27,1 | 7 | 1,89 | muito tremido; preto levantado (lavado) |
| P23 | 21,8 | 6 | 2,17 | tremido; preto levantado; é o trecho mais agitado do bruto |
| P24 | 1,4 | 5 | 0,78 | firme; 84% do quadro abaixo de 20 (escuro demais, mas bonito) |

## Receita (py/cortar_chuva.sh + py/estabiliza_chuva.py; atalho py/tratar_chuva.sh)
1. **Corte e reenquadre** (`cortar_chuva.sh bruto ini dur saida alto`): 1080x1920 bt709 TV, Lanczos, sem forçar faixa de entrada. Reenquadre "alto" = punch-in de 1,30x deslocado para cima (`crop=1662:2954:249:290` no quadro vertical 2160x3840): tira boa parte do painel preto, que ocupava os 25% de baixo.
2. **Estabilização própria** (não vid.stab): translação por correlação de fase na imagem de bordas (gotas no vidro + linha do painel), passos sem confiança ignorados (limpador cobrindo a lente), caminho suavizado por gaussiana (0,30 a 0,50 s), correção limitada à folga de um zoom fixo de 5%. Não ondula (sem zoom dinâmico) e não aparece borda preta (correção máxima sempre menor que a folga).
3. **Ruído**: `unsharp=5:5:0.25` leve, depois `atadenoise=0a=0.04:0b=0.08:s=7` (temporal) + `hqdn3d=2:4:0:0` (espacial). `nlmeans` foi testado e reprovado (borrava 28% do detalhe da estrada; ver dn/ e dn_100pct_antes_ata_nlm.jpg).
4. **Curva** (preto ancorado em 0, contraste no meio, altas com rolagem para os faróis não estourarem): estrada `0/0 0.06/0.035 0.18/0.17 0.40/0.45 0.70/0.77 0.90/0.90 1/0.96`; para-brisa e rosto no script. Balanço: sombra fria, alta quente (`colorbalance`), saturação 0,90 a 0,95.
5. **Grão fino** `noise=alls=3:allf=t` por cima (esconde banding do céu e casa com o resto do filme). `GRAO=0` desliga.
6. Saída libx264 crf 12, bt709 TV.

## Resultado (final/*.mp4, medidas em final/janelas.json; antes/depois em antes_depois_*.jpg e *_100pct_antes_depois.jpg)
| trecho | bruto (s) | perfil | tremor antes | vid.stab | **receita** | melhor janela de 1,5 s (no bruto) | tremor na janela | preto p1 antes→depois |
|---|---|---|---|---|---|---|---|---|
| d3 | IMG_5183 33,58-39,59 | estrada | 9,7 | 5,1 | **4,3** | 36,71-38,17 | **0,65** | 1→1 |
| e3 | IMG_5183 39,58-47,25 | estrada | 12,9 | 13,4 (com borda preta) | **7,0** | 45,54-47,00 | **1,55** | 1→0 |
| b3 | v_183901 24,80-29,40 | estrada | 10,7 | 9,3 | **6,4** | 24,87-26,33 | **3,1** | 1→0 |
| c  | v_183901 13,80-15,80 | rosto | 6,3 | 4,3 | **2,0** | 13,80-15,27 | 1,75 | 0→0 |
| a3 | v_183901 0,30-4,90 | parabrisa | 35,0 | 28,1 | 24,0 (21,8 com zoom 1,10) | 0,60-2,07 | 15,3 | 2→1 |

Ruído temporal na sombra, sem o grão: b3 2,90→2,05 (-29%), e3 0,94→0,64 (-32%). Com o grão volta ao nível de antes, mas fino e uniforme.
O número de tremor inclui movimento real da cena (faróis vindo, limpador), então serve para comparar versões do mesmo trecho, não trechos entre si.

## Como usar na montagem
- **Plano principal do dilúvio: b3** (pista alagada com faróis e reflexo, janela 24,87-26,33) e **d3/e3** (estrada amarela com limpador; e3 tem a passada do limpador, boa para casar com `limpador_dentro_2x.wav`).
- **a3 (o trecho que a v1 usou como P23) continua tremido mesmo tratado**: usar só como textura de até 1 s (0,60-2,07 do bruto), acelerado, ou trocar por b3. Não segurar na tela.
- **c (perfil do Ruan)**: firme e bonito, preto preservado; bom respiro de 1 a 1,2 s entre dois planos de pista.
- Limite honesto: os planos têm foco no vidro e névoa de chuva; o tratamento dá contraste, limpa e firma, mas não cria nitidez na pista. São planos de clima, curtos (1 a 1,5 s cada).
- Os brutos IMG_5183 e v_183901 foram apagados do disco depois dos cortes (src/ guarda os trechos em crf 10).
