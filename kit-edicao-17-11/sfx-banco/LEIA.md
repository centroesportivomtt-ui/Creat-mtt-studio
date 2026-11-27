# Banco de efeitos sonoros reais da creat.MTT

Índice de pesquisa (sem nenhum áudio dentro) sobre os pacotes gratuitos **Sonniss #GameAudioGDC** (2015, 2016, 2017, 2018, 2019, 2020, 2023, 2024 e 2026) espelhados no archive.org. Tudo é **gravação real** de bibliotecas profissionais de som. Nada sintetizado, nada de IA. (Algumas bibliotecas têm "sound design" feito em cima de gravações; o nome do arquivo costuma avisar: `designed`, `sci-fi`, `magic`. O kit Itaitu evitou essas.)

Os áudios ficam no archive.org e são baixados só quando você escolhe um. O repositório guarda apenas o índice.

## O que tem aqui

| arquivo | para quê |
|---|---|
| `indice.sqlite` | o banco: tabela `sons` + busca de texto `busca` (FTS5) |
| `indice.jsonl.gz` | o mesmo índice em texto, uma linha por arquivo (para ler em qualquer linguagem) |
| `buscar.py` | procura e baixa (só biblioteca padrão do Python 3) |
| `construir_indice.py` | refaz o índice do zero (baixa os metadados do archive.org, 1 pedido por vez) |

## O que o índice cobre (números medidos)

- **7.546 sons únicos** (um "som" = um arquivo de áudio, com WAV e FLAC juntos na mesma linha), de **9 pacotes** (GDC 2015, 2016, 2017, 2018, 2019, 2020, 2023, 2024, 2026), em 2.123 bibliotecas/pastas.
- **258,5 GB** em WAV (127,3 GB se baixar em FLAC). 7.531 dos 7.546 têm FLAC; o FLAC é bem menor e igual em qualidade.
- Duração somada: cerca de **126 horas** de áudio.
- Mais **13.024 linhas de espelho** (os mesmos arquivos em outros itens do archive.org, 438,7 GB) marcadas com `principal = 0`. Servem de reserva se um item sair do ar. A busca esconde os espelhos, a menos que você use `--todos`.
- Cada linha traz: item do archive.org, pacote/ano, biblioteca (a pasta do autor), nome, caminho dentro do item, tamanhos WAV e FLAC, duração (`dur_s`), canais quando o nome diz (mono, estéreo, surround, ambisônico), URL direta de download (WAV e FLAC), MD5, categorias em português inferidas do nome e a marca `risco_voz`.
- Os `.zip` inteiros dos pacotes não entram: os itens do archive.org listam arquivo por arquivo, então dá para baixar um som só (inclusive um pedaço dele, ver `--trecho`).

Itens usados (principal de cada ano): `game-audio-gdc` (2015), `SonnissGameAudioGDCPart2` (2016), `game-audio-gdcpart-3` (2017), `game-audio-gdcpart-4` (2018), `game-audio-gdcpart-5` (2019), `SonnissGameAudioGDCPart6` (2020), `gdc-2023-game-audio-bundle` (2023), `sonniss-gdc-2024-game-audio-bundle-normalized` (2024), `sonniss-gdc-2026-game-audio-bundle-normalized` (2026). Para 2020, o FLAC vem do espelho `game-audio-gdcpart-6` (o item principal só tem WAV).

## Como buscar

```bash
cd kit-edicao-17-11/sfx-banco
python3 buscar.py "water stream" --max 20
python3 buscar.py "agua passando"                 # português funciona (dicionário pt para en)
python3 buscar.py "porta-malas abrindo" --sem-voz
python3 buscar.py "pisada na terra"
python3 buscar.py --cat cachoeira --max 30        # só por categoria
python3 buscar.py --categorias                    # categorias e quantos sons cada uma tem
python3 buscar.py "vento arvores" --canais estereo --dur-min 40 --ano 2024
python3 buscar.py --info 1234                     # tudo sobre um som
```

Como a busca funciona: cada palavra em português vira um grupo de palavras em inglês (`agua` vira `water`; `riacho` vira `stream`, `creek`, `brook`), os grupos são ligados por E, e se der pouco resultado ela completa com resultados parciais. O ranking dá mais peso ao nome do arquivo que à biblioteca. A linha `consulta FTS:` mostra exatamente o que foi procurado. Se o dicionário não conhece a palavra, escreva em inglês (o que as bibliotecas usam).

Dica de trabalho: para ambientes, procure pelo **local e hora** (`jungle morning`, `crickets night`, `forest wind`). Para efeitos curtos, pelo **objeto e ação** (`trunk open`, `door close`, `seatbelt`).

## Como baixar

```bash
python3 buscar.py --baixar 1234 --para ~/sfx                  # FLAC (WAV se não houver FLAC)
python3 buscar.py --baixar 1234 --para ~/sfx --formato wav
python3 buscar.py --baixar 1234 --para ~/sfx --trecho 40:30   # só 30 s a partir de 40 s (WAV, pedido parcial)
```

`--trecho` é o jeito educado e rápido para ambientes longos: o script lê o cabeçalho do WAV e baixa só os bytes do pedaço (nada de baixar 700 MB para usar 30 s). O resultado sai em WAV; converta para FLAC com `ffmpeg -i x.wav -c:a flac x.flac` se quiser economizar disco.

Boas maneiras com o archive.org: o script baixa **um arquivo por vez**, espera e recua (10 s, 20 s, 40 s...) se o servidor responder 429 ou 503, e **para** se for bloqueado (403). Não rode vários em paralelo (no máximo 2) e não troque de rota para contornar bloqueio.

## Licença (o que pode e o que é proibido)

Licença **Sonniss #GameAudioGDC Bundle** (texto completo guardado em `kit-edicao-17-11/sfx/LICENCAS.md` e nos pacotes):

- Pode: usar em projetos pessoais **e comerciais**, no mundo todo, **sem royalties e sem dar crédito**; sincronizar com vídeo; editar, misturar e publicar dentro da obra (Reel, filme, anúncio).
- Proibido: **revender os sons soltos**, **redistribuir como biblioteca/pack** (por isso nenhum áudio vai para o GitHub), dizer que a gravação é sua e, pelo aviso do pacote, usar os sons para treinar IA.
- Ressalva: os arquivos vêm de espelhos no archive.org, não do site da Sonniss (a página de licença do site respondeu 403 daqui). O texto conferido é o que acompanha os pacotes de 2016, 2023 e 2026. Os pacotes de 2024 e 2026 trazem a mesma licença da série.
- Fora do índice de propósito: itens "Sonniss free packs"/Alexander Kopeikin (inclui pastas que não são GDC) e "Game Audio Monthly", porque não conferi a licença deles. Os itens-coleção gigantes `GameAudioGDC` e `gameaudiogdc-part1through7` repetem os anuais e também ficaram de fora.

## Lacunas honestas (o que o banco tem pouco ou nada)

Medido no índice (sons únicos, categorias inferidas **pelo nome**, então há erro para mais e para menos):

- **Passos por superfície são o ponto mais fraco**: `passos_terra` 9, `passos_folhas` 8, `passos_cascalho` 9, `passos_mato` 11, `passos_lama` 3, `passos_areia` 1. Quase todos são séries curtas de poucas bibliotecas (PMSFX Dirt & Gravel, PMSFX Dry Grass & Shrubs, Sounds Visual Footsteps on Leaves, Studio 23). Não existe uma biblioteca grande de passos em trilha de terra de floresta.
- **Porta-malas**: só 6 sons com a palavra no nome e carro de hatch (Citroën C2, Nissan Qashqai, Audi A3, Porsche Cayenne). Não há tampa traseira de utilitário/SUV brasileiro gravada por dentro e por fora.
- **Cinto de segurança**: 9 sons. Serve, mas pouca variedade.
- **Sons do Brasil**: o banco é europeu, norte-americano e asiático. Pássaros e insetos tropicais vêm de Costa Rica, Tailândia, Vietnã, Havaí e Filipinas. **Não há cigarra, sapo, grilo nem pássaro gravado no Brasil**, nem eucalipto identificado no nome (usei "vento em copa de árvores" de carvalho, álamo e cipreste). Vale ouvir antes: espécie reconhecível pode entregar que não é daqui.
- **Samambaia/mato roçando**: só 69 sons de "folhas" e 103 de "capim/mato", quase todos vento. Roçar de mato com o corpo passando é raro.
- **Água em poço/balde/cisterna**: praticamente não há; o mais perto são respingos e despejo curto.
- **Cachoeira**: 15 sons com a palavra no nome. Bons, mas poucos.
- **Transição de cinema "pronta"**: o banco tem muito "sound design" (sintetizado ou muito processado). Os sons físicos (varada de vara, corda, tecido, impacto em metal, ondas e água subindo) são poucos. A tese "só gravação real" aperta nesta categoria.
- **Voz humana**: `risco_voz` só enxerga o nome. Ambiente de cidade, mercado e floresta pode ter fala sem avisar no título. Sempre rodar checagem de voz antes de usar (ver `kit-edicao-17-11/sfx/LICENCAS.md`, seção Conferências).
- **Categorias** vêm de palavras do nome, sem ouvir o áudio. `ambiente`, `carro`, `impacto` e `sci_fi_design` pegam coisa demais. Use a categoria para afunilar e depois leia o nome inteiro.
- **Anos que não existem no archive.org** (nas buscas que fiz): 2021, 2022 e 2025. Se existirem, estão sob outro nome.
- **Duração e formato**: a duração vem dos metadados do archive.org. Taxa de amostragem, canais e bits só são conhecidos ao baixar (o kit mediu). 39 sons são ambisônicos e 32 surround pelo nome; esses não servem direto para mix estéreo.

## Refazer o índice

```bash
python3 construir_indice.py --meta /pasta/meta --saida . --baixar-meta
```

Baixa `/metadata/<item>` de cada item (um por vez, com pausa e recuo) e regrava `indice.sqlite` e `indice.jsonl.gz`. Para de vez se o archive.org bloquear.
