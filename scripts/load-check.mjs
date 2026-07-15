import { performance } from "node:perf_hooks";

function readPositiveInteger(value, fallback, label) {
  const parsed = Number(value ?? fallback);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} deve ser um numero inteiro positivo.`);
  }

  return parsed;
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1);
  return Math.round(sortedValues[index]);
}

const target = process.argv[2];
if (!target) {
  console.error("Uso: node scripts/load-check.mjs <url> [requisicoes] [concorrencia]");
  process.exit(2);
}

const targetUrl = new URL(target);
if (!['http:', 'https:'].includes(targetUrl.protocol)) {
  throw new Error("A URL deve usar HTTP ou HTTPS.");
}

const requestCount = readPositiveInteger(process.argv[3], 100, "requisicoes");
const concurrency = Math.min(
  requestCount,
  readPositiveInteger(process.argv[4], 10, "concorrencia"),
);
const timeoutMs = readPositiveInteger(process.env.LOAD_CHECK_TIMEOUT_MS, 15000, "timeout");
const latencies = [];
const statuses = new Map();
const failures = [];
let nextRequest = 0;

async function executeRequest(index) {
  const startedAt = performance.now();

  try {
    const response = await fetch(targetUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.arrayBuffer();

    const latency = performance.now() - startedAt;
    latencies.push(latency);
    statuses.set(response.status, (statuses.get(response.status) || 0) + 1);

    if (response.status < 200 || response.status >= 400) {
      failures.push({ index, status: response.status });
    }
  } catch (error) {
    failures.push({
      index,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function worker() {
  while (nextRequest < requestCount) {
    const index = nextRequest;
    nextRequest += 1;
    await executeRequest(index);
  }
}

const suiteStartedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const suiteDurationMs = performance.now() - suiteStartedAt;
const sortedLatencies = [...latencies].sort((a, b) => a - b);
const meanLatency =
  latencies.length > 0
    ? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length)
    : 0;

console.log(
  JSON.stringify(
    {
      target: targetUrl.toString(),
      requests: requestCount,
      concurrency,
      successful: requestCount - failures.length,
      failed: failures.length,
      statusCodes: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a - b)),
      durationMs: Math.round(suiteDurationMs),
      requestsPerSecond: Number((requestCount / (suiteDurationMs / 1000)).toFixed(2)),
      latencyMs: {
        mean: meanLatency,
        p50: percentile(sortedLatencies, 0.5),
        p95: percentile(sortedLatencies, 0.95),
        p99: percentile(sortedLatencies, 0.99),
        max: sortedLatencies.length ? Math.round(sortedLatencies.at(-1)) : 0,
      },
      failures: failures.slice(0, 10),
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exit(1);
}
