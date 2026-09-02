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

export async function resolveCustomerPromotionContext(adminSupabase: any): Promise<CustomerPromotionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  let authUserId: string | null = null;

  if (token) {
    const { data: session } = await adminSupabase
      .from("customer_phone_sessions")
      .select("auth_user_id, expires_at")
      .eq("token_hash", hashCustomerSessionToken(token))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    authUserId = session?.auth_user_id || null;
  }

  if (!authUserId) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    authUserId = user?.id || null;
  }

  if (!authUserId) return null;
  return buildPromotionContext(adminSupabase, authUserId);
}

/**
 * Sensitive promotion actions must not trust the checkout-created customer cookie by itself.
 * An authenticated Supabase session is accepted directly. A cookie-only session is accepted
 * only when its backing Auth user has a confirmed phone number.
 */
export async function resolveVerifiedCustomerPromotionContext(
  adminSupabase: any,
): Promise<CustomerPromotionContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user?.id) {
    return buildPromotionContext(adminSupabase, user.id);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data: session } = await adminSupabase
    .from("customer_phone_sessions")
    .select("auth_user_id, expires_at")
    .eq("token_hash", hashCustomerSessionToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!session?.auth_user_id) return null;

  const { data: authUserResult, error } = await adminSupabase.auth.admin.getUserById(session.auth_user_id);
  const sessionUser = authUserResult?.user;
  if (error || !sessionUser?.phone_confirmed_at) return null;

  return buildPromotionContext(adminSupabase, session.auth_user_id);
}
