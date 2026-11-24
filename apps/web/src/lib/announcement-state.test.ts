// The Announcement line's pure rules: what a dismissal remembers and when it stops counting.
import { describe, expect, it } from "vitest";
import { dismissedIn, stillShown, withDismissed, type Announcement } from "./announcement-state";

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
