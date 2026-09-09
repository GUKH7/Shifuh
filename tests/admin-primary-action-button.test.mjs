import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const primitives = fs.readFileSync("src/components/ui/admin-primitives.tsx", "utf8");
const coupons = fs.readFileSync("src/app/admin/(painel)/coupons/CouponsWorkspace.tsx", "utf8");

test("AdminButton possui CTA primário sólido com a cor da marca", () => {
  assert.match(primitives, /type AdminButtonVariant = "primary"/);
  assert.match(
    primitives,
    /primary:\s*\n\s*"border border-\[var\(--brand\)\] bg-\[var\(--brand\)\] text-white/,
  );
  assert.match(primitives, /hover:bg-\[#e94e17\]/);
  assert.match(primitives, /focus-visible:ring-orange-100/);
});

test("Criar cupom usa o CTA primário sem classes legadas pretas", () => {
  assert.match(coupons, /<AdminButton type="submit" variant="primary" disabled=\{creating\}>/);
  assert.match(coupons, /Criar cupom/);
  assert.doesNotMatch(coupons, /bg-\[#171311\]/);
  assert.doesNotMatch(coupons, /hover:bg-black/);
});
