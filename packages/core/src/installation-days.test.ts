// The day and count settings (ticket #517): every range's edges, the default for anything outside, and Ziffr Cloud.
import { describe, expect, it } from "vitest";
import { AUDIT_FLOOR_DAYS, CLOUD_PINNED, DAYS_SETTINGS, daysOutOfRange, daysProblem, daysSetting, hostedByCloud } from "./installation-days";
import { INSTALLATION_SETTINGS } from "./installation-catalogue";

describe("the ranges", () => {
  for (const [name, d] of Object.entries(DAYS_SETTINGS)) {
    it(`${name} takes ${d.min} to ${d.max} whole numbers and nothing else`, () => {
      for (const ok of [d.min, d.max, Math.floor((d.min + d.max) / 2)]) { expect(daysProblem(name, String(ok))).toBeNull(); expect(daysSetting(name, { [name]: String(ok) })).toBe(ok); }
      for (const bad of [String(d.min - 1), String(d.max + 1), "1.5", "-3", "abc", "", " ", "1e3", "0x10", "99999999"]) {
        expect(daysProblem(name, bad), `${name}=${bad}`).toMatch(/^Write a whole number of (days|values) from [\d,]+ to [\d,]+\.$/);
        if (bad.trim()) expect(daysSetting(name, { [name]: bad }), `${name}=${bad}`).toBe(d.default);
      }
      expect(daysSetting(name, {})).toBe(d.default);
      expect(d.default).toBeGreaterThanOrEqual(d.min);
      expect(d.default).toBeLessThanOrEqual(d.max);
    });
  }
  it("has today's values as defaults, and every one is a setting of the catalogue", () => {
    expect(Object.fromEntries(Object.entries(DAYS_SETTINGS).map(([n, d]) => [n, d.default]))).toEqual({
      ZIFFR_KEEP_ACCESS_LOG_DAYS: 90, ZIFFR_KEEP_AUDIT_DAYS: 730, ZIFFR_KEEP_WEBHOOK_LOG_DAYS: 14, ZIFFR_KEEP_VIEW_COUNT_DAYS: 400, ZIFFR_RETENTION_VALUES_PER_RUN: 5000,
      ZIFFR_TRIAL_GRACE_DAYS: 7, ZIFFR_UNUSED_WAIT_DAYS: 14, ZIFFR_LIMIT_GRACE_DAYS: 14, ZIFFR_LIMIT_GRACE_EVERY_DAYS: 90,
    });
    for (const name of Object.keys(DAYS_SETTINGS)) expect(INSTALLATION_SETTINGS.map((s) => s.name)).toContain(name);
    for (const name of CLOUD_PINNED) expect(INSTALLATION_SETTINGS.map((s) => s.name)).toContain(name);
  });
  it("keeps the Audit Log at a year at least", () => {
    expect(AUDIT_FLOOR_DAYS).toBe(365);
    expect(daysProblem("ZIFFR_KEEP_AUDIT_DAYS", "364")).not.toBeNull();
    expect(daysProblem("ZIFFR_KEEP_AUDIT_DAYS", "3650")).toBeNull();
    expect(daysProblem("ZIFFR_KEEP_AUDIT_DAYS", "3651")).not.toBeNull();
  });
  it("refuses a name that is not one", () => { expect(daysProblem("ZIFFR_NOPE", "5")).toMatch(/not a setting/); });
  it("lists what is written out of range, so the page can say the usual value applies", () => {
    expect(daysOutOfRange({ ZIFFR_KEEP_AUDIT_DAYS: "5", ZIFFR_KEEP_ACCESS_LOG_DAYS: "30", ZIFFR_TRIAL_GRACE_DAYS: "  " })).toEqual(["ZIFFR_KEEP_AUDIT_DAYS"]);
  });
});

describe("Ziffr Cloud", () => {
  it("is a deployment with a ZIFFR_CLOUD_KEY of 32 bytes or more, as cloud-api.ts decides", () => {
    expect(hostedByCloud({})).toBe(false);
    expect(hostedByCloud({ ZIFFR_CLOUD_KEY: "x".repeat(31) })).toBe(false);
    expect(hostedByCloud({ ZIFFR_CLOUD_KEY: "x".repeat(32) })).toBe(true);
  });
  it("pins the Workspace Limits, the grace values, the trial days and the unused Workspace wait, and no log or capacity value", () => {
    expect([...CLOUD_PINNED].sort()).toEqual([
      "ZIFFR_DEFAULT_LIMIT_LABEL", "ZIFFR_DEFAULT_METRICS_LIMIT", "ZIFFR_DELETE_UNUSED_AFTER_DAYS", "ZIFFR_LIMIT_GRACE_DAYS", "ZIFFR_LIMIT_GRACE_EVERY_DAYS",
      "ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_GRACE_DAYS", "ZIFFR_UNUSED_WAIT_DAYS",
    ]);
    for (const name of ["ZIFFR_KEEP_AUDIT_DAYS", "ZIFFR_KEEP_ACCESS_LOG_DAYS", "ZIFFR_RETENTION_VALUES_PER_RUN"]) expect(CLOUD_PINNED.has(name)).toBe(false);
  });
});
