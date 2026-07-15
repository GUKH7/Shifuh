const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

const projectRoot = path.join(__dirname, "..");
const routePath = path.join(projectRoot, "src", "app", "api", "health", "route.ts");

let databaseError = null;

function compileTs(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadRoute() {
  const originalLoad = Module._load;
  const compiled = compileTs(routePath);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }

    if (request === "@/lib/observability") {
      return { logOperationalEvent: () => {} };
    }

    if (request === "@/lib/supabase/server") {
      return {
        createAdminClient: () => ({
          from: () => ({
            select: async () => ({ data: null, error: databaseError }),
          }),
        }),
      };
    }

    if (request === "@/lib/whatsapp-bot") {
      return {
        buildWhatsappBotHeaders: (init) => new Headers(init),
        buildWhatsappBotUrl: () => "https://bot.example.test/status",
        getWhatsappBotRequestSignal: () => undefined,
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = new Module(routePath, module.parent);
    mod.filename = routePath;
    mod.paths = Module._nodeModulePaths(path.dirname(routePath));
    mod._compile(compiled, routePath);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

test("retorna healthy quando banco e WhatsApp estao operacionais", async () => {
  const originalFetch = global.fetch;
  databaseError = null;
  global.fetch = async () => Response.json({ status: "conectado" });

  try {
    const { GET } = loadRoute();
    const response = await GET(new Request("https://app.example.test/api/health"));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "healthy");
    assert.equal(payload.checks.database.status, "healthy");
    assert.equal(payload.checks.whatsapp.status, "healthy");
  } finally {
    global.fetch = originalFetch;
  }
});

test("retorna degraded sem expor o erro interno da dependencia", async () => {
  const originalFetch = global.fetch;
  databaseError = { message: "segredo interno do banco" };
  global.fetch = async () => Response.json({ status: "aguardando_qr" });

  try {
    const { GET } = loadRoute();
    const response = await GET(new Request("https://app.example.test/api/health"));
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 503);
    assert.equal(payload.status, "degraded");
    assert.equal(payload.checks.database.status, "unavailable");
    assert.equal(payload.checks.whatsapp.status, "degraded");
    assert.equal(serialized.includes("segredo interno do banco"), false);
  } finally {
    global.fetch = originalFetch;
    databaseError = null;
  }
});
