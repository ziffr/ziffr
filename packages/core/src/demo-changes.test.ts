import { afterEach, describe, expect, it, vi } from "vitest";
import { demoAllows, demoClassOf, demoOperations } from "./demo-changes";
import { refuseInDemo, DemoReadOnly } from "./demo";
import { DEMO_ROW_CAPS } from "./demo-limits";
import { DEMO_WORKSPACE_ID } from "./team";

const on = { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1" };

/** What ticket 8 of spec 0051 opened: the work around a value. A key added here is a decision of the ticket that adds it. */
const OPENED_8 = [
  "actions:decideCorrection", "actions:recordSimulatedMessage", "actions:submitWebForm",
  "connector-actions:askForMissingValues", "connector-actions:recordSimulatedPromptAnswer", "connector-actions:recordSimulatedReply", "connector-actions:recordSimulatedTicketClose", "connector-actions:sendDueReminders",
  "fill-in-actions:fillInForSubmitter", "paste-actions:recordPaste",
  "series-actions:askMeNow", "series-actions:recordValue",
  "workflow-actions:approveValue", "workflow-actions:closeWorkflowPeriod", "workflow-actions:confirmOwnValue", "workflow-actions:correctOwnValue", "workflow-actions:lockPeriod",
  "workflow-actions:proposeValueCorrection", "workflow-actions:runWorkflowsNow", "workflow-actions:sendValueBack", "workflow-actions:setAway", "workflow-actions:setStandIn",
];
/** What ticket 9 opened: dashboards, widgets, the Pool, Themes of a visitor's own, Versions and templates. */
const OPENED_9 = [
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
/** What ticket 11 opened: Metrics, Targets and Projections, Tags, Questions and Tasks, Shares and Groups among the made-up people, the preferred channel. */
const OPENED_11 = [
  "access-actions:decideAccess", "access-actions:requestAccess",
  "actions:createAction", "actions:createDerivedMetric", "actions:createMetric", "actions:replyToAction", "actions:setActionStatus",
  "canvas-actions:assignInPlace", "canvas-actions:markTaskDone", "canvas-actions:setGroupShare", "canvas-actions:setShare",
  "connector-actions:setPreference",
  "series-actions:archiveMetric", "series-actions:removeSeriesRows", "series-actions:restoreMetric", "series-actions:saveSeriesRows", "series-actions:setMetricSources", "series-actions:updateMetricDetails",
  "tag-actions:addTags", "tag-actions:deleteTag", "tag-actions:mergeTags", "tag-actions:removeTag", "tag-actions:renameTag",
  "team-actions:createGroup", "team-actions:deleteGroup", "team-actions:renameGroup", "team-actions:setMember",
];
const OPENED = [...OPENED_8, ...OPENED_9, ...OPENED_11].sort();

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
    const allowed = demoOperations().filter((k) => demoAllows(k, on)).sort();
    expect(allowed).toEqual(OPENED);
    for (const k of allowed) expect(["open", "limited"]).toContain(demoClassOf(k)?.class);
  });

  it("says no to what it does not know", () => {
    expect(demoClassOf("nothing-actions:nothing")).toBeNull();
    expect(demoAllows("nothing-actions:nothing", on)).toBe(false);
  });

  it("gives every limited action a limit the database and the core both have", () => {
    for (const k of OPENED) {
      const c = demoClassOf(k);
      // `workflow_run` is the one Workflow run a minute (demo_visit_counts), not a row cap.
      if (c?.class === "limited") expect([...Object.keys(DEMO_ROW_CAPS), "workflow_run"], k).toContain(c.limit);
    }
  });

  it("keeps blocked what sends, shares, publishes, fetches, uploads or changes what everyone sees", () => {
    expect(demoClassOf("webhook-actions:createWebhook")).toEqual({ class: "blocked", reason: "sends" });
    expect(demoClassOf("view-link-actions:createViewLink")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("theme-actions:importTheme")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("design-actions:addViewDesign")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("pack-actions:installPack")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("canvas-actions:setShare")).toEqual({ class: "limited", limit: "shares" });
    // Ticket 11 keeps these blocked: a person outside the demo, a deletion and a hand-over, Workflows, the Setup Guide's way of being asked.
    expect(demoClassOf("team-actions:addContact")).toEqual({ class: "blocked", reason: "reaches-outside" });
    expect(demoClassOf("team-actions:removeContact")).toEqual({ class: "blocked", reason: "reaches-outside" });
    for (const k of ["series-actions:deleteMetric", "series-actions:handOverMetricTo", "workflow-actions:setMetricWorkflow", "workflow-actions:saveWorkflow"]) expect(demoClassOf(k), k).toEqual({ class: "blocked", reason: "not-yet" });
    expect(demoClassOf("setup/ways-actions:saveAskMeBy")).toEqual({ class: "blocked", reason: "does-nothing" });
    // Nothing that sends, keys, feeds, invites or installs is opened by the sharing and Metrics ticket.
    for (const k of ["feed-actions:createFeed", "key-actions:createKey", "webhook-actions:createWebhook", "team-actions:inviteMember", "pack-actions:installPack"]) expect(demoClassOf(k)?.class, k).toBe("blocked");
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

  it("keeps every message to the outside, and the preview of the simulated channels, as they were", () => {
    for (const k of ["connector-actions:connectSlack", "connector-actions:setTelegram", "connector-actions:emailRemindersAgain", "connector-actions:sendTestMessage", "team-actions:inviteMember", "webhook-actions:sendTestWebhook"]) {
      expect(demoClassOf(k)?.class, k).toBe("blocked");
    }
    // The previews change nothing and stay what they were, even with the setting in effect; the recording ones are separate actions.
    for (const k of ["actions:simulateMessage", "connector-actions:simulatePromptAnswer", "connector-actions:simulateReply", "connector-actions:simulateTicketClose"]) {
      expect(demoClassOf(k), k).toEqual({ class: "reads" });
    }
    // A real Workspace's daily run: the demo is never scheduled, so it would promise what does not happen.
    expect(demoClassOf("workflow-actions:runTodayNow")).toEqual({ class: "blocked", reason: "does-nothing" });
  });

  it("names a limit that exists for every limited operation", () => {
    const limits = new Set([...Object.keys(DEMO_ROW_CAPS), "workflow_run"]);
    for (const k of demoOperations()) {
      const c = demoClassOf(k);
      if (c?.class === "limited") expect(limits.has(c.limit), `${k} names the limit "${c.limit}"`).toBe(true);
    }
  });
});

describe("refuseInDemo", () => {
  const demo = { workspaceId: DEMO_WORKSPACE_ID };
  afterEach(() => vi.unstubAllEnvs());

  it("refuses the demo with or without an operation, as before, while the setting is off", () => {
    expect(() => refuseInDemo(demo)).toThrow(DemoReadOnly);
    expect(() => refuseInDemo(demo, "canvas-actions:placeWidget")).toThrow(DemoReadOnly);
    expect(() => refuseInDemo(demo, "made-up-actions:doSomething")).toThrow(DemoReadOnly);
    for (const k of OPENED) expect(() => refuseInDemo(demo, k), k).toThrow(DemoReadOnly);
  });

  it("lets an opened operation on, and only that, once visitors may change the demo", () => {
    vi.stubEnv("ZIFFR_DEMO_ONLY", "1");
    vi.stubEnv("ZIFFR_DEMO_CHANGES", "1");
    expect(() => refuseInDemo(demo, "series-actions:recordValue")).not.toThrow();
    expect(() => refuseInDemo(demo, "canvas-actions:setShare")).not.toThrow();
    expect(() => refuseInDemo(demo, "series-actions:deleteMetric")).toThrow(DemoReadOnly);
    expect(() => refuseInDemo(demo, "made-up-actions:doSomething")).toThrow(DemoReadOnly);
    // A place that cannot name its operation always refuses, whatever the list says.
    expect(() => refuseInDemo(demo)).toThrow(DemoReadOnly);
  });

  it("needs the demo-only Installation as well as the setting", () => {
    vi.stubEnv("ZIFFR_DEMO_CHANGES", "1");
    expect(() => refuseInDemo(demo, "series-actions:recordValue")).toThrow(DemoReadOnly);
  });

  it("leaves every other Workspace alone", () => {
    expect(() => refuseInDemo({ workspaceId: "11111111-1111-4111-8111-111111111111" }, "canvas-actions:placeWidget")).not.toThrow();
  });
});
