const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const helperFile = path.join(root, "src/features/orders/order-queue.ts");
const source = fs.readFileSync(helperFile, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = new Module(helperFile, module);
mod.filename = helperFile;
mod.paths = Module._nodeModulePaths(path.dirname(helperFile));
const channelFile = path.join(root, "src/lib/integrations/order-channels.ts");
const channels = new Module(channelFile, module);
channels.filename = channelFile;
channels.paths = Module._nodeModulePaths(path.dirname(channelFile));
channels._compile(ts.transpileModule(fs.readFileSync(channelFile, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, channelFile);
const originalLoad = Module._load;
Module._load = function loadWithChannels(request, parent, isMain) {
  if (request === "@/lib/integrations/order-channels") return channels.exports;
  return originalLoad.call(this, request, parent, isMain);
};
try {
  mod._compile(compiled, helperFile);
} finally {
  Module._load = originalLoad;
}
const { selectNextPendingOrder } = mod.exports;

const now = new Date("2026-11-15T12:00:00Z");
function order(id, created_at, status = "pending", scheduled_for = null) {
  return { id, created_at, status, scheduled_for };
}

test("fila rápida escolhe pendente mais antigo sem alterar a lista", () => {
  const list = [
    order("novo", "2026-11-15T11:55:00Z"),
    order("antigo", "2026-11-15T11:10:00Z"),
    order("preparo", "2026-11-15T10:00:00Z", "preparing"),
  ];
  assert.equal(selectNextPendingOrder(list, now).id, "antigo");
  assert.equal(list[0].id, "novo");
});

test("respeita agendamento futuro e inclui pedidos agendados vencidos", () => {
  const list = [
    order("futuro", "2026-11-15T10:00:00Z", "pending", "2026-11-15T14:00:00Z"),
    order("vencido", "2026-11-15T11:00:00Z", "pending", "2026-11-15T11:59:00Z"),
    order("imediato", "2026-11-15T11:30:00Z"),
  ];
  assert.equal(selectNextPendingOrder(list, now).id, "vencido");
  assert.equal(selectNextPendingOrder(list.slice(0, 1), now), null);
});

test("não sugere concluídos ou agendados sem horário válido", () => {
  assert.equal(selectNextPendingOrder([order("done", "2026-11-15T10:00:00Z", "done")], now), null);
  assert.equal(selectNextPendingOrder([order("invalid", "2026-11-15T09:00:00Z", "pending", "invalid")], now), null);
  assert.equal(selectNextPendingOrder([], now), null);
});

test("desempata cronologias inválidas de modo determinístico", () => {
  const list = [order("b", "invalid"), order("a", "invalid")];
  assert.equal(selectNextPendingOrder(list, now).id, "a");
});

test("não permite que pedidos 99Food sem conector entrem na fila de aceite", () => {
  const candidate = { ...order("99-order", "2026-11-15T09:00:00Z"), external_source: "99food" };
  const native = order("own-order", "2026-11-15T11:30:00Z");
  assert.equal(selectNextPendingOrder([candidate, native], now)?.id, "own-order");
  assert.equal(selectNextPendingOrder([candidate], now), null);
});

test("UI abre detalhes e reutiliza ação autenticada de aceite", () => {
  const page = fs.readFileSync(path.join(root, "src/features/orders/OrdersPage.tsx"), "utf8");
  assert.match(page, /aria-label="Atendimento rápido"/);
  assert.match(page, /selectNextPendingOrder\(orders, storeClock\)/);
  assert.match(page, /onClick=\{\(\) => openQuickOrder\(nextPendingOrder\)\}/);
  assert.match(page, /onClick=\{\(\) => void handlePrimaryAction\(nextPendingOrder\)\}/);
  assert.match(page, /statusUpdatingOrderId === nextPendingOrder\.id/);
});
