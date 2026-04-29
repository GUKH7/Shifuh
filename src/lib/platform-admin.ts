export function getPlatformAdminEmails() {
  return (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email?: string | null) {
  if (!email) return false;
  return getPlatformAdminEmails().includes(email.toLowerCase());
}
