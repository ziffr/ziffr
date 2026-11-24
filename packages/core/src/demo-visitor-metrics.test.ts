// What a visitor may do with Metrics, Targets, Questions and Shares (GLOSSARY: Demo Mode; spec 0051, ticket 11), without a database:
// every gate does nothing outside a demo visit and refuses in the demo's words inside one.
import { describe, expect, it } from "vitest";
import { DemoReadOnly } from "./demo";
import { DEMO_METRIC_LIMITS } from "./demo-limits";
import { visitorDue, visitorFormula, visitorNumber, visitorSeries, visitorSlug, refuseInDemoOutsideVisit } from "./demo-visitor-metrics";
import { DemoTextRefused, visitorText } from "./demo-visitor-words";
import { runAsVisit } from "./demo-visit-scope";
import { DEMO_METRIC_WORDS } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const real = { workspaceId: "11111111-1111-4111-8111-111111111111" };
const visit = <T>(work: () => T | Promise<T>) => runAsVisit({ "x-ziffr-demo-visit": "1" }, async () => work());
const now = new Date("2026-11-24T12:00:00Z");

describe("outside a demo visit", () => {
  it("every gate lets everything through", () => {
    for (const a of [real, demo]) {
      visitorFormula(a, "{a}+".repeat(300) + "{b}");
      visitorNumber(a, 1e30);
      visitorSeries(a, Array.from({ length: 5000 }, () => ({ period: "1999-01-01", value: 1e30 })), now);
      visitorDue(a, "2999-01-01", now);
    }
  });

  it("refuses the demo for what only a visit's action may do, and nobody else", () => {
    expect(() => refuseInDemoOutsideVisit(demo)).toThrow(DemoReadOnly);
    expect(() => refuseInDemoOutsideVisit(real)).not.toThrow();
  });
});

describe("a visitor's formula", () => {
  it("is short, over few Metrics, with few operations", async () => {
    await visit(() => {
      visitorFormula(demo, "({revenue} - {cost}) / {revenue} * 100");
      visitorFormula(demo, "change({odometer}) / 7");
      expect(() => visitorFormula(demo, "{a}+{b}+{c}+{d}+{e}+{f}")).toThrow(new DemoTextRefused(DEMO_METRIC_WORDS.formula));
      expect(() => visitorFormula(demo, "1+".repeat(DEMO_METRIC_LIMITS.formulaOperations + 1) + "1")).toThrow(DemoTextRefused);
      expect(() => visitorFormula(demo, `{a}${" ".repeat(DEMO_METRIC_LIMITS.formulaChars)}`)).toThrow(DemoTextRefused);
    });
  });

  it("does not count the hyphens of a {slug} as operations", async () => {
    await visit(() => visitorFormula(demo, "{visitor-metric-a1b2c3} + {visitor-metric-d4e5f6} + {another-long-slug-a1b2c3} * {yet-another-slug-d4e5f6}"));
  });

  it("counts the same Metric once, as the formula reads it", async () => {
    await visit(() => visitorFormula(demo, "{a}*{a}*{a}*{a}*{a}*{a}*{a}"));
  });
});

describe("a visitor's numbers", () => {
  it("are finite and at most a million million", async () => {
    await visit(() => {
      visitorNumber(demo, 0);
      visitorNumber(demo, -999_999_999_999);
      visitorNumber(demo, null);
      expect(() => visitorNumber(demo, 1e13)).toThrow(new DemoTextRefused(DEMO_METRIC_WORDS.number));
      expect(() => visitorNumber(demo, Number.NaN)).toThrow(DemoTextRefused);
      expect(() => visitorNumber(demo, Number.POSITIVE_INFINITY)).toThrow(DemoTextRefused);
    });
  });
});

describe("a visitor's Target Series and Projection", () => {
  it("takes at most 60 rows, each within two years of today, of reasonable numbers", async () => {
    await visit(() => {
      visitorSeries(demo, [{ period: "2026-11-01", value: 10 }, { period: "2025-01-01", value: 9 }, { period: "2028-10-31", value: 8 }], now);
      visitorSeries(demo, ["2026-11-01"], now);
      expect(() => visitorSeries(demo, Array.from({ length: 61 }, () => ({ period: "2026-11-01", value: 1 })), now)).toThrow(new DemoTextRefused(DEMO_METRIC_WORDS.rows));
      expect(() => visitorSeries(demo, [{ period: "2023-01-01", value: 1 }], now)).toThrow(DemoTextRefused);
      expect(() => visitorSeries(demo, [{ period: "2029-01-01", value: 1 }], now)).toThrow(DemoTextRefused);
      expect(() => visitorSeries(demo, [{ period: "2026-11-01", value: 1e20 }], now)).toThrow(new DemoTextRefused(DEMO_METRIC_WORDS.number));
      expect(() => visitorSeries(demo, "not rows", now)).toThrow(DemoTextRefused);
    });
  });

  it("leaves a row it cannot read to the core's own words", async () => {
    await visit(() => visitorSeries(demo, [{ period: "yesterday", value: 1 }, null], now));
  });
});

describe("a visitor's Task", () => {
  it("is due within a year", async () => {
    await visit(() => {
      visitorDue(demo, "2026-12-01", now);
      visitorDue(demo, null, now);
      expect(() => visitorDue(demo, "2028-12-01", now)).toThrow(new DemoTextRefused(DEMO_METRIC_WORDS.due));
    });
  });
});

describe("the slug of a visitor's Metric", () => {
  it("is its name's, short, with a random ending: never a word the screens use for themselves", () => {
    expect(visitorSlug("new", "a1b2c3")).toBe("new-a1b2c3");
    expect(visitorSlug("", "a1b2c3")).toBe("metric-a1b2c3");
    expect(visitorSlug("x".repeat(100), "a1b2c3")).toHaveLength(40 + 1 + 6);
    expect(visitorSlug("gross-margin-", "a1b2c3")).toBe("gross-margin-a1b2c3");
  });
});

describe("the words a visitor writes into a Metric, a Tag, a Group, a Question", () => {
  it("pass the text rules in a visit, by kind, and are as typed outside one", async () => {
    expect(visitorText(demo, "see www.example.com", "name")).toBe("see www.example.com");
    await visit(() => {
      expect(visitorText(demo, "Gross margin", "name")).toBe("Gross margin");
      expect(() => visitorText(demo, "see www.example.com", "name")).toThrow(DemoTextRefused);
      expect(() => visitorText(demo, "<b>bold</b>", "description")).toThrow(DemoTextRefused);
      expect(() => visitorText(demo, "x".repeat(41), "tag")).toThrow(DemoTextRefused);
      expect(() => visitorText(demo, "Why is it down? Please check.\nThanks", "message")).not.toThrow();
      expect(() => visitorText(demo, "mail me: a@b.example", "message")).toThrow(DemoTextRefused);
      expect(() => visitorText(demo, "", "message")).toThrow(DemoTextRefused);
    });
  });
});
