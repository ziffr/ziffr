// First Steps' clean slate against the real database (spec 0067, ticket 3; GLOSSARY: First Steps, Metric, Metric
// Catalog, Dashboard): what each unit and a catalog pick make, that nobody is asked and nothing is sent, that a second
// press makes nothing twice, what is refused, and the trial's Metric limit.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { createFirstStepsWorkspace } from "./first-steps";
import { FirstMetricRefused, firstStepsMetric, makeFirstMetric } from "./first-steps-metric";
import { NO_ANSWERS, OWN_UNITS } from "./first-steps-screens";
import { createWorkspace } from "./page-data";
import { openOne, openRows } from "./sealed-columns";
import { setupGuide } from "./setup-guide";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const ENV = ["ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_MAX", "ZIFFR_CLOUD_KEY"] as const;
const SOURCES = ["api", "mail", "slack", "telegram", "web_form"];
const people: string[] = [];
const others: Awaited<ReturnType<typeof workspace>>[] = [];
const catalog: number[] = [];
const owned = async (personId: string) => (await db().from("memberships").select("workspace_id").eq("user_id", personId)).data!.map((m) => m.workspace_id as string);
afterEach(async () => {
  for (const k of ENV) delete process.env[k];
  if (catalog.length) await db().from("catalog_metrics").delete().in("id", catalog.splice(0));
  for (const w of others.splice(0)) await w.cleanup();
  for (const person of people.splice(0)) {
    for (const ws of await owned(person)) {
      const gone = await db().from("workspaces").delete().eq("id", ws);
      if (gone.error) console.error(`Test cleanup: Workspace ${ws} was not deleted: ${gone.error.message}`);
    }
    await db().from("profiles").delete().eq("id", person);
  }
});

async function newcomer() {
  const id = `t-${randomUUID()}`;
  people.push(id);
  const { error } = await db().from("profiles").insert({ id, name: "New person", role: "", color: "#000", email: `${id}@example.org` });
  if (error) throw error;
  return id;
}

async function made(over: Record<string, unknown> = {}) {
  const personId = await newcomer();
  const { workspaceId } = await createFirstStepsWorkspace(personId, { ...NO_ANSWERS, who: "team", name: "Nord Co", currency: "CHF", country: "CH", timeZone: "Europe/Zurich", weekStart: 1, ...over });
  return { personId, workspaceId, role: "owner" } as Actor;
}

const metrics = async (ws: string) => {
  const { data, error } = await db().from("metrics").select("*").eq("workspace_id", ws).order("id");
  if (error) throw error;
  return (await openRows("metrics", ws, data)) as Record<string, unknown>[];
};
const count = async (table: "tokens" | "deliveries" | "prompts" | "dashboards" | "widgets", ws: string) => {
  const { count: n, error } = await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws);
  if (error) throw error;
  return n;
};
const shared = async (name: string) => (await db().from("catalog_metrics").select("id").is("workspace_id", null).eq("name", name).single()).data!.id as number;

/** A catalog entry made for one test. */
async function entry(workspaceId: string, over: Record<string, unknown> = {}) {
  const { data, error } = await db().from("catalog_metrics").insert({
    workspace_id: workspaceId, category: "Personal", name: `Entry ${randomUUID()}`, description: "", unit: "", format: "number", decimals: 0, period: "month",
    submission_rule: "overwrite", polarity: "higher", aggregation: "sum", sources: ["web_form"], ...over,
  }).select("id").single();
  if (error) throw error;
  catalog.push(data.id as number);
  return data.id as number;
}

describe("a metric of one's own", () => {
  const WANTED = {
    number: { format: "number", unit: "", decimals: 0, aggregation: "sum" },
    money: { format: "currency", unit: "CHF ", unit_position: "before", decimals: 0, aggregation: "sum" },
    percent: { format: "percent", unit: "%", unit_position: "after", decimals: 1, aggregation: "average" },
    hours: { format: "number", unit: "h", unit_position: "after", decimals: 1, aggregation: "sum" },
  };

  it.each(OWN_UNITS)("makes a %s with the spec's defaults, every Source open and no target", async (unit) => {
    const owner = await made();
    expect(await makeFirstMetric(owner, { name: "  Signed   offers ", unit, period: "week" })).toMatchObject({ made: true });
    const [m, ...more] = await metrics(owner.workspaceId);
    expect(more).toEqual([]);
    expect(m).toMatchObject({ ...WANTED[unit], name: "Signed offers", owner_id: owner.personId, period: "week", polarity: "higher", submission_rule: "overwrite", target_min: null, target_max: null, workflow_id: null, from_catalog_id: null });
    expect([...(m.sources as string[])].sort()).toEqual(SOURCES);
  });

  it("puts it on a dashboard named after the Workspace, keeps it as the first Metric, and asks nobody", async () => {
    const owner = await made();
    const { metricId } = await makeFirstMetric(owner, { name: "Visitors", unit: "number", period: "day" });
    const ws = owner.workspaceId;
    const { data: dashboards } = await db().from("dashboards").select("id, name, owner_id").eq("workspace_id", ws);
    expect(dashboards).toEqual([{ id: expect.any(Number), name: "Nord Co", owner_id: owner.personId }]);
    const { data: widgets } = await db().from("widgets").select("dashboard_id, metric_ids").eq("workspace_id", ws);
    expect(widgets).toEqual([{ dashboard_id: dashboards![0].id, metric_ids: [metricId] }]);
    expect((await setupGuide(owner))!.firstMetric).toEqual({ id: metricId, name: "Visitors" });
    expect(await firstStepsMetric(owner)).toEqual({ id: metricId, name: "Visitors" });
    expect([await count("tokens", ws), await count("deliveries", ws), await count("prompts", ws)]).toEqual([0, 0, 0]);
  });
});

describe("a pick from the catalog", () => {
  it("takes the entry without its target, opens every Source and asks nobody", async () => {
    const owner = await made({ who: "me" });
    const id = await shared("Body weight");
    await makeFirstMetric(owner, { catalogId: id });
    const [m] = await metrics(owner.workspaceId);
    expect(m).toMatchObject({ name: "Body weight", unit: "kg", decimals: 1, period: "day", from_catalog_id: id, target_min: null, target_max: null });
    expect([...(m.sources as string[])].sort()).toEqual(SOURCES);
    expect([await count("tokens", owner.workspaceId), await count("deliveries", owner.workspaceId), await count("dashboards", owner.workspaceId)]).toEqual([0, 0, 1]);
  });

  it("keeps money in the Workspace's currency", async () => {
    const owner = await made({ who: "me" });
    await makeFirstMetric(owner, { catalogId: await shared("Money saved") });
    expect((await metrics(owner.workspaceId))[0]).toMatchObject({ format: "currency", unit: "CHF ", unit_position: "before", aggregation: "sum" });
  });

  it("refuses a calculated entry, another Workspace's entry and one that does not exist, and makes nothing", async () => {
    const owner = await made();
    const other = await workspace();
    others.push(other);
    const refused = [
      await entry(owner.workspaceId, { formula: "a + 1" }),
      await entry(owner.workspaceId, { total: { targets: "own", of: "a" } }),
      await entry(other.id),
      2_000_000_000,
    ];
    for (const catalogId of refused) await expect(makeFirstMetric(owner, { catalogId })).rejects.toBeInstanceOf(FirstMetricRefused);
    expect(await metrics(owner.workspaceId)).toEqual([]);
    expect(await count("dashboards", owner.workspaceId)).toBe(0);
    // A refusal leaves nothing held: the next press works at once. The Workspace's own plain entry is there to pick.
    expect(await makeFirstMetric(owner, { catalogId: await entry(owner.workspaceId) })).toMatchObject({ made: true });
  });
});

describe("pressing twice", () => {
  it("makes nothing twice, whatever is picked the second time", async () => {
    const owner = await made();
    const first = await makeFirstMetric(owner, { name: "Visitors", unit: "number", period: "day" });
    expect(await makeFirstMetric(owner, { name: "Orders", unit: "number", period: "day" })).toEqual({ metricId: first.metricId, made: false });
    expect(await metrics(owner.workspaceId)).toHaveLength(1);
    expect(await count("dashboards", owner.workspaceId)).toBe(1);
    expect(await count("widgets", owner.workspaceId)).toBe(1);
  });

  it("makes one Metric and one dashboard for two presses at once", async () => {
    const owner = await made();
    const press = () => makeFirstMetric(owner, { name: "Visitors", unit: "number", period: "day" });
    const outcomes = await Promise.allSettled([press(), press(), press()]);
    expect(outcomes.filter((o) => o.status === "fulfilled" && o.value.made)).toHaveLength(1);
    for (const o of outcomes) if (o.status === "rejected") expect(o.reason).toBeInstanceOf(FirstMetricRefused);
    expect(await metrics(owner.workspaceId)).toHaveLength(1);
    expect(await count("dashboards", owner.workspaceId)).toBe(1);
  });

  it("finishes what a press left half done instead of starting again", async () => {
    const owner = await made();
    const first = await makeFirstMetric(owner, { name: "Visitors", unit: "number", period: "day" });
    // As if the server had stopped after the Metric: no dashboard, not kept as the first one.
    await db().from("dashboards").delete().eq("workspace_id", owner.workspaceId);
    await db().from("setup_guides").update({ first_metric_id: null }).eq("workspace_id", owner.workspaceId);
    expect(await makeFirstMetric(owner, { name: "Orders", unit: "number", period: "day" })).toEqual({ metricId: first.metricId, made: false });
    expect(await metrics(owner.workspaceId)).toHaveLength(1);
    expect(await count("widgets", owner.workspaceId)).toBe(1);
    expect(await firstStepsMetric(owner)).toMatchObject({ id: first.metricId });
  });

  it("makes another once the first is archived", async () => {
    const owner = await made();
    const first = await makeFirstMetric(owner, { name: "Visitors", unit: "number", period: "day" });
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", first.metricId);
    expect(await firstStepsMetric(owner)).toBeNull();
    const second = await makeFirstMetric(owner, { name: "Orders", unit: "number", period: "day" });
    expect(second).toMatchObject({ made: true });
    expect(second.metricId).not.toBe(first.metricId);
    const m = await openOne("metrics", owner.workspaceId, (await db().from("metrics").select("id, name").eq("id", second.metricId).single()).data);
    expect(m!.name).toBe("Orders");
  });
});

describe("limits and who may", () => {
  it("takes over a mark that a stopped press left, and waits out a fresh one", async () => {
    const owner = await made();
    const mark = (at: Date) => db().from("setup_guides").update({ starting_point: "scratch", updated_at: at.toISOString() }).eq("workspace_id", owner.workspaceId);
    const press = () => makeFirstMetric(owner, { name: "Visitors", unit: "number", period: "day" });
    await mark(new Date());
    await expect(press()).rejects.toBeInstanceOf(FirstMetricRefused);
    await mark(new Date(Date.now() - 3_600_000));
    expect(await press()).toMatchObject({ made: true });
  });

  it("holds a trial to its Metric limit, in the trial's words", async () => {
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    process.env.ZIFFR_TRIAL_DAYS = "7";
    process.env.ZIFFR_TRIAL_MAX = "100000";
    const owner = await made();
    // Archived Metrics count against the trial's limit and are no first Metric.
    let full = false;
    for (let i = 0; i < 200 && !full; i++) {
      const { error } = await db().from("metrics").insert({ workspace_id: owner.workspaceId, owner_id: owner.personId, slug: `a-${i}`, name: "Old", unit: "", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", sources: ["web_form"], archived_at: new Date().toISOString() });
      if (error) expect(error.code).toBe("ZF430");
      full = Boolean(error);
    }
    expect(full).toBe(true);
    await expect(makeFirstMetric(owner, { name: "One too many", unit: "number", period: "day" })).rejects.toThrow(/Metrics/);
    expect(await firstStepsMetric(owner)).toBeNull();
    expect(await count("dashboards", owner.workspaceId)).toBe(0);
  });

  it("refuses Admins, Members, Guests, Access Keys, outsiders, the demo and a Workspace First Steps did not make", async () => {
    const owner = await made();
    const refused: Actor[] = [];
    for (const role of ["admin", "member", "guest"] as const) {
      const personId = await newcomer();
      await db().from("memberships").insert({ workspace_id: owner.workspaceId, user_id: personId, role });
      refused.push({ personId, workspaceId: owner.workspaceId, role }, { personId, workspaceId: owner.workspaceId, role: "owner" });
    }
    refused.push({ ...owner, key: { id: 1, scopes: ["metrics:write"] } } as unknown as Actor);
    refused.push({ personId: await newcomer(), workspaceId: owner.workspaceId, role: "owner" });
    refused.push({ personId: owner.personId, workspaceId: DEMO_WORKSPACE_ID, role: "owner" });
    const person = await newcomer();
    refused.push({ personId: person, workspaceId: await createWorkspace(person, "Made elsewhere"), role: "owner" });
    for (const actor of refused) await expect(makeFirstMetric(actor, { name: "Mine", unit: "number", period: "day" })).rejects.toBeInstanceOf(Forbidden);
    expect(await metrics(owner.workspaceId)).toEqual([]);
    await db().from("memberships").delete().eq("workspace_id", owner.workspaceId).neq("user_id", owner.personId);
  });
});
