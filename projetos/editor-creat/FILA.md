# Fila única do Editor creat.MTT

Uma lista só para todas as sessões que trabalham no editor (branch `claude/editor-creat`, publicada sozinha no Railway).
Motivo: em 19/11 duas sessões fizeram as mesmas três checagens ao mesmo tempo e precisaram de várias junções manuais.

## Combinado entre as sessões (vale para todas)
1. **Antes de começar:** `git pull` na branch, ler esta fila e pegar o primeiro item **livre**.
2. **Reservar:** trocar `livre` por `em andamento · <id curto da sessão> · <data hora>` e dar push SÓ dessa linha, já. Se o push
   for recusado, outra sessão reservou antes: puxe e escolha outro item.
3. **Trabalhar** e, antes de cada push: puxar, juntar, rodar `cd services/motor && python -m pytest -q -m "not pago"` e
   `cd apps/web && pnpm install && pnpm tipos && pnpm aceite`. Nunca publicar com teste vermelho.
4. **Fechar:** marcar `feito · <commit> · <data>` e anotar o detalhe no fim do `PROGRESSO.md`.
5. Reserva parada há mais de 6 horas sem commit pode ser assumida por outra sessão (deixar uma linha dizendo isso).
6. Decisão que só o dono pode tomar: escrever em **Precisa do dono** abaixo, com o link exato da tela.

## Fila do dono (ordem dele, 19/11)
| item | o quê | estado |
|---|---|---|
| A | backup diário para o Dropbox | feito · 8024537 · destino criado em 19/11 (falta o dono colar o link na tela Backup) |
| B | memória do servidor de volta ao git | feito em parte · 51fcc19 (memória no volume) + backup leva `editor-memoria-*.json`; falta a rotina que lê o backup e versiona |
| C | revisão com olho de IA antes de entregar | feito · 51fcc19 · segura a entrega desde 19/11 |
| D | checagens de fala (cortada, voz de fora, cobertura) | feito · c9e2b1e (integração das duas sessões) |
| E | biblioteca de trilhas e efeitos com licença | feito · bb750bd · efeitos da casa (Sonniss GDC) no kit; **trilhas: licença com ressalva, ver Precisa do dono** |
| D2 | réguas de fala, rodada 2 (dados reais da Lavínia, 19/11): voz distante abaixo do limiar vira tom < ~170 Hz contra a principal; falso positivo em consoante sonora (≥180 ms e tom fora de ±25%); início no meio de palavra da mesma voz (< 150 ms antes do s0) | em andamento · 01LA2wrM · 20/11 |
| F | link de aprovação para o cliente | feito · 7ab6ddc · 19/11 |
| G | agendar o post aprovado pelo Metricool | livre (precisa do dono: token do Metricool na hospedagem) |
| H | painel de gastos do mês | feito · 90781ea |

## Mapa original (depois da fila do dono)
| item | o quê | estado |
|---|---|---|
| 1 | cor no estilo DaVinci | feito · 3713eda |
| 2 | rastreamento e máscara de pessoa | livre |
| 3 | limpeza de voz por IA | livre |
| 4 | rótulo de quem fala (voz + rosto) | em parte: assinatura de voz pronta (etapas/falante.py); falta o rosto e a análise |
| 5 | Drive e Dropbox direto no editor | livre |
| 6 | cenas por IA com custo à vista | livre |
| 7 | perguntas em camadas | livre |
| 8 | motion premium | livre |
| 9 | tela Novidades | livre |

## Precisa do dono
- Colar o link do backup na tela: https://creat-mtt-studio-production.up.railway.app/caderno#backup (link na conversa de 19/11; não fica no repositório).
- Trilhas: as 3 do ElevenLabs (plano Creator) estão no Dropbox (`/Creat.MTT Studio/creat.MTT/Kit de edição/Trilhas/`), mas os termos de música (09/10/2026) dizem Creator = "For Individual Use Only" e proíbem montar biblioteca de músicas com o que se gera. Uso comercial online, inclusive anúncio pago, é permitido; agência para cliente não está definido. Por isso NÃO entraram na biblioteca da casa. Caminhos: (a) a creat passa a gerar no plano Scale (empresa com menos de 10 pessoas); (b) e-mail à ElevenLabs confirmando o Creator para cliente; (c) biblioteca paga com licença de agência. Fonte: elevenlabs.io/music-terms.
