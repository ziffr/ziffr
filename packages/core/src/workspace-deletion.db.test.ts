// Deleting a Workspace that has been used, against the database (GLOSSARY: Workspace, Breakdown, Trial Workspace): one
// that holds values with a Breakdown (and its history), open Actions and a Total goes whole, as a trial, as unused and
// as the Workspace of a failed import; a trial whose key was destroyed by a deletion that then stopped is finished by
// running the deletion again, by the job or by its Owner; and a Breakdown replaced while its value stays still keeps its history.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { ask } from "./questions";
import { recordOwnValue } from "./record-own-value";
import { submissionEffects } from "./submissions";
import { deleteExpiredTrials, endTrialNow } from "./trial-end";
import { destroyWorkspaceKeys, ensureWorkspaceKey, forgetWorkspaceKey } from "./workspace-keys";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
beforeAll(() => { process.env.ZIFFR_SECRETS_KEY ??= randomBytes(32).toString("base64"); });
afterAll(() => { if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c().catch(() => {}); });

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
/** Tables whose rows must all have gone with the Workspace. */
const GONE = ["metrics", "observations", "observation_history", "breakdown_rows", "breakdown_history", "actions", "thread_messages", "total_parts", "deliveries", "workspace_keys"];
const left = async (ws: string) => {
  const counts = await Promise.all(GONE.map(async (t) => [t, (await db().from(t).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0] as const));
  return counts.filter(([, n]) => n > 0);
};
const exists = async (ws: string) => ((await db().from("workspaces").select("id").eq("id", ws)).data ?? []).length === 1;

/** A Workspace used as one is: a Metric with a value and its Breakdown, replaced once so there is history, an open
 * question, and a Total with a part. */
async function used() {
  const w = await workspace("Used"); cleanups.push(w.cleanup);
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  const ann = await w.person("member");
  await ensureWorkspaceKey(w.id);
  const m = await w.metric(owner, { name: "Sales", submission_rule: "overwrite" });
  await w.token(m.id, ann);
  const quiet = { notifyCorrection: async () => {}, afterValue: submissionEffects.afterValue };
  for (const breakdown of ["Germany\t60\nAustria\t15", "Germany\t70\nAustria\t10"]) {
    expect(await recordOwnValue(w.actor(ann, "member"), m.id, { value: "", breakdown }, quiet)).toMatchObject({ ok: true });
  }
  await ask(w.actor(owner), { metricId: m.id, period: new Date().toISOString().slice(0, 7) + "-01", assigneeId: ann, text: "Why?" });
  const total = await w.metric(owner, { name: "All sales", total_targets: "own", formula: "{-}", sources: [] });
  await db().from("total_parts").insert({ total_id: total.id, part_id: m.id, workspace_id: w.id, first_period: "2026-01-01" }).throwOnError();
  const kept = (await db().from("breakdown_history").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count;
  // The Breakdown replaced while its value stayed is kept, as before.
  expect(kept).toBe(2);
  return { w, owner, ann, m };
}
const asTrial = (ws: string, endedDaysAgo: number) => db().from("workspaces").update({ trial_ends_at: ago(endedDaysAgo), trial_closed_at: ago(endedDaysAgo), trial_grace_days: 7 }).eq("id", ws).throwOnError();

describe("a Workspace with Breakdown values is deleted whole", () => {
  it("as a trial whose days are over", async () => {
    const { w } = await used();
    await asTrial(w.id, 30);
    await deleteExpiredTrials();
    expect(await exists(w.id)).toBe(false);
    expect(await left(w.id)).toEqual([]);
  });

  it("as a trial that a stopped deletion left without its key, when the deletion runs again", async () => {
    const { w } = await used();
    await asTrial(w.id, 30);
    // As an Installation was left: claimed, its key destroyed, every row still there.
    expect((await db().rpc("claim_trial_for_deletion", { p_workspace: w.id })).data).toBe(true);
    expect(await destroyWorkspaceKeys(w.id)).toBe(true);
    forgetWorkspaceKey(w.id);
    expect(await exists(w.id)).toBe(true);
    await deleteExpiredTrials();
    expect(await exists(w.id)).toBe(false);
    expect(await left(w.id)).toEqual([]);
  });

  it("as a running trial its Owner ended, when they ask again after a deletion that stopped", async () => {
    const { w, owner } = await used();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 10 * DAY).toISOString() }).eq("id", w.id).throwOnError();
    expect((await db().rpc("claim_trial_for_deletion", { p_workspace: w.id })).data).toBe(true);
    await destroyWorkspaceKeys(w.id);
    forgetWorkspaceKey(w.id);
    await endTrialNow(w.actor(owner));
    expect(await exists(w.id)).toBe(false);
    expect(await left(w.id)).toEqual([]);
  });

  it("as unused, with its key", async () => {
    const { w, owner } = await used();
    await db().from("workspaces").update({ last_used_at: ago(100), unused_warned_at: ago(15), unused_wait_days: 14 }).eq("id", w.id).throwOnError();
    await db().from("deliveries").insert({ workspace_id: w.id, connector: "email", recipient_id: owner, kind: "notice", subject: "Your Ziffr Workspace will be deleted", body: "x", mail_state: "sent", created_at: ago(14) }).throwOnError();
    const gone = await db().rpc("delete_unused_workspace", { p_workspace: w.id, p_days: 30 });
    expect(gone.error).toBeNull();
    expect(gone.data).toBe(true);
    expect(await left(w.id)).toEqual([]);
  });

  it("as the Workspace of an import that failed", async () => {
    const { w } = await used();
    await db().from("workspaces").update({ importing_at: ago(1) }).eq("id", w.id).throwOnError();
    await destroyWorkspaceKeys(w.id);
    const { error } = await db().from("workspaces").delete().eq("id", w.id).not("importing_at", "is", null);
    expect(error).toBeNull();
    expect(await left(w.id)).toEqual([]);
  });

  it("and a value deleted with its Breakdown keeps no history that could not name it", async () => {
    const { w, m } = await used();
    const { error } = await db().from("observations").delete().eq("workspace_id", w.id).eq("metric_id", m.id);
    expect(error).toBeNull();
    expect((await db().from("breakdown_rows").select("id").eq("workspace_id", w.id)).data).toEqual([]);
  });
});
