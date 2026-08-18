#!/usr/bin/env bash
set -euo pipefail

WHATSAPP_PORT="${WHATSAPP_PORT:-3001}"
ECONOAPP_PORT="${ECONOAPP_PORT:-3002}"
HTTPS_PORT="${HTTPS_PORT:-443}"

if ! command -v ufw >/dev/null 2>&1; then
  echo "UFW nao encontrado. Aplique regras equivalentes no firewall da VM e no NSG/Security List do OCI." >&2
  exit 1
fi

STATUS="$(sudo ufw status | head -n 1 || true)"
if [[ "$STATUS" != "Status: active" ]]; then
  echo "UFW esta inativo. Configure primeiro uma regra SSH segura e habilite o firewall; o script nao o ativa automaticamente para evitar perda de acesso." >&2
  exit 2
fi

sudo ufw deny "${WHATSAPP_PORT}/tcp"
sudo ufw deny "${ECONOAPP_PORT}/tcp"
sudo ufw allow "${HTTPS_PORT}/tcp"

echo "Regras aplicadas. Confirme tambem no OCI NSG/Security List: somente HTTPS ${HTTPS_PORT} deve expor a API; ${WHATSAPP_PORT} e ${ECONOAPP_PORT} devem permanecer sem ingress publico."
sudo ufw status verbose
