// The Owner of a Workspace that has closed, as an ended trial or because its Size was cancelled, can still download the
// Workspace Export (spec 0040, #679): it is the way out the reminders and the ended screen offer. An Admin cannot.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { cancelCloudWorkspace, setCloudLimit } from "./cloud-api";
import { db } from "./db";
import { closeEndedTrials, trialStatus } from "./trial-end";
import { workspace } from "./test/db-fixtures";
import { exportWorkspace, workspaceExportState } from "./workspace-export";
import { readWorkspaceExportAll } from "./workspace-export-file";
import { forgetWorkspaceKey } from "./workspace-keys";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 54).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved;
});

/** A Workspace with a Metric and an Owner who has just signed in, and an Admin. */
async function base() {
  const w = await workspace("Closing");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await db().from("access_keys").delete().eq("workspace_id", w.id); await w.cleanup(); });
  const owner = await w.person("owner", { email: `owner-${randomUUID().slice(0, 6)}@example.com` });
  const admin = await w.person("admin", { email: `admin-${randomUUID().slice(0, 6)}@example.com` });
  const email = `auth-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data } = await db().auth.admin.createUser({ email, password, email_confirm: true });
  cleanups.push(async () => { await db().auth.admin.deleteUser(data.user!.id); });
  await db().from("profiles").update({ auth_user_id: data.user!.id }).eq("id", owner);
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await w.metric(owner, { name: "Kept for the export" });
  return { ...w, owner, admin };
}

/** The Owner's download, read back with the format's own reader: the names of its Metrics. */
async function metricsInDownload(w: Awaited<ReturnType<typeof base>>): Promise<string[]> {
  const file = await exportWorkspace(w.actor(w.owner, "owner"));
  const chunks: Uint8Array[] = [];
  for await (const c of file.stream) chunks.push(c);
  return (await readWorkspaceExportAll(Buffer.concat(chunks))).map((r) => r.record).filter((r) => r.kind === "metric").map((r) => (r as { metric: { name: string } }).metric.name);
}

describe("the Workspace Export of a closed Workspace", () => {
  it("is downloaded by the Owner of an ended trial, not by an Admin, and the ended screen offers it", async () => {
    const w = await base();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", w.id);
    await closeEndedTrials();
    expect(await trialStatus(w.id, "owner")).toMatchObject({ ended: true, cancelled: false });
    expect(await metricsInDownload(w)).toContain("Kept for the export");
    expect(await workspaceExportState(w.actor(w.owner, "owner"))).toEqual({ signedInRecently: true });
    await expect(exportWorkspace(w.actor(w.admin, "admin"))).rejects.toBeInstanceOf(Forbidden);
  });

  it("is downloaded by the Owner of a Workspace whose Size was cancelled, not by an Admin", async () => {
    const w = await base();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", w.id);
    await setCloudLimit({ cloud: true }, w.id, { metrics: 50, label: "Small", endTrial: true });
    await cancelCloudWorkspace({ cloud: true }, w.id);
    expect(await trialStatus(w.id, "owner")).toMatchObject({ ended: true, cancelled: true });
    expect(await metricsInDownload(w)).toContain("Kept for the export");
    await expect(exportWorkspace(w.actor(w.admin, "admin"))).rejects.toBeInstanceOf(Forbidden);
    await db().from("installation_audit_events").delete().eq("subject", w.id);
  });
});
