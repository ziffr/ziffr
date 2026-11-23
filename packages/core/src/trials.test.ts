// The Installation's trial settings (spec 0021): a typo never opens sign-ups for longer than meant.
import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAL_MAX, trialSettings, trialsOffered } from "./trials";

const CLOUD = { ZIFFR_CLOUD_KEY: "k".repeat(32) };

describe("trialSettings", () => {
  it("offers 14 days on hosted Ziffr unless the days are 0 (Ziffr Cloud's explicit off), and nothing without the key", () => {
    expect(trialSettings({ ...CLOUD })).toEqual({ days: 14, max: DEFAULT_TRIAL_MAX });
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: " ", ZIFFR_TRIAL_MAX: "5" })).toEqual({ days: 14, max: 5 });
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "0", ZIFFR_TRIAL_MAX: "5" })).toBeNull();
    expect(trialSettings({})).toBeNull();
  });
  it("takes 1 to 30 days and the default cap", () => {
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "7" })).toEqual({ days: 7, max: DEFAULT_TRIAL_MAX });
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "30", ZIFFR_TRIAL_MAX: "5" })).toEqual({ days: 30, max: 5 });
  });
  it("refuses days that are set but wrong, rather than offering ordinary workspaces, and ignores a cap outside its range", () => {
    for (const days of ["-1", "31", "7.5", "seven", "14d", "1e1"]) expect(() => trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: days })).toThrow(/ZIFFR_TRIAL_DAYS/);
    // Like every Trial Limit a cap outside 1 to 100,000 is the default, never an absurd number of trials.
    for (const max of ["0", "-1", "2.5", "many", "1,000", "100001", "1000000000000"]) expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "7", ZIFFR_TRIAL_MAX: max })).toEqual({ days: 7, max: 500 });
    expect(trialSettings({ ...CLOUD, ZIFFR_TRIAL_DAYS: "7", ZIFFR_TRIAL_MAX: "100000" })).toEqual({ days: 7, max: 100_000 });
  });
});

describe("trialsOffered (spec 0040)", () => {
  it("is true only with a Ziffr Cloud key and days that are not 0, whatever else is set", () => {
    const keys = [undefined, "", "short", "k".repeat(31), "k".repeat(32)];
    const days = [undefined, "", "7", "30", "0", "31", "x"];
    for (const key of keys) for (const d of days) {
      const env = { ZIFFR_CLOUD_KEY: key, ZIFFR_TRIAL_DAYS: d, ZIFFR_TRIAL_MAX: "5", ZIFFR_TRIAL_WEBHOOKS: "true" };
      const expected = key === "k".repeat(32) && (d === undefined || d === "" || d === "7" || d === "30");
      expect(trialsOffered(env), `${key} ${d}`).toBe(expected);
      // Without the key no trial is made; days that are set anyway throw, so no ordinary Workspace is made instead.
      if (key !== "k".repeat(32)) {
        if (d) expect(() => trialSettings(env)).toThrow(/cannot be made here/);
        else expect(trialSettings(env)).toBeNull();
      }
    }
  });
});
