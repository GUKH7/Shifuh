const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
const cronSecret = process.env.CRON_SECRET;
const intervalMs = Number(process.env.IFOOD_POLLING_INTERVAL_MS || 30_000);
const endpointPath = process.env.IFOOD_POLLING_ENDPOINT || "/api/cron/ifood/orders";

if (!appBaseUrl) {
  throw new Error("APP_BASE_URL is required. Example: https://gestor-delivery-tau.vercel.app");
}

if (!cronSecret) {
  throw new Error("CRON_SECRET is required.");
}

const endpoint = new URL(endpointPath, appBaseUrl).toString();

let running = false;
let runCount = 0;

async function pollIfoodOrders() {
  if (running) {
    console.warn("Previous iFood polling run is still active. Skipping this tick.");
    return;
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

    if (!response.ok) {
      console.error(
        `[${startedAt.toISOString()}] iFood polling failed (${response.status}): ${body}`,
      );
      return;
    }

    console.log(`[${startedAt.toISOString()}] iFood polling ok #${runCount}: ${body}`);
  } catch (error) {
    console.error(`[${startedAt.toISOString()}] iFood polling error:`, error);
  } finally {
    running = false;
  }
}

console.log(`Starting iFood polling worker at ${endpoint} every ${intervalMs}ms.`);
pollIfoodOrders();
setInterval(pollIfoodOrders, intervalMs);
