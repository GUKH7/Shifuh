#!/usr/bin/env bash
set -euo pipefail

AUTH_DIR="${WHATSAPP_AUTH_DIR:-/home/ubuntu/whatsapp-api/baileys_auth_info}"
BACKUP_DIR="${WHATSAPP_BACKUP_DIR:-/home/ubuntu/backups/whatsapp-api}"
RETENTION_DAYS="${WHATSAPP_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d)"
ARCHIVE_TMP="${BACKUP_DIR}/.session-${TIMESTAMP}.tar.gz.tmp"
ARCHIVE_FINAL="${BACKUP_DIR}/session-${TIMESTAMP}.tar.gz"

cleanup() {
  rm -rf "$WORK_DIR"
  rm -f "$ARCHIVE_TMP"
}

trap cleanup EXIT

if [[ ! -d "$AUTH_DIR" ]]; then
  echo "WhatsApp auth directory not found: ${AUTH_DIR}" >&2
  exit 1
fi

install -d -m 700 "$BACKUP_DIR"
cp -a "$AUTH_DIR" "$WORK_DIR/baileys_auth_info"
tar -C "$WORK_DIR" -czf "$ARCHIVE_TMP" baileys_auth_info
chmod 600 "$ARCHIVE_TMP"
mv "$ARCHIVE_TMP" "$ARCHIVE_FINAL"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'session-*.tar.gz' \
  -mtime "+${RETENTION_DAYS}" -delete

echo "$ARCHIVE_FINAL"
