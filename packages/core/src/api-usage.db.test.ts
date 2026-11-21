// A Workspace's own Usage figures for a program's key (ticket #370, spec 0031; GLOSSARY: Usage, Access Key): only a
// program's key with the scope, only for an Owner or Admin, only this Workspace's counts, the small-number rule, and
// that nothing but whole numbers and the listed keys comes back.
import { afterEach, describe, expect, it } from "vitest";
import { actorForSecret, createAccessKey } from "./access-keys";
import { Forbidden, type KeyActor, type Scope } from "./actor";
import { USAGE_MIN_PEOPLE, UsageLimit, UsageRangeError, WORKSPACE_EVENT_FIGURES, WORKSPACE_SOURCE_FIGURES, WORKSPACE_STATE_FIGURES, WORKSPACE_USAGE_CALLS_PER_HOUR, workspaceUsageFigures } from "./api-usage";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const dayAgo = (n: number) => daysAgo(n).slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A Workspace with `people` people (the first an Owner, then an Admin, then Members), counted since `counted` days ago. */
async function setup(people = 3, counted = 120) {
  const w = await workspace("Secret Name Ltd"); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const admin = people > 1 ? await w.person("admin") : null;
  for (let i = 2; i < people; i++) await w.person("member");
  await db().from("workspaces").update({ usage_since: dayAgo(counted) }).eq("id", w.id);
  // The people joined long ago, unless a test says otherwise.
  await db().from("memberships").update({ created_at: daysAgo(300) }).eq("workspace_id", w.id);
  const keyFor = async (person: string, role: "owner" | "admin", scopes: Scope[] = ["usage:read"]) =>
    (await actorForSecret((await createAccessKey(w.actor(person, role), { name: "Program", scopes, expiresOn: inDays(30) })).secret)) as KeyActor;
  const value = async (metricId: number, source: string, ago: number, extra: Record<string, unknown> = {}) =>
    db().from("observations").insert({ metric_id: metricId, period_start: `${dayAgo(ago).slice(0, 8)}01`, value: 1, source, workspace_id: w.id, created_at: daysAgo(ago), ...extra });
  const view = async (kind: string, id: number, ago: number, n_app = 1, n_link = 0) =>
    db().from("view_counts").insert({ workspace_id: w.id, day: dayAgo(ago), subject_kind: kind, subject_id: id, n_app, n_link });
  return { w, sara, admin, keyFor, value, view };
}

describe("workspaceUsageFigures", () => {
  it("is for a key with the scope whose creator is an Owner or Admin, and for no one else", async () => {
    const { w, sara, admin, keyFor } = await setup();
    await expect(workspaceUsageFigures(await keyFor(sara, "owner", ["metrics:read"]))).rejects.toThrow(Forbidden);
    // A Member cannot make the key; and when the creator is demoted afterwards, the key stops reading.
    const member = await w.person("member");
    await expect(createAccessKey(w.actor(member, "member"), { name: "x", scopes: ["usage:read"], expiresOn: inDays(30) })).rejects.toThrow(/Owners and Admins/);
    const key = await keyFor(admin!, "admin");
    await expect(workspaceUsageFigures(key)).resolves.toBeTruthy();
    await w.setRole(admin!, "member");
    const demoted = (await actorForSecret((await createAccessKey(w.actor(sara), { name: "y", scopes: ["usage:read"], expiresOn: inDays(30) })).secret)) as KeyActor;
    await expect(workspaceUsageFigures({ ...demoted, role: "member" })).rejects.toThrow(Forbidden);
    // A key the database does not know as a live program key, and the demo, read nothing.
    await expect(workspaceUsageFigures({ ...key, key: { ...key.key, id: "999999999" } })).rejects.toThrow(Forbidden);
    await expect(workspaceUsageFigures({ ...key, workspaceId: DEMO_WORKSPACE_ID })).rejects.toThrow(Forbidden);
  });

  it("is never an assistant's: the database refuses the scope in an assistant's row", async () => {
    const { w, sara } = await setup();
    // A registered client, so the only thing that can refuse the row is the scope.
    const client = `zc_${"a".repeat(22)}`;
    await db().from("oauth_clients").upsert({ id: client, name: "Test", redirect_uris: ["https://example.com/cb"] });
    const insert = async (scopes: string[], prefix: string) => (await db().from("access_keys").insert({ workspace_id: w.id, created_by: sara, name: "Assistant", kind: "assistant", oauth_client_id: client, scopes, expires_on: inDays(30), prefix, secret_hash: prefix.padEnd(64, "0") }).select("id")).error?.message ?? null;
    expect(await insert(["metrics:read"], "aa0000000001")).toBeNull();
    expect(await insert(["usage:read"], "aa0000000002")).toMatch(/access_keys_assistant_never_approves/);
    cleanups.push(async () => { await db().from("access_keys").delete().eq("workspace_id", w.id); await db().from("oauth_clients").delete().eq("id", client); });
  });

  it("counts values by day and Source and views by kind, and only this Workspace's", async () => {
    const { w, sara, keyFor, value, view } = await setup();
    const m = await w.metric(sara, { name: "Revenue" });
    await value(m.id, "web_form", 2); await value(m.id, "web_form", 2); await value(m.id, "mail", 2); await value(m.id, "api", 1);
    const dash = ((await db().from("dashboards").insert({ name: "D", owner_id: sara, workspace_id: w.id }).select("id").single()).data as { id: number }).id;
    const deck = ((await db().from("decks").insert({ name: "K", owner_id: sara, workspace_id: w.id }).select("id").single()).data as { id: number }).id;
    await view("dashboard", dash, 2, 3, 2); await view("deck", deck, 2); await view("metric", m.id, 1, 4);
    // Another Workspace's values and views are nowhere in it.
    const other = await setup(3); const om = await other.w.metric(other.sara, { name: "Elsewhere" });
    await other.value(om.id, "web_form", 2); await other.view("dashboard", 7, 2, 50);

    const got = await workspaceUsageFigures(await keyFor(sara, "owner"));
    const day = (d: string) => got.days.find((x) => x.day === d)!;
    expect(day(dayAgo(2))).toMatchObject({ workspace_values: 3, workspace_values_web: 2, workspace_values_email: 1, workspace_values_api: 0, workspace_views_dashboards: 5, workspace_views_decks: 1, workspace_views_metrics: 0 });
    expect(day(dayAgo(1))).toMatchObject({ workspace_values: 1, workspace_values_api: 1, workspace_views_metrics: 4, workspace_views_dashboards: 0 });
    expect(got.days).toHaveLength(30);
    expect(got.days.at(-1)!.day).toBe(dayAgo(1));
    expect(got.state).toMatchObject({ day: dayAgo(1), workspace_metrics: 1 });
  });

  it("returns only whole numbers under the listed keys: no name, no id, no person, no value", async () => {
    const { w, sara, admin, keyFor, value, view } = await setup();
    const m = await w.metric(sara, { name: "Hostile <script>alert(1)</script> a@b.example" });
    await value(m.id, "web_form", 1); await view("metric", m.id, 1);
    const got = await workspaceUsageFigures(await keyFor(sara, "owner"));
    const allowed = new Set(["day", ...WORKSPACE_EVENT_FIGURES, ...WORKSPACE_SOURCE_FIGURES, ...WORKSPACE_STATE_FIGURES]);
    for (const row of [...got.days, got.state]) for (const [k, v] of Object.entries(row)) {
      expect(allowed.has(k)).toBe(true);
      if (k !== "day") expect(Number.isInteger(v)).toBe(true);
    }
    const text = JSON.stringify(got);
    for (const secret of ["Hostile", "script", "b.example", "Secret Name", w.id, sara, admin!]) expect(text).not.toContain(secret);
  });

  it(`leaves out the values, views and Submitters while fewer than ${USAGE_MIN_PEOPLE} people are in the Workspace`, async () => {
    const small = await setup(2);
    const m = await small.w.metric(small.sara, { name: "M" }); await small.value(m.id, "web_form", 1);
    const got = await workspaceUsageFigures(await small.keyFor(small.sara, "owner"));
    // Not even the totals: a day's total less one's own activity is the other person's.
    for (const f of [...WORKSPACE_EVENT_FIGURES, ...WORKSPACE_SOURCE_FIGURES]) { expect(got.days.at(-1)).not.toHaveProperty(f); expect(got.withheld).toContain(f); }
    expect(got.state).toHaveProperty("workspace_metrics", 1);
    expect(got.state).not.toHaveProperty("workspace_submitters_without_values");
    expect(got.withheld).toContain("workspace_submitters_without_values");
    // With three, they are there.
    const enough = await setup(3);
    const ok = await workspaceUsageFigures(await enough.keyFor(enough.sara, "owner"));
    expect(ok.days.at(-1)).toHaveProperty("workspace_values_web", 0);
    expect(ok.state).toHaveProperty("workspace_submitters_without_values");
    expect(ok.withheld).toEqual([]);
  });

  it("returns nothing for the days before the third person joined, so a backfill cannot reach back to a smaller Workspace", async () => {
    const { w, sara, keyFor, value } = await setup(3);
    const m = await w.metric(sara, { name: "M" });
    await value(m.id, "web_form", 20); await value(m.id, "web_form", 2);
    await db().from("memberships").update({ created_at: daysAgo(10) }).eq("workspace_id", w.id).neq("user_id", sara);
    const got = await workspaceUsageFigures(await keyFor(sara, "owner"), { from: dayAgo(25), to: dayAgo(1) });
    expect(got.days.find((d) => d.day === dayAgo(20))).toEqual({ day: dayAgo(20) });
    expect(got.days.find((d) => d.day === dayAgo(2))).toMatchObject({ workspace_values: 1 });
  });

  it("counts only the Metrics, dashboards and decks the key's creator sees: a Workspace Role grants no Metric", async () => {
    const { w, sara, admin, keyFor, value, view } = await setup();
    const mine = await w.metric(admin!, { name: "Admin's own" });
    const hidden = await w.metric(sara, { name: "Owner's private" });
    await value(mine.id, "web_form", 2); await value(hidden.id, "telegram", 2); await value(hidden.id, "telegram", 2);
    await view("metric", mine.id, 2, 2); await view("metric", hidden.id, 2, 9);
    const got = await workspaceUsageFigures(await keyFor(admin!, "admin"));
    expect(got.days.find((d) => d.day === dayAgo(2))).toMatchObject({ workspace_values: 1, workspace_values_web: 1, workspace_values_telegram: 0, workspace_views_metrics: 2 });
    expect(got.state).toMatchObject({ workspace_metrics: 1 });
  });

  it(`grants exactly ${WORKSPACE_USAGE_CALLS_PER_HOUR} calls an hour to calls made at once, across all the Workspace's keys`, async () => {
    const { w, sara, keyFor } = await setup();
    const keys = [await keyFor(sara, "owner"), await keyFor(sara, "owner")];
    const results = await Promise.allSettled(Array.from({ length: WORKSPACE_USAGE_CALLS_PER_HOUR + 5 }, (_, i) => workspaceUsageFigures(keys[i % 2], { from: dayAgo(1), to: dayAgo(1) })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(WORKSPACE_USAGE_CALLS_PER_HOUR);
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(refused).toHaveLength(5);
    expect(refused.every((r) => r.reason instanceof UsageLimit)).toBe(true);
    // Another Workspace is not held back by this one's calls.
    const other = await setup();
    await expect(workspaceUsageFigures(await other.keyFor(other.sara, "owner"))).resolves.toBeTruthy();
    expect(w.id).toBeTruthy();
  });

  it("calls nothing unused before 90 days were counted, and has no view figures for a day before counting began", async () => {
    const { w, sara, keyFor } = await setup(3, 10);
    await w.metric(sara, { name: "Quiet", created_at: daysAgo(200) });
    const got = await workspaceUsageFigures(await keyFor(sara, "owner"));
    for (const f of ["workspace_metrics_not_opened", "workspace_dashboards_not_opened", "workspace_decks_not_opened", "workspace_archive_suggestions"]) {
      expect(got.state).not.toHaveProperty(f); expect(got.withheld).toContain(f);
    }
    expect(got.days.find((d) => d.day === dayAgo(20))).not.toHaveProperty("workspace_views_dashboards");
    expect(got.days.find((d) => d.day === dayAgo(5))).toHaveProperty("workspace_views_dashboards", 0);
  });

  it("counts what goes unused once 90 days were counted", async () => {
    const { w, sara, keyFor } = await setup(3, 120);
    await w.metric(sara, { name: "Quiet", created_at: daysAgo(200) });
    const got = await workspaceUsageFigures(await keyFor(sara, "owner"));
    expect(got.state).toMatchObject({ workspace_metrics: 1, workspace_metrics_without_values: 1, workspace_metrics_not_opened: 1, workspace_archive_suggestions: 1, workspace_dashboards_not_opened: 0 });
  });

  it("refuses a range it cannot answer", async () => {
    const { sara, keyFor } = await setup();
    const key = await keyFor(sara, "owner");
    await expect(workspaceUsageFigures(key, { from: "2020-01-01", to: dayAgo(1) })).rejects.toThrow(UsageRangeError);
    await expect(workspaceUsageFigures(key, { from: "nope" })).rejects.toThrow(UsageRangeError);
    const one = await workspaceUsageFigures(key, { from: dayAgo(3), to: dayAgo(3) });
    expect(one.days.map((d) => d.day)).toEqual([dayAgo(3)]);
  });
});
