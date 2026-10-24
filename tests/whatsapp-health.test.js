"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filePath = path.join(__dirname, "..", "src", "lib", "health.ts");
const savedFetch = global.fetch;
let statusUrl = "https://bot.example.test/health";
let requestedUrl;
let requestedHeaders;

function loadHealthModule() {
  const originalLoad = Module._load;
  const compiled = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "@/lib/supabase/server") {
      return { createAdminClient: () => { throw new Error("DB must not be queried"); } };
    }
    if (request === "@/lib/whatsapp-bot") {
      return {
        buildWhatsappBotUrl: (path) => {
          assert.equal(path, "/health");
          return statusUrl;
        },
        buildWhatsappBotHeaders: () => new Headers({ accept: "application/json" }),
        getWhatsappBotRequestSignal: () => undefined,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = new Module(filePath, module.parent);
    mod.filename = filePath;
    mod.paths = Module._nodeModulePaths(path.dirname(filePath));
    mod._compile(compiled, filePath);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

function mockResponse(body, status = 200) {
  global.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedHeaders = options.headers;
    return Response.json(body, { status });
  };
}

test.afterEach(() => {
  global.fetch = savedFetch;
  statusUrl = "https://bot.example.test/health";
  requestedUrl = undefined;
  requestedHeaders = undefined;
});

test("monitors the service health endpoint instead of the retired global status route", async () => {
  mockResponse({
    status: "ok",
    service: "shifuh-whatsapp-api",
    restaurantSessions: 2,
    legacySessionEnabled: false,
  });
  const { checkWhatsapp } = loadHealthModule();
  const result = await checkWhatsapp();

  assert.equal(requestedUrl, "https://bot.example.test/health");
  assert.equal(new Headers(requestedHeaders).get("accept"), "application/json");
  assert.equal(result.status, "healthy");
  assert.equal(result.scope, "service");
  assert.equal(result.connection, undefined, "global API health must not claim tenants are connected");
});

test("successful HTTP response without the expected service identity fails closed", async () => {
  mockResponse({ status: "conectado" });
  const { checkWhatsapp, settleHealthCheck } = loadHealthModule();
  const result = await settleHealthCheck(checkWhatsapp);

  assert.equal(result.check.status, "unavailable");
  assert.match(result.error || "", /unexpected response/i);
});

test("HTTP 410 from upstream health is still a real failure", async () => {
  mockResponse({ error: "Gone" }, 410);
  const { checkWhatsapp, settleHealthCheck } = loadHealthModule();
  const result = await settleHealthCheck(checkWhatsapp);

  assert.equal(result.check.status, "unavailable");
  assert.match(result.error || "", /HTTP 410/);
});

test("missing bot configuration does not call the network", async () => {
  statusUrl = null;
  let attemptedFetch = false;
  global.fetch = async () => { attemptedFetch = true; throw new Error("unexpected network call"); };

  const { checkWhatsapp } = loadHealthModule();
  const result = await checkWhatsapp();
  assert.equal(result.status, "unavailable");
  assert.equal(attemptedFetch, false);
});

test("non-200 response from the bot remains unavailable", async () => {
  mockResponse({ status: "unavailable", service: "shifuh-whatsapp-api" }, 503);
  const { checkWhatsapp, settleHealthCheck } = loadHealthModule();
  const result = await settleHealthCheck(checkWhatsapp);
  assert.equal(result.check.status, "unavailable");
  assert.match(result.error || "", /HTTP 503/);
});
