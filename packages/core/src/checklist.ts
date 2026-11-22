// Checklist Items (GLOSSARY: Checklist Item, Workflow, Tell, Quiet Hours, Group, Guest; spec 0045, ticket #791): the
// second loop of the Workflow engine, which works once per Workflow and period instead of once per Metric. An item
// for information goes, on its working day after the period ends, to the people and Groups its owner named, each
// through their own way of being reached and waiting out their Quiet Hours; a step that has gone for a period never
// goes again (the claim in workflow_step_runs, made before anything is sent). What it sends is the owner's own text
// and a link; no value and no Metric name.
// Security (AGENTS.md rule 3): recipients are members of the Workspace with a sign-in, never Contacts or Feeds, and
// never those who said "stop telling me" (tellRecipients); a Guest's message names no one else (deliverPlain). What the
// Workflow page and its timeline show of an item's words is decided in `mayReadItem`: its owner, those it is sent to or
// given to, and everyone but a Guest, or only a Group's people when the item names a `readGroup`.
import { addWorkingDays } from "./workflow-rules";
import { infoItems, mayReadItem, workflowPeriod, type InfoItem } from "./checklist-rules";
import { db } from "./db";
import { deliverChecklist, deliverNotice } from "./deliveries";
import { getGroups } from "./access";
import { effectiveLimit } from "./limits";
import { sendingLimit } from "./sending-limit";
import { periodEnd, periodLabel, type YearStart } from "./periods";
import { tellRecipients } from "./tell-firing";
import { guestWorkflowIds } from "./period-timeline";
import type { Actor } from "./actor";
import type { ChecklistItem, Metric, Workflow } from "./types";

/** The day a Workflow's "paused" note is filed under: a pause has no period. */
const PAUSE_DAY = "1970-01-01";
const PAUSE_STEP = "paused";

/** Workflows as the actor may be shown them in a browser (rule 3): of a Checklist Item, the words only where they may
 * read them, and the people it names only for the Workflow's owner, who edits them. Everything else stays as it is. */
export async function withoutChecklistWords<W extends { owner_id?: unknown; config: unknown }>(actor: Pick<Actor, "workspaceId" | "personId" | "role">, workflows: W[]): Promise<W[]> {
  if (!workflows.some((w) => ((w.config as { steps?: { type?: string }[] } | null)?.steps ?? []).some((s) => s?.type === "checklist"))) return workflows;
  const groupIds = (await getGroups(actor.workspaceId)).filter((g) => g.members.includes(actor.personId)).map((g) => g.id);
  const viewer = { id: actor.personId, role: actor.role, groupIds };
  return workflows.map((w) => {
    const config = w.config as { steps?: Record<string, unknown>[] } | null;
    if (w.owner_id === actor.personId || !config?.steps?.some((s) => s?.type === "checklist")) return w;
    const steps = config.steps.map((s) => {
      if (s?.type !== "checklist") return s;
      const item = s as unknown as ChecklistItem;
      const may = mayReadItem(item, viewer, String(w.owner_id));
      // Who it goes to is the owner's business; the rest of the Workspace sees what kind of item it is and, where it may, its words.
      const bare: Record<string, unknown> = { type: "checklist", id: item.id, kind: item.kind, text: may ? item.text : "" };
      if (item.kind === "info") Object.assign(bare, { day: item.day, people: [], groups: [] });
      else Object.assign(bare, { assignee: item.assignee === actor.personId ? item.assignee : null, dueWorkingDays: item.dueWorkingDays });
      return bare;
    });
    return { ...w, config: { ...(config as object), steps } };
  });
}

/** Why a Workflow's checklist waits, for its owner's page: its Metrics share no period. Null when nothing waits, and for anyone but the owner. */
export async function checklistPausedWhy(actor: Pick<Actor, "workspaceId" | "personId">, workflowId: number): Promise<"none" | "mixed" | null> {
  const { data: wf } = await db().from("workflows").select("id, owner_id").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!wf || wf.owner_id !== actor.personId) return null;
  const { data: used } = await db().from("workflow_step_runs").select("id").eq("workflow_id", workflowId).eq("workspace_id", actor.workspaceId).eq("kind", "paused").limit(1);
  if (!used?.length) return null;
  const { data: m } = await db().from("metrics").select("period, formula, archived_at").eq("workspace_id", actor.workspaceId).eq("workflow_id", workflowId);
  return new Set((m ?? []).filter((x) => !x.formula && !x.archived_at).map((x) => x.period)).size === 0 ? "none" : "mixed";
}

/** Claims a step of a Workflow for a period: the claim's id for the one call that may send, null for every other. */
async function claim(ws: string, workflowId: number, step: string, period: string): Promise<number | null> {
  const { data, error } = await db().rpc("claim_workflow_step", { p_workspace: ws, p_workflow: workflowId, p_step: step, p_period: period, p_kind: step === PAUSE_STEP ? "paused" : "checklist" });
  if (error) throw new Error("The step could not be claimed.");
  return (data as number | null) ?? null;
}

/** Runs the Checklist Items of one Workflow as of a day: each item for information whose day has come, once per period.
 * A Workflow whose Metrics share no period waits, and its owner is told once. Returns what happened, in words. */
export async function runChecklistItems(ws: string, wf: Workflow, metrics: Metric[], asOf: string, yearStart: YearStart): Promise<string[]> {
  const items = infoItems(wf.config.steps);
  if (!wf.config.steps.some((s) => s.type === "checklist")) return [];
  const when = workflowPeriod(metrics.filter((m) => (m as Metric & { workflow_id?: number | null }).workflow_id === wf.id), asOf, yearStart);
  if (!when.ok) {
    // Told once, until it resumes: the note's claim stays while the Metrics disagree and goes when they agree again.
    if ((await claim(ws, wf.id, PAUSE_STEP, PAUSE_DAY)) !== null) {
      await deliverNotice(ws, { recipientId: wf.owner_id, senderId: null, subject: `${wf.name}: its checklist waits`, text: `The checklist items of the Workflow ${wf.name} wait: ${when.why === "none" ? "it asks for no Metric" : "its Metrics do not all have the same period"}. They go on when its Metrics agree on a period.`, link: `/workflows?id=${wf.id}` });
    }
    return [`${wf.name}: checklist waits`];
  }
  await db().from("workflow_step_runs").delete().eq("workflow_id", wf.id).eq("workspace_id", ws).eq("kind", "paused");
  const log: string[] = [];
  const label = periodLabel(when.period, when.span, yearStart);
  const end = periodEnd(when.period, when.span);
  for (const item of items) {
    // An item that names nobody yet sends nothing and does not use up the period.
    if (!item.people.length && !item.groups.length) continue;
    if (asOf < addWorkingDays(end, item.day)) continue;
    const claimed = await claim(ws, wf.id, item.id, when.period);
    if (claimed === null) continue;
    const { sent, skipped } = await sendItem(ws, wf, item, label);
    await db().from("workflow_step_runs").update({ sent, skipped }).eq("id", claimed);
    log.push(`${wf.name}, ${label}: checklist item sent to ${sent}`);
  }
  return log;
}

/** Tells each person of an item for information, who is a member who did not say "stop telling me", within the Alerts'
 * daily limits. Returns how many were sent and how many named were not. */
async function sendItem(ws: string, wf: Workflow, item: InfoItem, label: string): Promise<{ sent: number; skipped: number }> {
  const groups = item.groups.length ? (await getGroups(ws)).filter((g) => item.groups.includes(g.id)) : [];
  const named = new Set([...item.people, ...groups.flatMap((g) => g.members)]);
  const recipients = await tellRecipients(ws, wf.id, item);
  const { data: roles } = recipients.length ? await db().from("memberships").select("user_id, role").eq("workspace_id", ws).in("user_id", recipients) : { data: [] };
  const role = new Map((roles ?? []).map((r) => [String(r.user_id), String(r.role)]));
  const text = `${item.text}\n\nFrom the Workflow ${wf.name}, for ${label}. You are told by a Workflow; stop these in Your settings.`;
  let sent = 0;
  for (const person of recipients) {
    // A Guest gets a link only where the Workflow is one they may open.
    const guestSees = role.get(person) === "guest" ? await guestWorkflowIds({ workspaceId: ws, personId: person, role: "guest" }) : null;
    const link = guestSees && !guestSees.has(wf.id) ? "/" : `/workflows?id=${wf.id}`;
    const { data: claim } = await db().rpc("claim_alert_message", { p_ws: ws, p_person: person, p_day: new Date().toISOString().slice(0, 10), p_per_person: await effectiveLimit("alertMessagesPerPerson", ws, person), p_per_workspace: await sendingLimit("alertMessagesPerWorkspace") });
    // Over a daily limit it is not sent; the Alerts' "more fired today" note is about Alerts, so it is not used here.
    if (claim !== "send") continue;
    await deliverChecklist(ws, { recipientId: person, senderId: wf.owner_id, subject: `${wf.name}: ${label}`, text, link, workflowId: wf.id });
    sent++;
  }
  return { sent, skipped: Math.max(0, named.size - sent) };
}
