#!/usr/bin/env bash
# Gancho da Sede ao vivo: envia um evento curto para o banco em tempo real.
# Roda em segundo plano (async) e nunca atrapalha a sessão: sem configuração, sai na hora.
#   CREAT_AOVIVO_URL  = https://<projeto>.supabase.co      (variável do ambiente, pública)
#   CREAT_AOVIVO_PUB  = sb_publishable_...                  (chave pública, pode ficar em variável)
#   Token dos ganchos: na nuvem, o proxy injeta o cabeçalho x-sede-token para esse host (segredo de rede).
#   Fora da nuvem: CREAT_AOVIVO_TOKEN no ambiente local (vai por stdin do curl, nunca na linha de comando).
# O token só permite INSERIR eventos: não lê, não apaga, não mexe em quem tem acesso.
[ -n "${CREAT_AOVIVO_URL:-}" ] && [ -n "${CREAT_AOVIVO_PUB:-}" ] || exit 0
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINHA="$(python3 -I "$DIR/evento.py" 2>/dev/null)" || exit 0
[ -n "$LINHA" ] || exit 0
{
  printf 'header = "apikey: %s"\n' "$CREAT_AOVIVO_PUB"
  [ -n "${CREAT_AOVIVO_TOKEN:-}" ] && printf 'header = "x-sede-token: %s"\n' "$CREAT_AOVIVO_TOKEN"
  printf 'data-binary = "@%s"\n' "/dev/fd/3"
} | curl -sS -m 5 -o /dev/null -X POST "${CREAT_AOVIVO_URL%/}/rest/v1/eventos" \
      -H 'Content-Type: application/json' -H 'Prefer: return=minimal' --config - 3<<<"$LINHA" >/dev/null 2>&1 || true
exit 0
