import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { CUSTOMER_SESSION_COOKIE, hashCustomerSessionToken } from "@/lib/customer-account";

export async function GET(request: Request) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "public:customer:profile",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ customer: null });

  const adminSupabase = createAdminClient() as any;
  const { data: session } = await adminSupabase
    .from("customer_phone_sessions")
    .select("auth_user_id, expires_at")
    .eq("token_hash", hashCustomerSessionToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!session) {
    const response = NextResponse.json({ customer: null });
    response.cookies.delete(CUSTOMER_SESSION_COOKIE);
    return response;
  }

  const [{ data: profile }, { data: addresses }] = await Promise.all([
    adminSupabase.from("profiles").select("name, phone").eq("id", session.auth_user_id).maybeSingle(),
    adminSupabase
      .from("customer_addresses")
      .select("id, label, cep, street, number, neighborhood, city, state, complement")
      .eq("user_id", session.auth_user_id)
      .order("updated_at", { ascending: false }),
  ]);

  return NextResponse.json({
    customer: profile ? { name: profile.name || "", phone: profile.phone || "" } : null,
    addresses: addresses || [],
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (token) {
    const adminSupabase = createAdminClient() as any;
    await adminSupabase
      .from("customer_phone_sessions")
      .delete()
      .eq("token_hash", hashCustomerSessionToken(token));
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete(CUSTOMER_SESSION_COOKIE);
  return response;
}
