"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const replay = fs.readFileSync("src/lib/ifood/event-replay.ts", "utf8");
test("ambiguous persistence error rechecks event state before rescheduling", () => {
  assert.match(replay, /if \(markError\) \{/);
  assert.match(replay, /select\("processed_at, processing_lease_token"\)/);
  assert.match(replay, /persisted\?\.processed_at/);
  assert.match(replay, /persisted\?\.processing_lease_token !== row\.processing_lease_token/);
  assert.match(replay, /summary\.lostLeases \+= 1/);
});
