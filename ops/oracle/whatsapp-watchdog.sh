#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${WHATSAPP_PM2_SERVICE_NAME:-whatsapp-api}"
HEALTH_URL="${WHATSAPP_HEALTH_URL:-http://127.0.0.1:3001/health}"
PM2_BIN="${PM2_BIN:-/usr/bin/pm2}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"
LOGGER_BIN="${LOGGER_BIN:-/usr/bin/logger}"
ALERT_ENV_FILE="${WHATSAPP_ALERT_ENV_FILE:-/home/ubuntu/whatsapp-api/ops/alerts.env}"
STATE_FILE="${WHATSAPP_WATCHDOG_STATE_FILE:-/home/ubuntu/whatsapp-api/ops/.watchdog-state}"
HOST_LABEL="${WHATSAPP_ALERT_HOST_LABEL:-$(hostname)}"

if [[ -r "$ALERT_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ALERT_ENV_FILE"
  set +a
fi

previous_state="unknown"
if [[ -r "$STATE_FILE" ]]; then
  previous_state="$(<"$STATE_FILE")"
fi

save_state() {
  local next_state="$1"
  local temporary_file="${STATE_FILE}.tmp"

  printf '%s\n' "$next_state" > "$temporary_file"
  mv "$temporary_file" "$STATE_FILE"
}

send_telegram_alert() {
  local message="$1"

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    "$LOGGER_BIN" -t gestor-whatsapp-watchdog \
      "Telegram alert skipped because credentials are not configured."
    return 0
  fi

  "$CURL_BIN" --fail --silent --show-error --max-time 15 \
    --request POST \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" >/dev/null
}

if "$CURL_BIN" --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; then
  if [[ "$previous_state" == "unhealthy" ]]; then
    send_telegram_alert \
      "RECUPERADO: WhatsApp do Gestor Delivery voltou a responder em ${HOST_LABEL}." || true
  fi

  save_state "healthy"
  exit 0
fi

"$LOGGER_BIN" -t gestor-whatsapp-watchdog \
  "Health check failed for ${SERVICE_NAME}; restarting process."

"$PM2_BIN" restart "$SERVICE_NAME" --update-env >/dev/null
sleep 5

if ! "$CURL_BIN" --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; then
  "$LOGGER_BIN" -t gestor-whatsapp-watchdog \
    "Process ${SERVICE_NAME} is still unhealthy after restart."

  if [[ "$previous_state" != "unhealthy" ]]; then
    send_telegram_alert \
      "ALERTA: WhatsApp do Gestor Delivery continua indisponivel apos reinicio automatico em ${HOST_LABEL}. Verifique a Oracle e o PM2." || true
  fi

  save_state "unhealthy"
  exit 1
fi

"$LOGGER_BIN" -t gestor-whatsapp-watchdog \
  "Process ${SERVICE_NAME} recovered after restart."

if [[ "$previous_state" == "unhealthy" ]]; then
  send_telegram_alert \
    "RECUPERADO: WhatsApp do Gestor Delivery voltou apos reinicio automatico em ${HOST_LABEL}." || true
fi

save_state "healthy"
