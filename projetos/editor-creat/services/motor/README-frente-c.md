# Frente C — montagem e QA

A frente C transforma o EDL em vídeo final sem LLM e sem escrever código por vídeo. Depois, confere o resultado e só entrega se o QA aprovar. Ela reaproveita o pipeline que o dono aprovou em 17/11 (V2: `planos.py`, `voz_build.py`, `mix.py` e `comp.py`; V1: `shot.py`, `trilha2.py` e `fx.py`), agora em forma de biblioteca e sem nenhum caminho fixo.

## Como rodar

```bash
cd services/motor
export EDITOR_DADOS=/tmp/.../editor-dados          # dados fora do git
nice -n 5 python -m motor.ferramentas.aceite_c       # aceite completo (cerca de 3 min; --rapido pula o material real)
python -m pytest -q -m "not pago" tests/test_c_*.py  # testes da frente (cerca de 20 s)
python -m motor.ferramentas.edl_legado <drako>/V2/edl.json --janela 0 8 --render /tmp/saida   # filme real -> trecho
python -m motor.worker --etapas montagem,qa,entrega  # etapas na fila
```

O kit precisa de `gsap` e `three` em `packages/kit/node_modules`: `cd packages/kit && npm install --no-save gsap@3.12.5 three@0.160.0`. Ele também precisa do Playwright com o `chromium_headless_shell` (já existe em `/opt/pw-browsers`).

## Peças

| arquivo | o que faz |
|---|---|
| `etapas/montagem/__init__.py` | `@etapa("montagem")` e `montar(edl, trabalho, fontes, cfg, janela=)`. Planos, motion e áudio rodam em paralelo; depois vem a composição. É idempotente pelo hash do EDL. |
| `montagem/planos.py` | Renderiza cada plano em 1080x1920 a partir do trecho usado do 4K, com **uma decodificação só**. Mede o tremor de cada plano e estabiliza (LK + caminho suave, correção limitada à margem, zoom extra automático de até 16%). Aplica cor por ambiente (tabela COR), lê a faixa de cor real do arquivo (o iPhone grava `yuvj420p` em faixa cheia; o V2 esmagava os pretos), faz desfoque de telas, flash, tremor e rampa. O cache é por hash. |
| `montagem/voz.py` | Monta as peças de fala: −17 LUFS por fonte, cadeia leve de 17/11, atempo e emendas com crossfade. A limpeza com IA (DeepFilterNet, moderada) entra se `deepfilternet` estiver instalado. |
| `montagem/trilha.py` | Emendas da trilha por trecho (o acorde final cai na logo), laço na batida e SFX da biblioteca `MK_SOM`. Sem a biblioteca, sintetiza SFX determinísticos para não parar. |
| `montagem/mix.py` | Ducking lento pelo envelope da voz, folga extra (a voz fica ≥ 9 dB acima da cama na banda da fala), tom de sala só do trecho do EDL + piso a −66 dB, −14 LUFS e limitador de pico real. Gera os stems voz, trilha, sfx, direto e ambiente. |
| `montagem/overlay.py` | Junta `motion[]` e `legendas` numa cena do kit e renderiza a sequência PNG por beginFrame com N workers. Quadro repetido vira link físico. |
| `montagem/fx.py` | whip, flash, impacto, zoomt, bloom, leak, rush, gagueira, foto, fade e o mergulho da aba71/máscara. Só mexe nos quadros dentro da janela do efeito. |
| `montagem/comp.py` | Planos + FX + overlay, codificados com o áudio numa passada (x264 veryfast, grão leve, AAC 48 kHz, faststart). |
| `etapas/qa/` | `@etapa("qa")` e `conferir()` com 14 checagens, uma por arquivo (lista abaixo). Uma checagem que quebra conta como reprovação. |
| `etapas/entrega.py` | Só entrega com QA aprovado **e** sha256 do final igual ao conferido. Gera capa, legenda do post (vem do EDL, sem LLM), link e publicação pelo provedor, e limpa os intermediários. |
| `provedores/render_cpu.py` · `render_modal.py` · `publicacao.py` | `render_cpu` é o padrão. `render_modal` (GPU, pago) e Metricool/Meta ficam desligados sem chave e não estão implementados nesta fase: falham com mensagem clara. |
| `api/versoes.py` | `GET /v1/projetos/{id}/versoes` devolve link, capa, QA resumido (falhas e avisos), legenda do post e tempos. `POST .../{v}/publicar` publica só versão entregue com QA aprovado. A entrada é validada na borda. |
| `ferramentas/edl_legado.py` | Converte V1 e V2 de 17/11 para o EDL novo; os dois saem válidos no schema. O que não foi convertido fica em `origem.pendencias`. |
| `ferramentas/sintetico_c.py` · `aceite_c.py` | Mídia sintética: testsrc2 4K em retrato (com tremor) e em paisagem, trilha em batida, tom de sala e logo de 300 px. A voz vem do clipe real, se ele existir. |
| `packages/kit/ferramentas/render.cjs` + `comum.cjs` | Captura `HeadlessExperimental.beginFrame` no chrome-headless-shell (`MK_BF=0` volta ao screenshot), `--workers N` com índice global, `--json` com as estatísticas. `som.cjs` usa só `MK_SOM`. |

## Checagens do QA (todas bloqueiam, exceto a marcada)

| checagem | o que confere |
|---|---|
| `formato` | 1080x1920 (o tamanho do EDL), 30 fps, H.264 High, yuv420p, AAC 48 kHz e faststart (lido nos átomos do MP4) |
| `duracao` | tamanho do EDL, com tolerância de 1 quadro |
| `sincronia` | duração do áudio igual à do vídeo; o áudio do final correlacionado com o mix tem desvio ≤ 1 quadro |
| `lufs` | −14 ± 0,5, medido no áudio do **arquivo final**, depois do AAC |
| `true_peak` | ≤ −1 dBTP, com sobreamostragem 4x |
| `quadros_pretos` | `blackdetect` acusa trecho preto fora de fade ou íris |
| `zona_segura` | alfa real do overlay só com camadas de texto no ar; topo 285, base 440, direita 120, esquerda 60 px, tolerância de 16 px; evidência com a zona desenhada |
| `legenda_x_fala` | cada palavra da legenda cai dentro de uma peça de voz, e ≥ 70% delas são ouvidas na transcrição do mix (±1 s) |
| `frase_repetida` | frase de 3 palavras repetida 3 vezes no mix além do roteiro, ou 2 vezes nos stems sem voz (ambiente, direto); os stems são transcritos com nível normalizado |
| `tom_sala_sem_voz` | stem de ambiente transcrito com ≥ 3 palavras, ou trecho que cruza uma peça de voz |
| `logo_100` | largura em tela ÷ largura do arquivo ≤ 1,15 (SVG passa); salva o quadro a 100% como evidência |
| `legenda_sobre_rosto` | **aviso, não bloqueia:** YuNet da frente A, 2 amostras por segundo onde há legenda |
| `telas_desfocadas` | nitidez dentro das caixas `desfocar` ≤ 50% da do resto do quadro |
| `regra_memoria` | checagens do `memoria/checagens.json` cujo executor é o EDL (legenda proibida, fecho com @, vazio máximo...) |

## Medido nesta máquina (4 vCPU divididas com as outras frentes, carga de 4 a 8)

- **Aceite: 31/31 ok em 190 s.** Já inclui pytest (32 testes), os negativos e o trecho real.
- Sintético de 10 s pela fila (montagem → QA → entrega): 39 s. A montagem levou 25 s com os planos em cache e cerca de 48 s a frio. Voz 1,5 s, mix 2,0 s, overlay 14,6 s, composição 10,6 s, QA 13 s.
- Planos HEVC 4K reais (0948_57, estabilizado): **142 ms/quadro**, contra 216 ms/quadro com duas decodificações (o padrão do V2). O 4K sintético H.264 de paisagem sem estabilização ficou entre 226 e 365 ms/quadro com a máquina disputada.
- Trecho de 0 a 8 s do V2 a frio: 75 s no total (planos 45 s, overlay 25 s, voz 46 s em paralelo, mix 17 s sobre o filme inteiro de 111 s, composição 12 s).
- **Overlay:** 42,9 ms/quadro efetivos com 3 workers no sintético de 300 quadros (103 ms em cada worker; 154 quadros repetidos viraram link). No V2, 48,7 ms efetivos e 116 ms por worker. O render antigo (screenshot, 1 worker) ficou em 185 ms/quadro. Meta ≤ 130 ms: **cumprida**.

## Limites conhecidos (fase 1)

- Janelas-aba (PiP) do V2 ainda não são renderizadas; o campo `planos[].janela` é ignorado.
- O desfoque de tela por detecção (o modo `tela` do V2: celular, QR, nome) não foi convertido. Só valem as caixas do EDL.
- No V1 ficaram de fora o texto atrás da pessoa (matte), `dim`, `blur` e `blend`, e o overlay (o V1 gerava pelo ov.py, sem cena do kit).
- DeepFilterNet não está instalado nesta máquina, então a voz passa só pela cadeia leve. Instale com `pip install editor-motor[voz]` para ter a limpeza com IA moderada.
- A voz chama o ffmpeg 2 vezes por peça. No V2 (53 peças) isso dá 12 a 46 s; dá para cair para menos de 5 s com uma decodificação por fonte.
- O mix de um trecho processa o filme inteiro (o loudness é do filme todo).
- Render em GPU (Modal) e publicação (Metricool/Meta) existem só como interface: precisam de autorização do dono e ficam para a Fase 2/3.
