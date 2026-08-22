import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email) {
  console.error("Uso: node scripts/bootstrap-platform-owner.mjs owner@exemplo.com");
  process.exit(1);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count: activeOwners, error: ownerCountError } = await supabase
  .from("platform_members")
  .select("user_id", { count: "exact", head: true })
  .eq("role", "owner")
  .eq("is_active", true);

if (ownerCountError) throw ownerCountError;
if ((activeOwners ?? 0) > 0) {
  console.error("Bootstrap recusado: já existe um owner ativo da plataforma.");
  process.exit(1);
}

let matchedUser = null;
let page = 1;
while (!matchedUser && page <= 10) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;

  matchedUser = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 100) break;
  page += 1;
}

if (!matchedUser) {
  console.error("Bootstrap recusado: não existe usuário autenticado com esse email.");
  process.exit(1);
}

const now = new Date().toISOString();
const { error: insertError } = await supabase.from("platform_members").insert({
  user_id: matchedUser.id,
  role: "owner",
  is_active: true,
  created_by: matchedUser.id,
  created_at: now,
  updated_at: now,
});
if (insertError) throw insertError;

const { error: auditError } = await supabase.from("platform_audit_log").insert({
  actor_user_id: matchedUser.id,
  actor_role: "owner",
  action: "platform_owner.bootstrap",
  target_type: "platform_member",
  target_id: matchedUser.id,
  metadata: { provisioned_by: "bootstrap-script" },
});

if (auditError) {
  await supabase.from("platform_members").delete().eq("user_id", matchedUser.id);
  throw auditError;
}

console.log("Owner inicial da plataforma provisionado com sucesso.");
