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
      submission_rule: "overwrite", polarity: "higher", sources: ["web_form", "slack", "mail"], ...over,
    }).select("*").single());
    return data as { id: number; slug: string; owner_id: string };
  };
  const token = async (metricId: number, submitter: string) => {
    const code = `tk-test-${randomUUID()}`;
    await must(db().from("tokens").insert({ code, metric_id: metricId, submitter_id: submitter }));
    return code;
  };
  const actor = (personId: string, role: Actor["role"] = "owner"): Actor => ({ personId, workspaceId: id, role });
  const cleanup = async () => {
    await db().from("breakdown_rows").delete().eq("workspace_id", id);
    await db().from("observations").delete().eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
    if (people.length) await db().from("profiles").delete().in("id", people);
  };
  return { id, person, contact, metric, token, actor, cleanup };
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
