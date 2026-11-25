# Relay da Sede ao vivo

A página https://claude.ai/artifact/1S1NRGsRoxt2maUp1f32KS mostra o documento `sede/estado` do banco dela e se redesenha sozinha no instante em que esse documento muda. O conector Claude Code Remote não carrega dentro de páginas, então uma sessão do Claude alimenta esse documento.

Pasta de trabalho: um diretório temporário, aqui chamado de `$R` (por exemplo, o scratchpad da sessão).

## Uma rodada

1. `list_sessions` com `limit: 10`. Grave em `$R/sessoes.json`, no formato `{"ccr":{"data":[...]}}`, só os campos `id`, `title`, `session_status`, `status_bucket`, `updated_at`, `task_summary` e `post_turn_summary`. Deixe de fora as sessões concluídas há mais de 3 dias.
2. Para cada sessão com `status_bucket` igual a `SESSION_STATUS_BUCKET_WORKING` (até 4), chame `list_events` com `kinds: ["system","rate_limit_event"]` e `limit: 12`.
   - Se o resultado vier salvo em arquivo, porque é grande, use esse caminho.
   - Se vier na resposta, pule essa sessão nesta rodada. O fluxo dela continua na tela, pela leitura anterior.
3. Monte o documento:
   `python3 -I sede/relay/montar.py --sessoes $R/sessoes.json --eventos <arquivos> --titulo <título de cada sessão, na mesma ordem> --anterior $R/estado.json --saida $R/novo.json`
   Depois, `mv $R/novo.json $R/estado.json`.
4. Grave com `ArtifactData`: ação `set`, `url` da página, `collection: "sede"`, `doc_id: "estado"`, `file_path: $R/estado.json` e `if_version` igual à última versão. Cada gravação devolve a versão nova.
   - Se a gravação falhar por versão, leia o documento com `get` e repita com a versão atual.
