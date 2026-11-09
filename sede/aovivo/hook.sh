#!/usr/bin/env bash
# Gancho da Sede ao vivo: envia um evento curto para o banco em tempo real.
# Roda em segundo plano (async) e nunca atrapalha a sessão: sem configuração, sai na hora.
#   CREAT_AOVIVO_URL  = https://<projeto>.supabase.co   (variável do ambiente, não é segredo)
#   A chave secreta NÃO fica aqui: o proxy da nuvem injeta o cabeçalho `apikey` para esse host.
#   Fora da nuvem, defina CREAT_AOVIVO_KEY (chave sb_secret_...) no ambiente local.
[ -n "$CREAT_AOVIVO_URL" ] || exit 0
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINHA="$(python3 -I "$DIR/evento.py" 2>/dev/null)" || exit 0
[ -n "$LINHA" ] || exit 0
CHAVE=()
[ -n "$CREAT_AOVIVO_KEY" ] && CHAVE=(-H "apikey: $CREAT_AOVIVO_KEY")
curl -sS -m 5 -o /dev/null -X POST "${CREAT_AOVIVO_URL%/}/rest/v1/eventos" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' "${CHAVE[@]}" \
  --data-binary "$LINHA" >/dev/null 2>&1 || true
exit 0
