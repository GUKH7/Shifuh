'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  createRateLimiter,
  requireToken,
  validateStartupConfiguration,
} = require('./security');

test('recusa iniciar sem token principal', () => {
  assert.throws(
    () => validateStartupConfiguration({
      mainApiToken: '',
      bindHost: '127.0.0.1',
    }),
    /nao configurado/i,
  );
});

test('recusa qualquer bind publico, mesmo com antigo opt-in informado', () => {
  assert.throws(
    () => validateStartupConfiguration({
      mainApiToken: 'secret',
      bindHost: '0.0.0.0',
      allowPublicBind: true,
    }),
    /loopback/i,
  );
});

test('aceita token com bind em loopback', () => {
  assert.doesNotThrow(() => validateStartupConfiguration({
    mainApiToken: 'secret',
    bindHost: '127.0.0.1',
  }));
});

function createResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: null,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), String(value));
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('token invalido recebe 401 e token valido chama next', () => {
  const middleware = requireToken('correct-token');
  const unauthorized = createResponse();
  let nextCalled = false;

  middleware(
    { get: () => 'Bearer wrong-token' },
    unauthorized,
    () => { nextCalled = true; },
  );

  assert.equal(unauthorized.statusCode, 401);
  assert.equal(nextCalled, false);

  const authorized = createResponse();
  middleware(
    { get: () => 'Bearer correct-token' },
    authorized,
    () => { nextCalled = true; },
  );

  assert.equal(nextCalled, true);
});

test('rate limiter bloqueia acima do limite', () => {
  const limiter = createRateLimiter({
    keyPrefix: 'test',
    limit: 2,
    windowMs: 60_000,
  });
  const req = {
    get: () => '',
    socket: { remoteAddress: '203.0.113.10' },
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = createResponse();
    let allowed = false;
    limiter(req, res, () => { allowed = true; });
    assert.equal(allowed, true);
    assert.equal(res.statusCode, 200);
  }

  const blocked = createResponse();
  let allowed = false;
  limiter(req, blocked, () => { allowed = true; });

  assert.equal(allowed, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers.get('x-ratelimit-remaining'), '0');
  assert.ok(blocked.headers.get('retry-after'));
});

test('nginx limita antes do Node e publica somente rotas globais e tenant esperadas', () => {
  const nginx = fs.readFileSync(path.join(__dirname, 'nginx.conf.example'), 'utf8');

  assert.match(nginx, /limit_req_zone\s+\$binary_remote_addr/);
  assert.match(nginx, /location = \/send-message/);
  assert.match(nginx, /location = \/restart/);
  assert.match(nginx, /\/restaurants\/\[0-9A-Fa-f-\]\{36\}\/status/);
  assert.match(nginx, /\/restaurants\/\[0-9A-Fa-f-\]\{36\}\/send-message/);
  assert.match(nginx, /\/restaurants\/\[0-9A-Fa-f-\]\{36\}\/restart/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3001/);
  assert.match(nginx, /location \/ \{\s*return 404;/s);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/0\.0\.0\.0/);
});

test('servidor permite desligar sessao global apos migracao para impedir socket duplicado', () => {
  const server = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

  assert.match(server, /WHATSAPP_LEGACY_SESSION_ENABLED/);
  assert.match(server, /if \(LEGACY_SESSION_ENABLED\) \{\s*connectLegacyWhatsapp\(\);/s);
  assert.match(server, /Sessao global desativada/);
  assert.match(server, /status\(410\)/);
});

test('script de migracao preserva backup, para apenas o bot e desativa a sessao global', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrate-whatsapp-session-to-restaurant.sh'), 'utf8');

  assert.match(migration, /pre-tenant-migration/);
  assert.match(migration, /pm2 stop "\$PM2_PROCESS"/);
  assert.match(migration, /baileys_auth_info\.migrated-/);
  assert.match(migration, /WHATSAPP_LEGACY_SESSION_ENABLED=false/);
  assert.match(migration, /pm2 restart "\$PM2_PROCESS" --update-env/);
  assert.match(migration, /rollback_on_error/);
});

test('script de firewall bloqueia portas internas do WhatsApp e EconoApp', () => {
  const firewall = fs.readFileSync(path.join(__dirname, 'network-hardening.sh'), 'utf8');

  assert.match(firewall, /ufw deny .*WHATSAPP_PORT/);
  assert.match(firewall, /ufw deny .*ECONOAPP_PORT/);
  assert.match(firewall, /ufw allow .*HTTPS_PORT/);
  assert.match(firewall, /nao o ativa automaticamente/i);
});