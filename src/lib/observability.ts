import * as Sentry from "@sentry/nextjs";
import { sanitizeTelemetryContext } from "@/lib/sentry-scrub";

type OperationalLogLevel = "info" | "warn" | "error";

type OperationalLogContext = Record<string, unknown>;

export function logOperationalEvent(
  level: OperationalLogLevel,
  event: string,
  context: OperationalLogContext = {},
) {
  const payload = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  });

  Sentry.addBreadcrumb({
    category: "operational",
    message: event,
    level: level === "warn" ? "warning" : level,
    data: sanitizeTelemetryContext(context),
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
}
