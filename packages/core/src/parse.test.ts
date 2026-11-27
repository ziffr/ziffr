import { describe, expect, it } from "vitest";
import { readRow } from "./parse";

// How one line of a Breakdown is read (GLOSSARY: Breakdown): where the label ends, what closes a number and which
// cell is the parent. Each expectation is [label, value] or [label, value, parent]; null is no row.

type Expected = [string, number] | [string, number, string] | null;
const read = (line: string, parents: boolean): Expected => {
  const row = readRow(line, "1,234.5", parents);
  if (!row) return null;
  return row.parent === undefined ? [row.label, row.value] : [row.label, row.value, row.parent];
};

describe("a row of a label and a number", () => {
  const CASES: [string, Expected][] = [
    ["Germany 45", ["Germany", 45]],
    ["Germany:45", ["Germany", 45]],
    ["Germany , 45", ["Germany", 45]],
    ["Germany\t45", ["Germany", 45]],
    ["Germany   45", ["Germany", 45]],
    ["North Rhine 1 234.5", ["North Rhine", 1234.5]],
    ["Germany45", null],
    ["Germany ::45", ["Germany :", 45]],
    ["Germany: x", null],
    ["Germany", null],
    ["45", null],
    ["a 5", ["a", 5]],
    [" a 5 ", ["a", 5]],
    ["a 5,", ["a", 5]],
    ["a 5,,", null],
    ["a -5", ["a", -5]],
    ["a −5", ["a", -5]],
    ["a +5", ["a", 5]],
    ["a - 5", ["a -", 5]],
    ['"a" 5', ["a", 5]],
    // An apostrophe right after a number counts into it, as a thousands separator would.
    ["'a' '5'", null],
    ['"a",5"', ["a", 5]],
    ['" 5', ['"', 5]],
    ['"5', null],
    ['ab "5', ["ab", 5]],
    [". . 5", [". .", 5]],
    ["ab\u2028 5", ["ab", 5]],
    ["a\t-5", ["a", -5]],
    ['a"5', null],
    ['a "5', ["a", 5]],
    ["a 5k", ["a", 5000]],
    ["a 5 K", ["a", 5000]],
    ['a 5 k"', ["a", 5000]],
    ["a 5%", ["a", 5]],
    ["a 5 €", ["a", 5]],
    ["a 5 EUR", ["a", 5]],
    ["a 5 Eur'", ["a", 5]],
    ["a 5 usd", null],
    ["a 5 k x", null],
    ["a 5 kk", null],
    ['a 5 ""', null],
    ["a 5 '", null],
    ["a 5 \u2028 k", ["a", 5000]],
    ["a 1 2 3", null],
    ["a 1 234", ["a", 1234]],
    ["Q3 sales 12", ["Q3 sales", 12]],
    ["3 deals 12", null],
    ["a\u2028b 5", null],
    ["a:\u2028 5", ["a", 5]],
    ['"\u00e9" 5', ["\u00e9", 5]],
  ];
  it.each(CASES)("%j", (line, expected) => {
    expect(read(line, false)).toEqual(expected);
    // A line without a third cell reads the same where a parent column is looked for.
    expect(read(line, true)).toEqual(expected);
  });
});

describe("a row where no parent column is looked for", () => {
  it("reads no third cell", () => {
    expect(readRow("a\t5\tb", "1,234.5")).toBeNull();
  });
});

describe("a row with a parent, tabs between the cells", () => {
  const CASES: [string, Expected][] = [
    ["a\t5\tb", ["a", 5, "b"]],
    ["a\t\t5\t\tb", ["a", 5, "b"]],
    ['"a"\t"5"\t"b"', ["a", 5, "b"]],
    ["a\t-5k\tNorth 2", ["a", -5000, "North 2"]],
    ["a\t5 %\tb", ["a", 5, "b"]],
    ["a\t5 eur'\tb", ["a", 5, "b"]],
    ["a\t5 \tb", ["a", 5, "b"]],
    ["a\t5\t b ", ["a", 5, "b"]],
    ["a\t5\t7x", null],
    ["a\t5\t\t7x", ["a", 5, "7x"]],
    ["a\t5\t\u2028\t7x", null],
    ['a\t5\t"', ["a", 5, '"']],
    ['a\t5\t""', ["a", 5, '"']],
    ['a\t5\t"\tb', ["a", 5, "b"]],
    ["a\t5\tb\tc", null],
    ['"a"\t5\tbc', ["a", 5, "bc"]],
    ["a\t%\tx 5", ["a\t%\tx", 5]],
    ["a 5\tb", null],
    ["a\t5 b", null],
    ["a\t5\tUSD\t1", ["a\t5\tUSD", 1]],
  ];
  it.each(CASES)("%j", (line, expected) => {
    expect(read(line, true)).toEqual(expected);
  });
});

describe("a row with a parent, as a CSV file writes it", () => {
  const CASES: [string, Expected][] = [
    ["a,5,b", ["a", 5, "b"]],
    ["a, 5 , b", ["a", 5, "b"]],
    ['"a, x","5.5","b"', ["a, x", 5.5, "b"]],
    ["a,-5k,North 2", ["a", -5000, "North 2"]],
    ["a,5 %,b", ["a", 5, "b"]],
    ["a,5 eur' ,b", ["a", 5, "b"]],
    ["a,5.,b", null],
    ["a,5,7", ["a", 5.7]],
    ['a,5,"', ["a", 5, '"']],
    ["a,5, \u2028 7", ["a", 5, "7"]],
    ["a,5, \u20287", ["a", 5, "7"]],
    ["a,5,b,c", null],
    ["a,5 b", null],
    ["a 5,b", null],
    ["a,x,b", null],
    ["a,5 7,b", null],
    ["a,5 7,x 8", ["a,5 7,x", 8]],
    ["a,5.,x 7", ["a,5.,x", 7]],
  ];
  it.each(CASES)("%j", (line, expected) => {
    expect(read(line, true)).toEqual(expected);
  });
});
