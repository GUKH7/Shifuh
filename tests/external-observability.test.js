const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("pins the official Sentry Next.js SDK", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));

  assert.equal(pkg.dependencies["@sentry/nextjs"], "10.70.0");
  assert.equal(lock.packages[""].dependencies["@sentry/nextjs"], "10.70.0");
  assert.equal(lock.packages["node_modules/@sentry/nextjs"].version, "10.70.0");
});

test("captures server request errors and client navigation traces", () => {
  const serverInstrumentation = read("src/instrumentation.ts");
  const clientInstrumentation = read("src/instrumentation-client.ts");

  assert.match(serverInstrumentation, /onRequestError\s*=\s*Sentry\.captureRequestError/);
  assert.match(serverInstrumentation, /sentry\.server\.config/);
  assert.match(serverInstrumentation, /sentry\.edge\.config/);
  assert.match(clientInstrumentation, /captureRouterTransitionStart/);
  assert.match(clientInstrumentation, /replaysSessionSampleRate:\s*0/);
  assert.match(clientInstrumentation, /replaysOnErrorSampleRate:\s*0/);
  assert.match(clientInstrumentation, /sendDefaultPii:\s*false/);
});

test("keeps structured operational logs and correlates them with sanitized breadcrumbs", () => {
  const observability = read("src/lib/observability.ts");

  assert.match(observability, /JSON\.stringify\(\{/);
  assert.match(observability, /level,/);
  assert.match(observability, /event,/);
  assert.match(observability, /timestamp:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(observability, /Sentry\.addBreadcrumb/);
  assert.match(observability, /sanitizeTelemetryContext\(context\)/);
  assert.match(observability, /console\.error\(payload\)/);
  assert.match(observability, /console\.warn\(payload\)/);
  assert.match(observability, /console\.log\(payload\)/);
});

test("captures only existing server error console events externally", () => {
  const server = read("src/sentry.server.config.ts");

  assert.match(server, /captureConsoleIntegration\(\{\s*levels:\s*\["error"\]/s);
  assert.doesNotMatch(server, /levels:\s*\[[^\]]*"warn"/s);
  assert.match(server, /sendDefaultPii:\s*false/);
});

test("scrubs sensitive request and user data without destroying spans or stack frames", () => {
  const scrubber = read("src/lib/sentry-scrub.ts");

  for (const sensitiveTerm of [
    "authorization",
    "cookie",
    "password",
    "token",
    "secret",
    "phone",
    "email",
    "address",
    "cep",
    "cpf",
    "cnpj",
  ]) {
    assert.match(scrubber.toLowerCase(), new RegExp(sensitiveTerm));
  }

  assert.match(scrubber, /delete safeRequest\.cookies/);
  assert.match(scrubber, /delete safeRequest\.data/);
  assert.match(scrubber, /delete safeRequest\.query_string/);
  assert.match(scrubber, /\{ id: String\(id\) \}/);
  assert.match(scrubber, /Stack frames and transaction spans are intentionally preserved/);
  assert.doesNotMatch(scrubber, /mutable\["spans"\]\s*=\s*sanitizeUnknown/);
});

test("source map upload stays optional when Sentry build credentials are absent", () => {
  const config = read("next.config.mjs");

  assert.match(config, /SENTRY_AUTH_TOKEN/);
  assert.match(config, /SENTRY_ORG/);
  assert.match(config, /SENTRY_PROJECT/);
  assert.match(config, /sentryBuildConfigured\s*\?/);
  assert.match(config, /withSentryConfig\(nextConfig/);
  assert.match(config, /:\s*nextConfig/);
});

test("documents runtime sampling, activation, privacy and alert policy", () => {
  const env = read(".env.example");
  const runbook = read("docs/operations/external-observability.md");

  assert.match(env, /NEXT_PUBLIC_SENTRY_DSN=/);
  assert.match(env, /SENTRY_TRACES_SAMPLE_RATE=0\.10/);
  assert.match(env, /NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0\.05/);
  assert.match(runbook, /Novo erro em Production/);
  assert.match(runbook, /Pico de erros/);
  assert.match(runbook, /Checkout/);
  assert.match(runbook, /Performance/);
  assert.match(runbook, /Nenhum dado pessoal sensível aparece/);
});
