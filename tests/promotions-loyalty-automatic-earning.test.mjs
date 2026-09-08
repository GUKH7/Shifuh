import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260908122000_loyalty_automatic_earning.sql",
  "utf8",
);

test("pedido concluído dispara acúmulo apenas na primeira chegada a done", () => {
  assert.match(migration, /after insert or update of status on public\.orders/);
  assert.match(migration, /when \(new\.status = 'done'\)/);
  assert.match(migration, /if tg_op = 'UPDATE' then/);
  assert.match(migration, /if old\.status = 'done' then/);
  assert.match(migration, /coalesce\(new\.is_test, false\)/);
});

test("somente programa ativo e pedido mínimo elegível acumulam pontos", () => {
  assert.match(migration, /lp\.status = 'active'/);
  assert.match(migration, /v_eligible_spend := greatest/);
  assert.match(migration, /coalesce\(new\.subtotal, 0\)::numeric - coalesce\(new\.discount, 0\)::numeric/);
  assert.match(migration, /v_eligible_spend < coalesce\(v_program\.minimum_order_amount, 0\)/);
});

test("modo por valor usa faixas completas e modo por pedido usa crédito fixo", () => {
  assert.match(migration, /v_program\.earning_mode = 'spend'/);
  assert.match(migration, /floor\(v_eligible_spend \/ v_program\.spend_amount\)::bigint/);
  assert.match(migration, /v_program\.points_per_spend::bigint/);
  assert.match(migration, /v_program\.earning_mode = 'order'/);
  assert.match(migration, /v_program\.points_per_order, 0\)::bigint/);
  assert.match(migration, /if v_points <= 0 then/);
});

test("cliente é resolvido dentro do tenant mesmo com telefone formatado", () => {
  assert.match(migration, /regexp_replace\(coalesce\(new\.customer_phone, ''\), '\\D', '', 'g'\)/);
  assert.match(migration, /c\.restaurant_id = new\.restaurant_id/);
  assert.match(migration, /regexp_replace\(coalesce\(c\.phone, ''\), '\\D', '', 'g'\) = v_phone/);
  assert.match(migration, /on conflict \(restaurant_id, phone\) do update/);
});

test("carteira é criada e crédito auditável referencia pedido e validade", () => {
  assert.match(migration, /insert into public\.loyalty_accounts/);
  assert.match(migration, /on conflict \(program_id, customer_id\) do nothing/);
  assert.match(migration, /insert into public\.loyalty_point_transactions/);
  assert.match(migration, /'earn'/);
  assert.match(migration, /new\.id,/);
  assert.match(migration, /loyalty:earn:order:/);
  assert.match(migration, /make_interval\(days => v_program\.points_validity_days\)/);
  assert.match(migration, /'eligible_spend', v_eligible_spend/);
  assert.match(migration, /'external_source', new\.external_source/);
});

test("ledger descarta retry antes de alterar o saldo", () => {
  const lockIndex = migration.indexOf("pg_advisory_xact_lock");
  const duplicateIndex = migration.indexOf("if exists (\n    select 1\n    from public.loyalty_point_transactions lpt");
  const balanceUpdateIndex = migration.indexOf("update public.loyalty_accounts");

  assert.ok(lockIndex >= 0, "advisory lock ausente");
  assert.ok(duplicateIndex > lockIndex, "checagem idempotente deve ocorrer após o lock");
  assert.ok(balanceUpdateIndex > duplicateIndex, "saldo só pode mudar depois da checagem idempotente");
  assert.match(migration, /return null;/);
  assert.match(migration, /v_account\.restaurant_id::text \|\| ':' \|\| v_idempotency_key/);
});

test("função de acúmulo não é exposta ao navegador", () => {
  assert.match(
    migration,
    /revoke all on function app_private\.award_loyalty_points_for_completed_order\(\) from public, anon, authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute on function app_private\.award_loyalty_points_for_completed_order\(\) to authenticated/);
});
