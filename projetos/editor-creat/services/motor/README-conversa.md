# Conversa com o editor (onda 1, plano "Fio Único")

Contrato completo: `docs/plano-conversa-25-11.md`, seção 13. Código: `motor/conversa/` e `motor/api/conversa.py`.

- **Ligada por padrão** quando existe a chave do cérebro (`EDITOR_ANTHROPIC_KEY`/`ANTHROPIC_API_KEY`). A chave da tela
  (`POST /v1/conversa {ligada}`) grava `<dados>/conversa.json`. `EDITOR_CONVERSA=0` desliga no servidor.
- **Teto de US$ 3 por dia**, travado no código (`EDITOR_CONVERSA_TETO_USD_DIA` só baixa), dia da Bahia, só linhas
  `conversa` do `gastos.jsonl`, pré-voo no pior caso antes de cada chamada. Custo de cada resposta em `turno_fim.custo_usd`.
- **Ações só com o toque**: `propor_ajuste` e `propor_pedido` criam um cartão; executam no `POST .../conversa/confirmar`
  com o mesmo `entrada_hash`, guarda de estado de novo, trava por projeto e decisão única.
- **SSE v2**: `GET /v1/projetos/{pid}/eventos?v=2` traz `rascunho`, `instantaneo` e `ping` sem id. `EDITOR_SSE_NOVO=0`
  serve o gerador antigo. `?sem=tipo1,tipo2` filtra no SQL (v1 e v2).
- **Voz**: `POST .../conversa/audio` transcreve com faster-whisper local num subprocesso (`nice -n 5`, 90 s, um por vez);
  devolve o texto e não envia nada. O áudio é apagado no fim.

## Travas da revisão (25/11)

- **Teto duro**: cada chamada reserva o pior caso antes de sair (soma das reservas dos outros turnos sob uma trava do
  processo) e o pior caso usa o preço mais alto entre o modelo e os de fallback do servidor (Opus 5 e 4.8); modelo fora
  da tabela vale o maior preço. Gasto que o livro não conseguiu gravar continua contando (memória) e a conversa para
  com "não consegui anotar o gasto". Chamada que cai no meio do stream, ou que o dono para, entra no livro estimada
  (errando para cima: tempo x 120 tokens/s, até 8000). Com fallback, o custo soma `usage.iterations`.
- **Fim do turno sob a trava do projeto**: a mensagem que chega enquanto o turno fecha abre turno novo (nunca fica
  "na fila" sem leitor), e o fechamento do histórico não cruza com o toque num cartão.
- **Cartão de ajuste**: diz "vale para TODOS os projetos". O dono pode tocar em "Só neste projeto" (não grava regra,
  checagem nem vocabulário). Se o texto repete 5 palavras seguidas de algo de fora lido no capítulo (fala de vídeo,
  texto de cliente: resultados `{"de_fora": ...}`), o cartão mostra o aviso e o ajuste vale só para este projeto.
  Com a conversa desligada, o toque em "Pedir o ajuste" responde 503 e o cartão fica para depois.
- **Voz**: o filho nasce com `oom_score_adj` 1000 e a API vigia a memória REAL do grupo a cada meio segundo
  (`EDITOR_VOZ_LIMITE_MB`, padrão 2048; medido: 0,75 GB residente). Passou do teto: o grupo morre e a resposta é 503
  "use o microfone do teclado". O teto virtual (`RLIMIT_AS`) saiu do padrão em 25/11: na hospedagem, com mais núcleos,
  4 GB virtuais não bastavam e todo áudio voltava "não entendi" (só existe com `EDITOR_VOZ_LIMITE_VIRTUAL_MB`).
  Threads do filho: até 4. Falha do filho vai para o log do servidor (`[voz] ...`). Ambiente por lista permitida. Áudio
  acima de 65 s volta 413 antes do Whisper (ffmpeg lê no máximo 75 s). Tempo esgotado mata o grupo (python e ffmpeg).
  Terceiro áudio na fila: 429. **O áudio do dono vive no máximo 10 minutos no disco**: `tmp/voz` é limpo no boot e a
  cada áudio novo.
- **Cérebro falso** é ignorado com `EDITOR_AMBIENTE=producao` (o `deploy/iniciar.sh` exporta) e o boot avisa no log
  quando ele está ativo.

## Privacidade e retenção (a decidir pelo dono)

- A conversa inteira (mensagens do dono, falas transcritas de vídeos, textos de clientes lidos pelas ferramentas,
  blocos de raciocínio) fica em `motor.db` (`conversa_msgs`, `conversa_capitulos`, `eventos`) e vai no backup do banco.
- Capítulos da conversa fechados há mais de `EDITOR_CONVERSA_RETENCAO_DIAS` (padrão 90; 0 = para sempre) têm as mensagens
  e os eventos da conversa apagados pelo worker, a cada 15 minutos. O capítulo aberto e as perguntas esperando resposta
  nunca são tocados. Os backups do Cloudflare guardam o banco por até 30 dias; as cópias já mandadas ao Dropbox ficam.
  (`motor/conversa/retencao.py`, chamado por `worker.limpezas`; `GET /v1/conversa` devolve `retencao_dias`.)
- As ferramentas mandam ao fornecedor de IA (Anthropic) até 12 falas de 600 letras por leitura do material. Falas de
  terceiros que aparecem nos vídeos vão junto. Conferir no console da Anthropic a retenção de dados da chave usada.
- **Revogar todos os aparelhos** (celular perdido): trocar `EDITOR_SEGREDO_SESSAO` nas variáveis da hospedagem e
  reiniciar. Toda sessão antiga deixa de valer na hora. O "Sair" do menu apaga do aparelho o texto guardado, a fila de
  mensagens e os áudios guardados (sessionStorage `ec-conversa-*` e IndexedDB `editor-conversa`).

Rodar localmente sem rede (cérebro falso, o mesmo dos testes e do aceite do site):

```bash
cd services/motor
EDITOR_CONVERSA_CEREBRO=falso uvicorn motor.api.app:criar --factory --port 8787
curl -s localhost:8787/v1/conversa
curl -s -XPOST localhost:8787/v1/projetos -H 'content-type: application/json' -d '{"nome":"teste"}'
curl -s -XPOST localhost:8787/v1/projetos/<pid>/conversa -H 'content-type: application/json' \
  -d '{"texto":"como está o projeto?","cliente_msg_id":"m_0000001"}'
curl -N "localhost:8787/v1/projetos/<pid>/eventos?v=2&ate=5"
```

Testes: `python -m pytest -q tests/test_conversa_laco.py tests/test_conversa_api.py tests/test_conversa_revisao.py` (sem rede, sem chave).
O teste pago A1.14 (API real, até US$ 1) só roda com o "pode" do dono e é o portão para publicar.

## Mesa ao vivo (onda 2)

Sem chamada nova ao Claude: o trabalho que o motor já faz fica visível.
- `motor/etapas/passos.py`: um passo raiz por job (aberto e fechado pelo `worker`), passos filhos nas etapas (`analise.transcricao`, `analise.visao`, `direcao.diretor|resolvedor|critico`, `montagem.fatos|voz|planos|overlay|mix|comp`, `qa.<checagem>`), cada um com ferramenta, modelo, esforço, tempo, tokens, custo, a conta escrita e o achado em números. Evento `passo` (fase em `dados.fase`; `estado` e `mensagem` nulos) e `decisao` (conceito, gancho, além do pedido, blocos, trilha, riscos e crítica).
- `cerebro/gastos.registrar` soma cada gasto no passo de dentro: a soma de `custo_usd` dos passos = o livro do projeto. O raiz leva `custo_total_usd`.
- Boot do worker, job pego de novo e job morto: passo aberto vira `interrompido` (nada fica pulsando). `instantaneo.passos_abertos` diz quem trabalha agora.
- Erro: `etapa_erro.mensagem` é uma frase em pt-BR ("A montagem da V1 parou (faltou memória na máquina); vou tentar de novo.") e o técnico vai em `dados.detalhe`. `etapa_inicio` ganhou mensagem ("Radar começou a ouvir e olhar o vídeo 2."). O aviso do arquivo de fora fala do vídeo pelo número e guarda o técnico à parte.
- Rótulos na tela: `packages/schemas/equipe.json` versão 2 (chaves raiz por etapa, Verbo em `montagem.fatos`, nomes das checagens do QA).
- Testes: `tests/test_mesa_ao_vivo.py` (A2.1, A2.2, A2.3, A2.6 e o resto, sem rede).

## Onda 3 (25/11): a conversa age em mais coisas, apagar projeto, regras no Caderno

Contrato: `docs/plano-onda3-25-11.md`. Tudo sem rede nos testes (`tests/test_onda3_*.py`).

- **Capítulo 2 da conversa**: `FERRAMENTAS_VERSAO = "2"`, `PROMPT_VERSAO = "nimbus-2"`, 13 ferramentas. Novas: `anotar`,
  `propor_refazer`, `propor_trilha` (com cartão e toque) e `onde_esta`, `ver_regras`, `ver_trilhas` (só leitura). Nenhuma
  ferramenta apaga nada; apagar projeto e apagar regra são botões da tela. Capítulo velho continua com as 7 dele até a
  próxima mensagem do dono, que abre o capítulo novo com ficha.
- **Cartões** (`conversa/acoes.CARTOES`): normalizar (vira o `entrada_hash`), guarda (ao criar e no toque), montar (texto
  do código) e executar. `propor_ajuste` e `propor_pedido` não mudaram de comportamento. Um cartão aberto por projeto.
- **Refazer uma etapa** (`motor/refazer.py`, uma guarda só para a tela e a conversa): montar, conferir ou entregar de novo
  a versão mais nova e ler de novo um vídeo que ficou de fora; a tela também refaz catálogo e direção. Só sobre o que
  falhou (conferir de novo em `reprovado_qa` só se a chave da conferência mudou). A guarda é lida de novo dentro do
  `BEGIN IMMEDIATE` que grava. Montar, conferir e entregar de novo gravam `correcoes_auto = 2` (se a conferência reprovar,
  o editor para; nada de direção paga escondida). "Entregar de novo" enfileira a conferência e nunca leva `publicar_em`.
  Rotas: `GET/POST /v1/projetos/{pid}/refazer`.
- **Trocar a música**: nova versão sem cérebro. Job `direcao` com `{"trocar_trilha": {"de", "trilha"}}` copia a direção
  da versão, troca `trilha.id` e roda só o resolvedor. Mesmos blocos e falas; os cortes andam até uma batida e a duração
  pode mudar (o cartão diz). A versão de origem continua entregue e aprovável. Custo da direção US$ 0 (`uso_N.json`).
- **Notas** (`anotar`): `projetos.dados.notas` (até 50), com cartão. Não refazem nada e não gastam. Voltam ao Nimbus
  como `de_fora` em `ver_projeto.notas`.
- **Apagar projeto** (`motor/apagar.py`, rotas `GET/POST /v1/projetos/{pid}/apagar` e `POST .../versoes/{v}/retirar`):
  só pela tela, com o nome digitado (sem caixa, espaços normalizados; acento conta). Recusa com a conversa respondendo,
  com qualquer job pendente ou rodando (de fundo inclusive) e com filme na página de entregas ("Tirar da página" primeiro).
  Ordem: diário em `<dados>/apagar/<pid>.json`, banco numa transação, arquivos em segundo plano; a varredura do worker
  limpa sobras por 7 dias. Ficam: `gastos.jsonl`, regras e casos, caches por conteúdo e backups. O id passa no formato
  antes de abrir o banco; link simbólico é apagado só como link; projeto que existe nunca é tocado pela limpeza.
- **Regras no Caderno** (`POST /v1/memoria/{regras|checagens|vocabulario}/{id}/apagar`): só o que nasceu de ajuste do dono.
  Vira lápide em `memoria/apagados.json` (no volume; fora do git), respeitada pela `Loja` e pelo `semear`. Reprovar de
  novo com o mesmo texto traz de volta. Apagar conferência recusa com `qa`/`entrega` rodando em qualquer projeto.
  Nenhuma dessas rotas enfileira job, mexe em versão ou emite evento. `GET /v1/memoria` ganhou, opcionais, `id`
  (vocabulário), `apagavel`, `de_onde` e `ao_apagar`.
- **Cérebro falso** (`EDITOR_CONVERSA_CEREBRO=falso`, só para teste): "tenta de novo" propõe refazer a primeira opção de
  `ver_projeto.pode.refazer`; "troca a música" propõe a primeira trilha fora de uso; "anota ..." guarda o resto da frase;
  "onde ..." procura no filme.
