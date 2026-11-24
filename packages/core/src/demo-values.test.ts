import { describe, expect, it } from "vitest";
import { DEMO_VALUE_LIMITS } from "./demo-limits";
import { demoAsOfRefusal, demoAwayRefusal, demoValuePeriodRefusal } from "./demo-values";
import { DEMO_VALUE_WORDS } from "./demo-words";

const now = new Date("2026-11-24T10:00:00Z");

describe("the periods a visitor may enter a value for", () => {
  it("takes the current period and the 24 months before it, and nothing older", () => {
    expect(demoValuePeriodRefusal("2026-11-01", "2026-11-01", now)).toBeNull();
    expect(demoValuePeriodRefusal("2024-11-01", "2026-11-01", now)).toBeNull();
    expect(demoValuePeriodRefusal("2024-10-01", "2026-11-01", now)).toBe(DEMO_VALUE_WORDS.period);
    expect(DEMO_VALUE_LIMITS.monthsBack).toBe(24);
  });

  it("takes nothing ahead of the Metric's current period", () => {
    expect(demoValuePeriodRefusal("2026-12-01", "2026-11-01", now)).toBe(DEMO_VALUE_WORDS.period);
    expect(demoValuePeriodRefusal("2026-11-23", "2026-11-23", now)).toBeNull();
    expect(demoValuePeriodRefusal("2026-11-30", "2026-11-23", now)).toBe(DEMO_VALUE_WORDS.period);
  });

  it("refuses what is not a day", () => {
    for (const bad of ["", "tomorrow", "2026-11", "2026-13-45x"]) expect(demoValuePeriodRefusal(bad, "2026-11-01", now), bad).toBe(DEMO_VALUE_WORDS.period);
  });
});

describe("Away in the demo", () => {
  it("takes up to 30 days from today, ending within 90 days", () => {
    expect(demoAwayRefusal("2026-11-24", "2026-12-24", now)).toBeNull();
    expect(demoAwayRefusal("2026-11-24", "2026-12-25", now)).toBe(DEMO_VALUE_WORDS.away);
    expect(demoAwayRefusal("2027-02-01", "2027-02-20", now)).toBeNull();
    expect(demoAwayRefusal("2027-02-20", "2027-02-23", now)).toBe(DEMO_VALUE_WORDS.away);
  });

  it("gives a day's slack at the start, and takes nothing that began before it", () => {
    expect(demoAwayRefusal("2026-11-23", "2026-11-25", now)).toBeNull();
    expect(demoAwayRefusal("2026-11-22", "2026-11-25", now)).toBe(DEMO_VALUE_WORDS.away);
  });

  it("refuses an end before the start and what is not a day", () => {
    expect(demoAwayRefusal("2026-12-01", "2026-11-30", now)).toBe(DEMO_VALUE_WORDS.away);
    expect(demoAwayRefusal("soon", "2026-11-30", now)).toBe(DEMO_VALUE_WORDS.away);
  });
});

describe("pretending it is another day", () => {
  it("takes a day within 90 days of today, either way", () => {
    expect(demoAsOfRefusal("2026-11-24", now)).toBeNull();
    expect(demoAsOfRefusal("2027-02-22", now)).toBeNull();
    expect(demoAsOfRefusal("2027-02-23", now)).toBe(DEMO_VALUE_WORDS.asOf);
    expect(demoAsOfRefusal("2026-08-26", now)).toBeNull();
    expect(demoAsOfRefusal("2026-08-25", now)).toBe(DEMO_VALUE_WORDS.asOf);
    expect(demoAsOfRefusal("not a day", now)).toBe(DEMO_VALUE_WORDS.asOf);
  });
});

describe("the words", () => {
  it("say when it works again or what to do, name no column and no table", () => {
    for (const words of Object.values(DEMO_VALUE_WORDS)) {
      expect(words).not.toMatch(/ZF4D|observation|column|table|_/);
      expect(words.length).toBeGreaterThan(10);
    }
    expect(DEMO_VALUE_WORDS.paste).toContain("100");
  });
});
