const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

const projectRoot = path.join(__dirname, "..");
const whatsappBotPath = path.join(projectRoot, "src", "lib", "whatsapp-bot.ts");
const accessPath = path.join(projectRoot, "src", "lib", "whatsapp-bot-access.ts");
const statusRoutePath = path.join(projectRoot, "src", "app", "api", "whatsapp-bot", "status", "route.ts");
const restartRoutePath = path.join(projectRoot, "src", "app", "api", "whatsapp-bot", "restart", "route.ts");

let supabaseState;

function compileTs(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function createSupabaseMock() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: supabaseState.user },
        error: supabaseState.userError || null,
      }),
    },
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      limit: async () => ({
        data: supabaseState.restaurants || [],
        error: supabaseState.restaurantError || null,
      }),
    }),
  };
}

function loadCompiledModule(filePath, aliases = {}) {
  const originalLoad = Module._load;
  const compiled = compileTs(filePath);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(aliases, request)) {
      return aliases[request];
    }

    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }

    if (request === "@/lib/supabase/server") {
      return { createClient: async () => createSupabaseMock() };
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

function loadWhatsappBotLib() {
  return loadCompiledModule(whatsappBotPath);
}

function loadAccessLib() {
  return loadCompiledModule(accessPath);
}

function loadWhatsappRoute(filePath) {
  const whatsappBot = loadWhatsappBotLib();
  const access = loadAccessLib();

  return loadCompiledModule(filePath, {
    "@/lib/whatsapp-bot": whatsappBot,
    "@/lib/whatsapp-bot-access": access,
  });
}

function restoreEnv(snapshot) {
  for (const key of [
    "WHATSAPP_BOT_API_URL",
    "NEXT_PUBLIC_WHATSAPP_BOT_API_URL",
    "WHATSAPP_BOT_API_TOKEN",
    "WHATSAPP_BOT_TIMEOUT_MS",
  ]) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

test("ignora NEXT_PUBLIC_WHATSAPP_BOT_API_URL para nao expor a API do robo", () => {
  const envSnapshot = { ...process.env };
  delete process.env.WHATSAPP_BOT_API_URL;
  process.env.NEXT_PUBLIC_WHATSAPP_BOT_API_URL = "https://public.example.test";

  try {
    const { buildWhatsappBotUrl, isWhatsappBotConfigured } = loadWhatsappBotLib();

    assert.equal(isWhatsappBotConfigured(), false);
    assert.equal(buildWhatsappBotUrl("/status"), null);
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("envia Authorization Bearer ao chamar a API WhatsApp", async () => {
  const envSnapshot = { ...process.env };
  const originalFetch = global.fetch;
  let requestedHeaders;

  process.env.WHATSAPP_BOT_API_URL = "https://bot.example.test";
  process.env.WHATSAPP_BOT_API_TOKEN = "secret-token";
  process.env.WHATSAPP_BOT_TIMEOUT_MS = "0";

  global.fetch = async (_url, init) => {
    requestedHeaders = init.headers;
    return new Response("{}", { status: 200 });
  };

  try {
    const { sendWhatsappMessage } = loadWhatsappBotLib();

    const result = await sendWhatsappMessage({
      phone: "(11) 99999-9999",
      message: "Pedido atualizado",
    });

    assert.equal(result.ok, true);
    assert.equal(new Headers(requestedHeaders).get("authorization"), "Bearer secret-token");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(envSnapshot);
  }
});

test("bloqueia status da API WhatsApp sem usuario autenticado", async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  supabaseState = { user: null, restaurants: [] };
  global.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    const { GET } = loadWhatsappRoute(statusRoutePath);
    const response = await GET();

    assert.equal(response.status, 401);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("bloqueia restart da API WhatsApp quando usuario nao tem loja", async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  supabaseState = { user: { id: "user-1" }, restaurants: [] };
  global.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    const { POST } = loadWhatsappRoute(restartRoutePath);
    const response = await POST();

    assert.equal(response.status, 403);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});
