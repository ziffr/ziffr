// Throwaway workspaces for database tests: each test builds what it needs and removes it again, so tests never see
// each other's rows or the demo's.
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { storeCondensedFor, type CondensedInput } from "../condensed-values";
import { getMetrics } from "../workspace-data";
import { openRows, type OpenedTable } from "../sealed-columns";
import type { Actor } from "../actor";
import { openVersionSnapshot, type VersionType } from "../versions";

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
  /** Shares a Metric with a person as a viewer, and takes that Share away again. */
  const share = async (metricId: number, userId: string) => { await must(db().from("shares").insert({ workspace_id: id, object_type: "metric", object_id: metricId, user_id: userId, role: "viewer" })); };
  const unshare = async (metricId: number, userId: string) => { await must(db().from("shares").delete().eq("workspace_id", id).eq("object_id", metricId).eq("user_id", userId)); };
  /** Takes a person out of the workspace without handover, for tests of what a key does then. */
  const dropMember = async (userId: string) => { await must(db().from("memberships").delete().eq("workspace_id", id).eq("user_id", userId)); };
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
  return { id, person, contact, metric, token, action, value, lock, trial, limit, setRole, share, unshare, dropMember, actor, cleanup };
}

/** Whether the person switched the usage digest off, as stored: for tests of the setting and of the unsubscribe link. */
export async function digestOptedOut(personId: string) {
  const { data } = await db().from("usage_digest_opt_outs").select("person_id").eq("person_id", personId).maybeSingle();
  return Boolean(data);
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
  const { data } = await db().from("observations").select("id, workspace_id, value, value_sealed, submitter_id, source, original_value, original_value_sealed").eq("metric_id", metricId).order("created_at");
  const ws = data?.[0]?.workspace_id as string | undefined;
  // Values are sealed with the Workspace Key: read them as the core does (spec 0028).
  const rows = ws ? await opened("observations", ws, data, { dropId: true }) : [];
  return rows.map((o) => ({ value: Number(o.value), original_value: o.original_value === null ? null : Number(o.original_value), submitter_id: o.submitter_id, source: o.source }));
}

async function must<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(`Test setup failed: ${JSON.stringify(r.error)}`);
  return r;
}

/** Rows read straight from a table with sealed columns, opened as the core reads them (spec 0028), so a test checks
 * the words and not whether this run has a ZIFFR_SECRETS_KEY. `dropId` leaves out the id the opening needed. */
export async function opened<T extends Record<string, unknown>>(table: OpenedTable, workspaceId: string, rows: T[] | null | undefined, options: { dropId?: boolean } = {}): Promise<T[]> {
  const open = await openRows(table, workspaceId, rows ?? []);
  if (!options.dropId) return open;
  return open.map((r) => {
    const copy: Record<string, unknown> = { ...r };
    delete copy.id;
    return copy as T;
  });
}

/** Versions read straight from the table, their words opened as the core reads them (spec 0028). */
export async function openedVersions<T extends { version: number; snapshot: unknown }>(workspaceId: string, type: VersionType, id: number, rows: T[] | null | undefined): Promise<T[]> {
  return Promise.all((rows ?? []).map(async (r) => ({ ...r, snapshot: await openVersionSnapshot(workspaceId, type, id, r.version, r.snapshot) })));
}

/** An Installation Admin added on the page for one test (spec 0025): the person and a `cleanup` that removes them again
 * (and any Usage Key left, so the Installation's one live key is free for the next test). */
export async function installationAdmin() {
  const pid = `t-${randomUUID()}`;
  await must(db().from("profiles").insert({ id: pid, name: `Admin ${pid.slice(2, 6)}`, role: "", color: "#000", email: null, slack_handle: null }));
  await must(db().from("installation_admins").insert({ person_id: pid }));
  const cleanup = async () => {
    await db().from("usage_keys").delete().neq("id", 0);
    await db().from("installation_admins").delete().eq("person_id", pid);
    await db().from("profiles").delete().eq("id", pid);
  };
  return { actor: { personId: pid }, cleanup };
}

/** The Audit Log rows of a workspace whose kind starts with `kind` (a test reads them back without the core's filters), opened as the core reads them. */
export async function auditRowsOf(workspaceId: string, kind: string) {
  const { data } = await db().from("audit_events").select("id, kind, access_key_id, details").eq("workspace_id", workspaceId).like("kind", `${kind}%`).order("id");
  return opened("audit_events", workspaceId, data, { dropId: true });
}

/** Tries to store an assistant's key row with the given scopes, as the database alone would see it; answers the error code, if any. */
export async function insertAssistantKey(workspaceId: string, createdBy: string, scopes: string[]): Promise<string | null> {
  const { error } = await db().from("access_keys").insert({ workspace_id: workspaceId, created_by: createdBy, name: "Assistant", kind: "assistant", scopes, expires_on: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), prefix: "test00000000", secret_hash: "x".repeat(64) });
  return error?.code ?? null;
}

/** Marks an Action as sent to a Webhook (as the deliveries job does), so the Webhook may answer for it. */
export async function markSentToWebhook(workspaceId: string, webhookId: string, actionId: number, metricId: number) {
  await must(db().from("webhook_sends").insert({ workspace_id: workspaceId, webhook_id: webhookId, type: "action.created", action_id: actionId, metric_id: metricId, period_start: "2026-10-01", source_type: "app", state: "delivered" }));
}

/** Inserts one row into a table, as a test sets up what the core has no operation for (another workspace's thing, an
 * open request); returns the row as stored. */
export async function insertRow(table: string, row: Record<string, unknown>): Promise<{ id: number; [column: string]: unknown }> {
  const { data } = await must(db().from(table).insert(row).select("*").single());
  return data as { id: number; [column: string]: unknown };
}

/** The rows of a table that match every column in `match`, for tests that check what an operation stored. */
export async function rowsOf(table: string, match: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  let q = db().from(table).select("*");
  for (const [column, value] of Object.entries(match)) q = q.eq(column, value as string);
  const { data } = await must(q);
  return (data ?? []) as Record<string, unknown>[];
}

/** Changes the rows of a table that match every column in `match`, to set a test up (a role changed, a thing handed on). */
export async function changeRows(table: string, match: Record<string, unknown>, change: Record<string, unknown>): Promise<void> {
  let q = db().from(table).update(change);
  for (const [column, value] of Object.entries(match)) q = q.eq(column, value as string);
  await must(q);
}

/** Stores the Condensed Value of one span of a Metric as the Retention job does, without a Retention: only for tests,
 * since no operation lets a person freeze a span that way. */
export async function storeCondensed(workspace: { workspaceId: string }, input: CondensedInput): Promise<string> {
  const metric = (await getMetrics(workspace.workspaceId)).find((m) => m.id === input.metricId);
  if (!metric) throw new Error(`No Metric ${input.metricId} in this Workspace.`);
  return storeCondensedFor(workspace.workspaceId, metric, input);
}

/** Removes every Trial Limit setting (those Ziffr Cloud set too, which only its function may remove) and rewrites the row
 * the triggers read from the defaults, so a test starts and ends with none. */
export async function resetTrialLimits() {
  const names = ["DAYS", "GRACE_DAYS", "MAX", ...["METRICS", "MESSAGES_PER_DAY", "KEYS", "FEEDS", "ASSISTANTS", "WEBHOOKS", "WEBHOOK_SENDS_PER_DAY", "VIEW_LINKS"].map((n) => `LIMIT_${n}`)].map((n) => `ZIFFR_TRIAL_${n}`);
  await must(db().rpc("set_cloud_trial_limits", { p_values: Object.fromEntries(names.map((n) => [n, null])), p_env: {} }));
}
