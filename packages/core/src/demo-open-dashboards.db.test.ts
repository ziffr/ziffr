// Open dashboards in the demo, against the database (GLOSSARY: Demo Mode, Dashboard, Widget, Pool, Theme, Version, Widget
// Template; spec 0051, ticket 9). With the setting in effect a visit may make and change dashboards, widgets, the Pool, Themes,
// Versions and templates of its own; the seed's words, the showcase and the caps hold; with the setting off, without a visit
// or with a Generation of before the last Demo Reset the demo refuses as it always did. Written for the database test run of
// CI; the author could not run it (spec 0051's tickets 8 and 9 were built in parallel, without a database).
import { assertDemoIsOnlyWorkspace } from "./test/demo-walk";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { DemoLimit, DemoReadOnly, DemoSeededWords, DemoShowcase, DemoStale } from "./demo";
import { DemoTextRefused } from "./demo-visitor-words";
import { visitingDemo } from "./demo-visiting";
import { resetDemoWorkspace } from "./demo-reset";
import { forgetStoredSettings } from "./settings-in-effect";
import * as dash from "./dashboards";
import { createDashboardFromTemplate } from "./dashboard-templates";
import { nameVersion, restoreVersion, saveNamedVersion } from "./version-history";
import { deleteTheme, duplicateTheme, saveTheme } from "./workspace-themes";
import { deleteTemplate, renameTemplate, saveDashboardTemplate, saveTemplate } from "./templates";
import { DEMO_WORKSPACE_ID } from "./team";
import { demoBackToSeed } from "./test/demo-walk";
import { DemoSizeRefused } from "./demo-visitor-limits";
import type { Actor } from "./actor";
import type { ThemeSlides, ThemeTokens } from "./types";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const VISIT = "0123456789abcdef0123456789abcdef";
const saved = { changes: process.env.ZIFFR_DEMO_CHANGES, only: process.env.ZIFFR_DEMO_ONLY };
const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
const turnOn = () => { process.env.ZIFFR_DEMO_CHANGES = "1"; process.env.ZIFFR_DEMO_ONLY = "1"; forgetStoredSettings(); };
afterEach(() => { restore("ZIFFR_DEMO_CHANGES", saved.changes); restore("ZIFFR_DEMO_ONLY", saved.only); forgetStoredSettings(); });

const generation = async () => Number((await db().from("demo_state").select("generation").single()).data?.generation);
/** Runs work as a visit of the current Generation, with the setting in effect. */
async function asVisit<T>(work: () => Promise<T>, generationOffset = 0, visit = VISIT): Promise<T> {
  turnOn();
  return visitingDemo({ generation: (await generation()) + generationOffset, visit }, work);
}

let metric = 0;
beforeAll(async () => {
  await assertDemoIsOnlyWorkspace();
  // A fresh demo that is open to visitors, with its showcase recorded and its seed marked done.
  await resetDemoWorkspace({ openToVisitors: true });
  metric = Number((await db().from("metrics").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).single()).data?.id);
}, 180_000);

// What the tests below make is a visitor's: the demo goes back to its seed, closed, so no other test finds it.
afterAll(async () => { await demoBackToSeed(); }, 180_000);

/** A dashboard the seed made that is not in the showcase, with one of its widgets, and the person who owns it. */
async function seededDashboard(): Promise<{ id: number; widget: number; owner: Actor }> {
  const { data: showcase } = await db().from("demo_showcase").select("row_key").eq("table_name", "dashboards");
  const keep = new Set((showcase ?? []).map((r) => r.row_key as string));
  const { data } = await db().from("dashboards").select("id, owner_id, widgets!inner(id)").eq("workspace_id", DEMO_WORKSPACE_ID);
  const row = (data ?? []).find((d) => !keep.has(String(d.id)));
  expect(row, "the seed has a dashboard with widgets outside the showcase").toBeDefined();
  return { id: row!.id as number, widget: (row!.widgets as { id: number }[])[0].id, owner: { ...sara, personId: row!.owner_id as string } };
}

describe("what is open", () => {
  it("is exactly the tables of dashboards, widgets, Versions, Themes and templates among those ticket 9 opened, each with its cap", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    for (const t of ["dashboards", "widgets", "versions", "themes", "team_templates"]) expect(open, t).toContain(t);
    const { data: triggers } = await db().rpc("demo_limit_triggers");
    const caps = new Set(((triggers ?? []) as { table_name: string; kind: string }[]).map((r) => `${r.table_name}:${r.kind}`));
    for (const c of ["dashboards:dashboards", "widgets:widgets_per_dashboard", "widgets:saved_widgets", "versions:versions", "themes:themes", "team_templates:templates"]) expect(caps, c).toContain(c);
  });

  it("opens nothing that sends, shares, publishes or reaches a person", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    for (const t of ["profiles", "memberships", "contacts", "workspaces", "invitations", "view_links", "calendar_links", "webhooks", "feeds", "access_keys", "pack_installs"]) expect(open, t).not.toContain(t);
  });
});

describe("a visitor's own dashboards", () => {
  it("are made, named, filled, saved to the Pool, versioned and removed, as the owner Sara, and the demo notes it was changed", async () => {
    await asVisit(async () => {
      const id = await dash.createDashboard(sara, "My test board");
      await dash.saveDashboardText(sara, id, { name: "My test board 2", intro: "A plain introduction." });
      const widget = await dash.placeWidget(sara, id, { type: "metric", id: metric });
      await dash.saveLayout(sara, id, [{ i: String(widget), x: 1, y: 1, w: 4, h: 3 }]);
      await dash.updateWidget(sara, widget, { title: "My widget" });
      await dash.saveToPool(sara, { type: "widget", id: widget }, "Pooled");
      const pooled = (await db().from("widgets").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("saved", true).eq("title", "Pooled").single()).data!.id as number;
      await dash.deleteSavedWidget(sara, pooled);
      await saveNamedVersion(sara, "dashboard", id, "Before cleaning");
      const version = (await db().from("versions").select("id").eq("object_type", "dashboard").eq("object_id", id).eq("name", "Before cleaning").single()).data!.id as number;
      await nameVersion(sara, version, "Named again");
      await restoreVersion(sara, version);
      // A restore makes its widgets again, with new ids.
      await dash.removeWidget(sara, (await db().from("widgets").select("id").eq("dashboard_id", id).limit(1).single()).data!.id as number);
      // Sara owns it: the visit sees it as Sara does.
      expect((await db().from("dashboards").select("owner_id, name").eq("id", id).single()).data).toMatchObject({ owner_id: "sara", name: "My test board 2" });
    });
    expect((await db().from("demo_state").select("changed_since_reset").single()).data?.changed_since_reset).toBe(true);
  });

  it("are made from a template, and a Dashboard Template is saved, renamed and deleted", async () => {
    await asVisit(async () => {
      const id = await createDashboardFromTemplate(sara, { template: "overview", name: "From a template", fills: [[metric], [metric], [metric], [metric]] });
      const tpl = await saveDashboardTemplate(sara, { dashboardId: id, name: "My template", description: "Kept", labels: [] });
      await renameTemplate(sara, tpl, "My template renamed", "");
      await deleteTemplate(sara, tpl);
      const w = (await db().from("widgets").select("id").eq("dashboard_id", id).limit(1).single()).data!.id as number;
      const tpl2 = await saveTemplate(sara, { widgetId: w, name: "Widget template", description: "", labels: [], choices: {} });
      await deleteTemplate(sara, tpl2);
    });
  });

  it("may have a Theme of their own, copied, shaped and deleted", async () => {
    await asVisit(async () => {
      const from = (await db().from("themes").select("id, tokens, slides").eq("workspace_id", DEMO_WORKSPACE_ID).eq("is_default", false).limit(1).single()).data!;
      const id = await duplicateTheme(sara, from.id as number);
      await saveTheme(sara, id, "My look", from.tokens as ThemeTokens, from.slides as ThemeSlides);
      await dash.setDashboardTheme(sara, (await dash.createDashboard(sara, "Themed")), id);
      await deleteTheme(sara, id);
    });
  });
});

describe("what a visitor writes", () => {
  it("is plain text: a link, markup or nothing is refused in words, and no row is written", async () => {
    const before = (await db().from("dashboards").select("*", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count;
    await asVisit(async () => {
      await expect(dash.createDashboard(sara, "see www.example.com")).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(dash.createDashboard(sara, "<b>x</b>")).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(dash.createDashboard(sara, "")).rejects.toBeInstanceOf(DemoTextRefused);
      const id = await dash.createDashboard(sara, "Words board");
      await expect(dash.saveDashboardText(sara, id, { intro: "write me at a@b.com" })).rejects.toBeInstanceOf(DemoTextRefused);
      const w = await dash.placeWidget(sara, id, { type: "metric", id: metric });
      await expect(dash.updateWidget(sara, w, { title: "https://example.com" })).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(dash.updateWidget(sara, w, { settings: { headline: "see example.com/x" } })).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(saveNamedVersion(sara, "dashboard", id, "www.example.com")).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(saveDashboardTemplate(sara, { dashboardId: id, name: "x@y.com", description: "", labels: [] })).rejects.toBeInstanceOf(DemoTextRefused);
    });
    // Only "Words board" was made.
    expect((await db().from("dashboards").select("*", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count).toBe((before ?? 0) + 1);
  });
});

describe("what the seed made", () => {
  it("keeps its words: a seeded dashboard is not renamed, but its layout may change", async () => {
    const d = await seededDashboard();
    await asVisit(async () => {
      await expect(dash.saveDashboardText(d.owner, d.id, { name: "Renamed by a visitor" })).rejects.toBeInstanceOf(DemoSeededWords);
      await dash.saveLayout(d.owner, d.id, [{ i: String(d.widget), x: 0, y: 0, w: 4, h: 3 }]);
    });
  });

  it("keeps its Theme and cannot be restored from an old state, with plain words and before anything is written", async () => {
    const d = await seededDashboard();
    const theme = (await db().from("themes").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).single()).data!.id as number;
    await asVisit(async () => {
      await expect(dash.setDashboardTheme(d.owner, d.id, theme)).rejects.toBeInstanceOf(DemoShowcase);
      await dash.saveLayout(d.owner, d.id, [{ i: String(d.widget), x: 1, y: 1, w: 4, h: 3 }]);
      const v = (await db().from("versions").select("id").eq("object_type", "dashboard").eq("object_id", d.id).limit(1).maybeSingle()).data;
      if (v) await expect(restoreVersion(d.owner, v.id as number)).rejects.toBeInstanceOf(DemoShowcase);
    });
  });

  it("keeps the showcase whole: no widget is placed on or removed from it", async () => {
    const { data } = await db().from("demo_showcase").select("row_key").eq("table_name", "dashboards").limit(1);
    const showcase = Number(data![0].row_key);
    const widget = (await db().from("widgets").select("id").eq("dashboard_id", showcase).limit(1).single()).data!.id as number;
    await asVisit(async () => {
      await expect(dash.placeWidget(sara, showcase, { type: "metric", id: metric })).rejects.toBeInstanceOf(DemoShowcase);
      await expect(dash.removeWidget(sara, widget)).rejects.toBeInstanceOf(DemoShowcase);
    });
  });

  it("keeps the look of its Themes: a seeded Theme's colours are as they are, and it cannot be deleted", async () => {
    const t = (await db().from("themes").select("id, name, tokens, slides").eq("workspace_id", DEMO_WORKSPACE_ID).eq("is_default", false).limit(1).single()).data!;
    const other = { ...(t.tokens as ThemeTokens), canvas: "#010203" };
    await asVisit(async () => {
      // A Theme a showcase dashboard uses is refused as the showcase, any other as the seed's words.
      const refused = (e: unknown) => e instanceof DemoSeededWords || e instanceof DemoShowcase;
      await expect(saveTheme(sara, t.id as number, t.name as string, other, t.slides as ThemeSlides)).rejects.toSatisfy(refused);
      await expect(deleteTheme(sara, t.id as number)).rejects.toSatisfy(refused);
    });
  });
});

describe("what a visitor stores", () => {
  it("is small: a widget's settings are bounded and unknown keys are dropped, and a visit names only a few Versions", async () => {
    await asVisit(async () => {
      const id = await dash.createDashboard(sara, "Small things");
      const w = await dash.placeWidget(sara, id, { type: "metric", id: metric });
      await expect(dash.updateWidget(sara, w, { settings: { headline: "ok", callouts: Array.from({ length: 50 }, () => ({ period: "2026-03-01", text: "x".repeat(200) })) } })).rejects.toBeInstanceOf(DemoSizeRefused);
      await dash.updateWidget(sara, w, { settings: { headline: "ok", junk: "x".repeat(100) } as never });
      const { data } = await db().from("widgets").select("settings").eq("id", w).single();
      expect(JSON.stringify(data?.settings)).not.toContain("junk");
      for (let i = 0; i < 5; i++) await saveNamedVersion(sara, "dashboard", id, `Named ${i}`);
      await expect(saveNamedVersion(sara, "dashboard", id, "One too many")).rejects.toBeInstanceOf(DemoSizeRefused);
      // An edit goes on whatever the Versions: the automatic ones never fail it.
      await dash.saveLayout(sara, id, [{ i: String(w), x: 2, y: 2, w: 4, h: 3 }]);
    // A visit of its own: the Versions the other tests named count against theirs.
    }, 0, "fedcba9876543210fedcba9876543210");
  });
});

describe("the caps", () => {
  it("hold 40 widgets on a dashboard: the next is refused, with the demo's words", async () => {
    await asVisit(async () => {
      const id = await dash.createDashboard(sara, "Crowded");
      for (let i = 0; i < 40; i++) await dash.placeWidget(sara, id, { type: "metric", id: metric });
      await expect(dash.placeWidget(sara, id, { type: "metric", id: metric })).rejects.toBeInstanceOf(DemoLimit);
    });
  }, 120_000);
});

describe("without a visit, or a visit that is stale, or with the setting off", () => {
  it("is refused as the demo always was, whatever the work", async () => {
    // No visit's client at all.
    turnOn();
    await expect(dash.createDashboard(sara, "No visit")).rejects.toBeInstanceOf(DemoReadOnly);
    // A page drawn before the last Demo Reset.
    await expect(asVisit(() => dash.createDashboard(sara, "Stale"), -1)).rejects.toBeInstanceOf(DemoStale);
    // The setting off: the header is not sent at all.
    delete process.env.ZIFFR_DEMO_CHANGES;
    forgetStoredSettings();
    await expect(visitingDemo({ generation: await generation(), visit: VISIT }, () => dash.createDashboard(sara, "Off"))).rejects.toBeInstanceOf(DemoReadOnly);
  });
});
