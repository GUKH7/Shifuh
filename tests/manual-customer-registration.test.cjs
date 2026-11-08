"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const sql = fs.readFileSync(path.join(root,"supabase/migrations/20261108130000_register_manual_loyalty_customer.sql"),"utf8");
const ui = fs.readFileSync(path.join(root,"src/features/loyalty/QuickCustomerRegistration.tsx"),"utf8");
const parent = fs.readFileSync(path.join(root,"src/features/loyalty/ManualLoyaltyCredit.tsx"),"utf8");
const workflow = fs.readFileSync(path.join(root,".github/workflows/ci.yml"),"utf8");

test("owner-only RPC enforces tenant scope, validated phone, active loyalty and reuses existing records",()=>{
  assert.match(sql,/m\.user_id\s*=\s*v_actor/);
  assert.match(sql,/m\.role\s*=\s*'owner'/);
  assert.match(sql,/m\.is_default\s*=\s*true/);
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path = ''/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/regexp_replace\(c\.phone/);
  assert.match(sql,/where c\.restaurant_id = v_restaurant/g);
  assert.match(sql,/on conflict \(restaurant_id, phone\) do nothing/);
  assert.match(sql,/loyalty_programs/);
  assert.match(sql,/was_existing boolean/);
});

test("RPC never exposes direct INSERT or grants points during customer registration",()=>{
  assert.match(sql,/revoke all on function public\.register_manual_loyalty_customer\(text, text\) from public/);
  assert.match(sql,/revoke all on function public\.register_manual_loyalty_customer\(text, text\) from anon/);
  assert.match(sql,/grant execute on function public\.register_manual_loyalty_customer\(text, text\) to authenticated/);
  assert.doesNotMatch(sql,/create policy|grant insert on public\.customers/i);
  assert.doesNotMatch(sql,/insert into public\.loyalty_point_transactions|update public\.loyalty_accounts/i);
});

test("new customer UX uses audited RPC and always requires separate credit confirmation",()=>{
  assert.match(ui,/\.rpc\("register_manual_loyalty_customer"/);
  assert.doesNotMatch(ui,/\.from\("customers"\)\.insert|\.rpc\("credit_loyalty_points_manual"/);
  assert.match(ui,/onRegistered\(/);
  assert.match(ui,/aria-label="Cadastrar cliente presencial"/);
  assert.match(ui,/disabled=\{busy \|\| disabled\}/);
  assert.match(parent,/<QuickCustomerRegistration/);
  assert.match(parent,/setCustomerId\(customer.id\)/);
  assert.match(parent,/setConfirmation\(false\)/);
  assert.ok(parent.includes('setRequestId("");'));
});

test("local-only commercial CI includes registration mobile and backend permission tests",()=>{
  assert.match(workflow,/manual-customer-registration\.spec\.ts/);
  assert.match(workflow,/manual-customer-registration-homologation\.mjs/);
});
