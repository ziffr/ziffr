// Send Snapshot (GLOSSARY: Send Snapshot, Finished Period, Snapshot, Workflow, Quiet Hours, Tell; spec 0045, ticket
// #793): once a Workflow's period is finished, the step takes the period's Snapshot of one dashboard as the Workflow's
// owner, shows it, and sends each person it names (and each member of the Groups it names) who may open the dashboard a
// message with a link to it, once per period (the claim in workflow_step_runs, made before anything is taken or sent).
// Which Snapshot: a shown one of the period; an automatic draft nobody has written in, shown now; another draft is
// waited for (up to MAX_WAIT_DAYS after the period ended, the owner told once); otherwise one taken now.
// Security (AGENTS.md rule 3): this is a way numbers leave the owner's hands, so it sends a LINK ONLY. The message holds
// no value, no Metric name and none of the Snapshot's words; the recipient signs in and `forReader` (snapshots.ts) shows
// them only the Metrics they may see now, as every shown Snapshot is read. Each recipient is checked at sending for
// whether they may open the dashboard (a person who may not is skipped, named only to the owner, and nothing about
// the dashboard reaches them). It never makes a Share (that would show every Metric on the dashboard) and never a View
// Link (that shows the whole Snapshot to whoever holds it). The owner must still be able to take a Snapshot of the
// dashboard now (`mayTakeSnapshot`); if not, nothing is taken and the owner is told, in words that name no dashboard.
import { addDays, format, parseISO } from "date-fns";
import type { Actor } from "./actor";
import { getShares, visibleDashboards } from "./access";
import { recordAudit } from "./audit-log";
import { workflowPeriod } from "./checklist-rules";
import { db } from "./db";
import { deliverChecklist, deliverNotice } from "./deliveries";
import { yearStartOf } from "./fiscal-year";
import { effectiveLimit } from "./limits";
import { periodEnd, shiftPeriod, type YearStart } from "./periods";
import { periodFinishedAt } from "./period-finished";
import { sendLockSummary } from "./lock-summary";
import { openNames } from "./sealed-columns";
import { sendingLimit } from "./sending-limit";
import { MAX_WAIT_DAYS } from "./auto-snapshots";
import { snapshotPeriod, type SnapshotPeriodKind } from "./snapshot-periods";
import { mayTakeSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { tellRecipients } from "./tell-firing";
import { DEMO_WORKSPACE_ID } from "./team";
import { openWorkflowRow } from "./workflow-rows";
import { TELL_PEOPLE_PER_STEP } from "./alert-limits";
import { localTime } from "./workspace-clock";
import type { Metric, Workflow, WorkflowConfig, WorkflowStep } from "./types";

type Step = Extract<WorkflowStep, { type: "send_snapshot" }>;

/** The claims a notice to the owner has, one per period (the step is one per Workflow, so the id is fixed). */
const NOTE = { wait: "snapshot-wait", failed: "snapshot-failed", lost: "snapshot-lost", day: "snapshot-day" } as const;
/** The day a note about the Workflow itself (not a period) is filed under. */
const NO_PERIOD = "1970-01-01";
/** The send's claim is made under one id for the Workflow whatever the step's own, so a step removed and added again sends no period twice. */
const SEND_CLAIM = "send-snapshot";
/** How many periods back a run looks for a finished one that has not gone yet: enough for weekly periods and 60 days. */
const MAX_PERIODS_BACK = 12;

const sendStep = (config: WorkflowConfig | undefined): Step | null => (config?.steps ?? []).find((s): s is Step => s.type === "send_snapshot") ?? null;
const locks = (config: WorkflowConfig) => config.steps.some((s) => s.type === "publish" && s.lock);

/** Claims something of a Workflow for a period: the claim's id for the one call that may do it, null for every other. */
async function claim(ws: string, workflowId: number, step: string, period: string, kind: "send_snapshot" | "snapshot_note" | "paused"): Promise<number | null> {
  const { data, error } = await db().rpc("claim_workflow_step", { p_workspace: ws, p_workflow: workflowId, p_step: step, p_period: period, p_kind: kind });
  if (error) throw new Error("The step could not be claimed.");
  return (data as number | null) ?? null;
}

/** Tells the Workflow's owner something about the step, once for each reason and period. */
async function noteOnce(ws: string, wf: Pick<Workflow, "id" | "name" | "owner_id">, reason: keyof typeof NOTE, period: string, text: string): Promise<void> {
  if ((await claim(ws, wf.id, NOTE[reason], period, "snapshot_note")) === null) return;
  await deliverNotice(ws, { recipientId: wf.owner_id, senderId: null, subject: `${wf.name}: its Snapshot step`, text, link: `/workflows?id=${wf.id}` });
}

const workspaceToday = async (ws: string): Promise<string> => localTime(new Date(), ((await db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle()).data?.time_zone as string | undefined) ?? "UTC").day;

/** Checks a period after something that may have finished it changed, and sends what its Workflow sends then. Never
 * throws: a check that fails must not undo the Lock or the tick-off that caused it, only be logged. */
export async function checkFinishedPeriod(ws: string, workflowId: number, period: string, today?: string): Promise<void> {
  try {
    await sendFinishedSnapshotOf(ws, workflowId, period, today);
  } catch (e) {
    console.error("Send Snapshot: a finished period could not be checked:", e instanceof Error ? e.message : e);
  }
}

/** What follows a Lock of a Workflow's value: the owner's lock summary, then the check whether the period is finished. */
export async function afterLock(ws: string, workflowId: number, period: string): Promise<void> {
  await sendLockSummary(ws, workflowId, period);
  await checkFinishedPeriod(ws, workflowId, period);
}

/** Checks one period of one Workflow and sends its Snapshot if it is finished and was not sent: what runs after a Lock or a
 * tick-off. `today` is the Workspace's own day unless given. Loads the Workflow itself, so a caller names ids only. */
export async function sendFinishedSnapshotOf(ws: string, workflowId: number, period: string, today?: string): Promise<boolean> {
  if (ws === DEMO_WORKSPACE_ID) return false;
  const wf = await openWorkflowRow(ws, (await db().from("workflows").select("id, name, owner_id, config").eq("id", workflowId).eq("workspace_id", ws).maybeSingle()).data);
  // The cheap exit for every Workflow without the step: most Locks end here.
  if (!wf || !sendStep(wf.config as WorkflowConfig)) return false;
  return sendFinishedSnapshot(ws, wf as unknown as Workflow, period, today ?? (await workspaceToday(ws)));
}

/** Sends the Snapshot of a finished period of a Workflow, once; false when nothing was sent (not finished, sent before, waiting, or not possible). */
async function sendFinishedSnapshot(ws: string, wf: Workflow, period: string, today: string): Promise<boolean> {
  const step = sendStep(wf.config);
  // A step with no dashboard yet (a template's) and one whose Publish does not lock send nothing.
  if (!step || !step.dashboardId || !locks(wf.config)) return false;
  const { data: metrics } = await db().from("metrics").select("period, formula, archived_at").eq("workspace_id", ws).eq("workflow_id", wf.id);
  const yearStart = await yearStartOf(ws);
  const when = workflowPeriod((metrics ?? []) as Metric[], today, yearStart);
  // A Snapshot covers a week or longer; a Workflow without one period has no period at all.
  if (!when.ok || when.span === "day") return false;
  const p = snapshotPeriod(when.span as SnapshotPeriodKind, period, yearStart);
  // Only a period that is over, and not one that finished long after (the step waits MAX_WAIT_DAYS at most, as an automatic Snapshot does).
  if (!p || p.end >= today || today > format(addDays(parseISO(p.end), MAX_WAIT_DAYS), "yyyy-MM-dd")) return false;
  // A period that ended before the step was added is not sent: the owner asked for what comes after.
  if (step.addedOn && p.end < step.addedOn) return false;
  if (!(await periodFinishedAt(ws, wf.id, period))) return false;
  // Any earlier send of this period, whatever the step's id then (a step removed and added again sends nothing twice).
  const { data: sent } = await db().from("workflow_step_runs").select("id").eq("workflow_id", wf.id).eq("workspace_id", ws).eq("period_start", period).eq("kind", "send_snapshot").limit(1);
  if (sent?.length) return false;

  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", wf.owner_id).maybeSingle();
  if (!member) return false;
  // The owner vouches for what the Snapshot shows, as whoever takes one does: they must still edit the dashboard and see every Metric on it.
  const owner: Actor = { personId: wf.owner_id, workspaceId: ws, role: member.role as Actor["role"] };
  if (!(await mayTakeSnapshot(owner, step.dashboardId))) {
    await noteOnce(ws, wf, "lost", period, `The Workflow ${wf.name} could not send the Snapshot of ${p.label}: you no longer edit the dashboard it sends, or no longer see every Metric on it. Pick the dashboard again in the Workflow, and it goes at its next run.`);
    return false;
  }
  const dash = (await visibleDashboards(ws, owner.personId)).find((d) => d.id === step.dashboardId);
  if (!dash) return false;

  // Which Snapshot: a shown one is sent as it is; an untouched automatic draft is shown; any other draft is waited for.
  const { data: existing } = await db().from("dashboard_snapshots").select("id, automatic, shown_at, words_changed_at").eq("workspace_id", ws).eq("dashboard_id", step.dashboardId).eq("period_kind", p.kind).eq("period_start", p.start).is("deleted_at", null).maybeSingle();
  const waits = async () => {
    if (!existing || existing.shown_at) return false;
    const { count: versions } = await db().from("versions").select("id", { count: "exact", head: true }).eq("object_type", "snapshot").eq("object_id", existing.id);
    if (existing.automatic && !existing.words_changed_at && !versions) return false;
    await noteOnce(ws, wf, "wait", period, `The Snapshot ${p.label} of ${dash.name} is a draft that has been written in. Show it and the Workflow ${wf.name} sends it at its next run.`);
    return true;
  };
  if (await waits()) return false;

  const claimed = await claim(ws, wf.id, SEND_CLAIM, period, "send_snapshot");
  if (claimed === null) return false;
  // Asked again once the claim is ours: a draft written in between is left for its writer, and the period is not used up.
  if (await waits()) { await db().from("workflow_step_runs").delete().eq("id", claimed).eq("workspace_id", ws); return false; }
  let snapshotId: number;
  try {
    snapshotId = existing ? (existing.id as number) : await takeSnapshot(owner, step.dashboardId, { kind: p.kind, start: p.start }, { automatic: true, today, workflowId: wf.id });
    if (!existing?.shown_at) await showSnapshot(owner, snapshotId, { workflowId: wf.id });
  } catch (e) {
    // Nothing has gone out yet, so the period is not used up: the next run tries again, and the owner is told once.
    await db().from("workflow_step_runs").delete().eq("id", claimed).eq("workspace_id", ws);
    console.error("Send Snapshot: no Snapshot could be taken or shown:", e instanceof Error ? e.message : e);
    await noteOnce(ws, wf, "failed", period, `The Workflow ${wf.name} could not take or show the Snapshot ${p.label} of ${dash.name}. Look at the dashboard's Snapshots; the Workflow tries again at its next run.`);
    return false;
  }
  await db().from("workflow_step_runs").update({ snapshot_id: snapshotId }).eq("id", claimed);

  const counts = { sent: 0, skipped: 0 };
  try {
    const left = await sendLinks(ws, wf, step, { dashboardId: dash.id, dashboardName: dash.name, snapshotId, label: p.label, counts });
    // Each person not sent to, with why, named to the owner only (nothing about the dashboard reaches them).
    for (const [why, ids] of Object.entries(left)) {
      if (!ids.length) continue;
      const names = await namesOf(ws, ids);
      const text = why === "open" ? `${ids.length} ${ids.length === 1 ? "person" : "people"} could not open ${dash.name} (${names.join(", ")}): share it with them and they get the next one.`
        : why === "today" ? `${ids.length} ${ids.length === 1 ? "person" : "people"} did not get the link to ${dash.name} (${names.join(", ")}): over today's limit of messages.`
        : `${ids.length} ${ids.length === 1 ? "person" : "people"} did not get the link to ${dash.name} (${names.join(", ")}): a Send Snapshot step sends to ${TELL_PEOPLE_PER_STEP} people at most.`;
      await deliverNotice(ws, { recipientId: wf.owner_id, senderId: null, subject: `${wf.name}: ${ids.length} not sent the Snapshot`, text, link: why === "open" ? `/dashboards/${dash.id}` : `/workflows?id=${wf.id}` });
    }
  } finally {
    // The claim is made, so what was sent is written whatever happens while sending.
    await db().from("workflow_step_runs").update(counts).eq("id", claimed);
  }
  await recordAudit(ws, null, { kind: "workflow.snapshot_sent", object: { type: "workflow", id: wf.id, name: wf.name }, details: { snapshot_id: snapshotId, period: p.label, sent: counts.sent, skipped: counts.skipped } });
  return true;
}

/** Sends the link to each person the step names who may open the dashboard, within the Alerts' daily limits. Returns the
 * people not sent to by reason: they may not open the dashboard, they are over today's limit, or they are past the step's
 * limit of people. `counts` is filled as it goes. */
async function sendLinks(ws: string, wf: Workflow, step: Step, what: { dashboardId: number; dashboardName: string; snapshotId: number; label: string; counts: { sent: number; skipped: number } }): Promise<Record<"open" | "today" | "limit", string[]>> {
  const shares = await getShares(ws);
  const left: Record<"open" | "today" | "limit", string[]> = { open: [], today: [], limit: [] };
  const skip = (why: "open" | "today" | "limit", person: string) => { left[why].push(person); what.counts.skipped++; };
  // A step sends to TELL_PEOPLE_PER_STEP people at most: the rest are named to the owner, not dropped in silence.
  const everyone = await tellRecipients(ws, wf.id, step, { all: true });
  for (const person of everyone.slice(TELL_PEOPLE_PER_STEP)) skip("limit", person);
  for (const person of everyone.slice(0, TELL_PEOPLE_PER_STEP)) {
    // The moment of sending: may this person open the dashboard now? (Its owner, or an Editor or Viewer by a Share.)
    if (!(await visibleDashboards(ws, person, shares)).some((d) => d.id === what.dashboardId)) { skip("open", person); continue; }
    const { data: slot } = await db().rpc("claim_alert_message", { p_ws: ws, p_person: person, p_day: new Date().toISOString().slice(0, 10), p_per_person: await effectiveLimit("alertMessagesPerPerson", ws, person), p_per_workspace: await sendingLimit("alertMessagesPerWorkspace") });
    if (slot !== "send") { skip("today", person); continue; }
    await deliverChecklist(ws, {
      recipientId: person, senderId: wf.owner_id, workflowId: wf.id, dashboardId: what.dashboardId, subject: `${wf.name}: ${what.label} is finished`,
      // No value, no Metric name and none of the Snapshot's words: a link, which the person opens signed in.
      text: `${wf.name}: ${what.label} is finished. The Snapshot ${what.label} of ${what.dashboardName} is ready.\n\nYou are told by a Workflow; stop these in Your settings.`,
      link: `/dashboards/${what.dashboardId}/snapshots/${what.snapshotId}`,
    });
    what.counts.sent++;
  }
  return left;
}

/** The names of people of the Workspace, for the owner's notice. */
async function namesOf(ws: string, ids: string[]): Promise<string[]> {
  const { data } = await db().from("profiles").select("id, name").in("id", ids);
  return (await openNames(ws, data ?? [])).map((p) => String(p.name));
}

/** The catch-up of one Workflow's run (spec 0045): its Send Snapshot step looks at the Workflow's period as of the day and
 * the ones just before it, since a period may finish after the next one began. A Workflow whose Metrics share no period
 * waits, and its owner is told once (with the checklist's note when it has one). Returns what happened, in words. */
export async function runSendSnapshot(ws: string, wf: Workflow, metrics: Metric[], asOf: string, yearStart: YearStart): Promise<string[]> {
  const step = sendStep(wf.config);
  if (!step || ws === DEMO_WORKSPACE_ID) return [];
  const hasChecklist = wf.config.steps.some((s) => s.type === "checklist");
  const when = workflowPeriod(metrics.filter((m) => (m as Metric & { workflow_id?: number | null }).workflow_id === wf.id), asOf, yearStart);
  if (!when.ok) {
    // The checklist's note says the same and is told once for both.
    if (!hasChecklist && (await claim(ws, wf.id, "paused", NO_PERIOD, "paused")) !== null) {
      await deliverNotice(ws, { recipientId: wf.owner_id, senderId: null, subject: `${wf.name}: its Snapshot step waits`, text: `The Send Snapshot step of the Workflow ${wf.name} waits: ${when.why === "none" ? "it asks for no Metric" : "its Metrics do not all have the same period"}. It goes on when its Metrics agree on a period.`, link: `/workflows?id=${wf.id}` });
    }
    return [];
  }
  if (!hasChecklist) await db().from("workflow_step_runs").delete().eq("workflow_id", wf.id).eq("workspace_id", ws).eq("kind", "paused");
  if (when.span === "day") {
    await noteOnce(ws, wf, "day", NO_PERIOD, `The Send Snapshot step of the Workflow ${wf.name} waits: a Snapshot covers a week or longer, and its Metrics have a period of a day.`);
    return [];
  }
  const { data: runs } = await db().from("workflow_step_runs").select("period_start").eq("workflow_id", wf.id).eq("workspace_id", ws).eq("kind", "send_snapshot");
  const done = new Set((runs ?? []).map((r) => String(r.period_start)));
  const log: string[] = [];
  let period = when.period;
  for (let n = 0; n < MAX_PERIODS_BACK; n++, period = shiftPeriod(period, when.span, -1)) {
    if (format(addDays(parseISO(periodEnd(period, when.span)), MAX_WAIT_DAYS), "yyyy-MM-dd") < asOf) break;
    if (done.has(period)) continue;
    if (await sendFinishedSnapshot(ws, wf, period, asOf)) log.push(`${wf.name}, ${period}: Snapshot sent`);
  }
  return log;
}

/** Workflows as the actor may be shown them in a browser (rule 3): of a Send Snapshot step, who gets the Snapshot only for
 * the Workflow's owner, who edits it, and the dashboard only for someone who may open it (the rest read that there is a
 * step, as they may read its place on the Workflow page). Everything else stays as it is. */
export async function withoutSnapshotAudience<W extends { owner_id?: unknown; config: unknown }>(actor: Pick<Actor, "workspaceId" | "personId">, workflows: W[]): Promise<W[]> {
  const has = (w: W) => ((w.config as { steps?: { type?: string }[] } | null)?.steps ?? []).some((s) => s?.type === "send_snapshot");
  if (!workflows.some(has)) return workflows;
  const mayOpen = new Set((await visibleDashboards(actor.workspaceId, actor.personId)).map((d) => d.id));
  return workflows.map((w) => {
    if (w.owner_id === actor.personId || !has(w)) return w;
    const config = w.config as { steps: Record<string, unknown>[] };
    return { ...w, config: { ...config, steps: config.steps.map((s) => (s?.type === "send_snapshot" ? { type: "send_snapshot", id: s.id, dashboardId: mayOpen.has(Number(s.dashboardId)) ? s.dashboardId : 0, people: [], groups: [] } : s)) } };
  });
}

/** The dashboards the actor may open, for a Send Snapshot step's editor: its name, and whether they may pick it (they own or
 * edit it; the server still checks that they see every Metric on it, when the step is saved and when it runs). */
export async function snapshotDashboardChoices(actor: Pick<Actor, "workspaceId" | "personId">): Promise<{ id: number; name: string; pick: boolean }[]> {
  return (await visibleDashboards(actor.workspaceId, actor.personId)).map((d) => ({ id: d.id, name: String(d.name), pick: d.role === "owner" || d.role === "editor" }));
}
