// Every SDK call against the running app and its database (spec 0002, ticket #51): paging, ranges, submissions with
// idempotency keys, errors, and waiting out a 429.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { addFeedToMetric, createFeed, createFeedKey } from "@ziffr/core/feeds";
import type { Scope } from "@ziffr/core/actor";
import { db } from "@ziffr/core/db";
import { JANUARY, periodStart } from "@ziffr/core/periods";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { Ziffr, ZiffrError } from "../src/index";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const collect = async <T>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out; };

async function setup(scopes: Scope[] = ["metrics:read", "values:submit"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member");
  const orders = await w.metric(ben, { name: "Orders", submission_rule: "add" }); await w.token(orders.id, ben);
  const extra = await w.metric(ben, { name: "Visits" });
  await db().from("observations").insert(["2026-01-01", "2026-02-01", "2026-03-01"].map((p, i) => ({ metric_id: extra.id, period_start: p, value: i + 1, source: "api", workspace_id: w.id })));
  const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "SDK test", scopes, expiresOn: inDays(30) });
  return { w, ben, orders, extra, keyId: id, secret, ziffr: new Ziffr({ url: URL, accessKey: secret }) };
}

describe("@ziffr/sdk against the app", () => {
  it("reads Metrics, values, people, Groups and the year start", async () => {
    const { ben, orders, extra, ziffr } = await setup();
    expect((await ziffr.metrics.list({ limit: 1 })).next).toEqual(expect.any(String));
    expect((await collect(ziffr.metrics.all())).map((m) => m.slug)).toEqual([orders.slug, extra.slug]);
    expect(await ziffr.metrics.get(extra.slug)).toMatchObject({ slug: extra.slug, name: "Visits", derived: false });
    expect((await ziffr.observations.list(extra.slug, { from: "2026-02-01" })).items.map((o) => o.value)).toEqual([2, 3]);
    expect((await collect(ziffr.observations.all(extra.slug, { to: "2026-02-01" }))).map((o) => o.period)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(await ziffr.thread(extra.slug, "2026-02-01")).toEqual({ metric: extra.slug, period: "2026-02-01", threads: [] });
    expect(await collect(ziffr.people.all())).toEqual([{ id: ben, name: expect.any(String), contact: false }]);
    expect((await ziffr.groups.list()).items).toEqual([expect.objectContaining({ everyone: true })]);
    // Words into a Metric and a period: "visits february 2026" is Visits' February.
    expect((await ziffr.find("visits february 2026"))[0]).toEqual({ slug: extra.slug, name: "Visits", archived: false, period: "2026-02-01", period_label: "February 2026" });
    expect(await ziffr.find("nothing like this")).toEqual([]);
    // Where the workspace's quarters and years start: January unless an Owner set another month.
    expect(await ziffr.workspace()).toEqual({ year_start_month: 1, number_style: "1,234.5", time_zone: "UTC", run_hour: 8, week_start: "monday", reached_by: ["email"] });
    // What the key's creator has to do: nothing yet in a workspace made a moment ago.
    expect(await ziffr.schedule()).toMatchObject({ today: expect.any(String), overdue: [], days: [], undated: [] });
  });
  it("submits with an idempotency key by default, and replays one given twice", async () => {
    const { orders, ziffr } = await setup();
    expect(await ziffr.observations.submit(orders.slug, { value: 5 })).toMatchObject({ status: "recorded", value: 5, period: periodStart(new Date(), "month", JANUARY), replayed: false });
    // A fresh key each call: the Submission Rule adds the second.
    expect((await ziffr.observations.submit(orders.slug, { value: 2 })).value).toBe(7);
    const first = await ziffr.observations.submit(orders.slug, { value: 1, breakdown: [{ label: "Shop", value: 1 }] }, { idempotencyKey: "nightly-1" });
    const again = await ziffr.observations.submit(orders.slug, { value: 1, breakdown: [{ label: "Shop", value: 1 }] }, { idempotencyKey: "nightly-1" });
    expect(first).toMatchObject({ value: 8, replayed: false });
    expect(again).toMatchObject({ value: 8, replayed: true });
  });
  it("creates a Metric, replays a given idempotency key, and submits its first value", async () => {
    const { ziffr } = await setup(["metrics:read", "values:submit", "metrics:write"]);
    const created = await ziffr.metrics.create({ name: "Weekly signups", period: "week", unit: "signups", submit: true }, { idempotencyKey: "setup-1" });
    expect(created).toMatchObject({ slug: "weekly-signups", period: "week", unit: "signups", replayed: false });
    expect(await ziffr.metrics.create({ name: "Weekly signups", period: "week", unit: "signups", submit: true }, { idempotencyKey: "setup-1" })).toMatchObject({ slug: "weekly-signups", replayed: true });
    expect(await ziffr.observations.submit(created.slug, { value: 12 })).toMatchObject({ status: "recorded", value: 12 });
    await expect((await setup()).ziffr.metrics.create({ name: "X" })).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
  it("builds dashboards, writes one up with Findings, and lists templates (spec 0014, spec 0013)", async () => {
    const { orders, extra, ziffr } = await setup(["metrics:read", "dashboards:read", "dashboards:write"]);
    expect((await ziffr.templates.all({ kind: "dashboard" })).map((t) => t.id)).toEqual(["overview", "deep-dive", "side-by-side", "scorecard", "trends", "target-tracker", "check-in", "board-pack"]);
    const d = await ziffr.dashboards.fromTemplate({ template: "side-by-side", fills: [[orders.slug], [extra.slug]] }, { idempotencyKey: "pair-1" });
    expect(d).toMatchObject({ name: "Two metrics side by side", replayed: false });
    expect(await ziffr.dashboards.fromTemplate({ template: "side-by-side", fills: [[orders.slug], [extra.slug]] }, { idempotencyKey: "pair-1" })).toMatchObject({ id: d.id, replayed: true });
    const w = await ziffr.dashboards.addWidget(d.id, { view: "table", metrics: [extra.slug] });
    expect(await ziffr.dashboards.updateWidget(d.id, w.id, { title: "Visits" })).toMatchObject({ id: w.id, title: "Visits" });
    expect(await ziffr.dashboards.removeWidget(d.id, w.id)).toEqual({ removed: w.id });
    expect((await collect(ziffr.dashboards.all())).map((x) => x.id)).toEqual([d.id]);
    const s = await ziffr.dashboards.create({ name: "Draft", intro: "Words first." });
    expect(s.intro).toBe("Words first.");
    const f = await ziffr.dashboards.addFinding(s.id, { metric: orders.slug, headline: "{metric} grew" });
    expect((await ziffr.dashboards.updateFinding(s.id, f.id, { kicker: "March" })).words).toMatchObject({ kicker: "March", headline: "{metric} grew" });
    expect(await ziffr.dashboards.update(s.id, { intro: "First draft." })).toMatchObject({ intro: "First draft." });
  });
  it("makes, lists, changes and removes the creator's own Alerts (spec 0032)", async () => {
    const { orders, ziffr } = await setup(["metrics:read", "alerts:write"]);
    const a = await ziffr.alerts.create({ metric: orders.slug, condition: { kind: "below", value: 5 }, delivery: "email" });
    expect(a).toMatchObject({ metric: { slug: orders.slug }, condition: { kind: "below", value: "5" }, delivery: "email", state: "armed" });
    expect(await ziffr.alerts.list({ metric: orders.slug })).toEqual([a]);
    expect(await ziffr.alerts.update(a.id, { paused: true })).toMatchObject({ id: a.id, paused_by_person: true });
    expect(await ziffr.alerts.remove(a.id)).toEqual({ removed: a.id });
    await expect(ziffr.alerts.create({ metric: "nothing-here", condition: { kind: "below", value: 5 } })).rejects.toMatchObject({ status: 404 });
    await expect((await setup(["metrics:read"])).ziffr.alerts.create({ metric: orders.slug, condition: { kind: "below", value: 5 } })).rejects.toMatchObject({ status: 403 });
  });
  it("lists, answers and closes the creator's own Questions and Tasks, and refuses an Approval without its scope (ticket #427)", async () => {
    const { w, ben, orders, ziffr } = await setup(["actions:read", "actions:write"]);
    const sara = await w.person("owner");
    const task = await w.action({ metric_id: orders.id, period_start: "2026-03-01", asker_id: sara, assignee_id: ben, kind: "task", question: "Send the report" });
    expect((await ziffr.actions.list({ role: "assignee" })).items).toEqual([expect.objectContaining({ id: task, kind: "task", assigned_to_me: true })]);
    expect((await collect(ziffr.actions.all())).map((a) => a.id)).toEqual([task]);
    expect(await ziffr.actions.reply(task, "On it")).toMatchObject({ id: task, status: "answered" });
    await expect(ziffr.actions.close(task)).rejects.toMatchObject({ status: 422 });
    await expect(ziffr.actions.approve(task)).rejects.toMatchObject({ status: 403 });
  });
  it("throws a ZiffrError with the API's code", async () => {
    const { extra, ziffr } = await setup(["metrics:read"]);
    await expect(ziffr.metrics.get("no-such-metric")).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(ziffr.observations.submit(extra.slug, { value: 1 })).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(new Ziffr({ url: URL, accessKey: "zk_wrong" }).metrics.list()).rejects.toEqual(expect.any(ZiffrError));
  });
  it("waits out a 429 as Retry-After says, or gives up when the wait is too long", async () => {
    // Nothing here depends on how long a step takes (#126: the test used to leave the minute's window two seconds
    // after filling it, and failed whenever setting up took longer). Both keys have made their 60 calls just now, so
    // the window stays full for a minute, far longer than the test runs.
    const patient = await setup();
    const impatient = await setup();
    for (const keyId of [patient.keyId, impatient.keyId]) {
      await db().from("access_log").insert(Array.from({ length: 60 }, () => ({ key_id: keyId, method: "GET", route: "/api/v1/metrics", status: 200 })));
    }
    // The server asks for most of a minute, more than this client waits: it gives up at once.
    const gaveUp = await new Ziffr({ url: URL, accessKey: impatient.secret, maxRetryWait: 5 }).metrics.list().catch((e: unknown) => e);
    expect(gaveUp).toMatchObject({ status: 429, code: "rate_limited" });
    expect((gaveUp as ZiffrError).retryAfter).toBeGreaterThan(5);
    // The server's own 429, with its Retry-After shortened to one second so the test does not wait a minute; the
    // calls are cleared meanwhile, as the window passing would. The client must wait that second, then call again.
    const calls: { status: number; retryAfter: string | null; at: number }[] = [];
    const shortened: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      calls.push({ status: res.status, retryAfter: res.headers.get("retry-after"), at: performance.now() });
      if (res.status !== 429) return res;
      await db().from("access_log").delete().eq("key_id", patient.keyId);
      const headers = new Headers(res.headers);
      headers.set("retry-after", "1");
      return new Response(await res.text(), { status: 429, headers });
    };
    const waited = new Ziffr({ url: URL, accessKey: patient.secret, fetch: shortened });
    expect((await waited.metrics.list()).items).toHaveLength(2);
    expect(calls.map((c) => c.status)).toEqual([429, 200]);
    expect(Number(calls[0].retryAfter)).toBeGreaterThan(5);
    // A timer never fires early, so the second call starts at least the second after the 429 was read.
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(1000);
  });
  it("reads a Feed's Metrics and records a batch with a Feed Key (spec 0012)", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Pipeline" });
    const { id: feedId } = await createFeed(w.actor(sara), "CRM");
    await addFeedToMetric(w.actor(sara), m.id, feedId);
    const { secret } = await createFeedKey(w.actor(sara), feedId, { name: "SDK", expiresOn: inDays(30) });
    const ziffr = new Ziffr({ url: URL, accessKey: secret });
    expect((await ziffr.feed.get()).name).toBe("CRM");
    expect((await collect(ziffr.feed.metrics())).map((x) => [x.slug, x.filled])).toEqual([[m.slug, []]]);
    const first = await ziffr.feed.submit([{ metric: m.slug, value: 3, period: "2026-01-01" }, { metric: m.slug, value: 4 }], { idempotencyKey: "crm-1" });
    expect(first.results.map((r) => [r.status, r.imported])).toEqual([["recorded", true], ["recorded", false]]);
    expect((await ziffr.feed.submit([{ metric: m.slug, value: 3, period: "2026-01-01" }, { metric: m.slug, value: 4 }], { idempotencyKey: "crm-1" })).replayed).toBe(true);
    expect((await collect(ziffr.feed.metrics()))[0].filled).toEqual(["2026-01-01", periodStart(new Date(), "month", JANUARY)]);
    // A Feed Key reads nothing else.
    await expect(ziffr.metrics.list()).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});
