import "server-only";
// Deliveries (GLOSSARY: Delivery, Delivery Preference): which Connector a message goes through, and what it says.
// PROTOTYPE: deliveries are recorded and shown in the Outbox; nothing is actually sent.
import { db } from "./db";
import { periodLabel, periodStart } from "./format";
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

/** Asks a submitter for a value through their reminder Connector (GLOSSARY: Prompt). Returns false if there is no Token. */
export async function deliverPrompt(input: { metricId: number; submitterId: string; senderId?: string | null; via?: ConnectorId | null }) {
  const [{ data: metric }, { data: person }, { data: token }] = await Promise.all([
    db.from("metrics").select("id, name, period, sources, formula").eq("id", input.metricId).single(),
    db.from("profiles").select("*").eq("id", input.submitterId).single(),
    db.from("tokens").select("code").eq("metric_id", input.metricId).eq("submitter_id", input.submitterId).maybeSingle(),
  ]);
  if (!metric || !person || !token || metric.formula) return false;
  let via = input.via && CONNECTOR_IDS.includes(input.via) ? input.via : await connectorFor(person.id, "prompt", null);
  if (!CONNECTORS[via].renderPrompt) via = "email"; // a ticket system does not ask for numbers
  const c = CONNECTORS[via];
  // Answering in place only where the connector receives values and the metric accepts them from there.
  const answerHere = Boolean(c.sourceId && c.capabilities.includes("values") && (metric.sources as string[]).includes(c.sourceId));
  const period = periodStart(new Date(), metric.period as Period);
  const label = metric.period === "day" ? "today" : metric.period === "week" ? "this week" : "this month";
  const question = `What’s the number for ${metric.name} ${label}?`;
  const { data: prompt } = await db.from("prompts").insert({ metric_id: metric.id, submitter_id: person.id, source: answerHere ? c.sourceId : "web_form", text: question, period_start: period }).select("id").single();
  const { subject, body } = c.renderPrompt!({ recipient: person as Profile, metric: metric.name, question, period: periodLabel(period, metric.period as Period), answerHere, formLink: `/submit/${token.code}` });
  await db.from("deliveries").insert({ connector: via, recipient_id: person.id, sender_id: input.senderId ?? null, kind: "prompt", prompt_id: prompt?.id ?? null, subject, body });
  return true;
}
