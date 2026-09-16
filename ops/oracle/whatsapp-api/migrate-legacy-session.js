'use strict';

const fs = require('fs');
const path = require('path');

const restaurantId = String(process.argv[2] || '').trim();
const RESTAURANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!RESTAURANT_ID_PATTERN.test(restaurantId)) {
  console.error('Uso: node migrate-legacy-session.js <restaurant_uuid>');
  process.exit(1);
}

const cwd = process.cwd();
const source = path.resolve(cwd, 'baileys_auth_info');
const root = path.resolve(cwd, process.env.WHATSAPP_RESTAURANT_SESSIONS_DIR || 'baileys_restaurant_sessions');
const destination = path.join(root, restaurantId);
const tempDestination = `${destination}.migrating-${Date.now()}`;

if (!fs.existsSync(source)) {
  console.error(`Sessao legacy nao encontrada em: ${source}`);
  process.exit(2);
}

if (fs.existsSync(destination)) {
  console.error(`A sessao do restaurante ja existe em: ${destination}`);
  process.exit(3);
}

fs.mkdirSync(root, { recursive: true, mode: 0o700 });

try {
  fs.cpSync(source, tempDestination, {
    recursive: true,
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
  });
  fs.renameSync(tempDestination, destination);
  fs.chmodSync(destination, 0o700);

  console.log('Sessao copiada com sucesso para o restaurante.');
  console.log(`Destino: ${destination}`);
  console.log('A pasta legacy foi preservada para rollback e nao foi removida.');
} catch (error) {
  try {
    fs.rmSync(tempDestination, { recursive: true, force: true });
  } catch {}

  console.error('Falha ao copiar a sessao legacy:', error?.message || error);
  process.exit(4);
}
