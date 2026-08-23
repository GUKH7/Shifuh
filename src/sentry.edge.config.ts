import * as Sentry from "@sentry/nextjs";
import { parseTelemetrySampleRate, scrubSentryEvent } from "@/lib/sentry-scrub";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  tracesSampleRate: parseTelemetrySampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.1 : 1,
  ),
  beforeSend(event) {
    scrubSentryEvent(event);
    return event;
  },
  beforeSendTransaction(event) {
    scrubSentryEvent(event);
    return event;
  },
});
