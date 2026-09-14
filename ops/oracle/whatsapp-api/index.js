'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState: loadMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
  createRateLimiter,
  isTruthy,
  readPositiveInteger,
  requireToken,
  validateStartupConfiguration,
} = require('./security');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

const API_TOKEN = process.env.WHATSAPP_BOT_API_TOKEN || '';
const MAIN_API_TOKEN = process.env.WHATSAPP_MAIN_API_TOKEN || API_TOKEN;
const BIND_HOST = process.env.WHATSAPP_BIND_HOST || '127.0.0.1';
const PORT = readPositiveInteger(process.env.WHATSAPP_PORT, 3001);
const ALLOW_PUBLIC_BIND = isTruthy(process.env.WHATSAPP_ALLOW_PUBLIC_BIND);
const LEGACY_AUTH_DIR = './baileys_auth_info';
const RESTAURANT_AUTH_ROOT = process.env.WHATSAPP_RESTAURANT_SESSIONS_DIR || './baileys_restaurant_sessions';
const RESTAURANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

validateStartupConfiguration({
  mainApiToken: MAIN_API_TOKEN,
  bindHost: BIND_HOST,
  allowPublicBind: ALLOW_PUBLIC_BIND,
});

const requireMainApiToken = requireToken(MAIN_API_TOKEN);
const requireEconoappApiToken = requireToken(API_TOKEN);

const authRateLimit = createRateLimiter({
  keyPrefix: 'whatsapp:auth',
  limit: process.env.WHATSAPP_AUTH_RATE_LIMIT_MAX || 120,
  windowMs: process.env.WHATSAPP_AUTH_RATE_LIMIT_WINDOW_MS || 60_000,
});
const sendMessageRateLimit = createRateLimiter({
  keyPrefix: 'whatsapp:send-message',
  limit: process.env.WHATSAPP_SEND_RATE_LIMIT_MAX || 60,
  windowMs: process.env.WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS || 60_000,
});
const restartRateLimit = createRateLimiter({
  keyPrefix: 'whatsapp:restart',
  limit: process.env.WHATSAPP_RESTART_RATE_LIMIT_MAX || 5,
  windowMs: process.env.WHATSAPP_RESTART_RATE_LIMIT_WINDOW_MS || 300_000,
});
const econoappRateLimit = createRateLimiter({
  keyPrefix: 'whatsapp:econoapp',
  limit: process.env.WHATSAPP_ECONOAPP_RATE_LIMIT_MAX || 120,
  windowMs: process.env.WHATSAPP_ECONOAPP_RATE_LIMIT_WINDOW_MS || 60_000,
});

app.use('/econoapp', econoappRateLimit, requireEconoappApiToken, async (req, res) => {
  const upstreamPath = req.originalUrl.replace(/^\/econoapp/, '') || '/';
  const upstreamUrl = 'http://127.0.0.1:3002' + upstreamPath;

  try {
    const init = {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        authorization: req.get('authorization') || '',
        'x-idempotency-key': req.get('x-idempotency-key') || '',
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = JSON.stringify(req.body || {});
    }

    const upstreamResponse = await fetch(upstreamUrl, init);
    const contentType = upstreamResponse.headers.get('content-type');
    const payload = await upstreamResponse.text();

    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    res.status(upstreamResponse.status).send(payload);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Falha ao chamar API econoapp.',
    });
  }
});

let whatsappWebVersion = null;
const FALLBACK_WHATSAPP_WEB_VERSION = [2, 3000, 1043857760];

async function resolveWhatsappWebVersion() {
  if (whatsappWebVersion) return whatsappWebVersion;

  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    whatsappWebVersion = version;
    console.log(`Versao WhatsApp Web: ${version.join('.')} (atual: ${isLatest}).`);
  } catch (error) {
    whatsappWebVersion = FALLBACK_WHATSAPP_WEB_VERSION;
    console.warn(
      `Nao foi possivel consultar a versao do WhatsApp Web. Usando fallback ${whatsappWebVersion.join('.')}.`,
      error?.message || error,
    );
  }

  return whatsappWebVersion;
}

function maskRestaurantId(restaurantId) {
  return String(restaurantId || '').slice(0, 8);
}

function validateRestaurantId(value) {
  const restaurantId = String(value || '').trim();
  return RESTAURANT_ID_PATTERN.test(restaurantId) ? restaurantId : '';
}

function normalizeOutgoingMessagePayload(body) {
  const { phone, number, to, message, text } = body || {};
  const targetPhone = phone || number || to;
  const targetMessage = message || text;
  const cleanPhone = String(targetPhone || '').replace(/\D/g, '');
  const normalizedMessage = typeof targetMessage === 'string' ? targetMessage.trim() : '';

  if (!/^\d{10,15}$/.test(cleanPhone)) {
    return { error: 'Telefone invalido.' };
  }

  if (!normalizedMessage || normalizedMessage.length > 4096) {
    return { error: 'Mensagem invalida ou muito longa.' };
  }

  return { cleanPhone, normalizedMessage };
}

async function sendWithSocket(socket, body, logContext) {
  const normalized = normalizeOutgoingMessagePayload(body);
  if (normalized.error) {
    return { status: 400, body: { error: normalized.error } };
  }

  try {
    const id = `${normalized.cleanPhone}@s.whatsapp.net`;
    await socket.sendMessage(id, { text: normalized.normalizedMessage });
    console.log(`Mensagem enviada ${logContext} para ***${normalized.cleanPhone.slice(-4)}`);
    return { status: 200, body: { success: true, message: 'Enviada com sucesso!' } };
  } catch (error) {
    console.error(`Erro ao enviar ${logContext}:`, error?.message || error);
    return { status: 500, body: { error: 'Falha ao enviar a mensagem.' } };
  }
}

// ---------------------------------------------------------------------------
// Legacy global session. It remains available only for backwards compatibility
// while existing non-tenant callers are migrated to restaurant-scoped routes.
// ---------------------------------------------------------------------------
let statusConexao = 'iniciando';
let qrCodeBase64 = '';
let sock = null;
let isConnecting = false;
let reconnectTimer = null;
let reconnectAttempts = 0;

function clearLegacyReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function resetLegacyAuth() {
  try {
    fs.rmSync(LEGACY_AUTH_DIR, { recursive: true, force: true });
  } catch (error) {
    console.error('Erro ao limpar sessao legacy:', error);
  }
}

function scheduleLegacyReconnect(reason) {
  if (reconnectTimer || isConnecting) return;

  statusConexao = 'reconectando';
  qrCodeBase64 = '';

  const delay = Math.min(30000, 3000 + reconnectAttempts * 2000);
  reconnectAttempts += 1;

  console.log(`Reconectando sessao legacy em ${delay}ms. Motivo: ${reason}`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectLegacyWhatsapp().catch((error) => {
      console.error('Erro ao reconectar sessao legacy:', error);
      scheduleLegacyReconnect('erro ao reconectar');
    });
  }, delay);
}

async function connectLegacyWhatsapp() {
  if (isConnecting) return;

  isConnecting = true;
  clearLegacyReconnectTimer();
  let connectionFailed = false;

  try {
    statusConexao = 'iniciando';

    const { state, saveCreds } = await loadMultiFileAuthState(LEGACY_AUTH_DIR);
    const version = await resolveWhatsappWebVersion();

    const nextSock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
      browser: ['Shifuh', 'Chrome', '1.0.0'],
    });

    sock = nextSock;
    nextSock.ev.on('creds.update', saveCreds);

    nextSock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('QR Code gerado para sessao legacy.');
        statusConexao = 'aguardando_qr';

        try {
          qrCodeBase64 = await QRCode.toDataURL(qr);
        } catch (error) {
          console.error('Erro ao gerar QR Code legacy:', error);
          qrCodeBase64 = '';
        }
      }

      if (connection === 'open') {
        console.log('WhatsApp legacy conectado com sucesso.');
        reconnectAttempts = 0;
        statusConexao = 'conectado';
        qrCodeBase64 = '';
        return;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (statusCode === 405) {
          whatsappWebVersion = null;
        }

        if (sock === nextSock) {
          sock = null;
        }
        qrCodeBase64 = '';

        if (isLoggedOut) {
          resetLegacyAuth();
          reconnectAttempts = 0;
          scheduleLegacyReconnect('loggedOut');
          return;
        }

        scheduleLegacyReconnect(`close:${statusCode || 'unknown'}`);
      }
    });
  } catch (error) {
    console.error('Erro ao iniciar WhatsApp legacy:', error);
    connectionFailed = true;
  } finally {
    isConnecting = false;
  }

  if (connectionFailed) {
    scheduleLegacyReconnect('erro no connectLegacyWhatsapp');
  }
}

// ---------------------------------------------------------------------------
// Restaurant-scoped sessions. Every restaurant gets an isolated auth directory,
// socket, QR code and reconnect lifecycle. No tenant route falls back to legacy.
// ---------------------------------------------------------------------------
const restaurantSessions = new Map();

function createRestaurantSession(restaurantId) {
  return {
    restaurantId,
    authDir: path.join(RESTAURANT_AUTH_ROOT, restaurantId),
    status: 'iniciando',
    qrCodeBase64: '',
    sock: null,
    isConnecting: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
  };
}

function clearRestaurantReconnectTimer(session) {
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

function resetRestaurantAuth(session) {
  try {
    fs.rmSync(session.authDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Erro ao limpar sessao da loja ${maskRestaurantId(session.restaurantId)}:`, error);
  }
}

function scheduleRestaurantReconnect(session, reason) {
  if (session.reconnectTimer || session.isConnecting) return;

  session.status = 'reconectando';
  session.qrCodeBase64 = '';

  const delay = Math.min(30000, 3000 + session.reconnectAttempts * 2000);
  session.reconnectAttempts += 1;

  console.log(
    `Reconectando loja ${maskRestaurantId(session.restaurantId)} em ${delay}ms. Motivo: ${reason}`,
  );

  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    connectRestaurantWhatsapp(session).catch((error) => {
      console.error(
        `Erro ao reconectar loja ${maskRestaurantId(session.restaurantId)}:`,
        error?.message || error,
      );
      scheduleRestaurantReconnect(session, 'erro ao reconectar');
    });
  }, delay);
}

async function connectRestaurantWhatsapp(session) {
  if (session.isConnecting || (session.status === 'conectado' && session.sock)) return;

  session.isConnecting = true;
  clearRestaurantReconnectTimer(session);
  let connectionFailed = false;

  try {
    session.status = 'iniciando';
    fs.mkdirSync(session.authDir, { recursive: true, mode: 0o700 });

    const { state, saveCreds } = await loadMultiFileAuthState(session.authDir);
    const version = await resolveWhatsappWebVersion();
    const nextSock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
      browser: ['Shifuh', 'Chrome', '1.0.0'],
    });

    session.sock = nextSock;
    nextSock.ev.on('creds.update', saveCreds);

    nextSock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (session.sock !== nextSock) return;

      if (qr) {
        session.status = 'aguardando_qr';
        console.log(`QR Code gerado para loja ${maskRestaurantId(session.restaurantId)}.`);

        try {
          session.qrCodeBase64 = await QRCode.toDataURL(qr);
        } catch (error) {
          console.error(
            `Erro ao gerar QR Code da loja ${maskRestaurantId(session.restaurantId)}:`,
            error?.message || error,
          );
          session.qrCodeBase64 = '';
        }
      }

      if (connection === 'open') {
        session.reconnectAttempts = 0;
        session.status = 'conectado';
        session.qrCodeBase64 = '';
        console.log(`WhatsApp da loja ${maskRestaurantId(session.restaurantId)} conectado.`);
        return;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (statusCode === 405) {
          whatsappWebVersion = null;
        }

        if (session.sock === nextSock) {
          session.sock = null;
        }
        session.qrCodeBase64 = '';

        if (isLoggedOut) {
          console.log(`Sessao da loja ${maskRestaurantId(session.restaurantId)} saiu do WhatsApp.`);
          resetRestaurantAuth(session);
          session.reconnectAttempts = 0;
          scheduleRestaurantReconnect(session, 'loggedOut');
          return;
        }

        scheduleRestaurantReconnect(session, `close:${statusCode || 'unknown'}`);
      }
    });
  } catch (error) {
    console.error(
      `Erro ao iniciar WhatsApp da loja ${maskRestaurantId(session.restaurantId)}:`,
      error?.message || error,
    );
    connectionFailed = true;
  } finally {
    session.isConnecting = false;
  }

  if (connectionFailed) {
    scheduleRestaurantReconnect(session, 'erro no connectRestaurantWhatsapp');
  }
}

async function ensureRestaurantSession(rawRestaurantId) {
  const restaurantId = validateRestaurantId(rawRestaurantId);
  if (!restaurantId) return null;

  let session = restaurantSessions.get(restaurantId);
  if (!session) {
    session = createRestaurantSession(restaurantId);
    restaurantSessions.set(restaurantId, session);
  }

  if (!session.sock && !session.isConnecting && !session.reconnectTimer) {
    await connectRestaurantWhatsapp(session);
  }

  return session;
}

function bootstrapPersistedRestaurantSessions() {
  try {
    fs.mkdirSync(RESTAURANT_AUTH_ROOT, { recursive: true, mode: 0o700 });
    const entries = fs.readdirSync(RESTAURANT_AUTH_ROOT, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const restaurantId = validateRestaurantId(entry.name);
      if (!restaurantId) continue;

      const session = createRestaurantSession(restaurantId);
      restaurantSessions.set(restaurantId, session);
      connectRestaurantWhatsapp(session).catch((error) => {
        console.error(
          `Erro no bootstrap da loja ${maskRestaurantId(restaurantId)}:`,
          error?.message || error,
        );
      });
    }
  } catch (error) {
    console.error('Falha ao carregar sessoes persistidas por restaurante:', error?.message || error);
  }
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shifuh-whatsapp-api',
    restaurantSessions: restaurantSessions.size,
  });
});

// Legacy compatibility endpoints.
app.get('/status', authRateLimit, requireMainApiToken, (_req, res) => {
  res.json({ status: statusConexao, qrcode: qrCodeBase64 });
});

app.post('/restart', authRateLimit, restartRateLimit, requireMainApiToken, (_req, res) => {
  console.log('Comando de reinicio da sessao legacy recebido.');
  res.json({ message: 'Reiniciando conexao legacy...' });

  clearLegacyReconnectTimer();
  statusConexao = 'iniciando';
  qrCodeBase64 = '';
  resetLegacyAuth();

  try {
    sock?.end?.(new Error('restart requested'));
  } catch {}

  sock = null;

  setTimeout(() => {
    connectLegacyWhatsapp().catch((error) => {
      console.error('Erro apos restart legacy:', error);
      scheduleLegacyReconnect('restart error');
    });
  }, 1000);
});

app.post('/send-message', authRateLimit, sendMessageRateLimit, requireMainApiToken, async (req, res) => {
  if (statusConexao !== 'conectado' || !sock) {
    return res.status(503).json({ error: 'WhatsApp nao esta pronto.' });
  }

  const result = await sendWithSocket(sock, req.body, 'pela sessao legacy');
  return res.status(result.status).json(result.body);
});

// Restaurant-scoped endpoints. These never use the legacy socket.
app.get('/restaurants/:restaurantId/status', authRateLimit, requireMainApiToken, async (req, res) => {
  const session = await ensureRestaurantSession(req.params.restaurantId);
  if (!session) {
    return res.status(400).json({ error: 'Restaurante invalido.' });
  }

  return res.json({ status: session.status, qrcode: session.qrCodeBase64 });
});

app.post(
  '/restaurants/:restaurantId/restart',
  authRateLimit,
  restartRateLimit,
  requireMainApiToken,
  async (req, res) => {
    const session = await ensureRestaurantSession(req.params.restaurantId);
    if (!session) {
      return res.status(400).json({ error: 'Restaurante invalido.' });
    }

    clearRestaurantReconnectTimer(session);
    session.status = 'iniciando';
    session.qrCodeBase64 = '';
    resetRestaurantAuth(session);

    try {
      session.sock?.end?.(new Error('restaurant restart requested'));
    } catch {}

    session.sock = null;
    session.reconnectAttempts = 0;

    setTimeout(() => {
      connectRestaurantWhatsapp(session).catch((error) => {
        console.error(
          `Erro apos restart da loja ${maskRestaurantId(session.restaurantId)}:`,
          error?.message || error,
        );
        scheduleRestaurantReconnect(session, 'restart error');
      });
    }, 1000);

    return res.json({ message: 'Reiniciando conexao do WhatsApp desta loja...' });
  },
);

app.post(
  '/restaurants/:restaurantId/send-message',
  authRateLimit,
  sendMessageRateLimit,
  requireMainApiToken,
  async (req, res) => {
    const session = await ensureRestaurantSession(req.params.restaurantId);
    if (!session) {
      return res.status(400).json({ error: 'Restaurante invalido.' });
    }

    if (session.status !== 'conectado' || !session.sock) {
      return res.status(503).json({ error: 'WhatsApp deste restaurante nao esta pronto.' });
    }

    const result = await sendWithSocket(
      session.sock,
      req.body,
      `pela loja ${maskRestaurantId(session.restaurantId)}`,
    );
    return res.status(result.status).json(result.body);
  },
);

bootstrapPersistedRestaurantSessions();
connectLegacyWhatsapp();

app.listen(PORT, BIND_HOST, () => {
  console.log(`API Baileys rodando em http://${BIND_HOST}:${PORT}.`);
});
