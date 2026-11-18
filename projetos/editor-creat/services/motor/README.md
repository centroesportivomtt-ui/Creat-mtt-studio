# services/motor — motor do Editor creat.MTT

Fila de jobs (SQLite WAL com aluguel) e etapas `ingest → analise → catalogo → direcao → montagem → qa → entrega`.

```bash
cd services/motor
pip install -e '.[transcricao,teste]'          # cerebro/r2/parakeet/voz são extras opcionais
export EDITOR_DADOS=/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/editor-dados
nice -n 5 python -m pytest -q -m "not pago"    # núcleo + frentes
nice -n 5 python -m motor.worker               # worker (vários podem rodar juntos)
uvicorn motor.api.app:criar --factory --port 8787
```

Pronto (núcleo do arquiteto): `config.py`, `banco.py`, `pipeline.py`, `worker.py`, `etapas/__init__.py` (registro `@etapa`), `provedores/base.py` (interfaces), `provedores/__init__.py` (fábrica), `api/app.py`.
Cada frente acrescenta seus módulos (lista em `ARQUITETURA.md` §11). Provedor pago sem chave cai no local sozinho.
