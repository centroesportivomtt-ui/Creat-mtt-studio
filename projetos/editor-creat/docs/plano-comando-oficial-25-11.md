# Plano de implementação: comando oficial de 25/11

Leitura da gravação, cor por perfil, exportação sem perda, dezenas de modos e técnicas premium.

Data: 25/11/2026. Autor: Cirro (arquiteto da Creat Nuvem). Escopo: plano. Nada em `services/`, `apps/` ou `packages/` foi alterado e não houve commit.
Base lida: commit `5325812` + o que a sessão `01LA2wrMpbZ` está mudando agora (M2, M3, M4), visto por `git status` no fim desta sessão. A lista exata está na seção 2, item 7.
Insumos: as quatro pesquisas (`docs/pesquisa-leitura-da-gravacao.md` = O1, `docs/pesquisa-exportacao-sem-perda.md` = O2, `docs/pesquisa-modos-de-edicao.md` = O3, `docs/pesquisa-tecnicas-premium.md` = O4), `FILA.md`, `PROGRESSO.md` e `packages/schemas`.

Marcação:
- **[código arq:linha]** = linha conferida nesta sessão.
- **[O1 §x]** = vem da pesquisa, com a fonte que ela cita.
- **[medido aqui]** = teste desta sessão: ffmpeg 6.1.1, 4 CPUs, material sintético. O método está na seção 16.
- **[fonte]** = URL.
- **[proposta]** = decisão de projeto.
- **[não confirmado]** = sem fonte primária ou sem teste.

Correção de linhas da O2: a pesquisa cita `qa/formato.py:372-381` e `entrega.py:302,326`, mas esses arquivos têm 46 e 105 linhas. As linhas certas são:
- `formato.py:24-46` (`checar`);
- `entrega.py:69-73` (sha256) e `:94` (apaga a pasta);
- `montagem/__init__.py:184` (grava `final.mp4`) e `:199` (limite do cache).

---

## 1. Resposta curta

1. **A primeira coisa que melhora todo vídeo do Marcos é a cor de entrada.** O iPhone grava HDR por padrão (HLG com Dolby Vision 8.4) [O1 §3 linha 2, Apple TN3145]. O render lê toda fonte como Rec.709 8 bits: `in_color_matrix=bt709` fixo [código planos.py:75-76] e `bgr24` [código planos.py:60]. Corrigir isso é a Onda 2 e depende da leitura da Onda 1. As duas ficam prontas em CPU, sem gasto.
2. **A segunda é a exportação.** Hoje saem duas gerações H.264 com perda, mais grão fixo:
   - cache `veryfast crf14 4:2:0` [código planos.py:331];
   - final `veryfast crf17` com `noise=c0s=2` [código comp.py:286].
   A Onda 3 troca isso por:
   - um cache quase sem perda;
   - um único encode visível, gerado no mesmo processo que grava o mestre ProRes;
   - uma conferência de qualidade contra o mestre.
3. **Ordem das ondas:**
   - 0: hoje, sem código.
   - 1: leitura e perfil na tela.
   - 2: cor por perfil.
   - 3: exportação.
   - 4: tempo (fps, VFR, câmera lenta, rampa sem tranco).
   - 5: modos como dados, 46 modos, 3 sugestões e escolha no celular.
   - 6: as 10 técnicas premium.
   - 7: opcional.
   Cada onda entra sozinha, com teste sintético, e campo ausente = comportamento atual.
4. **Dá para começar hoje, sem esbarrar na outra equipe:**
   - Onda 1: módulo novo `motor/gravacao.py`, `ingest.py`, API, site;
   - Onda 2a: HLG/PQ, em `comum.py` e `planos.py`;
   - Onda 3a: `comp.py`, `planos.py` (só o encode e o buffer), `qa/formato.py`;
   - Onda 4a: `planos.py`, `comum.py`;
   - Onda 5a: arquivos de modo, `loja.py`, `motor/modos.py`.
   O que mexe nos arquivos que a outra sessão edita agora espera o commit de M2 a M4 (lista na seção 2, item 7). Isso inclui `resolvedor.py`, `direcao.py`, `cor.py`, `montagem/__init__.py` e `edl.schema.json`.
5. **Do dono:**
   - Dinheiro: só se ele quiser ampliar os efeitos sonoros (biblioteca paga ou geração por IA). Com os 7 sons da casa, nada é gasto.
   - Tempo: gravar o kit de 8 amostras curtas (seção 5), uns 10 minutos. Sem o kit, tudo funciona com parâmetros de partida; com o kit, a calibração fecha.
   - Decisão: uma só, já com padrão seguro. Saída em 24 fps para modos de cinema? Padrão: continua 30.
6. **Custo de render (medido aqui, pior caso sintético):**

   | Parte | Custo |
   |---|---|
   | Cadeia HLG→SDR | +11,5 ms por quadro 4K |
   | Apple Log por LUT 16 bits | +5,8 ms por quadro |
   | Fonte SDR | +0 |
   | Cache novo | mais rápido que o atual (0,94 s contra 1,41 s por segundo de filme), 4,4x maior |
   | Encode final `medium` | ~2,2 s por segundo de filme, contra ~0,7 s do `veryfast` |
   | Mestre ProRes HQ (`prores_aw`), em paralelo | 0,7 s por segundo |

   Num filme de 45 s, isso dá cerca de +1,5 min no pior caso.
7. **Disco:**
   - mestre: até ~2,4 GB por filme de 45 s no pior caso (433 Mbps medido em ruído forte);
   - cache: limite sobe de 1,2 GB para ~4 GB.
   O tamanho do volume do Railway não está confirmado. Por isso há retenção do mestre e uma chave para desligá-lo.

---

## 2. Regras para não estragar o que existe

1. **Campo novo é sempre opcional; ausência = hoje.** Vale para todo schema (`analise`, `edl`, `pedido`, `qa`) e para toda receita de modo. Exemplos antigos em `packages/schemas/exemplos/` continuam válidos (`test_contratos.py`).
2. **Fonte SDR não muda um bit na Onda 2.** A string `entrada_vf` de fonte SDR bt709 fica idêntica. A família de cor entra na `chave_plano` [código planos.py:402-409] só quando é diferente de `sdr709`. Assim o cache de planos SDR continua válido.
3. **Mudança de encode muda `VERSAO`.** `VERSAO = "p5"` [código planos.py:26] passa para `"p6"` só na Onda 3 (cache novo). Custo: os planos são renderizados de novo uma vez.
4. **Não reextrair o ingest.** `ALGO = "ingest-1"` [código ingest.py:25] não muda. O perfil de captura é preenchido por uma função que roda só o `ffprobe` (dezenas de ms) quando `midia.gravacao` falta. Arquivo antigo ganha perfil sem decodificar de novo.
5. **Toda checagem nova de QA nasce em observação.** Já existe o mecanismo `EM_OBSERVACAO` [código qa/__init__.py:217]: a checagem roda e avisa, mas não segura a entrega. Ela passa a bloquear depois de calibrada com 5 filmes reais.
6. **Chave de volta atrás por variável de ambiente**, para o caso de algo sair errado em produção sem novo deploy de código:
   - `EDITOR_COR_ENTRADA=legado`;
   - `EDITOR_MESTRE=nao`;
   - `EDITOR_EXPORT=legado`.
7. **Coordenação com a sessão `01LA2wrMpbZ`.**
   - Em edição por ela agora (não tocar até o commit dela):
     - `resolvedor.py`, `direcao.py`, `analise.py`, `catalogo.py`;
     - `cor.py`, `cor_looks.json`, `memoria/cor/looks.json`;
     - `montagem/__init__.py`, `montagem/trilha.py`, `qa/cor_medida.py`, `musica.py`, `prompts/diretor.md`;
     - os schemas `analise`, `catalogo`, `direcao` e `edl`;
     - os arquivos novos `movimento.py` e `sem_fala.py`.
   - Livres hoje:
     - `ingest.py`, `montagem/comum.py`, `montagem/planos.py`, `montagem/comp.py`, `montagem/fx.py`, `montagem/mix.py`;
     - `entrega.py`, `qa/__init__.py`, `qa/formato.py`, `memoria/loja.py`, `api/projetos.py`;
     - `apps/web`;
     - os schemas `qa` e `pedido`;
     - os arquivos novos deste plano.
   - O que cai num arquivo ocupado entra só depois de `git pull` com o commit de M2 a M4: Ondas 2b, 3b, 4b, 5b, a técnica 2 e a ligação de várias técnicas da Onda 6.
   - A regra "câmera lenta só de fonte 60/120 fps" é de M4. Esta frente só fornece o `fps_captura`.
8. **Fila e testes:**
   - Reservar o item no `FILA.md` (O1 a O4 já existem).
   - Antes de cada push, rodar:
     - `cd services/motor && python -m pytest -q -m "not pago"`;
     - `python -m motor.ferramentas.aceite_c`;
     - `cd apps/web && pnpm install && pnpm tipos && pnpm aceite`.
   - Revisão do `revisor` em todo código novo.

---

## 3. Decisões (registro curto)

**D1. Onde converter a cor de entrada.**
- Contexto: a Apple diz que a cor deve ser convertida antes, ou junto, da redução de 10 para 8 bits, senão aparecem faixas [O1 §4.3, PDF Apple "Incorporating HDR video with Dolby Vision"]. O motor faz a cor em `uint8` [código cor.py:213-246].
- Opções:
  - (a) pipeline inteiro em 16 bits no numpy;
  - (b) conversão dentro do ffmpeg, em float/16 bits, no próprio `ler()`, entregando `bgr24` já em Rec.709;
  - (c) pré-converter cada arquivo inteiro para um intermediário.
- Decisão: **(b)**.
  - Atende a regra da Apple: a conversão acontece antes do 8 bits, com dither.
  - Não mexe em `cor.py` nem nos looks.
  - Custa +5,8 a +11,5 ms por quadro [medido aqui].
  - (a) dobra memória e reescreve `cor.py` (LUT 8 bits); fica para a Onda 7, só se aparecer banding em Log real depois do look.
  - (c) gasta disco e um encode a mais.
- Consequência: os looks continuam em 8 bits. Num Log com contraste forte ainda pode haver faixa; por isso estilos fortes ficam travados sobre Log até o teste com material real (O3 §6.2).

**D2. Mestre e derivado no mesmo processo.**
- Contexto: a O2 propõe derivado codificado a partir do mestre (duas passadas).
- Decisão [proposta]: um único ffmpeg recebe os quadros da composição e grava as duas saídas (`split`):
  - `mestre.mov` (ProRes 422 HQ 10 bits);
  - `final.mp4` (o derivado Reels).
- Por quê:
  - o derivado sai dos quadros sem perda (uma geração a menos que "derivar do mestre");
  - os dois encoders correm em paralelo;
  - o mestre fica para gerar outros destinos depois (YouTube 4K, recorte) e como referência do QA.
- Consequência: a conferência compara o derivado com o mestre. O mestre é quase sem perda, mas não idêntico aos quadros; isso é medido uma vez no teste de aceite.

**D3. Encoder do mestre.**
- Medido aqui, 1080x1920, ruído forte, 4 threads:

  | Encoder | Tempo | Taxa |
  |---|---|---|
  | `prores_ks` HQ | 5,6 s por segundo | 228 Mbps |
  | `prores_aw` HQ | 0,7 s por segundo | 433 Mbps |
  | DNxHR HQX | 1,6 s por segundo | 220 Mbps |

  Em fonte suave, a O2 mediu `prores_ks` a 1,9 s por segundo.
- Decisão: `prores_aw -profile:v 3` por padrão (rápido, abre em qualquer editor), com `EDITOR_MESTRE_ENCODER=prores_ks` para quem prefere arquivo menor.
- Retenção: mestre das 2 últimas versões de cada projeto e das aprovadas por 30 dias (`EDITOR_MESTRE_DIAS=30`); o de versão reprovada sai na hora.

**D4. Preset do derivado.**
- A O2 mediu `slow` +2 dB sobre `veryfast` em fonte suave.
- Medido aqui em ruído forte e moderado, crf 16, mesmo teto de taxa:

  | Preset | PSNR-Y (moderado / forte) | Tempo |
  |---|---|---|
  | `veryfast` | 44,7 / 34,6 dB | 0,7 s por segundo |
  | `medium` | 45,1 / 35,1 dB | 2,2 s por segundo |
  | `slow` | 45,0 / 35,1 dB | 4,8 a 5,0 s por segundo |

  Em material com textura, `slow` não ganhou nada sobre `medium`.
- Decisão: `medium` por padrão; `EDITOR_PRESET_FINAL=slow` quando o kit real mostrar ganho.

**D5. Cache de planos.**
- Medido aqui (ruído moderado, 2 threads, PSNR em RGB contra os quadros originais):

  | Cache | Tempo | Taxa | PSNR RGB |
  |---|---|---|---|
  | Atual (`veryfast crf14 4:2:0`) | 1,41 s por segundo | 52 Mbps | 31,6 dB |
  | `libx264 -preset ultrafast -crf 6 yuv444p10le` | 0,94 s por segundo | 231 Mbps | 45,9 dB |

- Decisão: o segundo. É mais rápido e +14 dB. Custo: 4,4x de disco, por isso `EDITOR_CACHE_PLANOS_MB` sobe de 1200 para 4000.
- Ressalva: o padrão de teste tem croma saturado e exagera a perda do 4:2:0. Em filmagem real a diferença deve ser menor [não confirmado].

**D6. Modo = arquivo de dados, compatível com v1.**
- Decisão: aceita o desenho da O3 §3 (`versao: 2`, `base`, blocos).
- Ajuste deste plano: o catálogo fica em `memoria/modos/`, com os blocos em `memoria/modos/_blocos/` e os do dono em `memoria/modos/meus/`.
- O `pedido.schema` troca o `enum` de 8 valores por um padrão de slug, validado contra o catálogo na API. Os valores antigos continuam válidos.

**D7. Saída continua 1080x1920 a 30 fps.**
- Há conflito de fontes:
  - a ajuda do Instagram diz mínimo de 30 fps [O1 §4.7, help.instagram.com/1038071743007909];
  - a API de publicação da Meta aceita 24 a 60 fps [O2 §3].
- Decisão: 30 fps fixo (`comum.py:15`) até o dono pedir 24 fps (Onda 7).
- Consequência: fonte 24/25 fps continua com 1 quadro repetido a cada 5. A Onda 4 deixa isso explícito e oferece mistura como opção de modo.

---

## 4. Mapa das ondas

| Onda | Entrega para o dono | Arquivos principais | Depende de | Pode começar |
|---|---|---|---|---|
| 0 | kit de amostras pedido; plano aprovado | nenhum (mensagem) | nada | hoje |
| 1 | na tela de cada arquivo: "iPhone 15 Pro · HDR Dolby Vision · 4K 30 fps · 10 bits" e selos | `motor/gravacao.py` (novo), `etapas/ingest.py`, `api/projetos.py`, `componentes/Projeto.tsx`, `analise.schema.json` | pull de M2 (só o schema) | hoje |
| 2a | vídeo HDR do iPhone sai com a cor certa | `montagem/comum.py` (`meta`), `montagem/planos.py` (`entrada_vf`, `chave_plano`), `memoria/cor/entrada.json` (novo), `etapas/ingest.py` (`extrair`) | Onda 1 | hoje |
| 2b | Apple Log (e S-Log3/V-Log) convertido em 16 bits | os mesmos + `resolvedor.py` (1 linha em `fontes`) + LUT gerada | Onda 1, commit de M2 a M4 | depois de M4 |
| 3a | uma geração a menos, sem grão fixo, sem JPEG escondido, GOP certo | `montagem/planos.py` (encode do cache, buffer), `montagem/comp.py` (encode final), `qa/formato.py` | nada | hoje |
| 3b | mestre ProRes guardado e nota de qualidade contra ele | `montagem/comp.py` (segunda saída), `montagem/__init__.py`, `etapas/entrega.py`, `qa/qualidade_preservada.py` (novo), `qa/__init__.py`, `qa.schema.json`, `edl.schema.json` (`master`) | commit de M2 a M4 (`__init__.py`, `edl`) | depois de M4 |
| 4 | câmera lenta sem tranco; 120/240 fps aproveitados; VFR sem dessincronia | 4a: `montagem/planos.py` (`tempos_fonte`, `camera_lenta`, `indices_de_quadro`, `ler`), `montagem/comum.py`; 4b: `resolvedor.py` (rampa na batida) e os campos novos do `edl.schema.json` | Onda 1; 4b depois de M4 | 4a hoje (lê os campos opcionais; o schema entra com 4b) |
| 5 | 46 modos, 3 sugestões com motivo, escolha em 2 toques no celular | 5a: `memoria/modos/**`, `memoria/loja.py`, `motor/modos.py` (novo), `api/projetos.py`; 5b: `etapas/direcao.py`, `resolvedor.py`; 5c: `componentes/Projeto.tsx`, `lib/estados.ts`, `pedido.schema.json` | Onda 1 (sinais); 5b depois de M3/M4 | 5a hoje |
| 6 | as 10 técnicas premium, ligadas por modo | `etapas/cor.py`, `montagem/planos.py`, `montagem/fx.py`, `montagem/mix.py`, `montagem/trilha.py`, `montagem/overlay.py`, `resolvedor.py`, `qa/` | Ondas 2 a 5 | em partes |
| 7 | opcionais: ffmpeg 8 (VMAF, ProRes RAW), 24 fps, cadeia 16 bits, entrega HDR | `deploy/Dockerfile.*`, `comum.py` | dono só em 24 fps | depois |

Prioridade:
- Ondas 2 e 3 mudam todos os vídeos e corrigem defeito real; vêm primeiro.
- A Onda 4 corrige o tranco da rampa (defeito real) e destrava câmera lenta.
- A Onda 5 é o pedido mais visível do dono ("dezenas de modos"). Os dados e a sugestão (5a) começam hoje em paralelo; só a ligação mecânica espera a outra equipe.

---

## 5. Onda 0: hoje, sem código

1. **Pedir ao Marcos o kit de 8 amostras** [O1 §8]:
   - clipes de 5 a 10 s pela pasta `Envio da câmera` e também pelo envio do site (para comparar se o Dropbox recodifica: [não confirmado]);
   - lista:
     1. iPhone 4K 30 com HDR ligado;
     2. o mesmo com HDR desligado;
     3. ProRes Log;
     4. Blackmagic Camera ou Final Cut Camera em Apple Log (HEVC e ProRes);
     5. câmera lenta 240 fps, original e exportada do Fotos;
     6. Cinema (renderizado e com "Todos os dados do Fotos");
     7. pouca luz com Auto FPS;
     8. câmera ou drone com log, se houver.
   - Custo para ele: ~10 min; dinheiro: zero.
2. **Marcar O1 a O4 no `FILA.md`** como "pesquisa feita, plano em `docs/plano-comando-oficial-25-11.md`".
3. **Criar itens novos na fila.** Cada um é um commit revisável:
   - O1a, O1b;
   - O2a, O2b;
   - O3a, O3b, O3c;
   - O4a a O4j;
   na ordem da seção 4.

---

## 6. Onda 1: leitura da gravação e perfil de captura na tela

### 6.1 O que muda
- **Novo `services/motor/motor/gravacao.py`.** Funções puras, testáveis sem vídeo:
  - `sondar(caminho) -> dict`: um `ffprobe -v error -show_streams -show_format -show_entries stream_side_data -of json`. Hoje `ingest.ffprobe` não pede side data [código ingest.py:35-43].
  - `ler_gravacao(probe, nome) -> dict`: monta `midia.gravacao` (6.2).
  - `familia_cor(stream, tags, hist=None) -> (familia, confianca, evidencias)`: regras da tabela 6.3, em ordem: tag > side data > metadado Apple > histograma.
  - `tempo(probe, caminho) -> dict`: `fps_r`, `fps_medio`, `vfr`. Chama a lista de PTS (`-select_streams v:0 -show_entries packet=pts_time`) só se `|r - avg| / avg > 1%` ou fps ≥ 100 [O1 §4.5].
  - `rotulo(g) -> str` e `selos(g) -> list`: o texto que o dono lê.
  - `histograma_log(quadros_chave) -> dict`: p2/p50/p98 de luma e saturação dos JPG que o ingest já extrai. Serve à suspeita de Apple Log sem tag [O1 §4.1].
- **`etapas/ingest.py`:**
  - `ingest()` grava `midia["gravacao"] = gravacao.ler_gravacao(...)` antes do `ingest.json` [código ingest.py:279-285];
  - no caminho "pulado" (assinatura igual) preenche só a `gravacao` se faltar, sem reextrair;
  - `ler_midia` continua igual (o `hdr` antigo fica, para compatibilidade).
- **ProRes RAW / BRAW:** se o `ffprobe` não reconhecer o codec, a mensagem do `ErroDefinitivo` vira um texto que ensina o dono: "ProRes RAW ainda não é lido aqui: no app Blackmagic, exporte em ProRes 422 HQ". Hoje a mensagem é genérica [código ingest.py:38-39].
- **`api/projetos.py` `ver_projeto`** [código :118-127]: cada `arquivos[]` ganha `gravacao` (resumo da 6.4), lido de `derivados/<p>/<a>/ingest.json`. Arquivo sem ingest pronto vem sem o campo.
- **Rota nova:** `POST /v1/projetos/{pid}/arquivos/{aid}/gravacao` com corpo `{"familia_cor": "applelog" | "sdr709" | ...}`, para a confirmação única (6.4).
  - A decisão grava em `memoria/gravacao/decisoes.json`, com chave `marca|modelo|app|codec|perfil`. Vale para os próximos arquivos iguais.
  - A rota já passa pelo proxy: a expressão `projetos\/p_...(\/...)?` cobre o caminho [código apps/web/app/api/motor/[...rota]/route.ts:10].
- **`apps/web/componentes/Projeto.tsx`:** na lista `ul.arquivos` [código :179-188], uma linha por arquivo com o `rotulo`, os `selos` em chip e, se houver, o botão de confirmação. O tipo do projeto ganha `gravacao?` opcional.
- **`packages/schemas/analise.schema.json`:** `midia.gravacao` opcional (o bloco `midia` tem `additionalProperties: false`, por isso precisa da declaração). Só depois do pull do commit de M2, que mexe no mesmo arquivo.

### 6.2 Contrato `midia.gravacao` (todos os campos opcionais; `null` = o arquivo não informa)

Subconjunto da O1 §6. Fica só o que alguma decisão ou a tela usa.

```jsonc
"gravacao": {
  "versao": "g1",
  "origem": {"marca": "Apple", "modelo": "iPhone 15 Pro", "software": "18.1",
             "app": "camera_apple|blackmagic|final_cut_camera|android|camera|desconhecido",
             "lente": "string|null", "tem_gps": true},          // nunca gravar coordenadas (O1 §5.9)
  "video": {"codec": "hevc", "perfil": "Main 10", "tag": "hvc1", "pix_fmt": "yuv420p10le", "bits": 10,
            "croma": "420|422|444", "faixa": "tv|pc", "matriz": "bt2020nc", "primarias": "bt2020",
            "transferencia": "arib-std-b67", "bitrate_mbps": 52.3, "w_cod": 3840, "h_cod": 2160, "espelhado": false},
  "hdr": {"dv_perfil": 8, "dv_compat": 4, "mastering": true, "maxcll": 1000, "amve": true},
  "tempo": {"fps_r": 30.0, "fps_medio": 29.97, "fps_nominal": 30.0, "vfr": false, "vfr_min": null, "vfr_max": null,
            "fps_captura": 30.0, "fps_reproducao": 30.0, "alta_taxa": false, "intencao_taxa_cheia": null},
  "trilhas": {"video": 1, "audio": 1, "dados": 0},
  "audio": {"codec": "aac", "taxa": 48000, "canais": 2},
  "familia_cor": "sdr709|hlg|hlg_dv84|pq|applelog|applelog2|slog3|vlog|clog3|dlog|dlogm|desconhecida",
  "confianca_cor": 0.95,
  "evidencias": ["transferencia=arib-std-b67", "dv_perfil=8 compat=4"],
  "modo_captura": "normal|camera_lenta|cinema|desconhecido",
  "perfil": "iphone_hdr_dv",                 // id da tabela 6.3
  "rotulo": "iPhone 15 Pro · HDR Dolby Vision · 4K 30 fps · 10 bits",
  "selos": [{"id": "hdr", "texto": "HDR: vou converter a cor com cuidado", "tom": "info"}],
  "tratamento": ["HDR para SDR antes da cor (mobius)"],
  "suportado": true,
  "precisa_confirmar": false,
  "avisos": []
}
```

Regras:
- `bits` vem de `bits_per_raw_sample` ou do `pix_fmt`. No HEVC sintético o `bits_per_raw_sample` veio vazio [medido aqui].
- `app`: se `com.apple.quicktime.software` ou `encoder` não bater com nenhuma assinatura conhecida, fica `desconhecido`. As assinaturas de cada app estão [não confirmado] e se fecham com o kit.
- `fps_captura` = `avg_frame_rate` arredondado.
- `fps_reproducao` = 30 quando `intencao_taxa_cheia == 0` (câmera lenta do iPhone [O1 §4.6, Apple quickTimeMetadataFullFrameRatePlaybackIntent]); senão é igual a `fps_captura`. Onde fica a rampa do slo-mo no arquivo está [não confirmado]; o campo `rampa` só entra quando o kit mostrar.

### 6.3 Perfis de captura (detecção, rótulo e tratamento)

| perfil | sinais (ordem de força) | confiança | rótulo para o dono | tratamento |
|---|---|---|---|---|
| `sdr_8bit` | `pix_fmt` yuv420p ou yuvj420p, trc bt709 ou vazia | 0,9 | "iPhone · 4K 30 fps · cor normal" | caminho de hoje |
| `iphone_hdr_dv` | HEVC Main 10, `colr` 9/18/9, side data DOVI perfil 8, compat 4 [O1 §3 l.3, TN3145] | 0,98 | "HDR Dolby Vision (padrão do iPhone)" | HLG→SDR (Onda 2a), RPU ignorado |
| `hlg` | trc `arib-std-b67`, primárias bt2020, sem DOVI | 0,95 | "HDR HLG" | HLG→SDR |
| `pq_hdr10` | trc `smpte2084`, mastering ou MaxCLL | 0,95 | "HDR10" | PQ→SDR, `npl` pelo MaxCLL |
| `prores_sdr` | `prores` apch/apcn/apcs/apco, trc bt709 | 0,9 | "ProRes 422 HQ · 10 bits" | entra em 10 bits; nitidez do perfil "sem processamento" (Onda 3) |
| `applelog_prores` | ProRes, primárias bt2020 ou vazias, trc vazia, `make=Apple`, histograma achatado (p2 ≈ 0,15, p98 ≤ 0,72, saturação baixa) | 0,6 sem chave de log; 0,95 com a chave `LogTransferFunction` [não confirmado, O1 §4.1] | "Apple Log: vou revelar a cor" | Apple Log→709 em 16 bits (Onda 2b); abaixo de 0,8 pede confirmação |
| `applelog_hevc` | HEVC 10 bits com os mesmos sinais, app de terceiros | 0,6 | idem | idem |
| `applelog2` | chave de log 2 ou iPhone 17 Pro com sinais de log [O1 §4.1] | 0,5 | "Apple Log 2: ainda sem conversão" | trava estilos fortes (só E01/E10), avisa; fórmula [não confirmado] |
| `camera_log` | `make` Sony/Panasonic/Canon/DJI + histograma de log | 0,4 | "Câmera em log: confirme qual" | pergunta S-Log3 / V-Log / outro; S-Log3 e V-Log têm fórmula [O1 §4.10]; Canon e DJI ficam travados |
| `prores_raw` | tag `aprn`/`aprh` ou codec desconhecido [O1 §3 l.7] | 1,0 | "ProRes RAW: ainda não leio" | `suportado:false` + instrução de exportação |
| `braw` | extensão `.braw` | 1,0 | "Blackmagic RAW: ainda não leio" | idem (SDK grátis fica na Onda 7) |
| `cinema` | mais de 1 trilha de vídeo/dados no .mov [O1 §4.11] | 0,7 | "Modo Cinema: o desfoque não vem no arquivo" | lê `v:0`; sugere mandar o renderizado |
| `camera_lenta` | fps ≥ 100 ou `intencao_taxa_cheia=0` | 0,95 | "240 fps: câmera lenta de verdade" | libera `lento_vel` até 0,125 (Onda 4) |
| `vfr` | \|r − avg\| / avg > 1% ou desvio dos PTS > 5% | 0,9 | "fps variável (pouca luz): vou alinhar" | normaliza no `ler()` (Onda 4) |
| `app_pro` | `software`/`encoder` do Blackmagic ou Final Cut Camera [não confirmado] | 0,5 | "Gravado sem o processamento da Apple" | nitidez +, redução de ruído leve (Onda 3/6) |

Um arquivo pode ter vários perfis ao mesmo tempo (ex.: `iphone_hdr_dv` + `camera_lenta`). `perfil` guarda o principal, que é o de cor; os outros viram selos.

### 6.4 Contrato da tela (site e motor trabalham em paralelo)

`GET /v1/projetos/{pid}` → `arquivos[]`:

```jsonc
{"id": 3, "nome": "IMG_0421.MOV", "estado": "pronto",
 "gravacao": {"rotulo": "iPhone 15 Pro · HDR Dolby Vision · 4K 30 fps · 10 bits",
              "selos": [{"id": "hdr", "texto": "HDR: cor convertida com cuidado", "tom": "info"},
                        {"id": "lenta", "texto": "240 fps: câmera lenta real", "tom": "bom"}],
              "avisos": [], "suportado": true,
              "confirmar": null}}      // ou {"pergunta": "Esse clipe foi gravado em Apple Log?", "opcoes": [{"valor": "applelog", "rotulo": "Sim, Apple Log"}, {"valor": "sdr709", "rotulo": "Não, cor normal"}]}
```

- `tom` ∈ `bom | info | aviso | erro`.
- Texto em pt-BR, 1 linha, sem jargão além do nome da gravação.
- Celular a 390 px: rótulo em uma linha com reticências; selos quebram linha; alvo de toque ≥ 44 px (skill `padrao-de-entrega`).

### 6.5 Aceite (material sintético; gerador novo `tests/midia_sintetica.py`)

O gerador usa `ffmpeg -f lavfi` e `-movflags use_metadata_tags` para as chaves Apple. Conferido aqui: o `ffprobe` devolve `com.apple.quicktime.make/model/full-frame-rate-playback-intent` em `format.tags`.

1. SDR H.264 `yuvj420p` → `perfil=sdr_8bit`, `faixa=pc`, `bits=8`.
2. HEVC 10 bits HLG com tags bt2020/arib (`libx265`) → `perfil=hlg`, `bits=10`. Conferido aqui: `profile=Main 10`, `color_transfer=arib-std-b67`.
3. HEVC 10 bits PQ com `master-display` e `max-cll` (x265-params) → `pq_hdr10`, `maxcll` lido.
4. Fixture JSON de `ffprobe` com side data DOVI (campos `dv_profile=8`, `dv_bl_signal_compatibility_id=4` do doxygen [O1 §4.3]) → `iphone_hdr_dv`. Teste da função pura: não dá para gerar DV aqui.
5. ProRes HQ sem tag de transferência, `make=Apple`, quadros com reflectâncias codificadas pela fórmula Apple Log → `applelog_prores`, `confianca < 0,8`, `precisa_confirmar=true`. Depois do `POST .../gravacao`, um segundo arquivo igual sai confirmado.
6. 240 fps com `full-frame-rate-playback-intent=0` → `camera_lenta`, `fps_captura=240`, `fps_reproducao=30`.
7. Clipe VFR (30/60/24 concatenados, como em [O1 §2.3a]) → `vfr=true`, `fps_medio≈38,4`, `fps_r=60`.
8. .mov com 2 trilhas de vídeo → selo `cinema`.
9. Fixture de erro de codec desconhecido → `ErroDefinitivo` com a frase de exportação.
10. Arquivo antigo (ingest.json sem `gravacao`) → a segunda chamada de `ingest` preenche só a `gravacao` e não regrava os quadros-chave (o mtime dos JPG não muda).
11. Site: `pnpm aceite` com o motor falso devolvendo `gravacao`; print a 390 px e no desktop (`verificacao-visual`); a linha aparece e o botão de confirmação funciona no `navegador`.

### 6.6 Custo
- CPU: um `ffprobe` a mais por arquivo (dezenas de ms; o ingest hoje leva 0,7 a 1,4 s por clipe de 8 a 20 s [PROGRESSO.md:14]). A lista de PTS só roda em VFR ou alta taxa (tempo [não confirmado]; estimativa abaixo de 1 s para 1 min a 240 fps). O histograma usa os JPG que já existem (ms).
- Disco: ~2 KB por arquivo no `ingest.json`.

### 6.7 Não fazer
- Não gravar GPS (só `tem_gps`) nem mandar metadado bruto ao diretor (Claude). O catálogo recebe só família, fps de captura e bits.
- Não decidir Apple Log só por histograma com confiança alta. Abaixo de 0,8 pergunta uma vez por câmera/app.
- Não aumentar `ALGO` do ingest. Não instalar `exiftool`: não existe aqui (conferido) e o `ffprobe` já lê as chaves Apple.

---

## 7. Onda 2: cadeia de cor por perfil, antes de qualquer look

### 7.1 O que muda
- **`montagem/comum.py` `meta()`** [código :73-105]:
  - pede também `color_transfer, color_primaries, color_space, bits_per_raw_sample, codec_name, codec_tag_string`;
  - `Meta` ganha `familia` e `bits`, calculados por `gravacao.familia_cor` (só por tag; sem histograma).
  - Isso cobre HLG, DV 8.4 e PQ sem mudar o EDL.
- **`montagem/planos.py`:**
  - `entrada_vf(m)` [código :75-76] vira `entrada_vf(m, familia, w, h)` e devolve a cadeia da 7.2;
  - a montagem do `vf` [código :249] usa essa cadeia no lugar de `scale=...:{entrada_vf(m)}`;
  - `chave_plano` [código :402-409] inclui a família e o id dos parâmetros só quando a família não é `sdr709`.
- **Arquivo de dados novo `memoria/cor/entrada.json`:**
  - parâmetros por família: tonemap (`mobius`, `param 0.3`, `npl 100`, `desat 0`), arquivo de LUT, versão;
  - calibrar com o kit vira editar dados, não código.
- **`etapas/ingest.py` `extrair`** [código :110]: a cadeia `sdr` dos quadros-chave passa a ler os mesmos parâmetros. Assim a medição de cor (`cor.medir`, balanço) vê a mesma imagem que o render.
- **Onda 2b (depois de M2 a M4):**
  - `resolvedor.py`, no montador de `fontes` (hoje `resolvedor.py:314-317` no arquivo em edição; era `:304-307` no commit 5325812; já passa `fps`), acrescenta `cor_entrada = analise.midia.gravacao.familia_cor` quando a família não sai por tag (log);
  - `planos.render_plano` usa `fontes[].cor_entrada` acima da família da tag.
- **Gerador de LUT `motor/cor_entrada.py` (novo):**
  - gera `memoria/cor/luts/<familia>_bt709_33.cube` a partir da fórmula publicada (Apple Log: constantes da O1 §4.1, via colour-science, citando o white paper e o IDT ACES de licença permissiva);
  - matriz BT.2020→709;
  - ombro de altas luzes reaproveitando `cor._ombro` [código cor.py:186]. O Apple Log codifica até R = 12, 6 stops acima do cinza [O1 §4.1]; sem ombro, tudo acima do branco estoura.
  - S-Log3 e V-Log têm constantes [O1 §4.10] e entram do mesmo jeito. Canon Log 3, D-Log e D-Log M ficam sem LUT (constantes [não confirmado]).
- **Nunca LUT oficial de fabricante** sem guardar o texto da licença em `memoria/` (Canon é restritiva [O1 §4.10]).

### 7.2 Cadeias (todas convertem antes de virar `bgr24` 8 bits)
- `sdr709`: string atual, sem mudança. Se `color_space` for bt470bg ou smpte170m, usar `in_color_matrix=bt601` (hoje fixo em 709).
- `hlg`, `hlg_dv84`:
  ```
  crop=...,zscale=w=W:h=H:f=lanczos:tin=arib-std-b67:min=2020_ncl:pin=2020:rin=<faixa>:t=linear:npl=100,
  format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:param=0.3:desat=0,
  zscale=t=bt709:m=bt709:r=tv:dither=error_diffusion,format=bgr24
  ```
  - Testada aqui: 35,1 ms por quadro contra 23,6 da cadeia atual (4K sintético, 2 threads).
  - O RPU do Dolby Vision é ignorado (a base é HLG [O1 §4.3]).
- `pq`: igual, com `tin=smpte2084` e `npl` = MaxCLL limitado a 100 a 1000 [proposta].
- `applelog`:
  ```
  crop=...,scale=W:H:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt2020:in_range=<faixa>,
  format=gbrp16le,lut3d=file=<lut>:interp=tetrahedral,format=bgr24
  ```
  - Testada aqui: 29,4 ms por quadro (+5,8).
  - A mesma LUT aplicada depois do 8 bits custou 34,6 ms e é exatamente o que a Apple manda não fazer.

### 7.3 Aceite (sintético)
1. **SDR intocado:** um plano de fonte SDR renderizado antes e depois sai com o mesmo `sha256` e a mesma `chave_plano`.
2. **HLG volta ao lugar:** patches de cor dentro do gamut 709, codificados em HLG/BT.2020 10 bits, voltam ao valor 709 original com ±4 códigos nos tons médios.
   - Hoje a matriz errada desloca até ~8 níveis [O1 §2.3d].
   - Nenhum canal pode ser cortado em 0 num patch dentro do gamut. A cadeia do ingest cortava: vermelho 217,0,0 [O1 §2.3d].
3. **Apple Log:** reflectâncias 0, 1, 5, 18, 50 e 90% saem 0, 11, 48, 104, 180 e 242 com ±2 códigos (a O1 mediu ±1). A rampa de R de 0 a 12 é monotônica, sem degrau maior que 2 códigos, e R = 12 não passa de 255.
4. **Banding:** degradê de céu em 10 bits passa pela cadeia nova e pela "8 bits primeiro". A maior corrida de pixels iguais na nova é menor que a metade da outra.
5. **Volta atrás:** com `EDITOR_COR_ENTRADA=legado` o HLG sai igual ao de hoje (mesmo `sha256`).
6. **QA nova `entrada_convertida`** (observação): todo plano de fonte HDR ou log tem `info["cor_entrada"]` diferente de `sdr709`.
7. **Calibração (com o kit, não bloqueia a entrega da onda):** ajustar `param`/`npl` até luma média, p2 e p98 do clipe HDR baterem com o SDR que o próprio iPhone exporta (amostra 1 contra 2) [O1 §4.3].

### 7.4 Custo
- Render HLG: +11,5 ms por quadro sobre ~142 ms do plano 4K [PROGRESSO.md:22], cerca de +8%.
- Render Apple Log: +5,8 ms, cerca de +4%.
- SDR: zero.
- Disco: LUT 33³ ≈ 1 MB por família.

### 7.5 Não fazer
- Não usar libplacebo (precisa de Vulkan; falha aqui [O1 §2.3]).
- Não aplicar estilo de cor forte sobre log sem conversão.
- Não reescrever `cor.py` para 16 bits nesta onda (D1).
- Não entregar HDR (D7 e Onda 7).

---

## 8. Onda 3: exportação mestre + derivado, com nota de qualidade

### 8.1 O que muda

3a muda só `planos.py`, `comp.py` e `qa/formato.py` (livres hoje). 3b depende de arquivos que a M4 está editando. Os itens de 3b estão marcados.
- **`montagem/planos.py`:**
  - encode do cache [código :328-332] passa a `libx264 -preset ultrafast -crf 6 -pix_fmt yuv444p10le -g 30`, mantendo as tags bt709 (D5);
  - `VERSAO` = `"p6"`.
- **Buffer JPEG q96** [código :256,284] (terceira perda silenciosa) troca por `numpy.memmap` em `tmp/` (cru, sem perda, sem CPU). `info["buffer"]` passa a `"disco"`.
- **`montagem/comp.py` `compor`** [código :283-289]: o ffmpeg final recebe o pipe e grava as duas saídas (D2). Em 3a, só o derivado; em 3b, entra o mestre:
  - **mestre:** `-map 0:v -map 1:a -c:v prores_aw -profile:v 3 -pix_fmt yuv422p10le` com tags bt709/tv; áudio `pcm_s24le` do `mix.wav`; arquivo `mestre.mov`;
  - **derivado** (`final.mp4`): `libx264 -preset medium -crf 16 -profile:v high -level 4.2 -x264-params aq-mode=3:keyint=60:min-keyint=30:bframes=2:ref=4:open-gop=0 -maxrate 24M -bufsize 36M`, `yuv420p`, bt709 tv, AAC 256k 48 kHz, faststart, **sem `noise`** [O2 §6.2; D4].
  - O grão passa a ser parte do look (Onda 6, determinístico, no numpy) e entra igual nas duas saídas.
  - `janela` (trecho de prévia): só o derivado.
- **`montagem/__init__.py`** (3b, depois de M4):
  - grava `saidas/<p>/<v>/mestre.mov` ao lado de `final.mp4` [código :184];
  - `EDITOR_CACHE_PLANOS_MB` padrão 4000 [código :199]. Na 3a, sem mexer no arquivo: basta definir a variável no ambiente (o código já a lê);
  - limpeza do mestre pela regra de retenção (D3).
- **`etapas/entrega.py`:** nada muda no fluxo. O link continua sendo do `final.mp4`, com o mesmo `sha256` [código :69-73]. O relatório ganha `"mestre": chave` (não vai por link).
- **`qa/formato.py` `checar`** [código :24-46]:
  - mantém o perfil Reels;
  - acrescenta `keyint ≤ 5 s` (lista de quadros-chave por `-skip_frame nokey`);
  - se houver mestre: `prores`, `yuv422p10le`, tags bt709.
- **`qa/qualidade_preservada.py` (novo, 3b), em `EM_OBSERVACAO` até calibrar:**
  - SSIM e PSNR-Y do `final.mp4` contra o `mestre.mov`, com `settb=AVTB,setpts=N/FPS/TB` nas duas entradas (sem isso, arquivo idêntico dá 25 dB [O2 §7]);
  - também confere `info.zoom_x` e a ampliação sobre a fonte (`sem_ampliacao`, acima de 1,15x avisa [proposta]) e `buffer` diferente de `jpeg`;
  - limiares [O2 §7, proposta]: aprova SSIM ≥ 0,985, PSNR-Y ≥ 40 dB e pior quadro ≥ 34 dB.
- **`qa/__init__.py`:** `CHECAGENS` ganha `qualidade_preservada` e `entrada_convertida`.
- **Schemas:**
  - `qa.schema.json`: o `enum` de `checagens[].id` ganha os dois ids;
  - `edl.schema.json`: `master` ganha `mestre` (bool, padrão true), `preset` (`veryfast | medium | slow`), `grao` (0 a 3, padrão 0), `perfil` (`reels | youtube | youtube_4k`, padrão `reels`); o `crf` atual continua.
- **Nitidez por perfil:** a máscara fixa 1,18/−0,18 [código planos.py:374-376] lê um ganho por família/app:
  - iPhone padrão 0,10;
  - ProRes/app pro 0,25;
  - resto 0,18 (hoje) [O2 §5, proposta; efeito do app Blackmagic [não confirmado]].
  - O ganho vem de `fontes[].nitidez` (opcional; ausente = 0,18).

### 8.2 Aceite (sintético)
1. **Gerações:** um filme sintético de 10 s com textura (`testsrc2` + `noise=alls=4`) pela montagem. PSNR-Y do `final.mp4` contra os quadros do pipe, gravados no teste em `rawvideo`, fica ≥ 2 dB acima da cadeia atual. Referência medida aqui: o cache atual sozinho já fica em 31,6 dB RGB, contra 45,9 no novo.
2. **Mestre:** `ffprobe` mostra `prores`, `yuv422p10le`, bt709/tv, áudio `pcm_s24le` 48 kHz; mesma duração do `final.mp4` com tolerância de 1 quadro.
3. **Formato:** `final.mp4` passa no `formato` atual + `keyint ≤ 2 s` + `open-gop=0`; o `sha256` do QA continua batendo com a entrega.
4. **`qualidade_preservada`:**
   - roda e grava valores;
   - um derivado forçado com `crf 35` cai abaixo de 36 dB e a checagem acusa (em observação: avisa, não bloqueia);
   - tempo da checagem ≤ 15 s num filme de 45 s (a O2 mediu ≈ 13 s).
5. **Sem grão:** o mesmo céu liso de 2 s tem `final.mp4` ≤ 1/2 do tamanho atual (a O2 mediu 70 KB contra 218 KB).
6. **Buffer:** um plano maior que `EDITOR_PLANO_RAM_MB` sai idêntico (mesmo hash dos quadros) ao renderizado com RAM sobrando.
7. **Volta atrás:** `EDITOR_EXPORT=legado` reproduz o `final.mp4` de hoje; `EDITOR_MESTRE=nao` não grava o mestre.
8. **`aceite_c` 31/31 e pytest verde.**

### 8.3 Custo
- CPU, por segundo de filme (pior caso medido aqui, 4 threads):
  - derivado `medium` 2,2 s (hoje `veryfast` ~0,7 a 1,2 s);
  - mestre `prores_aw` 0,7 s em paralelo;
  - cache 0,94 s (hoje 1,41 s).
  - Filme de 45 s: cerca de +60 a +90 s no total.
- Disco: mestre de 228 a 433 Mbps (1,3 a 2,4 GB num filme de 45 s); cache 231 Mbps (≈ 1,3 GB por 45 s de planos).
  - Aqui sobram 56 GB.
  - O volume do Railway: [não confirmado]. Conferir antes de ligar o mestre em produção; até lá, `EDITOR_MESTRE=nao` lá e ligado no teste.

### 8.4 Não fazer
- Não derivar de outro derivado.
- Não ampliar 1080 para 4K em derivado nenhum.
- Não usar `gradfun` antes de compressão [O2 §5, documentação do ffmpeg].
- Não pôr `noise` global de novo.
- Não bloquear a entrega com limiar não calibrado.
- Não usar HEVC como padrão: a O2 mediu x265 pior no mesmo tamanho.

---

## 9. Onda 4: tempo (fps, VFR, câmera lenta, rampa)

### 9.1 O que muda (4a: só `planos.py` e `comum.py`)
- **VFR:**
  - `meta()` passa a usar `fps_nominal` (mediana dos deltas de PTS quando `vfr`) em vez de `r_frame_rate` [código comum.py:96];
  - `ler()` [código planos.py:53-73] acrescenta `fps=fps=<nominal>` no início do `vf` quando a fonte é VFR. Isso mantém a duração e a sincronia com o áudio [O1 §4.5, medido lá];
  - `nb` vira `round(dur * nominal)`.
- **Rampa com câmera lenta (defeito real):**
  - hoje, com `rampa`, `camera_lenta()` é falso [código planos.py:178-180] e o trecho 0,4x de fonte 30 fps repete quadros [O4 §4.3];
  - `camera_lenta` vira por quadro: velocidade local = `diff(ts) * FPS`, e mistura onde ela for < 0,95;
  - `indices_de_quadro` [código :183-197] recebe um vetor `lento` em vez de bool. É função pura, testável.
- **Interpolação por fluxo (opção do plano, `planos[].interp = "fluxo"`):**
  - quando a fonte não tem quadros para a velocidade pedida (fps_fonte × vel < fps_saída);
  - DIS em 270x480 + `remap` 1080x1920 ≈ 29 ms por quadro sintetizado [O4 §6];
  - só nos quadros lentos; fallback = mistura de hoje.
- **Alta taxa em velocidade real (opção de modo `movimento.obturador = 180`):**
  - média de k = fps_fonte / (2 × 30) quadros vizinhos já decodificados (120 → 2, 240 → 4), em vez de pegar 1 a cada 4 ou 8 sem borrão [O1 §4.6];
  - padrão desligado até o teste visual com o kit.
- **Câmera lenta real:** com `fps_captura ≥ 60`, o plano com `vel` 0,5 (≥ 120: 0,25; 240: 0,125) usa quadros reais e dispensa mistura. A regra de quem pode pedir câmera lenta é da M4; aqui só se garante o render.
- **Schema `edl.schema.json`:**
  - `planos[].interp` ∈ `mistura | fluxo` (padrão `mistura`);
  - `planos[].obturador` (graus, opcional);
  - `fontes[].vfr` (bool);
  - `fontes[].fps_captura` (número). O `fps` já existe [código edl.schema.json:37].
- **4b (depois de M4), `resolvedor.py`:**
  - a rampa sai do perfil fixo 1,6x / 0,4x / ~1,37x em 35% e 65% [O4 §4.3] para um perfil ancorado:
    - o pico de movimento do plano (série do `movimento.py`, já no catálogo pela M2) cai na batida mais próxima (`musica.mapa`);
    - velocidades ~1,5 a 2x / 0,3 a 0,5x por 1 a 2 batidas / ~1,2x [proposta].
  - Com fonte < 60 fps, a rampa só desce abaixo de 0,5x com `interp: fluxo`.

### 9.2 Aceite (sintético)
1. **VFR:** o clipe VFR de 30/60/24 fps com uma barra que anda 1 px por ms. O quadro do filme em t = 1,0 s mostra a barra na posição de t = 1,0 ± 1 quadro (hoje erra até 0,5 s [O1 §2.3a]).
2. **Rampa:** fonte de 30 fps, rampa com trecho 0,4x. No trecho lento não há dois quadros de saída idênticos seguidos (hoje há ~2,5 repetições por quadro).
3. **Fluxo:** barra em movimento uniforme a 0,25x. O erro de posição do quadro sintetizado contra a posição ideal é ≤ 2 px; o tempo é ≤ 40 ms por quadro sintetizado.
4. **Obturador:** fonte de 240 fps com barra rápida. O borrão medido no quadro de saída tem a largura de 4 quadros de deslocamento, ±1 px.
5. **Câmera lenta real:** fonte 240 fps com `vel` 0,125. Os 8 quadros de saída seguidos são os quadros-fonte n, n+1, ..., sem mistura nem repetição.
6. **Regressão:** um plano de 30 fps sem rampa nem `vel` sai com o mesmo hash de antes.

### 9.3 Custo
- VFR: ~0.
- Mistura: ~5 ms por quadro lento.
- Fluxo: ~29 ms por quadro sintetizado (1 s de câmera lenta ≈ 0,9 s de CPU).
- Obturador: (k−1) misturas por quadro, ~5 a 15 ms.
- Decodificar fonte de 240 fps já custa 8 quadros por quadro de saída hoje (o `ler()` decodifica o intervalo inteiro); não muda.

### 9.4 Não fazer
- Não usar `minterpolate` como padrão (lento e com artefato [O3 §4.5, O4 §4.3]).
- Não converter fps duas vezes.
- Não mudar a saída de 30 fps (D7).
- Não inventar a rampa do slo-mo do iPhone antes do kit (onde ela fica no arquivo está [não confirmado]).

---

## 10. Onda 5: modos de edição como dados (46 modos, 3 sugestões, celular)

### 10.1 5a: dados, carregador e sugestão (hoje, sem tocar no resolvedor)
- **Arquivos:**
  - `memoria/modos/<id>.json` com `versao: 2` para os 46 modos da O3 §5 + os 7 atuais como bases (O3 §5.1);
  - os 7 atuais continuam v1 e ganham `versao: 2` só quando forem tocados;
  - blocos em `memoria/modos/_blocos/{cor,legenda,transicoes,som,movimento,abertura,fecho}.json` (O3 §4: E01 a E14, G1 a G9, T-*, S-*, M-*, A-*, F-*);
  - modos do dono em `memoria/modos/meus/`.
- **`memoria/loja.py`:**
  - `Loja.modo(nome)` [código :64-68] passa a resolver `base` (1 nível) e os blocos, devolvendo o modo "achatado";
  - `modelo_com_modo` [código :70-97] continua igual para v1 e, para v2, traduz os eixos que o motor já entende (O3 §3.4, tabela);
  - `Loja.modos()` lista o catálogo, com cache em memória.
- **Novo `motor/modos.py`:**
  - `validar(modo)` com as 5 regras da O3 §3.3:
    - id único;
    - `permitidas` ∩ `proibidas` = vazio;
    - `legenda.y` entre 0,15 e 0,75, tamanho ≥ 56;
    - `vel_fala` entre 1,00 e 1,25;
    - `ia` só com `rotulo_conceito`;
  - `sinais(projeto) -> dict`: `fala_pct`, rostos, movimento/tremor (M2), ambiente, tipo, duração, e da Onda 1 `fps_captura` máximo, família de cor, `alta_taxa`, `vfr`;
  - `sugerir(sinais, historico) -> [seguro, diferente, ousado]` pela pontuação e diversidade da O3 §6.3 e os filtros de segurança da O3 §6.2. Cada cartão traz `razao` montada só com números medidos.
- **API (rotas cobertas pela expressão do proxy):**
  - `GET /v1/projetos/{pid}/modos` →
    ```jsonc
    {"lido": {"resumo": "11 vídeos · 4K · 30 fps · você falando 62% · loja",
              "selos": [{"id": "lenta", "texto": "tem câmera lenta de verdade", "tom": "bom"}]},
     "cartoes": [{"id": "varejo-reporter", "nome": "Repórter de loja", "familia": "varejo",
                  "descricao": "...", "papel": "seguro|diferente|ousado",
                  "razao": "62% do material é você falando para a câmera, 14 planos de loja", "previa": null}],
     "familias": [{"id": "viagem", "nome": "Viagem", "n": 4}],
     "trocas_restantes": 2}
    ```
  - `GET /v1/projetos/{pid}/modos?familia=viagem` → `{"modos": [{id, nome, descricao}]}`;
  - `GET /v1/projetos/{pid}/modos?trocar=1` → próximos 3 cartões;
  - `POST /v1/projetos/{pid}/modos/salvar` com `{"base": "<id>", "nome": "...", "ajustes": {"ritmo": "calmo|normal|rapido", "cor": "natural|modo|forte", "texto": "discreto|modo|grande"}}` → grava em `memoria/modos/meus/<slug>.json`.
- **`pedido.schema.json`:**
  - `modo`: de `enum` para `{"type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,40}$"}`;
  - novo `ajustes_modo` opcional (os 3 controles acima);
  - a API recusa modo fora do catálogo.

### 10.2 5b: ligação mecânica (depois de M2 a M4)
- **`etapas/direcao.py`:** o dicionário `MODOS` [código :24-33] vira `loja.modo(n)["diretor"]["frase"]`, com o dicionário como reserva. `proibe`/`exige` entram no texto do pedido como hoje o `sem_transicoes` [código :57-62].
- **`resolvedor.py`** (limites que o diretor não consegue furar [O3 §8.2]):
  - `transicoes.permitidas`;
  - `freq_max_por_30s`;
  - `ritmo.plano_s` como teto/piso da `dur` de cobertura por energia;
  - `legenda.estilo` (modelo do kit: `legenda`, `legenda_revelada`, `laboratorio`, `hud`);
  - `abertura/fecho.modelo` (`gancho2`, `fecho2`);
  - `som.sfx`;
  - `som.trilha.clima/bpm` como filtro da lista que vai ao diretor (`catalogo.py:184`).
- **Cor do modo:** `cor.estilo` e `grao`/`vinheta` entram na Onda 6 (técnica 2). Até lá, o cartão diz "cor do ambiente" e não promete look. Hoje o modo "cinema" promete LUT e não tem [O3 §2.3].

### 10.3 5c: celular (`componentes/Projeto.tsx`, `lib/estados.ts`)
- **`Pedido`** [código Projeto.tsx:363-445] troca os 8 rádios por:
  1. faixa "Li seu material" (`lido.resumo` + selos);
  2. 3 cartões (nome, 1 linha, razão; um toque escolhe);
  3. "não é isso" (até 2 trocas);
  4. "outro estilo": 13 chips de família (máximo 3 toques até qualquer modo);
  5. 3 ajustes finos;
  6. "salvar como meu modo".
- O botão grande "O editor decide" (`auto`) continua e executa o cartão 1.
- `MODOS` em `estados.ts` [código :34-43] vira a lista de reserva caso a rota falhe.
- `perguntasDoModo`: o filtro `modos?` passa a aceitar família.
- Prévia: primeiro sem imagem; depois 1 quadro estático por cartão (cor + legenda do modo sobre um quadro-chave). A prévia em movimento fica na Onda 7: custo [não confirmado].

### 10.4 Aceite
1. Os 53 arquivos (46 + 7) passam em `validar`. Um arquivo com `legenda.y = 0,9` falha com a mensagem da regra.
2. Para cada modo v1 atual, `modelo_com_modo` devolve exatamente o dicionário de hoje (teste de igualdade em `test_modos.py`, que já existe).
3. Herança: `viagem-teal` com `base: cinema` herda `pausa_max` 0,35 e sobrescreve `zoom_max`.
4. Sugestão (fixtures de sinais):
   - fala 62% + loja + 30 fps → `varejo-reporter` como seguro;
   - os 3 de famílias diferentes;
   - o "diferente" tem outro tipo de corte;
   - captura < 60 fps não sugere `esporte-epico`;
   - log sem conversão tira estilos fortes;
   - `fala_pct < 0,1` remove modos de fala.
5. 5b: com `permitidas` sem `whip`, nenhum `whip` sai no EDL mesmo que a direção peça; `freq_max_por_30s = 3` limita a contagem.
6. 5c: `pnpm aceite`; `navegador` faz escolher, trocar, família, ajuste e salvar; `verificacao-visual` a 390 px e no desktop, claro e escuro, alvos ≥ 44 px.

### 10.5 Custo
- Sugestão: ms (pontuação em Python).
- Prompt: só o modo escolhido entra (frase ≤ 40 palavras + listas); o catálogo não vai ao diretor.
- Disco: ~53 arquivos de 2 a 3 KB.

### 10.6 Não fazer
- Não mostrar 46 botões.
- Não deixar modo vencer a segurança (zona segura, LUFS, QA de fala, olho de IA).
- `ia` não é estilo (é marcador; custo pago pede autorização).
- Não copiar assinatura visual protegida de creator: `inspira` é só rótulo.
- Não usar G9 (sem legenda) como padrão de nenhum modo de fala.

---

## 11. Onda 6: as 10 técnicas premium de maior efeito

Escolhidas pela O4 §3 e §5 (efeito contra esforço), mais uma vinda da leitura da gravação. Cada uma é **parâmetro de modo**, não código por vídeo. O campo novo fica opcional no EDL ou no modo; ausente = hoje.

| # | Técnica | O que muda (arquivo, função) | Campo novo | Aceite sintético | Custo de CPU | Não fazer |
|---|---|---|---|---|---|---|
| 1 | Rampa na batida + câmera lenta por fluxo | Onda 4 (`planos.py`) + 4b (`resolvedor.py`) | `planos[].interp`; modo `movimento.rampa` | pico da rampa a ≤ 1 quadro da batida; sem quadro repetido no trecho lento | ~29 ms por quadro sintetizado | rampa fora da batida; mais de 1 rampa a cada 10 s |
| 2 | Gradação de filme: halation em 1/4 de resolução, grão por luminância determinístico, curva ombro/pé, bloom em 1/4 | `cor.py` (`curva_canal` + chaves `ombro`, `pe` em `cor_looks.json`), `planos.py` depois de `colorir` [código :374], `fx.py` bloom [código :291] | modo `cor.estilo`, `cor.grao` 0 a 3, `cor.halation` 0 a 1; EDL `planos[].filme {halation, grao, seed}` | mesma semente = mesmos bytes; halation só acima de luma 0,78; bloom novo ≤ 45 ms por quadro (hoje 191,9 [O4 §6]) | halation ~42 ms, grão ~33 ms por quadro (cerca de +25%) | grão > 0,03 de luma; halation em todo modo; aplicar antes da conversão de log |
| 3 | Som em camadas: ambiente antecipado (J-cut 0,25 s), riser antes da revelação, queda de 0,25 s da trilha antes do drop, whoosh 6 a 10 dB abaixo da voz | `mix.py` (`som_direto`, envelope), `trilha.py` (riser sintético já existe [O4 §4.4]), `resolvedor.py` (posição) | `planos[].som_antecipa_s`; `sfx[]` tipo `riser`; modo `som.antecipa` | o som do plano B começa 0,25 ± 0,02 s antes do corte; LUFS e pico real continuam no alvo | ms | whoosh em todo corte; riser sobre palavra; comprar sons sem autorização |
| 4 | Punch-in na palavra de ênfase | `resolvedor.py` (keyframes de `enquadre` a partir do 4º valor da palavra), `overlay.py` | modo `legenda.enfase`, `movimento.punch_enfase` (1,12 a 1,15 em 0,18 s) | zoom sobe a ≤ 1 quadro do início da palavra enfática e volta no corte seguinte | ~0 | zoom em toda frase |
| 5 | Gancho de 2 s e retenção como checagem | `qa/retencao.py` (novo, observação): 1º quadro com texto e rosto ou ação; evento novo (corte, texto, som, zoom) a cada ≤ 3 s | `qa.schema` id `retencao`; modo `abertura.tipo` | filme sintético com 5 s parados reprova; o filme do `aceite_c` passa | ms (lê o EDL) | usar número de blog como meta (O4 §4.1: sem método) |
| 6 | Cadência certa por perfil: VFR alinhado, 24→30 regular, obturador 180° em 120/240 | Onda 4 | `planos[].obturador`, `fontes[].vfr` | testes da 9.2 | 5 a 15 ms por quadro | `minterpolate` padrão |
| 7 | Congelamento com recorte e contorno | `comp.py` (máscara do RVM no quadro congelado, `dilate` = contorno, fundo com `destacar` forte), `resolvedor.py` (`congela`) | `planos[].congela {contorno, cor, fundo}` | contorno de largura 9 ± 2 px em volta da máscara sintética; RVM roda 1 vez por congelamento | 1 quadro de RVM (~45 ms) + ~10 ms por quadro | mais de 1 a 2 por filme; contorno grosso |
| 8 | Transição pela máscara da pessoa | `fx.py` (tipo `pessoa`: máscara A escalada de 1 a 6x no centróide como alfa de B), `comp.py` (máscara já calculada) | `fx[].tipo = "pessoa"` (enum do EDL) | sem pessoa detectada, cai para `fade` e avisa; 12 quadros | ~50 ms por quadro, 10 a 15 quadros | em todo corte; RVM fora do servidor (GPL-3.0 [O4 §4.6]) |
| 9 | Texto preso à cena | `motion` com `ancora {caixa}`; `comp.py` (LK + homografia RANSAC em 270x480, `warpPerspective` da camada) | `motion[].ancora` | caixa sintética que translada 200 px: erro do texto ≤ 3 px; com falhas > 0,3 o texto fica fixo e avisa | ~1,6 ms rastreio [O4 §6] + ~8 ms warp [não confirmado] | superfície sem textura; mais de 1 por filme |
| 10 | Match cut de verdade | `resolvedor.py` (centro de interesse = centróide da pessoa ou da saliência; `enquadre` de B alinhado a A em 0,3 s; par escolhido por semelhança de bordas) | `fx[].tipo = "match"` ganha `alinhar: true` | o centro de B no 1º quadro fica a ≤ 2% do centro de A no último | dezenas de ms por corte, 1 vez | forçar match sem semelhança medida |

Ficam para depois (O4 §5): parallax 2.5D (só Depth Anything V2 Small, Apache-2.0), hyperlapse simples, letra de música, barras animadas.

Ordem dentro da Onda 6:
- 2 e 3 primeiro: mexem em todo vídeo e não dependem do resolvedor no caso padrão.
- Depois 4 e 5.
- Depois 1 (com 4b), 7, 8, 9, 10.

---

## 12. Onda 7: opcional, cada item com motivo

| Item | Por quê | Custo | Quem decide |
|---|---|---|---|
| ffmpeg 8.x estático na imagem de produção (`deploy/Dockerfile.tudo` usa o `apt` do Ubuntu noble = 6.1.1) | traz `libvmaf` para o QA e o decoder de ProRes RAW (2025) [O1 §3 l.7] | grátis; build BtbN tem `45-vmaf.sh`, `50-zimg.sh`, `50-libplacebo.sh` em `scripts.d` e ramos de release até 9.0 [fonte: github.com/BtbN/FFmpeg-Builds]; download do GitHub deu 403 aqui [O2 §7]; risco de regressão: rodar pytest + `aceite_c` + A/B de 3 filmes antes | arquiteto (técnico) |
| Pipeline de cor em 16 bits no numpy | só se o kit mostrar faixa em Apple Log depois do look | ~2x memória por plano, reescreve `cor.aplicar` | arquiteto, com evidência |
| Saída a 24 fps para modos de cinema | O3 §8.1; conflito Instagram 30 contra Meta 24 (D7) | toca `comum.py:15` e todo cálculo de quadro | **dono** (padrão seguro: 30) |
| Entrega HDR (HLG HEVC) para Reels | Meta aceita e gera SDR com Hable automático [O2 §3] | A/B com filme real | arquiteto, depois de teste |
| BRAW pelo SDK grátis da Blackmagic | ler `.braw` | wrapper em C++, manutenção | só se o Marcos gravar BRAW |
| Prévia em movimento de 4 s por cartão | escolha mais confiante | custo [não confirmado] | depois de medir |
| Biblioteca maior de efeitos sonoros | variedade de whoosh, riser e ambiente | pago ou geração por IA paga | **dono** (autorização de gasto) |

---

## 13. O que depende do dono (quase nada)

1. **Gravar o kit de 8 amostras** (seção 5). Tempo, não dinheiro. Destrava a calibração de HLG, a detecção de Apple Log e de app pro, o slo-mo e o VFR.
2. **Confirmar uma vez por câmera/app** quando o editor perguntar "Esse clipe foi gravado em Apple Log?". Um toque, gravado para sempre.
3. **Saída a 24 fps em modos de cinema** (Onda 7). Sem resposta, fica 30.
4. **Gasto com efeitos sonoros novos** (Onda 7). Sem autorização, usa os 7 da casa e os sintéticos.
5. Pendências que já existem e tocam este plano:
   - token do Metricool (item G), para medir retenção real e calibrar a técnica 5;
   - licença das trilhas ElevenLabs ("Precisa do dono" no `FILA.md`).

Nenhum serviço pago é necessário para as Ondas 1 a 6.

---

## 14. O que dá para fazer hoje (sem esperar ninguém)

1. Onda 0 inteira.
2. Onda 1:
   - `motor/gravacao.py` + testes de fixture;
   - chamada no `ingest.py`;
   - campo na API e linha na tela;
   - o schema `analise` só depois do pull do commit de M2.
3. Onda 2a (HLG, DV 8.4, PQ) em `comum.py` e `planos.py`, com a chave `EDITOR_COR_ENTRADA=legado`.
4. Onda 3a: cache novo, buffer sem JPEG, derivado `medium` sem `noise` com GOP de 2 s, `keyint` no `formato`. O mestre e a `qualidade_preservada` (3b) esperam o commit de M4, porque tocam `montagem/__init__.py` e `edl.schema.json`.
5. Onda 4a (VFR, rampa sem tranco, fluxo, obturador) em `planos.py` e `comum.py`.
   - Atenção: 2a, 3 e 4a mexem em `planos.py`. Fazer em sequência na mesma sessão, ou em commits pequenos com pull entre eles.
6. Onda 5a (46 arquivos, carregador, `validar`, `sugerir`, rotas).
7. Técnica 8 da Onda 6 (transição pela máscara, `fx.py`) e a parte de `mix.py` da técnica 3, ligadas por campo opcional que o resolvedor só emite depois.

Espera o commit de M2 a M4:
- Ondas 2b, 3b, 4b e 5b;
- técnica 2 (`cor.py`, em edição pela M4 "cor viva");
- as técnicas 1, 3 (posição), 4, 7, 9 e 10 no resolvedor.

---

## 15. Riscos técnicos (do mais grave ao menos grave)

1. **Tonemap HLG mal calibrado muda a cor do caso mais comum (todo vídeo HDR do iPhone).**
   - A escolha de curva move o cinza médio de 0,50 a 0,80 [O1 §2.3c].
   - Mitigação:
     - parâmetros em dados;
     - antes e depois já gravado por plano (`gravar_antes_depois`, `planos.py:419`);
     - chave `legado`;
     - calibração contra o SDR do próprio iPhone (kit 1 e 2);
     - QA `cor_medida` continua valendo.
2. **Apple Log detectado errado (sem tag padrão).** Imagem "revelada" que não era log fica estourada. Mitigação: confiança abaixo de 0,8 pede confirmação; decisão por câmera/app; selo visível na tela.
3. **Tempo de render.** Somando HLG, `medium` e mestre, cerca de +1,5 min por filme de 45 s no pior caso. Mitigação: `EDITOR_PRESET_FINAL`, mestre em paralelo, cache mais rápido que o atual; medir no relógio dos 30 minutos com o kit.
4. **Disco em produção.** Mestre de até 433 Mbps e cache 4,4x maior; o volume do Railway é [não confirmado]. Mitigação: retenção, `EDITOR_MESTRE=nao` até conferir, limite de cache por variável.
5. **Colisão com a sessão de M2 a M4.** Mesmos arquivos (`resolvedor.py`, schemas). Mitigação: a ordem da seção 14, pull antes de cada commit, reservas no `FILA.md`.
6. **O diretor (LLM) ignora os modos.** Mitigação: limites mecânicos no resolvedor (5b); hoje só `sem_transicoes` é mecânico [O3 §8.2].
7. **Limiares de QA sem material real.** Falso bloqueio. Mitigação: `EM_OBSERVACAO` até 5 filmes reais.
8. **Plataforma.** 24 ou 30 fps mínimo, bitrate máximo do Instagram e codec do TikTok orgânico estão [não confirmado]. Mitigação: 30 fps, H.264 High 4:2:0 com teto de 24 Mbps, que cabe em todos os números citados.
9. **Licenças.** RVM é GPL-3.0 (só no servidor); só o Depth Anything V2 Small é comercial; LUT Canon é restritiva [O4 §4.6, O4 §4.11, O1 §4.10]. Mitigação: LUT por fórmula; nada de pesos Base/Large.
10. **Troca de ffmpeg (Onda 7).** Regressão em filtros e encoders. Mitigação: só com A/B e suíte completa.

---

## 16. Medições desta sessão (método e números)

Máquina: 4 CPUs, ffmpeg 6.1.1-3ubuntu5, OpenCV 5.1.0 (sem `ximgproc`: o `opencv-contrib` não está instalado, conferido). Scripts no scratchpad da sessão. Material sintético: tempo e diferença entre cadeias valem; número absoluto de filmagem real vai ser outro.

**Leitura de 60 quadros de um HEVC 4K 10 bits HLG** (`testsrc2`), recorte 9:16 + escala para 1080x1920, saída `bgr24`, 2 threads:

| Cadeia | ms por quadro |
|---|---|
| Atual (matriz 709) | 23,6 |
| Só a matriz 2020 | 21,6 |
| HLG→SDR zscale + mobius + dither | 35,1 |
| Apple Log por LUT 3D em 16 bits | 29,4 |
| LUT depois do 8 bits | 34,6 |
| `tmix=frames=4` em 4K | 33,4 |

**Cache de planos** (1080x1920, `testsrc2` + ruído temporal moderado, 2 threads, PSNR em RGB contra os quadros):

| Cache | Tempo | Taxa | PSNR RGB |
|---|---|---|---|
| Atual (crf14 4:2:0) | 1,41 s por segundo | 52 Mbps | 31,6 dB |
| 4:4:4 10 bits `ultrafast` crf6 | 0,94 s por segundo | 231 Mbps | 45,9 dB |
| 4:4:4 10 bits `veryfast` crf8 | 2,82 s por segundo | 121 Mbps | 41,7 dB |
| 4:2:2 10 bits crf10 | 2,38 s por segundo | 120 Mbps | 33,3 dB |
| RGB crf4 | 0,80 s por segundo | 555 Mbps | 54,3 dB |

**Encode final** (crf 16, teto 24M, 4 threads, PSNR-Y contra os quadros):

| Preset | Ruído moderado | Ruído forte |
|---|---|---|
| `veryfast` | 0,70 s por segundo, 44,7 dB | 0,77 s por segundo, 34,6 dB |
| `medium` | 2,20 s por segundo, 45,1 dB | 2,18 s por segundo, 35,1 dB |
| `slow` | 4,82 s por segundo, 45,0 dB | 5,05 s por segundo, 35,1 dB |

A taxa ficou entre 27 e 29 Mbps nos três (a média passou do teto em 3 s por causa do buffer inicial).

**Mestre** (ruído forte, 4 threads):

| Encoder | Tempo | Taxa |
|---|---|---|
| `prores_aw` HQ | 0,68 s por segundo | 433 Mbps |
| `prores_ks` HQ | 5,6 s por segundo | 228 Mbps |
| DNxHR HQX | 1,6 s por segundo | 220 Mbps |
| x264 4:2:2 10 bits intra crf10 | 0,48 s por segundo | 303 Mbps |

**Chaves Apple:** `-movflags use_metadata_tags` grava `com.apple.quicktime.make/model/full-frame-rate-playback-intent` e o `ffprobe` as devolve em `format.tags`. Isso viabiliza as fixtures da Onda 1.

---

## 17. Não confirmado (o que o plano assume e precisa de prova)

- Como o iPhone grava Apple Log e Apple Log 2 no arquivo: `colr`, chave `LogTransferFunction`, faixa e matriz. A fórmula do Apple Log 2 [O1 §9].
- Onde fica a rampa do slo-mo e o que o Fotos muda ao exportar; como o Auto FPS aparece nos PTS [O1 §9].
- Strings que identificam Blackmagic Camera, Final Cut Camera, Android e DJI [O1 §9].
- Parâmetros de tonemap que reproduzem o SDR da Apple [O1 §9].
- Se o Dropbox "Envio da câmera" preserva o original sem recodificar [O1 §9].
- Tamanho do volume do Railway (disco para mestre e cache).
- Bitrate máximo do Instagram, codec e fps do TikTok orgânico, 24 fps no Instagram [O2 §9, D7].
- Ganho de `slow` sobre `medium` em filmagem real; o 4:2:0 do cache atual em filmagem real (o padrão sintético exagera o croma).
- Custo de `warpPerspective` da técnica 9 (~8 ms estimado) e da lista de PTS em 240 fps.
- Efeito visual de `tmix` (obturador) e dos valores de halation e grão. São propostas a calibrar [O1 §9, O4 §7].
- Constantes de Canon Log 3 e D-Log/D-Log M; licenças das LUTs Sony, Panasonic, DJI, Apple e Blackmagic [O1 §9].
- Download do ffmpeg BtbN pelo build do Railway (aqui o GitHub deu 403 pelo proxy [O2 §7]).

---

## 18. Fontes

Este plano não traz fato técnico novo além das medições da seção 16 e de uma fonte (BtbN). Todo o resto cita as pesquisas, que trazem as URLs. As principais:
- Apple TN3145 (HDR, DV 8.4, `amve`): https://developer.apple.com/documentation/technotes/tn3145-hdr-video-metadata
- Apple, HDR com Dolby Vision em apps (conversão antes do 8 bits): https://developer.apple.com/av-foundation/Incorporating-HDR-video-with-Dolby-Vision-into-your-apps.pdf
- Apple, ProRes no iPhone: https://support.apple.com/109041
- Apple, intenção de taxa cheia (slo-mo): https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/quicktimemetadatafullframerateplaybackintent.md
- Apple Log (constantes via colour-science): https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/apple_log_profile.html
- Licença ACES: https://raw.githubusercontent.com/ampas/aces-dev/dev/LICENSE.md
- ffmpeg, filtros (zscale, tonemap, lut3d, tmix, fps, ssim, psnr, gradfun): https://ffmpeg.org/ffmpeg-filters.html
- ffmpeg, `r_frame_rate` é palpite: https://ffmpeg.org/doxygen/trunk/structAVStream.html
- Meta, Reels Publishing API (24 a 60 fps, GOP fechado de 2 a 5 s): https://developers.facebook.com/documentation/video-api/guides/reels-publishing.md
- Instagram, Reels (mínimo de 30 fps): https://help.instagram.com/1038071743007909
- Meta Engineering, HDR no Instagram: https://engineering.fb.com/2025/11/17/ios/enhancing-hdr-on-instagram-for-ios-with-dolby-vision/
- YouTube, configurações de upload: https://support.google.com/youtube/answer/1722171
- Blackmagic Camera (ficha técnica): https://www.blackmagicdesign.com/ca/products/blackmagiccamera/techspecs/W-APP-01
- RVM (GPL-3.0): https://github.com/PeterL1n/RobustVideoMatting
- Depth Anything V2 (licenças): https://github.com/DepthAnything/Depth-Anything-V2
- FFmpeg-Builds BtbN (libvmaf, zimg, libplacebo em `scripts.d`; release até 9.0), lido em 25/11/2026: https://github.com/BtbN/FFmpeg-Builds e https://github.com/BtbN/FFmpeg-Builds/tree/master/scripts.d
