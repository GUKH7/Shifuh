export function sanitizeCustomerReturnUrl(value: string | null | undefined, fallback = "/") {
  const candidate = value?.trim() || "";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}

export function buildCustomerPhoneVerificationUrl(returnUrl: string) {
  return `/auth/phone?returnUrl=${encodeURIComponent(sanitizeCustomerReturnUrl(returnUrl))}`;
}
