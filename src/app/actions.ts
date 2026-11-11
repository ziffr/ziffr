"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VIEWER_COOKIE, viewerId } from "@/lib/viewer";
import { intake, type IntakeResult } from "@/sources/intake";
import type { SourceId } from "@/lib/types";
import { periodStart } from "@/lib/format";

// PROTOTYPE: no validation beyond what keeps the demo runnable.

export async function setViewer(id: string) {
  (await cookies()).set(VIEWER_COOKIE, id, { path: "/" });
  revalidatePath("/", "layout");
}

export async function resetDemo() {
  await db.rpc("prototype_reset");
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
      target_min: num(form.get("target_min")),
      target_max: num(form.get("target_max")),
      sources,
      owner_id: viewer,
      from_catalog_id: num(form.get("from_catalog_id")),
    })
    .select()
    .single();
  const submitters = form.getAll("submitters").map(String);
  if (metric && submitters.length) {
    await db.from("tokens").insert(
      submitters.map((s) => ({ code: `tk-${s}-${slug}`, metric_id: metric.id, submitter_id: s })),
    );
    // Every Submitter on a chat/mail Source gets a first Prompt, so the loop can continue right away.
    const promptSource = sources.find((s) => s !== "web_form");
    if (promptSource) {
      const label = metric.period === "day" ? "today" : metric.period === "week" ? "this week" : "this month";
      await db.from("prompts").insert(
        submitters.map((s) => ({
          metric_id: metric.id,
          submitter_id: s,
          source: promptSource,
          text: `What’s the ${name.toLowerCase()} for ${label}?`,
          period_start: periodStart(new Date(), metric.period),
        })),
      );
    }
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
  const r = await intake({ source: "web_form", sender: code, text: String(form.get("value")) });
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
  revalidatePath("/", "layout");
  return data?.id as number;
}

export async function replyToAction(actionId: number, form: FormData) {
  const viewer = await viewerId();
  const correction = num(form.get("correction"));
  const body = String(form.get("body") ?? "").trim();
  await db.from("thread_messages").insert({
    action_id: actionId,
    author_id: viewer,
    body: body || (correction !== null ? "Proposing a correction." : "…"),
    correction_value: correction,
    correction_status: correction !== null ? "proposed" : null,
  });
  const { data: action } = await db.from("actions").select("*").eq("id", actionId).single();
  // The Assignee replying moves an open Action to answered.
  if (action && action.assignee_id === viewer && action.status === "open") {
    await db.from("actions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", actionId);
  } else {
    await db.from("actions").update({ updated_at: new Date().toISOString() }).eq("id", actionId);
  }
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
  revalidatePath("/", "layout");
}

export async function setActionStatus(actionId: number, status: "open" | "closed") {
  if (status !== "open" && status !== "closed") return;
  // Only the asker closes or reopens an Action.
  await db.from("actions").update({ status, updated_at: new Date().toISOString() }).eq("id", actionId).eq("asker_id", await viewerId());
  revalidatePath("/", "layout");
}
