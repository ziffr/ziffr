// Deliveries (GLOSSARY: Delivery, Delivery Preference, Prompt): which Connector a message goes through, and what it
// says. Every Delivery belongs to the Workspace of what it is about, and is recorded in the Outbox. Email ones are
// also sent once mail is set up (spec 0004, mail.ts), Slack ones once the workspace connects Slack (spec 0007,
// slack-send.ts); WhatsApp and tickets are still simulated.
import { feedIdsAmong } from "./feed-people";
import { nameHider } from "./hide-names";
import { peopleToHide } from "./submissions";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { insertSealed, openNames, openOne, openRows } from "./sealed-columns";
import { CONNECTORS, CONNECTOR_IDS, PREFERENCE_KIND, type ConnectorId, type DeliveryKind } from "./connectors/index";
import { FORM_LINK, inboundEnabled, initialMailState } from "./mail";
import { appendedLink, unlinked } from "./mail-links";
import { initialDeliveryState, sendQueuedNow } from "./outbound";
import { holdFor } from "./quiet-hours";
import { planPrompt } from "./prompt-reach";
import { NOT_SENT, notSentReason, PROMPT_WAYS } from "./prompt-route";
import { settingsInEffect, type Settings } from "./settings-in-effect";
import { slackEscape } from "./connectors/slack";
import type { Period, Profile, SourceId } from "./types";
import { CURRENT_PERIOD, periodLabel, periodStart } from "./periods";
import { yearStartFor } from "./fiscal-year";
import { announceNewAction } from "./action-state";
import { checklistAbout } from "./checklist-about";
import { FROM_APP, type ChangeSource } from "./webhook-events";

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
  return (await waysFor(ws, recipientId, kind))[0];
}

/** The ways this person gets this kind of message, in their order: their own list, else the team's, else email. Only
 * Prompts go by more than one (GLOSSARY: Delivery Preference); every other kind has one way. Preferences are per
 * workspace: the same person may want Slack in one team and email in another. */
export async function waysFor(ws: string, recipientId: string, kind: DeliveryKind): Promise<ConnectorId[]> {
  const [{ data: mine }, { data: teams }] = await Promise.all([
    db().from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).eq("user_id", recipientId).eq("workspace_id", ws).order("position"),
    db().from("delivery_preferences").select("connector").eq("kind", PREFERENCE_KIND[kind]).is("user_id", null).eq("workspace_id", ws).order("position"),
  ]);
  const list = (mine?.length ? mine : teams ?? []).map((r) => r.connector as ConnectorId);
  // Nobody has chosen, and the team has not either: a Prompt goes by every way that reaches the person (prompt-route.ts
  // leaves out what the Metric refuses or what does not reach them), so connecting Slack or Telegram adds it by itself.
  return list.length ? list : kind === "prompt" ? [...PROMPT_WAYS] : ["email"];
}

/** Makes one Delivery. A Prompt, reminder or Alert that will be sent while its recipient is in quiet hours (GLOSSARY:
 * Quiet Hours) is given a `not_before` at their end, so the sending queue holds it until then and never drops it; this is
 * the one place quiet hours are checked. Says whether it is held, so the caller does not send it at once. */
async function insertDelivery(ws: string, row: { recipient_id: string; kind: string; mail_state: string } & Record<string, unknown>, holdAs: string = row.kind): Promise<{ id: number | undefined; held: boolean }> {
  const until = row.mail_state === "queued" ? await holdFor(ws, row.recipient_id, holdAs) : null;
  const [d] = await insertSealed("deliveries", ws, [until ? { ...row, not_before: until.toISOString() } : row]) as { id: number }[];
  return { id: d?.id, held: until !== null };
}

/** Sends one Delivery about an Action. Nobody gets a message about their own doing. With `queue`, an email is
 * only queued, for the deliveries job to send. */
export async function deliver(input: { kind: DeliveryKind; actionId: number; senderId: string; recipientId: string; text?: string; correction?: number | null; via?: ConnectorId | null; queue?: boolean; source?: ChangeSource }) {
  // A Task or Question given to someone is also told to the Webhooks, even to oneself: it is in the Workspace either way.
  if (input.kind === "question" || input.kind === "task") await announceNewAction(input.actionId, input.source ?? FROM_APP);
  if (input.senderId === input.recipientId) return;
  const { data: found } = await db().from("actions").select("id, kind, question, period_start, due_date, workspace_id, metric_id, workflow_id").eq("id", input.actionId).single();
  if (!found) return;
  const [a] = await openRows("actions", found.workspace_id, [found]);
  // A question that does not open (changed in the database, or under a destroyed key) is not sent at all.
  if (a.question === null) return;
  const people = await openNames(a.workspace_id, (await db().from("profiles").select("*").in("id", [input.senderId, input.recipientId])).data);
  const named = people?.find((p) => p.id === input.senderId) as Profile | undefined;
  const recipient = people?.find((p) => p.id === input.recipientId) as Profile | undefined;
  if (!named || !recipient) return;
  // A Guest does not see who else is in the Workspace (GLOSSARY: Guest), also not in what is sent to them: the message,
  // as written and kept, reads "Someone" for the sender.
  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", a.workspace_id).eq("user_id", recipient.id).maybeSingle();
  const sender: Profile = member?.role === "guest" ? { ...named, name: "Someone" } : named;
  const via = input.via && CONNECTOR_IDS.includes(input.via) ? input.via : await connectorFor(a.workspace_id, recipient.id, input.kind, a.id);
  const c = CONNECTORS[via];
  // The Metric's name is sealed, so it is read on its own and opened rather than embedded in the Action. A Checklist Task
  // (spec 0045) has no Metric: it is about its Workflow and period, and the message says so where a Metric's name would be.
  let about: { name: string; period: string };
  if (a.metric_id === null) {
    const w = (await checklistAbout(a.workspace_id, [{ workflow_id: a.workflow_id, period_start: a.period_start }]))(a.workflow_id, a.period_start);
    if (!w.workflow) return;
    about = { name: w.workflow.name, period: w.period };
  } else {
    const metric = await openOne("metrics", a.workspace_id, (await db().from("metrics").select("id, name, period").eq("id", a.metric_id).eq("workspace_id", a.workspace_id).maybeSingle()).data) as { name: string; period: Period } | null;
    if (!metric) return;
    about = { name: metric.name, period: periodLabel(a.period_start, metric.period, await yearStartFor(a.workspace_id, metric.period)) };
  }
  const ref = refFor(a.id);
  const { subject, body } = c.render({
    kind: input.kind,
    action: { id: a.id, kind: a.kind, question: a.question, metric: about.name, period: about.period, due: a.due_date },
    sender, recipient, text: input.text, correction: input.correction == null ? null : String(input.correction),
    link: linkTo(`/actions/${a.id}`), ref, repliesReturn: repliesReturn(via, a.workspace_id, await settingsInEffect()),
  });
  const mail_state = await initialDeliveryState(via, a.workspace_id, recipient.id);
  const d = await insertDelivery(a.workspace_id, {
    connector: via, recipient_id: recipient.id, sender_id: sender.id, kind: input.kind, action_id: a.id,
    subject, body, external_ref: via === "tickets" ? ref : null, mail_state,
  });
  // A queued one waits for the deliveries job (sendWaiting): a run that sends many must not wait on the mail server.
  if (!input.queue && !d.held) await sendQueuedNow(d.id, mail_state, via);
}

/** What became of a Prompt: the Connector it went through, and whether it left Ziffr (sent), waits to (queued), or
 * stays in the Outbox because that Connector does not really send here (outbox), or failed. */
export type PromptOutcome = { connector: ConnectorId; state: "sent" | "queued" | "outbox" | "failed"; /** Whether it went the way the person chose (else the first way the Metric allows that reaches them). */ chosen: boolean; /** Why it was not sent, when no allowed way reaches them. */ notSent?: string };

/** Asks a submitter for a value through their reminder Connector (GLOSSARY: Prompt). Returns false if nobody was asked
 * (no Token, a Feed, a Derived or Archived Metric), else what became of the Prompt, read back after sending.
 * With `queue`, an email is only queued, for the deliveries job to send. */
export async function deliverPrompt(input: { metricId: number; submitterId: string; senderId?: string | null; via?: ConnectorId | null; period?: string; note?: string; /** Ziffr asks `submitterId` in this person's place: the Prompt is a Stand-in's, whatever other Tokens they hold (spec 0046). */ standingInFor?: string; queue?: boolean; /** A reminder goes only by the first of the person's ways, so several ways never ping three times. */ reminder?: boolean }): Promise<false | PromptOutcome> {
  // A Feed is a program (spec 0012): it is never asked, and its form link must never go out in a message.
  if ((await feedIdsAmong([input.submitterId])).size) return false;
  const [{ data: metricRow }, { data: person }, { data: tokens }] = await Promise.all([
    db().from("metrics").select("id, name, slug, owner_id, period, sources, formula, workspace_id, archived_at").eq("id", input.metricId).single(),
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
  // Asked in someone's place: only while they are that person's Stand-in, and by the Stand-in's Token, even when they
  // hold one of their own for the Metric (the answer then records under the right name, spec 0046).
  if (input.standingInFor && !tokens?.some((t) => t.submitter_id === input.standingInFor && t.stand_in_id === input.submitterId && !t.stands_in_for)) return false;
  let token = input.standingInFor ? undefined : tokens?.find((t) => t.submitter_id === input.submitterId && !t.stands_in_for);
  // Whom the Prompt stands in for, remembered on it: the answer is recorded for them, never guessed from the Tokens.
  let promptStandsInFor: string | null = null;
  if (!token) {
    const standsInFor = input.standingInFor ?? tokens?.find((t) => t.stand_in_id === input.submitterId && !t.stands_in_for)?.submitter_id;
    if (!standsInFor) return false;
    promptStandsInFor = standsInFor;
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
  // The Metric's name is sealed (ticket #248).
  const metric = await openOne("metrics", metricRow?.workspace_id ?? "", metricRow);
  // A Derived Metric is computed and an Archived Metric asks for nothing: neither is ever prompted for.
  if (!metric || !person || !token || metric.formula || metric.archived_at) return false;
  const ys = await yearStartFor(metric.workspace_id, metric.period as Period);
  const current = periodStart(new Date(), metric.period as Period, ys);
  const period = input.period ?? current;
  const label = period !== current ? `for ${periodLabel(period, metric.period as Period, ys)}` : CURRENT_PERIOD[metric.period as Period];
  const question = `${input.note ? `${input.note} ` : ""}What’s the number for ${metric.name} ${label}?`;
  // The person's chosen ways count only where the Metric accepts answers; else the first way both allow that reaches
  // them (prompt-route.ts). With none, the Prompt waits in the Outbox and the owner is told, never sent elsewhere.
  // An explicit way (ask me now) is one way; the person's list is every way they chose, at once.
  const chosen = input.via && CONNECTOR_IDS.includes(input.via) ? [input.via] : await waysFor(metric.workspace_id, person.id, "prompt");
  const accepts = metric.sources as SourceId[];
  const plan = await planPrompt(metric.workspace_id, person.id, accepts, chosen, true);
  if (!plan.routes.length) return keepNotSent({ metric: { id: metric.id, name: metric.name, slug: metric.slug as string, ownerId: metric.owner_id as string, workspaceId: metric.workspace_id }, person: person as Profile, tokenId: token.id, chosen: chosen[0], question, reason: notSentReason(accepts, plan.mailReplies, plan.reach) });
  // A reminder goes only by the first way; the first Prompt, by all of them.
  const routes = input.reminder ? plan.routes.slice(0, 1) : plan.routes;
  const answersBy = (r: (typeof routes)[number]): string => (r.answerHere ? CONNECTORS[r.via].sourceId ?? "web_form" : "web_form");
  // One Prompt however many ways it goes by, so the first answer on any of them closes it for all (prompt-ways.ts).
  // The question names the Metric, so it is sealed with the Workspace Key (spec 0028).
  const [prompt] = await insertSealed("prompts", metric.workspace_id, [{ metric_id: metric.id, submitter_id: person.id, source: answersBy(routes[0]), text: question, period_start: period, stands_in_for: promptStandsInFor }]) as { id: number }[];
  let first: PromptOutcome | null = null;
  for (const route of routes) {
    const via: ConnectorId = route.via;
    const c = CONNECTORS[via];
    const { subject, body } = c.renderPrompt!({ recipient: person as Profile, metric: metric.name, question, period: periodLabel(period, metric.period as Period, ys), answerHere: route.answerHere, formLink: route.formLink ? FORM_LINK : "" });
    const mail_state = await initialDeliveryState(via, metric.workspace_id, person.id);
    const d = await insertDelivery(metric.workspace_id, { connector: via, recipient_id: person.id, sender_id: input.senderId ?? null, kind: "prompt", prompt_id: prompt?.id ?? null, subject, body, mail_state, form_token_id: token.id, answer_source: answersBy(route) });
    if (!input.queue && !d.held) await sendQueuedNow(d.id, mail_state, via);
    // What really happened is read back: a send that failed leaves the Delivery in another state than it started in.
    const now = d.id && mail_state === "queued" && !input.queue && !d.held ? (await db().from("deliveries").select("mail_state").eq("id", d.id).maybeSingle()).data?.mail_state : mail_state;
    first ??= { connector: via, chosen: route.chosen, state: (now === "sending" ? "queued" : ["sent", "queued", "outbox", "failed"].includes(now) ? now : mail_state) as PromptOutcome["state"] };
  }
  return first!;
}

/** A Prompt no allowed way reaches the person with: one Delivery that stays in the Outbox as "Not sent: …" (the reason
 * holds no names: Metric names are sealed), and the Metric's owner told, once until a Prompt goes again. It carries no
 * form link and no Prompt, so nothing can be answered from it; it is tied to the Metric by the person's Token only. */
async function keepNotSent(n: { metric: { id: number; name: string; slug: string; ownerId: string; workspaceId: string }; person: Profile; tokenId: number; chosen: ConnectorId; question: string; reason: string }): Promise<PromptOutcome> {
  const ws = n.metric.workspaceId;
  const connector: ConnectorId = CONNECTORS[n.chosen].renderPrompt ? n.chosen : "email";
  const { data: last } = await db().from("deliveries").select("last_error").eq("workspace_id", ws).eq("recipient_id", n.person.id).eq("kind", "prompt").eq("form_token_id", n.tokenId).order("id", { ascending: false }).limit(1);
  const told = String(last?.[0]?.last_error ?? "").startsWith(NOT_SENT);
  await insertSealed("deliveries", ws, [{ connector, recipient_id: n.person.id, sender_id: null, kind: "prompt", prompt_id: null, subject: `${n.metric.name}: not sent`, body: n.question, mail_state: "outbox", form_token_id: n.tokenId, last_error: n.reason }]);
  if (!told) await deliverNotice(ws, { recipientId: n.metric.ownerId, senderId: null, subject: `${n.person.name} was not asked for ${n.metric.name}`, text: `${n.person.name} was not asked for ${n.metric.name}, and the request waits in the Outbox. ${n.reason}`, link: `/metrics/${n.metric.slug}` });
  return { connector, chosen: false, state: "outbox", notSent: n.reason };
}

/** A plain notice through someone's Connector, not about a question or task (e.g. an access request). A null sender
 * is Ziffr itself, such as when an automatic Snapshot is ready to write up. */
export async function deliverNotice(ws: string, input: { recipientId: string; senderId: string | null; subject: string; text: string; /** Null for a message with nothing to open. */ link: string | null; via?: ConnectorId; /** Waits for the recipient's Quiet Hours to end, as a reminder does. */ quiet?: boolean }) {
  if (input.senderId !== null && input.recipientId === input.senderId) return;
  await deliverPlain(ws, "notice", input);
}

/** A notice from Ziffr itself by email, whatever the person's Delivery Preference, sent at once when email goes out here
 * (with `queue`, by the deliveries job). Returns the Delivery's id, so the caller can say what became of it. `ref` marks
 * what kind of notice it is (the external reference). */
export async function deliverEmailNotice(ws: string, input: { recipientId: string; subject: string; text: string; link: string | null; ref?: string; queue?: boolean }): Promise<number | null> {
  return deliverPlain(ws, "notice", { ...input, senderId: null, via: "email" });
}

/** An Alert's message (GLOSSARY: Alert) through the person's Connector: the same path as a notice, with its own kind so
 * that nothing can answer it. It has no Action, no Prompt and no reference, and the email carries no reply address
 * (mail.ts), so a reply to it records nothing (reply-routing.ts). Returns the Delivery's id. The caller has checked, a
 * moment before, that the person may still see the Metric; `text` holds nothing of any other Metric. */
export async function deliverAlert(ws: string, input: { recipientId: string; subject: string; text: string; link: string; via?: ConnectorId; metricId: number | null; alertId: number | null; tellWorkflowId?: number }): Promise<number | null> {
  return deliverPlain(ws, "alert", { ...input, senderId: null, alertMetricId: input.metricId, alertId: input.alertId, tellWorkflowId: input.tellWorkflowId, queue: true });
}

/** A Heads-up's message (GLOSSARY: Heads-up) through the person's Connector, by their Delivery Preference for updates: the same
 * path as an Alert, with its own kind, so nothing can answer it. It is about one or two Metrics, named here so that it is checked
 * again at the moment it leaves: the person must still see ALL of them (internal/delivery-send.ts). The caller has checked, a
 * moment before, that they do, and `text` holds nothing of any Metric the person may not see. Returns the Delivery's id. */
export async function deliverHeadsUp(ws: string, input: { recipientId: string; subject: string; text: string; link: string; metricIds: readonly [number] | readonly [number, number]; key: string; toldId: number }): Promise<number | null> {
  return deliverPlain(ws, "heads_up", { recipientId: input.recipientId, senderId: null, subject: input.subject, text: input.text, link: input.link, headsUpMetrics: input.metricIds, headsUpKey: input.key, headsUpToldId: input.toldId, queue: true });
}

/** A Checklist Item's message (GLOSSARY: Checklist Item; spec 0045) from its Workflow's owner, through the person's
 * Connector: a plain message of its own kind that waits out Quiet Hours and that nothing can answer (no reply address,
 * as for an Alert). `tell_workflow_id` names the Workflow whose "stop telling me" applies to it. `text` is the owner's
 * words and a link; it holds no value and no Metric name. Returns the Delivery's id. */
export async function deliverChecklist(ws: string, input: { recipientId: string; senderId: string; subject: string; text: string; link: string; workflowId: number; /** The dashboard the link opens: checked again when the message leaves. */ dashboardId?: number }): Promise<number | null> {
  return deliverPlain(ws, "checklist", { recipientId: input.recipientId, senderId: input.senderId, subject: input.subject, text: input.text, link: input.link, tellWorkflowId: input.workflowId, snapshotDashboardId: input.dashboardId, queue: true });
}

/** The message that tells a submitter someone entered a value for them (GLOSSARY: Filled-in Value; spec 0046): its own kind,
 * held by Quiet Hours, never answerable. `text` holds the value and, where the recipient may read it, who entered it; it is
 * about one Metric, named here so that it is checked again at the moment it leaves (internal/delivery-send.ts). A Contact
 * has no sign-in: `formTokenId` is their own Token, whose personal form link is put in only as it is sent. */
export async function deliverFilledIn(ws: string, input: { recipientId: string; senderId: string | null; observationId: number; subject: string; text: string; link: string; metricId: number; formTokenId: number | null }): Promise<number | null> {
  return deliverPlain(ws, "filled_in", { recipientId: input.recipientId, senderId: input.senderId, filledInObservationId: input.observationId, subject: input.subject, text: input.text, link: input.link, alertMetricId: input.metricId, formTokenId: input.formTokenId, queue: true });
}

/** A Test Message (GLOSSARY: Test Message; spec 0052) to the person themself, by the one Connector they test: its own kind, sent at
 * once, held by no Quiet Hours, never answerable (no reply address, no buttons). The recipient is the caller's own person id;
 * `text` is fixed words (test-message.ts), `keep` the reason it cannot go out when Ziffr knows that already. Returns the Delivery's id. */
export async function deliverTest(ws: string, input: { recipientId: string; subject: string; text: string; via: ConnectorId; keep?: string }): Promise<number | null> {
  return deliverPlain(ws, "test", { recipientId: input.recipientId, senderId: null, subject: input.subject, text: input.text, link: "/", via: input.via, keep: input.keep });
}

/** A Screen Link (GLOSSARY: Screen Link; spec 0055) to the person themself: a notice by email only, sent at once. The
 * recipient is the caller's own person id; `text` is fixed words and `link` a path of the fixed list (desktop-screens.ts). */
export async function deliverScreenLink(ws: string, input: { recipientId: string; subject: string; text: string; link: string; keep?: string }): Promise<number | null> {
  return deliverPlain(ws, "notice", { ...input, senderId: null, via: "email" });
}

/** The words of a plain message and its link, which comes last: a path in Ziffr, or FORM_LINK for a Contact, whose own
 * personal form link is put in only as it is sent and so is never stored. With no link, the words alone. */
export function plainBody(via: ConnectorId, text: string, link: string | null): string {
  // A message holds people's and things' names: on Slack they are escaped, so none can become a link or a mention.
  const words = via === "slack" ? slackEscape(text) : text;
  // An email's button is read from the last line (mail-links.ts, appendedLink): where Ziffr adds no link, words that
  // would pass for one there are broken.
  if (link === null) return appendedLink(words, [linkTo("")]) ? unlinked(words) : words;
  if (link === FORM_LINK) return `${words}\nOpen your form: ${FORM_LINK}`;
  if (via === "slack") return `${words}\n<${linkTo(link)}|Open in Ziffr>`;
  return `${words}\n${CONNECTORS[via].label === "Ticket system" ? "Ziffr" : "Open"}: ${linkTo(link)}`;
}

/** One plain message of a kind that is not about an Action: a notice, an Alert, a Heads-up, a Checklist Item, a Filled-in Value or a Test Message. */
async function deliverPlain(ws: string, kind: "notice" | "alert" | "heads_up" | "checklist" | "filled_in" | "test", input: { keep?: string; recipientId: string; senderId: string | null; subject: string; text: string; link: string | null; via?: ConnectorId; quiet?: boolean; alertMetricId?: number | null; alertId?: number | null; tellWorkflowId?: number; snapshotDashboardId?: number; queue?: boolean; ref?: string; headsUpMetrics?: readonly number[]; headsUpKey?: string; headsUpToldId?: number; formTokenId?: number | null; filledInObservationId?: number }): Promise<number | null> {
  const via = input.via ?? await connectorFor(ws, input.recipientId, "reply", null);
  // A Guest does not see who else is in the Workspace: a notice's text names no one else to them.
  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", input.recipientId).maybeSingle();
  if (member?.role === "guest") {
    const hide = nameHider((await peopleToHide(ws)).filter((p) => p.id !== input.recipientId));
    input = { ...input, subject: hide(input.subject), text: hide(input.text) };
  }
  // `keep`: Ziffr already knows this one cannot go out, so it stays in the Outbox with that reason (a Test Message to a way not set up).
  const mail_state = input.keep ? "outbox" : await initialDeliveryState(via, ws, input.recipientId);
  const d = await insertDelivery(ws, {
    last_error: input.keep ?? null, external_ref: input.ref ?? null,
    connector: via, recipient_id: input.recipientId, sender_id: input.senderId, kind,
    subject: input.subject, body: plainBody(via, input.text, input.link), mail_state, form_token_id: input.formTokenId ?? null, filled_in_observation_id: input.filledInObservationId ?? null, alert_metric_id: input.alertMetricId ?? null, alert_id: input.alertId ?? null, tell_workflow_id: input.tellWorkflowId ?? null, snapshot_dashboard_id: input.snapshotDashboardId ?? null,
    heads_up_metric_a: input.headsUpMetrics?.[0] ?? null, heads_up_metric_b: input.headsUpMetrics?.[1] ?? null, heads_up_key: input.headsUpKey ?? null, heads_up_told_id: input.headsUpToldId ?? null,
  }, input.quiet ? "reminder" : kind);
  // An Alert is only queued, for the deliveries job to send: the value that caused it must not wait on the mail server.
  if (!input.queue && !d.held) await sendQueuedNow(d.id, mail_state, via);
  return d.id ?? null;
}
