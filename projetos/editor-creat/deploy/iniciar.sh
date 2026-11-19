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
MOTOR_PORTA="${MOTOR_PORTA:-8787}"
export MOTOR_URL="http://127.0.0.1:${MOTOR_PORTA}" MOTOR_TOKEN="${MOTOR_TOKEN}" EDITOR_SEGREDO_SESSAO="${EDITOR_SEGREDO_SESSAO:-$EDITOR_SEGREDO_SESSAO_GERADO}" MOTOR_HOST=127.0.0.1
if [ -z "${EDITOR_SENHA_HASH:-}" ]; then
  : "${EDITOR_SENHA:?defina EDITOR_SENHA (a senha da casa, 10+ caracteres) nas variáveis da hospedagem}"
  EDITOR_SENHA_HASH="$(cd /app/projetos/editor-creat/apps/web && node scripts/gerar-senha.mjs "$EDITOR_SENHA" | sed -n 's/^EDITOR_SENHA_HASH=//p')"
  export EDITOR_SENHA_HASH
fi
unset EDITOR_SENHA
cd /app/projetos/editor-creat/services/motor
# A memória da casa (regras que o dono ensinou, casos aprovados, estudos de caso) mora no volume e sobrevive a cada deploy.
# A do git (imagem) é juntada a cada boot. Se a junção falhar, o motor sobe com a memória do git e avisa no log.
export EDITOR_MEMORIA="${EDITOR_MEMORIA:-$DADOS/memoria}"
python -m motor.memoria.semear || { echo "AVISO: não consegui juntar a memória no volume; usando a do repositório nesta subida" >&2; unset EDITOR_MEMORIA; }
EDITOR_BACKUP_AGENDAR=1 uvicorn motor.api.app:criar --factory --host 127.0.0.1 --port "$MOTOR_PORTA" --no-access-log &   # sem log de acesso: o caminho do link do cliente leva o token
for i in $(seq 1 60); do curl -fsS -o /dev/null -H "authorization: Bearer $MOTOR_TOKEN" "http://127.0.0.1:${MOTOR_PORTA}/v1/saude" && break; sleep 0.5; done   # banco criado antes dos workers
for i in $(seq 1 "${EDITOR_WORKERS:-2}"); do python -m motor.worker & done
cd /app/projetos/editor-creat/apps/web
npx next start -H 0.0.0.0 -p "${PORT:-3000}" &
wait -n
exit 1
