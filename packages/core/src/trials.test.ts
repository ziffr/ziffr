// The Installation's trial settings (spec 0021): a typo never opens sign-ups for longer than meant.
import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAL_MAX, trialSettings, trialsOffered } from "./trials";

const CLOUD = { ZIFFR_CLOUD_KEY: "k".repeat(32) };

describe("trialSettings", () => {
  it("is off without ZIFFR_TRIAL_DAYS, also with a cap set", () => {
    expect(trialSettings({ ...CLOUD })).toBeNull();
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: " ", ZIFFR_TRIAL_MAX: "5" })).toBeNull();
  });
  it("takes 1 to 30 days and the default cap", () => {
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "7" })).toEqual({ days: 7, max: DEFAULT_TRIAL_MAX });
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "30", ZIFFR_TRIAL_MAX: "5" })).toEqual({ days: 30, max: 5 });
  });
  it("refuses days or a cap that are set but wrong, rather than offering ordinary workspaces", () => {
    for (const days of ["0", "31", "7.5", "seven", "14d", "1e1"]) expect(() => trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: days })).toThrow(/ZIFFR_TRIAL_DAYS/);
    for (const max of ["0", "-1", "2.5", "many", "1,000"]) expect(() => trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "7", ZIFFR_TRIAL_MAX: max })).toThrow(/ZIFFR_TRIAL_MAX/);
  });
});

describe("trialsOffered (spec 0040)", () => {
  it("is true only with a Ziffr Cloud key and days set, whatever else is set", () => {
    const keys = [undefined, "", "short", "k".repeat(31), "k".repeat(32)];
    const days = [undefined, "", "7", "30", "0", "31", "x"];
    for (const key of keys) for (const d of days) {
      const env = { ZIFFR_CLOUD_KEY: key, ZIFFR_TRIAL_DAYS: d, ZIFFR_TRIAL_MAX: "5", ZIFFR_TRIAL_THEN: "keep", ZIFFR_TRIAL_WEBHOOKS: "true" };
      const expected = key === "k".repeat(32) && (d === "7" || d === "30");
      expect(trialsOffered(env), `${key} ${d}`).toBe(expected);
      // Without the key no trial is made; days that are set anyway throw, so no ordinary Workspace is made instead.
      if (key !== "k".repeat(32)) {
        if (d) expect(() => trialSettings(env)).toThrow(/cannot be made here/);
        else expect(trialSettings(env)).toBeNull();
      }
    }
  });
});
