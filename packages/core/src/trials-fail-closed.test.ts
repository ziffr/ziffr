// Trial Workspaces (spec 0040): when the stored Installation settings cannot be read, no trial is offered or made. On
// hosted Ziffr "trials off" lives only in a row Ziffr Cloud wrote, so the environment alone must never switch trials on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./settings-in-effect", async (orig) => {
  const real = await orig<typeof import("./settings-in-effect")>();
  return {
    ...real,
    settingsInEffectStrict: vi.fn(async () => { throw new Error("The Installation settings could not be read."); }),
    settingsInEffect: vi.fn(async () => ({ ...process.env })),
    storedSettings: vi.fn(async () => ({ values: new Map<string, string>() })),
  };
});
vi.mock("./db", () => ({ db: () => { throw new Error("no database in this test"); } }));

const { trialSettingsInEffect, trialsOpen } = await import("./trials");
const { whatThisZiffrOffers } = await import("./what-works-here");

const saved = { ...process.env };
beforeEach(() => {
  process.env.ZIFFR_CLOUD_KEY = "k".repeat(40);
  delete process.env.ZIFFR_TRIAL_DAYS; // unset on hosted Ziffr means the default, 14 days
});
afterEach(() => { process.env = { ...saved }; });

describe("trials when the settings cannot be read", () => {
  it("makes no trial: the trial settings throw instead of falling back to the environment", async () => {
    await expect(trialSettingsInEffect()).rejects.toThrow();
  });
  it("offers no trial on the sign-in page", async () => {
    expect(await trialsOpen()).toBe(false);
    expect((await whatThisZiffrOffers()).trial).toBeNull();
  });
});
