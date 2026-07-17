const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadGeoModule() {
  const filename = path.join(__dirname, "..", "src", "lib", "geo.ts");
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

test("prioriza endereco e descarta resultado de outra cidade", async () => {
  const { calculateDistance, getCoordinates } = loadGeoModule();
  const originalFetch = global.fetch;
  const requestedUrls = [];
  let request = 0;

  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    request += 1;
    const rows = request === 1
      ? [{
          lat: "-23.8000",
          lon: "-46.8000",
          address: { city: "Sao Paulo", state: "Sao Paulo", "ISO3166-2-lvl4": "BR-SP" },
        }]
      : [{
          lat: "-23.5022870",
          lon: "-46.3082747",
          address: { city: "Suzano", state: "Sao Paulo", "ISO3166-2-lvl4": "BR-SP" },
        }];
    return { ok: true, json: async () => rows };
  };

  try {
    const coordinates = await getCoordinates({
      postalCode: "08693290",
      street: "Rua Tito Prates",
      number: "66",
      neighborhood: "Cidade Boa Vista",
      city: "Suzano",
      state: "SP",
    });

    assert.deepEqual(coordinates, { lat: -23.502287, lon: -46.3082747 });
    assert.match(decodeURIComponent(requestedUrls[0]), /Rua Tito Prates, 66/);
    assert.doesNotMatch(requestedUrls[0], /postalcode=/);
    assert.ok(calculateDistance(-23.5464575, -46.3101019, coordinates.lat, coordinates.lon) < 6);
  } finally {
    global.fetch = originalFetch;
  }
});

test("nao aceita fallback de CEP incompativel com a cidade informada", async () => {
  const { getCoordinates } = loadGeoModule();
  const originalFetch = global.fetch;

  global.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("postalcode=")
      ? [{
          lat: "-23.6630981",
          lon: "-46.3070610",
          address: { city: "Outra Cidade", state: "Sao Paulo", "ISO3166-2-lvl4": "BR-SP" },
        }]
      : [],
  });

  try {
    const coordinates = await getCoordinates({
      postalCode: "08693290",
      street: "Rua inexistente",
      city: "Suzano",
      state: "SP",
    });
    assert.equal(coordinates, null);
  } finally {
    global.fetch = originalFetch;
  }
});
