import { describe, expect, it } from "vitest";
import { demoAllows, demoClassOf, demoOperations } from "./demo-changes";
import { DEMO_ROW_CAPS } from "./demo-limits";
import { refuseInDemo, DemoReadOnly } from "./demo";
import { DEMO_WORKSPACE_ID } from "./team";

const on = { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1" };

/** What ticket 9 of spec 0051 opened: dashboards, widgets, the Pool, Themes of a visitor's own, Versions and templates. */
const OPENED = [
  "canvas-actions:applyTemplate", "canvas-actions:createDashboardNamed", "canvas-actions:deleteSavedWidget", "canvas-actions:placeWidget", "canvas-actions:removeWidget",
  "canvas-actions:saveDashboardText", "canvas-actions:saveLayout", "canvas-actions:saveToPool", "canvas-actions:updateWidget",
  "dashboard-template-actions:createFromDashboardTemplate", "dashboard-template-actions:saveAsDashboardTemplate", "home-actions:newDashboard",
  "template-actions:deleteTemplate", "template-actions:renameTemplate", "template-actions:saveTemplate",
  "theme-actions:addStandardTheme", "theme-actions:deleteTheme", "theme-actions:duplicateTheme", "theme-actions:saveTheme", "theme-actions:setDashboardTheme",
  "version-actions:nameVersion", "version-actions:restoreVersion", "version-actions:saveNamedVersion",
  // Ticket 10: decks and Snapshots.
  "convert-actions:addToDeck", "convert-actions:makeDeck", "convert-actions:makeDeckFromSnapshot", "deck-actions:createDeck", "deck-actions:deleteDeck", "deck-actions:renameDeck",
  "deck-actions:saveDeck", "deck-actions:setDeckFooter", "deck-workflow-template-actions:createDeckFromTemplate", "deck-workflow-template-actions:saveAsDeckTemplate",
  "snapshot-actions:deleteSnapshot", "snapshot-actions:editSnapshotWords", "snapshot-actions:showSnapshot", "snapshot-actions:takeSnapshot",
  "template-actions:saveSlideLayout", "theme-actions:setDeckTheme",
];

describe("demoAllows", () => {
  it("says no to every operation unless the setting is in effect, whichever operation it is", () => {
    const keys = demoOperations();
    expect(keys.length).toBeGreaterThan(200);
    for (const k of keys) {
      expect(demoAllows(k, {})).toBe(false);
      expect(demoAllows(k, { ZIFFR_DEMO_CHANGES: "1" })).toBe(false);
      expect(demoAllows(k, { ZIFFR_DEMO_ONLY: "1" })).toBe(false);
    }
  });

  it("with the setting in effect says yes to exactly what the tickets opened", () => {
    const allowed = demoOperations().filter((k) => demoAllows(k, on));
    expect(allowed.sort()).toEqual([...OPENED].sort());
  });

  it("says no to what it does not know", () => {
    expect(demoClassOf("nothing-actions:nothing")).toBeNull();
    expect(demoAllows("nothing-actions:nothing", on)).toBe(false);
  });

  it("gives every limited action a limit the database and the core both have", () => {
    for (const k of OPENED) {
      const c = demoClassOf(k);
      if (c?.class === "limited") expect(Object.keys(DEMO_ROW_CAPS), k).toContain(c.limit);
    }
  });

  it("keeps blocked what sends, shares, publishes, fetches, uploads or changes what everyone sees", () => {
    expect(demoClassOf("webhook-actions:createWebhook")).toEqual({ class: "blocked", reason: "sends" });
    expect(demoClassOf("view-link-actions:createViewLink")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("theme-actions:importTheme")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("design-actions:addViewDesign")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("pack-actions:installPack")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("canvas-actions:setShare")).toEqual({ class: "blocked", reason: "not-yet" });
    expect(demoClassOf("settings-actions:renameWorkspace")).toEqual({ class: "blocked", reason: "changes-what-everyone-sees" });
    expect(demoClassOf("theme-actions:setDefaultTheme")).toEqual({ class: "blocked", reason: "changes-what-everyone-sees" });
    expect(demoClassOf("pin-actions:pinDashboard")).toEqual({ class: "blocked", reason: "does-nothing" });
    expect(demoClassOf("deck-actions:createDeck")).toEqual({ class: "limited", limit: "decks" });
    expect(demoClassOf("snapshot-actions:takeSnapshot")).toEqual({ class: "limited", limit: "snapshots" });
    // Ticket 10 opens no Workflow Template, no automatic Snapshot and no export record.
    expect(demoClassOf("deck-workflow-template-actions:saveAsWorkflowTemplate")).toEqual({ class: "blocked", reason: "not-yet" });
    expect(demoClassOf("snapshot-actions:setAutoSnapshots")).toEqual({ class: "blocked", reason: "does-nothing" });
    expect(demoClassOf("deck-actions:noteDeckExport")).toEqual({ class: "blocked", reason: "does-nothing" });
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
