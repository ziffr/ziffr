// The Installation's trial settings (spec 0021): a typo never opens sign-ups for longer than meant.
import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAL_MAX, trialSettings } from "./trials";

describe("trialSettings", () => {
  it("is off without ZIFFR_TRIAL_DAYS, also with a cap set", () => {
    expect(trialSettings({})).toBeNull();
    expect(trialSettings({ ZIFFR_TRIAL_DAYS: " ", ZIFFR_TRIAL_MAX: "5" })).toBeNull();
  });
  it("takes 1 to 30 days and the default cap", () => {
    expect(trialSettings({ ZIFFR_TRIAL_DAYS: "7" })).toEqual({ days: 7, max: DEFAULT_TRIAL_MAX });
    expect(trialSettings({ ZIFFR_TRIAL_DAYS: "30", ZIFFR_TRIAL_MAX: "5" })).toEqual({ days: 30, max: 5 });
  });
  it("refuses days or a cap that are set but wrong, rather than offering ordinary workspaces", () => {
    for (const days of ["0", "31", "7.5", "seven", "14d", "1e1"]) expect(() => trialSettings({ ZIFFR_TRIAL_DAYS: days })).toThrow(/ZIFFR_TRIAL_DAYS/);
    for (const max of ["0", "-1", "2.5", "many", "1,000"]) expect(() => trialSettings({ ZIFFR_TRIAL_DAYS: "7", ZIFFR_TRIAL_MAX: max })).toThrow(/ZIFFR_TRIAL_MAX/);
  });
});
