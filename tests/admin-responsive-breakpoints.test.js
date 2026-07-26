const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const layout = fs.readFileSync(
  path.join(root, "src", "app", "admin", "(painel)", "layout.tsx"),
  "utf8",
);
const sidebar = fs.readFileSync(
  path.join(root, "src", "components", "admin-sidebar.tsx"),
  "utf8",
);
const responsiveCss = fs.readFileSync(
  path.join(root, "src", "app", "admin", "(painel)", "admin-responsive.css"),
  "utf8",
);

test("admin layout uses mobile-first breakpoints instead of a permanent sidebar offset", () => {
  assert.match(layout, /isMobileSidebarOpen/);
  assert.match(layout, /lg:ml-16/);
  assert.match(layout, /lg:ml-56/);
  assert.match(layout, /lg:hidden/);
  assert.match(layout, /sm:px-4 sm:py-5 md:px-5 lg:px-6/);
  assert.match(layout, /admin-panel-content/);
  assert.doesNotMatch(layout, /\$\{isCollapsed \? "ml-16" : "ml-56"\}/);
});

test("sidebar becomes a drawer below the desktop breakpoint", () => {
  assert.match(sidebar, /isMobileOpen \? "translate-x-0" : "-translate-x-full"/);
  assert.match(sidebar, /lg:translate-x-0/);
  assert.match(sidebar, /lg:w-16/);
  assert.match(sidebar, /lg:w-56/);
  assert.match(sidebar, /aria-label="Fechar menu lateral"/);
  assert.match(sidebar, /lg:hidden/);
});

test("responsive stylesheet defines phone, tablet and desktop-transition breakpoints", () => {
  assert.match(responsiveCss, /@media \(max-width: 639px\)/);
  assert.match(responsiveCss, /@media \(max-width: 767px\)/);
  assert.match(responsiveCss, /@media \(max-width: 1023px\)/);
  assert.match(responsiveCss, /grid-cols-\[88px_1\.1fr_1fr_minmax\(118px,0\.9fr\)_0\.9fr_140px_132px\]/);
  assert.match(responsiveCss, /grid-cols-\[1\.3fr_1fr_120px_160px_140px_110px\]/);
});
