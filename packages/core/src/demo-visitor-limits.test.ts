// What a visitor may store (GLOSSARY: Demo Mode; spec 0051, ticket 9), without a database: sizes are checked only in a demo
// visit, in the demo's words, and keys a widget's settings are not made of are dropped.
import { describe, expect, it } from "vitest";
import { DEMO_STORE_MAX } from "./demo-limits";
import { DemoSizeRefused, chargeVisitor, visitorSize } from "./demo-visitor-limits";
import { visitorSettings } from "./demo-visitor-words";
import { runAsVisit } from "./demo-visit-scope";
import { DEMO_WORKSPACE_ID } from "./team";
import type { WidgetSettings } from "./types";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const visit = <T>(work: () => T | Promise<T>) => runAsVisit({ "x-ziffr-demo-visit": "1" }, async () => work());

describe("visitorSize", () => {
  it("measures nothing and refuses nothing outside a demo visit", () => {
    expect(visitorSize(demo, "x".repeat(100_000), 10, "too big")).toBe(0);
    expect(visitorSize({ workspaceId: "11111111-1111-4111-8111-111111111111" }, "x".repeat(100_000), 10, "too big")).toBe(0);
  });

  it("refuses past the size in a visit, with the words, and answers the bytes otherwise", async () => {
    await visit(() => {
      expect(visitorSize(demo, { a: "b" }, 100, "too big")).toBeGreaterThan(0);
      expect(() => visitorSize(demo, "x".repeat(200), 100, "too big")).toThrow(new DemoSizeRefused("too big"));
    });
  });
});

describe("chargeVisitor", () => {
  it("does nothing outside a visit, and fails closed in one that has no visit key", async () => {
    await chargeVisitor(demo, "named", 1, 5);
    await expect(visit(() => chargeVisitor(demo, "named", 1, 5))).rejects.toBeInstanceOf(DemoSizeRefused);
  });
});

describe("a widget's settings in a visit", () => {
  it("keep only the keys a widget's settings are made of", async () => {
    await visit(() => {
      const s = visitorSettings(demo, { window: 6, headline: "Up", junk: "x", tagView: { name: null, more: 0, removed: false } } as unknown as WidgetSettings) as Record<string, unknown>;
      expect(s).toEqual({ window: 6, headline: "Up" });
    });
  });

  it("have limits that leave room: eight kilobytes a widget, two hundred a dashboard", () => {
    expect(DEMO_STORE_MAX.widgetSettingsBytes).toBe(8192);
    expect(DEMO_STORE_MAX.dashboardWidgetsBytes).toBeGreaterThan(DEMO_STORE_MAX.widgetSettingsBytes * 10);
  });
});
