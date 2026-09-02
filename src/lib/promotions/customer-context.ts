import { normalizeCustomerPhone } from "@/lib/customer-account";
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
