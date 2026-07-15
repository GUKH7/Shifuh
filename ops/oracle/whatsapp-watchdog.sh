#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${WHATSAPP_PM2_SERVICE_NAME:-whatsapp-api}"
HEALTH_URL="${WHATSAPP_HEALTH_URL:-http://127.0.0.1:3001/health}"
PM2_BIN="${PM2_BIN:-/usr/bin/pm2}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"
LOGGER_BIN="${LOGGER_BIN:-/usr/bin/logger}"

if "$CURL_BIN" --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; then
  exit 0
fi

"$LOGGER_BIN" -t gestor-whatsapp-watchdog \
  "Health check failed for ${SERVICE_NAME}; restarting process."

"$PM2_BIN" restart "$SERVICE_NAME" --update-env >/dev/null
sleep 5

if ! "$CURL_BIN" --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; then
  "$LOGGER_BIN" -t gestor-whatsapp-watchdog \
    "Process ${SERVICE_NAME} is still unhealthy after restart."
  exit 1
fi

"$LOGGER_BIN" -t gestor-whatsapp-watchdog \
  "Process ${SERVICE_NAME} recovered after restart."
