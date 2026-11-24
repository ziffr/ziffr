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
import { adoptSetupFirstMetric } from "@ziffr/core/setup-from-pack";
import { createDerivedMetric as coreCreateDerivedMetric } from "@ziffr/core/derived-metrics";
import { attempt } from "@/lib/action-result";
import { isActionError, type ActionError } from "@/lib/action-error";
import { LimitReached } from "@ziffr/core/workspace-limits";
import type { SourceId } from "@ziffr/core/types";

// Thin calls into the core, which checks who acts and in which Workspace. Demo Mode's "view as" lives here: it only
// chooses whose view is shown, and the demo itself cannot be changed (#271), so there is no reset.

export async function setViewer(id: string) {
  // "View as" only exists in the demo, and only for its own made-up people; elsewhere identity comes from signing in.
  if (!(await isDemo())) throw new Error("Not available.");
  const { data: demoPerson } = await db.from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("user_id", String(id)).maybeSingle();
  if (!demoPerson) throw new Forbidden();
  (await cookies()).set(VIEWER_COOKIE, id, { path: "/" });
  revalidatePath("/", "layout");
}

/** Creates a Metric from the form; the core checks the role and every field. */
export async function createMetric(form: FormData) {
  const num = (k: string) => (form.get(k) === null || form.get(k) === "" ? null : Number(form.get(k)));
  const made = await coreCreateMetric(await currentActor(), {
    name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), unit: String(form.get("unit") ?? ""), unitPosition: String(form.get("unit_position") ?? ""),
    format: String(form.get("format") ?? ""), decimals: Number(form.get("decimals") ?? 0), period: String(form.get("period") ?? ""),
    submissionRule: String(form.get("submission_rule") ?? ""), polarity: String(form.get("polarity") ?? ""), aggregation: String(form.get("aggregation") ?? ""),
    targetMin: num("target_min"), targetMax: num("target_max"), attainmentMethod: String(form.get("attainment_method") ?? ""), fromCatalogId: num("from_catalog_id"),
    workflowId: num("workflow_id"), duplicateOf: num("duplicate_of"),
    sources: form.getAll("sources").map(String), submitters: form.getAll("submitters").map(String),
  }).catch((e) => {
    // The Workspace Limit: back to the same form, which says why (the words are read there, never sent in the URL).
    if (e instanceof LimitReached) return null;
    throw e;
  });
  if (!made) {
    const back = num("duplicate_of") ? `copy=${num("duplicate_of")}` : num("from_catalog_id") ? `catalog=${num("from_catalog_id")}` : "scratch=1";
    redirect(`/metrics/new?${back}${form.get("setup") === "1" ? "&setup=1" : ""}`);
  }
  // Made with the Setup Guide's return link: the Metric becomes the guide's when it has none, and the person goes back to it.
  const fromGuide = form.get("setup") === "1";
  if (fromGuide) await adoptSetupFirstMetric(await currentActor(), made.id);
  revalidatePath("/", "layout");
  redirect(fromGuide ? "/setup?step=start" : `/metrics/${made.slug}?created=1`);
}

/** Creates a Derived Metric from the "Calculated from other Metrics" form: back to the form with the core's words
 * when it is refused (a Metric the person cannot see, a period that does not fit), else on to the new Metric. Every
 * field is checked again in the core; empty fields are left out, so the core proposes them. */
export async function createDerivedMetric(_previous: ActionError | null, form: FormData): Promise<ActionError | null> {
  const text = (k: string) => String(form.get(k) ?? "").trim() || undefined;
  const num = (k: string) => (text(k) === undefined || !Number.isFinite(Number(text(k))) ? undefined : Number(text(k)));
  const made = await attempt(async () => coreCreateDerivedMetric(await currentActor(), {
    name: String(form.get("name") ?? ""), formula: String(form.get("formula") ?? ""), description: text("description"), unit: text("unit"), decimals: num("decimals"),
    period: text("period"), polarity: text("polarity"), targetMin: num("target_min"), targetMax: num("target_max"),
  }));
  if (isActionError(made)) return made;
  revalidatePath("/", "layout");
  redirect(`/metrics/${made.slug}?created=1`);
}

/** What a value sent as someone on Slack or by mail would do (demo only); nothing is saved. */
export async function simulateMessage(input: { source: SourceId; sender: string; text: string; promptId?: number }): Promise<SubmissionResult> {
  return simulateChannelMessage(await currentActor(), { source: input.source, sender: String(input.sender ?? ""), text: String(input.text ?? ""), promptId: input.promptId });
}

/** What the form shows after a submission: the core's own words, handed back by the action, never through the URL. */
export type WebFormResult = { ok: boolean; detail: string } | null;

/** A personal form link submits a value (or a Breakdown). The result comes back to the form itself rather than in a
 * redirect's query string, so the page only ever shows text Ziffr wrote (ticket 183). */
export async function submitWebForm(code: string, _previous: WebFormResult, form: FormData): Promise<WebFormResult> {
  // A breakdown travels as "label value" lines; a filled-in total joins them as a Total line.
  const value = String(form.get("value") ?? "").trim();
  const breakdown = String(form.get("breakdown") ?? "").trim();
  const text = breakdown ? `${breakdown}${value ? `\nTotal ${value}` : ""}` : value;
  const r = await submitValue({ source: "web_form", sender: String(code), text: text.slice(0, 5000) });
  revalidatePath("/", "layout");
  return { ok: !r.outcome.startsWith("rejected"), detail: r.detail };
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
