'use strict';

const crypto = require('crypto');
const net = require('net');

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isTruthy(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizeIp(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('::ffff:')) {
    return raw.slice(7);
  }

  if (raw === '::1') return '127.0.0.1';
  return raw;
}

function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function validateStartupConfiguration({ mainApiToken, bindHost, allowPublicBind }) {
  if (!String(mainApiToken || '').trim()) {
    throw new Error(
      'WHATSAPP_MAIN_API_TOKEN/WHATSAPP_BOT_API_TOKEN nao configurado. O servico nao sera iniciado.',
    );
  }

  if (!isLoopbackHost(bindHost) && !allowPublicBind) {
    throw new Error(
      `Bind de rede inseguro recusado (${bindHost}). Use 127.0.0.1 ou defina WHATSAPP_ALLOW_PUBLIC_BIND=true conscientemente.`,
    );
  }
}

function safeTokenEquals(received, expected) {
  if (!received || !expected) return false;

  const receivedBuffer = Buffer.from(String(received));
  const expectedBuffer = Buffer.from(String(expected));

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function extractBearerToken(req) {
  const authorization = req.get('authorization') || '';

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return req.get('x-api-token') || '';
}

function requireToken(expectedToken) {
  return (req, res, next) => {
    if (!expectedToken) {
      return res.status(503).json({ error: 'Token da API WhatsApp nao configurado.' });
    }

    if (!safeTokenEquals(extractBearerToken(req), expectedToken)) {
      return res.status(401).json({ error: 'Nao autorizado.' });
    }

    return next();
  };
}

function isTrustedLoopbackProxy(req) {
  if (String(process.env.WHATSAPP_TRUST_PROXY || '').trim().toLowerCase() !== 'loopback') {
    return false;
  }

  const remoteAddress = normalizeIp(req.socket?.remoteAddress);
  return remoteAddress === '127.0.0.1';
}

function getClientIp(req) {
  if (isTrustedLoopbackProxy(req)) {
    const forwarded = String(req.get('x-forwarded-for') || '')
      .split(',')[0]
      .trim();

    if (net.isIP(forwarded)) {
      return normalizeIp(forwarded);
    }
  }

  return normalizeIp(req.socket?.remoteAddress) || 'unknown';
}

function createRateLimiter({ keyPrefix, limit, windowMs }) {
  const buckets = new Map();
  let lastCleanupAt = 0;

  const configuredLimit = () => readPositiveInteger(limit, 60);
  const configuredWindowMs = () => readPositiveInteger(windowMs, 60_000);

  return (req, res, next) => {
    const now = Date.now();
    const resolvedLimit = configuredLimit();
    const resolvedWindowMs = configuredWindowMs();
    const identity = getClientIp(req);
    const key = `${keyPrefix}:${identity}`;
    const current = buckets.get(key);
    const bucket =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + resolvedWindowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (now - lastCleanupAt >= 60_000 || buckets.size > 5000) {
      for (const [bucketKey, candidate] of buckets) {
        if (candidate.resetAt <= now) buckets.delete(bucketKey);
      }
      lastCleanupAt = now;
    }

    const remaining = Math.max(0, resolvedLimit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('X-RateLimit-Limit', String(resolvedLimit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > resolvedLimit) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        error: 'Muitas requisicoes. Aguarde alguns instantes e tente novamente.',
      });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
  extractBearerToken,
  getClientIp,
  isLoopbackHost,
  isTruthy,
  readPositiveInteger,
  requireToken,
  safeTokenEquals,
  validateStartupConfiguration,
};
