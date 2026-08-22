const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const MIGRATION = "supabase/migrations/20260822145500_platform_admin_rbac_and_soft_delete.sql";

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

test("migration cria RBAC isolado audit log imutável e bloqueia lojas arquivadas", () => {
  const migration = read(MIGRATION);

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

test("audit log cobre mudanças de loja e de RBAC", () => {
  const updateRoute = read("src/app/api/platform/restaurants/[id]/route.ts");
  const restoreRoute = read("src/app/api/platform/restaurants/[id]/restore/route.ts");
  const memberCreate = read("src/app/api/platform/members/route.ts");
  const memberUpdate = read("src/app/api/platform/members/[userId]/route.ts");

  for (const source of [updateRoute, restoreRoute, memberCreate, memberUpdate]) {
    assert.match(source, /writePlatformAuditLog/);
  }
  assert.match(updateRoute, /restaurant\.update/);
  assert.match(updateRoute, /restaurant\.archive/);
  assert.match(restoreRoute, /restaurant\.restore/);
  assert.match(memberCreate, /platform_member\.create/);
  assert.match(memberUpdate, /platform_member\.update/);
  assert.match(memberUpdate, /pelo menos um owner ativo/);
});

test("frontend consulta o acesso server-side e oferece arquivo restauração e auditoria", () => {
  const sidebar = read("src/components/admin-sidebar.tsx");
  const layout = read("src/app/admin/(painel)/layout.tsx");
  const page = read("src/app/admin/(painel)/platform/page.tsx");

  assert.match(sidebar, /fetch\(["']\/api\/platform\/access/);
  assert.doesNotMatch(sidebar, /user\?\.email/);
  assert.match(layout, /pathname\.startsWith\(["']\/admin\/platform["']\)/);
  assert.match(page, /Lojas/);
  assert.match(page, /Equipe/);
  assert.match(page, /Auditoria/);
  assert.match(page, /Arquivar/);
  assert.match(page, /Restaurar/);
});

test("bootstrap do primeiro owner é one-shot e não participa da autorização runtime", () => {
  const bootstrap = read("scripts/bootstrap-platform-owner.mjs");
  const runtime = read("src/lib/platform-admin.ts");

  assert.match(bootstrap, /já existe um owner ativo/);
  assert.match(bootstrap, /platform_owner\.bootstrap/);
  assert.doesNotMatch(runtime, /email/i);
});
