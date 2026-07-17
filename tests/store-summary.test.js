import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDeliveryEstimate,
  formatServiceRegion,
  formatTodayHours,
  getStoreStatus,
} from "../src/features/storefront/store-summary.ts";

const schedule = [
  {
    day_id: 5,
    is_open: true,
    open_time: "18:00",
    close_time: "23:00",
  },
];

test("reports open and closing states using Sao Paulo time", () => {
  assert.deepEqual(getStoreStatus(schedule, new Date("2026-07-17T22:00:00Z")), {
    tone: "open",
    label: "Aberto",
  });
  assert.deepEqual(getStoreStatus(schedule, new Date("2026-07-18T01:45:00Z")), {
    tone: "closing",
    label: "Fechando em breve",
  });
  assert.deepEqual(getStoreStatus(schedule, new Date("2026-07-18T03:00:00Z")), {
    tone: "closed",
    label: "Fechado",
  });
});

test("formats the real delivery estimate range", () => {
  assert.equal(formatDeliveryEstimate([{ time: 30 }, { time: 45 }, { time: 20 }]), "20-45 min");
  assert.equal(formatDeliveryEstimate([]), "Tempo a confirmar");
});

test("formats the restaurant service region", () => {
  assert.equal(
    formatServiceRegion({
      address_neighborhood: "Vila Costa",
      address_city: "Suzano",
      address_state: "SP",
    }),
    "Vila Costa, Suzano - SP",
  );
});

test("formats today's storefront opening hours", () => {
  assert.equal(formatTodayHours(schedule, new Date("2026-07-17T22:00:00Z")), "Hoje, 18:00 às 23:00");
  assert.equal(formatTodayHours(schedule, new Date("2026-07-18T14:00:00Z")), "Fechado hoje");
});
