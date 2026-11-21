// Steps every Connector's send of a Delivery shares (GLOSSARY: Delivery, Connector): email (mail.ts), Slack
// (slack-send.ts) and Telegram (telegram-send.ts). Internal to the core: these check no Actor and no claim, so only a
// sender that has read the queued Delivery itself, and claimed it before it adds the link, calls them. The app never
// imports from core/internal (.github/scripts/app-db-access.mjs).
import { db } from "../db";
import { ARCHIVED_BEFORE_SENT } from "../archived-metrics";
import { visibleMetricIds } from "../access";
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
type AboutMetric = { id: number; workspace_id: string; kind: string; recipient_id?: string; alert_metric_id?: number | null; tell_workflow_id?: number | null; prompt_id?: number | null; form_token_id?: number | null; action_id?: number | null };

/** Why a Delivery must not go out because its Metric is archived (GLOSSARY: Archived Metric), or null. Checked when it
 * is sent, not only when it was queued: a Prompt checked just before the archive and queued just after, or one put
 * back in the queue after a stopped send, would otherwise still ask. Prompts by their Prompt or form link, task
 * reminders and Escalations by their task; other messages about a Metric (a question someone asks) still go. */
export async function archivedMetricHolds(d: AboutMetric): Promise<string | null> {
  const ws = d.workspace_id;
  // An Alert message (GLOSSARY: Alert) leaves only while its recipient may still see its Metric and it is in use: asked
  // again here, when it is sent, not only when it was queued (AGENTS.md rule 3). The words say nothing about which.
  if (d.kind === "alert" && d.alert_metric_id) {
    const metrics = await getMetrics(ws);
    const m = metrics.find((x) => x.id === d.alert_metric_id);
    if (!m || m.archived_at || !d.recipient_id || !(await visibleMetricIds(ws, d.recipient_id, metrics)).has(m.id)) return "Not sent.";
    // A Tell message (GLOSSARY: Tell) also stops when the person said "stop telling me" after it was queued.
    if (d.tell_workflow_id) {
      const { data: stopped } = await db().from("tell_stops").select("person_id").eq("workflow_id", d.tell_workflow_id).eq("person_id", d.recipient_id).eq("workspace_id", ws).maybeSingle();
      if (stopped) return "Not sent: the person asked not to be told by this Workflow.";
    }
    return null;
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
