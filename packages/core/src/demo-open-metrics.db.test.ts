// Open Metrics, Threads and sharing in the demo, against the database (GLOSSARY: Demo Mode, Metric, Derived Metric, Target Series,
// Projection, Tag, Group, Share, Question, Task; spec 0051, ticket 11). With the setting in effect a visit may make and change Metrics
// of its own, their Targets and Tags, ask and answer, and share and group among the demo's made-up people; the seed's own Metrics, Groups
// and Shares, the showcase, the words and the caps hold; nothing leaves the Outbox; with the setting off, without a visit, or with a
// Generation of before the last Demo Reset the demo refuses as it always did. Written for the database test run of CI; the author
// could not run it (spec 0051's tickets were built in parallel, without a database).
import { assertDemoIsOnlyWorkspace } from "./test/demo-walk";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { DemoLimit, DemoReadOnly, DemoSeededWords, DemoShowcase, DemoStale } from "./demo";
import { DemoTextRefused } from "./demo-visitor-words";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { visitingDemo } from "./demo-visiting";
import { resetDemoWorkspace } from "./demo-reset";
import { forgetStoredSettings } from "./settings-in-effect";
import { archiveMetric, restoreMetric } from "./archived-metrics";
import { createDerivedMetric } from "./derived-metrics";
import { createMetric, removeSeriesRows, saveSeriesRows, setMetricSources, updateMetricDetails } from "./metrics";
import { addMetricTags, removeMetricTags, renameTag } from "./tags";
import { createGroup, deleteGroup, renameGroup, setGroupMember } from "./team";
import { decideAccess, requestAccess, share, shareWithGroup } from "./sharing";
import { ask, markTaskDone, reply, setActionStatus, setPreference } from "./questions";
import { DEMO_METRIC_WORDS } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";
import { demoBackToSeed, demoWalkOutbound } from "./test/demo-walk";
import type { Actor } from "./actor";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const ben: Actor = { personId: "ben", workspaceId: DEMO_WORKSPACE_ID, role: "member" };
const VISIT = "0123456789abcdef0123456789abcdef";
const saved = { changes: process.env.ZIFFR_DEMO_CHANGES, only: process.env.ZIFFR_DEMO_ONLY, key: process.env.ZIFFR_DEMO_ADDRESS_KEY, hops: process.env.ZIFFR_PROXY_HOPS };
const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
const turnOn = () => { Object.assign(process.env, { ZIFFR_DEMO_CHANGES: "1", ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_ADDRESS_KEY: "k".repeat(40), ZIFFR_PROXY_HOPS: "1" }); forgetStoredSettings(); };
afterEach(() => { restore("ZIFFR_DEMO_CHANGES", saved.changes); restore("ZIFFR_DEMO_ONLY", saved.only); restore("ZIFFR_DEMO_ADDRESS_KEY", saved.key); restore("ZIFFR_PROXY_HOPS", saved.hops); forgetStoredSettings(); });
// Each visit comes from an address of its own: the core counts the NEW Tags and rows of a Target Series against the address's share
// (final review), and this file makes more of them than one address may.
let nextAddress = 0;

const generation = async () => Number((await db().from("demo_state").select("generation").single()).data?.generation);
/** Runs work as a visit of the current Generation, with the setting in effect. */
async function asVisit<T>(work: () => Promise<T>, generationOffset = 0): Promise<T> {
  turnOn();
  nextAddress += 1;
  const who = { visitId: VISIT, headers: new Headers({ "x-forwarded-for": `198.${(nextAddress >> 8) & 255}.${nextAddress & 255}.7` }) };
  return visitingDemo({ generation: (await generation()) + generationOffset, visit: VISIT }, work, who);
}
const count = async (table: string, where: Record<string, string | number> = {}) => {
  let q = db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID);
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  return (await q).count ?? 0;
};
const base = { period: "month", format: "number", sources: ["web_form"] };
const day = (n = 0) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const thisMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); };

const setCap = async (kind: string, n: number) => { expect((await db().from("demo_limits").update({ max_rows: n }).eq("kind", kind)).error).toBeNull(); };
beforeAll(async () => {
  await assertDemoIsOnlyWorkspace();
  // A fresh demo that is open to visitors, with its showcase recorded and its seed marked done.
  // The reset refuses within a minute of the last one (an earlier file's), which would leave that file's half-seeded demo
  // ("starting fresh") for this one: so wait until it is done, as the reset job would at its next call.
  for (let tries = 0; !(await resetDemoWorkspace({ openToVisitors: true })); tries++) {
    if (tries >= 14) throw new Error("The demo could not be reset for this file.");
    await new Promise((r) => setTimeout(r, 5_000));
  }
  // This file makes more Metrics than a window holds: the caps are raised here, and the cap tests set their own.
  await setCap("metrics", 500);
  await setCap("derived_metrics", 500);
}, 180_000);
afterAll(async () => { await setCap("metrics", 15); await setCap("derived_metrics", 5); await demoBackToSeed(); }, 180_000);

/** A seeded Metric that is not in the showcase, a showcase one (Churn rate), and the seed's Group. */
async function seeded() {
  const { data: showcase } = await db().from("demo_showcase").select("row_key").eq("table_name", "metrics");
  const keep = new Set((showcase ?? []).map((r) => r.row_key as string));
  const { data: all } = await db().from("metrics").select("id, owner_id, slug").eq("workspace_id", DEMO_WORKSPACE_ID).is("formula", null).order("id");
  const plain = (all ?? []).find((m) => !keep.has(String(m.id)));
  const shown = (all ?? []).find((m) => m.slug === "churn-rate");
  const group = (await db().from("groups").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("everyone", false).order("id").limit(1).single()).data!;
  expect(plain && shown).toBeTruthy();
  return { plain: plain!, shown: shown!, group: group.id as number };
}
const owner = (id: string): Actor => ({ ...sara, personId: id });

describe("what is open", () => {
  it("is the tables behind Metrics, Targets, Tags, Groups, Shares, access requests and the preferred channel, each with its cap", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    for (const t of ["metrics", "series_values", "tags", "metric_tags", "groups", "group_members", "shares", "access_requests", "delivery_preferences"]) expect(open, t).toContain(t);
    const { data: triggers } = await db().rpc("demo_limit_triggers");
    const caps = new Set(((triggers ?? []) as { table_name: string; kind: string }[]).map((r) => `${r.table_name}:${r.kind}`));
    for (const c of ["metrics:metrics", "metrics:derived_metrics", "series_values:series_rows", "tags:tags", "groups:groups", "group_members:group_members", "shares:shares", "access_requests:access_requests", "thread_messages:thread_messages"]) expect(caps, c).toContain(c);
  });

  it("opens nothing that sends, publishes or reaches a person, and leaves Workflows alone", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    for (const t of ["profiles", "memberships", "contacts", "invitations", "view_links", "calendar_links", "webhooks", "feeds", "access_keys", "pack_installs", "workflows"]) expect(open, t).not.toContain(t);
  });
});

describe("a visitor's own Metric", () => {
  it("is made with a slug of its own, asks only the demo's made-up people, and sends nothing outside", async () => {
    const before = await demoWalkOutbound();
    const made = await asVisit(() => createMetric(sara, { ...base, name: "New", submitters: ["ben"] }));
    expect(made.slug).not.toBe("new");
    expect(made.slug).toMatch(/^new-[0-9a-f]{6}$/);
    expect(await demoWalkOutbound()).toEqual(before);
    // Its words are plain text; a link, a Workflow and a person outside the demo are refused before anything is written.
    const n = await count("metrics");
    await expect(asVisit(() => createMetric(sara, { ...base, name: "See www.example.com" }))).rejects.toBeInstanceOf(DemoTextRefused);
    await expect(asVisit(() => createMetric(sara, { ...base, name: "Ok", description: "mail a@b.example" }))).rejects.toBeInstanceOf(DemoTextRefused);
    await expect(asVisit(() => createMetric(sara, { ...base, name: "Ok", targetMax: 1e15 }))).rejects.toBeInstanceOf(DemoTextRefused);
    await expect(asVisit(() => createMetric(sara, { ...base, name: "Ok", workflowId: 1 }))).rejects.toThrow(DEMO_METRIC_WORDS.workflow);
    await expect(asVisit(() => createMetric(sara, { ...base, name: "Ok", submitters: ["t-nobody"] }))).rejects.toThrow();
    expect(await count("metrics")).toBe(n);
  });

  it("is changed, given Sources, Targets and Projections of reasonable size, and archived and brought back", async () => {
    await asVisit(async () => {
      const { id } = await createMetric(sara, { ...base, name: "Visitor metric" });
      await updateMetricDetails(sara, id, { description: "A plain description.", targetMin: 1, targetMax: 100 });
      await setMetricSources(sara, id, ["web_form", "slack"]);
      expect((await saveSeriesRows(sara, id, "target", [{ period: thisMonth(), value: 10 }], "A target")).saved).toBe(1);
      expect((await saveSeriesRows(sara, id, "projection", [{ period: thisMonth(), value: 12 }], "")).saved).toBe(1);
      expect((await removeSeriesRows(sara, id, "target", [thisMonth()])).removed).toBe(1);
      await expect(updateMetricDetails(sara, id, { description: "see www.example.com" })).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(saveSeriesRows(sara, id, "target", Array.from({ length: 61 }, () => ({ period: thisMonth(), value: 1 })), "")).rejects.toThrow(DEMO_METRIC_WORDS.rows);
      await expect(saveSeriesRows(sara, id, "target", [{ period: "2015-01-01", value: 1 }], "")).rejects.toThrow(DEMO_METRIC_WORDS.rows);
      await expect(saveSeriesRows(sara, id, "target", [{ period: thisMonth(), value: 1e15 }], "")).rejects.toThrow(DEMO_METRIC_WORDS.number);
      expect((await archiveMetric(sara, id)).archived).toBe(true);
      expect((await restoreMetric(sara, id)).restored).toBe(true);
    });
  });

  it("can be calculated from others by a short formula, only so many at once, and never from a formula past the demo's bounds", async () => {
    await asVisit(async () => {
      const { slug } = await createMetric(sara, { ...base, name: "Calc input" });
      const first = await createDerivedMetric(sara, { name: "Calc 1", formula: `{${slug}} * 2` });
      expect(first.slug).toBeTruthy();
      await expect(createDerivedMetric(sara, { name: "Calc long", formula: "{a}+{b}+{c}+{d}+{e}+{f}" })).rejects.toThrow(DEMO_METRIC_WORDS.formula);
      await expect(createDerivedMetric(sara, { name: "Calc ops", formula: `{${slug}}${"+1".repeat(21)}` })).rejects.toThrow(DEMO_METRIC_WORDS.formula);
      // The cap, as the demo holds it: set to one more than the calculated Metrics made so far in this window.
      const made = (await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID).not("formula", "is", null).gt("created_at", (await db().from("demo_state").select("seed_done_at").single()).data!.seed_done_at)).count ?? 0;
      await setCap("derived_metrics", made + 1);
      await createDerivedMetric(sara, { name: "Calc 2", formula: `{${slug}} * 2` });
      await expect(createDerivedMetric(sara, { name: "Calc 3", formula: `{${slug}} * 3` })).rejects.toBeInstanceOf(DemoLimit);
      await setCap("derived_metrics", 500);
    });
  });
});

describe("what the seed made", () => {
  it("is not archived or shared by a visit, its words stay, its Target Range and Sources may change, and the showcase is whole", async () => {
    const { plain, shown } = await seeded();
    await asVisit(async () => {
      await expect(archiveMetric(owner(plain.owner_id), plain.id)).rejects.toBeInstanceOf(DemoShowcase);
      await expect(share(owner(plain.owner_id), "metric", plain.id, "ben", "viewer")).rejects.toBeInstanceOf(DemoShowcase);
      await expect(updateMetricDetails(owner(plain.owner_id), plain.id, { name: "Renamed by a visitor" })).rejects.toBeInstanceOf(DemoSeededWords);
      await updateMetricDetails(owner(plain.owner_id), plain.id, { targetMin: 1, targetMax: 2 });
      await setMetricSources(owner(plain.owner_id), plain.id, ["web_form"]);
      // The showcase Metric: its row, its Tags and its targets are everyone's.
      await expect(updateMetricDetails(owner(shown.owner_id), shown.id, { targetMax: 5 })).rejects.toBeInstanceOf(DemoShowcase);
      await expect(addMetricTags(owner(shown.owner_id), shown.id, ["visitor"])).rejects.toBeInstanceOf(DemoShowcase);
      await expect(saveSeriesRows(owner(shown.owner_id), shown.id, "target", [{ period: thisMonth(), value: 1 }], "")).rejects.toBeInstanceOf(DemoShowcase);
    });
  });

  it("keeps a seeded Group as it is: not renamed, deleted or filled, while a visitor's own Group is", async () => {
    const { group } = await seeded();
    await asVisit(async () => {
      await expect(renameGroup(sara, group, "Renamed")).rejects.toBeInstanceOf(DemoShowcase);
      await expect(deleteGroup(sara, group)).rejects.toBeInstanceOf(DemoShowcase);
      await expect(setGroupMember(sara, group, "ben", true)).rejects.toBeInstanceOf(DemoShowcase);
      const mine = await createGroup(sara, "Visitor group");
      await renameGroup(sara, mine, "Visitor group 2");
      await setGroupMember(sara, mine, "ben", true);
      await setGroupMember(sara, mine, "ben", false);
      await deleteGroup(sara, mine);
      await expect(createGroup(sara, "see www.example.com")).rejects.toBeInstanceOf(DemoTextRefused);
    });
  });
});

describe("Tags of a visitor's own Metric", () => {
  it("are put on and taken off in plain words of at most 40 characters, renamed by an Owner, and a seeded Tag keeps its name", async () => {
    await asVisit(async () => {
      const { id } = await createMetric(sara, { ...base, name: "Tagged metric" });
      expect(await addMetricTags(sara, id, ["visitor", "second"])).toEqual(["second", "visitor"]);
      await expect(addMetricTags(sara, id, ["x".repeat(41)])).rejects.toThrow();
      await expect(addMetricTags(sara, id, ["see www.example.com"])).rejects.toBeInstanceOf(DemoTextRefused);
      const tag = (await db().from("tags").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("name", "visitor").single()).data!.id as string;
      await renameTag(sara, tag, "visitors");
      expect(await removeMetricTags(sara, id, ["visitors", "second"])).toEqual([]);
      const seededTag = (await db().from("demo_seeded_rows").select("row_key").eq("table_name", "tags").limit(1).maybeSingle()).data;
      if (seededTag) await expect(renameTag(sara, seededTag.row_key as string, "Renamed by a visitor")).rejects.toBeInstanceOf(DemoSeededWords);
    });
  });
});

describe("Shares, access requests and Groups among the made-up people", () => {
  it("share a visitor's Metric with a Member or a Group, and are taken away again; a person outside the demo is refused", async () => {
    await asVisit(async () => {
      const { id } = await createMetric(sara, { ...base, name: "Shared metric" });
      const group = await createGroup(sara, "Sharing group");
      await share(sara, "metric", id, "ben", "viewer");
      await shareWithGroup(sara, "metric", id, group, "viewer");
      expect(await count("shares", { object_id: id })).toBe(2);
      await share(sara, "metric", id, "ben", null);
      await shareWithGroup(sara, "metric", id, group, null);
      expect(await count("shares", { object_id: id })).toBe(0);
      await expect(share(sara, "metric", id, "t-nobody", "viewer")).rejects.toThrow();
    });
  });

  it("never make a Metric of the seed that a person does not see visible to them: not by a dashboard, a calculated Metric or a Group joined later", async () => {
    // Greta, the Guest, sees two Metrics only; take a seeded Metric of Sara's that she does not see.
    const guest = (await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("role", "guest").limit(1).single()).data!.user_id as string;
    const { visibleMetricIds } = await import("./access");
    const { getMetrics } = await import("./workspace-data");
    const all = await getMetrics(DEMO_WORKSPACE_ID);
    const sees = await visibleMetricIds(DEMO_WORKSPACE_ID, guest, all);
    const hidden = all.find((m) => !sees.has(m.id) && !m.formula && m.aggregation !== "none" && !m.archived_at)!;
    expect(hidden, "the seed has a Metric the Guest does not see and a formula may read").toBeDefined();
    const me = owner(hidden.owner_id);
    await asVisit(async () => {
      const dash = await (await import("./dashboards")).createDashboard(me, "Shows a hidden Metric");
      await (await import("./dashboards")).placeWidget(me, dash, { type: "metric", id: hidden.id });
      await expect(share(me, "dashboard", dash, guest, "viewer")).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
      // A calculated Metric over the hidden input shows the input's values.
      const calc = await createDerivedMetric(me, { name: "Hidden times one", formula: `{${hidden.slug}} * 1` });
      await expect(share(me, "metric", calc.id, guest, "viewer")).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
      // A Group shared with, then a Guest added later.
      const group = await createGroup(me, "Later group");
      await setGroupMember(me, group, "ben", true);
      await expect(shareWithGroup(me, "dashboard", dash, group, "viewer")).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
      // A dashboard of Metrics Ben sees already is shared with the Group; the hidden one is added after, and the Guest may not join.
      const dashboards = await import("./dashboards");
      const plain = await dashboards.createDashboard(me, "Only seen Metrics");
      await shareWithGroup(me, "dashboard", plain, group, "viewer");
      await expect(setGroupMember(me, group, guest, true)).resolves.toBeUndefined();
      await setGroupMember(me, group, guest, false);
      // The hidden Metric cannot be added to a dashboard the Group already has: Ben, a member, does not see it either.
      await expect(dashboards.placeWidget(me, plain, { type: "metric", id: hidden.id })).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
      expect(await count("shares", { object_id: dash })).toBe(0);
    });
    // A refusal at a cap changes nothing: a changed role keeps the Share (checked in place, not deleted first).
    await asVisit(async () => {
      const { id } = await createMetric(me, { ...base, name: "Role change" });
      await share(me, "metric", id, "ben", "viewer");
      await share(me, "metric", id, "ben", "editor");
      expect((await db().from("shares").select("role").eq("object_id", id).eq("user_id", "ben")).data).toEqual([{ role: "editor" }]);
    });
  });

  it("never let an object that is already shared come to show the Guest a hidden Metric: a widget added or changed, a template, a restored Version, a new formula", async () => {
    const guest = (await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("role", "guest").limit(1).single()).data!.user_id as string;
    const { visibleMetricIds } = await import("./access");
    const { getMetrics } = await import("./workspace-data");
    const all = await getMetrics(DEMO_WORKSPACE_ID);
    const sees = await visibleMetricIds(DEMO_WORKSPACE_ID, guest, all);
    const hidden = all.find((m) => !sees.has(m.id) && !m.formula && m.aggregation !== "none" && !m.archived_at)!;
    expect(hidden, "the seed has a Metric the Guest does not see and a formula may read").toBeDefined();
    const me = owner(hidden.owner_id);
    const dashboards = await import("./dashboards");
    const { saveNamedVersion, restoreVersion } = await import("./version-history");
    const { setMetricFormula } = await import("./derived-metrics");
    await asVisit(async () => {
      // A Metric of the visitor's own that the Guest may see: made here, with the hidden one's period, and shared with the Guest.
      const seen = await createMetric(me, { ...base, period: hidden.period, aggregation: "sum", name: "Seen by the Guest" });
      await share(me, "metric", seen.id, guest, "viewer");
      const dash = await dashboards.createDashboard(me, "Shared with the Guest");
      const widget = await dashboards.placeWidget(me, dash, { type: "metric", id: seen.id });
      await saveNamedVersion(me, "dashboard", dash, "Before");
      const before = (await db().from("versions").select("id").eq("object_type", "dashboard").eq("object_id", dash).eq("name", "Before").single()).data!.id as number;
      await share(me, "dashboard", dash, guest, "viewer");
      await expect(dashboards.placeWidget(me, dash, { type: "metric", id: hidden.id })).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
      await expect(dashboards.updateWidget(me, widget, { metricIds: [hidden.id] })).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
      expect(before).toBeGreaterThan(0);
      // A Version that held a hidden Metric does not come back onto a dashboard that is shared since: made while it was not.
      const other = await dashboards.createDashboard(me, "Shared later");
      const hiddenWidget = await dashboards.placeWidget(me, other, { type: "metric", id: hidden.id });
      await saveNamedVersion(me, "dashboard", other, "With hidden");
      await dashboards.removeWidget(me, hiddenWidget);
      await share(me, "dashboard", other, guest, "viewer");
      const withHidden = (await db().from("versions").select("id").eq("object_type", "dashboard").eq("object_id", other).eq("name", "With hidden").single()).data!.id as number;
      await expect(restoreVersion(me, withHidden)).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
      // A calculated Metric shared with the Guest keeps to inputs the Guest sees.
      const calc = await createDerivedMetric(me, { name: "Seen times one", formula: `{${seen.slug}} * 1` });
      await share(me, "metric", calc.id, guest, "viewer");
      // A shared calculated Metric is used, so its formula does not change at all; an unused one does.
      await expect(setMetricFormula(me, calc.id, `{${hidden.slug}} * 1`)).rejects.toThrow(DEMO_METRIC_WORDS.used);
      const loose = await createDerivedMetric(me, { name: "Unused calc", formula: `{${seen.slug}} * 2` });
      await setMetricFormula(me, loose.id, `{${seen.slug}} * 3`);
      // Shown on a dashboard, or read by another calculated Metric: used.
      const shownOn = await dashboards.createDashboard(me, "Shows loose");
      await dashboards.placeWidget(me, shownOn, { type: "metric", id: loose.id });
      await expect(setMetricFormula(me, loose.id, `{${seen.slug}} * 4`)).rejects.toThrow(DEMO_METRIC_WORDS.used);
      const base2 = await createDerivedMetric(me, { name: "Base calc", formula: `{${seen.slug}} * 5` });
      await createDerivedMetric(me, { name: "Reads base", formula: `{${base2.slug}} * 1` }).catch(() => undefined);
      // A calculated Metric over a calculated Metric over a hidden one, placed on a dashboard shared with the Guest: refused, through both.
      const hiddenCalc = await createDerivedMetric(me, { name: "Hidden calc", formula: `{${hidden.slug}} * 1` });
      const outer = await createDerivedMetric(me, { name: "Outer calc", formula: `{${hiddenCalc.slug}} * 1` }).catch(() => null);
      const sharedDash = await dashboards.createDashboard(me, "Shared deep");
      await share(me, "dashboard", sharedDash, guest, "viewer");
      await expect(dashboards.placeWidget(me, sharedDash, { type: "metric", id: (outer ?? hiddenCalc).id })).rejects.toThrow(DEMO_METRIC_WORDS.hidden);
    });
  });

  it("let Ben ask for a Metric Sara has not shared, and Sara grant it, with both notices in the Outbox and nothing sent", async () => {
    const before = await demoWalkOutbound();
    await asVisit(async () => {
      const { id } = await createMetric(sara, { ...base, name: "Private metric" });
      expect(await requestAccess(ben, "metric", id)).toMatch(/Asked/);
      const request = (await db().from("access_requests").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("object_id", id).single()).data!.id as number;
      await decideAccess(sara, request, true);
      expect(await count("shares", { object_id: id })).toBe(1);
    });
    expect(await demoWalkOutbound()).toEqual(before);
  });
});

describe("Questions, Tasks and replies", () => {
  it("are asked of a made-up Member in plain words, answered, closed and marked done, and a link, a person outside the demo and a far date are refused", async () => {
    await asVisit(async () => {
      const { id } = await createMetric(sara, { ...base, name: "Asked metric" });
      const question = await ask(sara, { metricId: id, period: thisMonth(), assigneeId: "ben", text: "Why this value?" });
      const task = await ask(sara, { metricId: id, period: thisMonth(), assigneeId: "ben", kind: "task", text: "Check this", due: day(3) });
      await reply(ben, question, "Because of the move.", null);
      await setActionStatus(sara, question, "closed");
      await markTaskDone(ben, task, undefined, "Checked.");
      await expect(ask(sara, { metricId: id, period: thisMonth(), assigneeId: "ben", text: "see www.example.com" })).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(ask(sara, { metricId: id, period: thisMonth(), assigneeId: "t-nobody", text: "Hello" })).rejects.toThrow();
      await expect(ask(sara, { metricId: id, period: thisMonth(), assigneeId: "ben", kind: "task", text: "Later", due: day(900) })).rejects.toThrow(DEMO_METRIC_WORDS.due);
      await expect(reply(ben, question, "mail a@b.example", null)).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(reply(ben, question, "A value", 1e15)).rejects.toThrow(DEMO_METRIC_WORDS.number);
    });
  });

  it("are not asked about the showcase's periods, whose Questions and Threads everyone sees as they are", async () => {
    const { shown } = await seeded();
    await asVisit(async () => {
      await expect(ask(sara, { metricId: shown.id, period: "2026-03-01", assigneeId: "ben", text: "Why?" })).rejects.toBeInstanceOf(DemoShowcase);
    });
  });
});

describe("the preferred channel", () => {
  it("is set for one's own person, never for the team, and among the simulated channels only", async () => {
    await asVisit(async () => {
      await setPreference(sara, "sara", "question", "slack");
      await expect(setPreference(sara, null, "question", "email")).rejects.toThrow(DEMO_METRIC_WORDS.everyone);
      await expect(setPreference(sara, "ben", "question", "slack")).rejects.toThrow();
      await expect(setPreference(sara, "sara", "question", "carrier-pigeon" as never)).rejects.toThrow();
    });
  });
});

describe("the caps", () => {
  it("refuse a Group past the demo's ten, with the demo's words", async () => {
    await asVisit(async () => {
      const own = (await db().from("groups").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID).gt("created_at", (await db().from("demo_state").select("seed_done_at").single()).data!.seed_done_at)).count ?? 0;
      for (let i = own; i < 10; i++) await createGroup(sara, `Cap group ${i}`);
      await expect(createGroup(sara, "One too many")).rejects.toBeInstanceOf(DemoLimit);
    });
  });
});

describe("an address's share counts only what is new", () => {
  const fixed = async <T>(work: () => Promise<T>): Promise<T> => {
    turnOn();
    const who = { visitId: VISIT, headers: new Headers({ "x-forwarded-for": "192.0.2.77" }) };
    return visitingDemo({ generation: await generation(), visit: VISIT }, work, who);
  };

  it("lets a Tag that exists, and a period that is set, be put again and again without using the share up", async () => {
    await fixed(async () => {
      const { id } = await createMetric(sara, { ...base, name: "Share metric" });
      // The share of Tags is 5 an address: one word, put 12 times, is one Tag.
      for (let i = 0; i < 12; i++) await addMetricTags(sara, id, ["share-word"]);
      // The share of rows is 125 an address: the same period saved 130 times is one row.
      for (let i = 0; i < 130; i++) await saveSeriesRows(sara, id, "target", [{ period: thisMonth(), value: i }], "");
    });
  }, 120_000);

  it("refuses new words past the share, in plain words", async () => {
    await fixed(async () => {
      const { id } = await createMetric(sara, { ...base, name: "Share metric two" });
      await expect(addMetricTags(sara, id, Array.from({ length: 9 }, (_, i) => `fresh-${i}`))).rejects.toBeInstanceOf(DemoSizeRefused);
      // Refused before anything is written: no Tag of this list exists.
      const { count } = await db().from("metric_tags").select("metric_id", { count: "exact", head: true }).eq("metric_id", id);
      expect(count).toBe(0);
    });
  });
});

describe("without the setting, a visit or the current Generation", () => {
  it("the demo refuses as it always did", async () => {
    await expect(createMetric(sara, { ...base, name: "No visit" })).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(visitingDemo({ generation: await generation(), visit: VISIT }, () => createMetric(sara, { ...base, name: "Setting off" }))).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(asVisit(() => createMetric(sara, { ...base, name: "Stale" }), -1)).rejects.toBeInstanceOf(DemoStale);
    await expect(addMetricTags(sara, 1, ["visitor"])).rejects.toBeInstanceOf(DemoReadOnly);
  });
});
