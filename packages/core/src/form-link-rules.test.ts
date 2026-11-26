// Which periods a personal form link records, in words (GLOSSARY: Token).
import { describe, expect, it } from "vitest";
import { answeredMeanwhile, LINK_PERIOD_REFUSED } from "./form-link-rules";

describe("a form link's answers", () => {
  it("has one refusal for a period it does not record", () => {
    expect(LINK_PERIOD_REFUSED.outcome).toBe("rejected_period");
    expect(LINK_PERIOD_REFUSED.detail).not.toMatch(/\d/);
  });

  it("gives that refusal for a period answered in the meantime", () => {
    expect(answeredMeanwhile("rejected_duplicate", "5 recorded.")).toEqual({ ok: false, ...LINK_PERIOD_REFUSED });
  });

  it("otherwise answers with the words about the number sent", () => {
    expect(answeredMeanwhile("overwritten", "5 recorded.")).toEqual({ ok: true, outcome: "overwritten", detail: "5 recorded." });
  });
});
