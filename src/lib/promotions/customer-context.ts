import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, hashCustomerSessionToken, normalizeCustomerPhone } from "@/lib/customer-account";
import { createClient } from "@/lib/supabase/server";

export type CustomerPromotionContext = {
  authUserId: string;
  phone: string;
  normalizedPhone: string;
  name: string;
};

async function buildPromotionContext(adminSupabase: any, authUserId: string): Promise<CustomerPromotionContext | null> {
  const [{ data: account }, { data: profile }] = await Promise.all([
    adminSupabase
      .from("customer_phone_accounts")
      .select("phone")
      .eq("auth_user_id", authUserId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from("profiles")
      .select("name")
      .eq("id", authUserId)
      .maybeSingle(),
  ]);

  const normalizedPhone = normalizeCustomerPhone(account?.phone || "");
  if (!normalizedPhone) return null;

  return {
    authUserId,
    phone: normalizedPhone.slice(3),
    normalizedPhone,
    name: profile?.name || "",
  };
}

async function resolveCookieAuthUserId(adminSupabase: any) {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data: session } = await adminSupabase
    .from("customer_phone_sessions")
    .select("auth_user_id, expires_at")
    .eq("token_hash", hashCustomerSessionToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return session?.auth_user_id || null;
}

async function buildVerifiedPromotionContext(
  adminSupabase: any,
  authUserId: string,
): Promise<CustomerPromotionContext | null> {
  const context = await buildPromotionContext(adminSupabase, authUserId);
  if (!context) return null;

  const { data: authUserResult, error } = await adminSupabase.auth.admin.getUserById(authUserId);
  const authUser = authUserResult?.user;
  if (error || !authUser?.phone_confirmed_at) return null;

  const verifiedPhone = normalizeCustomerPhone(authUser.phone || "");
  if (!verifiedPhone || verifiedPhone !== context.normalizedPhone) return null;

  return context;
}

/**
 * Promotion state and rewards are sensitive customer data. The automatic checkout cookie
 * is only an account convenience and never proves phone ownership by itself. A promotion
 * context is accepted only when the backing Supabase Auth user has a confirmed phone and
 * that verified number matches the phone-account mapping used by the restaurant customer.
 */
export async function resolveVerifiedCustomerPromotionContext(
  adminSupabase: any,
): Promise<CustomerPromotionContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const authUserId = user?.id || await resolveCookieAuthUserId(adminSupabase);
  if (!authUserId) return null;

  return buildVerifiedPromotionContext(adminSupabase, authUserId);
}

/**
 * Keep the existing API name for promotion routes, but make its security contract verified.
 */
export async function resolveCustomerPromotionContext(
  adminSupabase: any,
): Promise<CustomerPromotionContext | null> {
  return resolveVerifiedCustomerPromotionContext(adminSupabase);
}
