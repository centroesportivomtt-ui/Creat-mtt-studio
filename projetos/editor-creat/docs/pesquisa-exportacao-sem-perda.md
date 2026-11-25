# Frente O2: exportação que nunca estraga a qualidade

Data da pesquisa: 25/11/2026. Código lido no commit 5325812 (só leitura; nada em `services/` foi alterado).
Marcação: **[código]** = linha do código lido. **[medido]** = teste feito nesta máquina (ffmpeg 6.1.1, 4 CPUs, sem GPU). **[fonte]** = URL. **[não confirmado]** = sem fonte primária.

Aviso sobre o que foi medido: a única mídia disponível aqui é sintética (`sint_retrato_4k.mp4`, quadros suaves). Tamanhos de arquivo e PSNR absolutos de imagem real serão piores (mais detalhe, mais bits). Vale a comparação entre cadeias (ordem e diferença), não o número absoluto. Os limiares da seção 7 precisam de calibração com filmagem real do Marcos.

---

## 1. Resposta curta

1. Hoje cada plano sofre **duas gerações de H.264 com perda** antes de sair do motor (x264 `veryfast` crf 14 no cache de planos, depois `veryfast` crf 17 com grão no final), mais uma ida e volta RGB/4:2:0 em cada uma, tudo em 8 bits. A plataforma (Instagram, TikTok, YouTube) recomprime uma terceira vez.
2. A perda não vem de um erro isolado: vem do **formato do cache de planos** (8 bits, 4:2:0, lossy), do **preset veryfast** no final e do **grão fixo** (`noise`) que custa ~3x de bitrate em céu liso.
3. Proposta: **mestre** (ProRes 422 HQ 10 bits, 1080x1920, bt709, sem perda visual) + **derivados por destino** (H.264 High 4:2:0 8 bits `slow` crf 16, mais um derivado 4K/HEVC opcional), todos gerados do mestre, nunca de outro derivado.
4. Plataformas: Instagram aceita 1080x1920 H.264/H.265, 4:2:0, 24–60 fps, GOP fechado de 2–5 s; recomprime sempre. YouTube aceita muito mais bitrate e é o único que premia 4K (VP9/AV1). TikTok sem especificação oficial de bitrate/codec achada.
5. QA novo "qualidade_preservada": SSIM e PSNR (já existem neste ffmpeg) do derivado contra o mestre; VMAF só onde houver `libvmaf` (**este ffmpeg não tem**).
6. O `qa/formato.py` hoje **reprova** qualquer coisa que não seja 1080x1920 30 fps H.264 High yuv420p: precisa separar "checagem do mestre" de "checagem do derivado".

---

## 2. Como o motor exporta hoje (com linha)

Cadeia real: fonte (iPhone H.264/HEVC) → `planos.py` decodifica para BGR 8 bits → cor, estabilização, zoom, nitidez, vinheta em numpy 8 bits → **encode 1 (cache de planos .mp4)** → `comp.py` decodifica o plano para BGR 8 bits, compõe overlay PNG → **encode 2 (final.mp4, com áudio)** → entrega do `final.mp4`.

| # | Onde | O que faz | Por que perde |
|---|---|---|---|
| 1 | `planos.py:60` (`ler`) | decodifica a fonte direto para `bgr24` | Fonte 10 bits (HEVC HDR, ProRes, Apple Log) é truncada para 8 bits **no primeiro passo**. Toda a cor roda em 8 bits. |
| 2 | `planos.py:76` e `:249` | `in_color_matrix=bt709` fixo; `in_range` só `pc`/`tv` | Fonte BT.2020 (HLG/Dolby Vision do iPhone, Apple Log) é lida com a matriz errada. A ingestão (`ingest.py:75,125`) detecta HDR e faz tonemap, mas **só para os quadros-chave de análise**, não para o plano. Risco de cor errada no final (cross-frente, ver O1). |
| 3 | `planos.py:256,284` | se o plano não cabe em `EDITOR_PLANO_RAM_MB` (1500), guarda os quadros em **JPEG q96** | Uma geração lossy extra, silenciosa, em plano longo ou de câmera lenta. Reportado só em `info["buffer"]="jpeg"` (`:396`). |
| 4 | `planos.py:369` | warp `INTER_LINEAR` quando a escala ≥ 0,95; `INTER_CUBIC` abaixo | Bilinear sem pré-filtro ao reduzir (aliasing leve); cúbico ao ampliar (amplia sem aviso se a fonte for 1080p). |
| 5 | `planos.py:375–376` | máscara de nitidez fixa (sigma 1,0, ganho 1,18/-0,18) + vinheta, em **todo** plano, no tamanho de saída, em 8 bits | Nitidez aplicada **antes** do encode 1 e do encode 2: o x264 gasta bits em halo e em ruído realçado; segunda geração de compressão amplifica. Não tem controle por tipo de fonte (a fonte HEVC do iPhone já vem afiada). |
| 6 | `planos.py:329–333` | **encode 1**: `libx264 -preset veryfast -crf 14 -g 30`, `format=yuv420p`, tags bt709/tv | Geração lossy 1. Veryfast desliga recursos que dão qualidade/bit (me, subme, trellis fracos). 4:2:0 8 bits de novo. |
| 7 | `comp.py:30` | decodifica o plano para `bgr24` (`scale=in_color_matrix=bt709:in_range=tv`) | Volta a RGB: nova conversão YUV→RGB→YUV; chroma reamostrado (bicubic padrão do swscale, sem `full_chroma_int`/`accurate_rnd`). |
| 8 | `comp.py:286–289` | **encode 2**: `scale…,format=yuv420p,noise=c0s=2:c0f=t+u`, `libx264 -preset veryfast -crf 17 -profile:v high -x264-params aq-mode=3`, sem `-g` | Geração lossy 2. `noise` (grão temporal+uniforme, só luma) é adicionado **antes** do x264 e é caro: [medido] céu liso 2 s, 1080x1920: 70 KB sem grão vs 218 KB com `noise=c0s=2` (3,1x). Sem `-g`, `keyint` padrão do x264 = 250 quadros (8,3 s a 30 fps), acima do que Instagram (2–5 s) e YouTube (metade do fps) pedem. |
| 9 | `comp.py:249` | crf padrão 17, vindo de `edl.master.crf` | `master.crf` é a única alavanca; não há perfil por destino. |
| 10 | `comp.py:285` | AAC nativo 256 kbps 48 kHz | Ok (Instagram pede AAC-LC ≥128 kbps, 48 kHz). Só registrar: o mix.wav fica guardado, então o áudio sem perda existe (`montagem/__init__.py:185`). |
| 11 | `montagem/__init__.py:184,199` | guarda só `final.mp4`; cache de planos limitado a 1200 MB (`EDITOR_CACHE_PLANOS_MB`) | Não existe mestre. Um cache em ProRes estouraria o limite (ver seção 4). |
| 12 | `entrega.py:302,326` | entrega só `final.mp4`; apaga `tmp/montagem` ao fim | Sem derivados por destino; um mestre gravado em `tmp` seria apagado. O vínculo QA→arquivo é por sha256 do `final.mp4` (`:305`). |
| 13 | `qa/formato.py:372–381` | **exige** 1080x1920, 30 fps, H.264 High, yuv420p, AAC 48 kHz, faststart | Bloqueia qualquer mestre ou derivado diferente (HEVC, 10 bits, 4K, 24/60 fps). Nenhuma checagem de **qualidade** existe em `CHECAGENS` (`qa/__init__.py:30–33`); `cor_medida` mede cor, não perda. |
| 14 | `comum.py:15,19` | `W,H,FPS = 1080,1920,30` padrão | Fonte 24/25/60/120 fps é reamostrada por escolha de quadro mais próximo (`tempos_fonte`, `planos.py:175`); 4K nunca sai em 4K. Decisão consciente para Reels, mas sem alternativa para YouTube/arquivo. |

Quantas gerações lossy um plano sofre hoje antes de subir: **2** (encode 1 e encode 2), **3** se o buffer cair em JPEG (item 3), mais a recompressão da plataforma. Chroma 4:2:0 é reamostrado **2 vezes** (itens 6 e 8) e há **2 idas e voltas** RGB↔YUV.

Medido [medido, fonte sintética, 4 s, 1080x1920 30 fps, referência = lanczos→yuv420p sem perda]:

| Cadeia | PSNR médio (dB) | SSIM | tamanho |
|---|---|---|---|
| Atual: veryfast crf14 → veryfast crf17 **com** `noise` | 44,3 | 0,9970 | 5,36 MB |
| Atual **sem** `noise` (só 2 gerações) | 45,9 | 0,9980 | 5,76 MB |
| 1 geração: veryfast crf17 | 46,0 | 0,9980 | 4,54 MB |
| 1 geração: slow crf17 | 48,1 | 0,9987 | 5,33 MB |
| ProRes HQ → slow crf16 aq3 | 48,1 | 0,9988 | 6,60 MB |
| ProRes HQ → slow crf12 | 49,0 | 0,9991 | 7,89 MB |
| ProRes HQ → x265 10 bits crf18 | 46,7 | 0,9983 | 5,86 MB |

Leitura: a segunda geração custa ~2 dB, o grão ~1,6 dB (esperado: é ruído deliberado), e `slow` vale ~2 dB sobre `veryfast` no mesmo crf. A diferença entre ProRes-intermediário e 1 geração direta é pequena (0 a 2 dB) em fonte suave; em fonte real com textura é maior (**não medido**).

---

## 3. O que as plataformas fazem com o upload (2026)

### Instagram Reels
- Especificação Meta (Reels Publishing API): `.mp4` recomendado; compressão H.264 ou H.265 (VP9 e AV1 também aceitos); **1080x1920 recomendado, mínimo 540x960**; razão entre 9:16 e 16:9; **24 a 60 fps, taxa fixa**; 3 a 90 s; chroma 4:2:0; **GOP fechado de 2–5 s**; progressivo; áudio AAC-LC estéreo 48 kHz, ≥128 kbps. Fonte: https://developers.facebook.com/documentation/video-api/guides/reels-publishing.md (lida em 25/11/2026). A página **não** traz bitrate de vídeo, tamanho máximo nem espaço de cor.
- Bitrate máximo "25 Mbps VBR" e largura máxima 1920 aparecem só em agregadores (adaptlypost, swat.io), atribuídos à referência da Meta, que não consegui abrir: **[não confirmado]**. Outros guias de terceiros divergem (5, 8, 10–15 Mbps): sem fonte primária.
- Reprocessamento: a Meta gera várias versões do vídeo (SDR, VP9 e, para os mais vistos, AV1), cada uma num bitrate; AV1 foi implantado nos Reels em 2022 e 70% dos Reels por tempo de exibição no iOS eram AV1 em set/2023. Fontes: https://engineering.fb.com/2025/11/17/ios/enhancing-hdr-on-instagram-for-ios-with-dolby-vision/ e https://engineering.fb.com/2023/02/21/video-engineering/av1-codec-facebook-instagram-reels/. Conclusão operacional: **sempre há recompressão**; o que sobrevive melhor é um arquivo limpo (sem ruído, sem blocos de 1ª compressão) em 1080x1920 H.264/HEVC com bitrate alto, porque o encoder da Meta parte dele.
- HDR: Reels aceita HDR; o app iOS faz HEVC Main 10 e Dolby Vision perfil 8.4 (HLG compatível); servidor gera a versão SDR (tone map com operador Hable) e entrega SDR a quem não tem tela HDR. Fontes: engineering.fb.com/2025/11/17/… e https://engineering.fb.com/2023/07/17/video-engineering/hdr-video-reels-meta/. Risco: o tone map da plataforma é automático, sem controle do estúdio. **Recomendação: entregar SDR bt709 já mapeado pelo motor.**

### TikTok
- Especificação oficial de anúncios: vertical 9:16 ≥ 540x960; `.mp4 .mov .mpeg .3gp .avi`; até 10 min; ≤ 500 MB; bitrate ≥ 516 kbps. Fonte: https://ads.tiktok.com/help/article/video-ads-specifications. Codec e fps **não** aparecem. A especificação do post orgânico: **[não confirmado]**.
- Guias de terceiros dizem 1080p, H.264, 30/60 fps, e que 4K é reduzido para ~1080p; bitrates sugeridos de 6 a 15 Mbps (sem fonte oficial). Tratar como prática, não regra.

### YouTube / Shorts
- Upload recomendado: MP4 sem edit lists, `moov` no início; H.264 High, progressivo, 2 B-frames, **GOP fechado = metade do fps**, CABAC, 4:2:0; áudio AAC-LC 48 kHz; **BT.709 em transferência, primárias e matriz**; faixa cheia é convertida para limitada; SDR 1080p 24–30 fps = **8 Mbps**, 60 fps = 12 Mbps; 4K 30 fps = **35–45 Mbps**, 60 fps = 53–68 Mbps; 1440p 16 Mbps. HDR: 10/12 bits PQ ou HLG, primárias Rec. 2020, matriz 2020nc, com as três tags; 1080p HDR 10 Mbps. Fonte: https://support.google.com/youtube/answer/1722171 e https://support.google.com/youtube/answer/7126552.
- Quem sobe 4K recebe VP9 em 4K (navegador/dispositivo com VP9), o que melhora a qualidade mesmo em tela menor.
- **Shorts: resolução máxima de upload 1080p** (https://support.google.com/youtube/answer/10059070): 4K em Short não rende. 4K só vale para vídeo horizontal normal (filme de apresentação, institucional).

### Qual arquivo sobrevive melhor
Consenso das fontes oficiais: H.264 High 4:2:0 SDR bt709, faixa limitada, tags corretas, sem entrelaçamento, taxa fixa, GOP curto fechado, bitrate **mais alto** do que a plataforma entrega (o encoder deles parte de mais informação), **sem grão forte** (ruído consome bits que o encoder da plataforma então destrói em bloco). Meta e YouTube não publicam o bitrate de entrada ideal além dos números acima; o ganho de subir 1080x1920 a 20–25 Mbps é **[não confirmado]** com fonte (terceiros apenas).

---

## 4. Intermediários e mestre em CPU (custo medido)

Teste [medido]: 4 s de 4K (decodificação + lanczos para 1080x1920 + conversão para 4:2:2 10 bits), 4 CPUs, 120 quadros. Tempo inclui ~2 s de decodificar o 4K, que é comum a todos. Tamanho é de fonte suave: em filmagem real espere o dobro ou mais (referência oficial: ProRes 422 HQ ≈ **220 Mbps a 1080p 29,97 fps**, 422 ≈ 147, LT ≈ 102, Proxy ≈ 45; fonte: Apple ProRes White Paper, https://www.apple.com/euro/final-cut-pro/f/generic/docs/Apple_ProRes_White_Paper.pdf; valores lidos via resumo de busca, **PDF não aberto**).

| Intermediário | Comando | tempo / 4 s | taxa medida | notas |
|---|---|---|---|---|
| ProRes 422 HQ | `-c:v prores_ks -profile:v 3 -vendor apl0` (10 bits 4:2:2) | 7,6 s | 107 Mbps | Abre em Premiere/Resolve/FCP; intra-quadro; **mais lento** (≈ 1,9x tempo real nesta máquina). |
| DNxHR HQX | `-c:v dnxhd -profile:v dnxhr_hqx` | 2,2 s | 220 Mbps | Rápido, mas 2x maior; 10 bits. |
| x264 10 bits crf 10 | `-c:v libx264 -preset veryfast -crf 10 -pix_fmt yuv422p10le` | 3,0 s | 22 Mbps | Pequeno e rápido; não é intra, não abre bem em todo NLE, decodificação sequencial. Bom para **cache interno**. |
| x264 10 bits crf 12 `fast` | idem `-preset fast -crf 12` | 4,6 s | 22 Mbps | |
| FFV1 | `-c:v ffv1 -level 3 -slicecrc 1` | 4,7 s | 79 Mbps | **Sem perda**; só ffmpeg/Resolve de arquivo; bom para arquivo morto, não para edição. |

Disco: o servidor tem 56 GB livres (`df`). Um filme de 45 s em ProRes HQ real (≈ 220 Mbps) pesa ≈ 1,2 GB; hoje o limite do cache é 1,2 GB (`montagem/__init__.py:199`) e **só** de planos. Decisão necessária: ou subir o limite (EDITOR_CACHE_PLANOS_MB) para ~6000 quando o cache for ProRes, ou usar x264 10 bits crf 10 no cache (≈ 10x menor, perda desprezível) e reservar ProRes só para o **mestre final**.

Atenção honesta: enquanto o motor processar cor e zoom em `uint8` (BGR 8 bits, `planos.py:60`), um intermediário de 10 bits **não cria precisão que a fonte já perdeu**. Ele evita a **segunda geração lossy** e o 4:2:0 repetido. O ganho de 10 bits real só aparece quando a cadeia de cor passar a 16 bits (cv2 suporta `uint16` em `warpAffine`/`GaussianBlur`; `cv2.LUT` 1D só 8 bits: usar LUT por `np.take` em 16 bits). Isso é trabalho de motor (outra equipe), registrado aqui como pré-condição para fonte Apple Log/ProRes.

---

## 5. Cadeia de cor, escala, grão e nitidez

### Cor
- Saída SDR: tags `-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv` (o motor já faz, `comp.py:288`). YouTube trata transferência/primárias/matriz não especificadas como BT.709 e converte faixa cheia para limitada (fonte acima). Instagram: espaço de cor **[não confirmado]** na documentação.
- Fonte HDR/HLG/Dolby Vision do iPhone: a Meta documenta perfil 8.4 e HLG. Para Reels, **mapear para SDR bt709 no motor** (zscale, abaixo) e subir SDR.
- Receita ffmpeg de HDR→SDR citada na documentação do filtro tonemap: `zscale=transfer=linear,tonemap=clip,zscale=transfer=bt709,format=yuv420p` (https://ffmpeg.org/ffmpeg-filters.html, seção tonemap). O `ingest.py:110` já usa uma variante com `npl=100`, `hable`, `desat=0`; reaproveitar essa mesma cadeia no `planos.py` (hoje ausente).
- **Apple Log**: existe um "Apple Log Profile White Paper" e LUTs oficiais no portal de desenvolvedores da Apple (citados por MacMagazine; PDF **não aberto**): primárias, curva e LUT oficial → **[não confirmado]** aqui. Sem LUT oficial aplicada, o Log sai chapado e a faixa/matriz BT.709 fixa de `planos.py:76` fica errada. Ver frente de interpretação de fonte.
- iPhone ProRes: Apple confirma 10 bits? A página oficial **não declara** versão do ProRes, subamostragem nem bits (https://support.apple.com/109041, só: "arquivos ProRes são até 30x maiores que HEVC", Log/HDR em 13 Pro em diante, 4K60 em 15 Pro+ só com disco externo ≥ 220 MB/s, 4K120 em 16 Pro+ com ≥ 440 MB/s).

### Escala
- Documentação do ffmpeg: o `scaler` aceita `bilinear`, `bicubic`, `area`, `lanczos` (3 taps padrão), `spline`, `sinc`; flags `accurate_rnd` e `full_chroma_int` melhoram arredondamento e chroma; `sws_dither` aceita `none, bayer, ed, a_dither, x_dither` (https://ffmpeg.org/ffmpeg-scaler.html). `zscale` (zimg) tem `filter=lanczos|spline36|spline64`, `dither=ordered|random|error_diffusion` (https://ffmpeg.org/ffmpeg-filters.html, zscale).
- Regra proposta: **reduzir** com `lanczos+accurate_rnd+full_chroma_int` (o plano já faz, `planos.py:249`); **nunca ampliar acima de 1,0x da fonte** como padrão; se o enquadramento (zoom) exigir ampliar mais de 1,15x sobre pixels da fonte, registrar aviso e preferir recorte menor; ampliação máxima admitida 1,3x com `spline36` + nitidez zero. Fonte 1080p vertical a 1080x1920: **não** ampliar para 4K em nenhum derivado.
- Medido [medido]: o encode de planos reduz 4K→1080x1920 uma vez só; manter assim. O segundo `scale` em `comp.py:286` só converte cor (não redimensiona): ok.

### 10 → 8 bits sem faixas (banding)
Teste [medido, gradiente de céu 10 bits 1080x1920, x264 slow crf17]: 
- `sws_dither=none`: arquivo 23 KB, ruído local 0,09 → degraus planos expostos (banding).
- padrão do ffmpeg (`auto`), `ed`, `bayer`, `ordered`: 70 KB, ruído local 0,82: o swscale **já aplica dither** na 10→8 por padrão; o motor herda isso em `planos.py:60` (bgr24). Não é preciso `noise` para esse caso.
- `zscale=dither=error_diffusion`: 214 KB (3x mais bits), ruído 0,76: barato visualmente, caro em bitrate.
- Grão atual `noise=c0s=2:c0f=t+u`: 218 KB, ruído 0,27.
Conclusão: **dither padrão do swscale + nenhum `noise` global** entrega o céu liso por 1/3 do bitrate. O documento do ffmpeg avisa que o filtro `gradfun` "não deve ser usado antes de compressão com perda, porque a compressão perde o dither e traz as faixas de volta" (https://ffmpeg.org/ffmpeg-filters.html, gradfun): não usar `gradfun` no pré-encode.
Banding que já vem na fonte 8 bits do iPhone não é consertado por dither no final; só grão **local** (máscara por plano liso) resolve, a custo de bits. Regra: grão só em cena com céu/parede lisa e só se a medição de planos lisos acusar banding (**não implementado**; proposta).

### Grão e nitidez de saída
- Grão: tirar o `noise` global (`comp.py:286`) do padrão. Se o look pedir grão, aplicá-lo **uma vez, no mestre**, com amplitude ≤ 1 (c0s=1) e **antes** de medir a qualidade, para que o derivado seja comparado ao mestre com o mesmo grão. Grão pesado no arquivo que vai à plataforma é destruído pelo recompressor dela (consome bits e vira blocos): **[não confirmado]** em fonte primária; é consequência de rate-control, [medido] acima (3,1x de bits).
- Nitidez: ganho 0,18 (`planos.py:376`) é moderado. Para fonte H.264 do iPhone (já afiada em câmera) mantê-la reduz a 0,10 e para fonte ProRes/BlackMagic (sem processamento Apple) sobe a 0,25. Parâmetro por tipo de fonte = decisão da frente de interpretação; aqui só registro que **nitidez entra uma única vez**, antes do mestre, e nunca no derivado.
- O app Blackmagic Camera e o modo ProRes eliminam o processamento (nitidez/redução de ruído) da Apple, então precisam de **mais** nitidez e **mais** redução de ruído leve do que o vídeo padrão do iPhone: citação de terceiros (Digital Trends via busca), **[não confirmado]** em documentação da Blackmagic.

---

## 6. Regra de exportação proposta: mestre + derivados

Princípio: **uma geração de compressão visível por destino**. Todo derivado é codificado **do mestre** (nunca de outro derivado) e o mestre é codificado **do pipeline de quadros** (nunca de um .mp4 intermediário lossy).

### 6.1 Mestre (arquivo de arquivo, ficha de entrega interna)
- Arquivo: `saidas/<projeto>/<versao>/master.mov`
- Conteúdo: 1080x1920 (ou resolução nativa quando o filme for horizontal/4K), taxa do EDL, **ProRes 422 HQ 10 bits 4:2:2, bt709 tv**, áudio PCM 24 bits 48 kHz (do `mix.wav`) ou AAC 256 k se disco apertar.
- Comando (dos quadros BGR vindos do pipe, igual hoje, trocando só o encoder; **testado na parte de vídeo**):
```
ffmpeg -nostdin -y -f rawvideo -pix_fmt bgr24 -s 1080x1920 -r 30 -i - \
  -i mix.wav -map 0:v -map 1:a \
  -vf "scale=flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv422p10le" \
  -c:v prores_ks -profile:v 3 -vendor apl0 -bits_per_mb 8000 -pix_fmt yuv422p10le \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a pcm_s24le -ar 48000 master.mov
```
- Grão (se o look pedir): `…,noise=c0s=1:c0f=t+u,format=yuv422p10le` antes do `-c:v`. Padrão: sem grão.
- Custo: ≈ 1,9x tempo real nesta máquina [medido]; ≈ 220 Mbps (ProRes 422 HQ, 1080p30; Apple White Paper) ≈ 1,65 GB/min. `-bits_per_mb` **não foi testado** (usar o padrão do perfil se der erro).
- Tolerância: o mestre é a referência da QA de qualidade; não vai à plataforma.

### 6.2 Derivados (um por destino)

**D1. Instagram Reels / TikTok / Shorts (padrão de todos os Reels): H.264 High 8 bits**
```
ffmpeg -nostdin -y -i master.mov -map 0:v -map 0:a \
  -vf "scale=1080:1920:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.2 \
  -x264-params "aq-mode=3:keyint=60:min-keyint=30:bframes=2:ref=4:open-gop=0:scenecut=40" \
  -maxrate 24M -bufsize 36M \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -r 30 reels_1080.mp4
```
- GOP fechado de 2 s (`keyint=60`, `open-gop=0`) cumpre "GOP fechado 2–5 s" da Meta; YouTube pede metade do fps (15 quadros a 30 fps): para o derivado do YouTube usar `keyint=15`.
- `-maxrate 24M` fica abaixo do teto de 25 Mbps que aparece nos agregadores (**[não confirmado]**) e acima do necessário; crf 16 em material de celular costuma ficar 10–20 Mbps (**estimativa**, não medida em imagem real).
- Preset `slow`: [medido] ~3x mais lento que `veryfast` (4,8 s vs 1,6 s por 4 s de vídeo) e +2 dB PSNR no mesmo crf. Num filme de 45 s: ≈ +55 s de CPU. Preço aceitável por ser a única geração visível.
- `-maxrate/-bufsize` evita pico que a plataforma recusaria; se crf 16 estourar o teto o x264 sobe o crf localmente.

**D2. YouTube horizontal / institucional 4K (opcional):** 
```
ffmpeg -y -i master.mov -vf "scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 15 -profile:v high -level 5.1 \
  -x264-params "keyint=15:min-keyint=15:bframes=2:open-gop=0" -maxrate 45M -bufsize 90M \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 384k -ar 48000 -movflags +faststart yt_4k.mp4
```
Só se o mestre foi produzido em resolução ≥ 2160 (**nunca ampliar** 1080 para 4K). Faixa de bitrate da plataforma: 35–45 Mbps a 30 fps (fonte seção 3).

**D3. Alternativa HEVC (opcional, só Instagram/arquivo):** Meta aceita H.265. [medido]: `libx265 -preset medium -crf 18 -pix_fmt yuv420p10le -tag:v hvc1` deu 5,86 MB / 46,7 dB contra 6,60 MB / 48,1 dB do x264 slow crf16 → mesmo tamanho, **pior** nesta medição e 10x mais lento em x265 `medium` (tempo não medido). Sem ganho comprovado: **manter H.264**. HEVC 10 bits só se a fonte for HDR e o destino aceitar HDR (não recomendado, seção 3).

**D4. Prévia leve (link de aprovação):** o link de 7 dias do `entrega.py` pode apontar para D1; o mestre fica no armazenamento, não vai por link.

### 6.3 Fluxo
1. `planos.py` entrega quadros de 8 bits **sem encode lossy** de cache. Cache de planos em **x264 10 bits crf 10** (`-preset veryfast -pix_fmt yuv422p10le -crf 10 -g 15`, 22 Mbps medido, 3,0 s/4 s) ou ProRes se o disco permitir; **não** `-crf 14 veryfast yuv420p`. O motor continua em 8 bits até a cadeia de 16 bits existir.
2. `comp.py` compõe overlay e grava `master.mov` (6.1), uma só vez.
3. `entrega` gera D1 (e D2/D3 se pedido) **a partir do mestre**, mede qualidade (seção 7) e só então grava `final.mp4` = D1. O sha256 de QA passa a ser do derivado.
4. `qa/formato.py` ganha dois perfis: `mestre` (ProRes 422 HQ, bt709 tv, taxa do EDL) e `derivado_reels` (o atual: 1080x1920 30 fps H.264 High yuv420p AAC 48 kHz faststart, mais `keyint ≤ 150`).

---

## 7. Checagem de QA "qualidade_preservada" (proposta)

**O que comparar:** o derivado contra o **mestre** (não contra a fonte): a edição muda o conteúdo (cor, zoom, estabilização, overlay), então medir contra a fonte não isola a perda da exportação. Contra a fonte, medir só o **plano nu** (sem efeitos) em amostra de 3 quadros, como controle de decodificação (opcional).

**Pré-requisito:** mesmo tamanho, mesma taxa, mesmo pix_fmt nas duas entradas (`libvmaf` e `psnr/ssim` exigem; documentação do filtro lista a primeira entrada como a "distorcida" e a segunda como "referência", https://ffmpeg.org/ffmpeg-filters.html). Alinhar timestamps com `settb=AVTB,setpts=N/30/TB` nas duas entradas: **sem isso, o teste local deu PSNR 25 dB em arquivo idêntico** (quadros emparelhados fora de lugar, [medido]).

**Comando (testado, SSIM+PSNR, disponível neste ffmpeg):**
```
ffmpeg -nostdin -hide_banner -v error -threads 2 -i derivado.mp4 -i master.mov \
 -lavfi "[0:v]settb=AVTB,setpts=N/30/TB,format=yuv420p,split[a1][a2];\
         [1:v]settb=AVTB,setpts=N/30/TB,format=yuv420p,split[b1][b2];\
         [a1][b1]ssim=stats_file=ssim.log;[a2][b2]psnr=stats_file=psnr.log" -f null -
```
Custo [medido]: 1,15 s para 120 quadros (≈ 10 ms/quadro, 2 threads). Filme de 45 s (1350 quadros) ≈ 13 s. Cabe em toda versão.

**VMAF:** este ffmpeg **não tem `libvmaf`** (`ffmpeg -filters` lista só `vmafmotion`; `apt` sem `libvmaf-dev`; download do binário do GitHub deu 403 pelo proxy). Quando houver (build com `--enable-libvmaf`): `libvmaf=n_threads=4:n_subsample=2:log_fmt=json:log_path=vmaf.json` (opções confirmadas na documentação do ffmpeg). Custo de CPU: **[não confirmado]** (não medido; subamostrar com `n_subsample` reduz proporcionalmente).
- Modelo: o padrão é treinado para tela de 1080p vista a 3x a altura; o modelo 4K existe (`vmaf_4k_v0.6.1.json`, 1,5x); não comparar VMAF absoluto entre resoluções diferentes (Netflix VMAF FAQ, https://github.com/Netflix/vmaf/blob/master/resource/doc/faq.md). 
- Interpretação (fontes secundárias, streaminglearningcenter.com): 6 pontos ≈ 1 JND (Netflix, 2017), 95 "em média indistinguível do original", diferença < 2 pontos imperceptível. Netflix anunciou VMAF v1 em jun/2026 calibrado para manter o significado dos números (via busca, **página primária não aberta**).

**Limiares propostos (para calibrar com filmagem real; base: medida sintética acima + práticas citadas):**

| Métrica (derivado vs mestre) | Aprova | Avisa | Reprova (bloqueia) |
|---|---|---|---|
| SSIM (All) médio | ≥ 0,985 | 0,975–0,985 | < 0,975 |
| PSNR-Y médio | ≥ 40 dB | 36–40 dB | < 36 dB |
| PSNR-Y do pior quadro | ≥ 34 dB | 30–34 dB | < 30 dB |
| VMAF médio (quando houver libvmaf) | ≥ 95 | 90–95 | < 90 |
| VMAF do pior 1% | ≥ 88 | 80–88 | < 80 |

Medido na fonte sintética: x264 slow crf16 = SSIM 0,9988, PSNR 48 dB; cadeia atual = 0,9970 e 44,3 dB. Os números sintéticos sobram nos limiares (propositalmente: imagem real cai 6–10 dB); **ajustar** depois de medir 5 filmagens reais (iPhone padrão, Apple Log, ProRes, câmera lenta 120/240, Blackmagic Camera).

**Checagens estruturais junto (sem custo):**
- `formato_derivado`: bt709/tv, yuv420p, 8 bits, 1080x1920, fps = EDL, `keyint ≤ 5 s` (hoje não verificado), `moov` no início (já existe, `formato.py:343`).
- `mestre_ok`: `ffprobe` confirma `prores`, `yuv422p10le`, tags bt709 tv.
- `sem_ampliacao`: nenhum plano com fator de ampliação sobre a fonte > 1,15 (lido de `info` do plano).
- `buffer_cru`: reprova se algum plano usou `buffer=jpeg` (`planos.py:396`) em filme destinado a mestre.
- Bloquear a entrega se qualquer reprova (mesma lógica do `entrega.py:302–313`).

---

## 8. Conclusões e ordem de trabalho (para a outra equipe aplicar)

1. Trocar o encode 1 do cache de planos (`planos.py:329–333`) de `veryfast crf14 yuv420p` para 10 bits (x264 crf 10 ou ProRes): corta uma geração lossy e o 4:2:0 duplicado.
2. Tirar `noise` do padrão (`comp.py:286`): −3x de bitrate em céu liso, +1,6 dB.
3. Final: `-preset slow` (ou `medium` se tempo apertar) e `keyint` explícito de 2 s com GOP fechado.
4. Gravar mestre ProRes 422 HQ e gerar o derivado dele; entregar o derivado.
5. Fonte HDR/HLG/Log: aplicar tone map/LUT **no plano**, não só na análise (`planos.py:76` hoje força bt709).
6. Plano que cai em JPEG (`planos.py:284`) precisa de alerta ou de buffer em disco sem perda (PNG/ffv1) em vez de JPEG.
7. Instalar um ffmpeg com `libvmaf` para o QA (ou aceitar só SSIM/PSNR por enquanto).
8. Calibrar limiares com 5 filmagens reais antes de ligar o bloqueio.

## 9. Não confirmado (explícito)
- Bitrate máximo e espaço de cor aceitos pelo Instagram: só terceiros (25 Mbps VBR, largura 1920); a página da Meta não os traz.
- Especificação do TikTok orgânico (codec, fps, bitrate): só a de anúncios (≥ 516 kbps, ≤ 500 MB), sem codec.
- Quanto o upload 1080x1920 a 20–25 Mbps melhora a qualidade pós-recompressão da Meta/TikTok: sem teste nem fonte primária.
- Apple Log: primárias, curva e LUT oficiais (white paper existe; PDF não aberto). ProRes do iPhone: versão (HQ?), 10 bits e 4:2:2 não declarados na página de suporte da Apple lida.
- Taxas ProRes 422 HQ (220 Mbps etc.): via busca sobre o White Paper, PDF não aberto.
- Custo de CPU do VMAF; VMAF absoluto no conteúdo do Marcos.
- Efeito do Blackmagic Camera (sem processamento Apple) na nitidez/ruído: terceiros; documentação da Blackmagic não consultada.
- Limiares da seção 7 e fatores de ampliação 1,15x/1,3x: **propostas**, não retiradas de fonte; calibrar.
- x265: tempo não medido; qualidade medida só em fonte sintética.
- Nenhuma medida deste documento foi feita com filmagem real do Marcos.
