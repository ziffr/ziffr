// The Announcement line's pure rules: what a dismissal remembers and when it stops counting.
import { describe, expect, it } from "vitest";
import { capShown, dismissedIn, shellOrder, stillShown, withDismissed, type Announcement } from "./announcement-state";

const a: Announcement = { id: "a", text: "A" };
const b: Announcement = { id: "b", text: "B" };

describe("dismissals", () => {
  it("start empty, also for storage that is missing or broken", () => {
    expect(dismissedIn(null, "s1")).toEqual([]);
    expect(dismissedIn("not json", "s1")).toEqual([]);
    expect(dismissedIn("null", "s1")).toEqual([]);
    expect(dismissedIn(JSON.stringify({ scope: "s1", ids: "a" }), "s1")).toEqual([]);
  });
  it("are remembered for the visit that made them", () => {
    const raw = withDismissed(null, "s1", "a");
    expect(dismissedIn(raw, "s1")).toEqual(["a"]);
    expect(dismissedIn(withDismissed(raw, "s1", "b"), "s1")).toEqual(["a", "b"]);
    expect(dismissedIn(withDismissed(raw, "s1", "a"), "s1")).toEqual(["a"]);
  });
  it("are gone in a new visit (another scope), which starts again", () => {
    const raw = withDismissed(null, "s1", "a");
    expect(dismissedIn(raw, "s2")).toEqual([]);
    expect(dismissedIn(withDismissed(raw, "s2", "b"), "s2")).toEqual(["b"]);
  });
  it("ignore ids that are not text", () => {
    expect(dismissedIn(JSON.stringify({ scope: "s1", ids: ["a", 3, null] }), "s1")).toEqual(["a"]);
  });
});

describe("stillShown", () => {
  it("leaves out what was dismissed and keeps the order", () => {
    expect(stillShown([a, b], [])).toEqual([a, b]);
    expect(stillShown([a, b], ["a"])).toEqual([b]);
    expect(stillShown([a, b], ["a", "b", "zzz"])).toEqual([]);
  });
});

describe("order, cap and the one that cannot be dismissed", () => {
  const demo: Announcement = { id: "demo-reset", text: "Demo" };
  const warn: Announcement = { id: "w", text: "W", level: "warning" };
  const info: Announcement = { id: "i", text: "I", level: "info" };
  it("puts the demo's notice first where visitors may change the demo", () => {
    expect(shellOrder([demo], [warn, info], true).map((x) => x.id)).toEqual(["demo-reset", "w", "i"]);
  });
  it("ranks the demo's notice as an info otherwise: after a warning, before the other infos", () => {
    expect(shellOrder([demo], [warn, info], false).map((x) => x.id)).toEqual(["w", "demo-reset", "i"]);
  });
  it("is the Installation's order alone without the demo", () => {
    expect(shellOrder([], [warn, info], false)).toEqual([warn, info]);
  });
  it("keeps a line that cannot be dismissed even if its key is stored as dismissed", () => {
    const fixed: Announcement = { id: "f", text: "F", dismissible: false };
    expect(stillShown([fixed, a], ["f", "a"])).toEqual([fixed]);
  });
  it("shows three at once and counts the rest, until expanded", () => {
    const five = ["1", "2", "3", "4", "5"].map((id) => ({ id, text: id }));
    expect(capShown(five, false)).toEqual({ visible: five.slice(0, 3), hidden: 2 });
    expect(capShown(five, true)).toEqual({ visible: five, hidden: 0 });
    expect(capShown(five.slice(0, 3), false).hidden).toBe(0);
  });
});
