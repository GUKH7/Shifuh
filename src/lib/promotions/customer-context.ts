import { normalizeCustomerPhone } from "@/lib/customer-account";
import { createClient } from "@/lib/supabase/server";

export type CustomerPromotionContext = {
  authUserId: string;
  phone: string;
  normalizedPhone: string;
  name: string;
};

export type CustomerPromotionIdentityStatus =
  | "verified"
  | "unauthenticated"
  | "phone_unverified"
  | "phone_account_missing"
  | "phone_mismatch";

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
 * Returns only the minimum identity state required for customer-facing guidance.
 * It never exposes the phone number, account mapping or customer data.
 */
export async function getCustomerPromotionIdentityStatus(
  adminSupabase: any,
): Promise<CustomerPromotionIdentityStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return "unauthenticated";

  const [{ data: account }, { data: authUserResult, error }] = await Promise.all([
    adminSupabase
      .from("customer_phone_accounts")
      .select("phone")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminSupabase.auth.admin.getUserById(user.id),
  ]);

  const authUser = authUserResult?.user;
  if (error || !authUser?.phone_confirmed_at) return "phone_unverified";

  const accountPhone = normalizeCustomerPhone(account?.phone || "");
  if (!accountPhone) return "phone_account_missing";

  const verifiedPhone = normalizeCustomerPhone(authUser.phone || "");
  if (!verifiedPhone) return "phone_unverified";
  if (verifiedPhone !== accountPhone) return "phone_mismatch";

  return "verified";
}

/**
 * Promotion state and rewards are sensitive customer data. Only the active Supabase Auth
 * session may establish customer identity here. Checkout-created customer cookies are
 * intentionally ignored because they are account conveniences and do not prove that the
 * current browser completed phone verification.
 */
export async function resolveVerifiedCustomerPromotionContext(
  adminSupabase: any,
): Promise<CustomerPromotionContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;

  return buildVerifiedPromotionContext(adminSupabase, user.id);
}

/**
 * Keep the existing API name for promotion routes, but make its security contract verified.
 */
export async function resolveCustomerPromotionContext(
  adminSupabase: any,
): Promise<CustomerPromotionContext | null> {
  return resolveVerifiedCustomerPromotionContext(adminSupabase);
}
