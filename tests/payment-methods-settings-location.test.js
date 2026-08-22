const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (path) => fs.readFileSync(path, "utf8");

test("formas de pagamento ficam dentro de configurações", () => {
  const [settingsPage, settingsSections, oldRoute, sidebar] = [
    read("src/app/admin/(painel)/settings/payments/page.tsx"),
    read("src/features/settings/SettingsSections.tsx"),
    read("src/app/admin/(painel)/payments/page.tsx"),
    read("src/components/admin-sidebar.tsx"),
  ];

  assert.match(settingsPage, /title="Formas de pagamento"/);
  assert.match(settingsPage, /accepted_payment_methods/);
  assert.match(settingsSections, /Formas de pagamento/);
  assert.match(settingsSections, /href="\/admin\/settings\/payments"/);
  assert.match(oldRoute, /redirect\("\/admin\/settings\/payments"\)/);
  assert.doesNotMatch(sidebar, /href:\s*"\/admin\/payments"/);
  assert.match(sidebar, /pathname\.startsWith\("\/admin\/settings"\)/);
});
