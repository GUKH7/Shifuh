const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const BASE_MIGRATION = "supabase/migrations/20260822145500_platform_admin_rbac_and_soft_delete.sql";
const HARDENING_MIGRATION = "supabase/migrations/20260823090000_harden_platform_admin_soft_delete.sql";
const ORDER_GUARD_MIGRATION = "supabase/migrations/20260823090500_block_archived_storefront_orders.sql";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test("autorização da plataforma não depende mais de allowlist por email", () => {
  const runtimeFiles = walk("src").filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
  const runtimeSource = runtimeFiles.map(read).join("\n");
  const platformAdmin = read("src/lib/platform-admin.ts");

  assert.doesNotMatch(runtimeSource, /PLATFORM_ADMIN_EMAILS/);
  assert.doesNotMatch(runtimeSource, /NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS/);
  assert.doesNotMatch(runtimeSource, /isPlatformAdminEmail/);
  assert.match(platformAdmin, /platform_members/);
  assert.match(platformAdmin, /requirePlatformPermission/);
  assert.match(platformAdmin, /owner[\s\S]*admin[\s\S]*support[\s\S]*viewer/);
});

test("todas as rotas da plataforma usam autorização server-side por permissão", () => {
  const routes = walk("src/app/api/platform").filter((file) => file.endsWith("route.ts"));
  assert.ok(routes.length >= 6, "esperava o conjunto de rotas protegidas da plataforma");

  for (const route of routes) {
    const source = read(route);
    assert.match(source, /requirePlatformPermission\s*\(/, `${route} não exige permissão da plataforma`);
    assert.doesNotMatch(source, /isPlatformAdminEmail/);
  }
});

test("restaurantes usam soft delete e nunca hard delete na API da plataforma", () => {
  const route = read("src/app/api/platform/restaurants/[id]/route.ts");
  const restore = read("src/app/api/platform/restaurants/[id]/restore/route.ts");

  assert.match(route, /restaurants\.archive/);
  assert.match(route, /deleted_at/);
  assert.match(route, /deleted_by/);
  assert.doesNotMatch(route, /from\(["']restaurants["']\)\.delete\s*\(/);
  assert.match(restore, /restaurants\.restore/);
  assert.match(restore, /deleted_at:\s*null/);
});

test("migration cria RBAC isolado audit log imutável e soft delete recuperável", () => {
  const migration = read(BASE_MIGRATION);

  assert.match(migration, /create table if not exists public\.platform_members/);
  assert.match(migration, /role in \('owner', 'admin', 'support', 'viewer'\)/);
  assert.match(migration, /create table if not exists public\.platform_audit_log/);
  assert.match(migration, /alter table public\.platform_members enable row level security/);
  assert.match(migration, /alter table public\.platform_audit_log enable row level security/);
  assert.match(migration, /revoke all on table public\.platform_members from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert on table public\.platform_audit_log to service_role/);
  assert.match(migration, /platform_audit_log_immutable/);
  assert.match(migration, /add column if not exists deleted_at timestamptz/);
  assert.match(migration, /add column if not exists deleted_by uuid/);
  assert.match(migration, /from public\.restaurants r\s+where r\.deleted_at is null/);
  assert.match(migration, /Restaurant archived by platform administration/);
});

test("loja arquivada é bloqueada no RLS catálogo integrações storage e seleção padrão", () => {
  const migration = read(HARDENING_MIGRATION);

  assert.match(migration, /create or replace function app_private\.is_restaurant_active/);
  assert.match(migration, /create or replace function app_private\.is_active_restaurant_member/);
  assert.match(migration, /r\.deleted_at is null/);

  for (const table of [
    "categories",
    "products",
    "coupons",
    "customers",
    "orders",
    "order_items",
    "reviews",
    "storefront_checkout_events",
    "restaurant_subscriptions",
    "ifood_category_links",
    "ifood_integrations",
    "ifood_order_events",
    "ifood_product_links",
    "ifood_sync_runs",
  ]) {
    assert.match(migration, new RegExp(`public\\.${table.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
  }

  assert.match(migration, /on storage\.objects/);
  assert.match(migration, /is_active_restaurant_member_text/);
  assert.match(migration, /create or replace function app_private\.get_public_storefront_products/);
  assert.match(migration, /join public\.restaurants r[\s\S]+r\.deleted_at is null/);
  assert.match(migration, /create or replace function public\.set_default_restaurant/);
  assert.match(migration, /User is not a member of an active restaurant/);
});

test("pedidos novos são bloqueados dentro da transação quando a loja está arquivada", () => {
  const migration = read(ORDER_GUARD_MIGRATION);

  assert.match(migration, /create or replace function public\.create_storefront_order_transaction/);
  assert.match(migration, /from public\.restaurants[\s\S]+where id = p_restaurant_id[\s\S]+and deleted_at is null[\s\S]+for share/);
  assert.match(migration, /raise exception 'restaurant is unavailable'/);
  assert.match(migration, /grant execute on function public\.create_storefront_order_transaction[\s\S]+to service_role/);
});

test("endpoints públicos com service role escondem lojas arquivadas", () => {
  const paymentMethods = read("src/app/api/storefront/payment-methods/route.ts");
  const deliveryQuote = read("src/app/api/storefront/delivery-quote/route.ts");
  const checkoutEvents = read("src/app/api/storefront/checkout-events/route.ts");

  assert.match(paymentMethods, /\.is\(["']deleted_at["'],\s*null\)/);
  assert.match(deliveryQuote, /\.is\(["']deleted_at["'],\s*null\)/);
  assert.match(checkoutEvents, /\.is\(["']deleted_at["'],\s*null\)/);
});

test("alteração de owner é serializada e auditada atomicamente no banco", () => {
  const memberUpdate = read("src/app/api/platform/members/[userId]/route.ts");
  const migration = read(HARDENING_MIGRATION);

  assert.match(memberUpdate, /update_platform_member_admin/);
  assert.doesNotMatch(memberUpdate, /\.from\(["']platform_members["']\)[\s\S]*\.update\s*\(/);
  assert.match(migration, /create or replace function public\.update_platform_member_admin/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /platform-members:last-owner/);
  assert.match(migration, /for update/);
  assert.match(migration, /platform_member\.update/);
  assert.match(memberUpdate, /pelo menos um owner ativo/);
});

test("busca de usuário e bootstrap não possuem limite artificial de mil contas", () => {
  const memberCreate = read("src/app/api/platform/members/route.ts");
  const bootstrap = read("scripts/bootstrap-platform-owner.mjs");

  for (const source of [memberCreate, bootstrap]) {
    assert.doesNotMatch(source, /page\s*<=\s*10/);
    assert.match(source, /users\.length\s*<\s*100/);
  }
});

test("audit log cobre mudanças de loja e de RBAC", () => {
  const updateRoute = read("src/app/api/platform/restaurants/[id]/route.ts");
  const restoreRoute = read("src/app/api/platform/restaurants/[id]/restore/route.ts");
  const memberCreate = read("src/app/api/platform/members/route.ts");
  const memberUpdate = read("src/app/api/platform/members/[userId]/route.ts");
  const hardening = read(HARDENING_MIGRATION);

  for (const source of [updateRoute, restoreRoute, memberCreate]) {
    assert.match(source, /writePlatformAuditLog/);
  }
  assert.match(updateRoute, /restaurant\.update/);
  assert.match(updateRoute, /restaurant\.archive/);
  assert.match(restoreRoute, /restaurant\.restore/);
  assert.match(memberCreate, /platform_member\.create/);
  assert.match(memberUpdate, /update_platform_member_admin/);
  assert.match(hardening, /platform_member\.update/);
});

test("frontend recebe acesso server-side agrupado e oferece arquivo restauração e auditoria", () => {
  const sidebar = read("src/components/admin-sidebar.tsx");
  const layout = read("src/app/admin/(painel)/layout.tsx");
  const contextRoute = read("src/app/api/admin/context/route.ts");
  const page = read("src/app/admin/(painel)/platform/page.tsx");

  assert.match(layout, /fetch\(["']\/api\/admin\/context/);
  assert.match(layout, /context\.platformAccess/);
  assert.match(sidebar, /canAccessPlatform:\s*boolean/);
  assert.doesNotMatch(sidebar, /fetch\(["']\/api\/platform\/access/);
  assert.doesNotMatch(sidebar, /user\?\.email/);
  assert.match(contextRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(contextRoute, /get_admin_navigation_context_admin/);
  assert.match(layout, /pathname\.startsWith\(["']\/admin\/platform["']\)/);
  assert.match(page, /Lojas/);
  assert.match(page, /Equipe/);
  assert.match(page, /Auditoria/);
  assert.match(page, /Arquivar/);
  assert.match(page, /Restaurar/);
});

test("bootstrap do primeiro owner é one-shot transacional e não participa da autorização runtime", () => {
  const bootstrap = read("scripts/bootstrap-platform-owner.mjs");
  const hardening = read(HARDENING_MIGRATION);
  const runtime = read("src/lib/platform-admin.ts");

  assert.match(bootstrap, /bootstrap_platform_owner_admin/);
  assert.match(bootstrap, /já existe um owner ativo/);
  assert.match(hardening, /create or replace function public\.bootstrap_platform_owner_admin/);
  assert.match(hardening, /platform-members:bootstrap-owner/);
  assert.match(hardening, /platform_owner\.bootstrap/);
  assert.doesNotMatch(runtime, /email/i);
});
