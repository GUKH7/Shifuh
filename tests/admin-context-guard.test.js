const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const layout = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "admin", "(painel)", "layout.tsx"),
  "utf8",
);

test("guard administrativo não renderiza filhos quando contexto falha", () => {
  assert.match(layout, /const \[guardError, setGuardError\]/);
  assert.match(layout, /setGuardError\("ADMIN_CONTEXT_UNAVAILABLE"\)/);
  assert.match(layout, /if \(guardError\) return <AdminGuardError/);
  assert.match(layout, /O painel permanece bloqueado/);
});

test("redirecionamentos do guard não liberam conteúdo protegido antes da navegação", () => {
  const contextLoader = layout.slice(
    layout.indexOf("const loadAdminContext = async"),
    layout.indexOf("void loadAdminContext"),
  );
  const routeGuardStart = layout.indexOf("const restaurant = adminContext.restaurant");
  const routeGuard = layout.slice(routeGuardStart, layout.indexOf("const toggleSidebar", routeGuardStart));

  assert.doesNotMatch(contextLoader, /finally[\s\S]*setIsGuardLoading\(false\)/);
  assert.match(contextLoader, /response\.status === 401[\s\S]*router\.replace\("\/admin\/login"\)[\s\S]*return/s);
  assert.match(routeGuard, /if \(isPlatformPage && !hasPlatformAccess\)[\s\S]*router\.replace\("\/admin"\)[\s\S]*return/s);
  assert.match(routeGuard, /if \(!restaurant && !isSetupPage && !isPlatformPage\)[\s\S]*router\.replace\("\/admin\/setup"\)[\s\S]*return/s);
  assert.match(routeGuard, /setIsGuardLoading\(false\)/);
});
