import "server-only";
// Deliveries (GLOSSARY: Delivery, Delivery Preference): which Connector a message goes through, and what it says.
// PROTOTYPE: deliveries are recorded and shown in the Outbox; nothing is actually sent.
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { currentWorkspaceId } from "./viewer";
import { periodLabel, periodStart } from "@ziffr/core/format";
import { CONNECTORS, CONNECTOR_IDS, PREFERENCE_KIND, type ConnectorId, type DeliveryKind } from "@/connectors";
import type { Period, Profile } from "@ziffr/core/types";

/** The ticket, email thread or chat a whole Action lives in on the other side. */
export const refFor = (actionId: number) => `ZIF-${actionId}`;

/** Where this person gets this kind of message: the same place as earlier messages about this Action, else their preference, else the team's. */
export async function connectorFor(recipientId: string, kind: DeliveryKind, actionId: number | null): Promise<ConnectorId> {
  if (actionId && PREFERENCE_KIND[kind] === "update") {
    const { data: earlier } = await db.from("deliveries").select("connector").eq("action_id", actionId).eq("recipient_id", recipientId).order("id").limit(1);
    if (earlier?.[0]) return earlier[0].connector as ConnectorId;
  }
  // Preferences are per workspace: the same person may want Slack in one team and email in another.
  const ws = await currentWorkspaceId();
  const [{ data: mine }, { data: teams }] = await Promise.all([
    db.from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).eq("user_id", recipientId).eq("workspace_id", ws).limit(1),
    db.from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).is("user_id", null).eq("workspace_id", ws).limit(1),
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
export async function deliverPrompt(input: { metricId: number; submitterId: string; senderId?: string | null; via?: ConnectorId | null; period?: string; note?: string; asStandIn?: boolean }) {
  const [{ data: metric }, { data: person }, { data: tokens }] = await Promise.all([
    db.from("metrics").select("id, name, period, sources, formula").eq("id", input.metricId).single(),
    db.from("profiles").select("*").eq("id", input.submitterId).single(),
    db.from("tokens").select("id, code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("metric_id", input.metricId),
  ]);
  // The person's own Token. A Stand-in gets one of their own, marked as standing in: never the submitter's.
  // Asking a stand-in (re)opens their own Token for 14 days; it lapses as soon as they stop being the stand-in.
  const expires = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  let token = tokens?.find((t) => t.submitter_id === input.submitterId && !t.stands_in_for);
  if (!token) {
    const standsInFor = tokens?.find((t) => t.stand_in_id === input.submitterId && !t.stands_in_for)?.submitter_id;
    if (!standsInFor) return false;
    const mine = tokens?.find((t) => t.submitter_id === input.submitterId && t.stands_in_for === standsInFor);
    if (mine) {
      await db.from("tokens").update({ expires_at: expires }).eq("id", mine.id);
      token = mine;
    } else {
      const { data: created } = await db.from("tokens").insert({ code: `tk-${input.submitterId}-${randomUUID().slice(0, 8)}`, metric_id: input.metricId, submitter_id: input.submitterId, stands_in_for: standsInFor, expires_at: expires }).select("id, code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").single();
      token = created ?? undefined;
    }
  }
  if (!token) return false;
  if (!metric || !person || !token || metric.formula) return false;
  let via = input.via && CONNECTOR_IDS.includes(input.via) ? input.via : await connectorFor(person.id, "prompt", null);
  if (!CONNECTORS[via].renderPrompt) via = "email"; // a ticket system does not ask for numbers
  const c = CONNECTORS[via];
  // Answering in place only where the connector receives values and the metric accepts them from there.
  const answerHere = Boolean(c.sourceId && c.capabilities.includes("values") && (metric.sources as string[]).includes(c.sourceId));
  const current = periodStart(new Date(), metric.period as Period);
  const period = input.period ?? current;
  const label = period !== current ? `for ${periodLabel(period, metric.period as Period)}` : metric.period === "day" ? "today" : metric.period === "week" ? "this week" : "this month";
  const question = `${input.note ? `${input.note} ` : ""}What’s the number for ${metric.name} ${label}?`;
  const { data: prompt } = await db.from("prompts").insert({ metric_id: metric.id, submitter_id: person.id, source: answerHere ? c.sourceId : "web_form", text: question, period_start: period }).select("id").single();
  const { subject, body } = c.renderPrompt!({ recipient: person as Profile, metric: metric.name, question, period: periodLabel(period, metric.period as Period), answerHere, formLink: `/submit/${token.code}` });
  await db.from("deliveries").insert({ connector: via, recipient_id: person.id, sender_id: input.senderId ?? null, kind: "prompt", prompt_id: prompt?.id ?? null, subject, body });
  return true;
}

/** A plain notice through someone's Connector, not about a question or task (e.g. an access request). */
export async function deliverNotice(input: { recipientId: string; senderId: string; subject: string; text: string; link: string }) {
  if (input.recipientId === input.senderId) return;
  const via = await connectorFor(input.recipientId, "reply", null);
  await db.from("deliveries").insert({
    connector: via, recipient_id: input.recipientId, sender_id: input.senderId, kind: "notice", workspace_id: await currentWorkspaceId(),
    subject: input.subject, body: `${input.text}\n${CONNECTORS[via].label === "Ticket system" ? "Ziffr" : "Open"}: ${input.link}`,
  });
}
