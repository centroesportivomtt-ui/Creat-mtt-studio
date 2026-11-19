#!/usr/bin/env bash
# Sobe motor (API), worker(s) e site no mesmo contêiner. Se um cair, o contêiner sai e a hospedagem reinicia.
# O dono só precisa definir: EDITOR_SENHA (a senha da casa), EDITOR_ANTHROPIC_KEY e EDITOR_CEREBRO=anthropic.
# Os segredos internos (token motor<->site, segredo da sessão) são gerados no primeiro boot e guardados em /dados.
set -euo pipefail
DADOS="${EDITOR_DADOS:-/dados}"; mkdir -p "$DADOS"; chmod 700 "$DADOS"
SEG="$DADOS/.segredos"
if [ ! -f "$SEG" ]; then
  umask 077
  { echo "MOTOR_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n')"; echo "EDITOR_SEGREDO_SESSAO_GERADO=$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n')"; } > "$SEG"
fi
set -a; . "$SEG"; set +a
export MOTOR_TOKEN="${MOTOR_TOKEN}" EDITOR_SEGREDO_SESSAO="${EDITOR_SEGREDO_SESSAO:-$EDITOR_SEGREDO_SESSAO_GERADO}" MOTOR_HOST=127.0.0.1
if [ -z "${EDITOR_SENHA_HASH:-}" ]; then
  : "${EDITOR_SENHA:?defina EDITOR_SENHA (a senha da casa, 10+ caracteres) nas variáveis da hospedagem}"
  EDITOR_SENHA_HASH="$(cd /app/projetos/editor-creat/apps/web && node scripts/gerar-senha.mjs "$EDITOR_SENHA" | sed -n 's/^EDITOR_SENHA_HASH=//p')"
  export EDITOR_SENHA_HASH
fi
unset EDITOR_SENHA
cd /app/projetos/editor-creat/services/motor
uvicorn motor.api.app:criar --factory --host 127.0.0.1 --port 8787 &
for i in $(seq 1 "${EDITOR_WORKERS:-2}"); do python -m motor.worker & done
cd /app/projetos/editor-creat/apps/web
npx next start -H 0.0.0.0 -p "${PORT:-3000}" &
wait -n
exit 1
