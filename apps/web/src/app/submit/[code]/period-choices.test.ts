// What the personal form link offers under "For" (GLOSSARY: Token, Prompt, Period): the running period, the waiting
// ones, and the period a signed-in person's address names. Pure.
import { describe, expect, it } from "vitest";
import { periodOffer } from "./period-choices";

const running = { start: "2026-11-01", label: "November 2026", has: "5" };
const at = (start: string) => ({ start, label: start });
const base = { running, runningWords: "this month", asked: [], named: null, namedRunning: false, recent: [] };

describe("with no earlier period waiting", () => {
  it("is the running one alone, as before", () => {
    expect(periodOffer(base)).toEqual({ preselected: "2026-11-01", selectable: false, choices: [{ ...running, running: true, notes: ["this month"], last: null }] });
  });

  it("is the one the address names alone, with the value it holds", () => {
    const offer = periodOffer({ ...base, named: { start: "2026-08-01", label: "August 2026", has: "3" } });
    expect(offer).toMatchObject({ preselected: "2026-08-01", selectable: false, choices: [{ start: "2026-08-01", has: "3", notes: [] }] });
  });
});

describe("while earlier periods wait", () => {
  const asked = [at("2026-10-01"), at("2026-09-01")];

  it("lists them with the running one, newest first, and starts at the newest asked for", () => {
    const offer = periodOffer({ ...base, asked });
    expect(offer.selectable).toBe(true);
    expect(offer.preselected).toBe("2026-10-01");
    expect(offer.choices.map((c) => [c.start, c.notes, c.has])).toEqual([["2026-11-01", ["this month"], "5"], ["2026-10-01", ["asked for"], null], ["2026-09-01", ["asked for"], null]]);
  });

  it("starts at the running period when it was asked for too, being the newest", () => {
    const offer = periodOffer({ ...base, asked: [at("2026-11-01"), ...asked] });
    expect(offer.preselected).toBe("2026-11-01");
    expect(offer.choices[0].notes).toEqual(["this month", "asked for"]);
  });

  it("starts where the address says: an older period it names, added to the list, or the running one", () => {
    const named = { start: "2026-07-01", label: "July 2026", has: "2" };
    const offer = periodOffer({ ...base, asked, named });
    expect(offer.preselected).toBe("2026-07-01");
    expect(offer.choices.at(-1)).toMatchObject({ start: "2026-07-01", has: "2", notes: [] });
    expect(periodOffer({ ...base, asked, namedRunning: true }).preselected).toBe("2026-11-01");
    // A named period that is waiting is listed once.
    expect(periodOffer({ ...base, asked, named: { start: "2026-09-01", label: "September 2026", has: null } }).choices).toHaveLength(3);
  });

  it("gives each period the last value before it", () => {
    const recent = [{ start: "2026-11-01", value: "5", periodLabel: "November 2026" }, { start: "2026-08-01", value: "1", periodLabel: "August 2026" }];
    const offer = periodOffer({ ...base, asked, recent });
    expect(offer.choices.map((c) => c.last?.value ?? null)).toEqual(["1", "1", "1"]);
  });
});
