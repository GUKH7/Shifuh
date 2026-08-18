'use strict';

const assert = require('node:assert/strict');
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
      allowPublicBind: false,
    }),
    /nao configurado/i,
  );
});

test('recusa bind publico sem opt-in explicito', () => {
  assert.throws(
    () => validateStartupConfiguration({
      mainApiToken: 'secret',
      bindHost: '0.0.0.0',
      allowPublicBind: false,
    }),
    /inseguro/i,
  );
});

test('aceita token com bind em loopback', () => {
  assert.doesNotThrow(() => validateStartupConfiguration({
    mainApiToken: 'secret',
    bindHost: '127.0.0.1',
    allowPublicBind: false,
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
