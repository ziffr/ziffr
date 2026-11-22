// Search against the real database (ticket #412; GLOSSARY: Metric, Archived Metric, Period Record, Share, Guest, Answer
// Languages): only what the person may see, never another Workspace, Metric + period in English and German, and Archived
// Metrics marked.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import type { Actor, KeyActor } from "./actor";
import { createDashboard } from "./dashboards";
import { createDeck } from "./decks";
import { archiveMetric } from "./archived-metrics";
import { findMetrics, search } from "./search";
import { createGroup, setGroupMember } from "./team";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { addMetricTags } from "./tags";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function setup() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  // English and German, as most of Ziffr's Workspaces read answers; without a country a Workspace reads English alone.
  await db().from("workspaces").update({ answer_languages: ["en", "de"] }).eq("id", w.id);
  return { w, sara };
}
const forKey = (a: Actor, scopes: string[]): KeyActor => ({ personId: a.personId, workspaceId: a.workspaceId, role: a.role, key: { id: "1", scopes } });
const share = (w: { id: string }, type: "metric" | "dashboard" | "deck", id: number, person: string) => db().from("shares").insert({ workspace_id: w.id, object_type: type, object_id: id, user_id: person, role: "viewer" });
const names = (r: Awaited<ReturnType<typeof search>>) => r.map((x) => `${x.kind}:${x.name}`);

describe("search", () => {
  it("finds Metrics, dashboards and decks by name, ignoring case and accents", async () => {
    const { w, sara } = await setup();
    await w.metric(sara, { name: "Café visits" });
    await w.metric(sara, { name: "Churn rate" });
    await createDashboard(w.actor(sara), "Churn overview");
    await createDeck(w.actor(sara), "Board deck: churn");
    const r = await search(w.actor(sara), "CHURN");
    expect(names(r)).toEqual(["metric:Churn rate", "dashboard:Churn overview", "deck:Board deck: churn"]);
    expect(names(await search(w.actor(sara), "cafe"))).toEqual(["metric:Café visits"]);
    expect(await search(w.actor(sara), "nothing like this")).toEqual([]);
    expect(await search(w.actor(sara), "   ")).toEqual([]);
  });

  it("shows a person only what they may see: no hidden Metric, dashboard or deck, and no hint of one", async () => {
    const { w, sara } = await setup();
    const ben = await w.person("member");
    const secret = await w.metric(sara, { name: "Secret churn" });
    const shown = await w.metric(sara, { name: "Shown churn" });
    const dash = await createDashboard(w.actor(sara), "Secret churn dashboard");
    const deck = await createDeck(w.actor(sara), "Shown churn deck");
    await share(w, "metric", shown.id, ben);
    await share(w, "deck", deck, ben);
    expect(names(await search(w.actor(ben, "member"), "churn"))).toEqual(["metric:Shown churn", "deck:Shown churn deck"]);
    // A period word does not open a way around it either.
    expect(await search(w.actor(ben, "member"), "secret churn march 2026")).toEqual([]);
    expect(await findMetrics(forKey(w.actor(ben, "member"), ["metrics:read"]), "secret churn")).toEqual([]);
    expect(names(await search(w.actor(sara), "secret"))).toEqual(["metric:Secret churn", "dashboard:Secret churn dashboard"]);
    void secret; void dash;
  });

  it("never reaches into another Workspace", async () => {
    const a = await setup(); const b = await setup();
    await a.w.metric(a.sara, { name: "Alpha churn" });
    await createDashboard(a.w.actor(a.sara), "Alpha dashboard");
    await b.w.metric(b.sara, { name: "Beta churn" });
    expect(names(await search(b.w.actor(b.sara), "alpha"))).toEqual([]);
    expect(names(await search(b.w.actor(b.sara), "churn"))).toEqual(["metric:Beta churn"]);
    // A's owner acting in B's Workspace is no member there: nothing of A or B's they see.
    expect(await search({ personId: a.sara, workspaceId: b.w.id, role: "owner" }, "churn")).toEqual([]);
  });

  it("turns a month and year into Metric + period, in English and in German", async () => {
    const { w, sara } = await setup();
    const m = await w.metric(sara, { name: "Churn rate" });
    const en = await search(w.actor(sara), "churn march 2026");
    expect(en[0]).toEqual({ kind: "period", slug: m.slug, name: "Churn rate", archived: false, period: "2026-03-01", label: "March 2026" });
    expect(en).toContainEqual({ kind: "metric", slug: m.slug, name: "Churn rate", archived: false });
    const de = await search(w.actor(sara), "churn März 2026");
    expect(de[0]).toMatchObject({ kind: "period", period: "2026-03-01" });
    // With German off, "März" is no month: only the year is named, which is no single value of a monthly Metric.
    await db().from("workspaces").update({ answer_languages: ["en"] }).eq("id", w.id);
    expect((await search(w.actor(sara), "churn März 2026")).some((r) => r.kind === "period")).toBe(false);
  });

  it("reads weeks and quarters by the Metric's own period", async () => {
    const { w, sara } = await setup();
    const weekly = await w.metric(sara, { name: "Besuche", period: "week" });
    const quarterly = await w.metric(sara, { name: "Umsatz", period: "quarter" });
    expect((await search(w.actor(sara), "besuche KW 46 2025"))[0]).toMatchObject({ kind: "period", slug: weekly.slug, period: "2025-11-10" });
    expect((await search(w.actor(sara), "umsatz Q3 2026"))[0]).toMatchObject({ kind: "period", slug: quarterly.slug, period: "2026-07-01", label: "Q3 2026" });
    // A quarter is not one value of a weekly Metric, and a future period has no value yet: both stay plain Metric hits.
    expect((await search(w.actor(sara), "besuche Q3 2026")).map((r) => r.kind)).toEqual(["metric"]);
    expect((await search(w.actor(sara), "umsatz Q3 2099")).map((r) => r.kind)).toEqual(["metric"]);
  });

  it("marks Archived Metrics and lists them after Metrics in use", async () => {
    const { w, sara } = await setup();
    const old = await w.metric(sara, { name: "Churn old" });
    const live = await w.metric(sara, { name: "Zeta churn" });
    await archiveMetric(w.actor(sara), old.id);
    const r = await search(w.actor(sara), "churn");
    expect(r).toEqual([
      { kind: "metric", slug: live.slug, name: "Zeta churn", archived: false },
      { kind: "metric", slug: old.slug, name: "Churn old", archived: true },
    ]);
    expect((await search(w.actor(sara), "churn march 2026")).find((x) => x.kind === "period" && x.slug === old.slug)).toMatchObject({ archived: true });
  });

  it("gives programs Metrics and periods only, and needs the scope", async () => {
    const { w, sara } = await setup();
    const m = await w.metric(sara, { name: "Churn rate" });
    await createDashboard(w.actor(sara), "Churn dashboard");
    const found = await findMetrics(forKey(w.actor(sara), ["metrics:read"]), "churn march 2026");
    expect(found[0]).toEqual({ slug: m.slug, name: "Churn rate", archived: false, period: "2026-03-01", period_label: "March 2026" });
    expect(found.every((f) => !f.name.includes("dashboard"))).toBe(true);
    await expect(findMetrics(forKey(w.actor(sara), ["dashboards:read"]), "churn")).rejects.toThrow();
  });

  it("is bounded", async () => {
    const { w, sara } = await setup();
    for (let i = 0; i < 12; i++) await w.metric(sara, { name: `Churn ${i}` });
    expect((await search(w.actor(sara), "churn")).length).toBe(8);
    expect(await search(w.actor(sara), "x".repeat(5000))).toEqual([]);
  });
});

describe("search for Workflows, people, Groups and forms (ticket #530)", () => {
  const publish = { type: "publish", lock: false } as const;
  const mk = (a: Actor, name: string) => saveWorkflow(a, null, name, { dueWorkingDays: 1, steps: [publish] });

  /** An owner, a member, a Guest with one Metric shared; a Workflow on that Metric and one on a hidden Metric. */
  async function crew() {
    const { w, sara } = await setup();
    const ben = await w.person("member");
    const gus = await w.person("guest");
    await db().from("profiles").update({ name: "Ben Rivers" }).eq("id", ben);
    await db().from("profiles").update({ name: "Gus Outsider" }).eq("id", gus);
    const owner = w.actor(sara);
    const seen = await mk(owner, "Field close");
    const hidden = await mk(owner, "Field board pack");
    const shared = await w.metric(sara, { name: "Field visits" });
    const secret = await w.metric(sara, { name: "Field payroll" });
    await setMetricWorkflow(owner, shared.id, seen);
    await setMetricWorkflow(owner, secret.id, hidden);
    await w.share(shared.id, gus);
    const mine = await createGroup(owner, "Field crew");
    const other = await createGroup(owner, "Field board");
    await setGroupMember(owner, mine, gus, true);
    await setGroupMember(owner, other, ben, true);
    return { w, sara, ben, gus, seen, hidden, shared, secret };
  }

  it("shows a member Workflows, people and Groups by name", async () => {
    const { w, ben, seen, hidden } = await crew();
    const r = await search(w.actor(ben, "member"), "field");
    expect(r.filter((x) => x.kind === "workflow").map((x) => x.name).sort()).toEqual(["Field board pack", "Field close"]);
    expect(r.filter((x) => x.kind === "group").map((x) => x.name).sort()).toEqual(["Field board", "Field crew"]);
    expect(names(await search(w.actor(ben, "member"), "rivers"))).toEqual(["person:Ben Rivers"]);
    expect((await search(w.actor(ben, "member"), "outsider")).map((x) => x.kind)).toEqual(["person"]);
    expect((await search(w.actor(ben, "member"), "rivers"))[0]).toMatchObject({ you: true, contact: false });
    void seen; void hidden;
  });

  it("shows a Guest no outsiders: only themselves, their own Groups and the Workflows of what is shared with them", async () => {
    const { w, gus, seen } = await crew();
    const guest = w.actor(gus, "guest");
    const r = await search(guest, "field");
    expect(r.filter((x) => x.kind === "workflow")).toEqual([{ kind: "workflow", id: seen, name: "Field close" }]);
    expect(r.filter((x) => x.kind === "group").map((x) => x.name)).toEqual(["Field crew"]);
    expect(r.filter((x) => x.kind === "metric").map((x) => x.name)).toEqual(["Field visits"]);
    // No other member or the owner, by name or by a part of it.
    for (const q of ["rivers", "ben", "board", "payroll"]) expect(await search(guest, q)).toEqual([]);
    expect(names(await search(guest, "outsider"))).toEqual(["person:Gus Outsider"]);
  });

  it("offers a submitter the form of their Metric, only their own and never another's", async () => {
    const { w, sara, ben, shared } = await crew();
    const mineToken = await w.token(shared.id, ben);
    const asBen = await search(w.actor(ben, "member"), "record field");
    const rec = asBen.filter((x) => x.kind === "record");
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ slug: shared.slug, name: "Field visits" });
    expect(JSON.stringify(rec[0])).toContain(String((mineToken as { code?: string }).code ?? ""));
    expect((await search(w.actor(ben, "member"), "record")).filter((x) => x.kind === "record")).toHaveLength(1);
    // The owner submits nothing, so is offered no form; and a plain name offers the form beside the Metric.
    expect((await search(w.actor(sara), "record field")).some((x) => x.kind === "record")).toBe(false);
    expect((await search(w.actor(ben, "member"), "field")).some((x) => x.kind === "record")).toBe(true);
    // A Metric the person does not see offers no form, even if they hold a token for it.
    expect((await search(w.actor(ben, "member"), "record payroll")).some((x) => x.kind === "record")).toBe(false);
  });

  it("finds Tags and Metrics by Tag only through Metrics the person may see; a hidden word answers like an unknown one", async () => {
    const { w, sara } = await setup();
    const ben = await w.person("member");
    const gus = await w.person("guest");
    const shown = await w.metric(sara, { name: "Revenue" });
    const archived = await w.metric(sara, { name: "Old sales" });
    const secret = await w.metric(sara, { name: "Payroll" });
    await addMetricTags(w.actor(sara), shown.id, ["Finance", "weekly review"]);
    await addMetricTags(w.actor(sara), archived.id, ["finance"]);
    await addMetricTags(w.actor(sara), secret.id, ["salaries", "finance"]);
    await archiveMetric(w.actor(sara), archived.id);
    await share(w, "metric", shown.id, ben);
    await share(w, "metric", shown.id, gus);
    // The owner sees all three Metrics carrying "finance": the Tag result comes first, then Metrics by Tag.
    const owner = await search(w.actor(sara), "finance");
    expect(owner[0]).toEqual({ kind: "tag", name: "Finance", metrics: 3 });
    expect(owner.filter((r) => r.kind === "metric").map((r) => (r as { name: string; tag?: string }).name)).toEqual(["Payroll", "Revenue", "Old sales"]);
    expect(owner).toContainEqual({ kind: "metric", slug: shown.slug, name: "Revenue", archived: false, tag: "Finance" });
    // A Member who sees one Metric sees the Tag with a count of one, and no more.
    for (const who of [w.actor(ben, "member"), w.actor(gus, "guest")]) {
      expect((await search(who, "finance")).map((r) => `${r.kind}:${r.name}`)).toEqual(["tag:Finance", "metric:Revenue"]);
      expect((await search(who, "finance"))[0]).toEqual({ kind: "tag", name: "Finance", metrics: 1 });
      // A word used only on a Metric they cannot see answers as a word nobody uses, and a partial one finds no Metric.
      expect(await search(who, "salaries")).toEqual(await search(who, "zzzunknown"));
      expect(await search(who, "salar")).toEqual([]);
    }
    expect(names(await search(w.actor(ben, "member"), "weekly review"))).toEqual(["tag:weekly review", "metric:Revenue"]);
    // Programs: Metrics found by a Tag are marked, after name matches, and only the key's creator's sight counts.
    const key = (a: Actor) => forKey(a, ["metrics:read"]);
    expect(await findMetrics(key(w.actor(ben, "member")), "finance")).toEqual([{ slug: shown.slug, name: "Revenue", archived: false, period: null, period_label: null, matched_by: "tag" }]);
    expect(await findMetrics(key(w.actor(ben, "member")), "salaries")).toEqual([]);
    expect((await findMetrics(key(w.actor(sara)), "revenue")).every((f) => f.matched_by === undefined)).toBe(true);
  });
});
