"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentActor, DEMO_WORKSPACE_ID, VIEWER_COOKIE, viewerId } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { assertCanSeeMetrics, assertMembers, forbidden } from "@/lib/guards";
import { deliver } from "@/lib/deliveries";
import { postReply } from "@/lib/threads";
import { decideCorrection as coreDecideCorrection, submitValue, type SubmissionResult } from "@ziffr/core/submissions";
import { correctionEffects, metricEffects, submissionEffects } from "@/lib/core-effects";
import { createMetric as coreCreateMetric } from "@ziffr/core/metrics";
import type { SourceId } from "@ziffr/core/types";

// PROTOTYPE: little validation beyond what keeps the demo runnable; but every record lands in the acting person's
// workspace, and ids and people sent by the browser must belong to it.

export async function setViewer(id: string) {
  // "View as" only exists in the demo, and only for its own made-up people; elsewhere identity comes from signing in.
  if (!(await isDemo())) throw new Error("Not available.");
  const { data: demoPerson } = await db.from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("user_id", String(id)).maybeSingle();
  if (!demoPerson) forbidden();
  (await cookies()).set(VIEWER_COOKIE, id, { path: "/" });
  revalidatePath("/", "layout");
}

export async function resetDemo() {
  // Resetting empties the demo workspace and seeds it again (ADR 0005); real workspaces are never touched.
  if (!(await isDemo())) throw new Error("Not available.");
  // One locked step in the database, at most once a minute: visitors share the demo and the database.
  const { data: done, error } = await db.rpc("demo_reset");
  if (error) throw new Error("The demo could not be reset. Try again in a minute.");
  if (!done) throw new Error("The demo was reset a moment ago.");
  revalidatePath("/", "layout");
  redirect("/");
}

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));

/** Creates a Metric from the form; the core checks the role and every field. */
export async function createMetric(form: FormData) {
  const num = (k: string) => (form.get(k) === null || form.get(k) === "" ? null : Number(form.get(k)));
  const { slug } = await coreCreateMetric(await currentActor(), {
    name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), unit: String(form.get("unit") ?? ""),
    format: String(form.get("format") ?? ""), decimals: Number(form.get("decimals") ?? 0), period: String(form.get("period") ?? ""),
    submissionRule: String(form.get("submission_rule") ?? ""), polarity: String(form.get("polarity") ?? ""), aggregation: String(form.get("aggregation") ?? ""),
    targetMin: num("target_min"), targetMax: num("target_max"), fromCatalogId: num("from_catalog_id"),
    sources: form.getAll("sources").map(String), submitters: form.getAll("submitters").map(String),
  }, metricEffects);
  revalidatePath("/", "layout");
  redirect(`/metrics/${slug}?created=1`);
}

export async function simulateMessage(input: { source: SourceId; sender: string; text: string; promptId?: number }): Promise<SubmissionResult> {
  // Playing someone on an outside channel is only for the demo, and only reaches the demo's people and Metrics.
  if (!(await isDemo())) forbidden();
  const r = await submitValue({ ...input, workspaceId: DEMO_WORKSPACE_ID }, submissionEffects);
  revalidatePath("/", "layout");
  return r;
}

export async function submitWebForm(code: string, form: FormData) {
  // A breakdown travels as "label value" lines; a filled-in total joins them as a Total line.
  const value = String(form.get("value") ?? "").trim();
  const breakdown = String(form.get("breakdown") ?? "").trim();
  const text = breakdown ? `${breakdown}${value ? `\nTotal ${value}` : ""}` : value;
  const r = await submitValue({ source: "web_form", sender: String(code), text: text.slice(0, 5000) }, submissionEffects);
  revalidatePath("/", "layout");
  redirect(`/submit/${code}?outcome=${encodeURIComponent(r.outcome)}&detail=${encodeURIComponent(r.detail)}`);
}

export async function createAction(input: { metricId: number; period: string; assigneeId: string; question: string }) {
  const viewer = await viewerId();
  await assertCanSeeMetrics([input.metricId], viewer);
  await assertMembers([input.assigneeId]);
  const { data: obs } = await db
    .from("observations")
    .select("id")
    .eq("metric_id", input.metricId)
    .eq("period_start", input.period)
    .order("created_at", { ascending: false })
    .limit(1);
  const { data } = await db
    .from("actions")
    .insert({
      metric_id: input.metricId,
      period_start: input.period,
      observation_id: obs?.[0]?.id ?? null,
      asker_id: viewer,
      assignee_id: input.assigneeId,
      question: input.question,
    })
    .select("id")
    .single();
  if (data) await deliver({ kind: "question", actionId: data.id, senderId: viewer, recipientId: input.assigneeId });
  revalidatePath("/", "layout");
  return data?.id as number;
}

export async function replyToAction(actionId: number, form: FormData) {
  const viewer = await viewerId();
  const correction = num(form.get("correction"));
  const body = String(form.get("body") ?? "").trim();
  await postReply(actionId, viewer, body, correction);
  revalidatePath("/", "layout");
}

/** The Metric owner accepts or declines a Correction; the core decides who may and what changes. */
export async function decideCorrection(messageId: number, accept: boolean) {
  await coreDecideCorrection(await currentActor(), Number(messageId), Boolean(accept), correctionEffects);
  revalidatePath("/", "layout");
}

export async function setActionStatus(actionId: number, status: "open" | "closed") {
  if (status !== "open" && status !== "closed") return;
  // Only the asker closes or reopens an Action.
  const viewer = await viewerId();
  const { data } = await db.from("actions").update({ status, updated_at: new Date().toISOString() }).eq("id", actionId).eq("asker_id", viewer).select("assignee_id");
  if (status === "closed" && data?.[0]) await deliver({ kind: "closed", actionId, senderId: viewer, recipientId: data[0].assignee_id });
  revalidatePath("/", "layout");
}
