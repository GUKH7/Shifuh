import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, hashCustomerSessionToken, normalizeCustomerPhone } from "@/lib/customer-account";
import { createClient } from "@/lib/supabase/server";

export type CustomerPromotionContext = {
  authUserId: string;
  phone: string;
  normalizedPhone: string;
  name: string;
};

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

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("name, phone")
    .eq("id", authUserId)
    .maybeSingle();

  const normalizedPhone = normalizeCustomerPhone(profile?.phone || "");
  if (!normalizedPhone) return null;

  return {
    authUserId,
    phone: normalizedPhone.slice(3),
    normalizedPhone,
    name: profile?.name || "",
  };
}
