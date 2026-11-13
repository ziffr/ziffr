"use server";
// Connectors (GLOSSARY: Connector, Delivery, Delivery Preference). PROTOTYPE: the outside side is simulated
// here: anyone can play the recipient answering in Slack, email or WhatsApp, or closing a ticket, the way
// the Sources page lets anyone play a submitter.
import { revalidatePath } from "next/cache";
import { addDays, format } from "date-fns";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { assertWorkspaceOwner, forbidden } from "@/lib/guards";
import { deliver } from "@/lib/deliveries";
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
