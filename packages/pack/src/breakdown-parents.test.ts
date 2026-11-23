// The reader of Breakdown parents (spec 0041, ticket 12): what it accepts, and every refusal one step either side of its limit.
import { describe, expect, it } from "vitest";
import { BREAKDOWN_PARENTS, hasParents, nameKey, readParents } from "./breakdown-parents";

const chain = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `L${i}`, ...(i ? { parent: `L${i - 1}` } : {}) }));
const problem = (rows: Parameters<typeof readParents>[0]) => {
  const r = readParents(rows);
  return r.ok ? null : r.problem;
};

describe("readParents", () => {
  it("reads a flat list as it is, without checking names, sizes or levels", () => {
    expect(readParents([{ label: "A" }, { label: "A" }, { label: "B", parent: "" }, { label: "C", parent: "  " }, { label: "D", parent: null }])).toEqual({ ok: true, parents: [null, null, null, null, null], order: [0, 1, 2, 3, 4], levels: [1, 1, 1, 1, 1] });
    const many = Array.from({ length: 500 }, (_, i) => ({ label: `R${i}` }));
    expect(readParents(many).ok).toBe(true);
    expect(hasParents(many)).toBe(false);
    expect(hasParents([{ label: "A", parent: " x " }])).toBe(true);
  });
  it("finds each parent by name, in any case, with the ends trimmed and in one Unicode form, and puts parents first", () => {
    const r = readParents([{ label: "Berlin", parent: " GERMANY" }, { label: "Germany" }, { label: "Café", parent: "Café Mix" }, { label: "Café mix" }]);
    expect(r).toEqual({ ok: true, parents: [1, null, 3, null], order: [1, 3, 0, 2], levels: [2, 1, 2, 1] });
    expect(nameKey(" É ")).toBe(nameKey("é"));
  });
  it("holds the levels: 4 are fine, 5 are refused and the deepest row is named", () => {
    expect(readParents(chain(4)).ok).toBe(true);
    expect(problem(chain(5))).toBe("“L4” is 5 levels down; a breakdown has at most 4 levels.");
    expect(BREAKDOWN_PARENTS.depth).toBe(4);
  });
  it("holds the size: 200 rows are fine, 201 are refused", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `R${i}`, ...(i ? { parent: "R0" } : {}) }));
    expect(readParents(rows(200)).ok).toBe(true);
    expect(problem(rows(201))).toBe("A breakdown with parents has at most 200 rows; this one has 201.");
  });
  it("refuses a row that is its own parent, and a cycle at any length, naming a row in the cycle", () => {
    expect(problem([{ label: "A", parent: "a" }, { label: "B" }])).toBe("“A” is its own parent.");
    expect(problem([{ label: "A", parent: "B" }, { label: "B", parent: "A" }])).toContain("among its own parents");
    // A row hanging off a cycle is not the one named.
    expect(problem([{ label: "Tail", parent: "A" }, { label: "A", parent: "B" }, { label: "B", parent: "A" }])).toMatch(/“[AB]” is among its own parents/);
    expect(problem([{ label: "A", parent: "B" }, { label: "B", parent: "C" }, { label: "C", parent: "A" }])).toContain("rows cannot be each other's ancestors");
  });
  it("refuses a parent that is no row, and says why for a total", () => {
    expect(problem([{ label: "A", parent: "Elsewhere" }, { label: "B" }])).toBe("“A” names “Elsewhere” as its parent, but no row of the breakdown has that name.");
    for (const t of ["Total", "SUM", "Gesamt", "summe"]) expect(problem([{ label: "A", parent: t }, { label: "B" }]), t).toContain("a total is not a row");
  });
  it("refuses a name used twice (a name is never guessed) but only where parents are used", () => {
    expect(problem([{ label: "A" }, { label: "a " , parent: "A" }])).toContain("is the name of two rows");
    expect(problem([{ label: "A" }, { label: "A" }, { label: "B", parent: "A" }])).toContain("two rows");
  });
  it("refuses control characters and long names, one step either side of 200 characters", () => {
    for (const bad of ["A\nB", "A\u0000", "A\u007f", "A\u0085", "A ", "A ", "A\tB"]) expect(problem([{ label: bad }, { label: "B", parent: bad }]), JSON.stringify(bad)).toContain("not text");
    expect(problem([{ label: "A" }, { label: "B", parent: "A\nB" }])).toContain("The parent of “B” has a character that is not text");
    const long = (n: number) => "é".repeat(n);
    expect(readParents([{ label: long(200) }, { label: "B", parent: long(200) }]).ok).toBe(true);
    expect(problem([{ label: long(201) }, { label: "B" }, { label: "C", parent: "B" }])).toContain("has more than 200 characters");
    expect(problem([{ label: "A" }, { label: "B", parent: long(201) }])).toContain("The parent of “B” has more than 200 characters");
    // A name in a sentence is shortened, never cut in the middle of a character.
    expect(problem([{ label: "😀".repeat(50), parent: "x" }, { label: "B" }])).toContain(`“${"😀".repeat(39)}…”`);
  });
  it("keeps the order of rows of one level as given", () => {
    const r = readParents([{ label: "C", parent: "A" }, { label: "A" }, { label: "B", parent: "A" }, { label: "D" }]);
    expect(r.ok && r.order).toEqual([1, 3, 0, 2]);
  });
  it("matches names in lower case, not upper (the German sharp s is not SS), and shortens a name in a sentence from 41 characters", () => {
    expect(nameKey("ß")).toBe("ß");
    expect(nameKey("SS")).toBe("ss");
    expect(readParents([{ label: "ß" }, { label: "ss", parent: "ß" }]).ok).toBe(true);
    const own = (n: number) => problem([{ label: "x".repeat(n), parent: "x".repeat(n) }, { label: "B" }]);
    expect(own(40)).toBe(`“${"x".repeat(40)}” is its own parent.`);
    expect(own(41)).toBe(`“${"x".repeat(39)}…” is its own parent.`);
  });
  it("says a control character in a name as a space, and leaves a parent of only spaces as no parent", () => {
    expect(problem([{ label: "A\nB" }, { label: "C", parent: "A\nB" }])).toBe("The name “A B” has a character that is not text (a line break or another control character).");
    expect(readParents([{ label: "A", parent: "   " }, { label: "B", parent: "A" }])).toEqual({ ok: true, parents: [null, 0], order: [0, 1], levels: [1, 2] });
  });
  it("calls only a whole word a total", () => {
    for (const t of ["Subtotal", "Totally", "total amount", "Gesamtsumme"]) expect(problem([{ label: "A", parent: t }, { label: "B" }]), t).toContain("no row of the breakdown has that name");
  });
});
