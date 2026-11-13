import "server-only";
// Deliveries (GLOSSARY: Delivery, Delivery Preference): which Connector a message goes through, and what it says.
// PROTOTYPE: deliveries are recorded and shown in the Outbox; nothing is actually sent.
import { db } from "./db";
import { periodLabel } from "./format";
import { CONNECTORS, CONNECTOR_IDS, PREFERENCE_KIND, type ConnectorId, type DeliveryKind } from "@/connectors";
import type { Period, Profile } from "./types";

/** The ticket, email thread or chat a whole Action lives in on the other side. */
export const refFor = (actionId: number) => `ZIF-${actionId}`;

/** Where this person gets this kind of message: the same place as earlier messages about this Action, else their preference, else the team's. */
export async function connectorFor(recipientId: string, kind: DeliveryKind, actionId: number | null): Promise<ConnectorId> {
  if (actionId && PREFERENCE_KIND[kind] === "update") {
    const { data: earlier } = await db.from("deliveries").select("connector").eq("action_id", actionId).eq("recipient_id", recipientId).order("id").limit(1);
    if (earlier?.[0]) return earlier[0].connector as ConnectorId;
  }
  const [{ data: mine }, { data: teams }] = await Promise.all([
    db.from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).eq("user_id", recipientId).limit(1),
    db.from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).is("user_id", null).limit(1),
  ]);
  const own = mine?.[0]?.connector;
  const team = teams?.[0]?.connector;
  return (own ?? team ?? "email") as ConnectorId;
}

/** Sends one Delivery about an Action. Nobody gets a message about their own doing. */
export async function deliver(input: { kind: DeliveryKind; actionId: number; senderId: string; recipientId: string; text?: string; correction?: number | null; via?: ConnectorId | null }) {
  if (input.senderId === input.recipientId) return;
  const { data: a } = await db.from("actions").select("id, kind, question, period_start, due_date, metrics(name, period)").eq("id", input.actionId).single();
  if (!a) return;
  const { data: people } = await db.from("profiles").select("*").in("id", [input.senderId, input.recipientId]);
  const sender = people?.find((p) => p.id === input.senderId) as Profile | undefined;
  const recipient = people?.find((p) => p.id === input.recipientId) as Profile | undefined;
  if (!sender || !recipient) return;
  const via = input.via && CONNECTOR_IDS.includes(input.via) ? input.via : await connectorFor(recipient.id, input.kind, a.id);
  const c = CONNECTORS[via];
  const metric = a.metrics as unknown as { name: string; period: Period };
  const ref = refFor(a.id);
  const { subject, body } = c.render({
    kind: input.kind,
    action: { id: a.id, kind: a.kind, question: a.question, metric: metric.name, period: periodLabel(a.period_start, metric.period), due: a.due_date },
    sender, recipient, text: input.text, correction: input.correction == null ? null : String(input.correction),
    link: `/actions/${a.id}`, ref,
  });
  await db.from("deliveries").insert({
    connector: via, recipient_id: recipient.id, sender_id: sender.id, kind: input.kind, action_id: a.id,
    subject, body, external_ref: via === "tickets" ? ref : null,
  });
}
