import { describe, expect, it } from "vitest";
import { tagFilterHref, tagsFromParam } from "./tag-filter";

describe("the Tag filter's address", () => {
  it("reads one or several words, normalised and without repeats", () => {
    expect(tagsFromParam(undefined)).toEqual([]);
    expect(tagsFromParam("finance")).toEqual(["finance"]);
    expect(tagsFromParam(["#Finance", "finance", "  weekly   review "])).toEqual(["Finance", "weekly review"]);
  });
  it("drops words that no Tag can be and caps the number", () => {
    expect(tagsFromParam(["", "x".repeat(40), "ok"])).toEqual(["ok"]);
    expect(tagsFromParam(Array.from({ length: 50 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
  it("writes the address back, with Archived when asked", () => {
    expect(tagFilterHref([])).toBe("/metrics");
    expect(tagFilterHref(["a b", "c"], true)).toBe("/metrics?tag=a+b&tag=c&show=archived");
  });
});
