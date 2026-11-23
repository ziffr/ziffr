import { describe, expect, it } from "vitest";
import { demoAllows, demoClassOf, demoOperations } from "./demo-changes";
import { refuseInDemo, DemoReadOnly } from "./demo";
import { DEMO_WORKSPACE_ID } from "./team";

const on = { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1" };

describe("demoAllows", () => {
  it("says no to every operation, whatever the setting", () => {
    const keys = demoOperations();
    expect(keys.length).toBeGreaterThan(200);
    for (const k of keys) {
      expect(demoAllows(k, {})).toBe(false);
      expect(demoAllows(k, { ZIFFR_DEMO_CHANGES: "1" })).toBe(false);
      expect(demoAllows(k, on)).toBe(false);
    }
  });

  it("says no to what it does not know", () => {
    expect(demoClassOf("nothing-actions:nothing")).toBeNull();
    expect(demoAllows("nothing-actions:nothing", on)).toBe(false);
  });

  it("classifies the actions that send or reach outside as blocked, never as not-yet", () => {
    expect(demoClassOf("webhook-actions:createWebhook")).toEqual({ class: "blocked", reason: "sends" });
    expect(demoClassOf("view-link-actions:createViewLink")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("settings-actions:renameWorkspace")).toEqual({ class: "blocked", reason: "changes-what-everyone-sees" });
    expect(demoClassOf("canvas-actions:placeWidget")).toEqual({ class: "blocked", reason: "not-yet" });
    expect(demoClassOf("search-actions:searchEverything")).toEqual({ class: "reads" });
  });
});

describe("refuseInDemo", () => {
  const demo = { workspaceId: DEMO_WORKSPACE_ID };
  it("refuses the demo with or without an operation, as before", () => {
    expect(() => refuseInDemo(demo)).toThrow(DemoReadOnly);
    expect(() => refuseInDemo(demo, "canvas-actions:placeWidget")).toThrow(DemoReadOnly);
    expect(() => refuseInDemo(demo, "made-up-actions:doSomething")).toThrow(DemoReadOnly);
  });

  it("leaves every other Workspace alone", () => {
    expect(() => refuseInDemo({ workspaceId: "11111111-1111-4111-8111-111111111111" }, "canvas-actions:placeWidget")).not.toThrow();
  });
});
