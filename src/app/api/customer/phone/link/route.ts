import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeCustomerPhone } from "@/lib/customer-account";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type LinkPhonePayload = {
  verificationAccessToken?: string;
};

type AuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  phone_confirmed_at?: string | null;
};

function jsonError(code: string, error: string, status: number) {
  return NextResponse.json({ code, error }, { status });
}

async function hasPrivilegedOwnership(adminSupabase: any, userId: string) {
  const checks = await Promise.all([
    adminSupabase.from("restaurant_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
    adminSupabase.from("platform_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
    adminSupabase.from("restaurants").select("id", { count: "exact", head: true }).eq("user_id", userId),
    adminSupabase.from("promotion_campaigns").select("id", { count: "exact", head: true }).eq("created_by", userId),
    adminSupabase.from("loyalty_programs").select("id", { count: "exact", head: true }).eq("created_by", userId),
    adminSupabase.from("loyalty_rewards").select("id", { count: "exact", head: true }).eq("created_by", userId),
  ]);

  return checks.some((result) => result.error || Number(result.count || 0) > 0);
}

async function migrateDisposableCustomerIdentity(
  adminSupabase: any,
  sourceUserId: string,
  targetUserId: string,
) {
  const { data: sourceProfile } = await adminSupabase
    .from("profiles")
    .select("name")
    .eq("id", sourceUserId)
    .maybeSingle();

  const migrations = await Promise.all([
    adminSupabase.from("customer_addresses").update({ user_id: targetUserId }).eq("user_id", sourceUserId),
    adminSupabase.from("customer_phone_sessions").update({ auth_user_id: targetUserId }).eq("auth_user_id", sourceUserId),
    adminSupabase.from("orders").update({ user_id: targetUserId }).eq("user_id", sourceUserId),
    adminSupabase.from("reviews").update({ user_id: targetUserId }).eq("user_id", sourceUserId),
  ]);

  const failedMigration = migrations.find((result) => result.error);
  if (failedMigration?.error) throw failedMigration.error;

  return sourceProfile?.name || "";
}

async function upsertPhoneAccount(adminSupabase: any, userId: string, phone: string) {
  const { data: currentAccount, error: lookupError } = await adminSupabase
    .from("customer_phone_accounts")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (currentAccount?.id) {
    const { error } = await adminSupabase
      .from("customer_phone_accounts")
      .update({ phone, updated_at: new Date().toISOString() })
      .eq("id", currentAccount.id);
    if (error) throw error;
    return;
  }

  const { error } = await adminSupabase.from("customer_phone_accounts").insert({
    auth_user_id: userId,
    phone,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function POST(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "customer:phone:link",
    limit: 8,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  let body: LinkPhonePayload = {};
  try {
    body = (await request.json()) as LinkPhonePayload;
  } catch {
    // An already verified account may sync without a secondary token.
  }

  const supabase = await createClient();
  const { data: { user: currentUser }, error: currentUserError } = await supabase.auth.getUser();
  if (currentUserError || !currentUser?.id) {
    return jsonError("CUSTOMER_LOGIN_REQUIRED", "Entre na sua conta para confirmar o telefone.", 401);
  }

  const adminSupabase = createAdminClient() as any;
  let proofUser = currentUser as AuthUser;

  if (body.verificationAccessToken) {
    if (body.verificationAccessToken.length > 4096) {
      return jsonError("INVALID_PHONE_VERIFICATION", "A verificação do telefone é inválida.", 400);
    }

    const { data: proofResult, error: proofError } = await adminSupabase.auth.getUser(
      body.verificationAccessToken,
    );
    if (proofError || !proofResult?.user?.id) {
      return jsonError("INVALID_PHONE_VERIFICATION", "O código expirou ou não pôde ser validado.", 401);
    }
    proofUser = proofResult.user as AuthUser;
  }

  const normalizedPhone = normalizeCustomerPhone(proofUser.phone || "");
  if (!normalizedPhone || !proofUser.phone_confirmed_at) {
    return jsonError("PHONE_NOT_VERIFIED", "Confirme o código enviado ao seu telefone.", 401);
  }

  if (proofUser.id !== currentUser.id && proofUser.email) {
    return jsonError(
      "PHONE_ALREADY_LINKED",
      "Este telefone já está associado a outra conta. Entre nessa conta para continuar.",
      409,
    );
  }

  const [{ data: phoneAccount, error: phoneAccountError }, { data: targetProfile }] = await Promise.all([
    adminSupabase
      .from("customer_phone_accounts")
      .select("auth_user_id")
      .eq("phone", normalizedPhone)
      .maybeSingle(),
    adminSupabase.from("profiles").select("name").eq("id", currentUser.id).maybeSingle(),
  ]);

  if (phoneAccountError) {
    return jsonError("PHONE_LINK_UNAVAILABLE", "Não foi possível vincular o telefone agora.", 503);
  }

  const mappedUserId = phoneAccount?.auth_user_id || null;
  if (mappedUserId && mappedUserId !== currentUser.id && mappedUserId !== proofUser.id) {
    return jsonError(
      "PHONE_ALREADY_LINKED",
      "Este telefone já está associado a outra conta. Entre nessa conta para continuar.",
      409,
    );
  }

  let recoveredName = "";
  const sourceUserIds = [...new Set([proofUser.id, mappedUserId].filter(
    (userId): userId is string => Boolean(userId && userId !== currentUser.id),
  ))];

  try {
    for (const sourceUserId of sourceUserIds) {
      const { data: sourceAuthResult, error: sourceAuthError } = await adminSupabase.auth.admin.getUserById(sourceUserId);
      const sourceAuthUser = sourceAuthResult?.user as AuthUser | undefined;
      if (sourceAuthError || !sourceAuthUser) continue;

      if (sourceAuthUser.email || await hasPrivilegedOwnership(adminSupabase, sourceUserId)) {
        return jsonError(
          "PHONE_ALREADY_LINKED",
          "Este telefone já está associado a outra conta. Entre nessa conta para continuar.",
          409,
        );
      }

      recoveredName = recoveredName || await migrateDisposableCustomerIdentity(
        adminSupabase,
        sourceUserId,
        currentUser.id,
      );

      const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(sourceUserId);
      if (deleteError) throw deleteError;
    }

    const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(currentUser.id, {
      phone: normalizedPhone,
      phone_confirm: true,
    });
    if (authUpdateError) throw authUpdateError;

    await upsertPhoneAccount(adminSupabase, currentUser.id, normalizedPhone);

    const { error: profileError } = await adminSupabase.from("profiles").upsert({
      id: currentUser.id,
      name: targetProfile?.name || recoveredName || currentUser.user_metadata?.name || null,
      email: currentUser.email || null,
      phone: normalizedPhone,
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      phone: normalizedPhone,
    });
  } catch (error) {
    console.error("Falha ao reconciliar identidade do cliente:", error);
    return jsonError("PHONE_LINK_UNAVAILABLE", "Não foi possível concluir a confirmação agora. Tente novamente.", 503);
  }
}
