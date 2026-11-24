// Open Metrics, Threads and sharing in the demo, against the database (GLOSSARY: Demo Mode, Metric, Derived Metric, Target Series,
// Projection, Tag, Group, Share, Question, Task; spec 0051, ticket 11). With the setting in effect a visit may make and change Metrics
// of its own, their Targets and Tags, ask and answer, and share and group among the demo's made-up people; the seed's own Metrics, Groups
// and Shares, the showcase, the words and the caps hold; nothing leaves the Outbox; with the setting off, without a visit, or with a
// Generation of before the last Demo Reset the demo refuses as it always did. Written for the database test run of CI; the author
// could not run it (spec 0051's tickets were built in parallel, without a database).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { DemoLimit, DemoReadOnly, DemoSeededWords, DemoShowcase, DemoStale } from "./demo";
import { DemoTextRefused } from "./demo-visitor-words";
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
const saved = { changes: process.env.ZIFFR_DEMO_CHANGES, only: process.env.ZIFFR_DEMO_ONLY };
const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
const turnOn = () => { process.env.ZIFFR_DEMO_CHANGES = "1"; process.env.ZIFFR_DEMO_ONLY = "1"; forgetStoredSettings(); };
afterEach(() => { restore("ZIFFR_DEMO_CHANGES", saved.changes); restore("ZIFFR_DEMO_ONLY", saved.only); forgetStoredSettings(); });

const generation = async () => Number((await db().from("demo_state").select("generation").single()).data?.generation);
/** Runs work as a visit of the current Generation, with the setting in effect. */
async function asVisit<T>(work: () => Promise<T>, generationOffset = 0): Promise<T> {
  turnOn();
  return visitingDemo({ generation: (await generation()) + generationOffset, visit: VISIT }, work);
}
const count = async (table: string, where: Record<string, string | number> = {}) => {
  let q = db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID);
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  return (await q).count ?? 0;
};
const base = { period: "month", format: "number", sources: ["web_form"] };
const day = (n = 0) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const thisMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); };

beforeAll(async () => {
  // A fresh demo that is open to visitors, with its showcase recorded and its seed marked done.
  await resetDemoWorkspace({ openToVisitors: true });
}, 180_000);
afterAll(async () => { await demoBackToSeed(); }, 180_000);

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
      for (let i = 2; i <= 5; i++) await createDerivedMetric(sara, { name: `Calc ${i}`, formula: `{${slug}} * ${i}` });
      await expect(createDerivedMetric(sara, { name: "Calc 6", formula: `{${slug}} * 6` })).rejects.toBeInstanceOf(DemoLimit);
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

describe("without the setting, a visit or the current Generation", () => {
  it("the demo refuses as it always did", async () => {
    await expect(createMetric(sara, { ...base, name: "No visit" })).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(visitingDemo({ generation: await generation(), visit: VISIT }, () => createMetric(sara, { ...base, name: "Setting off" }))).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(asVisit(() => createMetric(sara, { ...base, name: "Stale" }), -1)).rejects.toBeInstanceOf(DemoStale);
    await expect(addMetricTags(sara, 1, ["visitor"])).rejects.toBeInstanceOf(DemoReadOnly);
  });
});
