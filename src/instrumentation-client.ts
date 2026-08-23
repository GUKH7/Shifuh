import * as Sentry from "@sentry/nextjs";
import { parseTelemetrySampleRate, scrubSentryEvent } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_APP_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: parseTelemetrySampleRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.05 : 1,
  ),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend(event) {
    scrubSentryEvent(event);
    return event;
  },
  beforeSendTransaction(event) {
    scrubSentryEvent(event);
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
