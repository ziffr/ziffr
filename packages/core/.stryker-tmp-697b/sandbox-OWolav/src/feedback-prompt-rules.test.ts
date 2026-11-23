// @ts-nocheck
// The Feedback Prompt's cadence (ticket #722), without a database: when it is due, how long it waits, what each answer does.
import { describe, expect, it } from "vitest";
import { afterNo, afterShown, afterStopped, asksForStar, cleanWords, feedbackPromptOn, FRESH_STATE, isDue } from "./feedback-prompt-rules";

const day = 86_400_000;
const t0 = new Date("2027-01-10T10:00:00Z");
const after = (d: number) => new Date(t0.getTime() + d * day);

describe("when the card is due", () => {
  it("is due for someone never asked, and not before the wait is over", () => {
    expect(isDue(FRESH_STATE, t0)).toBe(true);
    const s = afterShown(FRESH_STATE, t0);
    expect(isDue(s, after(29))).toBe(false);
    expect(isDue(s, after(30))).toBe(true);
  });
  it("waits 30 days after the first showing, 60 after the second, and the third is the last", () => {
    const one = afterShown(FRESH_STATE, t0);
    expect(one.nextAskAt).toEqual(after(30));
    const two = afterShown(one, after(30));
    expect(two.nextAskAt).toEqual(after(90));
    const three = afterShown(two, after(90));
    expect(three).toMatchObject({ stopped: true, nextAskAt: null, shownCount: 3 });
    expect(isDue(three, after(10_000))).toBe(false);
  });
});

describe("what an answer does", () => {
  it("stops for good after a star or Don't ask again", () => {
    for (const a of ["starred", "never"] as const) expect(isDue(afterStopped(afterShown(FRESH_STATE, t0), a), after(10_000))).toBe(false);
  });
  it("after a no waits 90 days, and then asks without the request for a star", () => {
    const s = afterNo(afterShown(FRESH_STATE, t0), t0);
    expect(s.nextAskAt).toEqual(after(90));
    expect(isDue(s, after(89))).toBe(false);
    expect(isDue(s, after(90))).toBe(true);
    expect(asksForStar(s)).toBe(false);
    expect(asksForStar(FRESH_STATE)).toBe(true);
  });
  it("never lets a no bring a stopped card back", () => {
    const stopped = afterNo(afterShown(afterShown(afterShown(FRESH_STATE, t0), after(30)), after(90)), after(90));
    expect(isDue(stopped, after(10_000))).toBe(false);
  });
});

describe("what is missing", () => {
  it("is trimmed, and refused when empty, too long or hiding characters", () => {
    expect(cleanWords("  more charts \n please ")).toEqual({ ok: true, words: "more charts \n please" });
    for (const bad of ["", "   ", "x".repeat(1001), "a‮b", "a​b", 5, null]) expect(cleanWords(bad).ok).toBe(false);
    expect(cleanWords("x".repeat(1000)).ok).toBe(true);
  });
});

describe("whether it is on", () => {
  it("follows the setting, and otherwise whether the Installation is hosted", () => {
    expect(feedbackPromptOn({}, false)).toBe(false);
    expect(feedbackPromptOn({}, true)).toBe(true);
    expect(feedbackPromptOn({ ZIFFR_FEEDBACK_PROMPT: "true" }, false)).toBe(true);
    expect(feedbackPromptOn({ ZIFFR_FEEDBACK_PROMPT: "false" }, true)).toBe(false);
    expect(feedbackPromptOn({ ZIFFR_FEEDBACK_PROMPT: "maybe" }, false)).toBe(false);
  });
});
