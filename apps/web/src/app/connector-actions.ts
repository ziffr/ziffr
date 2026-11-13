"use server";
// Connectors (GLOSSARY: Connector, Delivery, Delivery Preference). PROTOTYPE: the outside side is simulated
// here: anyone can play the recipient answering in Slack, email or WhatsApp, or closing a ticket, the way
// the Sources page lets anyone play a submitter.
import { revalidatePath } from "next/cache";
import { addDays, format } from "date-fns";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { assertWorkspaceOwner, forbidden } from "@/lib/guards";
import { deliver, deliverPrompt } from "@/lib/deliveries";
import { periodStart } from "@ziffr/core/format";
import { intake } from "@/sources/intake";
import type { Period } from "@ziffr/core/types";
import { finishTask, postReply } from "@/lib/threads";
import { CONNECTORS, CONNECTOR_IDS, parseReply, type ConnectorId, type PreferenceKind } from "@/connectors";

const KINDS: PreferenceKind[] = ["question", "task", "reminder", "update"];
const done = () => revalidatePath("/", "layout");

/** A person sets their own; the team default (userId null) is the workspace owner's. null connector: follow the team. */
export async function setPreference(userId: string | null, kind: PreferenceKind, connector: ConnectorId | null) {
  const viewer = await viewerId();
  if (!KINDS.includes(kind) || (connector !== null && !CONNECTOR_IDS.includes(connector))) forbidden();
  if (userId === null) {
    await assertWorkspaceOwner(viewer);
    if (!connector) forbidden();
  } else if (userId !== viewer) forbidden();
  if (userId === null) await db.from("delivery_preferences").delete().is("user_id", null).eq("kind", kind);
  else await db.from("delivery_preferences").delete().eq("user_id", userId).eq("kind", kind);
  if (connector) await db.from("delivery_preferences").insert({ user_id: userId, kind, connector });
  done();
}

async function deliveryById(id: number) {
  const { data } = await db.from("deliveries").select("*").eq("id", id).single();
  if (!data || !data.action_id) forbidden();
  return data!;
}

/** The recipient answers where the Delivery reached them; the answer lands in the Thread. */
export async function simulateReply(deliveryId: number, text: string) {
  const d = await deliveryById(deliveryId);
  if (!CONNECTORS[d.connector as ConnectorId]?.capabilities.includes("replies")) forbidden();
  const { body, correction } = parseReply(String(text ?? "").slice(0, 2000));
  if (!body && correction === null) throw new Error("Write an answer first.");
  await postReply(d.action_id, d.recipient_id, body, correction);
  await db.from("deliveries").update({ status: "answered" }).eq("id", deliveryId);
  done();
}

/** Closing the ticket marks the task done in Ziffr. */
export async function simulateTicketClose(deliveryId: number) {
  const d = await deliveryById(deliveryId);
  if (d.connector !== "tickets") forbidden();
  const ok = await finishTask(d.action_id, d.recipient_id);
  if (!ok) throw new Error("That task is not open any more.");
  await db.from("deliveries").update({ status: "closed" }).eq("action_id", d.action_id).eq("connector", "tickets");
  done();
}

/** What a scheduler would do each morning: remind assignees of open tasks due within two days. */
export async function sendDueReminders() {
  await viewerId();
  const soon = format(addDays(new Date(), 2), "yyyy-MM-dd");
  const { data } = await db.from("actions").select("id, asker_id, assignee_id").eq("kind", "task").eq("status", "open").not("due_date", "is", null).lte("due_date", soon);
  for (const a of data ?? []) await deliver({ kind: "reminder", actionId: a.id, senderId: a.asker_id, recipientId: a.assignee_id });
  done();
  return data?.length ?? 0;
}

/** What a scheduler would do each period: ask every submitter whose value for the current period is missing. */
export async function askForMissingValues() {
  const viewer = await viewerId();
  const [{ data: tokens }, { data: metrics }] = await Promise.all([db.from("tokens").select("metric_id, submitter_id").is("stands_in_for", null), db.from("metrics").select("id, period, formula")]);
  let n = 0;
  for (const t of tokens ?? []) {
    const m = metrics?.find((x) => x.id === t.metric_id);
    if (!m || m.formula) continue;
    const period = periodStart(new Date(), m.period as Period);
    const [{ count: have }, { count: asked }] = await Promise.all([
      db.from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("period_start", period),
      db.from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("submitter_id", t.submitter_id).eq("period_start", period).is("answered_at", null).gte("sent_at", format(new Date(), "yyyy-MM-dd")),
    ]);
    if (have || asked) continue; // already there, or already asked today
    if (await deliverPrompt({ metricId: m.id, submitterId: t.submitter_id, senderId: viewer })) n++;
  }
  done();
  return n;
}

/** The submitter answers a Prompt where it reached them; the answer goes through intake and its Submission Rule. */
export async function simulatePromptAnswer(deliveryId: number, text: string) {
  const { data: d } = await db.from("deliveries").select("*, prompts(id, source)").eq("id", deliveryId).single();
  const p = d?.prompts as { id: number; source: string } | null;
  if (!d || d.kind !== "prompt" || !p || (p.source !== "slack" && p.source !== "mail")) forbidden();
  const { data: person } = await db.from("profiles").select("slack_handle, email").eq("id", d!.recipient_id).single();
  const r = await intake({ source: p!.source as "slack" | "mail", sender: p!.source === "slack" ? person!.slack_handle : person!.email, text: String(text ?? "").slice(0, 2000), promptId: p!.id });
  if (r.ok) await db.from("deliveries").update({ status: "answered" }).eq("id", deliveryId);
  done();
  return r;
}
