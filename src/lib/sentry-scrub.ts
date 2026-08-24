const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|set-cookie|password|passwd|token|secret|api[_-]?key|customer.*(?:name|phone|email|address)|phone|email|address|cep|cpf|cnpj|observation|notes?)/i;
const URL_KEY_PATTERN = /(?:^|[._-])(?:url|uri|href)(?:$|[._-])/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Evita tratar identificadores numéricos genéricos de 8 dígitos como telefone.
// Celulares de 9 dígitos continuam protegidos; fixos de 8 dígitos exigem DDD ou separador.
const PHONE_PATTERN = /(?<!\d)(?:(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?9\d{4}[\s.-]?\d{4}|(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)\d{4}[\s.-]?\d{4}|\d{4}[\s.-]\d{4})(?!\d)/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const MAX_STRING_LENGTH = 1_000;
const MAX_DEPTH = 5;

type SafeTelemetryValue = string | number | boolean | null;

function stripUrlQuery(value: string) {
  try {
    const url = new URL(value, "https://telemetry.invalid");
    url.search = "";
    url.hash = "";

    if (url.origin === "https://telemetry.invalid") {
      return url.pathname;
    }

    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] || value;
  }
}

function stripQueryFromDescription(value: string) {
  return redactTelemetryString(value).split(/[?#]/, 1)[0] || value;
}

export function redactTelemetryString(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(JWT_PATTERN, "[redacted-token]")
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeUnknown(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const redacted = redactTelemetryString(value);
    return URL_KEY_PATTERN.test(key) || key === "url" ? stripUrlQuery(redacted) : redacted;
  }

  if (value instanceof Error) {
    return redactTelemetryString(value.message || value.name || "Error");
  }

  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeUnknown(item, key, depth + 1));
  }

  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      sanitized[childKey] = sanitizeUnknown(childValue, childKey, depth + 1);
    }
    return sanitized;
  }

  return String(value).slice(0, MAX_STRING_LENGTH);
}

function scrubBreadcrumbs(value: unknown) {
  if (!Array.isArray(value)) return value;

  return value.slice(0, 100).map((breadcrumb) => {
    if (!breadcrumb || typeof breadcrumb !== "object") return breadcrumb;

    const mutable = { ...(breadcrumb as Record<string, unknown>) };
    if (typeof mutable.message === "string") {
      mutable.message = redactTelemetryString(mutable.message);
    }
    if (mutable.data && typeof mutable.data === "object") {
      mutable.data = sanitizeUnknown(mutable.data, "data");
    }
    return mutable;
  });
}

function scrubExceptions(value: unknown) {
  if (!value || typeof value !== "object") return;
  const exception = value as Record<string, unknown>;
  if (!Array.isArray(exception.values)) return;

  exception.values = exception.values.map((item) => {
    if (!item || typeof item !== "object") return item;
    const mutable = { ...(item as Record<string, unknown>) };

    if (typeof mutable.value === "string") {
      mutable.value = redactTelemetryString(mutable.value);
    }

    if (mutable.mechanism && typeof mutable.mechanism === "object") {
      const mechanism = { ...(mutable.mechanism as Record<string, unknown>) };
      if (mechanism.data && typeof mechanism.data === "object") {
        mechanism.data = sanitizeUnknown(mechanism.data, "data");
      }
      mutable.mechanism = mechanism;
    }

    return mutable;
  });
}

function scrubSpans(value: unknown) {
  if (!Array.isArray(value)) return value;

  return value.map((span) => {
    if (!span || typeof span !== "object") return span;

    const mutable = { ...(span as Record<string, unknown>) };
    if (typeof mutable.description === "string") {
      mutable.description = stripQueryFromDescription(mutable.description);
    }
    if (typeof mutable.name === "string") {
      mutable.name = stripQueryFromDescription(mutable.name);
    }
    if (mutable.data && typeof mutable.data === "object") {
      mutable.data = sanitizeUnknown(mutable.data, "data");
    }
    if (mutable.tags && typeof mutable.tags === "object") {
      mutable.tags = sanitizeUnknown(mutable.tags, "tags");
    }

    return mutable;
  });
}

export function sanitizeTelemetryContext(
  context: Record<string, unknown>,
): Record<string, SafeTelemetryValue> {
  const sanitized: Record<string, SafeTelemetryValue> = {};

  for (const [key, value] of Object.entries(context)) {
    const safeValue = sanitizeUnknown(value, key);

    if (
      safeValue === null ||
      typeof safeValue === "string" ||
      typeof safeValue === "number" ||
      typeof safeValue === "boolean"
    ) {
      sanitized[key] = safeValue;
      continue;
    }

    try {
      sanitized[key] = JSON.stringify(safeValue).slice(0, MAX_STRING_LENGTH);
    } catch {
      sanitized[key] = "[unserializable]";
    }
  }

  return sanitized;
}

export function scrubSentryEvent(event: unknown) {
  if (!event || typeof event !== "object") return;

  const mutable = event as Record<string, unknown>;

  if (typeof mutable.message === "string") {
    mutable.message = redactTelemetryString(mutable.message);
  }
  if (typeof mutable.transaction === "string") {
    mutable.transaction = stripUrlQuery(redactTelemetryString(mutable.transaction));
  }

  const request = mutable.request;
  if (request && typeof request === "object") {
    const safeRequest = request as Record<string, unknown>;
    if (typeof safeRequest.url === "string") {
      safeRequest.url = stripUrlQuery(redactTelemetryString(safeRequest.url));
    }
    safeRequest.headers = sanitizeUnknown(safeRequest.headers, "headers");
    delete safeRequest.cookies;
    delete safeRequest.data;
    delete safeRequest.query_string;
  }

  const user = mutable.user;
  if (user && typeof user === "object") {
    const id = (user as Record<string, unknown>).id;
    mutable.user = id === undefined || id === null ? undefined : { id: String(id) };
  }

  for (const key of ["extra", "contexts", "tags"]) {
    if (mutable[key] !== undefined) {
      mutable[key] = sanitizeUnknown(mutable[key], key);
    }
  }

  if (mutable.breadcrumbs !== undefined) {
    mutable.breadcrumbs = scrubBreadcrumbs(mutable.breadcrumbs);
  }

  if (mutable.exception !== undefined) {
    scrubExceptions(mutable.exception);
  }

  if (mutable.spans !== undefined) {
    mutable.spans = scrubSpans(mutable.spans);
  }

  // Stack frames, trace ids, timing and span relationships remain intact.
  // Only URL-bearing descriptions and span data/tags are sanitized.
}

export function parseTelemetrySampleRate(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}
