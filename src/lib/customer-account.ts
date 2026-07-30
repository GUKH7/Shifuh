import { createHash, randomBytes } from "node:crypto";

export const CUSTOMER_SESSION_COOKIE = "gestor_customer_session";
const CUSTOMER_SESSION_DAYS = 180;

type CheckoutAddress = {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
};

export function normalizeCustomerPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const nationalNumber = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (!/^\d{10,11}$/.test(nationalNumber)) return null;
  return `+55${nationalNumber}`;
}

export function hashCustomerSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureCustomerAccount(
  adminSupabase: any,
  input: { name: string; phone: string; address: CheckoutAddress; authenticatedUserId?: string | null },
) {
  const phone = normalizeCustomerPhone(input.phone);
  if (!phone) return null;

  let authUserId = input.authenticatedUserId || null;
  const { data: existingAccount, error: accountLookupError } = await adminSupabase
    .from("customer_phone_accounts")
    .select("auth_user_id")
    .eq("phone", phone)
    .maybeSingle();
  if (accountLookupError) throw accountLookupError;

  authUserId = existingAccount?.auth_user_id || authUserId;

  if (!authUserId) {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      phone,
      phone_confirm: false,
      user_metadata: { name: input.name },
    });
    if (error || !data?.user?.id) throw error || new Error("Não foi possível criar a conta do cliente.");
    authUserId = data.user.id;
  }

  const { error: accountUpsertError } = await adminSupabase.from("customer_phone_accounts").upsert(
    { auth_user_id: authUserId, phone, updated_at: new Date().toISOString() },
    { onConflict: "phone" },
  );
  if (accountUpsertError) throw accountUpsertError;
  await adminSupabase.from("profiles").upsert({
    id: authUserId,
    name: input.name.trim(),
    phone,
    updated_at: new Date().toISOString(),
  });

  const { data: existingAddress } = await adminSupabase
    .from("customer_addresses")
    .select("id")
    .eq("user_id", authUserId)
    .eq("cep", input.address.cep)
    .eq("street", input.address.street)
    .eq("number", input.address.number)
    .eq("complement", input.address.complement || "")
    .maybeSingle();

  if (!existingAddress) {
    await adminSupabase.from("customer_addresses").insert({
      user_id: authUserId,
      cep: input.address.cep,
      street: input.address.street,
      number: input.address.number,
      neighborhood: input.address.neighborhood,
      city: input.address.city,
      state: input.address.state,
      complement: input.address.complement,
    });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000);
  await adminSupabase.from("customer_phone_sessions").insert({
    auth_user_id: authUserId,
    token_hash: hashCustomerSessionToken(token),
    expires_at: expiresAt.toISOString(),
  });

  return { token, expiresAt, maxAge: CUSTOMER_SESSION_DAYS * 24 * 60 * 60 };
}
