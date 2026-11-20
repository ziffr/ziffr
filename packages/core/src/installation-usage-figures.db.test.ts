// The Installation figures #365 left out (spec 0031, #389), against the real database: call counters, sign-ups and
// activity, trials, Sizes and deletions, values by Feed and by connected assistant, the rebuilt states of a missed day,
// and the small-number rule for the new splits. Counts are compared as differences, since the database is shared.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { usageDayView, USAGE_FIGURES, USAGE_SPLIT_FIGURES, USAGE_TOTAL_FIGURES, usageRollupJob } from "./installation-usage";
import { callKind, countCall, flushUsageCounts } from "./usage-calls";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace("Figures"); cleanups.push(w.cleanup); return w; }
const today = () => new Date().toISOString().slice(0, 10);
const rollup = async (day: string, exclude: string | null = null, states = true) => (await db().rpc("usage_rollup_day", { p_day: day, p_exclude: exclude, p_states: states })).data as Record<string, number>;
/** What one Workspace adds to a figure today: the day with it less the day without it. */
const added = async (w: { id: string }, k: string, states = true) => Number((await rollup(today(), null, states))[k]) - Number((await rollup(today(), w.id, states))[k]);

describe("call counters", () => {
  it("count in memory, are written together, add to what is there, and skip the demo and unknown Workspaces", async () => {
    const w = await ws();
    for (let i = 0; i < 3; i++) countCall(w.id, "api_calls");
    countCall(w.id, "mcp_calls");
    countCall(DEMO_WORKSPACE_ID, "api_calls");
    countCall("not-a-workspace", "api_calls");
    countCall(randomUUID(), "feed_calls");
    expect(await flushUsageCounts()).toBeGreaterThanOrEqual(2);
    countCall(w.id, "api_calls");
    await flushUsageCounts();
    const { data } = await db().from("usage_counts").select("kind, n").eq("workspace_id", w.id).eq("day", today());
    expect(Object.fromEntries((data ?? []).map((r) => [r.kind, Number(r.n)]))).toEqual({ api_calls: 4, mcp_calls: 1 });
    expect((await db().from("usage_counts").select("n").eq("workspace_id", DEMO_WORKSPACE_ID).eq("day", today())).data).toEqual([]);
    expect(await added(w, "api_calls")).toBe(4);
    expect(await added(w, "mcp_calls")).toBe(1);
    expect(await added(w, "feed_calls")).toBe(0);
    expect(await added(w, "mcp_calls_ws")).toBe(1);
    expect(await added(w, "feed_calls_ws")).toBe(0);
  });
  it("tell a Feed's calls, the remote MCP Server's and other programs' apart", () => {
    expect(callKind(true, false)).toBe("feed_calls");
    expect(callKind(false, true)).toBe("mcp_calls");
    expect(callKind(false, false)).toBe("api_calls");
  });
  it("accept only known kinds and keep no key, person or route", async () => {
    const w = await ws();
    const { error } = await db().rpc("add_usage_counts", { p_rows: [{ day: today(), kind: "emails", workspace_id: w.id, n: 5 }] });
    expect(error).toBeNull();
    expect((await db().from("usage_counts").select("n").eq("workspace_id", w.id)).data).toEqual([]);
    expect((await db().rpc("add_usage_counts", { p_rows: { not: "an array" } })).error).not.toBeNull();
    const cols = (await db().from("usage_events").select("*").limit(0)).data;
    expect(cols).toEqual([]);
  });
});

describe("values by way in", () => {
  it("split the API's values into a person's key, a Feed and a connected assistant, with the Workspaces behind each", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    const feedPerson = `t-${randomUUID()}`;
    await db().from("profiles").insert({ id: feedPerson, name: "Feed", role: "", color: "#000" });
    await db().from("feeds").insert({ workspace_id: w.id, person_id: feedPerson, name: "Usage" });
    const { data: client } = await db().from("oauth_clients").insert({ id: `zc_${randomUUID().replace(/-/g, "").slice(0, 22)}`, name: "Assistant", redirect_uris: ["https://example.com/cb"] }).select("id").single();
    const key = async (over: Record<string, unknown>) => { const r = await db().from("access_keys").insert({ workspace_id: w.id, created_by: sara, name: "k", prefix: randomUUID().slice(0, 6), secret_hash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""), scopes: ["values:submit"], expires_on: "2099-01-01", ...over }).select("id").single(); if (r.error) throw new Error(JSON.stringify(r.error)); return Number(r.data!.id); };
    const program = await key({}), feed = await key({ feed_id: feedPerson, scopes: ["feed:submit"] }), assistant = await key({ kind: "assistant", oauth_client_id: client!.id });
    const put = async (source: string, keyId: number | null, i: number) => { await db().from("observations").insert({ metric_id: m.id, period_start: `2026-0${i + 1}-01`, value: i, source, access_key_id: keyId, submitter_id: sara, workspace_id: w.id }); };
    await put("api", program, 0); await put("api", program, 1); await put("api", feed, 2); await put("api", assistant, 3); await put("web_form", null, 4); await put("mail", null, 5);
    expect(await added(w, "values_api")).toBe(2);
    expect(await added(w, "values_feed")).toBe(1);
    expect(await added(w, "values_mcp")).toBe(1);
    expect(await added(w, "values_web")).toBe(1);
    expect(await added(w, "values_email")).toBe(1);
    expect(await added(w, "values_feed_ws")).toBe(1);
    expect(await added(w, "values_mcp_ws")).toBe(1);
    await db().from("access_keys").delete().eq("workspace_id", w.id);
    await db().from("oauth_clients").delete().eq("id", client!.id);
    await db().from("feeds").delete().eq("person_id", feedPerson);
    await db().from("profiles").delete().eq("id", feedPerson);
  });
});

describe("events nothing recorded before", () => {
  it("counts a trial when it starts, however it was made, and not the Workspace left out", async () => {
    const w = await ws();
    const before = Number((await rollup(today(), w.id)).trials_started);
    const id = randomUUID();
    cleanups.push(async () => { await db().from("workspaces").delete().eq("id", id); });
    await db().from("workspaces").insert({ id, name: "Trial", trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString() });
    const { data } = await db().from("workspaces").select("trial_started_at, created_at").eq("id", id).single();
    expect(data!.trial_started_at).toBe(data!.created_at);
    expect(Number((await rollup(today(), w.id)).trials_started) - before).toBe(1);
    expect(Number((await rollup(today(), id)).trials_started)).toBe(before);
    // Keeping the trial ends it, but it did start.
    await db().from("workspaces").update({ trial_ends_at: null, trial_kept_at: new Date().toISOString() }).eq("id", id);
    expect(Number((await rollup(today(), w.id)).trials_started) - before).toBe(1);
  });
  it("counts a Size booked by Ziffr Cloud, not one an Installation Admin set, and not a change of nothing", async () => {
    const w = await ws();
    await db().from("workspace_limits").insert({ workspace_id: w.id, metrics: 20, label: "Team", set_by: "installation_admin" });
    expect(await added(w, "sizes_booked")).toBe(0);
    await db().from("workspace_limits").update({ metrics: 50, label: "Business", set_by: "cloud" }).eq("workspace_id", w.id);
    expect(await added(w, "sizes_booked")).toBe(1);
    await db().from("workspace_limits").update({ next_label: "Soon" }).eq("workspace_id", w.id);
    expect(await added(w, "sizes_booked")).toBe(1);
    await db().from("workspace_limits").update({ metrics: 80 }).eq("workspace_id", w.id);
    expect(await added(w, "sizes_booked")).toBe(2);
  });
  it("counts a Workspace deleted, however it went, except the one left out", async () => {
    const id = randomUUID();
    await db().from("workspaces").insert({ id, name: "Going" });
    const before = Number((await rollup(today())).workspaces_deleted);
    await db().from("workspaces").delete().eq("id", id);
    expect(Number((await rollup(today())).workspaces_deleted) - before).toBe(1);
    // Left out of the figures, it is left out of this one too.
    const id2 = randomUUID();
    await db().from("workspaces").insert({ id: id2, name: "Going too" });
    const without = Number((await rollup(today(), id2)).workspaces_deleted);
    await db().from("workspaces").delete().eq("id", id2);
    expect(Number((await rollup(today(), id2)).workspaces_deleted)).toBe(without);
    expect(Number((await rollup(today())).workspaces_deleted) - before).toBe(2);
    // The demo's own deletion is never counted.
    const { data } = await db().from("usage_events").select("workspace_id").eq("workspace_id", DEMO_WORKSPACE_ID);
    expect(data).toEqual([]);
  });
  it("counts sign-ups of people in the figures, and who signed in within 7 days", async () => {
    const w = await ws();
    const email = `figures-${randomUUID()}@example.test`;
    const created = await db().auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
    const authId = created.data.user!.id;
    const pid = `t-${randomUUID()}`;
    cleanups.push(async () => { await db().from("profiles").delete().eq("id", pid); await db().auth.admin.deleteUser(authId); });
    await db().from("profiles").insert({ id: pid, name: "New", role: "", color: "#000", auth_user_id: authId });
    await db().from("memberships").insert({ workspace_id: w.id, user_id: pid, role: "owner" });
    expect(await added(w, "signups")).toBe(1);
    expect(await added(w, "people_active_7d")).toBe(0);
    // A sign-in is activity; the client is its own so the service client keeps its role.
    const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const other = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: link } = await db().auth.admin.generateLink({ type: "magiclink", email });
    await other.auth.verifyOtp({ type: "magiclink", token_hash: link.properties!.hashed_token });
    expect(await added(w, "people_active_7d")).toBe(1);
    expect(await added(w, "signups", false)).toBe(1);
  });
  it("counts a Workspace as active for 7 days from its last use, and not a Workspace unused for longer", async () => {
    const w = await ws();
    await db().from("workspaces").update({ last_used_at: new Date().toISOString() }).eq("id", w.id);
    expect(await added(w, "workspaces_active_7d")).toBe(1);
    await db().from("workspaces").update({ last_used_at: new Date(Date.now() - 9 * 86_400_000).toISOString() }).eq("id", w.id);
    expect(await added(w, "workspaces_active_7d")).toBe(0);
  });
});

describe("a day the job missed", () => {
  it("is rebuilt from creation dates as of the end of that day, and an earlier day does not have what came later", async () => {
    const w = await ws(); const sara = await w.person("owner"); await w.metric(sara); await w.metric(sara);
    const { data: archived } = await db().from("metrics").select("id").eq("workspace_id", w.id).limit(1);
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", archived![0].id);
    expect(await added(w, "workspaces", false)).toBe(1);
    expect(await added(w, "metrics", false)).toBe(1);
    expect(await added(w, "metrics_archived", false)).toBe(1);
    expect(await added(w, "people", false)).toBe(0);
    const earlier = await rollup("2020-03-01", null, false);
    const earlierWithout = await rollup("2020-03-01", w.id, false);
    expect(earlier.workspaces).toBe(earlierWithout.workspaces);
    expect(earlier.metrics).toBe(earlierWithout.metrics);
    for (const k of ["workspaces_trial", "workspaces_free", "workspaces_paid", "workflows", "packs", "people_active_7d", "workspaces_active_7d"]) expect(earlier[k]).toBeUndefined();
  });
  it("is filled in by the job, with the day's events and the rebuilt states", async () => {
    await db().from("installation_usage_daily").delete().gte("day", "2021-01-01");
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const missed = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await db().from("installation_usage_daily").insert({ day: new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10), figures: { workspaces: 1 } });
    await usageRollupJob();
    const { data } = await db().from("installation_usage_daily").select("day, figures").gte("day", missed).order("day");
    const byDay = Object.fromEntries((data ?? []).map((r) => [r.day, r.figures as Record<string, unknown>]));
    expect(byDay[missed].metrics).toBeDefined();
    expect(byDay[missed].workflows).toBeUndefined();
    expect(byDay[yesterday].workflows).toBeDefined();
    await db().from("installation_usage_daily").delete().gte("day", "2021-01-01");
  });
});

describe("every figure is filled or documented as not available", () => {
  it("the day of today has every total figure and every split's counts, and no figure outside the list", async () => {
    const day = await rollup(today());
    for (const k of USAGE_TOTAL_FIGURES) expect(Number.isInteger(day[k]), k).toBe(true);
    for (const k of USAGE_SPLIT_FIGURES) expect(Number.isInteger(day[k]), k).toBe(true);
    const known = new Set([...USAGE_FIGURES, "packs", ...USAGE_SPLIT_FIGURES.filter((k) => k.startsWith("values_") || k.endsWith("_calls")).map((k) => `${k}_ws`)]);
    for (const k of Object.keys(day)) expect(known.has(k), k).toBe(true);
    expect(USAGE_FIGURES).not.toContain("values_derived");
  });
});

describe("small numbers for the new splits", () => {
  it("withholds values by Feed and by assistant below 3 Workspaces, in a small Installation and a large one", () => {
    const small = usageDayView("2026-11-01", { workspaces: 2, values_feed: 8, values_feed_ws: 2, values_mcp: 4, values_mcp_ws: 2, feed_calls: 9, feed_calls_ws: 1, mcp_calls: 3, mcp_calls_ws: 3, signups: 1, trials_started: 2, sizes_booked: 1, workspaces_deleted: 1, api_calls: 5 });
    expect(small).toMatchObject({ signups: 1, trials_started: 2, sizes_booked: 1, workspaces_deleted: 1, api_calls: 5 });
    expect(small.values_feed).toBeUndefined();
    expect(small.feed_calls).toBeUndefined();
    expect(small.mcp_calls).toBeUndefined();
    expect(small.withheld).toEqual(expect.arrayContaining(["values_feed", "values_mcp"]));
    const big = usageDayView("2026-11-01", { workspaces: 12, feed_calls: 9, feed_calls_ws: 2, mcp_calls: 3, mcp_calls_ws: 3, values_feed: 8, values_feed_ws: 2, values_mcp: 4, values_mcp_ws: 3, values_api: 0, values_api_ws: 0 });
    expect(big.values_feed).toBeUndefined();
    expect(big.withheld).toContain("values_feed");
    expect(big).toMatchObject({ values_mcp: 4, values_api: 0, mcp_calls: 3 });
    expect(big.feed_calls).toBeUndefined();
    expect(big.withheld).toContain("feed_calls");
    expect(JSON.stringify(big)).not.toContain("_ws");
  });
});
