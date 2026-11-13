"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VIEWER_COOKIE, viewerId } from "@/lib/viewer";
import { deliver, deliverPrompt } from "@/lib/deliveries";
import { postReply } from "@/lib/threads";
import { onValue } from "@/lib/workflow";
import { intake, type IntakeResult } from "@/sources/intake";
import type { SourceId } from "@ziffr/core/types";
import { recordVersion } from "@/lib/versions";

// PROTOTYPE: no validation beyond what keeps the demo runnable.

export async function setViewer(id: string) {
  (await cookies()).set(VIEWER_COOKIE, id, { path: "/" });
  revalidatePath("/", "layout");
}

export async function resetDemo() {
  await db.rpc("prototype_reset");
  await db.rpc("prototype_seed_breakdowns");
  await db.rpc("prototype_seed_comparisons");
  await db.rpc("prototype_seed_stories");
  await db.rpc("prototype_reset_decks");
  await db.rpc("prototype_seed_templates");
  await db.rpc("prototype_seed_themes");
  await db.rpc("prototype_seed_connectors");
  await db.rpc("prototype_seed_groups");
  await db.rpc("prototype_seed_workflows");
  await db.rpc("prototype_seed_memberships");
  revalidatePath("/", "layout");
  redirect("/");
}

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createMetric(form: FormData) {
  const viewer = await viewerId();
  const name = String(form.get("name"));
  let slug = slugify(name);
  const { data: clash } = await db.from("metrics").select("id").eq("slug", slug);
  if (clash?.length) slug = `${slug}-${Date.now().toString(36)}`;
  const sources = form.getAll("sources").map(String);
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
    })
    .select()
    .single();
  if (metric) await recordVersion("metric", metric.id, viewer, { message: metric.from_catalog_id ? "Created from the Metric Catalog" : "Created" });
  const submitters = form.getAll("submitters").map(String);
  if (metric && submitters.length) {
    await db.from("tokens").insert(
      submitters.map((s) => ({ code: `tk-${s}-${slug}`, metric_id: metric.id, submitter_id: s })),
    );
    // Every Submitter gets a first Prompt through their Connector, so the loop can continue right away.
    for (const s of submitters) await deliverPrompt({ metricId: metric.id, submitterId: s, senderId: viewer });
  }
  revalidatePath("/", "layout");
  redirect(`/metrics/${slug}?created=1`);
}

export async function simulateMessage(input: { source: SourceId; sender: string; text: string; promptId?: number }): Promise<IntakeResult> {
  const r = await intake(input);
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
