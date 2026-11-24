// Tests for the clock's demo schedule and for the settings init gives it. Run with `node --test docker/clock-schedule.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { demoChangesOn, demoResetDue, demoSettingsForClock } from "./clock-schedule.mjs";

const at = (hhmm) => new Date(`2026-11-24T${hhmm}:00Z`);
const both = { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1" };

test("init hands the clock both demo settings, and only when they are on", () => {
  assert.deepEqual(demoSettingsForClock(both), both);
  assert.deepEqual(demoSettingsForClock({ ZIFFR_DEMO_ONLY: "1" }), { ZIFFR_DEMO_ONLY: "1" });
  assert.deepEqual(demoSettingsForClock({ ZIFFR_DEMO_CHANGES: "0", ZIFFR_DEMO_ONLY: "true", ZIFFR_SECRETS_KEY: "x" }), {});
});

test("what init writes is enough for the clock to call every 15 minutes", () => {
  assert.equal(demoChangesOn(demoSettingsForClock(both)), true);
  assert.equal(demoChangesOn(demoSettingsForClock({ ZIFFR_DEMO_CHANGES: "1" })), false);
  assert.equal(demoResetDue(at("10:25"), demoSettingsForClock(both)), true);
});

test("with visitors' changes the reset is called at 10, 25, 40 and 55 past", () => {
  const due = [];
  for (let m = 0; m < 60; m++) if (demoResetDue(at(`10:${String(m).padStart(2, "0")}`), both)) due.push(m);
  assert.deepEqual(due, [10, 25, 40, 55]);
});

test("without them it is called once a night at 03:30 UTC", () => {
  assert.equal(demoResetDue(at("03:30"), {}), true);
  assert.equal(demoResetDue(at("10:25"), {}), false);
  assert.equal(demoResetDue(at("03:31"), { ZIFFR_DEMO_ONLY: "1" }), false);
});

test("ZIFFR_DEMO_RESET=0 turns it off", () => {
  assert.equal(demoResetDue(at("03:30"), { ZIFFR_DEMO_RESET: "0" }), false);
  assert.equal(demoResetDue(at("10:25"), { ...both, ZIFFR_DEMO_RESET: "0" }), false);
});
