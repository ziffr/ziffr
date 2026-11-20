// Throwaway workspaces for database tests: each test builds what it needs and removes it again, so tests never see
// each other's rows or the demo's.
import { randomUUID } from "node:crypto";
import { db } from "../db";
import type { Actor } from "../actor";

/** A workspace with an owner, made for one test; `cleanup` deletes everything in it and its people. */
export async function workspace(name = "Test") {
  const id = randomUUID();
  const people: string[] = [];
  await must(db().from("workspaces").insert({ id, name }));
  const person = async (role: "owner" | "admin" | "member" | "guest", over: { email?: string; slack_handle?: string } = {}) => {
    const pid = `t-${randomUUID()}`;
    people.push(pid);
    await must(db().from("profiles").insert({ id: pid, name: `${role} ${pid.slice(2, 6)}`, role: "", color: "#000", email: over.email ?? null, slack_handle: over.slack_handle ?? null }));
    await must(db().from("memberships").insert({ workspace_id: id, user_id: pid, role }));
    return pid;
  };
  const contact = async (details: { email?: string; slack_handle?: string; phone?: string }) => {
    const pid = `t-${randomUUID()}`;
    people.push(pid);
    await must(db().from("profiles").insert({ id: pid, name: `Contact ${pid.slice(2, 6)}`, role: "Contact", color: "#000" }));
    await must(db().from("contacts").insert({ workspace_id: id, person_id: pid, email: details.email ?? null, slack_handle: details.slack_handle ?? null, phone: details.phone ?? null }));
    return pid;
  };
  const metric = async (owner: string, over: Record<string, unknown> = {}) => {
    const slug = `m-${randomUUID().slice(0, 8)}`;
    const { data } = await must(db().from("metrics").insert({
      slug, name: String(over.name ?? "Field visits"), owner_id: owner, workspace_id: id, unit: "", format: "number", decimals: 0, period: "month",
      submission_rule: "overwrite", polarity: "higher", sources: ["web_form", "slack", "mail", "telegram", "api"], ...over,
    }).select("*").single());
    return data as { id: number; slug: string; owner_id: string };
  };
  const token = async (metricId: number, submitter: string, over: Record<string, unknown> = {}) => {
    const code = `tk-test-${randomUUID()}`;
    await must(db().from("tokens").insert({ code, metric_id: metricId, submitter_id: submitter, ...over }));
    return code;
  };
  /** An Action as the core stores it (a question unless `kind` says otherwise); returns its id. */
  const action = async (row: { metric_id: number; period_start: string; asker_id: string; assignee_id: string } & Record<string, unknown>) => {
    const { data } = await must(db().from("actions").insert({ question: "Why?", kind: "question", workspace_id: id, ...row }).select("id").single());
    return (data as { id: number }).id;
  };
  const value = async (metricId: number, period: string, v: number, submitter: string | null = null) => {
    const { data } = await must(db().from("observations").insert({ metric_id: metricId, period_start: period, value: v, submitter_id: submitter, source: "api", workspace_id: id }).select("id").single());
    return (data as { id: number }).id;
  };
  const lock = async (metricId: number, period: string) => { await must(db().from("period_states").insert({ metric_id: metricId, period_start: period, state: "locked", workspace_id: id })); };
  /** Makes the workspace a trial ending on `endsAt` (yyyy-mm-dd), as the trial's CSV download needs. */
  const trial = async (endsAt: string) => { await must(db().from("workspaces").update({ trial_ends_at: endsAt }).eq("id", id)); };
  /** Gives the workspace a Workspace Limit of its own, over it since `overDaysAgo` days when given (spec 0029). */
  const limit = async (metrics: number | null, label: string | null = null, overDaysAgo?: number) => {
    await must(db().from("workspace_limits").insert({ workspace_id: id, metrics, label, set_by: "installation_admin" }));
    if (overDaysAgo !== undefined) await must(db().from("workspaces").update({ over_limit_since: new Date(Date.now() - overDaysAgo * 86_400_000).toISOString() }).eq("id", id));
  };
  const setRole = async (personId: string, role: Actor["role"]) => { await must(db().from("memberships").update({ role }).eq("workspace_id", id).eq("user_id", personId)); };
  const actor = (personId: string, role: Actor["role"] = "owner"): Actor => ({ personId, workspaceId: id, role });
  const cleanup = async () => {
    // A Feed is a person row of its own (spec 0012); it goes with its workspace.
    const { data: feeds } = await db().from("feeds").select("person_id").eq("workspace_id", id);
    people.push(...(feeds ?? []).map((f) => f.person_id as string));
    await db().from("breakdown_rows").delete().eq("workspace_id", id);
    await db().from("observations").delete().eq("workspace_id", id);
    await db().from("intake_log").delete().eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
    if (people.length) await db().from("profiles").delete().in("id", people);
  };
  return { id, person, contact, metric, token, action, value, lock, trial, limit, setRole, actor, cleanup };
}

/** A key's Access Log as stored, oldest first: for tests of the API's HTTP layer, which may not query the database. */
export async function accessLogOf(keyId: number) {
  const { data } = await db().from("access_log").select("method, route, status, submitted").eq("key_id", keyId).order("id");
  return data ?? [];
}

/** Calls made with a key, written straight into its Access Log (to reach a limit without making them). */
export async function logCalls(keyId: number, n: number, call: { status?: number; at?: string; submitted?: number; method?: string; route?: string } = {}) {
  await must(db().from("access_log").insert(Array.from({ length: n }, () => ({ key_id: keyId, method: call.method ?? "GET", route: call.route ?? "/api/v1/metrics", status: call.status ?? 200, submitted: call.submitted ?? 0, ...(call.at ? { at: call.at } : {}) }))));
}

/** A Feed's batch as claim_feed_batch stores it (to reach the day's limit, or hold the Feed, without running one). */
export async function feedBatch(feedId: string, items: number, over: { taken?: number | null; finished?: boolean } = {}) {
  await must(db().from("feed_batches").insert({ feed_id: feedId, items, taken: over.taken === undefined ? items : over.taken, finished_at: over.finished === false ? null : new Date().toISOString() }));
}

/** The values recorded for a Metric, oldest first. */
export async function valuesOf(metricId: number) {
  const { data } = await db().from("observations").select("value, submitter_id, source, original_value").eq("metric_id", metricId).order("created_at");
  return (data ?? []).map((o) => ({ ...o, value: Number(o.value), original_value: o.original_value === null ? null : Number(o.original_value) }));
}

async function must<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(`Test setup failed: ${JSON.stringify(r.error)}`);
  return r;
}
