"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentActor, DEMO_WORKSPACE_ID, VIEWER_COOKIE } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { Forbidden } from "@ziffr/core/actor";
import { decideCorrection as coreDecideCorrection, type SubmissionResult } from "@ziffr/core/submissions";
import { submitFormLink } from "@ziffr/core/form-submit";
import { submitCombinedForm, type CombinedResult } from "@ziffr/core/combined-form";
import { COMBINED_MAX } from "@ziffr/core/combined-words";
import * as questions from "@ziffr/core/questions";
import { recordSimulatedMessage as recordChannelMessage, simulateMessage as simulateChannelMessage } from "@ziffr/core/demo-channels";
import { demoTextForVisit } from "@ziffr/core/demo-text";
import { demoVisitRefusal } from "@ziffr/core/demo-visit-action";
import { inDemoVisit } from "@/lib/demo-visit-action";
import { createMetric as coreCreateMetric } from "@ziffr/core/metrics";
import { adoptSetupFirstMetric } from "@ziffr/core/setup-from-pack";
import { createDerivedMetric as coreCreateDerivedMetric } from "@ziffr/core/derived-metrics";
import { attempt } from "@/lib/action-result";
import { asVisitor, attemptAsVisitor } from "@/lib/demo-write";
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
  const made = await asVisitor("actions:createMetric", async () => coreCreateMetric(await currentActor(), {
    name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), calculationNote: String(form.get("calculation_note") ?? ""), unit: String(form.get("unit") ?? ""), unitPosition: String(form.get("unit_position") ?? ""),
    format: String(form.get("format") ?? ""), decimals: Number(form.get("decimals") ?? 0), period: String(form.get("period") ?? ""),
    submissionRule: String(form.get("submission_rule") ?? ""), polarity: String(form.get("polarity") ?? ""), aggregation: String(form.get("aggregation") ?? ""),
    targetMin: num("target_min"), targetMax: num("target_max"), attainmentMethod: String(form.get("attainment_method") ?? ""), fromCatalogId: num("from_catalog_id"),
    workflowId: num("workflow_id"), duplicateOf: num("duplicate_of"),
    sources: form.getAll("sources").map(String), submitters: form.getAll("submitters").map(String),
  }).catch((e) => {
    // The Workspace Limit: back to the same form, which says why (the words are read there, never sent in the URL).
    if (e instanceof LimitReached) return null;
    throw e;
  }));
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
  const made = await attemptAsVisitor("actions:createDerivedMetric", async () => coreCreateDerivedMetric(await currentActor(), {
    name: String(form.get("name") ?? ""), formula: String(form.get("formula") ?? ""), description: text("description"), calculationNote: text("calculation_note"), unit: text("unit"), decimals: num("decimals"),
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

/** Records a value sent as someone on Slack or by mail in the demo, where visitors may change it (spec 0051): the same intake as a real
 * message, and nothing is sent. The text goes through the text rules first. Elsewhere the demo refuses it, as it always did. */
export async function recordSimulatedMessage(input: { source: SourceId; sender: string; text: string; promptId?: number }): Promise<SubmissionResult | ActionError> {
  return attempt(() => inDemoVisit("actions:recordSimulatedMessage", async (visiting) => {
    const text = demoTextForVisit(visiting, String(input.text ?? ""), "message");
    const r = await recordChannelMessage(await currentActor(), { source: input.source, sender: String(input.sender ?? ""), text, promptId: input.promptId });
    revalidatePath("/", "layout");
    return r;
  }));
}

/** What the form shows after a submission: the core's own words, handed back by the action, never through the URL.
 * `noteKept` when the note was not saved, so the field keeps its words. */
export type WebFormResult = { ok: boolean; detail: string; noteKept?: boolean } | null;

/** A personal form link submits a value (or a Breakdown), with the period picked when the form offered a list; the core
 * takes only the running period or one that still waits for this link. The result comes back to the form itself rather
 * than in a redirect's query string, so the page only ever shows text Ziffr wrote (ticket 183). */
export async function submitWebForm(code: string, _previous: WebFormResult, form: FormData): Promise<WebFormResult> {
  try {
    return await inDemoVisit("actions:submitWebForm", async (visiting) => {
      // The code is logged and shown as the sender: a visit's must be shaped like a form link's token before anything is looked up.
      if (visiting && !/^tk-[A-Za-z0-9_-]{3,64}$/.test(String(code))) return { ok: false, detail: "This form link doesn’t match any Token." };
      // A visitor's texts go through the text rules first (spec 0051). The demo keeps no notes.
      const value = demoTextForVisit(visiting, String(form.get("value") ?? "").trim(), "name");
      const breakdown = demoTextForVisit(visiting, String(form.get("breakdown") ?? "").trim(), "message");
      const period = form.get("period");
      const r = await submitFormLink(String(code), { value, breakdown, ...(period === null ? {} : { period: String(period) }), note: visiting ? undefined : form.get("note") });
      revalidatePath("/", "layout");
      const ok = !r.outcome.startsWith("rejected");
      return { ok, detail: r.detail, ...(r.valueNote?.saved === false ? { noteKept: true } : {}) };
    });
  } catch (e) {
    // What a visit's change is refused with says why on the form itself; anything else is thrown on, as it always was.
    const words = demoVisitRefusal(e);
    if (words) return { ok: false, detail: words };
    throw e;
  }
}

/** The combined form (spec 0064) sends its rows, one field of each kind for a figure, named by the figure's number in
 * the message. The code and every field come from a browser: the core checks the link and each figure. The page shows
 * only the core's own words. */
export async function submitCombinedWebForm(code: string, _previous: CombinedResult | null, form: FormData): Promise<CombinedResult> {
  const field = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const r = await submitCombinedForm(code, Array.from({ length: COMBINED_MAX }, (_, i) => ({ position: i + 1, value: field(`value-${i + 1}`), breakdown: field(`breakdown-${i + 1}`), note: field(`note-${i + 1}`) })));
  // Only after something was taken: a refused link must not redraw the page under the words that say why.
  if (Object.values(r.rows).some((row) => row.ok)) revalidatePath("/", "layout");
  return r;
}

/** Asks a member about a value. */
export async function createAction(input: { metricId: number; period: string; assigneeId: string; question: string }) {
  return asVisitor("actions:createAction", async () => {
    const id = await questions.ask(await currentActor(), { metricId: Number(input.metricId), period: String(input.period), assigneeId: String(input.assigneeId), text: String(input.question ?? ""), kind: "question" });
    revalidatePath("/", "layout");
    return id;
  });
}

/** Replies in a Thread; a "Correction" field proposes a new value. */
export async function replyToAction(actionId: number, form: FormData) {
  const raw = form.get("correction");
  await asVisitor("actions:replyToAction", async () => {
    await questions.reply(await currentActor(), Number(actionId), String(form.get("body") ?? ""), raw === null || raw === "" ? null : Number(raw));
    revalidatePath("/", "layout");
  });
}

/** The Metric owner accepts or declines a Correction; the core decides who may and what changes. */
export async function decideCorrection(messageId: number, accept: boolean) {
  await inDemoVisit("actions:decideCorrection", async () => {
    await coreDecideCorrection(await currentActor(), Number(messageId), Boolean(accept));
    revalidatePath("/", "layout");
  });
}

/** The asker closes or reopens an Action. */
export async function setActionStatus(actionId: number, status: "open" | "closed") {
  await asVisitor("actions:setActionStatus", async () => {
    await questions.setActionStatus(await currentActor(), Number(actionId), status);
    revalidatePath("/", "layout");
  });
}
