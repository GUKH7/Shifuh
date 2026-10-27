"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const script=fs.readFileSync("scripts/ifood-ack-status-homologation.cjs","utf8");
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");
const dbTrigger=fs.readFileSync("supabase/migrations/20260725170000_guard_ifood_order_status_regression.sql","utf8");
const orderSync=fs.readFileSync("src/lib/ifood/order-sync.ts","utf8");

test("ACK ambiguity scenarios remain isolated from all remote providers",()=>{
 assert.match(script,/IFOOD_ACK_STATUS_E2E/);
 assert.match(script,/Refusing remote Supabase/);
 assert.match(script,/pollIfoodOrderEvents:async\(\)=>\[\]/);
 assert.match(script,/acknowledgeIfoodOrderEvents:async ids=>/);
 assert.match(ci,/IFOOD_ACK_STATUS_E2E: "1"/);
 assert.match(ci,/node scripts\/ifood-ack-status-homologation\.cjs/);
});
test("ACK accepted while DB write fails remains pending and is retried by ID",()=>{
 assert.match(script,/dbNoCommit=2/);
 assert.match(script,/acknowledged_at,null/);
 assert.match(script,/acknowledged_at\)/);
 assert.match(script,/Durably acknowledged ID cannot be resent/);
});
test("ACK commit with missing database response cannot trigger duplicate send",()=>{
 assert.match(script,/dbResponseLost=1/);
 assert.match(script,/DB ACK COMMIT is durable/);
 assert.match(script,/No duplicate ACK if the DB commit succeeded/);
});
test("iFood ACK accepted with HTTP 504 is eventually retried idempotently by ID",()=>{
 assert.match(script,/networkAfterAcceptance=2/);
 assert.match(script,/Provider accepted ACK even though response was lost/);
 assert.match(script,/Retry same ID after ambiguous provider response/);
});
test("DB trigger prevents stale events and terminal-state regression",()=>{
 assert.match(dbTrigger,/terminal_status_protected/);
 assert.match(dbTrigger,/status_regression_prevented/);
 assert.match(script,/Older PLACED may not undo CONFIRMED/);
 assert.match(script,/Conflicting DONE must not erase cancellation reason/);
});

test("cancellation reason is retained across delayed events and saved on initial CAN",()=>{
 assert.match(orderSync,/previousCancellationReason/);
 assert.match(orderSync,/existingStatus === "done"/);
 assert.match(orderSync,/existingStatus === "canceled"/);
 assert.match(orderSync,/Pedido salvo, mas o motivo do cancelamento não pôde ser persistido/);
 assert.match(orderSync,/cancellation_reason: cancellationReason/);
});
