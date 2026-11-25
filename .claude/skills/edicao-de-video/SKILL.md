---
name: edicao-de-video
description: Processo de edição de vídeo da casa (creat.MTT e anúncios). Do material bruto à entrega no Dropbox, nesta ordem: pedido, entrada das gravações, inventário com transcrição e quadros, achar a fala, roteiro de corte, gancho testado, montagem com o pulo do gato (legenda no meio, zoom, cor por ambiente, voz limpa, fala acelerada, música com ducking), portão de áudio, capa e entrega organizada. Use quando o dono disser "edita esse vídeo", "mandei as gravações", "corta isso", "faz o Reel", "faz o anúncio em vídeo", "tá no Envio da câmera", ou quando qualquer agente for montar, cortar, legendar ou entregar vídeo.
---

# Edição de vídeo

Junta num lugar o que estava espalhado: as regras de vídeo do `CLAUDE.md`, a regra oficial do Dropbox, o fluxo de entrada que a casa usou no evento de 11/11, a biblioteca de referências (`docs/referencias/README.md`) e as skills trazidas em 12/11 (`painel-de-objecoes`, `calculadora-de-oferta`, `oferta-empilhada`).

Tudo é processado na nuvem, na sessão. **Nunca** vídeo ou arquivo pesado no computador do dono; a entrega é um link clicável do Dropbox dele, nunca anexo. Arquivo bruto, áudio e quadros ficam no scratchpad, nunca no repositório.

## O padrão: o pulo do gato

A reação esperada de quem assiste é "como eles conseguiram fazer isso?". Todo vídeo tem pelo menos um gesto que só a Creat faria, e sempre:
- **Legenda no meio da tela**, com tipografia expressiva (palavra-chave maior ou em cor, entrada com escala curta), nunca a legenda de rodapé padrão. Fora das zonas que o app cobre: topo de cerca de 14% e base de cerca de 20% da tela vertical.
- **Zoom nos momentos cruciais** (a frase do gancho, o número, o preço, a virada).
- **Cor por ambiente**: cada cena tem a sua correção; pele tratada; nada de filtro único no vídeo inteiro.
- **Voz limpa com IA**, sem artefato, em todo áudio gravado sem microfone (ferramenta nº 1 de voz do estudo em `docs/stack-ferramentas-2026.md`, seção 3.8; ouça antes e depois).
- **Fala acelerada de 1,1 a 1,2 vez** quando ajudar o ritmo, sem voz de esquilo.
- **Música com ducking** sob a fala, sound design nas transições.
- Transições criativas e tipografia cinematográfica onde servirem à história, não por enfeite.

## 0. O pedido, em 5 linhas

Antes de tocar no material, escreva: **EMPRESA** (para quem é: creat.MTT, Creat Nuvem, o nome do cliente), **NOME DO VÍDEO**, **objetivo** (anúncio que vende um produto, Reel de marca, bastidor), **para quem** (o padrão é o desconhecido de outra cidade que chega por anúncio) e **próximo passo** que o vídeo pede. Se for anúncio: a oferta passa na `calculadora-de-oferta`? Vídeo bom vendendo oferta que não fecha a conta é dinheiro jogado fora; diga isso antes de editar. Verba só em produto (regra 8 do dono).

## 1. Entrada

- Gravações do celular: Dropbox `/Marcos/Envio da câmera` (nome do arquivo = data e hora da gravação) e as pastas que o dono cria. Pasta da equipe: `/Pasta da equipe Mttcreatt`. **Essas pastas nunca são mexidas**: nada é movido, renomeado ou apagado lá.
- Liste com o conector do Dropbox (`list_folder`) e baixe pelo link temporário (`download_link`) direto para o scratchpad, com `curl -sS -L -o <scratchpad>/<projeto>/bruto/<arquivo> "<link>"`.
- **Problema conhecido (12/11/2026):** às vezes o Dropbox recusa o link temporário de download para a conta inteira. Caminho alternativo: o dono sobe as gravações numa pasta do Google Drive e a casa baixa pelo conector do Drive (`download_file_content`). Peça isso a ele em uma frase, com o nome da pasta sugerida, e siga com o que já tiver chegado.
- Vídeo de referência de terceiro (Reel, TikTok) não é material de edição: é estudo, pela skill `estudar-referencia`.

## 2. Inventário: ver e ouvir tudo antes de cortar

Para cada arquivo, a ficha da casa:

```bash
python3 -I -B /home/user/Creat-nuvem-VIBE-CODE/.claude/skills/edicao-de-video/ingerir.py <video> --saida <scratchpad>/<projeto>/inv --rotulo <nome-curto>
```

Grava `<rotulo>.json` (duração, formato vertical ou horizontal com a rotação já aplicada, fps, cortes de cena e cortes por 10 s, volume médio, fala com tempo de cada trecho, palavras por minuto) e `<rotulo>-quadros.jpg` (8 quadros espalhados). Transcrição com faster-whisper `small`, `int8` na CPU, em português; `--modelo medium` quando o áudio for ruim; `--sem-transcricao` para cena sem fala. O script recusa gravar dentro do repositório.

**Olhe cada folha de quadros** (abra a imagem) e leia cada transcrição. Monte uma tabela de inventário: arquivo, duração, formato, o que mostra, primeira frase, qualidade (foco, luz, áudio). Material com rosto de terceiro, criança ou cliente: anote e confirme o direito de uso com o dono antes de usar.

## 3. Achar a fala

Pelos segmentos com tempo: qual tomada diz melhor cada ideia, onde começa e termina cada frase boa, onde há gaguejo, repetição ou silêncio. Escolha **a frase do gancho** (os 2 primeiros segundos) e **a frase do fim** (o próximo passo).

## 4. Roteiro de corte

Um arquivo `corte.md` no scratchpad, uma linha por trecho: arquivo, de, até, o que diz, por que entra, efeito (zoom, legenda destacada, cor, transição, som). Duração-alvo escrita antes.

**Anúncio: teste o gancho antes de editar.** Escreva de 2 a 4 aberturas candidatas e rode o `painel-de-objecoes` com elas e com a oferta (20 compradores). Abra o vídeo com a que mais prendeu, e use as objeções e as frases do painel para a legenda e o fim. É hipótese simulada: escolhe o que testar; o anúncio real decide.

**Formato de referência:** consulte `docs/referencias/README.md` (seção "Biblioteca de formatos") e use o que serve ao objetivo, sempre com a assinatura da casa por cima, nunca cópia.

## 5. Montagem

Na nuvem, com `ffmpeg` (já instalado). Receitas conferidas na sessão de 12/11/2026:

```bash
# acelerar fala e imagem juntas (1,15 vez)
ffmpeg -i in.mp4 -filter_complex "[0:v]setpts=PTS/1.15[v];[0:a]atempo=1.15[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac out.mp4

# música com ducking sob a voz e volume para rede social
ffmpeg -i voz.mp4 -i musica.m4a -filter_complex "[0:a]asplit=2[voz][sc];[1:a]volume=0.35[m0];[m0][sc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[m];[voz][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -ar 48000 out.mp4

# legenda no meio da tela (arquivo .ass com Alignment 5, PlayResX 1080, PlayResY 1920)
ffmpeg -i in.mp4 -vf "scale=1080:1920,ass=legendas.ass" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy out.mp4
```

- Legenda: gere o `.ass` a partir dos segmentos da transcrição final (depois da aceleração, os tempos mudam: transcreva o corte final, não o bruto). Uma a três palavras por vez, palavra-chave em cor ou maior, entrada curta com `\t(...\fscx112\fscy112)`.
- Volume: confira com `ffmpeg -i out.mp4 -af ebur128=framelog=quiet -f null -` (alvo perto de -14 LUFS para Reels); o `loudnorm` de uma passada erra em clipe curto.
- Zoom: `crop` e `scale` com expressão de tempo, ou `zoompan`, só nos momentos marcados no roteiro.
- Montagem por código com legenda animada e transição (HyperFrames) está no estudo como "a testar": só depois do teste de 1 vídeo e da revisão da Muralha.

## 6. Revisão (portão de áudio e de imagem)

- **Portão de áudio** (regra 6 do dono): rode o `ingerir.py` no vídeo final e compare a transcrição palavra a palavra com o roteiro. Preço, moeda e número conferidos no áudio. Locução gerada em português só com voz brasileira nativa.
- Folha de quadros do final: legenda dentro da zona segura, sem palavra cortada, sem erro de português, cor coerente entre cenas.
- Duração, formato (1080x1920 para vertical), som sem estouro, começo sem tela preta.
- Anúncio: validação tripla antes de subir (regra 5): idioma, moeda e link certo para o nicho certo, com a medição certa.

## 7. Capa

Um quadro forte do próprio vídeo, tratado, com tipografia da casa. Mesmo nome do vídeo terminando em `capa`.

## 8. Entrega no Dropbox (regra oficial do dono)

- Pasta: `/Marcos/<EMPRESA>/<NOME DO VÍDEO OU DO PROJETO>/`, com `LEIA PRIMEIRO.md` e só as pastas que têm conteúdo: `0 - Para aprovar` (vídeos e imagens em subpastas separadas), `1 - Vídeos`, `2 - Capas`, `3 - Imagens`, `4 - Textos`, `5 - Relatórios`, `7 - Projeto editável`, `9 - Versões antigas`.
- Vídeo só em `1 - Vídeos`; capa só em `2 - Capas`.
- Nome: `Empresa - nome do vídeo - variação`, curto, em português, sem código interno, sem medida técnica, sem data no começo. Exemplo: `creat.MTT - Vira o Crachá - filme final.mp4`.
- Como subir: texto pelo conector do Dropbox; vídeo e imagem por `node projetos/creat-nuvem/scripts/dropbox-enviar.cjs --pedido <endereço> <arquivos>`, com `DROPBOX_REMETENTE_NOME` igual à EMPRESA. O endereço de envio de cada subpasta vem de `list_file_requests`, nunca do repositório. **Nome com acento é descartado em silêncio:** suba sem acento, renomeie com `move` e confira a pasta depois.
- Versão substituída vai para `9 - Versões antigas` na mesma rodada. `LEIA PRIMEIRO.md` cabe em uma tela (o que é, onde está cada coisa, o que olhar agora) e é atualizado na mesma rodada. Projeto novo entra na lista de `/Marcos/COMO ESTÁ ORGANIZADO - regra oficial.md`.
- Ao dono: o link clicável da pasta ou do vídeo, em poucas linhas, com o que olhar primeiro.

## 9. Fechar a rodada

- Relatório com o padrão de entrega e a **Lição da rodada** com prova.
- Formato novo que funcionou vira item na biblioteca de referências (`docs/referencias/README.md`).
- Serviço pago (geração de vídeo, voz, música): rota da economia primeiro (crédito grátis, modelo mais barato com a mesma qualidade); custo novo só com o "pode" do dono; Higgsfield sempre com `POST /estimate` antes e download na mesma rodada (arquivo some em 7 dias).

## O que nunca fazer

- Baixar vídeo para o computador do dono ou mandar vídeo como anexo.
- Mexer em `/Marcos/Envio da câmera` ou nas pastas de gravação do dono.
- Subir criativo com fala sem o portão de áudio.
- Usar fala do painel de objeções como depoimento, ou número do painel como promessa.
- Pôr gravação, transcrição, nome de cliente ou gasto no repositório.
