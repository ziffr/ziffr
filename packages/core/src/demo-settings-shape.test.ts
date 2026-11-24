// The shape of a visitor's widget settings (spec 0051, final review D3), without a database: every key has a type, a word that is not
// a string is refused (an array or an object would skip the text rules and be drawn for everyone), and the copy is rebuilt from the
// keys the table knows.
import { describe, expect, it } from "vitest";
import { checkedSettingsShape } from "./demo-settings-shape";
import { runAsVisit } from "./demo-visit-scope";
import { DemoTextRefused, visitorSettings } from "./demo-visitor-words";
import { DEMO_WORKSPACE_ID } from "./team";
import type { WidgetSettings } from "./types";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const visit = <T>(work: () => T) => runAsVisit({ "x-ziffr-demo-visit": "1" }, async () => work());
const refuses = (s: unknown) => visit(() => expect(() => visitorSettings(demo, s as WidgetSettings)).toThrow(DemoTextRefused));

describe("a word that is not a string", () => {
  const WORDS = ["kicker", "headline", "subline", "footnote", "source", "highlight", "period"];
  for (const key of WORDS) {
    it(`is refused for ${key}: an array, an object, a number, a boolean and a nested array`, async () => {
      for (const bad of [["<b>x</b>"], { a: 1 }, 5, true, [["x"]], [{ text: "x" }]]) await refuses({ [key]: bad });
    });
    it(`leaves ${key} out, or null, as it is`, async () => {
      await visit(() => {
        expect(visitorSettings(demo, {} as WidgetSettings)).toEqual({});
        expect(visitorSettings(demo, { [key]: null } as WidgetSettings)).toEqual({ [key]: null });
        expect(visitorSettings(demo, { [key]: undefined } as WidgetSettings)).toEqual({});
      });
    });
  }

  it("is refused in the nested words: a callout's, a panel's title, reference line and annotations", async () => {
    await refuses({ callouts: [{ period: "2026-03-01", text: ["x"] }] });
    await refuses({ callouts: [{ period: 3, text: "x" }] });
    await refuses({ callouts: ["x"] });
    await refuses({ callouts: { text: "x" } });
    await refuses({ panels: [{ type: "line", metricIds: [1], title: { a: 1 } }] });
    await refuses({ panels: [{ type: "line", metricIds: [1], refLine: { kind: "target", label: ["x"] } }] });
    await refuses({ panels: [{ type: "line", metricIds: [1], annotations: [{ kind: "note", anchor: { type: "row", label: ["x"] }, text: "ok" }] }] });
    await refuses({ panels: [{ type: "line", metricIds: [1], annotations: [{ kind: "note", anchor: { type: "row", label: "x" }, text: { a: 1 } }] }] });
    await refuses({ panels: [{ type: "line", metricIds: ["1"] }] });
    await refuses({ panels: "x" });
  });

  it("is refused in a widget a free layout started from (its settings are checked as the top level's are)", async () => {
    await refuses({ canvasSeed: { template: "number", metric_ids: [1], settings: { headline: ["x"] } } });
    await refuses({ canvasSeed: { template: ["number"], metric_ids: [1], settings: {} } });
    await refuses({ canvasSeed: { template: "number", metric_ids: "1", settings: {} } });
  });

  it("is refused for the other keys with a type: numbers, flags, the comparisons and the choices", async () => {
    for (const bad of [{ window: "6" }, { window: Number.NaN }, { rows: [3] }, { showTarget: "yes" }, { showForecast: 1 }, { fullPeriods: {} }, { display: "decade" }, { slope: "anything" }, { compare: "prev" }, { compare: ["nope"] }, { compare: ["prev", 3] }, { asOf: "tomorrow" }, { asOf: 5 }, { canvas: "x" }, { design: "x" }, { tagSource: "x" }, { tagSource: { id: 5 } }, { period: "x".repeat(41) }]) await refuses(bad);
  });
});

describe("the keys a widget's settings are made of", () => {
  it("pass with their types and come back rebuilt", async () => {
    await visit(() => {
      const ok = {
        window: 6, display: "quarter", showTarget: true, rows: 5, kicker: " Finding ", headline: "Up", period: "2026-03-01", compare: ["prev", "yoy"], asOf: "2026-03-31",
        highlight: "North", callouts: [{ period: "2026-03-01", text: "Best", rule: "max" }],
        panels: [{ type: "line", metricIds: [1, 2], measure: "pct-yoy", periods: 6, highlight: "last", projections: true, refLine: { kind: "target", label: "Goal" }, annotations: [{ kind: "ring", anchor: { type: "period", period: "2026-03-01" } }] }],
        tagSource: { id: "abc" },
      };
      const out = visitorSettings(demo, ok as unknown as WidgetSettings);
      expect(out.window).toBe(6);
      expect(out.kicker).toBe("Finding");
      expect(out.compare).toEqual(["prev", "yoy"]);
      expect(out.callouts).toEqual([{ period: "2026-03-01", text: "Best", rule: "max" }]);
      expect(out.panels?.[0]?.refLine).toEqual({ kind: "target", label: "Goal" });
    });
  });

  it("are the only ones that stay: others, and a prototype key, are dropped, also nested", async () => {
    await visit(() => {
      const evil = JSON.parse('{"headline":"ok","__proto__":{"polluted":true},"constructor":{"x":1},"toString":"x","extra":"y","callouts":[{"period":"p","text":"t","__proto__":{"polluted":true},"extra":1}],"panels":[{"type":"line","metricIds":[],"constructor":{"x":1},"extra":2}]}');
      const out = visitorSettings(demo, evil) as Record<string, unknown>;
      expect(Object.keys(out).sort()).toEqual(["callouts", "headline", "panels"]);
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect((out.callouts as object[])[0]).toEqual({ period: "p", text: "t" });
      expect((out.panels as object[])[0]).toEqual({ type: "line", metricIds: [] });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  it("are refused as a whole when the settings are no object", async () => {
    for (const bad of [null, "x", 5, ["headline"]]) await refuses(bad);
  });
});

describe("checkedSettingsShape (pure)", () => {
  it("answers the refusal's words and never a half-built copy", () => {
    expect(checkedSettingsShape({ headline: ["x"] })).toEqual({ ok: false, words: expect.any(String) });
    const ok = checkedSettingsShape({ headline: "x", unknown: 1 });
    expect(ok).toEqual({ ok: true, settings: { headline: "x" } });
  });

  it("keeps the other places a word is typed bounded: too long a word or list is refused", () => {
    expect(checkedSettingsShape({ headline: "x".repeat(1001) }).ok).toBe(false);
    expect(checkedSettingsShape({ callouts: Array.from({ length: 51 }, () => ({ period: "p", text: "t" })) }).ok).toBe(false);
    expect(checkedSettingsShape({ panels: Array.from({ length: 21 }, () => ({ type: "line" })) }).ok).toBe(false);
  });
});
