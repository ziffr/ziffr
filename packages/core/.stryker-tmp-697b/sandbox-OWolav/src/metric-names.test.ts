// @ts-nocheck
import { describe, expect, it } from "vitest";
import { nameKey, tellApart } from "./metric-names";

const m = (id: number, name: string, owner_id: string, period = "month", unit = "") => ({ id, name, owner_id, period, unit });
const first = (id: string) => ({ a: "Ann", b: "Ben" })[id] ?? id;

describe("nameKey", () => {
  it("ignores case and spaces", () => expect(nameKey("  Support   Tickets ")).toBe("support tickets"));
});

describe("tellApart", () => {
  it("says nothing about Metrics with a name of their own", () => expect(tellApart([m(1, "A", "a"), m(2, "B", "a")], first).size).toBe(0));
  it("uses the owner when that is enough", () => {
    expect([...tellApart([m(1, "Tickets", "a"), m(2, "tickets", "b")], first)]).toEqual([[1, "Ann"], [2, "Ben"]]);
  });
  it("adds the period when one owner has both", () => {
    expect([...tellApart([m(1, "Tickets", "a", "month"), m(2, "Tickets", "a", "week")], first)]).toEqual([[1, "Ann, month"], [2, "Ann, week"]]);
  });
  it("adds the unit when the period is the same too", () => {
    expect([...tellApart([m(1, "Tickets", "a", "month", "€"), m(2, "Tickets", "a", "month", "$")], first)]).toEqual([[1, "Ann, month, €"], [2, "Ann, month, $"]]);
  });
  it("still gives a note when nothing tells them apart", () => {
    expect(tellApart([m(1, "T", "a"), m(2, "T", "a")], first).get(1)).toBe("Ann, month");
  });
});
