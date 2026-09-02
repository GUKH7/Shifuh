const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const contextPath = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "promotions",
  "customer-context.ts",
);

let state;

function normalizeCustomerPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const nationalNumber = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (!/^\d{10,11}$/.test(nationalNumber)) return null;
  return `+55${nationalNumber}`;
}

function createAdminSupabase() {
  return {
    auth: {
      admin: {
        getUserById: async (id) => {
          state.adminUserLookups += 1;
          assert.equal(id, state.authUser?.id);
          return { data: { user: state.adminUser }, error: state.adminUserError || null };
        },
      },
    },
    from(table) {
      const filters = [];
      return {
        select() { return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          if (table === "customer_phone_accounts") {
            const expected = filters.find(([field]) => field === "auth_user_id")?.[1];
            assert.equal(expected, state.authUser?.id);
            return { data: state.accountPhone ? { phone: state.accountPhone } : null, error: null };
          }
          if (table === "profiles") {
            return { data: { name: state.profileName || "" }, error: null };
          }
          return { data: null, error: null };
        },
      };
    },
  };
}

function loadContextModule() {
  const source = fs.readFileSync(contextPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "@/lib/customer-account") {
      return { normalizeCustomerPhone };
    }
    if (request === "@/lib/supabase/server") {
      return {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: state.authUser || null } }),
          },
        }),
      };
    }
    if (request === "next/headers") {
      throw new Error("Promotion context must not depend on checkout cookies");
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = new Module(contextPath, module.parent);
    mod.filename = contextPath;
    mod.paths = Module._nodeModulePaths(path.dirname(contextPath));
    mod._compile(compiled, contextPath);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const contextModule = loadContextModule();

function resetState(overrides = {}) {
  state = {
    authUser: null,
    adminUser: null,
    adminUserError: null,
    accountPhone: "+5511999999999",
    profileName: "Cliente Teste",
    adminUserLookups: 0,
    ...overrides,
  };
}

test("não aceita cookie/conta automática sem sessão Supabase Auth ativa", async () => {
  resetState({
    adminUser: {
      id: "auth-1",
      phone: "+5511999999999",
      phone_confirmed_at: "2026-09-02T00:00:00.000Z",
    },
  });

  const context = await contextModule.resolveCustomerPromotionContext(createAdminSupabase());

  assert.equal(context, null);
  assert.equal(state.adminUserLookups, 0);
});

test("aceita sessão autenticada com telefone confirmado e mapeamento correspondente", async () => {
  resetState({
    authUser: { id: "auth-1" },
    adminUser: {
      id: "auth-1",
      phone: "+5511999999999",
      phone_confirmed_at: "2026-09-02T00:00:00.000Z",
    },
  });

  const context = await contextModule.resolveCustomerPromotionContext(createAdminSupabase());

  assert.deepEqual(context, {
    authUserId: "auth-1",
    phone: "11999999999",
    normalizedPhone: "+5511999999999",
    name: "Cliente Teste",
  });
  assert.equal(state.adminUserLookups, 1);
});

test("rejeita sessão autenticada cujo telefone ainda não foi confirmado", async () => {
  resetState({
    authUser: { id: "auth-1" },
    adminUser: {
      id: "auth-1",
      phone: "+5511999999999",
      phone_confirmed_at: null,
    },
  });

  const context = await contextModule.resolveCustomerPromotionContext(createAdminSupabase());
  assert.equal(context, null);
});

test("rejeita telefone autenticado diferente do mapeamento do cliente", async () => {
  resetState({
    authUser: { id: "auth-1" },
    adminUser: {
      id: "auth-1",
      phone: "+5511888888888",
      phone_confirmed_at: "2026-09-02T00:00:00.000Z",
    },
  });

  const context = await contextModule.resolveCustomerPromotionContext(createAdminSupabase());
  assert.equal(context, null);
});

test("arquivo de contexto não reintroduz fallback por sessão automática de checkout", () => {
  const source = fs.readFileSync(contextPath, "utf8");
  assert.doesNotMatch(source, /CUSTOMER_SESSION_COOKIE/);
  assert.doesNotMatch(source, /customer_phone_sessions/);
  assert.doesNotMatch(source, /resolveCookieAuthUserId/);
  assert.match(source, /const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(\)/);
  assert.match(source, /if \(!user\?\.id\) return null/);
});
