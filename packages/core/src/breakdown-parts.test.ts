// The parts of a Breakdown row as they are read and listed (spec 0041, ticket 12): nested for the views, flat for programs.
import { describe, expect, it } from "vitest";
import { listRows, nestRows } from "./breakdown-parts";
import { mapBreakdownLabels } from "./sealed-words";

const row = (id: number, parent_id: number | null, label: string, value = 1) => ({ id, parent_id, label, value });

describe("nestRows", () => {
  it("is the flat list it always was for rows without parents", () => {
    expect(nestRows([row(1, null, "A", 5), row(2, null, "B", 6)])).toEqual([{ label: "A", value: 5 }, { label: "B", value: 6 }]);
    expect(nestRows([])).toEqual([]);
  });
  it("nests parts under their row in order, and gives a row without parts no parts field", () => {
    const got = nestRows([row(1, null, "DE"), row(2, 1, "Berlin"), row(3, 2, "Mitte"), row(4, null, "AT"), row(5, 1, "Munich")]);
    expect(got).toEqual([{ label: "DE", value: 1, parts: [{ label: "Berlin", value: 1, parts: [{ label: "Mitte", value: 1 }] }, { label: "Munich", value: 1 }] }, { label: "AT", value: 1 }]);
    expect("parts" in got[1]).toBe(false);
  });
  it("finds a parent that comes after its part", () => {
    expect(nestRows([row(2, 1, "Berlin"), row(1, null, "DE")])).toEqual([{ label: "DE", value: 1, parts: [{ label: "Berlin", value: 1 }] }]);
  });
  it("leaves out a row whose parent could not be read, with everything under it, rather than count it at the top", () => {
    expect(nestRows([row(2, 1, "Berlin"), row(3, 2, "Mitte"), row(4, null, "AT")])).toEqual([{ label: "AT", value: 1 }]);
  });
});

describe("listRows", () => {
  it("lists each row followed by its parts, a part naming its parent's label, as a program sends them", () => {
    const nested = nestRows([row(1, null, "DE", 3), row(2, 1, "Berlin", 2), row(3, 2, "Mitte", 1), row(4, null, "AT", 4)]);
    expect(listRows(nested)).toEqual([{ label: "DE", value: 3 }, { label: "Berlin", value: 2, parent: "DE" }, { label: "Mitte", value: 1, parent: "Berlin" }, { label: "AT", value: 4 }]);
    expect(listRows([])).toEqual([]);
  });
});

describe("a Snapshot's frozen Breakdown labels, parts included", () => {
  it("passes every label, at every depth, through the change at a place of its own, and keeps the numbers", () => {
    const data = { breakdowns: { 7: { "2026-03-01": [{ label: "DE", value: 3, parts: [{ label: "Berlin", value: 2, parts: [{ label: "Mitte", value: 1 }] }] }, { label: "AT", value: 4 }] } } };
    const places: string[] = [];
    const out = mapBreakdownLabels(data, (place, text) => { places.push(place); return `sealed:${text}`; }, "frozen.data.");
    expect(places).toEqual([
      "frozen.data.breakdowns.7.2026_03_01.0.label", "frozen.data.breakdowns.7.2026_03_01.0.parts.0.label", "frozen.data.breakdowns.7.2026_03_01.0.parts.0.parts.0.label", "frozen.data.breakdowns.7.2026_03_01.1.label",
    ]);
    expect(JSON.stringify(out)).not.toMatch(/"(DE|Berlin|Mitte|AT)"/);
    expect(out.breakdowns[7]["2026-03-01"][0]).toMatchObject({ label: "sealed:DE", value: 3, parts: [{ label: "sealed:Berlin", value: 2, parts: [{ label: "sealed:Mitte", value: 1 }] }] });
  });
  it("leaves a label that does not open as empty at any depth", () => {
    const out = mapBreakdownLabels({ breakdowns: { 7: { "2026-03-01": [{ label: "DE", value: 1, parts: [{ label: "x", value: 1 }] }] } } }, (p) => (p.endsWith("parts.0.label") ? undefined : "ok"), "d.");
    expect(out.breakdowns[7]["2026-03-01"][0]).toMatchObject({ label: "ok", parts: [{ label: "" }] });
  });
});
