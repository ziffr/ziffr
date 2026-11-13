"use server";

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DEMO_WORKSPACE_ID, VIEWER_COOKIE, viewerId } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { actingWorkspace, assertCanSeeMetrics, assertMembers, assertSubmitters, forbidden } from "@/lib/guards";
import { deliver, deliverPrompt } from "@/lib/deliveries";
import { postReply } from "@/lib/threads";
import { onValue } from "@/lib/workflow";
import { intake, type IntakeResult } from "@/sources/intake";
import type { SourceId } from "@ziffr/core/types";
import { recordVersion } from "@/lib/versions";

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

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createMetric(form: FormData) {
  const viewer = await viewerId();
  const ws = await actingWorkspace();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Give the Metric a name.");
  let slug = slugify(name) || "metric";
  const { data: clash } = await db.from("metrics").select("id").eq("slug", slug).eq("workspace_id", ws);
  if (clash?.length) slug = `${slug}-${Date.now().toString(36)}`;
  const sources = form.getAll("sources").map(String);
  // Submitters are checked before anything is written.
  const submitters = form.getAll("submitters").map(String);
  await assertSubmitters(submitters);
  const { data: metric } = await db
    .from("metrics")
    .insert({
      slug,
      name,
      description: String(form.get("description") ?? ""),
      unit: String(form.get("unit") ?? ""),
      format: form.get("format"),
      decimals: Number(form.get("decimals") ?? 0),
      period: form.get("period"),
      submission_rule: form.get("submission_rule"),
      polarity: form.get("polarity"),
      aggregation: ["sum", "average", "last", "none"].includes(String(form.get("aggregation"))) ? form.get("aggregation") : "sum",
      target_min: num(form.get("target_min")),
      target_max: num(form.get("target_max")),
      sources,
      owner_id: viewer,
      from_catalog_id: num(form.get("from_catalog_id")),
      workspace_id: ws,
    })
    .select()
    .single();
  if (metric) await recordVersion("metric", metric.id, viewer, { message: metric.from_catalog_id ? "Created from the Metric Catalog" : "Created" });
  if (metric && submitters.length) {
    await db.from("tokens").insert(
      // A Token code opens the submission form without signing in: random, never derived from names.
      submitters.map((s) => ({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: metric.id, submitter_id: s })),
    );
    // Every Submitter gets a first Prompt through their Connector, so the loop can continue right away.
    for (const s of submitters) await deliverPrompt({ metricId: metric.id, submitterId: s, senderId: viewer });
  }
  revalidatePath("/", "layout");
  redirect(`/metrics/${slug}?created=1`);
}

export async function simulateMessage(input: { source: SourceId; sender: string; text: string; promptId?: number }): Promise<IntakeResult> {
  // Playing someone on an outside channel is only for the demo, and only reaches the demo's people and Metrics.
  if (!(await isDemo())) forbidden();
  const r = await intake({ ...input, workspaceId: DEMO_WORKSPACE_ID });
  revalidatePath("/", "layout");
  return r;
}

export async function submitWebForm(code: string, form: FormData) {
  // A breakdown travels as "label value" lines; a filled-in total joins them as a Total line.
  const value = String(form.get("value") ?? "").trim();
  const breakdown = String(form.get("breakdown") ?? "").trim();
  const text = breakdown ? `${breakdown}${value ? `\nTotal ${value}` : ""}` : value;
  const r = await intake({ source: "web_form", sender: code, text });
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

export async function decideCorrection(messageId: number, accept: boolean) {
  const { data: msg } = await db.from("thread_messages").select("*, actions(*, metrics(owner_id))").eq("id", messageId).single();
  // Only the Metric Owner accepts or declines a Correction (GLOSSARY: Correction).
  if (!msg || msg.actions.metrics.owner_id !== (await viewerId()) || msg.correction_status !== "proposed") return;
  if (accept && msg.actions.observation_id) {
    const { data: obs } = await db.from("observations").select("*").eq("id", msg.actions.observation_id).single();
    await db
      .from("observations")
      .update({ value: msg.correction_value, original_value: obs?.original_value ?? obs?.value })
      .eq("id", msg.actions.observation_id);
  }
  await db.from("thread_messages").update({ correction_status: accept ? "accepted" : "declined" }).eq("id", messageId);
  // A correction changes the value: it goes through its Workflow again, so a locked period unlocks for re-approval.
  if (accept) {
    const { data: act } = await db.from("actions").select("metric_id, period_start").eq("id", msg.action_id).single();
    if (act) {
      if (!msg.actions.observation_id) {
        await db.from("observations").insert({ metric_id: act.metric_id, period_start: act.period_start, value: msg.correction_value, submitter_id: msg.author_id, source: "web_form" });
      }
      await db.from("period_states").update({ state: "submitted" }).eq("metric_id", act.metric_id).eq("period_start", act.period_start);
      await onValue(act.metric_id, act.period_start, msg.author_id);
    }
  }
  await deliver({ kind: "decision", actionId: msg.action_id, senderId: await viewerId(), recipientId: msg.author_id, text: accept ? "accepted" : "declined" });
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
