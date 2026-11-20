// Deliveries (GLOSSARY: Delivery, Delivery Preference, Prompt): which Connector a message goes through, and what it
// says. Every Delivery belongs to the Workspace of what it is about, and is recorded in the Outbox. Email ones are
// also sent once mail is set up (spec 0004, mail.ts), Slack ones once the workspace connects Slack (spec 0007,
// slack-send.ts); WhatsApp and tickets are still simulated.
import { feedIdsAmong } from "./feed-people";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { openNames, openRows } from "./sealed-columns";
import { CONNECTORS, CONNECTOR_IDS, PREFERENCE_KIND, type ConnectorId, type DeliveryKind } from "./connectors/index";
import { FORM_LINK, inboundEnabled, initialMailState } from "./mail";
import { initialDeliveryState, sendQueuedNow } from "./outbound";
import { settingsInEffect, type Settings } from "./settings-in-effect";
import { slackEscape } from "./connectors/slack";
import type { Period, Profile } from "./types";
import { CURRENT_PERIOD, periodLabel, periodStart } from "./periods";
import { yearStartFor } from "./fiscal-year";

/** A path in Ziffr as a link that works outside it (in an email): ZIFFR_SITE_URL in front, when it is set. */
export const linkTo = (path: string) => `${(process.env.ZIFFR_SITE_URL ?? "").replace(/\/+$/, "")}${path}`;

/** Whether a reply to a message by this Connector comes back into Ziffr. Real email does once inbound mail is set up
 * (spec 0004, ticket #73); until then a sent email says to answer in Ziffr, so no reply is lost. */
const repliesReturn = (via: ConnectorId, workspaceId: string, settings: Settings) => via !== "email" || initialMailState(via, workspaceId, settings) === "outbox" || inboundEnabled(settings);

/** The ticket, email thread or chat a whole Action lives in on the other side. */
export const refFor = (actionId: number) => `ZIF-${actionId}`;

/** Where this person gets this kind of message: the same place as earlier messages about this Action, else their preference, else the team's. */
export async function connectorFor(ws: string, recipientId: string, kind: DeliveryKind, actionId: number | null): Promise<ConnectorId> {
  if (actionId && PREFERENCE_KIND[kind] === "update") {
    const { data: earlier } = await db().from("deliveries").select("connector").eq("action_id", actionId).eq("recipient_id", recipientId).order("id").limit(1);
    if (earlier?.[0]) return earlier[0].connector as ConnectorId;
  }
  // Preferences are per workspace: the same person may want Slack in one team and email in another.
  const [{ data: mine }, { data: teams }] = await Promise.all([
    db().from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).eq("user_id", recipientId).eq("workspace_id", ws).limit(1),
    db().from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).is("user_id", null).eq("workspace_id", ws).limit(1),
  ]);
  const own = mine?.[0]?.connector;
  const team = teams?.[0]?.connector;
  return (own ?? team ?? "email") as ConnectorId;
}

/** Sends one Delivery about an Action. Nobody gets a message about their own doing. With `queue`, an email is
 * only queued, for the deliveries job to send. */
export async function deliver(input: { kind: DeliveryKind; actionId: number; senderId: string; recipientId: string; text?: string; correction?: number | null; via?: ConnectorId | null; queue?: boolean }) {
  if (input.senderId === input.recipientId) return;
  const { data: found } = await db().from("actions").select("id, kind, question, period_start, due_date, workspace_id, metrics(name, period)").eq("id", input.actionId).single();
  if (!found) return;
  const [a] = await openRows("actions", found.workspace_id, [found]);
  // A question that does not open (changed in the database, or under a destroyed key) is not sent at all.
  if (a.question === null) return;
  const people = await openNames(a.workspace_id, (await db().from("profiles").select("*").in("id", [input.senderId, input.recipientId])).data);
  const sender = people?.find((p) => p.id === input.senderId) as Profile | undefined;
  const recipient = people?.find((p) => p.id === input.recipientId) as Profile | undefined;
  if (!sender || !recipient) return;
  const via = input.via && CONNECTOR_IDS.includes(input.via) ? input.via : await connectorFor(a.workspace_id, recipient.id, input.kind, a.id);
  const c = CONNECTORS[via];
  const metric = a.metrics as unknown as { name: string; period: Period };
  const ref = refFor(a.id);
  const { subject, body } = c.render({
    kind: input.kind,
    action: { id: a.id, kind: a.kind, question: a.question, metric: metric.name, period: periodLabel(a.period_start, metric.period, await yearStartFor(a.workspace_id, metric.period)), due: a.due_date },
    sender, recipient, text: input.text, correction: input.correction == null ? null : String(input.correction),
    link: linkTo(`/actions/${a.id}`), ref, repliesReturn: repliesReturn(via, a.workspace_id, await settingsInEffect()),
  });
  const mail_state = await initialDeliveryState(via, a.workspace_id, recipient.id);
  const { data: d } = await db().from("deliveries").insert({
    connector: via, recipient_id: recipient.id, sender_id: sender.id, kind: input.kind, action_id: a.id, workspace_id: a.workspace_id,
    subject, body, external_ref: via === "tickets" ? ref : null, mail_state,
  }).select("id").single();
  // A queued one waits for the deliveries job (sendWaiting): a run that sends many must not wait on the mail server.
  if (!input.queue) await sendQueuedNow(d?.id, mail_state, via);
}

/** Asks a submitter for a value through their reminder Connector (GLOSSARY: Prompt). Returns false if there is no Token.
 * With `queue`, an email is only queued, for the deliveries job to send. */
export async function deliverPrompt(input: { metricId: number; submitterId: string; senderId?: string | null; via?: ConnectorId | null; period?: string; note?: string; asStandIn?: boolean; queue?: boolean }) {
  // A Feed is a program (spec 0012): it is never asked, and its form link must never go out in a message.
  if ((await feedIdsAmong([input.submitterId])).size) return false;
  const [{ data: metric }, { data: person }, { data: tokens }] = await Promise.all([
    db().from("metrics").select("id, name, period, sources, formula, workspace_id, archived_at").eq("id", input.metricId).single(),
    // A Contact is reached by the details this workspace keeps for them; a member by their own.
    db().from("profiles").select("*").eq("id", input.submitterId).single().then(async (r) => {
      if (!r.data) return r;
      const { data: m } = await db().from("metrics").select("workspace_id").eq("id", input.metricId).single();
      const { data: found } = m ? await db().from("contacts").select("person_id, email, slack_handle, phone").eq("workspace_id", m.workspace_id).eq("person_id", input.submitterId).maybeSingle() : { data: null };
      if (!found || !m) return r;
      // A Contact's details and name are sealed (spec 0028).
      const [[c], [person]] = await Promise.all([openRows("contacts", m.workspace_id, [found]), openNames(m.workspace_id, [r.data])]);
      return { ...r, data: { ...person, email: c.email ?? "", slack_handle: c.slack_handle ?? "", phone: c.phone } };
    }),
    db().from("tokens").select("id, code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("metric_id", input.metricId),
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
      await db().from("tokens").update({ expires_at: expires }).eq("id", mine.id);
      token = mine;
    } else {
      const { data: created } = await db().from("tokens").insert({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: input.metricId, submitter_id: input.submitterId, stands_in_for: standsInFor, expires_at: expires }).select("id, code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").single();
      token = created ?? undefined;
    }
  }
  if (!token) return false;
  // A Derived Metric is computed and an Archived Metric asks for nothing: neither is ever prompted for.
  if (!metric || !person || !token || metric.formula || metric.archived_at) return false;
  let via = input.via && CONNECTOR_IDS.includes(input.via) ? input.via : await connectorFor(metric.workspace_id, person.id, "prompt", null);
  if (!CONNECTORS[via].renderPrompt) via = "email"; // a ticket system does not ask for numbers
  const c = CONNECTORS[via];
  // Answering in place only where the connector receives values and the metric accepts them from there.
  const answerHere = Boolean(c.sourceId && c.capabilities.includes("values") && (metric.sources as string[]).includes(c.sourceId)) && repliesReturn(via, metric.workspace_id, await settingsInEffect());
  const ys = await yearStartFor(metric.workspace_id, metric.period as Period);
  const current = periodStart(new Date(), metric.period as Period, ys);
  const period = input.period ?? current;
  const label = period !== current ? `for ${periodLabel(period, metric.period as Period, ys)}` : CURRENT_PERIOD[metric.period as Period];
  const question = `${input.note ? `${input.note} ` : ""}What’s the number for ${metric.name} ${label}?`;
  const { data: prompt } = await db().from("prompts").insert({ workspace_id: metric.workspace_id, metric_id: metric.id, submitter_id: person.id, source: answerHere ? c.sourceId : "web_form", text: question, period_start: period }).select("id").single();
  const { subject, body } = c.renderPrompt!({ recipient: person as Profile, metric: metric.name, question, period: periodLabel(period, metric.period as Period, ys), answerHere, formLink: FORM_LINK });
  const mail_state = await initialDeliveryState(via, metric.workspace_id, person.id);
  const { data: d } = await db().from("deliveries").insert({ connector: via, recipient_id: person.id, sender_id: input.senderId ?? null, kind: "prompt", prompt_id: prompt?.id ?? null, subject, body, workspace_id: metric.workspace_id, mail_state, form_token_id: token.id }).select("id").single();
  if (!input.queue) await sendQueuedNow(d?.id, mail_state, via);
  return true;
}

/** A plain notice through someone's Connector, not about a question or task (e.g. an access request). A null sender
 * is Ziffr itself, such as when an automatic Snapshot is ready to write up. */
export async function deliverNotice(ws: string, input: { recipientId: string; senderId: string | null; subject: string; text: string; link: string; via?: ConnectorId }) {
  if (input.senderId !== null && input.recipientId === input.senderId) return;
  const via = input.via ?? await connectorFor(ws, input.recipientId, "reply", null);
  const mail_state = await initialDeliveryState(via, ws, input.recipientId);
  const { data: d } = await db().from("deliveries").insert({
    connector: via, recipient_id: input.recipientId, sender_id: input.senderId, kind: "notice", workspace_id: ws,
    // A notice holds people's and things' names: on Slack they are escaped, so none can become a link or a mention.
    subject: input.subject, body: via === "slack" ? `${slackEscape(input.text)}\n<${linkTo(input.link)}|Open in Ziffr>` : `${input.text}\n${CONNECTORS[via].label === "Ticket system" ? "Ziffr" : "Open"}: ${linkTo(input.link)}`, mail_state,
  }).select("id").single();
  await sendQueuedNow(d?.id, mail_state, via);
}
