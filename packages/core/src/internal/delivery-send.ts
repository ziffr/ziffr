// Steps every Connector's send of a Delivery shares (GLOSSARY: Delivery, Connector): email (mail.ts), Slack
// (slack-send.ts) and Telegram (telegram-send.ts). Internal to the core: these check no Actor and no claim, so only a
// sender that has read the queued Delivery itself, and claimed it before it adds the link, calls them. The app never
// imports from core/internal (.github/scripts/app-db-access.mjs).
import { maySeeTotalsNow } from "../total-parts";
import { db } from "../db";
import { ARCHIVED_BEFORE_SENT } from "../archived-metrics";
import { visibleDashboards, visibleMetricIds } from "../access";
import { getMetrics } from "../workspace-data";

/** Stands in a Prompt's stored text for the recipient's personal form link, which is added only when it is sent. */
export const FORM_LINK = "[your personal form link]";

/** Marks a queued Delivery failed for good: what never goes out, whatever the limits. One no longer queued stays as it is. */
export async function failForGood(id: number, why: string) {
  await db().from("deliveries").update({ mail_state: "failed", last_error: why }).eq("id", id).eq("mail_state", "queued");
  return "failed" as const;
}

/** A Delivery's text with the recipient's personal form link put in where FORM_LINK stands, only as it is sent, so the
 * body the Outbox shows its sender never holds the link. Without the token, the link is the site's front page. */
export async function withFormLink(body: string, d: { workspace_id: string; form_token_id: number | null }, siteUrl: string) {
  if (!body.includes(FORM_LINK)) return body;
  const { data: token } = d.form_token_id ? await db().from("tokens").select("code").eq("id", d.form_token_id).eq("workspace_id", d.workspace_id).maybeSingle() : { data: null };
  const site = siteUrl.replace(/\/+$/, "");
  return body.split(FORM_LINK).join(token ? `${site}/submit/${token.code}` : `${site}/`);
}


/** Why a Delivery of an already answered Prompt is not sent. */
export const PROMPT_ANSWERED = "Not sent: the request was answered another way first.";

/** What a Delivery is about, as far as its Metric goes. */
type AboutMetric = { id: number; workspace_id: string; kind: string; recipient_id?: string; alert_metric_id?: number | null; heads_up_metric_a?: number | null; heads_up_metric_b?: number | null; heads_up_key?: string | null; heads_up_told_id?: number | null; tell_workflow_id?: number | null; snapshot_dashboard_id?: number | null; prompt_id?: number | null; form_token_id?: number | null; action_id?: number | null; sender_id?: string | null; filled_in_observation_id?: number | null };

/** Why a message of a Workflow's (a Tell or a Checklist Item) must not go out: its recipient said "stop telling me" after it was queued. Null otherwise. */
async function toldStop(d: AboutMetric): Promise<string | null> {
  if (!d.tell_workflow_id || !d.recipient_id) return null;
  const { data: stopped } = await db().from("tell_stops").select("person_id").eq("workflow_id", d.tell_workflow_id).eq("person_id", d.recipient_id).eq("workspace_id", d.workspace_id).maybeSingle();
  return stopped ? "Not sent: the person asked not to be told by this Workflow." : null;
}

/** Why a Delivery must not go out because its Metric is archived (GLOSSARY: Archived Metric), or null. Checked when it
 * is sent, not only when it was queued: a Prompt checked just before the archive and queued just after, or one put
 * back in the queue after a stopped send, would otherwise still ask. Prompts by their Prompt or form link, task
 * reminders and Escalations by their task; other messages about a Metric (a question someone asks) still go. */
export async function archivedMetricHolds(d: AboutMetric): Promise<string | null> {
  const ws = d.workspace_id;
  // A Checklist Item's message (spec 0045) stops when the person said "stop telling me" after it was queued; it names no Metric.
  if (d.kind === "checklist") {
    // Nor does it leave for someone who has left the Workspace since it was queued.
    if (!d.recipient_id || !(await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", d.recipient_id).maybeSingle()).data) return "Not sent: the person is no longer in the Workspace.";
    // Every such message names its Workflow; the name is gone (set null) once the Workflow is deleted, and then nothing of it leaves.
    if (d.tell_workflow_id === null) return "Not sent: the Workflow was deleted.";
    // A Send Snapshot message (spec 0045) leaves only while its recipient may still open the dashboard it links to: asked
    // again here, when it is sent, not only when it was queued (rule 3).
    if (d.snapshot_dashboard_id && !(await visibleDashboards(ws, d.recipient_id)).some((x) => x.id === d.snapshot_dashboard_id)) return "Not sent.";
    return toldStop(d);
  }
  // The message that a value was entered for someone (GLOSSARY: Filled-in Value; spec 0046) leaves only while its recipient
  // still holds their own Token for the Metric, still sees it (a Contact has no sign-in and no Shares: the Token is
  // theirs) and it is in use: asked again here, when it is sent, as it was when it was queued (AGENTS.md rule 3).
  if (d.kind === "filled_in") {
    if (!d.alert_metric_id || !d.recipient_id) return "Not sent.";
    const metrics = await getMetrics(ws);
    const m = metrics.find((x) => x.id === d.alert_metric_id);
    if (!m || m.archived_at) return "Not sent.";
    const [{ data: token }, { data: member }] = await Promise.all([
      db().from("tokens").select("id").eq("workspace_id", ws).eq("metric_id", m.id).eq("submitter_id", d.recipient_id).is("stands_in_for", null).limit(1),
      db().from("memberships").select("user_id, role").eq("workspace_id", ws).eq("user_id", d.recipient_id).maybeSingle(),
    ]);
    if (!token?.length) return "Not sent.";
    if (member && !(await visibleMetricIds(ws, d.recipient_id, metrics)).has(m.id)) return "Not sent.";
    // It is about a value that still has someone who entered it (the submitter may have replaced it meanwhile), and one that
    // names who entered it does not go to someone who is a Guest by now: a Guest reads no names.
    const { data: obs } = d.filled_in_observation_id ? await db().from("observations").select("entered_by").eq("id", d.filled_in_observation_id).eq("workspace_id", ws).maybeSingle() : { data: null };
    if (!obs?.entered_by) return "Not sent.";
    if (d.sender_id && (member as { role?: string } | null)?.role === "guest") return "Not sent.";
    return null;
  }
  // An Alert message (GLOSSARY: Alert) leaves only while its recipient may still see its Metric and it is in use: asked
  // again here, when it is sent, not only when it was queued (AGENTS.md rule 3). The words say nothing about which.
  if (d.kind === "alert" && d.alert_metric_id) {
    const metrics = await getMetrics(ws);
    const m = metrics.find((x) => x.id === d.alert_metric_id);
    if (!m || m.archived_at || !d.recipient_id) return "Not sent.";
    const sight = await visibleMetricIds(ws, d.recipient_id, metrics);
    // A Total closed while the message waited tells its numbers to no one who no longer may see them.
    if (!sight.has(m.id) || !(await maySeeTotalsNow(ws, metrics, m, (id) => sight.has(id)))) return "Not sent.";
    // A Tell message (GLOSSARY: Tell) also stops when the person said "stop telling me" after it was queued.
    return toldStop(d);
  }
  // A Heads-up message (GLOSSARY: Heads-up) leaves only while its recipient may still see EVERY Metric it is about and none is
  // archived: asked again here, when it is sent (AGENTS.md rule 3). One that names no Metric does not go at all.
  if (d.kind === "heads_up") {
    const about = [d.heads_up_metric_a, d.heads_up_metric_b].filter((id): id is number => typeof id === "number");
    if (!about.length || !d.recipient_id) return "Not sent.";
    const metrics = await getMetrics(ws);
    const seen = await visibleMetricIds(ws, d.recipient_id, metrics);
    // It leaves only while the Heads-up it was made for still stands (its "told" row is open): one that ended while it waited is
    // not sent hours later. A message that does not go gives its place back by itself (a trigger on a failed Delivery).
    const { data: told } = d.heads_up_told_id ? await db().from("heads_up_told").select("id").eq("id", d.heads_up_told_id).eq("workspace_id", ws).eq("person_id", d.recipient_id).is("ended_at", null).maybeSingle() : { data: null };
    if (!told) return "Not sent.";
    if (!about.every((id) => seen.has(id) && metrics.some((m) => m.id === id && !m.archived_at && !m.inputs_withheld))) return "Not sent.";
    // The person's own choices made while it waited: switched off, a Metric muted, or this Heads-up marked Not useful.
    const [{ data: set }, { data: mutes }, { data: no }] = await Promise.all([
      db().from("heads_up_settings").select("show, by_message").eq("workspace_id", ws).eq("person_id", d.recipient_id).maybeSingle(),
      db().from("heads_up_mutes").select("metric_id").eq("workspace_id", ws).eq("person_id", d.recipient_id).in("metric_id", about),
      d.heads_up_key ? db().from("heads_up_dismissed").select("key").eq("workspace_id", ws).eq("person_id", d.recipient_id).eq("key", d.heads_up_key) : Promise.resolve({ data: [] as unknown[] }),
    ]);
    return set?.show && set?.by_message && !mutes?.length && !no?.length ? null : "Not sent.";
  }
  let metricId: number | null = null;
  if (d.kind === "prompt") {
    const [{ data: p }, { data: t }] = await Promise.all([
      d.prompt_id ? db().from("prompts").select("metric_id, answered_at").eq("id", d.prompt_id).eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null }),
      d.form_token_id ? db().from("tokens").select("metric_id").eq("id", d.form_token_id).eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    // A Prompt that goes by several ways, answered on one while another waits (quiet hours, a limit, a retry), asks no more
    // (#613): the waiting Delivery is not sent.
    if (p?.answered_at) return PROMPT_ANSWERED;
    metricId = (p?.metric_id ?? t?.metric_id ?? null) as number | null;
  } else if ((d.kind === "reminder" || d.kind === "question") && d.action_id) {
    const { data: a } = await db().from("actions").select("metric_id, kind, purpose").eq("id", d.action_id).eq("workspace_id", ws).maybeSingle();
    // A reminder of a task, or an Escalation; a person's own question about a value is theirs to send.
    if (a && (d.kind === "reminder" || a.purpose === "escalation")) metricId = a.metric_id as number | null;
  }
  if (metricId === null) return null;
  const { data: m } = await db().from("metrics").select("archived_at").eq("id", metricId).eq("workspace_id", ws).maybeSingle();
  return m?.archived_at ? ARCHIVED_BEFORE_SENT : null;
}
