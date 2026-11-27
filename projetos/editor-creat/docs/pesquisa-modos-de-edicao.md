# Frente O3: dezenas de modos de edição, cada um um arquivo de dados

Data da pesquisa: 25/11/2026. Código lido no commit 5325812 (só leitura; nada em `services/`, `apps/` ou `packages/` foi alterado).
Marcação: **[código]** = arquivo/linha lido. **[fonte]** = URL. **[proposta]** = decisão de projeto minha, não fato. **[não confirmado]** = sem fonte primária.
Valores numéricos de cor, ritmo e som marcados [proposta] são pontos de partida e precisam de calibração com filmagem real do Marcos (a máquina aqui não tem mídia dele).

---

## 1. Resposta curta

1. Hoje existem **8 modos** no site (`apps/web/lib/estados.ts:34-43`) e **7 receitas** em `memoria/modos/*.json` (todos menos `auto`). O que cada modo muda de verdade é pouco: **(a)** uma frase de texto que vai para o diretor (`etapas/direcao.py:24-33`), **(b)** 5 números do modelo de vídeo (pausa máxima, folga entre blocos, ganho da trilha, zoom máximo, efeito de pico), **(c)** uma lista de transições e de sons removidos. Cor, legenda, tipografia, gancho, fecho, velocidade de fala, câmera lenta, escolha de trilha e conformação de fps **não mudam com o modo** [código].
2. O gancho técnico já existe e é bom: `Loja.modelo_com_modo` (`memoria/loja.py:70-97`) mescla a receita por cima do modelo de vídeo. Falta ampliar o que a receita pode tocar, e é um arquivo de dados, não código.
3. Proponho o **Modo v2**: um JSON com **9 eixos** (ritmo, cor, legenda, transições, som, movimento, abertura, fecho, material) + herança (`base`), montado por **blocos reaproveitáveis** (14 estilos de cor, 9 legendas, 5 pacotes de transição, 8 pacotes de som, 7 pacotes de movimento). 44 modos concretos em 12 famílias saem de combinar blocos (seção 5). Adicionar o modo 45 é criar um arquivo.
4. **Cor tem que virar duas camadas**: "ambiente" (corrige a luz medida, já existe) e "estilo" (a assinatura do modo, nova, em deltas por cima). Hoje o pedido do dono para ambiente **substitui** a medição (`resolvedor.py:143,458`), e não há onde o modo assinar a cor.
5. O editor sugere **3 modos** sozinho por pontuação sobre sinais que ele já mede (fala %, rostos, movimento, tremor, fps de captura, log/HDR, ambiente, duração, tipo de vídeo) mais o histórico de aprovação (seção 6). O dono vê **3 cartões com prévia de 4 s**, não 44 botões (seção 7).
6. A leitura do tipo de gravação (Log, ProRes, 24/30/120 fps, Cinema, apps como Blackmagic Camera) entra como **filtro e como sinal**: ela decide quais modos são **seguros** para aquele material (ex.: câmera lenta só em captura ≥60 fps; look de contraste duro não vai sobre Log sem conversão). Quem implementa a leitura é a frente O1; aqui só está o contrato (seção 6.1).

---

## 2. Como os modos funcionam hoje (com linha)

### 2.1 Fluxo

`apps/web` manda `modo` no pedido (`api/direcao.py:21,53,111`) → `etapas/direcao.py:57-62` escreve no texto do pedido `modo de edição: <frase>` e, se a receita tiver `sem_transicoes`, uma segunda linha proibindo aquelas saídas → o diretor (Claude) devolve a direção → `etapas/direcao.py:126` chama `loja.modelo_com_modo(modelo, modo)` → o **resolvedor** monta a EDL usando o modelo já mesclado.

### 2.2 O que uma receita `memoria/modos/<id>.json` consegue mudar (tudo lido em `memoria/loja.py:70-97`)

| Campo da receita | Efeito real | Onde o motor lê |
|---|---|---|
| `ajustes.ritmo.pausa_max` | maior pausa de fala que sobrevive ao corte (0,14 s ultra a 0,35 s cinema) | `resolvedor` via `self.r` |
| `ajustes.ritmo.gap_bloco`, `gap_fala` | respiro entre blocos e entre falas | idem |
| `ajustes.trilha.ganho_db` / `ducking` | volume da trilha (-13 dB ultra, -19 dB fala) e descida sob a fala | `m.get("trilha")`, `m.get("ducking")` |
| `ajustes.intensidade.<n>.zoom/fx` | zoom e efeito por nível de energia 1-5 | `m["intensidade"]` |
| `sem_transicoes` | remove a saída do modelo (vira corte seco) e avisa o diretor | `loja.py:85-86`, `direcao.py:61-62` |
| `sem_sons` | zera o efeito sonoro daquele evento (`gancho`, `troca`, `chip`, `texto_tela`, `drop`) | `resolvedor.py:795` |
| `zoom_max` | teto de zoom em todos os níveis | `loja.py:90-93` |
| `fx_pico` | liga/desliga o efeito de pico (`bloom`) no nível 5 | `resolvedor.py:779` |
| texto em `MODOS` (`direcao.py:24-33`) | o diretor **lê** e interpreta: é a única parte que muda "o que o filme é" | prompt |

Valores reais dos 7 modos [código]: pausa_max 0,14/0,18/0,2/0,28/0,3/0,3/0,35; ganho da trilha -13 a -19 dB; zoom_max 1,04 a 1,24. Ou seja, **os 7 modos diferem por ~5 números**, uma lista de transições e uma frase.

### 2.3 O que é só rótulo (não muda nada fora do prompt)

- `ia` (Com IA): receita quase idêntica à `criativo` (pausa 0,2 contra 0,18; mesmo zoom 1,18 e bloom). O efeito de "cenas geradas" depende só do texto da frase e da pergunta `ia` no site (`estados.ts`, campo `obrigatorio`). **Rótulo + prompt.**
- `ultra`: muda ritmo, zoom e ganho; "mascotes e efeitos" é só frase para o diretor.
- `cinema`: a frase diz "cor por LUT", mas **nenhum campo da receita toca cor**. A cor sai do ambiente (`resolvedor.py:457-463`). "Cinema" não tem look de cinema [código].
- `serio`/`clean`/`fala`: tiram transições e sons; isso é real, mas negativo (retira), não define um estilo positivo.

### 2.4 O que o modo **não** alcança hoje

| Eixo | Estado hoje | Evidência |
|---|---|---|
| Cor/look | `cor_looks.json` (8 looks, todos "por ambiente": loja, rua_dia, rua_noite, academia, palco, neutro, 2 de projeto). O modo não escolhe look. | `etapas/cor.py:7-8`, `memoria/cor/looks.json` idêntico ao `cor_looks.json` (comparado) |
| Legenda | `m["legenda"]` fixa nos 4 modelos de vídeo: modelo `legenda`, y 0,62, `conf_min` 0,5, lista de ênfase | `memoria/modelos/*.json`, `resolvedor.py:803-821` |
| Tipografia | 1 estilo de legenda no resolvedor (palavra ativa âmbar); o kit **já tem** `legenda_revelada` (Instrument Serif), `laboratorio` (Special Elite), `hud` (JetBrains Mono) sem receita que os escolha | `packages/kit/kit/modelos/`, `tokens.css:6-14` |
| Velocidade da fala | `vel_fala` vem do diretor, padrão 1,1 | `resolvedor.py:379`; prompt diz 1,08 a 1,15 (`prompts/diretor.md`) |
| Câmera lenta | `cobertura.lento_vel` = 0,5 fixo; efeitos `punch/lento/rampa/congela/janela/atras` existem, escolhidos pelo diretor | `memoria/modelos/evento-reel.json`, `resolvedor.py:685-719` |
| Fps de saída | `W,H,FPS = 1080,1920,30` fixo | `etapas/montagem/comum.py:15` |
| Música | o diretor escolhe a trilha pelo `clima`; o modo só mexe no volume | `catalogo.py:184` |
| Gancho/fecho | 1 gancho (`gancho`, 2,3 s) e 1 fecho (`fecho`, 3,6 s) por modelo; existem `gancho2`, `fecho2` no kit sem receita | `evento-reel.json`, `kit/modelos/gancho2.js`, `fecho2.js` |
| Grão e vinheta | grão `noise` fixo no encode final e vinheta fixa em todo plano | `comp.py:286-289`, `planos.py:375-376` (documentado em `pesquisa-exportacao-sem-perda.md` §2) |
| Modelos de vídeo | só 4 (`evento-reel`, `daily-vlog`, `empresa-institucional`, `anuncio-produto`); diferem em `gap_fala`, `gap_bloco`, `pausa_max` e texto | `memoria/modelos/` |

### 2.5 Inventário do que o kit e o motor já oferecem (os "ingredientes" que um modo pode escolher sem código novo)

- Transições do motor (`evento-reel.json`): `corte_batida`, `whip` (0,26 s), `mascara` (0,4), `aba71` (1,0), `impacto` (0,2), `match` (0,2), `flash` (0,12), `fade` (0,5). No kit também `salto` (0,20 s, perfurações de filme) (`kit/modelos/transicao.js`). **Nota: `salto` não consta no modelo `evento-reel`; hoje só entra pela linguagem "Em Revelação".**
- Efeitos de cobertura: `punch, lento, rampa, congela, janela, atras, nenhum` (`resolvedor.py:685-719`).
- Camadas de motion no kit (`packages/kit/kit/modelos/`): abas, camadas, checklist, chip, fecho, fecho2, fundo, gancho, gancho2, heroi, hud, laboratorio, legenda, legenda_revelada, papel, pilha, revelacao, rotulo, selo, stats, transicao.
- Fontes embutidas (todas licença livre, `assets/fonts/FONTES.txt`): Anton, Inter (500, 900), Montserrat 900, JetBrains Mono 700, Instrument Serif (normal e itálico), Special Elite, Caveat Brush.
- SFX: abre, chip, cta, embaralha, impacto, risco, whoosh_curto (`assets/sfx/sfx.json`); eventos sonoros do modelo: `gancho, troca, chip, texto_tela, cta, drop`.
- Cor: lift/gamma/gain RGB, contraste em S (`con`), saturação (`sat`), proteção de pele (`pele`), luma-alvo (`alvo`), força do branco (`wb`) (`cor_looks.json`); exporta `.cube` (`cor.py:7`).
- Zona segura do overlay: topo 285 px, base 440 px, direita 120, esquerda 60, em 1080x1920 (`qa/zona_segura.py:1`). Portanto o texto de legenda cabe em **y entre 0,15 e 0,75 da altura**.
- Movimento medido por clipe a cada 0,5 s: tremor, pan, nitidez (`movimento.py`): `LIMIAR_ESTAB` 1,5 px, `LIMIAR_FORTE` 4,0 px, `PAN_CHICOTE` 900 px/s, `NITIDEZ_BORRADO` 0,45.

**Conclusão da seção 2:** o motor já tem muito mais ingrediente (≈9 transições, 7 efeitos de cobertura, 7 fontes, 21 camadas de motion) do que os modos usam (frase + 5 números). O trabalho é **ligar o cardápio**, não inventar motor.

---

## 3. O sistema: modo = arquivo de dados

### 3.1 Princípios

1. **Um arquivo por modo**, em `memoria/modos/<id>.json`, versionado (já é onde ficam as 7 receitas). O mesmo arquivo alimenta o prompt do diretor, o resolvedor e o site (`/api/direcao` já devolve `modos` a partir de `loja.modo(n)`, `api/direcao.py:165-170`).
2. **Compatível com v1**: `ajustes`, `sem_transicoes`, `sem_sons`, `zoom_max`, `fx_pico` continuam valendo. `versao: 2` acrescenta campos; modo sem `versao` é lido como hoje.
3. **Herança curta**: `base: "<id>"` (um nível) mescla como `modelo_com_modo` já mescla (`mescla()` em `loja.py:78-83`). Os 44 modos usam 6 bases.
4. **Blocos nomeados** (estilos de cor, legendas, pacotes de transição, som, movimento) vivem em arquivos de biblioteca; o modo só **cita** o id e sobrescreve o que precisar. Isso dá consistência (a mesma legenda em 6 modos) e permite ajustar a legenda em um lugar.
5. **O modo nunca vence a segurança**: zona segura, LUFS, true peak, QA de legenda x fala, olho_ia seguem valendo. Um modo que reprova no QA é bug do modo, não do material.
6. **O modo não inventa fato**: modos que usam IA generativa ou recriação de tela mantêm o rótulo de conceito (regra da casa).

### 3.2 Esquema (`modo.v2.json`)

```jsonc
{
  "versao": 2,
  "id": "viagem-golden",                 // slug sem acento
  "nome": "Viagem dourada",              // pt-BR, o que o dono lê
  "familia": "cinema-viagem",
  "descricao": "Luz de fim de tarde, câmera lenta nas paisagens, trilha que cresce.",   // uma linha
  "base": "cinema",                      // opcional: herda e sobrescreve
  "inspira": [{"quem":"...","url":"...","o_que":"..."}],
  "serve_para": {
    "tipos": ["viagem","evento"],        // TIPOS_VIDEO + novos
    "material": {"fala_pct":[0,0.35], "movimento":"alto|medio|baixo", "fps_min":24, "duracao_s":[15,60]},
    "evitar_quando": ["tremor_forte","sem_cobertura"]
  },
  "ritmo": {
    "plano_s": {"e1":3.4,"e2":2.8,"e3":2.2,"e4":1.6,"e5":1.1},   // duração média do plano por energia 1-5
    "corte": "batida|fala|mista",        // v1: ritmo.corte_na_batida
    "vel_fala": [1.05,1.10],             // faixa que o diretor pode usar
    "pausa_max": 0.30, "gap_bloco": 0.35, "gap_fala": 0.10
  },
  "cor": {
    "estilo": "E02",                     // id da biblioteca de estilos (seção 4.1)
    "ambiente": "respeitar|forcar:<look>",
    "grao": 0, "vinheta": 0.0,           // 0 a 3 (grão) e 0 a 1 (vinheta); hoje fixos
    "pele": 0.75                         // sobrescreve a proteção
  },
  "legenda": {
    "estilo": "G2",                      // biblioteca 4.2 (modelo do kit + fonte + animação)
    "y": 0.66, "tamanho": 84, "pal_pag": 3, "conf_min": 0.5,
    "enfase": "chave|nenhuma|todas",
    "idioma_extra": null                 // futuro: legenda dupla
  },
  "transicoes": {
    "pacote": "T-suave",                 // biblioteca 4.3
    "permitidas": ["fade","match","corte_batida","salto"],
    "proibidas": [],                     // = sem_transicoes v1
    "freq_max_por_30s": 4,               // limite de transição "grande" (nunca corte seco)
    "dur_escala": 1.0                    // multiplica as durações do modelo
  },
  "som": {
    "pacote": "S-cinema",                // biblioteca 4.4
    "trilha": {"clima":["épico","emocional"],"bpm":[70,100],"ganho_db":-15,"ducking_db":10,"desce_s":0.6,"sobe_s":0.9},
    "sfx": {"gancho":"abre","troca":null,"chip":null,"texto_tela":null,"cta":"cta","drop":"impacto"},
    "som_direto": "alto|medio|baixo",    // quanto do ambiente da gravação entra por cima da trilha
    "tom_sala_db": -48
  },
  "movimento": {
    "pacote": "M-contemplativo",         // biblioteca 4.5
    "zoom_max": 1.08,
    "efeitos": ["lento","punch"],        // subconjunto de cobertura permitido ao diretor
    "lento_vel": 0.5,                    // v1: cobertura.lento_vel; só vale se fps de captura >= 60
    "rampa": {"max_vel": 2.0, "por_30s": 1},
    "estabilizar": "auto|forte"
  },
  "abertura": {"modelo":"gancho2","dur":2.0,"tipo":"visual-primeiro|frase|pergunta|resultado-primeiro","y":0.42,"texto_max_palavras":5},
  "fecho":   {"modelo":"fecho","dur":3.0,"tipo":"logo+seguir|pergunta|loop|corte-seco","loop_visual":false},
  "diretor": {"frase":"viagem dourada: ... (até 40 palavras)", "proibe":["gíria"], "exige":["1 plano de abertura sem texto"]},
  "ia": false,
  "qa_extra": ["cor_medida:alvo_luma>=0.38"]
}
```

Notas:
- `diretor.frase` substitui o dicionário `MODOS` hardcoded em `direcao.py:24-33` (hoje é código; vira dado).
- `plano_s` é novo: hoje o ritmo vem de `pausa_max`/`gap_*` e do `intensidade` por bloco; **a duração de plano por energia não é parâmetro**, é decisão do diretor. Como isso exige ligação no resolvedor (seção 3.4), até lá `plano_s` vira dica no prompt (`"planos de cobertura em torno de X s no nível 3"`), que o diretor já consegue seguir porque ele escolhe `dur` das coberturas (prompt do diretor: "dur em segundos").
- `freq_max_por_30s`, `lento_vel` condicional a fps, `rampa.max_vel`: ver pontos de ligação.

### 3.3 Cinco regras de validação do arquivo (automáticas, no carregamento)

1. `id` único e igual ao nome do arquivo; `estilo`, `pacote` e `transicoes.permitidas` existem na biblioteca.
2. `permitidas` ∩ `proibidas` = vazio; `corte_batida` sempre pode (corte seco nunca é proibido).
3. `legenda.y` entre 0,15 e 0,75 e `tamanho` ≥ 56 px (legibilidade no celular, regra da casa de texto pequeno; limiar 56 [proposta], zona segura em `qa/zona_segura.py:1`).
4. `ritmo.vel_fala` dentro de 1,00 a 1,25 (acima de 1,25 a fala fica artificial [proposta]; prompt atual pede 1,08–1,15 e CLAUDE.md global 1,1x–1,2x).
5. `ia: true` só com `rotulo_conceito: true` (regra do dono: cena gerada é rotulada).

### 3.4 Pontos de ligação (para a equipe do motor, quando liberarem `services/`)

Nada abaixo foi feito; é o mapa do trabalho mínimo.

| Eixo novo | Onde ligar | Esforço |
|---|---|---|
| `diretor.frase` e `proibe/exige` | `etapas/direcao.py:24-33,57-62` (trocar dicionário por `loja.modo(...)`) | pequeno |
| `cor.estilo` + `grao` + `vinheta` | `etapas/cor.py` (aplicar deltas depois do look do ambiente) + `planos.py:375-376` e `comp.py:286` (hoje fixos) | médio |
| `legenda.estilo` | `resolvedor.py:803-821` (hoje devolve `modelo` do modelo de vídeo; passar a escolher entre `legenda`, `legenda_revelada`, `laboratorio`, `hud`) | médio |
| `transicoes.pacote/permitidas/freq_max` | já cobre `sem_transicoes`; acrescentar `permitidas` e contagem no resolvedor; `salto` entra no `transicoes` do modelo | pequeno |
| `som.pacote`, `sfx` por modo | `sfx` já é sobrescrevível pelo modelo (`m["sfx"]`); o pacote só gera esse dicionário | pequeno |
| `som.trilha.clima/bpm` | `catalogo.py:184` já expõe clima e bpm; filtrar a lista que vai ao diretor | pequeno |
| `movimento.lento_vel` condicional a fps | precisa do fps de captura do clipe (frente O1) e do tipo de leitura; `resolvedor.py:685-719` | médio |
| `ritmo.plano_s` | `resolvedor` (clamp de `dur` de cobertura por energia) | médio |
| `abertura/fecho` | `resolvedor` já pega `m["gancho"]`, `m["fecho"]` (`modelo`, `dur`, `y`); só trocar `modelo` por `gancho2`/`fecho2` e expor `tipo` ao diretor | pequeno |
| fps de saída | `comum.py:15` fixo 30; modos de cinema 24 fps exigiriam FPS por pedido; **decisão de produto**, ver 4.5 e 8 | grande, adiar |

---
## 4. As bibliotecas de blocos (o que os modos citam)

Tudo abaixo é [proposta] de dados; os nomes de fontes, efeitos, transições e SFX são os que **já existem** (seção 2.5). Onde um bloco precisa de capacidade que o motor ainda não tem, está marcado **(novo)**.

### 4.1 Estilos de cor (camada "estilo", por cima do look do ambiente)

Semântica proposta: o look do ambiente (já existe) corrige a luz medida; o estilo soma por cima: `lift` soma, `gain` multiplica, `con` e `sat` somam, `alvo` desloca a luma mediana-alvo. A pele continua protegida pelo parâmetro `pele` (regra de `cor.py:3-4`). Valores [proposta], calibrar com material real e conferir no QA `cor_medida`.

| id | nome | lift RGB | gain RGB | Δcon | Δsat | Δalvo | pele | grão | vinheta | quando |
|---|---|---|---|---|---|---|---|---|---|---|
| E01 | Neutro limpo | 0,0,0 | 1,1,1 | 0 | 0 | 0 | 0,7 | 0 | 0,00 | base segura |
| E02 | Dourado de fim de tarde | +.004,+.002,0 | 1.04,1.00,0.94 | +.06 | +.08 | +.02 | 0,75 | 1 | 0,10 | viagem, golden hour |
| E03 | Cinema teal-laranja suave | 0,+.006,+.012 | 1.04,1.00,0.94 | +.10 | -.02 | -.02 | 0,80 | 1 | 0,15 | cinema, narrativa |
| E04 | Pastel de filme | +.02,+.018,+.02 | 1.00,1.00,1.00 | -.06 | -.10 | +.04 | 0,85 | 1 | 0,00 | moda, beleza, leve |
| E05 | Contraste duro | 0,0,0 | 1,1,1 | +.18 | -.12 | -.04 | 0,60 | 1 | 0,20 | esporte, academia |
| E06 | Vivo de varejo | 0,0,0 | 1.00,1.00,0.98 | +.08 | +.14 | +.04 | 0,70 | 0 | 0,00 | supermercado, oferta |
| E07 | Comida quente | 0,0,0 | 1.05,1.00,0.93 | +.08 | +.16 | +.02 | 0,70 | 0 | 0,05 | comida |
| E08 | Analógico (VHS/Super 8) | +.03,+.02,+.01 | 1.04,0.99,0.93 | -.04 | -.08 | 0 | 0,70 | 3 | 0,30 | retrô |
| E09 | P&B noir | 0,0,0 | 1,1,1 | +.22 | -1.0 (sat 0) | -.04 | n/a | 2 | 0,25 | clipe, institucional dramático |
| E10 | Documental cru | 0,0,0 | 1,1,1 | +.04 | -.06 | -.02 | 0,80 | 1 | 0,00 | bastidor, fly-on-the-wall |
| E11 | Noite neon | +.01,0,+.02 | 1.03,0.98,1.04 | +.20 | +.12 | -.08 | 0,70 | 1 | 0,25 | clipe, noite |
| E12 | Azul institucional | 0,0,0 | 0.98,1.00,1.03 | +.06 | -.04 | +.02 | 0,80 | 0 | 0,00 | corporativo |
| E13 | Verão solar | 0,0,0 | 1.03,1.01,0.96 | +.06 | +.12 | +.04 | 0,70 | 0 | 0,05 | praia, lazer |
| E14 | Chapado de humor | 0,0,0 | 1,1,1 | +.04 | +.06 | +.02 | 0,70 | 0 | 0,00 | meme, esquete (cor nem aparece) |

Limites duros (todos os estilos): luma mediana final ≥ 0,28 (noir/neon podem baixar até 0,28; abaixo vira "escuro demais no celular" [proposta]); pele fora do vetorscópio quando o estilo baixar saturação do tom de pele em mais de 15% (`cor.py:PELE_LINHA` 123°); P&B (E09) trava `pele` (não há o que proteger) e desliga a checagem de tom de pele no QA.

**Cor sobre filmagem em Log:** estilo só se aplica **depois** da conversão Log→Rec.709 (contrato da frente O1). Aplicar `con +.18` sobre Log cru dá imagem lavada e depois estourada [proposta, regra de segurança]. Fonte sobre o que é Log e a necessidade de conversão: [Apple, ProRes no iPhone](https://support.apple.com/109041).

### 4.2 Legendas e tipografia

Modelos de legenda e fontes **já no kit**. `y` é fração da altura de 1920 px; texto precisa ficar dentro da zona segura (topo 285 px, base 440 px, esq. 60, dir. 120, `qa/zona_segura.py:1`), então **y entre 0,15 e 0,75**.

| id | nome | modelo do kit | fonte | tamanho px | y | palavras/pág | animação |
|---|---|---|---|---|---|---|---|
| G1 | Palavra ativa âmbar (a atual) | `legenda` | a do kit | 104 | 0,60–0,62 [código] | 2–3 | entra com escala+blur; palavra ativa âmbar, nunca pisca escura [código `legenda.js:1-3`] |
| G2 | Frase serifada | `legenda_revelada` | Instrument Serif (itálico na palavra-chave) | 76 | 0,66 | frase inteira (até 7) | revelação pela frente, sem karaokê |
| G3 | Karaokê MAIÚSCULO | `legenda` com variação (novo: cor ativa por prop) | Anton ou Montserrat 900, caixa alta | 112 | 0,58 | 2–4 | palavra ativa amarela `#FFD400`, anteriores brancas; 1,22x na palavra-chave (já existe `chave` 1,22em, `legenda.js:64`) |
| G4 | Discreta fiel | `legenda` com y/tamanho (props existem) | Inter 500 | 46 | 0,72 | 5–8 (linha) | só fade 0,1 s; sem ênfase |
| G5 | Datilografada | `laboratorio` | Special Elite | 54 | 0,70 | linha | digita letra a letra; carimbo no fim |
| G6 | Mono técnico | `hud` | JetBrains Mono 700 | 48 | 0,70 | linha | cursor, caixa fina |
| G7 | Manuscrita | novo (`rotulo` + Caveat Brush) | Caveat Brush | 96 | 0,56 | 2–3 | sublinhado desenhado na palavra-chave |
| G8 | Bloco gigante | `legenda` variante (novo) | Anton | 220 | 0,45 | 1 | uma palavra por vez, entra com impacto no beat |
| G9 | Sem legenda | nenhum | n/a | n/a | n/a | n/a | só títulos de gancho e fecho; QA `legenda_x_fala` desligado **(novo)** |

Referência de estilo de caixa-alta com ativa colorida, "Hormozi": as fontes que achei são ferramentas comerciais, **nenhuma é guia oficial** de Hormozi; descrevem 2 a 4 palavras por vez, MAIÚSCULAS, ativa amarela (às vezes verde) e Montserrat Black como fonte sugerida: [Choppity](https://www.choppity.com/tools/recreate-video-editing-style/alex-hormozi/), [FluxNote](https://fluxnote.io/guides/how-to-make-alex-hormozi-style-captions), [OpenClip](https://openclip.app/use-cases/hormozi-style-captions.md), [Kapwing](https://www.kapwing.com/explore/alex-hormozi-style-captions-template). Tratar como "estilo consagrado", não como especificação.

### 4.3 Pacotes de transição

Hoje o modelo oferece 8 saídas (`corte_batida, whip, mascara, aba71, impacto, match, flash, fade`) + `salto` no kit. `freq` = máximo de transições "grandes" (qualquer coisa que não seja corte seco) por 30 s [proposta]. O prompt do diretor já diz "varie; corte seco em todo bloco é amador" (`prompts/diretor.md`); o limite de frequência é novo.

| id | permitidas | proibidas | freq/30 s | dur_escala |
|---|---|---|---|---|
| T-nenhum | corte_batida | todas as outras | 0 | n/a |
| T-seco | corte_batida, match | resto | 1 | 1,0 |
| T-suave | corte_batida, fade, match | whip, impacto, flash, aba71, mascara | 3 | 1,2 |
| T-cinema | corte_batida, fade, match, salto, whip (1 por filme) | aba71, flash, impacto, mascara | 3 | 1,2 |
| T-energia | corte_batida, whip, flash, impacto, mascara, match | aba71, salto | 8 | 0,9 |
| T-marca | tudo de T-energia + aba71 (1 por filme, no fecho de bloco principal) | salto | 6 | 1,0 |
| T-filme | salto, fade, flash, match, corte_batida | whip, aba71 | 4 | 1,0 |
| T-humor | impacto, flash, whip, corte_batida | fade, aba71, salto | 10 | 0,8 |

Regra de causa (já existe como princípio no kit: "TRANSIÇÕES com causa", `transicao.js:1`): whip só entra se há movimento de câmera medido na saída/entrada (`movimento.direcao_do_movimento`, `PAN_MIN` 40 px/s, `movimento.py`); `match` só com semelhança de forma/posição. O modo **não desliga** essa regra.

### 4.4 Pacotes de som

SFX disponíveis hoje: `abre, chip, cta, embaralha, impacto, risco, whoosh_curto`. Eventos do modelo: `gancho, troca, chip, texto_tela, cta, drop` (`evento-reel.json`). Ganhos de trilha usados hoje: -13 a -19 dB. Ducking padrão: 10 dB, desce 0,4 s, sobe 0,55 s; cinema usa 0,6/0,9 [código].

| id | trilha (clima / bpm) | ganho dB | ducking (dB, desce s, sobe s) | sfx ativos | som direto | tom de sala dB |
|---|---|---|---|---|---|---|
| S-cinema | épico, emocional / 70–100 | -15 | 10, 0,6, 0,9 | gancho=abre, cta, drop=impacto | médio | -48 |
| S-viral | batida, hip-hop leve / 110–140 | -13 | 10, 0,4, 0,55 | todos | baixo | -48 |
| S-clean | neutra, minimalista / 80–110 | -17 | 10, 0,4, 0,55 | cta | médio | -48 |
| S-fala | quase ausente / 70–90 | -19 | 12, 0,4, 0,6 | cta | n/a (a voz é tudo) | -48 |
| S-direto | ambiente, textura / sem batida | -22 | 8, 0,5, 0,8 | nenhum | **alto** (ambiente da gravação) | -44 |
| S-detalhe | ASMR de comida e produto / sem batida | -21 | 8, 0,3, 0,5 | chip, cta | **alto** (som do detalhe, crocância) | -46 |
| S-lofi | lo-fi, vinil / 70–90 | -16 | 10, 0,5, 0,7 | cta | médio | -46 |
| S-clipe | a música é o filme / dada pelo dono | -6 (mix manda; voz some ou vira trecho) | sem ducking | gancho=abre, drop=impacto | baixo | n/a |
| S-humor | leve, cômica / 90–120 | -18 | 10, 0,3, 0,4 | impacto, risco, troca | médio | -48 |

`som direto` alto/médio/baixo corresponde a `cobertura.som_direto_db` do modelo (hoje -12 a -16 dB por momento, `evento-reel.json`); alto = -8 a -10 dB, médio = -12 a -14, baixo = -18 [proposta].

### 4.5 Pacotes de movimento

Efeitos de cobertura existentes: `punch, lento, rampa, congela, janela, atras, nenhum`. Estabilização automática acima de 1,5 px de tremor (`LIMIAR_ESTAB`), trecho evitado acima de 4,0 px (`LIMIAR_FORTE`) [código `movimento.py`].

| id | zoom_max | efeitos permitidos | lento_vel | rampa | estabilização | observação |
|---|---|---|---|---|---|---|
| M-estavel | 1,04 | nenhum | n/a | não | forte (alvo ≤ 1,0 px) **(novo)** | institucional, fala |
| M-contemplativo | 1,06 | lento, nenhum | 0,5 | não | auto | paisagem, respiro |
| M-doc | 1,08 | punch (raro), nenhum | n/a | não | **leve** (só acima de 4,0 px) **(novo)**: câmera na mão fica viva | bastidor |
| M-dinamico | 1,18 | punch, rampa, lento, atras | 0,5 | 1 por 10 s, vel máx 1,6 (já é 1,6 em `resolvedor.py:710`) | auto | criativo, vlog |
| M-impacto | 1,24 | punch, congela, rampa, janela | 0,4 | 1 por 8 s | auto | ultra, esporte |
| M-esporte | 1,20 | rampa, lento, punch | 0,25 se captura ≥ 120 fps, senão 0,5 | rampa 1,0→0,4→1,0 em 1,2 s **(novo)** | forte | academia, esporte |
| M-produto | 1,10 | lento, janela, congela | 0,5 | não | forte | varejo, comida, detalhe |
| M-humor | 1,24 | punch, congela, janela | n/a | não | auto | meme, esquete |

**Regra de câmera lenta (obrigatória em qualquer modo):** `lento_vel` abaixo de 1,0 só vale com captura em fps maior que 1/`lento_vel` vezes o fps de saída. Em 30 fps de saída: 0,5x pede captura ≥ 60 fps; 0,25x pede ≥ 120 fps. Sem isso o plano vira quadro repetido (engasgo) ou exige interpolação (artefato). O ffmpeg tem interpolação (`minterpolate`) [fonte: [documentação dos filtros do ffmpeg](https://ffmpeg.org/ffmpeg-filters.html#minterpolate)], mas é lenta em CPU e gera artefatos em movimento complexo; **não recomendo como padrão** [proposta; custo medido: não confirmado nesta máquina]. Apple documenta captura em câmera lenta no iPhone, 1080p em 120 ou 240 fps [fonte: [Apple, gravar vídeos em câmera lenta](https://support.apple.com/guide/iphone/take-slow-motion-videos-iph6e0fc4a6e/ios); não consegui abrir a página para citar o trecho: **não confirmado literalmente**].

### 4.6 Tipos de abertura e de fecho

| id | abertura (2 primeiros segundos) | por que existe |
|---|---|---|
| A-resultado | mostra o melhor plano do final primeiro, depois volta ("e foi assim que ficou") | gancho por promessa visual |
| A-frase | frase curta em tela (até 5 palavras) sobre o primeiro plano | gancho por texto (o `gancho` atual, 2,3 s) |
| A-pergunta | pergunta em tela + fala do dono já no frame 1 | gancho por curiosidade |
| A-visual | 1 a 2 s sem texto, plano mais bonito, som alto | gancho por beleza (cinema, comida) |
| A-som | começa em áudio forte (impacto, batida, palavra) com tela preta ou quase | gancho por som |
| A-corte-meio | começa no meio da ação / da frase, sem preâmbulo | gancho por urgência (vlog, humor) |

| id | fecho | uso |
|---|---|---|
| F-logo-seguir | logo animada + "segue" (o `fecho` atual, 3,6 s) | padrão creat.MTT |
| F-pergunta | pergunta ao público para comentar | engajamento (esporte, humor) |
| F-loop | último plano casa com o primeiro (corte invisível) para o vídeo reiniciar | clipe, minimalista |
| F-seco | corta sem fecho animado (3 a 5 quadros de silêncio no máximo) | humor, vlog |
| F-assinatura | selo curto "Aba 71" + logo 1,5 s | marca d'água de autoria |
| F-oferta | preço/endereço/validade em cartão fixo 3 s | varejo |

Retenção é regra do dono (CLAUDE.md global: gancho no início, nada de ar morto, novidade a cada poucos segundos, fecho com convite claro). Por isso **nenhum modo termina sem convite**, exceto `F-seco` e `F-loop`, que só aparecem em modos de humor, clipe e minimalista, e carregam a nota "convite vai na legenda do post".

---

## 5. Os modos (46 modos em 13 famílias + 6 modos-mãe)

### 5.0 Leitura das tabelas

Cada modo é um arquivo. Escrevo os valores dos nove eixos em uma linha cada. `e1/e3/e5` = duração média do plano de cobertura (s) nos níveis de energia 1, 3 e 5. `corte`: B = na batida da trilha, F = na fala, M = mista. `vel` = faixa de `vel_fala`. Os ids de bloco (E, G, T, S, M, A, F) são os da seção 4.

Referências (coluna "Inspira"): onde há fonte que consegui abrir, vai o link e a marca **[fonte]**. Onde é só o canal oficial do creator, vai o link e **[canal; estilo não verificado por mim vídeo a vídeo]**. Eu não vi nenhum vídeo desses creators nesta pesquisa; as descrições de estilo vêm de resumos de terceiros (todos comerciais ou de blog), e **a similaridade é inspiração, não cópia** (regra da casa: ousadia na forma, verdade no conteúdo).

Fontes de estilo que consegui abrir, com o que cada uma sustenta:
- Casey Neistat: jump cuts, som agressivo, hip-hop instrumental com bateria forte, câmera posicionada fisicamente [fonte: [livecounts, gramática visual dos cortes de b-roll](https://livecounts.io/blog/content-creation/the-visual-grammar-of-casey-neistats-b-roll-cuts)].
- Peter McKinnon: edição "com intenção", filosofia de ritmo e fluxo, aberturas com transições "grunge" [fonte: [Async](https://async.com/blog/who-is-peter-mckinnon/)].
- Sam Kolder: jogo de luz e sombra, cor, transições, texto e câmera lenta [fonte: [resumo do tutorial "KOLD My Year"](https://recapio.com/digest/how-to-edit-like-sam-kolder-kold-my-year-2016-transitions-text-effects-color-grading-more-by-justin-)].
- MrBeast: guia interno de produção (vazado em 2024): três métricas (CTR, duração média de visualização, percentual médio), primeiro minuto é o mais crítico; o próprio Tubefilter diz que o documento pode ser genérico de YouTube longo [fonte: [Tubefilter](https://www.tubefilter.com/2024/09/17/mrbeast-internal-production-guide-leaked-key-points/), [Passionfruit](https://passionfru.it/?p=81151)]. Ritmo = velocidade com que entra informação nova, não velocidade de corte, segundo Mario Joos, ex-estrategista de retenção [fonte: [Vidpros](https://vidpros.com/retention-editing-what-you-can-learn-from-mario-joos/)].
- "Pattern interrupt a cada 4 segundos" (MrBeast): vem de blog de contagem, **[não confirmado em fonte primária]**.

### 5.1 Modos-mãe (os 7 atuais, mantidos como bases; nenhum some)

| id | vira | uso no sistema |
|---|---|---|
| `auto` | "O editor decide" | passa a escolher entre os 46 pelo algoritmo da seção 6; o dono nunca precisa escolher |
| `criativo` | base | M-dinamico, T-energia, S-viral, G1 |
| `ultra` | base | M-impacto, T-marca, S-viral, G3; ritmo mais rápido da casa (`pausa_max` 0,14 s, `gap_bloco` 0,16 s) |
| `cinema` | base **com cor de cinema finalmente** | E03, T-cinema, S-cinema, M-contemplativo, G2 |
| `clean` | base | T-seco, S-clean, M-estavel, G4 |
| `serio` | base | T-nenhum, S-clean, M-estavel, G4 |
| `fala` | base | T-nenhum, S-fala, M-estavel, G4; `vel_fala` 1,05–1,12 |
| `ia` | **não é estilo; vira marcador** `ia: true` (ortogonal) | combina com qualquer modo; pergunta "pode gerar cena por IA?" já existe no site. Hoje é rótulo (seção 2.3). |

### 5.2 Família 1: Cinema de viagem

**1. `viagem-dourada` — Viagem dourada.** Luz de fim de tarde, câmera lenta nas paisagens, trilha que cresce.
- Inspira: Sam Kolder [fonte, resumo de tutorial, seção 5.0]; [canal](https://www.youtube.com/@SamKolder) [canal; estilo não verificado].
- Ritmo: e1/e3/e5 = 3,4 / 2,4 / 1,4 s; corte M; vel 1,05–1,10; pausa_max 0,32; gap_bloco 0,38.
- Cor: E02, grão 1, vinheta 0,10, ambiente respeitar. Legenda: G2, y 0,66, 76 px.
- Transições: T-cinema, freq 3. Som: S-cinema (trilha emocional, 80–100 bpm, -15 dB), som direto médio.
- Movimento: M-contemplativo, zoom_max 1,06, lento 0,5 só com captura ≥ 60 fps. Abre A-visual 2,0 s; fecha F-logo-seguir 3,0 s.
- Serve: viagem, evento ao ar livre; material com muita cobertura e pouca fala (fala_pct 0–0,3); evitar com tremor forte.

**2. `viagem-aventura` — Aventura em movimento.** Cortes rápidos na batida, whip e rampa, mundo em cor viva.
- Inspira: Casey Neistat [fonte, jump cuts e hip-hop de bateria forte]; Sam Kolder.
- Ritmo: 2,6 / 1,5 / 0,8 s; corte B; vel 1,10–1,15; pausa_max 0,18; gap_bloco 0,20.
- Cor: E13, grão 0, vinheta 0,05. Legenda: G3, y 0,58, 112 px, 2–3 palavras.
- Transições: T-energia, freq 8 (whip exige pan medido ≥ 40 px/s). Som: S-viral (110–128 bpm, -13 dB), sfx todos.
- Movimento: M-dinamico, zoom_max 1,18, efeitos punch, rampa, lento. Abre A-corte-meio 1,8 s; fecha F-pergunta 2,5 s.
- Serve: viagem, passeio, evento dinâmico; movimento alto, fala 0,1–0,4.

**3. `viagem-poema` — Viagem em poema.** Voz em off e imagem lenta; quase sem texto; respira.
- Inspira: filmes de marca em estilo documental tipo Patagonia [canal](https://www.youtube.com/@patagonia) [canal; estilo não verificado].
- Ritmo: 4,2 / 3,0 / 2,0 s; corte F (voz em off manda); vel 1,00–1,05; pausa_max 0,45; gap_bloco 0,5.
- Cor: E04 + ambiente respeitar, grão 1. Legenda: G2, y 0,68, 70 px, só palavra-chave (ou G9).
- Transições: T-suave, freq 3 (dur_escala 1,4). Som: S-direto + trilha -20 dB, sfx nenhum.
- Movimento: M-contemplativo, lento 0,5. Abre A-visual 2,5 s; fecha F-logo-seguir 2,5 s.
- Serve: paisagem, institucional afetivo; precisa de narração gravada.

**4. `viagem-teal` — Cinema teal-laranja.** Cor de cinema: sombras frias, pele quente, planos compostos.
- Inspira: Peter McKinnon [fonte, edição intencional]; [canal](https://www.youtube.com/@PeterMcKinnon).
- Ritmo: 3,0 / 2,0 / 1,2 s; corte M; vel 1,05–1,10; pausa_max 0,30; gap_bloco 0,34.
- Cor: E03, grão 1, vinheta 0,15, pele 0,80. Legenda: G2 (ou G4), y 0,70.
- Transições: T-cinema, freq 3 (salto 1 vez). Som: S-cinema, 85–105 bpm.
- Movimento: M-contemplativo + punch raro, zoom_max 1,08. Abre A-resultado 2,2 s; fecha F-logo-seguir.
- Serve: viagem, institucional premium, evento noturno com luz boa; evitar sobre baixa luz com ruído.

### 5.3 Família 2: Comercial de varejo (supermercado, loja)

**5. `varejo-oferta` — Oferta do dia.** Preço grande, corte seco, energia de tabloide em movimento.
- Inspira: tabloide de supermercado e propaganda de rádio-TV de varejo; **sem creator único**; referências de segmento: [Assaí](https://www.youtube.com/@assaiatacadista), [Carrefour Brasil](https://www.youtube.com/@carrefourbrasil) [canais; estilo não verificado].
- Ritmo: 2,0 / 1,2 / 0,7 s; corte B; vel 1,10–1,15; pausa_max 0,15; gap_bloco 0,16.
- Cor: E06, grão 0, vinheta 0. Legenda: G8 (preço) + G3 (frase), y 0,50/0,62.
- Transições: T-energia sem aba71, freq 8, impacto no preço. Som: S-viral 120–135 bpm, -13 dB, sfx impacto no preço.
- Movimento: M-produto + punch no produto, zoom_max 1,20. Abre A-frase "OFERTA" 1,8 s; fecha F-oferta 3,0 s (preço, validade).
- Serve: anuncio; muitos planos de produto, pouca fala; regra: nunca inventar preço, usa só o que o dono forneceu (campo `proibido: preços` existe no site).

**6. `varejo-vitrine` — Vitrine limpa.** Produto no centro, luz de loja corrigida, calma que passa confiança.
- Inspira: filmes de produto de marcas premium, ex. [Apple](https://www.youtube.com/@Apple) [canal; estilo não verificado].
- Ritmo: 3,0 / 2,2 / 1,6 s; corte M; vel 1,05; pausa_max 0,28; gap_bloco 0,32.
- Cor: E06 com Δsat reduzido a +.06, grão 0. Legenda: G4, y 0,72.
- Transições: T-seco, freq 1. Som: S-clean, 90–105 bpm.
- Movimento: M-produto, lento, janela. Abre A-visual 1,8 s; fecha F-oferta.
- Serve: anuncio de produto, marca própria; material 4K estável.

**7. `varejo-reporter` — Repórter de loja.** Fala para a câmera andando pelos corredores, com prova do que cita.
- Inspira: vlog de varejo e jornalismo de rua; Casey Neistat para o ritmo de andar e falar [fonte].
- Ritmo: 2,4 / 1,6 / 1,0 s; corte F; vel 1,10–1,15; pausa_max 0,18; gap_bloco 0,20.
- Cor: E06, ambiente `loja`, grão 0. Legenda: G3, y 0,60, 100 px.
- Transições: T-energia limitado (whip, match), freq 5. Som: S-viral leve (-17 dB), som direto médio.
- Movimento: M-dinamico, `destaque_pessoa: true` (já existe no prompt) em blocos de fala. Abre A-pergunta 1,8 s; fecha F-pergunta.
- Serve: evento, bastidor de loja, empresa; fala_pct 0,4–0,8, rosto presente.

**8. `varejo-hortifruti` — Hortifrúti vivo.** Close que dá fome: cor viva, folha, gota, crocância.
- Inspira: Tasty [canal](https://www.youtube.com/@buzzfeedtasty) [canal; estilo não verificado].
- Ritmo: 2,2 / 1,5 / 0,9 s; corte B; vel n/a. Cor: E07 + E06 (Δsat +.14), grão 0, vinheta 0,05. Legenda: G3 só palavra-chave (1 por plano).
- Transições: T-seco + match (forma redonda), freq 2. Som: S-detalhe (som direto alto, -21 dB).
- Movimento: M-produto, lento 0,5 só ≥ 60 fps, zoom_max 1,10. Abre A-som (crocância) 1,6 s; fecha F-oferta.
- Serve: comida e hortifrúti; macro; evitar luz de gôndola com cor mista sem `wb` forte (a cor corrige: `loja` wb 0,75 [código]).

### 5.4 Família 3: Bastidor documental

**9. `bastidor-mosca` — Mosca na parede.** Câmera na mão viva, som da sala, sem enfeite, e uma legenda só quando precisa.
- Inspira: documentário de observação; [Netflix, Chef's Table](https://www.netflix.com/title/80007945) para fotografia documental **[canal/título; link não verificado]**.
- Ritmo: 4,0 / 2,8 / 1,8 s; corte F; vel 1,00–1,05; pausa_max 0,40; gap_bloco 0,45.
- Cor: E10, grão 1, vinheta 0. Legenda: G4, y 0,72, 46 px, só falas importantes.
- Transições: T-nenhum + fade (3). Som: S-direto (-22 dB, som direto alto).
- Movimento: M-doc, estabilização leve (câmera na mão é parte do estilo; só corrige > 4,0 px). Abre A-corte-meio 2,0 s; fecha F-seco ou F-logo-seguir.
- Serve: bastidor, evento; muita fala ambiente; fala_pct 0,1–0,5.

**10. `bastidor-making-of` — Making of.** Antes e depois, processo em cartelas, montagem rápida da mão na massa.
- Inspira: making-of de campanha; sem referência única. [canal Peter McKinnon](https://www.youtube.com/@PeterMcKinnon) para "processo" [canal; estilo não verificado].
- Ritmo: 2,6 / 1,6 / 0,9 s; corte B; vel 1,10. Cor: E01, grão 0. Legenda: G5 (datilografada) para rótulos, G1 na fala.
- Transições: T-filme (salto, match, flash), freq 5. Som: S-viral médio (-15 dB), som direto médio.
- Movimento: M-dinamico, congela no "ficou pronto". Abre A-resultado 2,0 s (o final primeiro); fecha F-assinatura.
- Serve: bastidor de produção, creat.MTT mostrando processo; combina com sede 3D e bonecos (regra da casa: usar antes de inventar).

**11. `bastidor-dia` — Um dia na creat.MTT.** Hora no relógio, time-lapse, fala curta, cortes na batida.
- Inspira: vlog de rotina [canal Ali Abdaal](https://www.youtube.com/@AliAbdaal) [canal; estilo não verificado]; Emma Chamberlain para ritmo.
- Ritmo: 2,4 / 1,5 / 0,9 s; corte B; vel 1,12. Cor: E01 + E06 leve. Legenda: G6 (relógio mono) + G1 na fala.
- Transições: T-energia, freq 6. Som: S-viral lo-fi (100 bpm, -15 dB).
- Movimento: M-dinamico; rampa em time-lapse (aceleração 8x, novo). Abre A-frase com hora ("07:40") 1,6 s; fecha F-logo-seguir.
- Serve: daily vlog, bastidor; material de várias horas do dia.

**12. `bastidor-confissao` — Confissão.** Entrevista num canto, cobertura entra sobre a fala, tom íntimo.
- Inspira: documentário de entrevista (Chef's Table) **[não verificado]**.
- Ritmo: 4,2 / 3,0 / 2,0 s; corte F; vel 1,00–1,05; pausa_max 0,45. Cor: E10 + E03 leve (Δcon +.04), grão 1, vinheta 0,15. Legenda: G2, y 0,68.
- Transições: T-suave, freq 3. Som: S-cinema suave (-18 dB), som direto baixo, tom de sala constante (-48).
- Movimento: M-estavel + `fundo_desfocado` (existe no prompt) na fala. Abre A-pergunta 2,0 s; fecha F-pergunta.
- Serve: depoimento, entrevista; fala_pct > 0,6.

### 5.5 Família 4: Vlog

**13. `vlog-jump` — Corte seco de vlog.** Sem respiro: corta toda pausa, zoom de ênfase, humor leve.
- Inspira: Emma Chamberlain [canal](https://www.youtube.com/@emmachamberlain) [canal; estilo não verificado].
- Ritmo: 2,0 / 1,2 / 0,7 s; corte F; vel 1,15; pausa_max 0,10; gap_bloco 0,10.
- Cor: E01 + grão 1. Legenda: G3, y 0,60, 104 px. Transições: T-seco, freq 1 (jump cut por padrão, zoom punch 1,12 como "troca").
- Som: S-viral lo-fi (-17 dB), sfx troca/risco. Movimento: M-dinamico, zoom_max 1,15. Abre A-corte-meio 1,5 s; fecha F-seco.
- Serve: daily_vlog, fala para a câmera; fala_pct > 0,6.

**14. `vlog-diario` — Diário manuscrito.** Texto à mão, tom de caderno, cor quente.
- Inspira: vlogs "diário"; **sem creator único**. Cor/legenda: Caveat Brush (fonte já no kit).
- Ritmo: 3,0 / 2,0 / 1,2 s; corte M; vel 1,05–1,10. Cor: E02 suave (Δsat +.04), grão 2, vinheta 0,15. Legenda: G7, y 0,56, 96 px.
- Transições: T-suave + salto, freq 3. Som: S-lofi (-16 dB), som direto médio. Movimento: M-doc.
- Abre A-pergunta 2,0 s; fecha F-logo-seguir. Serve: daily_vlog afetivo, viagem pessoal.

**15. `vlog-rua` — Rua e batida.** Andar, falar, cortar na bateria; cidade como cenário.
- Inspira: Casey Neistat [fonte]; [canal](https://www.youtube.com/@CaseyNeistat).
- Ritmo: 2,2 / 1,3 / 0,8 s; corte B; vel 1,10–1,15. Cor: E05 leve (Δcon +.10), ambiente `rua_dia`, grão 1. Legenda: G3, y 0,58.
- Transições: T-energia, whip só com pan medido. Som: S-viral hip-hop instrumental 85–100 bpm, -13 dB.
- Movimento: M-dinamico + rampa, zoom_max 1,18. Abre A-corte-meio 1,6 s; fecha F-pergunta.
- Serve: vlog, passeio; movimento alto.

**16. `vlog-conversa` — Papo reto.** A fala é o filme, com cobertura mínima; zero enfeite.
- Inspira: podcast em vídeo e fala direta; [Alex Hormozi](https://www.youtube.com/@AlexHormozi) para legenda [fonte da legenda, 4.2].
- Ritmo: 4,5 / 3,2 / 2,2 s; corte F; vel 1,10–1,15; pausa_max 0,22; gap_bloco 0,25. Cor: E10, grão 0. Legenda: G3, y 0,62.
- Transições: T-seco. Som: S-fala, -19 dB. Movimento: M-estavel + zoom de ênfase 1,06 a cada 8–10 s (troca de enquadramento, não efeito).
- Abre A-frase com a tese da fala 2,0 s; fecha F-pergunta. Serve: fala; fala_pct > 0,8; **é o modo natural da regra do dono: "a fala do Marcos é a base"** (CLAUDE.md global).

### 5.6 Família 5: Esporte e academia

**17. `gym-pesado` — Pesado.** Contraste duro, câmera lenta no esforço, impacto no peso.
- Inspira: [Gymshark](https://www.youtube.com/@gymshark), [CBum](https://www.youtube.com/@cbum) [canais; estilo não verificado].
- Ritmo: 1,8 / 1,0 / 0,5 s; corte B; vel 1,10. Cor: E05, ambiente `academia` (sat 0,96 [código]), grão 1, vinheta 0,20. Legenda: G8 nos números ("12 REPS"), G3 na fala.
- Transições: T-energia (impacto, flash). Som: S-viral 130–145 bpm, -12 dB, drop=impacto no pico.
- Movimento: M-esporte, lento 0,25 se ≥ 120 fps, rampa 1,0→0,4→1,0. Abre A-som 1,2 s; fecha F-pergunta.
- Serve: academia, treino; evitar baixa luz sem `alvo` ajustado.

**18. `gym-treino` — Treino explicado.** Mostra, fala o que corrigir, mostra de novo em lenta.
- Inspira: [Ali Abdaal](https://www.youtube.com/@AliAbdaal) para estrutura didática [canal; estilo não verificado].
- Ritmo: 2,8 / 1,8 / 1,1 s; corte F; vel 1,10. Cor: E05 suave (Δcon +.10). Legenda: G4 + rótulos G6 (mono, "SÉRIE 1/3").
- Transições: T-seco, freq 2 (match entre repetições). Som: S-clean. Movimento: M-esporte (lento 0,5 na repetição).
- Abre A-frase 1,8 s; fecha F-logo-seguir. Serve: academia, esporte didático; fala_pct 0,3–0,6.

**19. `esporte-highlight` — Melhores momentos.** Rampa de velocidade, replay, placar em motion.
- Inspira: [Red Bull](https://www.youtube.com/@redbull), [Nike Football](https://www.youtube.com/@nikefootball) [canais; estilo não verificado].
- Ritmo: 1,6 / 0,9 / 0,5 s; corte B; Cor: E05 + E13 se campo ao sol; grão 0. Legenda: G8 (placar, nome), G9 na ação.
- Transições: T-energia com whip/impacto. Som: S-viral 135 bpm, -12 dB, som direto médio (torcida -14 dB [código `torcida`]).
- Movimento: M-esporte, congela no gol/ponto. Abre A-resultado (melhor lance) 1,5 s; fecha F-pergunta.
- Serve: evento esportivo; movimento alto; câmera 60 fps+ ideal.

**20. `esporte-epico` — Épico de superação.** Câmera lenta, fala em off, trilha que sobe até o ponto alto.
- Inspira: filmes de campanha esportiva (Nike) [canal](https://www.youtube.com/@nike) [canal; estilo não verificado].
- Ritmo: 3,4 / 2,2 / 1,2 s (acelera ao longo do filme); corte M; vel 1,00–1,05. Cor: E03 + E05 (Δcon +.14), grão 1, vinheta 0,20. Legenda: G2, y 0,66.
- Transições: T-cinema. Som: S-cinema, 90 bpm→130 bpm (trilha que sobe, `drop_em` já existe, `resolvedor.py:781`). Movimento: M-esporte, lento 0,25–0,5.
- Abre A-visual 2,0 s; fecha F-logo-seguir. Serve: depoimento esportivo, prova, superação.

### 5.7 Família 6: Comida

**21. `comida-close` — Close que dá fome.** Detalhe, vapor, som de cada coisa.
- Inspira: Tasty [canal]; Bon Appétit [canal](https://www.youtube.com/@bonappetit) [canais; estilo não verificado].
- Ritmo: 2,4 / 1,6 / 1,0 s; corte B. Cor: E07, grão 0. Legenda: G9 ou G4. Transições: T-seco + match.
- Som: S-detalhe, som direto alto. Movimento: M-produto, lento 0,5 (≥ 60 fps). Abre A-som 1,6 s; fecha F-oferta ou F-loop.
- Serve: comida; macro.

**22. `comida-receita` — Receita em 30 segundos.** Visão de cima, passos numerados, tempo real acelerado.
- Inspira: Tasty [canal; estilo não verificado].
- Ritmo: 1,8 / 1,2 / 0,8 s; corte B. Cor: E07. Legenda: G5 (passos datilografados "1.", "2.") em y 0,20 (topo). Transições: T-seco.
- Som: S-lofi + sfx chip por passo. Movimento: M-produto, aceleração 4x em preparo (novo). Abre A-resultado 1,8 s; fecha F-loop.
- Serve: comida, receita.

**23. `comida-chef` — Chef cinema.** Luz baixa, gesto lento, voz do chef.
- Inspira: Chef's Table **[não verificado]**.
- Ritmo: 4,0 / 2,8 / 1,8 s; corte F; vel 1,00–1,05. Cor: E03 + E07 (mix de sombra fria e prato quente), grão 1, vinheta 0,20. Legenda: G2.
- Transições: T-cinema. Som: S-cinema + S-detalhe misturado (som direto alto). Movimento: M-contemplativo.
- Abre A-visual 2,5 s; fecha F-logo-seguir. Serve: restaurante, depoimento de chef.

### 5.8 Família 7: Moda e beleza

**24. `moda-editorial` — Editorial.** Cor pastel de revista, texto no gancho "atrás da pessoa", respiro.
- Inspira: [Vogue](https://www.youtube.com/@Vogue) [canal; estilo não verificado]. O recurso `gancho.atras_da_pessoa` já existe e foi pensado "capa de revista" (`prompts/diretor.md`).
- Ritmo: 3,2 / 2,2 / 1,4 s; corte M; vel 1,05. Cor: E04, grão 1, vinheta 0. Legenda: G2, y 0,68. Transições: T-suave.
- Som: S-clean 100–110 bpm. Movimento: M-contemplativo. Abre A-resultado com `atras_da_pessoa: true`; fecha F-assinatura.
- Serve: moda, beleza, retrato; pessoa em quadro, máscara de pessoa funcionando.

**25. `moda-lookbook` — Lookbook rápido.** Um look por batida, nome em tela, preço no fim.
- Inspira: lookbooks de e-commerce; sem creator único.
- Ritmo: 1,4 / 0,9 / 0,5 s; corte B (1 look por 4 batidas). Cor: E04 + Δsat +.06. Legenda: G8 (nome do look), y 0,72. Transições: T-energia limitado (match, flash).
- Som: S-viral 118 bpm, -14 dB. Movimento: M-dinamico. Abre A-som 1,2 s; fecha F-oferta. Serve: anuncio de coleção.

**26. `moda-getready` — Arrume-se comigo.** Fala e cobertura de produto; intimidade e ritmo de conversa.
- Inspira: [Emma Chamberlain] vlog de rotina. Ritmo: 2,6 / 1,8 / 1,1 s; corte F; vel 1,12. Cor: E04 + E02 leve. Legenda: G7, y 0,56.
- Transições: T-seco. Som: S-lofi. Movimento: M-doc. Abre A-pergunta; fecha F-logo-seguir. Serve: beleza, daily vlog; fala_pct 0,5–0,8.

### 5.9 Família 8: Institucional

**27. `inst-corporativo` — Corporativo sóbrio.** Cinza-azulado, texto claro, sem gíria, sem mascote.
- Inspira: filmes institucionais; sem creator único. Base: `serio`.
- Ritmo: 4,0 / 3,0 / 2,2 s; corte F; vel 1,00–1,05; pausa_max 0,35; gap_bloco 0,38. Cor: E12, grão 0. Legenda: G4, y 0,72. Transições: T-nenhum + fade.
- Som: S-clean 85 bpm, -18 dB, sfx nenhum. Movimento: M-estavel. Abre A-frase 2,0 s; fecha F-logo-seguir.
- Serve: empresa; fala_pct 0,4–0,8; evitar humor.

**28. `inst-manifesto` — Manifesto de marca.** Voz em off, imagens de pessoas trabalhando, 1 frase de impacto por bloco.
- Inspira: filmes de marca [Patagonia](https://www.youtube.com/@patagonia) [canal; estilo não verificado].
- Ritmo: 3,6 / 2,4 / 1,6 s; corte F; vel 1,00–1,05. Cor: E10 + E03 leve. Legenda: G2 (frase de impacto), y 0,66. Transições: T-cinema.
- Som: S-cinema (-17 dB), som direto médio. Movimento: M-contemplativo. Abre A-visual 2,2 s; fecha F-logo-seguir 3,5 s.
- Serve: empresa, evento institucional, aniversário de marca.

**29. `inst-depoimento` — Depoimento de cliente.** Rosto, voz limpa, cobertura do produto/serviço.
- Inspira: casos de sucesso. Ritmo: 4,2 / 3,0 / 2,0 s; corte F; vel 1,00–1,05. Cor: E12 + E04 leve, ambiente respeitar. Legenda: G4 + nome/função em chip (existe `chip`).
- Transições: T-nenhum + fade. Som: S-fala. Movimento: M-estavel. Abre A-pergunta; fecha F-logo-seguir.
- Serve: depoimento; fala_pct > 0,7. **Nunca nome de terceiros em tela; função em vez de nome** (regra do prompt do diretor).

### 5.10 Família 9: Humor e meme

**30. `humor-esquete` — Esquete.** Timing de comédia, silêncio como piada, corte na reação.
- Inspira: [Porta dos Fundos](https://www.youtube.com/@portadosfundos) [canal; estilo não verificado].
- Ritmo: 3,0 / 1,6 / 0,8 s; corte F; vel 1,00–1,08; pausa_max 0,6 (a pausa cômica sobrevive!). Cor: E14, grão 0. Legenda: G4. Transições: T-seco.
- Som: S-humor, sfx impacto na punchline. Movimento: M-humor, punch 1,24 só no remate. Abre A-corte-meio; fecha F-seco.
- Serve: bastidor engraçado, equipe, campanhas de personalidade.

**31. `humor-zoom` — Meme com zoom.** Punch-in no rosto, congela, texto gigante.
- Inspira: edição de meme/reação; Casimiro/CazéTV como referência de corte de reação [canal](https://www.youtube.com/@CazeTV) [canal; estilo não verificado].
- Ritmo: 1,8 / 1,0 / 0,6 s; corte M; vel 1,15. Cor: E14. Legenda: G8, y 0,45. Transições: T-humor.
- Som: S-humor. Movimento: M-humor, congela + zoom 1,24. Abre A-corte-meio 1,0 s; fecha F-seco. Serve: reação, cortes curtos; **rosto de terceiros: respeitar proibido**.

**32. `humor-reacao` — Reação.** Dois lados da tela, pessoa reagindo, texto de comentário.
- Inspira: vídeo de reação. Ritmo: 2,4 / 1,4 / 0,8 s; corte F. Cor: E14. Legenda: G3, y 0,62. Transições: T-humor limitado. Som: S-humor.
- Movimento: M-humor; layout de tela dividida **(novo)**. Abre A-frase; fecha F-pergunta. Serve: depoimento leve, bastidor.

**33. `humor-pov` — POV.** "Quando você...", plano subjetivo, uma ideia, 8 a 15 s.
- Inspira: formato POV de Reels; sem creator único. Ritmo: 2,0 / 1,2 / 0,8 s; corte M. Cor: E14. Legenda: G1, y 0,30 (topo da zona, em y ≥ 0,15), 90 px. Transições: T-seco. Som: S-humor.
- Movimento: M-humor. Abre A-frase "POV:" 1,0 s; fecha F-loop. Serve: anúncio curto, vida de loja/agência; duração alvo 8–15 s.

### 5.11 Família 10: Música e clipe

**34. `clipe-batida` — Na batida.** Cada corte numa batida; a música manda.
- Inspira: clipes brasileiros de funk e rap, ex. [KondZilla](https://www.youtube.com/@KondZilla) [canal; estilo não verificado].
- Ritmo: 1,6 / 0,8 / 0,4 s; corte B (100%, `corte_na_batida` `evento-reel.json`); vel n/a. Cor: E11 ou E05. Legenda: G8 (refrão) ou G9. Transições: T-energia.
- Som: S-clipe; trilha dada. Movimento: M-impacto. Abre A-som; fecha F-loop. Serve: evento, aftermovie; **exige trilha com bpm medido (`bpm_medido`, `biblioteca.py:208`)**.

**35. `clipe-neon` — Noite neon.** Noite com cor, luz de LED, longa exposição de luz.
- Ritmo: 2,0 / 1,1 / 0,6 s; corte B. Cor: E11 + ambiente `rua_noite` (pretos limpos [código]), grão 1, vinheta 0,25. Legenda: G6 ou G9. Transições: T-energia (flash, whip).
- Som: S-clipe/S-viral 120 bpm. Movimento: M-dinamico. Abre A-som; fecha F-assinatura. Serve: evento noturno, festa; **precisa de fonte com baixo ruído** (iPhone em Log 10 bits ajuda [Apple, 10 bits ProRes] **não confirmado como ganho medido**).

**36. `clipe-glitch` — Glitch e flash.** Quebras, flash, repetição de quadro na virada.
- Ritmo: 1,2 / 0,6 / 0,3 s; corte B. Cor: E11 Δsat +.1. Legenda: G8. Transições: T-humor + flash (0,12 s). Som: S-clipe, sfx risco/impacto em cada virada.
- Movimento: M-impacto + congela de 3 a 5 quadros. Abre A-som 1,0 s; fecha F-seco. Serve: teaser; duração 10–20 s; **limite de flash**: no máximo 3 flashes por segundo (segurança contra fotossensibilidade; regra da W3C, WCAG 2.3.1 "three flashes or below threshold", [W3C](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html) **não abri a página; confirmar**).

**37. `clipe-lirico` — Lírico.** Câmera lenta, letra na tela, emoção.
- Ritmo: 3,6 / 2,4 / 1,5 s; corte B (no compasso, 2 batidas). Cor: E03 + E09 em trechos (P&B nos picos). Legenda: G2 (letra), y 0,66. Transições: T-suave.
- Som: S-clipe. Movimento: M-contemplativo, lento 0,5 (≥ 60 fps). Abre A-visual; fecha F-loop. Serve: homenagem, aftermovie emocional.

### 5.12 Família 11: Retrô e analógico

**38. `retro-vhs` — VHS.** Grão, cor deslavada, data no canto, ruído de fita.
- Inspira: câmera de família anos 90. Ritmo: 3,0 / 2,0 / 1,2 s; corte M. Cor: E08 (grão 3, vinheta 0,30). Legenda: G6 (mono, data "25 NOV 2026" em canto, y 0,18 dentro da zona).
- Transições: T-filme (flash, fade). Som: S-lofi, ruído de fita **(novo; sem asset hoje)**. Movimento: M-doc. Abre A-corte-meio; fecha F-seco.
- Serve: festa, memória; **o QA `cor_medida` precisa de exceção (luma/saturação baixas de propósito)**.

**39. `retro-super8` — Super 8.** Quente, grão grosso, cantos escuros, 18 fps de "cadência".
- Inspira: filme Kodak Super 8 [Kodak](https://www.kodak.com/en/motion/) [não abri]. Ritmo: 3,2 / 2,2 / 1,4 s; corte M. Cor: E08 + E02, grão 3, vinheta 0,35. Legenda: G5.
- Transições: T-filme com salto (perfurações do kit, `transicao.js`). Som: S-lofi. Movimento: M-contemplativo; "cadência 18 fps" exige FPS de saída variável **(novo, ver 8)**. Abre A-visual; fecha F-logo-seguir. Serve: memória, aniversário, história.

**40. `retro-revelacao` — Em revelação.** A linguagem de laboratório fotográfico que a casa já tem.
- Inspira: o próprio kit (`revelacao`, `laboratorio`, `papel`, `salto`; README do kit: "Linguagem Em Revelação (20/11/2026)"). Ritmo: 3,0 / 2,0 / 1,2 s; corte M. Cor: E08 suave (grão 2) + efeito `revela`. Legenda: G2 ou G5.
- Transições: T-filme com `salto` e `revela`. Som: S-lofi, sfx risco. Movimento: M-contemplativo. Abre A-visual 2,0 s com negativo→positivo; fecha F-assinatura.
- Serve: filme institucional com assinatura de estúdio, bastidor criativo, "pulo do gato" no estilo creat.MTT.

### 5.13 Família 12: Minimalista

**41. `mini-produto` — Produto no vazio.** Fundo limpo, um plano por ideia, silêncio de luxo.
- Inspira: [Apple](https://www.youtube.com/@Apple) [canal; estilo não verificado]. Ritmo: 3,4 / 2,6 / 2,0 s; corte M; Cor: E01, grão 0. Legenda: G4 (1 linha) ou G9.
- Transições: T-seco. Som: S-clean (-20 dB), sfx cta. Movimento: M-produto, zoom_max 1,06. Abre A-visual 2,0 s; fecha F-logo-seguir 2,0 s. Serve: anuncio de produto premium; fundo liso.

**42. `mini-silencio` — Silêncio e respiro.** 12 a 20 s, um gesto, um texto.
- Ritmo: 5,0 / 4,0 / 3,0 s; corte F. Cor: E04, grão 1. Legenda: G9 (só 1 título de gancho). Transições: T-nenhum + fade 0,8.
- Som: S-direto (som ambiente, trilha -24). Movimento: M-contemplativo. Abre A-visual; fecha F-loop. Serve: marca, abertura de coleção. **Risco de retenção** (pouca novidade): usar só em vídeo ≤ 20 s.

**43. `mini-tipografia` — Só tipografia.** Palavra gigante por batida, fundo liso, ritmo de manifesto.
- Inspira: tipografia cinética. Ritmo: 1,0 / 0,7 / 0,5 s; corte B. Cor: E01 ou E09. Legenda: G8 (Anton, 220 px). Transições: T-seco + match.
- Som: S-viral seco (-14). Movimento: M-estavel. Abre A-som; fecha F-assinatura. Serve: anúncio sem imagem forte, chamada de evento, lançamento.

### 5.14 Família 13: Assinatura creat.MTT (as regras do dono viram modos)

**44. `creat-aba71` — Aba 71.** A etiqueta vermelha como transição de assinatura: a câmera mergulha na etiqueta e abre na próxima cena.
- Base: `ultra`. Ritmo: 2,0 / 1,2 / 0,7 s; corte B; vel 1,12. Cor: E01 + E06 leve. Legenda: G3. Transições: T-marca (aba71 1x por filme, mascara com faixa vermelha).
- Som: S-viral, sfx `abre` na aba. Movimento: M-impacto. Abre A-frase; fecha F-assinatura. Serve: reels de marca da creat.MTT, bastidor, ultra criação.

**45. `creat-mesa` — Mesa de negócios (fala do Marcos é a base).** Regra do dono (11/11/2026): procurar primeiro os trechos em que ele fala para a câmera e montar o Reel em cima da fala, imagens do dia como prova.
- Ritmo: 3,6 / 2,2 / 1,2 s; corte F; vel 1,12–1,15; pausa_max 0,20. Cor: E10 + E06 leve, ambiente medido. Legenda: G3, y 0,60. Transições: T-energia limitado + aba71 no fecho.
- Som: S-fala + trilha 105 bpm (-18 dB). Movimento: M-dinamico, `fundo_desfocado` + `destaque_pessoa`. Abre A-frase com a tese da fala; fecha F-logo-seguir. Serve: evento, bastidor com fala; **o editor deve conferir se ainda estão subindo arquivos antes de dizer que não há fala dele** (regra do dono).

**46. `creat-processo` — Processo na sede.** Mostra a agência trabalhando: sede 3D, bonecos (os desenhos aprovados), telas recriadas em motion sem inventar dado.
- Ritmo: 2,6 / 1,6 / 1,0 s; corte M. Cor: E01. Legenda: G6 (mono técnico) + G1. Transições: T-marca. Som: S-viral lo-fi. Movimento: M-dinamico; usa `heroi`, `hud`, `abas` do kit.
- Abre A-resultado; fecha F-assinatura. Serve: reels de processo, apresentação da Creat Nuvem. **Regra do dono: nunca mostrar versão paralela ou simplificada de Marcos, Xande e Ruan; só o desenho aprovado.**

---
## 6. Como o editor sugere 3 modos sozinho

### 6.1 O que o editor lê do material (sinais) e de onde vem

| Sinal | Como obtém hoje | Status |
|---|---|---|
| fala % do material, rostos | `provedores/visao_local.py:280` já classifica "fala para a câmera" (fala_pct > 0,5 e rostos), "b-roll / clima" (< 0,2) ou "misto" | **existe** |
| movimento, tremor, nitidez por clipe | `movimento.py` (série a cada 0,5 s) | **existe** |
| ambiente/look medido (loja, rua, noite, palco) | `cor.classificar()` heurística (`cor.py:12`); academia vem do pedido | **existe** |
| tipo de vídeo (evento, bastidor, vlog, anúncio, depoimento, empresa) | pergunta do site (`TIPOS_VIDEO`) | **existe** |
| duração alvo, destino (Reels, Stories, TikTok, Shorts, Feed, YouTube) | pedido | **existe** |
| trilhas disponíveis (clima, bpm, tom) | `catalogo.py:184` | **existe** |
| **fps real de captura, VFR, 120/240 fps** | `ffprobe` (`r_frame_rate`, `avg_frame_rate`, `nb_frames`; já usa `Meta.fps` em `comum.py:60,97`) | existe parcialmente; a frente O1 deve distinguir fps de captura de fps de container |
| **Log (Apple Log), HDR (HLG/Dolby Vision), 10 bits, ProRes** | ffprobe: `color_transfer`, `color_primaries`, `pix_fmt`, `codec_name`, `profile`; `ingest.py:75,125` já detecta HDR para quadros de análise | existe parcialmente (O1) |
| **modo Cinema do iPhone** | metadados do arquivo | **não confirmado**: não achei fonte Apple que diga como o arquivo expõe o modo Cinema (a página que tentei abrir, `support.apple.com/en-us/108916`, tratava de outro assunto) |
| **app que tira o processamento da Apple (Blackmagic Camera etc.)** | tag de software/encoder no container; assinatura de cor; ausência de HDR automático | **não confirmado** como detectar com certeza; Blackmagic Camera oferece controles manuais, Apple Log em iPhone 15 Pro, ProRes 422 HQ/422/LT/Proxy, HEVC, H.264 e LUT [fonte: [Blackmagic, especificações](https://blackmagicdesign.com/products/blackmagiccamera/techspecs); resumo de [Notebookcheck](https://www.notebookcheck.net/Blackmagic-Camera-for-iOS-offers-pro-video-recording-features-for-grand-total-of-free-Apple-LOG-supported-on-iPhone-15-Pro-models.751503.0.html)] |

Fatos de plataforma sobre a captura do iPhone: ProRes grava em HDR ou Log (Pro a partir do 13 Pro), 4K a 24, 25 e 30 fps em todos os modelos ProRes; 4K a 60 fps a partir do 15 Pro; 4K a 120 fps só do 16 Pro em diante e exige disco externo de pelo menos 440 MB/s; ProRes tem arquivo "até 30 vezes maior que HEVC" [fonte: [Apple, About Apple ProRes on iPhone](https://support.apple.com/109041), lido em 25/11/2026 por resumo automático da página, **conferir o texto literal**].

### 6.2 Filtros de segurança (o material desliga modos, o dono não precisa saber)

| Condição do material | Efeito sobre os modos |
|---|---|
| Captura < 60 fps (maioria do material) | modos que dependem de câmera lenta real perdem 30 pontos (`esporte-epico`, `clipe-lirico`, `viagem-dourada`, `comida-close`); `lento_vel` cai para 1,0 (ver 4.5) |
| Captura 120/240 fps presente | `esporte-*`, `gym-pesado`, `clipe-*` ganham 20 pontos; `lento_vel` pode chegar a 0,25 |
| Log/HLG/DV detectado e **sem conversão pronta** | só E01 e E10; qualquer outro estilo de cor fica bloqueado até a conversão Log→709 existir (O1) |
| Material já gravado com perfil "cinematográfico" (Log + ProRes + 24 fps) | `cinema`, `viagem-teal`, `inst-manifesto` ganham 25 pontos; modos de humor e varejo-oferta perdem 15 (estilo choca com a fonte) |
| Tremor forte (> 4,0 px) em > 30% do tempo | `bastidor-mosca` e `vlog-rua` (que dependem de câmera viva) perdem 20; modos com `M-estavel` ganham 10 |
| Sem fala (fala_pct < 0,1) | modos de fala (`vlog-conversa`, `fala`, `inst-depoimento`, `creat-mesa`) saem da lista (nota: evitar o erro de dizer que não há fala antes de conferir se o upload acabou) |
| Fala_pct > 0,7 | modos de clipe/minimalista saem; modos F ganham 20 |
| Ruído alto/luz baixa (alvo < 0,28 depois do balanço) | modos com E08/E11 e grão 3 saem (grão sobre ruído vira lixo) |
| Destino Stories | só modos ≤ 15 s por cartão; ritmo e1/e3/e5 comprimidos |
| Só fotos/pouco vídeo | `mini-tipografia`, `varejo-oferta`, `clipe-batida` sobem |

### 6.3 Pontuação e escolha dos 3 [proposta]

Para cada modo `m` e material `x`:

```
pontos(m,x) = 40*tipo(m,x) + 25*material(m,x) + 15*segurança(m,x) + 10*histórico(m,cliente) + 10*frescor(m,cliente) - penalidades
```

- `tipo` = 1 se o `tipo_video` do pedido está em `serve_para.tipos`; 0,5 se `auto` e o tipo inferido (fala %, rosto, ambiente) bate; 0 se não.
- `material` = média de quão perto cada sinal está da faixa `serve_para.material` (fala_pct, movimento, duração, fps_min).
- `segurança` = 1 menos as penalidades da tabela 6.2 normalizadas (negativo vira 0).
- `histórico` = proporção de aprovações do dono para esse modo naquele cliente (usar `memoria/casos/*`, hoje 1 caso: `bastidor-creat-2026-11-17`); sem histórico = 0,5.
- `frescor` = 1 se o modo não foi usado nos últimos 3 filmes do cliente (evita o "mesmo filme" que o dono não quer), 0 se foi o último.
- Penalidades: `evitar_quando` casou (-30 cada), modo exige trilha e não há trilha com bpm medido (-40), modo `ia: true` sem autorização de custo (-100; a casa exige avisar antes de gastar).

**Escolha dos 3 com diversidade** (para o dono nunca ver 3 versões do mesmo):
1. **Seguro:** maior pontuação.
2. **Diferente:** maior pontuação entre os modos de **outra família** e de **outro tipo de corte** (se o 1º é B, o 2º é F ou M) e cujo estilo de cor difere em pelo menos 2 dos 3 valores (Δcon, Δsat, tint).
3. **Ousado:** maior pontuação entre os modos com energia média (e3) ≤ 1,2 s **ou** com `ultra`/`creat-*` como base, de uma família ainda não usada; é a versão "interpretar além do pedido" (regra do dono: o pedido é o piso, não o teto).

Cada cartão sai com **uma razão em linguagem humana** gerada do arquivo: "Escolhi porque 62% do material é você falando para a câmera e tem 14 planos de loja" (os números vêm dos sinais, nunca inventados).

### 6.4 Exemplo (sinais → cartões) [ilustração]

Material: 11 clipes, iPhone 4K, 30 fps, 2 min de fala para a câmera na loja, 9 b-rolls de produto estáveis, `tipo auto`. `loja` medida.
- Seguro: `varejo-reporter` (fala 62%, loja, rosto).
- Diferente: `creat-mesa` (fala do dono como base, aba71 no fecho).
- Ousado: `varejo-oferta` se há produto + preço fornecido; se não, `creat-aba71`.

---

## 7. Como o dono escolhe no celular sem ver 46 botões

Princípio: **o dono nunca navega o catálogo**. O catálogo existe para o editor, não para ele.

1. **Tela 1: "Li o seu material".** Uma linha: "11 vídeos · 4K · 30 fps · você falando 62% · loja". Se o editor detectou Log/60 fps/120 fps, aparece como selo ("tem câmera lenta de verdade", "gravado em Log: vou cuidar da cor"). Isso mostra que ele entendeu, sem pedir nada.
2. **Tela 2: 3 cartões** (seção 6.3). Cada um: nome em pt-BR, 1 linha, **uma prévia de 4 s** (o primeiro bloco já com cor, legenda e transição do modo) e a razão. Um toque no cartão escolhe e **monta** (o caminho comum tem 2 toques: abrir, escolher). Custo de gerar 3 prévias de 4 s em CPU: **não medido** [não confirmado]; alternativa barata: 1 quadro estático por cartão (cor + legenda aplicadas) e a prévia em movimento só depois do toque.
3. **"Não é isso":** botão que troca os 3 por outros 3 (próximos da fila, respeitando as famílias já vistas). Até 2 trocas.
4. **"Quero outro estilo"** abre as **12 famílias** como chips com um ícone e uma palavra (Viagem, Loja, Bastidor, Vlog, Treino, Comida, Moda, Empresa, Humor, Clipe, Retrô, Minimal; mais "creat.MTT"). Tocar numa família mostra 3 a 4 modos dela. Máximo 3 toques para qualquer um dos 46.
5. **Ajuste fino em 3 controles** (cada um troca **um bloco**, sem criar modo novo): *Ritmo* (calmo, normal, rápido: escala `plano_s` em 1,3 / 1,0 / 0,7), *Cor* (natural, do modo, forte: escala os deltas do estilo em 0,5 / 1,0 / 1,4), *Texto* (discreto, do modo, grande: troca G4/do modo/G3 ou G8). Como o modo é composição de blocos, isso é de graça.
6. **"Como alguém que eu gosto":** campo de texto/voz ("tipo Casey Neistat", "tipo comercial de Apple"). O editor casa a frase com `inspira[].quem` e palavras-chave de `descricao` e sugere o modo mais próximo. Sem match, devolve os 3 cartões normais.
7. **"Salvar como meu modo":** copia o arquivo do modo com os ajustes para `memoria/modos/meus/<id>.json`. É assim que o catálogo cresce **sem depender de mim**: o dono ajusta uma vez, salva, e vira um modo.
8. **Memória:** a aprovação ou reprovação do filme grava no caso (`memoria/casos/`, já existe) com o id do modo; alimenta `histórico` da pontuação.
9. **Perguntas por modo:** o site já filtra perguntas por modo (`modos?:` em `PERGUNTAS`, `estados.ts`). Com 46 modos, trocar `modos` por **famílias** (ex.: a pergunta "usar mascote?" vale para `ultra`, `criativo`, `creat-*`).
10. **Modo padrão silencioso:** `auto` continua sendo o botão grande. Escolher "O editor decide" executa o cartão 1 sem mostrar os outros.

---

## 8. Riscos, decisões do dono e ordem de trabalho

### 8.1 Decisões que não são minhas

1. **fps de saída.** O motor fixa 30 fps (`comum.py:15`), reamostrando por "quadro mais próximo" (`planos.py:175`, documentado em `pesquisa-exportacao-sem-perda.md` §2 item 14). Modos de cinema e Super 8 pedem 24 fps. Instagram aceita 24 a 60 fps (mesma pesquisa, §1 item 4). Decisão: oferecer saída a 24 fps para modos de cinema? Custo: mexe em todo o motor de tempo.
2. **Grão e nitidez por modo.** Hoje grão e unsharp são fixos em todo plano (`planos.py:375-376`, `comp.py:286`) e custam qualidade (O2). Recomendo `cor.grao` e `cor.nitidez` por modo, com `nitidez` baixa para material de app que tira o processamento da Apple e alta para o que vem com processamento forte. **A afirmação sobre o que a câmera da Apple processa por padrão (nitidez, redução de ruído, Smart HDR) não confirmei em fonte primária.**
3. **Legenda sem texto (G9).** Reduz acessibilidade e retenção de quem assiste sem som; só em modos contemplativos e de clipe. Se o dono quiser regra rígida (sempre legenda), tirar G9 e rebaixar `mini-silencio`.
4. **Modos que usam efeito sonoro novo** (ruído de fita, crepitar) precisam de assets com licença; os 7 SFX da casa são do pacote Sonniss (`assets/sfx/LICENCAS-kit-17-11.md`: uso comercial sem atribuição, proibido revender soltos e treinar IA). Comprar/gerar sons novos é decisão de custo (pedir autorização).
5. **Referências de creator.** O sistema usa creators como **inspiração**, nunca para copiar assinatura visual protegida (marca, personagem, logo). Os nomes ficam em `inspira` só como rótulo de estilo.

### 8.2 Riscos

| Risco | Mitigação |
|---|---|
| 46 modos que o diretor (LLM) confunde ou ignora | a frase `diretor.frase` curta (≤ 40 palavras) + limites mecânicos no resolvedor (frequência de transição, `permitidas`, `plano_s`) que **o diretor não consegue violar**; hoje só `sem_transicoes` é mecânico |
| Cor de estilo quebra o QA (`cor_medida`, tom de pele) | limites duros da 4.1; modos E08/E09/E11 declaram `qa_extra`/exceção; fixture de teste por estilo |
| Prompt cresce (mais texto por pedido) | só o modo escolhido entra no prompt; a biblioteca fica fora (o diretor recebe a frase e as listas permitidas) |
| Modos viram "filtros de Instagram" sem alma | cada modo tem `abertura` e `fecho` próprios e a regra de retenção da casa; a revisão do crítico (`prompts/critico.md`) confere "gancho nos 2 s e novidade a cada 2–4 s" |
| Calibração sem material real | tudo marcado [proposta]; primeira rodada: gerar 1 quadro por estilo de cor sobre 3 planos reais (loja, rua, rosto) e o dono aprova ou ajusta |

### 8.3 Ordem de implementação sugerida

1. **Onda 1 (dados e prompt, sem tocar no motor visual):** carregar `versao: 2`, `diretor.frase`, `permitidas`/`proibidas`, `som.pacote`, `ritmo` (já há campos), `ia` marcador; os 46 arquivos (esta pesquisa dá o conteúdo); sugestão dos 3 modos; UI dos 3 cartões sem prévia em movimento.
2. **Onda 2 (visual):** `cor.estilo` + grão/vinheta/nitidez; `legenda.estilo` (G1–G8); `abertura/fecho` com `gancho2`/`fecho2`; `salto` no modelo.
3. **Onda 3 (tempo e câmera):** `lento_vel` condicional a fps; speed ramp esportivo; aceleração de time-lapse; layout dividido; `plano_s` mecânico.
4. **Onda 4 (decisões):** saída 24 fps, FPS por pedido, efeitos sonoros novos, prévias em movimento.

---

## 9. Exemplo de arquivo completo (v2, válido)

```json
{
 "versao": 2,
 "id": "varejo-oferta",
 "nome": "Oferta do dia",
 "familia": "varejo",
 "descricao": "Preço grande, corte seco e energia de tabloide em movimento.",
 "base": "criativo",
 "inspira": [{"quem": "Tabloide de supermercado", "url": null, "o_que": "preço em destaque, urgência"}],
 "serve_para": {"tipos": ["anuncio"], "material": {"fala_pct": [0, 0.4], "movimento": "medio", "fps_min": 24, "duracao_s": [10, 30]}, "evitar_quando": ["sem_preco_fornecido", "tremor_forte"]},
 "ritmo": {"plano_s": {"e1": 2.0, "e2": 1.6, "e3": 1.2, "e4": 0.9, "e5": 0.7}, "corte": "batida", "vel_fala": [1.10, 1.15], "pausa_max": 0.15, "gap_bloco": 0.16, "gap_fala": 0.08},
 "cor": {"estilo": "E06", "ambiente": "respeitar", "grao": 0, "vinheta": 0.0, "pele": 0.7},
 "legenda": {"estilo": "G3", "y": 0.62, "tamanho": 112, "pal_pag": 3, "conf_min": 0.5, "enfase": "chave"},
 "transicoes": {"pacote": "T-energia", "permitidas": ["corte_batida", "whip", "flash", "impacto", "mascara", "match"], "proibidas": ["aba71", "salto"], "freq_max_por_30s": 8, "dur_escala": 0.9},
 "som": {"pacote": "S-viral", "trilha": {"clima": ["batida"], "bpm": [120, 135], "ganho_db": -13, "ducking_db": 10, "desce_s": 0.4, "sobe_s": 0.55}, "sfx": {"gancho": "abre", "troca": "risco", "chip": "chip", "texto_tela": "embaralha", "cta": "cta", "drop": "impacto"}, "som_direto": "baixo", "tom_sala_db": -48},
 "movimento": {"pacote": "M-produto", "zoom_max": 1.2, "efeitos": ["punch", "lento", "janela", "congela"], "lento_vel": 0.5, "estabilizar": "auto"},
 "abertura": {"modelo": "gancho", "dur": 1.8, "tipo": "frase", "y": 0.42, "texto_max_palavras": 3},
 "fecho": {"modelo": "fecho", "dur": 3.0, "tipo": "oferta", "loop_visual": false},
 "diretor": {"frase": "oferta do dia: gancho com a palavra OFERTA, um produto por batida, preço só se o dono forneceu, fecho com validade e endereço", "proibe": ["inventar preço", "mascote"], "exige": ["1 plano de produto por bloco"]},
 "ia": false
}
```

A sintaxe deste exemplo foi conferida com `json.loads` do Python em 25/11/2026 (o JSON é válido; os ids de bloco E06, G3, T-energia, S-viral e M-produto são os da seção 4).

---

## 10. Fontes

Consultadas nesta pesquisa (25/11/2026):
- Código lido: `apps/web/lib/estados.ts:34-87`; `services/motor/motor/etapas/direcao.py:24-33,57-62,126`; `services/motor/motor/memoria/loja.py:64-107`; `services/motor/motor/etapas/resolvedor.py:136-143,379,451-463,685-719,779-821`; `services/motor/motor/etapas/cor.py:1-45`; `services/motor/motor/etapas/cor_looks.json`; `services/motor/motor/movimento.py:1-40`; `services/motor/motor/cerebro/prompts/diretor.md`; `memoria/modos/*.json`; `memoria/modelos/*.json`; `memoria/cor/looks.json`; `packages/kit/kit/modelos/*.js`; `packages/kit/kit/tokens.css`; `packages/kit/assets/sfx/sfx.json`; `etapas/qa/zona_segura.py`; `docs/pesquisa-exportacao-sem-perda.md`.
- Apple, ProRes no iPhone (modelos, Log, resoluções, fps): https://support.apple.com/109041
- Blackmagic Camera (especificações): https://blackmagicdesign.com/products/blackmagiccamera/techspecs
- Notebookcheck sobre Blackmagic Camera e Apple Log no 15 Pro: https://www.notebookcheck.net/Blackmagic-Camera-for-iOS-offers-pro-video-recording-features-for-grand-total-of-free-Apple-LOG-supported-on-iPhone-15-Pro-models.751503.0.html
- Hormozi (estilo de legenda, por ferramentas de terceiros): https://www.choppity.com/tools/recreate-video-editing-style/alex-hormozi/ · https://fluxnote.io/guides/how-to-make-alex-hormozi-style-captions · https://openclip.app/use-cases/hormozi-style-captions.md · https://www.kapwing.com/explore/alex-hormozi-style-captions-template · https://www.submagic.co/blog/how-to-make-alex-hormozi-captions
- Casey Neistat (cortes, som): https://livecounts.io/blog/content-creation/the-visual-grammar-of-casey-neistats-b-roll-cuts
- Peter McKinnon: https://async.com/blog/who-is-peter-mckinnon/
- Sam Kolder (tutorial resumido): https://recapio.com/digest/how-to-edit-like-sam-kolder-kold-my-year-2016-transitions-text-effects-color-grading-more-by-justin-
- MrBeast, guia de produção vazado: https://www.tubefilter.com/2024/09/17/mrbeast-internal-production-guide-leaked-key-points/ · https://passionfru.it/?p=81151 · retenção (Mario Joos): https://vidpros.com/retention-editing-what-you-can-learn-from-mario-joos/
- Instagram Help Center, tamanho e resolução de Reels: https://help.instagram.com/1038071743007909 (a página carregou só o cabeçalho; os números de Reels vêm da resposta da busca e de `pesquisa-exportacao-sem-perda.md` §3)
- ffmpeg filtros (`minterpolate`): https://ffmpeg.org/ffmpeg-filters.html#minterpolate (não abri esta página nesta sessão; filtro conhecido da documentação; **confirmar**)

---

## 11. O que não consegui confirmar

1. **Estilo real de cada creator** (Kolder, McKinnon, Neistat, Emma Chamberlain, MrBeast, Tasty, Porta dos Fundos, KondZilla, Casimiro, Vogue, Nike, Gymshark, CBum, Red Bull, Patagonia, Apple, Bon Appétit, Ali Abdaal): vi só resumos de terceiros para cinco deles e **nenhum vídeo**. Os links de canal foram escritos de memória e não foram abertos; **podem estar errados ou mudados**.
2. **"Pattern interrupt a cada 4 segundos"** (MrBeast): só em blog de contagem, sem fonte primária. O guia vazado é de autenticidade contestada pelo próprio Tubefilter ("pode ser guia de qualquer canal longo de YouTube em 2024").
3. **Como o iPhone grava o modo Cinema** (fps, resolução, se o arquivo guarda profundidade e como ler com ffmpeg): a página Apple que tentei não era a certa. **Não confirmado.**
4. **Como detectar com certeza "gravado por app que tira o processamento da Apple"**, e **o que exatamente a câmera nativa processa** (nitidez, redução de ruído, tone mapping): sem fonte primária.
5. **Câmera lenta nativa do iPhone (1080p a 120/240 fps)**: não consegui abrir a página da Apple; consta como fato conhecido, sem trecho confirmado aqui.
6. **Limite de 3 flashes por segundo (WCAG 2.3.1)**: citei a norma de memória; **não abri a página**; confirmar antes de fixar como regra do QA.
7. **Duração máxima atual de Reels e retenção por duração**: as fontes que achei se contradizem (90 s, 20 min); não usei esses números em nenhum modo além de alvos curtos (≤ 30 s).
8. **Todos os valores numéricos de cor (14 estilos), ritmo (`plano_s`), som (ganhos, ducking dos pacotes novos) e pontuação** (pesos 40/25/15/10/10) são **[proposta]**, sem teste com filmagem real do Marcos e sem medição de tempo de render. Custo em CPU de gerar prévias de 4 s, `minterpolate` e grão pesado: **não medido**.
9. **Se o resolvedor aguenta** `plano_s` e `freq_max_por_30s` sem reprovar o QA: não testado (não pude editar `services/`).
10. **Qualidade aparente dos assets de som e fonte para os modos retrô** (ruído de fita, crepitar): não existem no kit; precisam de licença.
