#!/usr/bin/env bash
set -euo pipefail

RESTAURANT_ID="${1:-}"
APP_DIR="${WHATSAPP_APP_DIR:-/home/ubuntu/whatsapp-api}"
SOURCE_DIR="${WHATSAPP_AUTH_DIR:-${APP_DIR}/baileys_auth_info}"
SESSIONS_ROOT="${WHATSAPP_RESTAURANT_SESSIONS_DIR:-${APP_DIR}/baileys_restaurant_sessions}"
BACKUP_DIR="${WHATSAPP_BACKUP_DIR:-/home/ubuntu/backups/whatsapp-api}"
PM2_PROCESS="${WHATSAPP_PM2_PROCESS:-whatsapp-api}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_DIR="${SESSIONS_ROOT}/${RESTAURANT_ID}"
LEGACY_ARCHIVE_DIR="${APP_DIR}/baileys_auth_info.migrated-${TIMESTAMP}"
BACKUP_ARCHIVE="${BACKUP_DIR}/pre-tenant-migration-${RESTAURANT_ID}-${TIMESTAMP}.tar.gz"
TEMP_TARGET="${SESSIONS_ROOT}/.${RESTAURANT_ID}.tmp-${TIMESTAMP}"
PM2_WAS_STOPPED=0

UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'

fail() {
  echo "ERRO: $*" >&2
  exit 1
}

rollback_on_error() {
  local exit_code=$?
  if [[ $exit_code -eq 0 ]]; then
    return
  fi

  echo "Falha durante a migracao. Tentando restaurar a sessao original..." >&2
  rm -rf "$TEMP_TARGET"

  if [[ ! -d "$SOURCE_DIR" && -d "$LEGACY_ARCHIVE_DIR" ]]; then
    mv "$LEGACY_ARCHIVE_DIR" "$SOURCE_DIR" || true
  fi

  if [[ $PM2_WAS_STOPPED -eq 1 ]]; then
    WHATSAPP_LEGACY_SESSION_ENABLED=true pm2 restart "$PM2_PROCESS" --update-env >/dev/null 2>&1 || true
  fi

  exit "$exit_code"
}
trap rollback_on_error ERR

[[ "$RESTAURANT_ID" =~ $UUID_RE ]] || fail "Informe um restaurant_id UUID valido como primeiro argumento."
[[ -d "$APP_DIR" ]] || fail "Diretorio da API nao encontrado: $APP_DIR"
[[ -d "$SOURCE_DIR" ]] || fail "Sessao WhatsApp atual nao encontrada: $SOURCE_DIR"
[[ -f "$SOURCE_DIR/creds.json" ]] || fail "creds.json nao encontrado na sessao atual; migracao cancelada."
[[ ! -e "$TARGET_DIR" ]] || fail "A loja ja possui uma sessao em $TARGET_DIR. Nada foi alterado."
[[ ! -e "$LEGACY_ARCHIVE_DIR" ]] || fail "Diretorio de rollback ja existe: $LEGACY_ARCHIVE_DIR"
command -v pm2 >/dev/null 2>&1 || fail "PM2 nao encontrado."

if ! pm2 describe "$PM2_PROCESS" >/dev/null 2>&1; then
  fail "Processo PM2 nao encontrado: $PM2_PROCESS"
fi

install -d -m 700 "$BACKUP_DIR" "$SESSIONS_ROOT"

echo "1/6 Criando backup privado da sessao atual..."
tar -C "$(dirname "$SOURCE_DIR")" -czf "$BACKUP_ARCHIVE.tmp" "$(basename "$SOURCE_DIR")"
chmod 600 "$BACKUP_ARCHIVE.tmp"
mv "$BACKUP_ARCHIVE.tmp" "$BACKUP_ARCHIVE"

echo "2/6 Parando somente o processo $PM2_PROCESS..."
pm2 stop "$PM2_PROCESS" >/dev/null
PM2_WAS_STOPPED=1

echo "3/6 Copiando credenciais para a sessao exclusiva do restaurante..."
cp -a "$SOURCE_DIR" "$TEMP_TARGET"
[[ -f "$TEMP_TARGET/creds.json" ]] || fail "Copia da sessao ficou incompleta."
chmod 700 "$TEMP_TARGET"
mv "$TEMP_TARGET" "$TARGET_DIR"

echo "4/6 Arquivando a antiga pasta global para impedir socket duplicado..."
mv "$SOURCE_DIR" "$LEGACY_ARCHIVE_DIR"

echo "5/6 Reiniciando a API em modo somente por restaurante..."
WHATSAPP_LEGACY_SESSION_ENABLED=false \
WHATSAPP_RESTAURANT_SESSIONS_DIR="$SESSIONS_ROOT" \
pm2 restart "$PM2_PROCESS" --update-env >/dev/null
PM2_WAS_STOPPED=0

sleep 3

echo "6/6 Validando processo e estrutura migrada..."
pm2 describe "$PM2_PROCESS" >/dev/null 2>&1 || fail "Processo PM2 nao voltou apos a migracao."
[[ -f "$TARGET_DIR/creds.json" ]] || fail "Sessao tenant nao encontrada apos o restart."

trap - ERR

cat <<EOF
Migracao concluida com seguranca.
Restaurante: ${RESTAURANT_ID}
Sessao ativa: ${TARGET_DIR}
Backup compactado: ${BACKUP_ARCHIVE}
Rollback local: ${LEGACY_ARCHIVE_DIR}
Sessao global: desativada no PM2

Agora valide a rota /restaurants/${RESTAURANT_ID}/status antes de ativar o novo Auth Hook.
EOF
