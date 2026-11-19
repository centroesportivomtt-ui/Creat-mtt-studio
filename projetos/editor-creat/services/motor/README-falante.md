# Falante na análise (Marcos, Ruan, Xande)

Regra do dono: Reel da creat.MTT é construído em cima da fala do Marcos para a câmera. Para isso a análise precisa
saber **quem fala** em cada trecho. Desde a fase 2 cada segmento de `analise.transcricao.segmentos` pode trazer:

| campo | valores |
|---|---|
| `falante` | `marcos` · `ruan` · `xande` · `outro` (perfil cadastrado que não é da equipe) · `desconhecido` |
| `falante_confianca` | 0 a 1 (em `desconhecido`: 0 = curto, silêncio ou sem voz) |
| `falante_metodo` | `voz` · `rosto` · `voz+rosto` · `fixture` (hoje só `voz` e `fixture` são produzidos) |

Os campos são opcionais. Sem `falante_metodo`, `falante` continua livre como antes (MARCOS, F0/F1 da diarização, null).
A análise ganha também `analise.falante` (provedor, perfis comparados, contagem por rótulo, aviso).

## Provedores (`EDITOR_FALANTE`)

- `voz` (padrão): grátis, sem rede, só numpy/scipy. Impressão digital da voz por trecho: MFCC (média e desvio) +
  f0/pitch (mediana, espalhamento, fração vozeada), cada faixa com piso de desvio próprio. Compara com os perfis
  cadastrados por distância de Mahalanobis diagonal, com uma classe "nenhum deles" e margem entre o 1º e o 2º.
  **Sem perfil cadastrado, não rotula** e a análise fica igual à da fase 1.
- `fixture`: testes. Rótulo pelo nome do arquivo (`EDITOR_FALANTE_FIXTURE` = JSON `{"trecho do nome": "marcos"}`)
  ou pelo f0 do trecho (< 120 Hz marcos, 120–165 ruan, 165–215 xande, acima outro).
- `desligado`: não rotula; campos ausentes.

Garantias: falha do falante nunca derruba a análise (vira `analise.falante.aviso`, trechos sem rótulo). Cadastrou ou
trocou um perfil? Na próxima análise **só o rótulo é refeito** (transcrição e visão, que pode ser paga, não rodam de
novo). Desligado ou sem perfil: a assinatura da análise é a mesma da fase 1 (nada é reprocessado).

Custo medido (18/11, CPU deste ambiente, 2 threads): **0,17 s por minuto de áudio** (120 s de fala, 30 trechos, 30/30 certos
nas vozes sintéticas). Catálogo: 48 clipes no formato de 17/11, 13 706 → 13 856 tokens (**+1,1 %**).

## Catálogo

O catálogo põe o rótulo em maiúsculas (MARCOS, RUAN, XANDE, OUTRO, DESCONHECIDO) e `falante_conf` no JSON. No texto
do cérebro: `MARCOS`, `MARCOS~` (confiança < 0,7, fala fica inteira), `?` (sem rótulo) e uma linha de cabeçalho com
quantas falas e segundos o Marcos tem (base do Reel). Falas da equipe nunca são truncadas.
Reserva (paliativo do item 7 da fase 1), decidida **por clipe**: num clipe sem rótulo nenhum, toda fala sob momento
"fala com rosto" nota ≥ 4 fica inteira; num clipe rotulado, a reserva vale só para as falas `DESCONHECIDO`. Assim um
projeto misto (um arquivo rotulado, outro não) não perde a fala do Marcos do arquivo sem rótulo.
Falha do falante (provedor ativo que deu erro) é gravada com marcador em `analise.ok`: o próximo reenfileiramento
tenta de novo só o rótulo, sem refazer transcrição nem visão.

## Cadastro dos perfis (passo a passo para o dono)

1. Separe de 3 a 5 gravações de cada um falando sozinho (Marcos, Ruan, Xande): 20 s a 1 min cada, de dias e lugares
   diferentes (sala, evento, carro). Áudio do celular serve. Sem música alta por baixo.
2. Na máquina do motor (nunca no git):
   ```
   cd projetos/editor-creat/services/motor
   python -m motor.ferramentas.cadastrar_falante --nome marcos marcos1.m4a marcos2.m4a marcos3.m4a
   python -m motor.ferramentas.cadastrar_falante --nome ruan  ruan1.m4a ruan2.m4a
   python -m motor.ferramentas.cadastrar_falante --nome xande xande1.m4a xande2.m4a
   python -m motor.ferramentas.cadastrar_falante --listar
   ```
   Formatos fora de wav/flac passam pelo ffmpeg. Meta: 20+ janelas por pessoa (o comando avisa se faltar).
   Repetir um arquivo não conta duas vezes. Refazer do zero: `--nome marcos --apagar`.
3. Outras vozes recorrentes (apresentador, cliente) podem ser cadastradas com qualquer nome: saem como `outro`.
4. Rode a análise de novo (ou só reenfileire): os rótulos aparecem sem refazer transcrição e visão.
5. Confira 2 ou 3 trechos no catálogo. Se aparecer muito `desconhecido` em fala clara, cadastre mais áudio daquela
   pessoa; se trocar pessoas, suba `EDITOR_FALANTE_MARGEM` (0,3) para preferir "não sei" a errar.

Os perfis guardam só estatísticas da voz (soma, quadrados, n), nunca o áudio; ainda assim são dado biométrico:
ficam em `EDITOR_DADOS`, fora do repositório.

## Variáveis

| nome | padrão | o que é |
|---|---|---|
| `EDITOR_FALANTE` | `voz` | desligado · voz · fixture |
| `EDITOR_FALANTES_DIR` | `$EDITOR_DADOS/biblioteca/falantes` | pasta dos perfis (`<nome>/perfil.json`) |
| `EDITOR_FALANTE_MARGEM` | `0.2` | diferença mínima de probabilidade entre 1º e 2º perfil para rotular |
| `EDITOR_FALANTE_LIMIAR` | `2.5` | distância (em desvios) da classe "nenhum dos perfis" |
| `EDITOR_FALANTE_MODELO` | vazio | caminho de um .onnx de embedding de locutor (entrada log-mel 80 `[1, T, 80]`); exige `onnxruntime` (extra `falante`) |
| `EDITOR_FALANTE_LIMIAR_COS` | `0.5` | cosseno da classe "nenhum" no modo ONNX |
| `EDITOR_FALANTE_FIXTURE` | vazio | só testes: JSON nome-do-arquivo → rótulo |

## Pendências

- **Rosto**: `voz+rosto` está no contrato, mas ainda não reforça. Precisa de embedding de rosto (ex.: SFace do OpenCV,
  modelo baixado uma vez) e exemplo de rosto no perfil; os rostos já chegam ao provedor em `contexto["rostos"]`.
- Calibrar `EDITOR_FALANTE_LIMIAR`/`MARGEM` com os áudios reais dos três (os números de hoje são de vozes sintéticas).
- Voz simples (MFCC + f0) separa bem vozes de timbre e tom diferentes; Ruan e Xande, com alturas e vozes parecidas,
  podem precisar do modelo ONNX (ex.: ECAPA/WeSpeaker, licença a verificar antes de usar).
