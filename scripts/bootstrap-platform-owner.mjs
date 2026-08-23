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

let matchedUser = null;
let page = 1;
while (!matchedUser) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;

  matchedUser = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  if (matchedUser || data.users.length < 100) break;
  page += 1;
}

if (!matchedUser) {
  console.error("Bootstrap recusado: não existe usuário autenticado com esse email.");
  process.exit(1);
}

const { data: status, error: bootstrapError } = await supabase.rpc(
  "bootstrap_platform_owner_admin",
  { p_user_id: matchedUser.id },
);
if (bootstrapError) throw bootstrapError;

if (status === "already_initialized") {
  console.error("Bootstrap recusado: já existe um owner ativo da plataforma.");
  process.exit(1);
}

if (status === "user_not_found") {
  console.error("Bootstrap recusado: o usuário autenticado não existe mais.");
  process.exit(1);
}

if (status !== "created") {
  throw new Error("Resultado inválido ao provisionar o owner inicial da plataforma.");
}

console.log("Owner inicial da plataforma provisionado com sucesso.");
