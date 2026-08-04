const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
const cronSecret = process.env.CRON_SECRET;
const configuredIntervalMs = Number(process.env.IFOOD_POLLING_INTERVAL_MS || 30_000);
const configuredMaxIntervalMs = Number(process.env.IFOOD_POLLING_MAX_INTERVAL_MS || 300_000);
const intervalMs = Number.isFinite(configuredIntervalMs)
  ? Math.max(configuredIntervalMs, 15_000)
  : 30_000;
const maxIntervalMs = Number.isFinite(configuredMaxIntervalMs)
  ? Math.max(configuredMaxIntervalMs, intervalMs)
  : 300_000;
const endpointPath =
  process.env.IFOOD_POLLING_ENDPOINT || "/api/cron/ifood/resilient-orders";

if (!appBaseUrl) {
  throw new Error("APP_BASE_URL is required. Example: https://gestor-delivery-tau.vercel.app");
}

if (!cronSecret) {
  throw new Error("CRON_SECRET is required.");
}

const endpoint = new URL(endpointPath, appBaseUrl).toString();

let running = false;
let runCount = 0;
let consecutiveFailures = 0;

function nextPollingDelay() {
  return Math.min(intervalMs * 2 ** consecutiveFailures, maxIntervalMs);
}

async function pollIfoodOrders() {
  if (running) {
    console.warn("Previous iFood polling run is still active. Skipping this tick.");
    return false;
  }

  running = true;
  runCount += 1;
  const startedAt = new Date();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        Accept: "application/json",
        "User-Agent": "gestor-delivery-ifood-worker/1.0",
      },
    });

    const body = await response.text();
    let payload = null;

    try {
      payload = body ? JSON.parse(body) : null;
    } catch {
      // A resposta textual ainda é preservada no log de erro abaixo.
    }

    if (!response.ok || payload?.ok === false) {
      console.error(
        `[${startedAt.toISOString()}] iFood polling failed (${response.status}): ${body}`,
      );
      return false;
    }

    console.log(`[${startedAt.toISOString()}] iFood polling ok #${runCount}: ${body}`);
    return true;
  } catch (error) {
    console.error(`[${startedAt.toISOString()}] iFood polling error:`, error);
    return false;
  } finally {
    running = false;
  }
}

async function runAndSchedule() {
  const succeeded = await pollIfoodOrders();
  consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
  const delayMs = nextPollingDelay();

  if (!succeeded) {
    console.warn(
      `Next iFood polling attempt in ${delayMs}ms after ${consecutiveFailures} consecutive failure(s).`,
    );
  }

  setTimeout(runAndSchedule, delayMs);
}

console.log(
  `Starting iFood polling worker at ${endpoint} every ${intervalMs}ms (backoff up to ${maxIntervalMs}ms).`,
);
void runAndSchedule();
