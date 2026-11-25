# Pesquisa O1: leitura completa da gravação

Data da pesquisa: 25/11/2026. Autor: Radar (pesquisador da Creat Nuvem). Escopo: só leitura do código do motor; nada em `services/`, `apps/` ou `packages/` foi alterado.

Convenções deste documento:
- "Fonte" = URL aberta nesta pesquisa. "Linha" = arquivo:linha do código lido.
- "Medido aqui" = teste sintético feito nesta máquina (ffmpeg 6.1.1, CPU, sem Vulkan). Teste sintético não substitui filmagem real.
- "NÃO CONFIRMADO" = não achei fonte primária ou não pude testar. Está listado de novo na seção 9.
- Não havia nenhum vídeo de amostra no repositório (busca por .mov/.mp4/.m4v acima de 20 KB deu vazio). Todo valor de ffprobe de iPhone abaixo vem de documentação, não de arquivo real do Marcos.

---

## 1. Resposta curta

1. Hoje o motor lê pouco: grava duração, tamanho, rotação, fps, codec e um booleano `hdr` (só HLG/PQ). O `hdr` não é usado por mais ninguém além da cadeia de 640 px dos quadros-chave (grep no motor inteiro).
2. O caminho que renderiza o filme (`planos.py`) decodifica tudo como Rec.709 SDR 8 bits (`in_color_matrix=bt709`, saída `bgr24`). HLG, Dolby Vision 8.4, Apple Log e ProRes 10 bits entram nesse caminho sem conversão de curva, de gamut nem de matriz.
3. O iPhone grava HDR por padrão em modelos suportados (Apple: "On supported models, iPhone records video in HDR"). Ou seja, o caso HLG/Dolby Vision 8.4 provavelmente é o mais comum nos clipes do Marcos, e é o que o caminho de render trata pior.
4. A conformação de fps é por "quadro mais próximo": 24 fps vira 30 com 1 quadro repetido a cada 5 (medido), e 60/120/240 vira 30 pegando 1 quadro em 2/4/8, sem integrar movimento.
5. `fps` vem de `avg_frame_rate` no ingest e de `r_frame_rate` no `comum.meta()`. Num clipe VFR os dois divergem (medido: r=60/1, avg=38,43); o índice do quadro vira tempo errado.
6. Apple Log não tem tag padrão no ffmpeg; a detecção precisa de combinação de sinais, e a conversão pode ser feita por fórmula publicada (provada aqui com erro de ±1 código na escala de cinza) ou por LUT oficial (licença não confirmada).
7. Modo Cinema: o arquivo "Cinematic" tem 3 trilhas (vídeo original, disparidade, metadados); o vídeo original não tem o desfoque. Quem lê só `v:0` vê o clipe sem efeito.
8. Câmera lenta e VFR exigem tratar tempo por PTS, não por índice dividido por fps; há metadado Apple `full-frame-rate-playback-intent` (1 = tempo real, 0 = câmera lenta) que o motor ignora.
9. LUTs oficiais existem para Sony, Panasonic, Canon, DJI e Blackmagic, mas só achei texto de licença claro na Canon (restritivo) e na ACES (permissivo). Para o resto: não confirmado; tratar como "usar só se o texto permitir".
10. Para "nunca estragar" a qualidade: converter cor uma vez, em ≥10 bits (Apple documenta banding se reduzir para 8 bits antes), master intermediário 10 bits, entrega H.264 8 bits com tags BT.709 e bitrate acima das tabelas do YouTube/Instagram.

---

## 2. Como o motor lê hoje e o que ele ignora

### 2.1 O que é lido (com linhas)

`services/motor/motor/etapas/ingest.py`
- l.35-43 `ffprobe`: `-show_streams -show_format -of json`. Tudo fica disponível no JSON, mas só uma parte é aproveitada.
- l.55-76 `ler_midia` grava em `midia`: `duracao`, `tem_video`, `tem_audio`, `w`, `h` (já trocados pela rotação), `rotacao`, `fps`, `codec_video`, `codec_audio`, `hdr`, `gop`.
  - `fps` = `avg_frame_rate` ou `r_frame_rate` (l.73).
  - `hdr` = `color_transfer in ("smpte2084","arib-std-b67")` (l.75).
  - `gop` = duração / nº de quadros-chave (l.257), não é o GOP real.
  - rotação: `side_data_list[].rotation` ou tag `rotate` (l.62-67); iPhone grava -90.
- l.82-94 `gravado_em`: lê `com.apple.quicktime.creationdate` (l.84), depois nome do arquivo, depois `creation_time`.
- l.105-133 `extrair`: só quadros-chave a 640 px + WAV 48 kHz mono. Para `hdr` aplica a cadeia `zscale=t=linear:npl=100 ... tonemap=hable:desat=0 ... zscale=t=bt709` (l.110) e, se falhar, tenta sem ela (l.125-127).

`services/motor/motor/etapas/montagem/comum.py`
- l.73-105 `meta()`: roda outro ffprobe só com `codec_type,width,height,r_frame_rate,avg_frame_rate,start_time,nb_frames,pix_fmt,color_range` + rotação.
  - `fps` aqui é `r_frame_rate` (l.96), diferente do ingest.
  - `faixa` = `pc` se `color_range=pc` ou `pix_fmt` começa com `yuvj` (l.101).
  - `nb` = `nb_frames` ou `round(dur*fps)` (l.102).
- l.15 `FPS_PADRAO = 30`, 1080x1920 fixos.

`services/motor/motor/etapas/montagem/planos.py`
- l.55-60 `ler`: `-ss` por tempo `m.start + (n0-0.4)/m.fps` (índice dividido por fps constante) e saída `-pix_fmt bgr24` (8 bits).
- l.75-76 `entrada_vf`: `in_color_matrix=bt709:in_range={faixa}` fixo para qualquer fonte.
- l.172-205 `tempos_fonte` / `indices_de_quadro`: quadro mais próximo; câmera lenta (`vel < 0.95`) mistura dois quadros vizinhos.
- l.329-333 intermediário: `libx264 -preset veryfast -crf 14`, `yuv420p`, tags bt709, faixa tv, 8 bits.

`services/motor/motor/etapas/cor.py`
- l.213-246 LUT 1D de 256 entradas em uint8 BGR (`cv2.LUT`) + saturação 3x3 + máscara de pele. Todos os looks (`cor_looks.json`) assumem entrada Rec.709 SDR de 8 bits.
- l.259-277 `exportar_cube` grava LUT .cube de 33 pontos (útil como base para o caminho de log).

`services/motor/motor/etapas/montagem/comp.py`
- l.286-289 final: `libx264 -preset veryfast -crf 17 -profile high -x264-params aq-mode=3`, `noise=c0s=2:c0f=t+u`, `yuv420p`, tags bt709 tv, faststart.

### 2.2 O que o motor ignora (lista exata)

| # | Ignorado | Onde deveria entrar | Consequência |
|---|---|---|---|
| 1 | `pix_fmt` / bits (8 x 10 x 12), `profile`, `codec_tag_string` | ingest | não distingue HEVC Main 10 de H.264 8 bits, nem ProRes HQ de 4444 |
| 2 | `color_primaries`, `color_space`, `color_range` no ingest | ingest | só `color_transfer` é olhado |
| 3 | HDR é só "tem HLG/PQ ou não" | ingest/planos | `hdr` não chega ao render (grep: nenhum outro uso) |
| 4 | Dolby Vision (side data `DOVI configuration record`), mastering display, MaxCLL, `amve` | ingest | não sabe se é DV 8.4 (HLG base) nem o pico do PQ |
| 5 | Apple Log / Apple Log 2 / S-Log3 / V-Log / C-Log / D-Log | ingest/cor | log entra como se fosse SDR; imagem sai chapada/lavada |
| 6 | `r_frame_rate` x `avg_frame_rate`, VFR, jitter de PTS | ingest/comum | índice->tempo errado em clipes VFR |
| 7 | fps de captura x fps de reprodução (câmera lenta), rampa do iPhone, `full-frame-rate-playback-intent` | ingest | slo-mo 240 fps tratado como "fonte de 240 fps" comum |
| 8 | Modo Cinema (trilhas extras) | ingest | só `v:0` é lido; nada diz que existe profundidade/foco |
| 9 | Tags QuickTime `com.apple.quicktime.*` (make, model, software, camera.*, captureMode), `com.android.capture.fps` | ingest | não sabe a origem (câmera nativa, Blackmagic, Final Cut Camera, Android) |
| 10 | Áudio: taxa, canais, layout (Spatial Audio/estéreo) | ingest | sempre reduz para mono 48 kHz (l.122) |
| 11 | Espelhamento no display matrix | ingest | só rotação |
| 12 | Matriz de cor do decode (`bt709` fixa em planos l.76 e comp l.30) | planos/comp | HLG/2020 decodificado com matriz 709 |
| 13 | Profundidade de bits no render (`bgr24`) | planos | perde 10 bits antes de qualquer LUT |

### 2.3 Medições feitas aqui (sintéticas)

Máquina: ffmpeg 6.1.1, `--enable-libzimg --enable-libplacebo --enable-libvidstab --enable-libx265`, sem Vulkan (`libplacebo` falha com `VK_ERROR_INCOMPATIBLE_DRIVER`, então não dá para usar libplacebo neste ambiente CPU).

**(a) VFR.** Clipe com 30 quadros a 30 fps, 60 a 60 fps e 24 a 24 fps (114 quadros, timebase 1/90000): `r_frame_rate=60/1`, `avg_frame_rate=3420/89` (38,43), `nb_frames=114`, `duration=2.966667`. O `meta()` usaria 60 fps: o quadro 30 está em t=1,0 s de verdade e o motor calcularia 0,5 s.
Definição de `r_frame_rate` no ffmpeg: "lowest framerate with which all timestamps can be represented accurately ... Note, this value is just a guess" (https://ffmpeg.org/doxygen/trunk/structAVStream.html).

**(b) Cadência de `indices_de_quadro` (função real do planos.py, 30 saídas):**

| fps da fonte | passos de índice | quadros repetidos em 29 |
|---|---|---|
| 23,976 e 24 | 1,1,0,1,1,1,1,0,... | 6 |
| 25 | 1,1,1,0,1,1,1,1,1,0,... | 5 |
| 29,97 | sempre 1 | 0 |
| 60 | sempre 2 | 0 (descarta metade, sem borrão de movimento) |
| 120 | sempre 4 | 0 (idem) |
| 240 | sempre 8 | 0 (idem) |

**(c) HLG para SDR com a cadeia atual do ingest.** Cinzas de HLG (HEVC 10 bits, bt2020nc, arib-std-b67) convertidos; valores normalizados 0..1 (16-235 = 0..1):

| sinal HLG | 0,1 | 0,3 | 0,5 | 0,6 | 0,75 | 0,9 | 1,0 |
|---|---|---|---|---|---|---|---|
| hable desat=0 (atual) | 0,05 | 0,28 | 0,50 | 0,61 | 0,81 | 1,00 | 1,09 (estoura) |
| mobius param=0,3 | 0,10 | 0,45 | 0,77 | 0,88 | 1,00 | 1,07 | 1,09 |
| mobius param=0,6 | 0,10 | 0,45 | 0,80 | 0,96 | 1,05 | 1,08 | 1,09 |
| reinhard | 0,11 | 0,44 | 0,70 | 0,80 | 0,95 | 1,05 | 1,09 |
| clip / none | 0,10 | 0,45 | 0,80 | 1,01 | 1,09 | 1,09 | 1,09 |

Leitura: a escolha de tonemap muda o cinza médio de 0,50 a 0,80. Não há como dizer qual casa com a renderização SDR da Apple sem uma referência; ver 4.3 (calibração) e 9.

**(d) Matriz e gamut em cores saturadas (patches sintéticos em HLG/BT.2020; valores RGB 0-255 após a conversão):**

| patch (sinal) | verdade do sinal | caminho do planos (matriz 709, sem gamut) | matriz 2020 correta, sem gamut | cadeia ingest (zscale + gamut 709 + hable) |
|---|---|---|---|---|
| pele (0,70/0,50/0,40) | 178,128,102 | 182,130,103 | 179,127,103 | 197,96,80 |
| vermelho (0,75/0,12/0,12) | 191,31,31 | 199,39,32 | 191,30,31 | 217,0,0 |
| azul (0,15/0,20/0,75) | 38,51,191 | 37,47,189 | 38,50,190 | 0,39,198 |

Leitura: (1) a matriz errada desloca até ~8 níveis em cor saturada; (2) o gamut não convertido deixa a imagem menos saturada (spread R-G da pele 52 contra 101 com conversão); (3) a cadeia do ingest, sem mapeamento de gamut, corta canais em 0 em cores saturadas (vermelho 217,0,0). São patches sintéticos fora do que uma câmera real produz; servem só para mostrar que o tratamento de gamut importa e que a cadeia precisa de compressão de gamut.

**(e) Apple Log por fórmula publicada, via LUT 3D.** Construí uma LUT .cube (33 pontos) com a fórmula Apple Log (constantes da seção 4.1), matriz BT.2020 para BT.709 e OETF 709, e apliquei com `scale=...,format=gbrp16le,lut3d=interp=tetrahedral,format=bgr24` num ProRes 422 HQ sintético. Reflectâncias 0 / 1% / 5% / 18% / 50% / 90% deram 1 / 11 / 48 / 105 / 181 / 243; esperado 0 / 11 / 48 / 104 / 180 / 242. Erro máximo de 1 código no eixo neutro. Isso prova o encanamento (leitura 10 bits, LUT em 16 bits, saída 8 bits), não o "look" da Apple (ver 4.1) e assume faixa tv + matriz BT.2020 (não confirmado).

---

## 3. Tabela "sinal no arquivo -> diagnóstico -> tratamento no motor"

Campos de ffprobe: `-show_streams -show_format -show_entries stream_side_data`. Campos de exiftool: `-a -G1 -s` (grupos QuickTime Keys / ItemList / UserData). Marcação: [F] fonte, [M] medido aqui, [NC] não confirmado.

| # | Sinal no arquivo | Diagnóstico | Tratamento no motor |
|---|---|---|---|
| 1 | `codec_name=h264` ou `hevc` Main; `pix_fmt=yuv420p` (ou `yuvj420p`); `bits_per_raw_sample` vazio/8; trc `bt709` ou `unknown`; `color_range=tv/pc` | SDR 8 bits comum (iPhone com HDR Video desligado ou "Most Compatible"; câmeras em Rec.709) | Caminho atual. Ler `color_range` e matriz do arquivo (hoje fixa 709). Marcar `familia_cor=sdr709`. Cuidado com banding em correção forte (8 bits). [F: Apple Settings > Camera > Record Video > HDR Video] https://support.apple.com/guide/iphone/change-video-recording-settings-iphc1827d32f/ios |
| 2 | `codec_name=hevc`, `profile=Main 10`, `pix_fmt=yuv420p10le`, `color_primaries=bt2020`, `color_transfer=arib-std-b67`, `color_space=bt2020nc` | HLG HDR (iPhone com HDR Video; Apple: constraints do DV 8.4 incluem colr 9/18/9) | Converter para SDR antes da correção de cor: decodificar em 10 bits, uma só conversão HLG->BT.709 (4.3), saída tagueada BT.709. `familia_cor=hlg`. [F] https://developer.apple.com/documentation/technotes/tn3145-hdr-video-metadata |
| 3 | Caso 2 + side data `DOVI configuration record` com `dv_profile=8`, `dv_bl_signal_compatibility_id=4`, `rpu_present_flag=1`, `el_present_flag=0`, `bl_present_flag=1`; + `Ambient viewing environment` | Dolby Vision 8.4 do iPhone = camada base HLG + RPU dinâmico | Tratar como HLG (base layer). Não aplicar o RPU (libplacebo `apply_dolbyvision` vem ligado e força BT.2020+PQ). Ao refazer pixels o RPU fica inválido (Apple: o RPU é descartado ao editar). Saída SDR, sem DV. `familia_cor=hlg_dv84`. [F] ver 4.3 |
| 4 | `color_transfer=smpte2084` + `color_primaries=bt2020`; side data mastering display / content light level | HDR10/PQ (Android, câmeras, apps) | Conversão PQ->SDR com `npl` pelo MaxCLL, `tonemap` mobius ou bt.2390; `familia_cor=pq`. [F] https://ffmpeg.org/ffmpeg-filters.html#tonemap |
| 5 | `codec_name=prores`, `profile=HQ`/`Standard`/`LT`/`Proxy`, `codec_tag_string=apch/apcn/apcs/apco`, `pix_fmt=yuv422p10le`; primaries `bt2020`; transfer `unknown`/`unspecified` | ProRes 422 10 bits. Se vier de iPhone com Log: candidato a Apple Log. HDR (HLG) em ProRes também existe (Apple: ProRes "HDR" ou "Log") | Decidir por metadados e por imagem (4.1): se `familia_cor=applelog_provavel`, converter por LUT/fórmula em 16 bits; senão tratar como SDR/HLG pela tag. [M: tags confirmadas na minha codificação; iPhone real NC] [F] https://support.apple.com/109041 |
| 6 | `profile=4444` (`ap4h`) ou `XQ` (`ap4x`), `pix_fmt=yuv444p12le` | ProRes 4444 / 4444 XQ (12 bits, com possível alpha) | Pipeline 16 bits; alpha ignorado. [M: mapeamento profile/tag/pix_fmt medido com prores_ks] |
| 7 | `codec_tag_string=aprn`/`aprh` (ou `nrpa`/`hrpa`); ffprobe 6.1 dá "unknown codec"/erro de decoder | ProRes RAW / RAW HQ (Blackmagic Camera e Final Cut Camera em iPhone Pro, exige armazenamento externo) | O ffmpeg 6.1.1 deste ambiente não decodifica. Decoder nativo entrou no ffmpeg em 2025 (patches de jul/2025; arquivo `prores_raw.c` na versão 8.1-3 do Debian). Rejeitar com mensagem clara e pedir exportação em ProRes 422 HQ/Log, ou subir o ffmpeg para a série 8.x após teste. [F] https://ffmpeg.org/pipermail/ffmpeg-devel/2025-July/346456.html https://sources.debian.org/src/ffmpeg/7%3A8.1-3/libavcodec/prores_raw.c https://loc.gov/preservation/digital/formats/fdd/fdd000534.shtml |
| 8 | Mais de uma trilha de vídeo/dados no .mov (vídeo + disparidade de menor resolução + metadados), `com.apple.photos.captureMode` | Modo Cinema (arquivo "Cinematic asset"); a trilha de vídeo é o original sem desfoque; o desfoque é recalculado em tempo de exibição pelo framework Cinematic | Ler só a 1ª trilha de vídeo (já é o que faz). Avisar: sem o efeito. Não dá para reproduzir o desfoque sem as APIs da Apple (Metal). Pedir "vídeo renderizado" (compartilhar do Fotos sem "All Photos Data") quando o efeito for desejado. `modo_captura=cinema`. [F] https://developer.apple.com/wwdc23/10137 https://support.apple.com/guide/iphone/iph5e602f6d6/ios |
| 9 | `avg_frame_rate` >= 100 (120/240) ou `com.android.capture.fps`; tag `com.apple.quicktime.full-frame-rate-playback-intent` (1 = tempo real, 0 = câmera lenta) | Alta taxa / câmera lenta (iPhone Slo-mo: 1080p 240 fps traseira, 120 fps frontal, 4K 120 em modelos suportados) | Separar `fps_captura` de `fps_reproducao`. Em câmera lenta: decidir por plano a velocidade; para fundir 240->30 em velocidade real, integrar N quadros (4.6). Como a rampa vem gravada no arquivo (lista de edição x PTS): NC. [F] https://support.apple.com/guide/iphone/change-video-recording-settings-iphc1827d32f/ios https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/quicktimemetadatafullframerateplaybackintent.md |
| 10 | `r_frame_rate` != `avg_frame_rate` (>1%) ou deltas de PTS variáveis | VFR (celular em pouca luz: iPhone "Auto FPS" reduz para 24 fps) | Medir PTS, `vfr=true`; mapear tempo->quadro por PTS, nunca por índice/fps; opcional pré-normalizar para CFR com `fps=` (preserva sincronia com o áudio). [F] Apple Auto FPS (mesma página da linha 1). [M] 4.5 |
| 11 | Side data `Display Matrix` com `rotation` = -90/90/180/270 | Orientação do celular (iPhone grava -90) | Já tratado (ingest l.62-67; ffmpeg `-autorotate` vem ligado). Falta olhar espelhamento. [F] https://ffmpeg.org/ffmpeg.html#Advanced-Video-options |
| 12 | `com.apple.quicktime.software` / `format.tags.encoder` / `handler_name` ou presença de trilhas `tmcd`; ProRes/HEVC com Apple Log fora do app Câmera | Possível Blackmagic Camera ou Final Cut Camera (NC quais strings cada um grava) | Perfil de câmera "app de câmera pro": sem tone mapping e sem nitidez da Apple; aplicar nitidez/redução de ruído leves no motor. Detecção por strings: NC (precisa de amostra). [F] spec do app: https://www.blackmagicdesign.com/ca/products/blackmagiccamera/techspecs/W-APP-01 |
| 13 | Câmera Sony (XAVC): container mp4/MXF; transfer `unknown`/`bt709`; sidecar XML NRT | S-Log3 (S-Gamut3.Cine ou S-Gamut3) | Detecção por sidecar/menu (string exata NC). LUT oficial "Slog3-S-Gamut3.Cine To s709 V200.cube" (licença NC). Fórmula: 18% -> código 420 (10 bits), 90% -> 598. [F] https://sony-cinematography.com/resources/luts/ https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/sony.html |
| 14 | Câmera Panasonic Lumix/Varicam | V-Log / V-Gamut | LUT oficial V-Log->V-709 (zip `VLog_to_V709_forV35_EN.zip`; licença NC). Fórmula: 18% -> 0,4233 (≈433/1023), 90% -> 602/1023. [F] https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/lut/index.html https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/panasonic_v_log.html |
| 15 | Câmera Canon Cinema EOS | Canon Log 2 / Log 3 + Cinema Gamut | LUT oficial "Canon 3D LUT for Canon 709" / CMT (termos restritivos, ver 4.9). [F] https://asia.canon/en/support/0200747702 |
| 16 | Arquivo `.braw` (Blackmagic RAW) | BRAW (Gen 5) | ffmpeg não decodifica (nenhum decoder BRAW na lista local; nenhuma menção na documentação). SDK Blackmagic RAW é gratuito e multi-plataforma; exige wrapper. Converter fora do motor. [F] https://www.blackmagicdesign.com/developer/products/braw/overview |
| 17 | Drone/ação DJI com perfil D-Log ou D-Log M (10 bits) | D-Log / D-Log M | LUT oficial por modelo (Mavic 3, Mini 4 Pro, Air 3/3s, Avata 2, Osmo Pocket 3, Osmo Action 4/5/6, etc.). Fórmula pública só da D-Log completa (D-Log M: NC). [F] https://www.dji.com/uk/lut |

---

## 4. Detalhe por caso

### 4.1 Apple Log e Apple Log 2

**Fatos (com fonte):**
- Apple descreve o Apple Log como espaço de cor com primárias BT.2020 e uma curva logarítmica própria (iOS 17+): https://developer.apple.com/tutorials/data/documentation/avfoundation/avcapturecolorspace/applelog.md
- Core Video tem os casos `appleLog` e `appleLog2` (enum `CVImageLogTransferFunction`) e a chave `kCVImageBufferLogTransferFunctionKey`; log é definido como espaço completo (primárias de cena + curva + matrizes): https://developer.apple.com/documentation/corevideo/cvimagelogtransferfunction.md e https://developer.apple.com/forums/thread/853370
- Disponibilidade: Apple Log exige iPhone 15 Pro ou mais novo; Apple Log 2 exige iPhone 17 Pro ou mais novo (Final Cut Camera): https://support.apple.com/guide/final-cut-camera/dev14d309a3f/ios
- Apple não oferece API pública de conversão para Rec.709 ou HLG; o engenheiro da Apple indica implementar a transformação a partir dos white papers (thread 853370 acima). Apple publica o white paper e uma LUT Log->Rec.709; usuários relatam que o download está no portal de desenvolvedores e pede login (https://discussions.apple.com/thread/256044678). Texto da licença: NC.
- Stu Maschwitz (Prolost): a LUT da Apple "é muito rica em contraste e saturação"; no Resolve usa-se CST com gama de entrada Apple Log e espaço de entrada Rec.2020; Apple Log é "meio cozido" (denoise, tone mapping e cor aplicados, com nitidez e tone mapping reduzidos); em 2023 só gravava em ProRes: https://prolost.com/applelog
- A comunidade colour-science publica as constantes do white paper (citando também o IDT `IDT.Apple.AppleLog_BT2020.ctl` do repositório aces-dev da AMPAS): https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/apple_log_profile.html

**Fórmula (R = reflectância linear de cena, P = valor normalizado do sinal):**
- R0 = -0,05641088; Rt = 0,01; sigma = 47,28711236; beta = 0,00964052; gamma = 0,08550479; delta = 0,69336945.
- Codificação: P = gamma·log2(R + beta) + delta para R >= Rt; P = sigma·(R - R0)^2 para R0 <= R < Rt; 0 abaixo.
- Valores derivados por mim: R=0 -> P 0,1505; R=0,18 -> P 0,4883; R=0,90 -> P 0,6817; R=1,0 -> P 0,6946; **P=1,0 ocorre em R=12,0** (6 stops acima do cinza 18%). Resolução: 0,0855 de P por stop = 21,8 códigos por stop em 8 bits contra 87,5 em 10 bits.

**Detecção em arquivo (o que se sabe e o que não):**
- A tag padrão do ffmpeg não cobre Apple Log (FFmpeg só enumera ARIB STD-B67 como HLG etc.). Nos testes, um ProRes meu sem tags saiu com `color_transfer=unknown` (medido). O que o iPhone grava de fato no `colr`/chaves: NC.
- Um fornecedor de app (LogGate Pro) diz que o Apple Log 2 é identificado por uma chave de metadados `LogTransferFunction` que a Apple escreve em todo ProRes (relato de fabricante, nome do namespace NC): https://apps.apple.com/us/app/loggate-pro/id6761159398
- Tabelas de `colr` (nclx) para decodificar o que o exiftool mostrar: primárias 9 = BT.2020, transferência 18 = HLG, 16 = PQ, 2 = unspecified; matriz 9 = BT.2020 NCL (https://exiftool.org/TagNames/QuickTime.html).
- Heurística de imagem (derivada da fórmula, a validar): em Apple Log o preto (R=0) fica em P≈0,15 e o cinza 18% em P≈0,49; a luma de uma cena típica fica entre ~0,15 e ~0,70, com saturação baixa. Um clipe ProRes 10 bits, primárias BT.2020 ou unspecified e histograma assim é candidato a Apple Log. Confirmar com o dono na primeira vez e gravar a decisão por modelo/app.

**Tratamento no motor:** converter em 16 bits com LUT 3D (tetrahedral) gerada por fórmula (provado em 2.3e), nunca em 8 bits. Nada de LUT oficial da Apple até ler a licença; a fórmula e o IDT da AMPAS (licença ACES: royalty-free, permite copiar/modificar/derivar, com aviso de copyright: https://raw.githubusercontent.com/ampas/aces-dev/dev/LICENSE.md) são caminho limpo. O "look" (contraste/saturação) vem depois, pelos looks da casa, não da LUT técnica.

**Apple Log 2:** primárias mais largas ("wider color gamut"), exige iPhone 17 Pro; fórmula e primárias: NC.

### 4.2 ProRes 422 HQ, 4444, ProRes RAW

- Modelos e taxas (Apple, "About Apple ProRes on iPhone"): 1080p 30/25 (128 GB) e 60/30/25 (256 GB+); 4K 30/25/24; 4K 60 nos Pro 15 em diante; 4K 120 em Pro 16 em diante com armazenamento externo; ProRes não funciona com Cinema, câmera lenta nem time-lapse; arquivos até 30x maiores que HEVC: https://support.apple.com/109041
- Tamanho por minuto em 4K 30 (Final Cut Camera 2.4): HEVC > 175 MB; ProRes LT > 3,1 GB; ProRes 422 > 4,4 GB; ProRes 422 HQ > 6,6 GB; ProRes RAW > 10 GB (quadro completo); RAW HQ > 15 GB. RAW fixa a resolução em Open Gate 4224x3024: https://support.apple.com/guide/final-cut-camera/dev14d309a3f/ios
- Mapeamento de `profile` e `codec_tag_string` do ffprobe (medido com prores_ks): Proxy=apco, LT=apcs, Standard=apcn, HQ=apch (yuv422p10le), 4444=ap4h e XQ=ap4x (yuv444p12le).
- ProRes RAW: decoder nativo do ffmpeg é de 2025; aqui (6.1.1) não existe. FourCC `aprn` e `aprh` (HQ): https://loc.gov/preservation/digital/formats/fdd/fdd000534.shtml. O YouTube aceita ProRes 422/4444 em HDR, mas diz que exige bitrates muito altos: https://support.google.com/youtube/answer/7126552
- Tratamento: ProRes 10/12 bits entra no pipeline de 16 bits da seção 5. ProRes RAW: recusar com mensagem; só habilitar após testar ffmpeg 8.x.

### 4.3 HEVC 10 bits HLG e Dolby Vision 8.4 do iPhone para SDR

**Fatos:**
- Apple: iPhone grava Dolby Vision Profile 8, cross-compatibility ID 4 (HLG); codec HEVC 10 bits; .mov (QTFF); decoders sem DV leem como HLG. Constraints do 8.4: sample entry `hvc1`, Main10, `dvvC`, `colr` com primárias 9, transferência 18, matriz 9, e `amve` presente: https://developer.apple.com/documentation/technotes/tn3145-hdr-video-metadata e https://developer.apple.com/av-foundation/Incorporating-HDR-video-with-Dolby-Vision-into-your-apps.pdf
- Apple: ao modificar pixels, o metadado dinâmico do DV 8.4 fica inválido e é descartado na composição; ao exportar para SDR, "converter a cor antes, ou ao mesmo tempo, que a redução de 10 para 8 bits; senão aparece banding"; regra prática: tagear BT.709 (primárias, transferência e matriz) e usar 8 bits (mesmo PDF).
- Apple: `amve` (ambient viewing environment) deve ser preservado ao regravar HDR, senão o vídeo aparece brilhante demais em dispositivos Apple (TN3145). Se o filme for SDR, `amve` não se aplica.
- Campos do ffprobe para DV (struct `AVDOVIDecoderConfigurationRecord`): `dv_version_major`, `dv_version_minor`, `dv_profile`, `dv_level`, `rpu_present_flag`, `el_present_flag`, `bl_present_flag`, `dv_bl_signal_compatibility_id`, `dv_md_compression`: https://ffmpeg.org/doxygen/trunk/structAVDOVIDecoderConfigurationRecord.html
- Meta (Instagram) trata HDR de iPhone como HEVC Main 10 com `amve` e Dolby Vision 8.4 e gera SDR para aparelhos sem HDR; Instagram para iOS passou a entregar DV desde jun/2025: https://engineering.fb.com/2025/11/17/ios/enhancing-hdr-on-instagram-for-ios-with-dolby-vision/
- ffmpeg `libplacebo`: "will apply any embedded film grain, dolby vision metadata"; `apply_dolbyvision` ligado por padrão e, com DV, "will always output BT.2020+PQ"; `tonemapping` padrão `auto`, com `bt.2390`, `st2094-40`, `st2094-10`, `clip` etc.; `peak_detect` ligado por padrão; `gamut_mode` padrão `perceptual`: https://ffmpeg.org/ffmpeg-filters.html#libplacebo (e `ffmpeg -h filter=libplacebo` local).

**Tratamento proposto (CPU, o que dá para rodar neste ambiente):**

```
# HLG (e DV 8.4 tratado como HLG) para SDR BT.709, 10 bits até o último passo
-vf "zscale=t=linear:npl=100:p=bt2020:m=2020_ncl:rin=tv,format=gbrpf32le,zscale=p=bt709,\
tonemap=tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=tv:dither=error_diffusion,format=yuv420p10le"
```
Esta é a cadeia atual do ingest trocando `hable` por `mobius` e adicionando `dither`; valores medidos na tabela 2.3c. **O valor de `param`, de `npl` e a escolha mobius/hable não estão calibrados contra a renderização da Apple (NC).**

**Calibração recomendada (curta):** pegar 3 clipes reais HDR do Marcos; exportar cada um pelo próprio iPhone/Fotos em "Most Compatible"/H.264 (a Apple documenta que "H.264 presets will convert HDR to SDR") e ajustar `param`/`npl` até casar luma média, p2 e p98 com o SDR da Apple. Gravar os parâmetros em `cor_looks.json` por família.

**Com GPU (futuro):** `libplacebo=tonemapping=bt.2390:apply_dolbyvision=0:colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv` seria o caminho de maior fidelidade, com gamut mapping perceptual. Requer Vulkan; não roda aqui (medido). `apply_dolbyvision=0` para o 8.4 é inferência a partir da documentação (o RPU do 8.4 mapeia para PQ, mas a base é HLG): NC.

**Atenção a gamut:** a cadeia do ingest não comprime gamut (2.3d: canais cortam em 0). Antes de ligar em produção, testar com clipe real e, se preciso, reduzir saturação residual antes do `zscale=p=bt709`.

### 4.4 SDR 8 bits comum e faixa de cor

- iPhone SDR costuma vir `yuvj420p`/faixa cheia no H.264 antigo (o código já trata: `planos.py` cabeçalho, comum.py l.101).
- O render usa `in_color_matrix=bt709` e `in_range` correto por clipe. Falta: ler `color_space` do arquivo (HD x SD: bt601/bt709) e `chroma_location`.
- Saída: YouTube pede H.264 High, 4:2:0, tags BT.709 (H.273 valores 1/1/1) e avisa contra matriz RGB: https://support.google.com/youtube/answer/1722171

### 4.5 VFR (taxa de quadros variável) sem quebrar sincronia

- Apple: "Auto FPS" reduz a taxa para 24 fps em pouca luz (em modelos mais novos também em 4K); opções "só 30 fps", "30 e 60", "Auto Low Light FPS": https://support.apple.com/guide/iphone/change-video-recording-settings-iphc1827d32f/ios. Como isso aparece nos PTS do arquivo (mudança de intervalo no meio do clipe): NC (sem amostra), esperado.
- ffmpeg: `-fps_mode`: `passthrough` (timestamps do demuxer), `cfr` (duplica/descarta para taxa constante), `vfr`, `auto`; o filtro `fps` "converte para taxa constante duplicando ou descartando quadros": https://ffmpeg.org/ffmpeg.html#Advanced-Video-options e https://ffmpeg.org/ffmpeg-filters.html#fps
- Medido: `fps=30` num VFR de 114 quadros/2,97 s devolveu 89 quadros a `30/1` constante, mantendo a duração (sincronia com áudio preservada porque o filtro age no PTS).
- Detecção: `vfr = (|r_frame_rate - avg_frame_rate| / avg > 0,01)` ou desvio padrão dos deltas de PTS > 5% da mediana. A mediana dos deltas é o `fps_nominal`; o `avg_frame_rate` é o `fps_medio`.
- Tratamento: (1) o motor deve mapear tempo -> quadro por PTS (lista de PTS do ffprobe `-show_entries packet=pts_time` ou `frame=pts_time`), não `índice/fps`; (2) alternativa mais barata: normalizar o trecho usado para CFR com `fps=` no próprio comando de leitura do `ler()` (planos l.55-60), em vez de renormalizar o arquivo inteiro.

### 4.6 Câmera lenta 120/240 fps

- Padrões do iPhone: Slo-mo 1080p 240 fps na traseira, 120 fps na frontal; 4K 120 em modelos suportados: https://support.apple.com/guide/iphone/change-video-recording-settings-iphc1827d32f/ios
- Metadado Apple de nível de filme: `com.apple.quicktime.full-frame-rate-playback-intent`: 1 = tocar em taxa cheia, 0 = tocar em câmera lenta (para filmes a partir de 120 fps): https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/quicktimemetadatafullframerateplaybackintent.md. O exiftool lista a chave como `FullFrameRatePlaybackIntent` (https://exiftool.org/TagNames/QuickTime.html).
- Relato de desenvolvedor (pergunta sem resposta): num slo-mo de 240 fps, `nominalFrameRate` do AVFoundation devolve ~30 e a duração aparece 8x maior: https://developer.apple.com/forums/thread/731460. Isso sugere que o arquivo guarda a linha do tempo em velocidade lenta; como o ffprobe mostra (240/1 com duração real, ou 30/1 com duração 8x) e onde fica a rampa (lista de edição, PTS ou sidecar do Fotos): **NC, precisa de amostra real**. Relatos de comunidade com fps efetivo entre 177 e 240 (240,37; 239,43; 177,93): https://discussions.apple.com/thread/251329686 (relato, não documentação).
- Blackmagic Camera: gravação "off-speed" de 4 a 120 fps no iOS, tocando na taxa do projeto (portanto o arquivo já sai em câmera lenta/rápida): https://www.blackmagicdesign.com/ca/products/blackmagiccamera/techspecs/W-APP-01
- Tratamento no motor:
  1. Campos: `fps_captura`, `fps_reproducao`, `alta_taxa=true` quando fps >= 100 ou `full-frame-rate-playback-intent` presente.
  2. Para velocidade real 240 -> 30: integrar quadros em vez de pegar 1 em 8. Fórmula de obturador: o filtro `tmix` mistura N quadros sucessivos (https://ffmpeg.org/ffmpeg-filters.html#tmix); com 240 fps, 180° de obturador a 30 fps = média de 4 quadros (`tmix=frames=4`) e depois pegar 1 a cada 8. É técnica derivada, não testada com filmagem real: validar visualmente.
  3. Para câmera lenta: o motor já mistura 2 quadros em `vel<0.95` (planos l.178-181). Com fonte 240 fps, `vel=0.125` não precisa de mistura (há quadro real para cada saída).
  4. Áudio da câmera lenta: comportamento do iPhone: NC.

### 4.7 24/25/30/60 fps e conformação para a saída

- Instagram: Reels com taxa mínima de 30 FPS e resolução mínima de 720 px; proporção de 1,91:1 a 9:16; o app tem a opção "Upload at highest quality": https://help.instagram.com/1038071743007909
- YouTube: enviar na taxa em que foi gravado (24, 25, 30, 48, 50, 60); H.264 High, 2 B-frames, GOP fechado com comprimento de metade da taxa, CABAC, MP4 sem edit list e com moov no início: https://support.google.com/youtube/answer/1722171
- Medido (2.3b): pegar o quadro mais próximo em 24->30 e 25->30 repete 1 quadro a cada 5 (6 Hz de trepidação), e 60/120/240 -> 30 descarta quadros sem borrão.
- Opções, da mais simples para a mais cara:
  - Fonte 60/120/240 -> 30: misturar N quadros (`tmix`) antes de descartar (obturador de 180°).
  - Fonte 24/25 -> 30: (a) aceitar o puldown regular (1 quadro repetido a cada 5 saídas, que é o que o código faz hoje; medido: repetições nas posições 2 e 7 da sequência, espaçamento regular de 5); (b) mistura de quadros vizinhos (`framerate` ou `minterpolate`: https://ffmpeg.org/ffmpeg-filters.html#framerate / #minterpolate) com artefatos em movimento rápido; (c) para filme cinema, entregar em 30 mesmo, porque o mínimo do Instagram é 30 (a sensação "24" vem de obturador/cor, não do fps). Qual dá o melhor resultado em Reels: NC, testar A/B.
  - 29,97 -> 30: o código já dá passo 1 constante (medido): a diferença de 0,1% apenas encurta/alonga a duração em ~1 quadro por 33 s; aceitável.
- Regra: nunca converter fps duas vezes; decidir o fps de saída uma vez no formato do projeto.

### 4.8 Rotação e orientação

- ffmpeg aplica a rotação do display matrix automaticamente (`-autorotate`, ligado por padrão): https://ffmpeg.org/ffmpeg.html#Advanced-Video-options
- Código: ingest l.62-67 e comum.py l.93-99 trocam `w`/`h` quando a rotação é 90/270. Falta: espelhamento do display matrix e a chave `com.apple.quicktime.video-orientation` (valores 1-8 no exiftool: https://exiftool.org/TagNames/QuickTime.html).
- iPhone: `side_data` "Display Matrix: rotation of -90.00 degrees" é o normal em vídeo vertical (o código comenta isso em l.67).

### 4.9 Blackmagic Camera e apps que tiram o processamento da Apple

Fonte: ficha técnica oficial do app (iOS): https://www.blackmagicdesign.com/ca/products/blackmagiccamera/techspecs/W-APP-01
- Codecs: ProRes 422 HQ/422/422 LT/Proxy, ProRes RAW HQ/RAW (os dois RAW exigem armazenamento externo), HEVC e H.264; bitrate "Max, High, Medium, Low" (sem Mbps na página); proxy HEVC 1080p opcional.
- Resolução: 4K, HD, 720p, Open Gate.
- Taxas (iOS): 23,98, 24, 25, 29,97, 30, 48, 50, 59,94, 60, 100, 120 fps. 240 fps não consta na página (iOS).
- Espaços de cor (iOS): Rec.709, Rec.2020 HDR, P3 D65, Apple Log HDR e Apple Log 2 HDR.
- Obturador: velocidade 1/24 a 1/8000 ou ângulo 1,1° a 360°; anti-cintilação 50/60 Hz; ISO 21 a 5472 (dependente de modelo e lente).
- Chaves de processamento: Reduce Noise, Increase Sharpening, Lens Correction (liga/desliga), HDR Video (iOS), Anamorphic De-Squeeze (1,33/1,55/2,00), estabilização Off/Standard/Cinematic/Extreme, LUTs de monitoração que podem ser gravadas no clipe. A página não descreve tone mapping.
- O que isso muda para o motor: (1) imagem mais "crua" (sem o look de tone mapping/nitidez da Apple, quando as chaves estão desligadas); aplicar nitidez e redução de ruído no motor; (2) obturador controlado: clipes com ângulo de 180° têm borrão natural; clipes com obturador rápido ficam "estroboscópicos" ao conformar fps; (3) Apple Log/Log 2 mais comum; (4) bitrate/codec variáveis; (5) LUT gravada no clipe: quem gravou "com LUT" entrega Rec.709 já convertido, mas o arquivo pode vir com tag de log: a decisão fica por inspeção de histograma e por pergunta ao dono.
- Detecção automática do app por strings no arquivo: NC.
- Stu Maschwitz (Prolost) confirma que o app dá controle manual que o app Câmera da Apple não tem: https://prolost.com/applelog

### 4.10 Vídeos de câmera: S-Log3, V-Log, C-Log, BRAW, D-Log e LUTs oficiais

**Números de referência das curvas (para checar qualquer implementação):**
- S-Log3: 0% -> 95; 18% -> 420; 90% -> 598 (códigos 10 bits) (colour-science, citando o Technical Summary da Sony): https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/sony.html
- V-Log: constantes cut1 0,01; b 0,00873; c 0,241514; d 0,598206; 18% -> 0,4233; 90% -> ~602/1023 (colour-science citando a Panasonic 2014): https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/panasonic_v_log.html
- Apple Log: seção 4.1.
- Canon Log 3 e D-Log: constantes não confirmadas (as páginas de referência do colour-science que tentei devolveram 404; PDF da Canon e da DJI não abriram). O white paper da Canon existe em https://www.usa.canon.com/content/dam/canon-assets/white-papers/pro/white-paper-canon-log-gamma-curves.pdf (não consegui abrir).

**LUTs oficiais, onde baixar e licença (o que achei):**

| Fabricante | Arquivo/página oficial | Licença |
|---|---|---|
| Apple | White paper e LUT Apple Log -> Rec.709 no portal de desenvolvedores (pede login) https://discussions.apple.com/thread/256044678 | NC (não li o texto); usar a fórmula + IDT ACES até ler |
| Sony | https://sony-cinematography.com/resources/luts/ : coleção "Sony Collection": `Slog3-S-Gamut3.Cine To s709 V200.cube`, `... To sP3DCI V200.cube`, `... To sP3D65 V200.cube`; feitos com Picture Shop; páginas dizem "no cost" | NC (nenhum texto de licença na página) |
| Panasonic | https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/lut/index.html : `VLog_to_V709_forV35_EN.zip` (369.029 bytes; extensão .vlt para câmera) | NC |
| Canon | https://asia.canon/en/support/0200747702 (Canon 3D LUT for Canon 709) e https://asia.canon/en/support/0200711102 (CMT) | **Restritiva**: Canon mantém todos os direitos, o conteúdo é "as is", não pode ser distribuído, vendido, modificado, convertido de formato nem ter derivados; a página das Filipinas ainda limita a uso pessoal e não comercial. Não usar sem aval jurídico para trabalho comercial |
| DJI | https://www.dji.com/uk/lut : Mavic 3 (D-Log, D-Log M, vívido), Avata 2, Flip, Mini 4 Pro, Air 3 e 3s, O4 Air Unit, Osmo Action 4/5/6, Osmo Pocket 3, Osmo Nano, Osmo 360, Zenmuse X5/X7/X9 | NC (nenhum texto na página) |
| Blackmagic | LUT "Film Gen 5 to Extended Video" vem na pasta de LUTs do DaVinci Resolve (relato em fórum Adobe: https://community.adobe.com/t5/premiere-pro/blackmagic-gen-5-lut-not-loading-into-premiere-pro/m-p/12026779); BRAW SDK gratuito: https://www.blackmagicdesign.com/developer/products/braw/overview | NC para a LUT; SDK: "gratuito" segundo a página de desenvolvedor |

**Regra recomendada para o motor:** antes de empacotar qualquer LUT de fabricante, guardar o texto de licença da data do download em `memoria/` e só ligar a LUT se o texto permitir uso comercial em trabalho de cliente. Até lá, usar a fórmula pública da curva + matriz de gamut (como feito em 2.3e).

### 4.11 Modo Cinema do iPhone

- A captura gera dois conjuntos: o "rendered asset" (QuickTime comum com o efeito aplicado) e o "Cinematic mode asset" com 3 trilhas: vídeo original (HDR ou SDR; 1080p 30 ou, no iPhone 14, 4K 24/25/30), trilha de **disparidade** (deslocamento relativo entre duas câmeras, resolução menor que a do vídeo) e trilha de **metadados** (foco de renderização, abertura f, e o "script" com detecções de rosto/cabeça/tronco/gato/cachorro/bola e decisões de foco): https://developer.apple.com/wwdc23/10137
- A edição de foco e abertura é não destrutiva e guardada em arquivo separado; o desfoque é recalculado pelo framework Cinematic (GPU, Metal), não pelo ffmpeg.
- Padrões: Cinematic grava em 1080p 30; opções 4K 24 ou 4K 30; modelos mais novos também 4K/1080p 60: https://support.apple.com/guide/iphone/change-video-recording-settings-iphc1827d32f/ios
- Exportar "Unmodified Original" para armazenamento externo traz a versão original sem edições; AirDrop com "All Photos Data" traz o rendered + o Cinematic: https://support.apple.com/guide/iphone/iph5e602f6d6/ios
- **O que se perde** quando o arquivo vai para o motor: o desfoque artificial (se o arquivo recebido for o "original"), a profundidade e a lista de focos. Dá para ler as trilhas extras com ffprobe (a lista de `streams` mostra mais de uma de vídeo/dados), mas decodificar a disparidade e o script exige o formato da Apple: NC se algum ffprobe/exiftool decodifica o script.
- Recomendação: tratar Cinema como "vídeo comum de 30 fps com perfil de câmera iPhone", guardar `modo_captura=cinema` e as tags de trilha, e pedir ao Marcos que envie o vídeo renderizado quando quiser o efeito.

---

## 5. Pipeline de qualidade ("nunca estragar") derivado da pesquisa

1. **Converter cor uma vez, em ≥10 bits.** Apple: se a redução para 8 bits vem antes da conversão de cor, aparece banding (PDF da Apple acima). O `planos.py` hoje faz `bgr24` primeiro e LUT depois. Para fontes de 10 bits ou log, ler em `gbrp16le`/float e aplicar a conversão e o look em 16 bits (provado em 2.3e); reduzir para 8 bits no fim com dither (`zscale=dither=error_diffusion` ou `noise`).
2. **Intermediário de 10 bits.** Neste ffmpeg: `libx264` aceita `yuv420p10le`/`yuv422p10le` e `prores_ks` aceita `yuv422p10le`/`yuv444p10le` (`ffmpeg -h encoder=...` local). Para a cadeia premium: ProRes 422 HQ (ou x264 10 bits) entre planos e composição; o final de 8 bits só no último passo.
3. **Memória de 8 bits em log tem 21,8 códigos por stop** contra 87,5 em 10 bits (conta da seção 4.1): uma LUT que aumenta contraste estica esses degraus e aparece banding em céu/parede. Esse é o motivo técnico de ler o log em 10/16 bits.
4. **Tags de saída corretas.** YouTube: BT.709 nos três campos (H.273 valor 1), H.264 High, GOP fechado de meio segundo, 2 B-frames, sem edit list, faststart: https://support.google.com/youtube/answer/1722171. O motor já tagueia assim (comp.py l.288).
5. **Bitrate de referência (YouTube, SDR, Mbps):** 1080p: 8 (24/25/30 fps) e 12 (48/50/60); 2160p: 35-45 e 53-68; 1440p: 16 e 24. HDR 1080p: 10 e 15. O CRF 17 do motor deve ser conferido com `ffprobe -show_entries format=bit_rate` contra esses pisos (medição do bitrate real do final: NC).
6. **Resolução.** Instagram: mínimo 720 px (cap superior: NC). Fonte 4K -> 1080x1920 já é o padrão do motor. Para YouTube, resoluções até 2160p são aceitas (página HDR). Master em 2160x3840 como opção "premium": Instagram aceitar/guardar: NC.
7. **HDR na entrega.** O Instagram já recebe HDR (HEVC Main 10) do iPhone e gera SDR para aparelhos sem HDR (post da Meta, 17/11/2025). Se o motor entregar HLG HEVC 10 bits tagueado BT.2020/HLG, o Instagram trataria como HDR? Para arquivos que não saem do iPhone: NC. Padrão seguro: **entregar SDR BT.709**, e experimentar HLG só depois de teste A/B real.
8. **Não reamostrar sem necessidade:** decidir fps e resolução uma vez; nunca duas passagens de escala.
9. **Privacidade:** `com.apple.quicktime.location.ISO6709` contém GPS (https://exiftool.org/TagNames/QuickTime.html). Não gravar coordenadas no catálogo que vai para modelos externos; guardar apenas "tem_gps".

---

## 6. Campos novos que o ingest deveria gravar

Em `ingest.json -> midia.gravacao` (nomes em pt-BR, compatíveis com o resto do motor; todos opcionais, com `null` quando o arquivo não informa). Fonte entre parênteses.

**origem**
- `marca`, `modelo`, `software`, `app_camera`, `lente_modelo`, `distancia_focal_35mm`, `abertura_f`, `leitura_do_sensor_us` (tags `com.apple.quicktime.make/model/software`, `camera.lens_model`, `camera.focal_length.35mm_equivalent`, `camera.lens_irisfnumber`, `camera.framereadouttimeinmicroseconds`; lista de chaves do exiftool: https://exiftool.org/TagNames/QuickTime.html; a leitura do sensor ajuda a estabilização/rolling shutter).
- `android_fps_captura` (`com.android.capture.fps`), `android_marca/modelo/versao`.
- `modo_captura` (`com.apple.photos.captureMode`), `tem_gps` (booleano), `intencao_taxa_cheia` (`full-frame-rate-playback-intent` 0/1).

**container**
- `formato` (format_name), `major_brand`, `compatible_brands`, `tem_edit_list`, `timecode_inicio` (tag `timecode` de trilha tmcd, se existir), `n_trilhas_video`, `n_trilhas_audio`, `n_trilhas_dados`, `trilhas_extras[]` (indice, codec_type, handler_name; para Cinema: disparidade e metadados).

**video**
- `codec`, `perfil` (ProRes: Proxy/LT/Standard/HQ/4444/XQ; HEVC: Main/Main 10), `nivel`, `tag_codec` (`codec_tag_string`), `pix_fmt`, `bits` (`bits_per_raw_sample` ou derivado do pix_fmt), `croma` (420/422/444), `faixa` (`color_range`), `matriz` (`color_space`), `primarias` (`color_primaries`), `transferencia` (`color_transfer`), `localizacao_croma`, `largura_codificada`, `altura_codificada`, `sar`, `dar`, `bitrate`, `nb_quadros`, `tem_b_frames`, `ordem_campos` (`field_order`).

**hdr_dv**
- `mastering_display` (side data), `maxcll`, `maxfall` (side data "Content light level metadata"), `amve` (side data "Ambient viewing environment"), `dv`: `{versao_maior, versao_menor, perfil, nivel, rpu, el, bl, compat_id, compressao_md}` (campos `dv_*`, ver ffmpeg doxygen).

**tempo**
- `fps_nominal` (mediana dos deltas de PTS), `fps_medio` (`avg_frame_rate`), `fps_r` (`r_frame_rate`), `vfr` (bool), `vfr_min`, `vfr_max`, `jitter_pts_pct`, `fps_captura`, `fps_reproducao`, `alta_taxa` (bool), `rampa[]` (pares tempo, velocidade, quando houver), `time_base`, `start_time`, `deslocamento_audio` (diferença de `start_time` entre áudio e vídeo).

**orientacao**
- `rotacao` (já existe), `espelhado` (do display matrix), `orientacao_quicktime` (`video-orientation` 1-8).

**audio**
- `taxa`, `canais`, `layout_canais`, `bitrate`, `codec` (hoje só `codec_audio`), `tem_audio_espacial` (NC como detectar).

**cor (derivados)**
- `familia_cor` ∈ {`sdr709`, `hlg`, `hlg_dv84`, `pq`, `applelog`, `applelog2`, `slog3`, `vlog`, `clog2`, `clog3`, `dlog`, `dlogm`, `desconhecida`}, `confianca_cor` (0..1), `evidencias_cor[]` (cada sinal usado), `precisa_confirmar` (bool para o dono decidir uma vez por app/modelo), `histograma_log_sugere` (p2/p50/p98 de luma e saturação, para a heurística do Apple Log).

**avisos**
- `avisos[]` do tipo: "HDR convertido para SDR", "VFR detectado", "ProRes RAW não suportado nesta versão do ffmpeg", "Cinema: sem desfoque no arquivo", "log sem LUT: imagem sairá chapada".

Implementação em duas passadas para não encarecer o ingest: (1) `ffprobe` completo (`-show_streams -show_format -show_entries stream_side_data`) já cobre quase tudo; (2) a lista de PTS (`-show_entries packet=pts_time -select_streams v:0`) só quando `avg_frame_rate` e `r_frame_rate` divergirem ou `fps >= 100`.

---

## 7. Conclusões numéricas para decisão (resumo executivo)

1. Apple Log: P=1,0 corresponde a R=12,0 (6,06 stops acima do cinza 18%); preto fica em P=0,15 e cinza 18% em P=0,488.
2. Apple Log em 8 bits dá 21,8 códigos por stop (0,0855 x 255) contra 87,5 em 10 bits.
3. Fórmula Apple Log por LUT 3D tetrahedral em 16 bits: erro máximo de 1 código no eixo neutro (medido).
4. DV 8.4: perfil 8, `dv_bl_signal_compatibility_id=4` (HLG); `colr` 9/18/9; `hvc1` Main10; `amve` presente.
5. HLG -> SDR: cinza médio (HLG 0,5) sai entre 0,50 (hable atual) e 0,80 (clip) conforme a curva: precisa calibrar com referência da Apple.
6. 24 fps -> 30 fps pelo código atual repete 6 de 29 quadros; 60/120/240 -> 30 descarta 1/2, 3/4, 7/8 dos quadros sem borrão.
7. VFR medido: r_frame_rate 60/1 contra avg 38,43 num clipe de 3 s: erro de até 0,5 s na posição do quadro 30.
8. iPhone: slo-mo padrão 1080p 240 fps (traseira), 120 fps (frontal); Cinema 1080p 30 (padrão) ou 4K 24/30; Auto FPS reduz para 24 fps; ProRes 4K 60 nos Pro 15+; 4K 120 só em Pro 16+ com disco externo de >= 440 MB/s.
9. Tamanho ProRes em 4K 30 por minuto: LT 3,1 GB; 422 4,4 GB; HQ 6,6 GB; RAW 10 GB; RAW HQ 15 GB; HEVC 175 MB.
10. Instagram Reels: mínimo 30 fps e 720 px, 1,91:1 a 9:16. YouTube H.264: 1080p 8/12 Mbps (30/60 fps), 4K 35-45/53-68 Mbps, GOP fechado de meia taxa, BT.709 1/1/1.
11. S-Log3: 95/420/598; V-Log: 18% em 0,4233 e 90% em ~602/1023 (10 bits).
12. ProRes RAW exige ffmpeg 8.x (decoder de 2025); o ffmpeg 6.1.1 daqui não lê; BRAW não é lido pelo ffmpeg (SDK gratuito da Blackmagic).
13. libplacebo existe no build mas não funciona sem Vulkan (medido: `VK_ERROR_INCOMPATIBLE_DRIVER`); plano CPU = zscale + tonemap + LUT 3D.
14. Licenças: só Canon (restritiva) e ACES (permissiva) foram lidas; Sony, Panasonic, DJI, Apple e Blackmagic: texto não localizado.

---

## 8. Plano de teste recomendado (sem alterar o motor agora)

Kit de amostras que faltou e é preciso pedir ao Marcos (8 arquivos curtos, 5 a 10 s cada, enviados pela pasta `Envio da câmera`):
1. iPhone, app Câmera, 4K 30, HDR Video ligado (HEVC HLG + DV 8.4).
2. Mesmo enquadre, HDR Video desligado (SDR).
3. iPhone, ProRes Log (15 Pro ou mais novo), 4K 30.
4. Final Cut Camera ou Blackmagic Camera, Apple Log, HEVC e ProRes.
5. Slo-mo 240 fps original (Exportar original não modificado) e o mesmo exportado do Fotos.
6. Cinema (rendered e "All Photos Data").
7. Clipe em pouca luz com Auto FPS ligado (VFR).
8. Se houver: câmera com S-Log3/V-Log/C-Log e drone DJI D-Log M.

Para cada um: salvar `ffprobe -show_streams -show_format -show_entries stream_side_data -of json` e `exiftool -a -G1 -s`. Isso fecha os itens da seção 9 que dependem de "como o arquivo real vem".

---

## 9. O que não consegui confirmar

1. Como o iPhone grava o Apple Log e o Apple Log 2 no `colr` e em chaves de metadados (valor da transferência, nome exato da chave `LogTransferFunction` e o namespace), se a faixa é video ou full e a matriz YCbCr (assumi BT.2020 NCL e faixa tv no teste 2.3e).
2. Fórmula, primárias e matriz do Apple Log 2.
3. Licença do LUT e do white paper da Apple (exige login de desenvolvedor); licença das LUTs Sony, Panasonic, DJI e Blackmagic; só li texto de Canon (restritivo) e ACES (permissivo). O caminho do IDT no repositório aces-dev (404 no caminho que tentei).
4. Como o ffprobe mostra um slo-mo real do iPhone (fps 240/1 ou 30/1; onde fica a rampa) e como o arquivo do Fotos "exportado" difere do original; comportamento do áudio na câmera lenta.
5. Como o Auto FPS aparece em PTS (VFR) no arquivo real do iPhone.
6. Quais strings (`software`, `encoder`, `handler_name`, trilhas tmcd) identificam Blackmagic Camera, Final Cut Camera, Android e DJI.
7. Valores de `color_primaries/transfer/space` que câmeras Sony/Panasonic/Canon/DJI escrevem no mp4/mov e o nome exato dos campos dos sidecars (NRT da Sony: só achei um exemplo Rec.709 em fórum do exiftool).
8. Constantes oficiais da Canon Log 3 e da D-Log/D-Log M (os PDFs oficiais não abriram nesta rede; a página da referência do colour-science devolveu 404 nos módulos que tentei).
9. Qual tonemap/`npl`/`param` reproduz o SDR da Apple (sem referência); se `apply_dolbyvision=0` é o ajuste certo do libplacebo para DV 8.4; qualquer teste com libplacebo (sem Vulkan aqui).
10. Se o Instagram preserva HDR (HLG HEVC) em arquivos que não saem do iPhone, o teto de resolução aceito além de 1080x1920, o codec/bitrate recomendados na seção "What are Instagram Reels video codecs?" (a seção está recolhida na página de ajuda; só li o texto visível), e o que o Instagram faz com 24/25 fps.
11. Qual versão do ffmpeg incluiu o `amve` no demuxer MOV (o patch é de 2023-2024; inferi ffmpeg 7.0, sem nota de versão) e se o 6.1.1 deste ambiente imprime esse side data.
12. Se o Dropbox "Envio da câmera" preserva o original HEVC/ProRes/HLG sem recodificar (não verifiquei).
13. Detecção do modo Ação do iPhone nos metadados e do Spatial Audio no áudio (formato/canais).
14. Eficácia visual de `tmix` para 240->30 e de `framerate`/`minterpolate` para 24->30 em Reels (técnicas derivadas, não validadas com filmagem real).

---

## 10. Fontes

Apple
- TN3145 (HDR video metadata, DV 8.4, `amve`): https://developer.apple.com/documentation/technotes/tn3145-hdr-video-metadata
- Incorporating HDR video with Dolby Vision into your apps (PDF): https://developer.apple.com/av-foundation/Incorporating-HDR-video-with-Dolby-Vision-into-your-apps.pdf
- AVCaptureColorSpace.appleLog: https://developer.apple.com/tutorials/data/documentation/avfoundation/avcapturecolorspace/applelog.md
- CVImageLogTransferFunction: https://developer.apple.com/documentation/corevideo/cvimagelogtransferfunction.md
- Fórum Apple Developer (Apple Log -> Rec.709/HLG, sem API pública): https://developer.apple.com/forums/thread/853370
- Fórum Apple Developer (slo-mo `nominalFrameRate`): https://developer.apple.com/forums/thread/731460
- Fórum Apple Community (LUT Apple Log): https://discussions.apple.com/thread/256044678
- About Apple ProRes on iPhone: https://support.apple.com/109041
- Change video recording settings on iPhone (Auto FPS, HDR, slo-mo, Cinematic, Lock WB): https://support.apple.com/guide/iphone/change-video-recording-settings-iphc1827d32f/ios
- Edit Cinematic mode videos on iPhone: https://support.apple.com/guide/iphone/iph5e602f6d6/ios
- Set the video format in Final Cut Camera: https://support.apple.com/guide/final-cut-camera/dev14d309a3f/ios
- WWDC23 10137 (Cinematic mode): https://developer.apple.com/wwdc23/10137
- quickTimeMetadataFullFrameRatePlaybackIntent: https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/quicktimemetadatafullframerateplaybackintent.md
- quickTimeMetadataCameraFrameReadoutTime: https://developer.apple.com/documentation/avfoundation/avmetadataidentifier/quicktimemetadatacameraframereadouttime.md

ffmpeg e metadados
- Filtros (zscale, tonemap, libplacebo, fps, tmix, framerate, minterpolate, lut3d): https://ffmpeg.org/ffmpeg-filters.html
- ffmpeg (`-fps_mode`, `-autorotate`): https://ffmpeg.org/ffmpeg.html
- Formatos (opções do demuxer MOV): https://ffmpeg.org/ffmpeg-formats.html
- AVStream (`r_frame_rate`): https://ffmpeg.org/doxygen/trunk/structAVStream.html
- AVDOVIDecoderConfigurationRecord: https://ffmpeg.org/doxygen/trunk/structAVDOVIDecoderConfigurationRecord.html
- ProRes RAW decoder (patches 2025): https://ffmpeg.org/pipermail/ffmpeg-devel/2025-July/346456.html ; código: https://sources.debian.org/src/ffmpeg/7%3A8.1-3/libavcodec/prores_raw.c
- `amve` no mov: https://ffmpeg.org/pipermail/ffmpeg-devel/2024-February/320789.html
- ExifTool, tags QuickTime (chaves `com.apple.quicktime.*`, `colr`, rotação): https://exiftool.org/TagNames/QuickTime.html
- Library of Congress, ProRes (FourCC): https://loc.gov/preservation/digital/formats/fdd/fdd000534.shtml

Plataformas
- Instagram, tamanho e proporção de Reels: https://help.instagram.com/1038071743007909
- Meta Engineering, HDR e Dolby Vision no Instagram: https://engineering.fb.com/2025/11/17/ios/enhancing-hdr-on-instagram-for-ios-with-dolby-vision/
- YouTube, configurações de upload: https://support.google.com/youtube/answer/1722171
- YouTube, HDR: https://support.google.com/youtube/answer/7126552

Câmeras, apps e LUTs
- Blackmagic Camera (ficha técnica): https://www.blackmagicdesign.com/ca/products/blackmagiccamera/techspecs/W-APP-01
- Blackmagic RAW SDK: https://www.blackmagicdesign.com/developer/products/braw/overview
- Sony LUTs: https://sony-cinematography.com/resources/luts/
- Panasonic LUT: https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/lut/index.html
- Canon LUT: https://asia.canon/en/support/0200747702
- DJI LUT: https://www.dji.com/uk/lut
- Prolost, Apple Log: https://prolost.com/applelog
- colour-science: Apple Log https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/apple_log_profile.html ; S-Log3 https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/sony.html ; V-Log https://colour.readthedocs.io/en/master/_modules/colour/models/rgb/transfer_functions/panasonic_v_log.html
- Licença ACES (AMPAS): https://raw.githubusercontent.com/ampas/aces-dev/dev/LICENSE.md
- LogGate Pro (relato de fabricante sobre `LogTransferFunction`): https://apps.apple.com/us/app/loggate-pro/id6761159398
