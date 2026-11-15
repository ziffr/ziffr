"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentActor, DEMO_WORKSPACE_ID, VIEWER_COOKIE } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { Forbidden } from "@ziffr/core/actor";
import { decideCorrection as coreDecideCorrection, submitValue, type SubmissionResult } from "@ziffr/core/submissions";
import * as questions from "@ziffr/core/questions";
import { simulateMessage as simulateChannelMessage } from "@ziffr/core/demo-channels";
import { createMetric as coreCreateMetric } from "@ziffr/core/metrics";
import { seedDemoSnapshots } from "@ziffr/core/demo-snapshots";
import type { SourceId } from "@ziffr/core/types";

// Thin calls into the core, which checks who acts and in which Workspace. Demo Mode's "view as" and reset live here.

export async function setViewer(id: string) {
  // "View as" only exists in the demo, and only for its own made-up people; elsewhere identity comes from signing in.
  if (!(await isDemo())) throw new Error("Not available.");
  const { data: demoPerson } = await db.from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("user_id", String(id)).maybeSingle();
  if (!demoPerson) throw new Forbidden();
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
  // Snapshots keep values the database cannot compute in SQL, so the core takes them after the reset (spec 0013).
  await seedDemoSnapshots();
  revalidatePath("/", "layout");
  redirect("/");
}


/** Creates a Metric from the form; the core checks the role and every field. */
export async function createMetric(form: FormData) {
  const num = (k: string) => (form.get(k) === null || form.get(k) === "" ? null : Number(form.get(k)));
  const { slug } = await coreCreateMetric(await currentActor(), {
    name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), unit: String(form.get("unit") ?? ""),
    format: String(form.get("format") ?? ""), decimals: Number(form.get("decimals") ?? 0), period: String(form.get("period") ?? ""),
    submissionRule: String(form.get("submission_rule") ?? ""), polarity: String(form.get("polarity") ?? ""), aggregation: String(form.get("aggregation") ?? ""),
    targetMin: num("target_min"), targetMax: num("target_max"), fromCatalogId: num("from_catalog_id"),
    workflowId: num("workflow_id"), duplicateOf: num("duplicate_of"),
    sources: form.getAll("sources").map(String), submitters: form.getAll("submitters").map(String),
  });
  revalidatePath("/", "layout");
  redirect(`/metrics/${slug}?created=1`);
}

/** A value sent as someone on Slack or by mail (demo only). */
export async function simulateMessage(input: { source: SourceId; sender: string; text: string; promptId?: number }): Promise<SubmissionResult> {
  const r = await simulateChannelMessage(await currentActor(), { source: input.source, sender: String(input.sender ?? ""), text: String(input.text ?? ""), promptId: input.promptId });
  revalidatePath("/", "layout");
  return r;
}

export async function submitWebForm(code: string, form: FormData) {
  // A breakdown travels as "label value" lines; a filled-in total joins them as a Total line.
  const value = String(form.get("value") ?? "").trim();
  const breakdown = String(form.get("breakdown") ?? "").trim();
  const text = breakdown ? `${breakdown}${value ? `\nTotal ${value}` : ""}` : value;
  const r = await submitValue({ source: "web_form", sender: String(code), text: text.slice(0, 5000) });
  revalidatePath("/", "layout");
  redirect(`/submit/${code}?outcome=${encodeURIComponent(r.outcome)}&detail=${encodeURIComponent(r.detail)}`);
}

/** Asks a member about a value. */
export async function createAction(input: { metricId: number; period: string; assigneeId: string; question: string }) {
  const id = await questions.ask(await currentActor(), { metricId: Number(input.metricId), period: String(input.period), assigneeId: String(input.assigneeId), text: String(input.question ?? ""), kind: "question" });
  revalidatePath("/", "layout");
  return id;
}

/** Replies in a Thread; a "Correction" field proposes a new value. */
export async function replyToAction(actionId: number, form: FormData) {
  const raw = form.get("correction");
  await questions.reply(await currentActor(), Number(actionId), String(form.get("body") ?? ""), raw === null || raw === "" ? null : Number(raw));
  revalidatePath("/", "layout");
}

/** The Metric owner accepts or declines a Correction; the core decides who may and what changes. */
export async function decideCorrection(messageId: number, accept: boolean) {
  await coreDecideCorrection(await currentActor(), Number(messageId), Boolean(accept));
  revalidatePath("/", "layout");
}

/** The asker closes or reopens an Action. */
export async function setActionStatus(actionId: number, status: "open" | "closed") {
  await questions.setActionStatus(await currentActor(), Number(actionId), status);
  revalidatePath("/", "layout");
}
