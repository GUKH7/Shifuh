"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const ordersPath = path.join(root, "src/lib/ifood/orders.ts");
const resiliencePath = path.join(root, "src/lib/ifood/order-sync-resilience.ts");
const workerPath = path.join(root, "scripts/ifood-polling-worker.mjs");

function loadTs(filename, mocks) {
  const original = Module._load;
  Module._load = function(request, parent, main) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return original.call(this, request, parent, main);
  };
  try {
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod._compile(compiled, filename);
    return mod.exports;
  } finally {
    Module._load = original;
  }
}

test("iFood retry parser reads Retry-After seconds, HTTP dates and Cloudflare JSON", () => {
  const { readIfoodRetryAfterMs } = loadTs(ordersPath, {
    "@/lib/ifood/catalog": { getIfoodAccessToken: async () => "test-token" },
  });
  assert.equal(readIfoodRetryAfterMs(new Headers({ "Retry-After": "120" }), "{}"), 120_000);
  assert.equal(readIfoodRetryAfterMs(new Headers(), JSON.stringify({ retry_after: 120 })), 120_000);
  assert.equal(readIfoodRetryAfterMs(new Headers({ "Retry-After": "1" }), JSON.stringify({ retry_after: 120 })), 120_000);
  assert.equal(readIfoodRetryAfterMs(new Headers({ "Retry-After": "Wed, 21 Oct 2026 08:42:00 GMT" }), "", Date.parse("Wed, 21 Oct 2026 08:40:00 GMT")), 120_000);
  assert.equal(readIfoodRetryAfterMs(new Headers(), "upstream failed"), null);
});

test("iFood 504 with 120-second retry hint does not trigger immediate additional requests", async () => {
  const oldFetch = global.fetch;
  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    return Response.json({ status: 504, retry_after: 120 }, { status: 504 });
  };
  try {
    const { pollIfoodOrderEvents, IfoodApiError } = loadTs(ordersPath, {
      "@/lib/ifood/catalog": { getIfoodAccessToken: async () => "test-token" },
    });
    await assert.rejects(pollIfoodOrderEvents("merchant-test"), (error) => {
      assert.ok(error instanceof IfoodApiError);
      assert.equal(error.status, 504);
      assert.equal(error.retryAfterMs, 120_000);
      return true;
    });
    assert.equal(attempts, 1);
  } finally {
    global.fetch = oldFetch;
  }
});

test("outage before event processing does not increment queue retries or dead-letter unrelated events", async () => {
  const source = fs.readFileSync(resiliencePath, "utf8");
  assert.match(source, /if \(!attemptedFailedEventIds\.length\) return \{ scheduled: 0, deadLettered: 0 \}/);
  assert.match(source, /\.in\("ifood_event_id", attemptedFailedEventIds\)/);
  const catchBody = source.slice(source.indexOf("} catch (error) {", source.indexOf("async function runWithRetries")));
  assert.doesNotMatch(catchBody.split("export async function syncIfoodOrdersWithResilience")[0], /schedulePendingEventRetries\(/);
  assert.match(source, /error\.retryAfterMs > 2_500/);
});

test("iFood worker honors upstream Retry-After on failures", () => {
  const source = fs.readFileSync(workerPath, "utf8");
  assert.match(source, /serverRetryAfterMs = readServerRetryAfterMs\(response\.headers\.get\("retry-after"\)\)/);
  assert.match(source, /Math\.max\([\s\S]*serverRetryAfterMs/);
  assert.match(source, /serverRetryAfterMs = 0/);
});
