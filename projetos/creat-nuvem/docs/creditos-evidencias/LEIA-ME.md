# Provas de origem das imagens das demonstrações

Pacote 3F da onda 3 · Paleta · 10/11/2026. A tabela com autor, licença, sha256, alt e legenda está em `docs/CREDITOS-IMAGENS.md`.

## O que tem aqui

| pasta | o que prova |
|---|---|
| `fonte-svg/` | o desenho de cada uma das 12 imagens, em SVG puro, sem imagem embutida e sem link externo. É a obra original. |
| `gerador/` | o código que escreveu cada SVG (`base.py`, `barbearia.py`, `salao.py`, `academia.py`, `gerar.py`), o que rasteriza em 1024 × 1280 (`render.cjs`, Chromium do Playwright, rede bloqueada) e o que grava o WebP sem metadado (`webp.py`, Pillow). |
| `prints/contato-12.webp` | folha de contato das 12 imagens: nenhum rosto, nenhuma pessoa, nenhuma marca. |
| `prints/390-<nicho>-<tema>.webp` | a galeria simulada a 390 px de largura, tema claro e escuro, com as cores de fundo e de texto de cada demo. |

## Por que não há captura de licença nem busca reversa

Não houve foto de banco. Em 10/11/2026, unsplash.com respondeu com tela de verificação de navegador (HTTP 401) e www.pexels.com respondeu HTTP 403, então a licença não pôde ser lida na página de nenhuma foto. Pela regra D5, foto sem licença conferida não entra. As imagens são obra própria criada hoje; a busca reversa não se aplica. A prova de origem é a fonte e o gerador.

## Como refazer e conferir

Numa pasta de trabalho fora do repositório, com Python 3 + Pillow e Node + Playwright:

```bash
cp -r projetos/creat-nuvem/docs/creditos-evidencias/gerador /tmp/refazer && cd /tmp/refazer
python3 gerar.py barbearia salao academia        # escreve svg/
node render.cjs barbearia-1 barbearia-2 barbearia-3 barbearia-4 salao-1 salao-2 salao-3 salao-4 academia-1 academia-2 academia-3 academia-4
python3 webp.py                                   # escreve webp/ (cada um <= 78 KB)
```

`render.cjs` procura o Playwright em `/opt/node-tools/node_modules/playwright` (ambiente da nuvem do Claude Code); em outra máquina, troque pelo caminho local. Os SVG gerados são iguais aos de `fonte-svg/`.

## Conferência de metadado (sem exiftool, que não está instalado e não pode ser instalado)

O WebP é um contêiner RIFF: EXIF, XMP e perfil de cor só existem como blocos `EXIF`, `XMP ` e `ICCP` dentro do VP8X. Os 12 arquivos têm um bloco só, `VP8 `, então não carregam metadado nem GPS. Para conferir:

```bash
python3 -I -c "
import struct,glob
for f in sorted(glob.glob('sites/demo-*/galeria/*.webp')):
    d=open(f,'rb').read(); i=12; c=[]
    while i<len(d): n=struct.unpack('<I',d[i+4:i+8])[0]; c.append(d[i:i+4].decode()); i+=8+n+(n&1)
    print(f, c)"
```
