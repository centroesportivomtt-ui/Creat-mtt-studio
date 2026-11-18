# Frente B — direção, schemas e memória da casa

O Claude só **decide**: lê um catálogo compacto do material e devolve uma direção em JSON (ids do catálogo, até 4 000 tokens). Todo o resto é código da casa, sem IA e sem custo: o resolvedor transforma a direção no EDL que a frente C monta.

```
análises (frente A) ─► catalogo ─► catalogo.json + catalogo.txt (≤ 15k tokens)
                                         │
pedido (API) + memória (regras, casos) ──┴► diretor (cérebro) ─► resolvedor ─► crítico ─► resolvedor ─► saidas/<p>/v<n>/edl.json
reprovação do dono (API) ─► regra + checagem + vocabulário ─► próxima direção
```

## Como rodar

```bash
cd services/motor
nice -n 5 python -m motor.ferramentas.aceite_b          # aceite completo (material de 17/11; sem ele usa o exemplo sintético)
python -m pytest -q -m "not pago" tests/test_b_*.py      # testes da frente
python -m motor.ferramentas.cat_legado                   # só converte o material de 17/11 em análises (EDITOR_DADOS)
uvicorn motor.api.app:criar --factory --port 8787        # API (rotas da frente B abaixo)
```

Cérebro padrão é `fixture` (sem custo). Para o Claude de verdade: `pip install 'editor-motor[cerebro]'`, `EDITOR_CEREBRO=anthropic` e `ANTHROPIC_API_KEY`. O teste pago (`tests/test_b_pago.py`) ainda exige `EDITOR_AUTORIZADO_PAGO=1`, ou seja, a autorização do dono.

## Arquivos

| arquivo | o que faz |
|---|---|
| `motor/etapas/catalogo.py` | `@etapa("catalogo")` e `montar(analises, pedido, projeto)`. Junta segmentos em falas de até 14 s, numera `C/M/F` e escreve o texto em 9 níveis de compressão até caber no orçamento. Falas de MARCOS, RUAN e XANDE, e falas com palavra distintiva do pedido, ficam sempre inteiras. |
| `motor/etapas/resolvedor.py` | `resolver(direcao, catalogo, analises, modelo, trilhas)`. Acha as falas por `de/ate` com busca aproximada (pode seguir para as falas seguintes). Aplica folga, aperto de pausas acima de 0,28 s e encaixe por energia, e põe os blocos na batida. Gera planos (a cobertura recorta o falante; enquadre pelo rosto; estabilização, cor e desfoque vindos da análise), legendas (só palavra dita com confiança ≥ 0,5 ou confirmada), tom de sala em vão sem fala, motion do kit, fx, sfx e trilha. `ErroResolucao.problemas` volta para o cérebro. |
| `motor/etapas/direcao.py` | `@etapa("direcao")` e `dirigir_e_resolver(...)`. Sequência: prompt, diretor, resolvedor, crítico, EDL. Grava `projetos/<p>/direcao_<n>.json`, `uso_<n>.json` (tokens, custo e checagens) e `saidas/<p>/v<n>/edl.json`. É idempotente por entrada. |
| `motor/etapas/armazem_b.py` | Acesso ao armazenamento: usa o provedor da frente A ou a pasta local, sempre com gravação atômica. Também lê a biblioteca de trilhas. |
| `motor/cerebro/fixture.py` | Devolve direções gravadas. Usa o primeiro caso em `memoria/casos/*/direcao.json` cujos ids existam todos no catálogo. |
| `motor/cerebro/anthropic_api.py` | Direção e crítica em `claude-opus-5-5` (thinking adaptativo, `effort` high na direção e medium na crítica, streaming, structured outputs, `fallbacks: "default"`), com sistema e catálogo em cache. As tarefas leves vão para `claude-haiku-5-5`. |
| `motor/cerebro/orcamento.py` | Estimativa de tokens (len/3,5), preços e custo por chamada. |
| `motor/cerebro/prompts/` | `diretor.md` (sistema, com `{regras}`, `{modelos}` e `{casos}`) e `critico.md`. |
| `motor/memoria/loja.py` | Regras, vocabulário, checagens, modelos e casos. `registrar_reprovacao()` e `avaliar_edl()`: o QA da frente C chama esta última para as checagens com `executor: "edl"`. |
| `motor/api/direcao.py` | `POST /v1/projetos/{id}/pedido`, `POST /v1/projetos/{id}/versoes/{v}/reprovar` e `GET /v1/memoria`. |
| `motor/ferramentas/cat_legado.py` | Converte `drako/cat.json`, `trs/` e `seg/indice.json` em análises válidas, com energia medida pelo áudio. |
| `memoria/` (raiz do projeto) | `regras.json` (17 regras e vocabulário da marca), `checagens.json`, `modelos/*.json` (4 modelos de vídeo) e `casos/bastidor-creat-2026-11-17/`. |

## Contratos que mudaram (dona: frente B)

- `direcao.blocos[].falas[].corrigir` virou uma lista de pares `[{de, para}]`. Os structured outputs não aceitam objeto com chaves livres.
- `analise.derivados.trechos` (opcional) diz quais trechos do original existem. É o caso do material legado, que veio cortado em `seg/`. A regra é `tempo_fonte = ini + tempo_no_arquivo`.
- As fontes do EDL ficam assim: `C05`, ou `C05_<k>` quando o clipe tem vários trechos. O `offset` é o `ini` do trecho.

## Para a frente C

- Os nomes em `sfx[].som` são as chaves do `MAPA` de `packages/kit/ferramentas/som.cjs`: abre, risco, chip, embaralha, whip, mascara, impacto, cta.
- `motion[]` usa os modelos do kit: gancho, chip, rotulo, transicao, fecho. A legenda vem em `legendas` (modelo `legenda`).
- `qa.logos` aponta a logo do fecho, e `qa.riscos` traz os riscos da direção junto com os avisos do resolvedor.
- Checagens da memória: `Loja().checagens()` com `executor` em `qa` ou `edl`, e `Loja().avaliar_edl(edl)`.

## Limites conhecidos

- O material legado não tem rostos nem telas detectados, então o enquadre fica no centro e o desfoque depende de `riscos`. As análises da frente A trazem esses sinais.
- A legenda descarta as palavras de confiança < 0,5 do whisper-small de 17/11, e isso abre buracos ("é sobre criando"). A regra do dono pede isso mesmo; a solução é transcrever melhor (frente A, modelo turbo) ou a direção usar `corrigir`.
- O crítico com o fixture não muda nada; o crítico de verdade só roda com a API.
