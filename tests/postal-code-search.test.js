const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const routePath = path.join(__dirname, "..", "src", "app", "api", "storefront", "postal-code", "route.ts");

function loadRoute() {
  const source = fs.readFileSync(routePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }
    if (request === "@/lib/rate-limit") {
      return { checkRateLimit: () => null };
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

test("busca CEP pelo endereço e prioriza o bairro informado", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => Response.json([
    { cep: "08670-000", logradouro: "Rua Tito Prates", bairro: "Centro", localidade: "Suzano", uf: "SP" },
    { cep: "08693-290", logradouro: "Rua Tito Prates", bairro: "Cidade Boa Vista", localidade: "Suzano", uf: "SP" },
  ]);

  try {
    const { POST } = loadRoute();
    const response = await POST(new Request("http://local.test/api/storefront/postal-code", {
      method: "POST",
      body: JSON.stringify({
        street: "Rua Tito Prates",
        number: "66",
        neighborhood: "Cidade Boa Vista",
        city: "Suzano",
        state: "SP",
      }),
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.candidates[0].cep, "08693-290");
    assert.equal(body.candidates[0].neighborhood, "Cidade Boa Vista");
  } finally {
    global.fetch = originalFetch;
  }
});

test("exige os campos necessários para procurar o CEP", async () => {
  const { POST } = loadRoute();
  const response = await POST(new Request("http://local.test/api/storefront/postal-code", {
    method: "POST",
    body: JSON.stringify({ street: "Rua A", city: "Suzano", state: "SP" }),
  }));

  assert.equal(response.status, 400);
});
