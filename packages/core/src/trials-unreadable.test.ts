// A Workspace that cannot be read is not taken for "not a trial" (spec 0040, ADR 0015): nothing is sent to anyone and no
// View Link is made until the read works, so a database trouble never opens a trial's limits.
import { describe, expect, it, vi } from "vitest";

const failing = { eq: () => failing, maybeSingle: async () => ({ data: null, error: { message: "down" } }) };
vi.mock("./db", () => ({ db: () => ({ from: () => ({ select: () => failing }) }) }));

const { trialHoldsBack, trialLastDay, TRIAL_HOLDS_BACK } = await import("./trials");

describe("when the Workspace cannot be read", () => {
  it("holds every message back", async () => {
    expect(await trialHoldsBack("w", "p")).toBe(TRIAL_HOLDS_BACK.unreadable);
  });
  it("makes no View Link", async () => {
    await expect(trialLastDay("w")).rejects.toThrow(/could not be read/);
  });
});
