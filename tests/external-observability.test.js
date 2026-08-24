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

test("scrubs sensitive request, user and span data without destroying trace structure", () => {
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
  assert.match(scrubber, /function scrubSpans/);
  assert.match(scrubber, /mutable\.description = stripQueryFromDescription/);
  assert.match(scrubber, /mutable\.data = sanitizeUnknown\(mutable\.data, "data"\)/);
  assert.match(scrubber, /mutable\.spans = scrubSpans\(mutable\.spans\)/);
  assert.match(scrubber, /Stack frames, trace ids, timing and span relationships remain intact/);
  assert.doesNotMatch(scrubber, /mutable\["spans"\]\s*=\s*sanitizeUnknown/);
});

test("phone redaction does not mask generic eight-digit identifiers", () => {
  const scrubber = read("src/lib/sentry-scrub.ts");
  const match = scrubber.match(/const PHONE_PATTERN = \/(.+)\/g;/);

  assert.ok(match, "PHONE_PATTERN must remain declared as a global regex literal");
  const phonePattern = new RegExp(match[1], "g");

  assert.equal(
    "sentry-preview-validation-20260823".replace(phonePattern, "[redacted-phone]"),
    "sentry-preview-validation-20260823",
  );
  assert.equal(
    "contato (11) 91234-5678".replace(phonePattern, "[redacted-phone]"),
    "contato [redacted-phone]",
  );
  assert.equal(
    "fixo 3456-7890".replace(phonePattern, "[redacted-phone]"),
    "fixo [redacted-phone]",
  );
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

test("separates preview and production telemetry in the browser", () => {
  const config = read("next.config.mjs");
  const client = read("src/instrumentation-client.ts");

  assert.match(config, /NEXT_PUBLIC_APP_ENVIRONMENT:\s*process\.env\.VERCEL_ENV/);
  assert.match(config, /NEXT_PUBLIC_APP_RELEASE:\s*process\.env\.VERCEL_GIT_COMMIT_SHA/);
  assert.match(client, /environment:\s*process\.env\.NEXT_PUBLIC_APP_ENVIRONMENT/);
  assert.match(client, /release:\s*process\.env\.NEXT_PUBLIC_APP_RELEASE/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_VERCEL_ENV/);
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
