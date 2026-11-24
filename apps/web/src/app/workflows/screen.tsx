"use client";
// Workflows (GLOSSARY: Workflow): a vertical timeline you build from a few kinds of step, the metrics on it
// and where each one's value is this period.
import { shown, unwrap } from "@/lib/action-error";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BellRing, Camera, CheckCheck, CircleUserRound, ListChecks, Lock, Megaphone, Plus, Play, ScanSearch, Send, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { closeWorkflowPeriod, deleteWorkflow, runTodayNow, runWorkflowsNow, saveWorkflow, setMetricWorkflow } from "@/app/workflow-actions";
import type { RunInfo } from "@ziffr/core/workflows";
import { dueDate, stepLabel, STEP_TITLE, workingPeriod } from "@ziffr/core/workflow-rules";
import { CHECKLIST_DAYS_MAX, TELL_GROUPS_PER_STEP, CHECKLIST_ITEMS_PER_WORKFLOW, TELL_PEOPLE_PER_STEP, CHECKLIST_TEXT_MAX, TELL_STEPS_PER_WORKFLOW, TELL_WEBHOOKS_PER_STEP } from "@ziffr/core/alert-limits";
import type { TellEditorFacts } from "@ziffr/core/tell";
import { formatDate } from "@ziffr/core/format";
import type { Metric, PeriodState, Profile, Workflow, WorkflowConfig, WorkflowStep } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { DemoControls } from "@/components/demo-controls";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import type { WorkflowTemplateSummary } from "@ziffr/core/workflow-templates";
import { NewWorkflowFromTemplate, SaveWorkflowTemplate } from "./templates";
import type { PeriodTimeline } from "@ziffr/core/period-timeline";
import { FillIn } from "@/app/metrics/[slug]/fill-in";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { FillInOffer } from "@ziffr/core/fill-in-offer";
import { PeriodTimelines } from "./period-timeline";
import { AskingFields, AskingSentence, type AskingClock } from "./asking-fields";

const ICON: Record<WorkflowStep["type"], typeof BellRing> = { remind: BellRing, escalate: TriangleAlert, check: ScanSearch, approve: CheckCheck, tell: Megaphone, publish: Lock, checklist: ListChecks, send_snapshot: Camera };
/** A new Tell step; its id names it for its memory and is kept by the server. */
const newTell = (): WorkflowStep => ({ type: "tell", id: crypto.randomUUID(), condition: { kind: "share_of_target", share: "80" }, people: [], groups: [] });
/** A new Checklist Item for information; its id names it for its claim and is kept by the server. */
const newItem = (): WorkflowStep => ({ type: "checklist", id: crypto.randomUUID(), kind: "info", text: "", day: 1, people: [], groups: [] });
/** A new Send Snapshot step with no dashboard picked yet; its id names it for its claim and is kept by the server. */
const newSend = (): WorkflowStep => ({ type: "send_snapshot", id: crypto.randomUUID(), dashboardId: 0, people: [], groups: [] });
const NEW_STEP: Record<Exclude<WorkflowStep["type"], "tell" | "checklist" | "send_snapshot">, WorkflowStep> = {
  remind: { type: "remind", daysBefore: 2 },
  escalate: { type: "escalate", to: "stand-in", daysAfter: 0 },
  check: { type: "check", changePct: 30, outsideTarget: true },
  approve: { type: "approve", approvers: [], values: "unusual", nobodyElse: "self-check" },
  publish: { type: "publish", lock: true },
};
const STATE_LABEL: Record<PeriodState["state"], string> = { asked: "Asked, waiting", submitted: "In, not approved yet", approval: "Waiting for approval", published: "Published", locked: "Published and locked" };
const BLANK: WorkflowConfig = { dueWorkingDays: 3, steps: [NEW_STEP.remind, NEW_STEP.escalate, NEW_STEP.check, NEW_STEP.approve, NEW_STEP.publish] };

type Tok = { metric_id: number; submitter_id: string; stand_in_id: string | null };

/** When Workflows run in a real workspace, and its last run; null in the demo, which pretends a day instead. */
type Schedule = { timeZone: string; runHour: number; today: string; hour: number; todayRan: boolean; lastRun: RunInfo | null; scheduled: boolean };

export function WorkflowsScreen({ viewer, people, feeds = [], metrics, workflows, current, states, tokens, asOf, schedule, askingRun = null, canRun, yearStart, templates = [], canCreate = true, timelines = [], tellFacts = { groups: [], webhooks: [], steps: [] }, checklistPaused = null, dashboards = [], fillIns = [], numberStyle }: {
  numberStyle: NumberStyle;
  /** Where the viewer may fill in for a submitter, by Metric (decided in the core, which checks again on saving). */
  fillIns?: FillInOffer[];
  /** The dashboards this viewer may open, and whether they may pick one for a Send Snapshot step (decided in the core). */
  dashboards?: { id: number; name: string; pick: boolean }[];
  /** Why this Workflow's checklist items wait, for its owner (decided in the core). */
  checklistPaused?: "none" | "mixed" | null;
  /** Groups a Tell step may name, and who each of the Workflow's Tell steps skips (decided in the core). */
  tellFacts?: TellEditorFacts;
  /** The last run of this Workflow on its own Asking Schedule (spec 0035). */
  askingRun?: RunInfo | null;
  /** The Workflow's periods as this viewer may see them, newest first (decided in the core). */
  timelines?: PeriodTimeline[];
  /** The team's Workflow Templates (spec 0030). */
  templates?: WorkflowTemplateSummary[];
  /** May make Workflows and templates: not a Guest. */
  canCreate?: boolean;
  yearStart: YearStart; schedule: Schedule | null; canRun: boolean; viewer: string; people: Profile[]; feeds?: { id: string; name: string }[]; metrics: (Pick<Metric, "id" | "name" | "slug" | "period" | "unit"> & { workflow_id: number | null; mine: boolean })[]; workflows: Workflow[]; current: Workflow | null; states: PeriodState[]; tokens: Tok[]; asOf: string }) {
  const router = useRouter();
  const isNew = !current;
  const [name, setName] = useState(current?.name ?? "New workflow");
  const [cfg, setCfg] = useState<WorkflowConfig>(current?.config ?? BLANK);
  const [day, setDay] = useState(asOf);
  const [log, setLog] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const canEdit = isNew || current?.owner_id === viewer;
  // Someone this viewer is not shown (peopleFor) reads as "Someone", never as their id.
  const first = (id: string) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  // A Feed is named in full, as on the Metric's page ("n8n (from the Trial guide)"), never by its id.
  const submitter = (id: string) => feeds.find((f) => f.id === id)?.name ?? first(id);
  const steps = cfg.steps;
  const setStep = (i: number, s: WorkflowStep) => setCfg({ ...cfg, steps: steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, d: -1 | 1) => { const s = [...steps]; [s[i], s[i + d]] = [s[i + d], s[i]]; setCfg({ ...cfg, steps: s }); };
  const onIt = metrics.filter((m) => current && m.workflow_id === current.id);
  // Who submits to the Metrics on this Workflow, for the Approve step's warning.
  const submitters = new Set(tokens.filter((t) => onIt.some((m) => m.id === t.metric_id)).map((t) => t.submitter_id));
  const clock: AskingClock = schedule ? { timeZone: schedule.timeZone, runHour: schedule.runHour, today: schedule.today, hour: schedule.hour } : null;
  const run = (f: () => Promise<unknown>) => start(async () => { try { await f(); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  const { confirm, dialog } = useConfirm();

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      {dialog}
      <nav aria-label="Workflows" className="space-y-1">
        {workflows.map((w) => (
          <Link key={w.id} href={`/workflows?id=${w.id}`} aria-current={w.id === current?.id ? "page" : undefined} className={cn("block rounded-[var(--radius-input)] px-2.5 py-2 text-sm hover:bg-muted", w.id === current?.id && "stock font-medium")}>
            {w.name}
            <span className="block text-xs font-normal text-muted-foreground">by {first(w.owner_id)}, {metrics.filter((m) => m.workflow_id === w.id).length} metrics</span>
          </Link>
        ))}
        <Button variant="ghost" className="w-full justify-start" disabled={pending} onClick={() => run(async () => { const id = unwrap(await saveWorkflow(null, "New workflow", BLANK)); router.push(`/workflows?id=${id}`); })}><Plus aria-hidden /> New workflow</Button>
        {canCreate && templates.length > 0 && <NewWorkflowFromTemplate templates={templates} people={people.filter((p) => !p.contact).map((p) => ({ id: p.id, name: p.name }))} />}
      </nav>

      {current && (
        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Steps" className="min-w-0">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium">Name</span>
                <Input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="w-40">
                <span className="mb-1 block text-xs font-medium">Due, working days after the period</span>
                <Input type="number" min={0} max={30} value={cfg.dueWorkingDays} disabled={!canEdit} onChange={(e) => setCfg({ ...cfg, dueWorkingDays: Number(e.target.value) })} />
              </label>
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={cfg.lockSummary === true} disabled={!canEdit} onChange={(e) => setCfg({ ...cfg, lockSummary: e.target.checked })} className="size-4 accent-[var(--color-ink)]" />
              Tell the owner when a period locks
            </label>

            <AskingFields asking={cfg.asking} disabled={!canEdit} clock={clock} periods={onIt.map((m) => m.period)} dueWorkingDays={cfg.dueWorkingDays}
              onChange={(a) => { const next = { ...cfg, asking: a }; if (!a) delete next.asking; setCfg(next); }} />

            <ol className="relative mt-6 space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-px before:bg-[var(--color-rule-2)]">
              <Node icon={Send} title="Ask" text="When the period ends, ask each submitter through their connector. While someone is away, their stand-in is asked.">
                {cfg.asking && <p className="mt-1 text-xs text-muted-foreground"><AskingSentence asking={cfg.asking} clock={clock} /></p>}
              </Node>
              {steps.map((s, i) => (
                <Node key={i} icon={ICON[s.type]} title={STEP_TITLE[s.type]} text={stepLabel(s, people, tellFacts.groups, dashboards)}
                  controls={canEdit && (
                    <span className="flex gap-0.5">
                      {s.type !== "publish" && i > 0 && <IconBtn label={`Move ${STEP_TITLE[s.type]} (step ${i + 1}) earlier`} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></IconBtn>}
                      {s.type !== "publish" && i < steps.length - 1 && steps[i + 1]?.type !== "publish" && <IconBtn label={`Move ${STEP_TITLE[s.type]} (step ${i + 1}) later`} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></IconBtn>}
                      {s.type !== "publish" && <IconBtn label={`Remove ${STEP_TITLE[s.type]} (step ${i + 1})`} onClick={() => setCfg({ ...cfg, steps: steps.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></IconBtn>}
                    </span>
                  )}
                >
                  {canEdit && <StepFields s={s} people={people} submitters={submitters} tellFacts={tellFacts} dashboards={dashboards} lockHeld={steps.some((x) => x.type === "send_snapshot")} onChange={(x) => setStep(i, x)} />}
                </Node>
              ))}
            </ol>

            {checklistPaused && canEdit && <p role="note" className="mt-3 pl-12 text-xs text-[var(--color-ink)]">The checklist items and the Send Snapshot step wait: {checklistPaused === "none" ? "this Workflow asks for no Metric" : "its Metrics do not all have the same period"}, and they belong to one period. They go on when its Metrics agree on a period.</p>}
            {canEdit && steps.some((x) => x.type === "send_snapshot") && onIt.length > 0 && onIt.every((m) => m.period === "day") && <p role="note" className="mt-3 pl-12 text-xs text-[var(--color-ink)]">The Send Snapshot step waits: a Snapshot covers a week or longer, and this Workflow&apos;s Metrics have a period of a day.</p>}
            {canEdit && (
              <div className="mt-4 flex flex-wrap gap-2 pl-12">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-input)] border border-input bg-card px-3 text-sm"><Plus aria-hidden className="size-4" /> Add step</DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {(["remind", "escalate", "check", "approve", "tell", "checklist", "send_snapshot"] as const).filter((t) => t === "tell" ? steps.filter((x) => x.type === "tell").length < TELL_STEPS_PER_WORKFLOW : t === "checklist" ? steps.filter((x) => x.type === "checklist").length < CHECKLIST_ITEMS_PER_WORKFLOW : (t !== "check" && t !== "approve" && t !== "send_snapshot") || !steps.some((x) => x.type === t)).map((t) => {
                      const Icon = ICON[t];
                      // Send Snapshot goes when the period is finished, which needs a locking Publish step: adding it ticks the lock.
                      return <DropdownMenuItem key={t} onClick={() => { const at = steps.findIndex((x) => x.type === "publish"); const s = (t === "send_snapshot" ? steps.map((x) => (x.type === "publish" ? { ...x, lock: true } : x)) : [...steps]); s.splice(at < 0 ? s.length : at, 0, t === "tell" ? newTell() : t === "checklist" ? newItem() : t === "send_snapshot" ? newSend() : NEW_STEP[t]); setCfg({ ...cfg, steps: s }); }}><Icon aria-hidden /> {STEP_TITLE[t]}</DropdownMenuItem>;
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button disabled={pending} onClick={() => run(async () => { unwrap(await saveWorkflow(current.id, name, cfg)); toast.success("Workflow saved"); router.refresh(); })}>Save workflow</Button>
                {canCreate && <SaveWorkflowTemplate workflow={current} mine={templates.filter((t) => t.owner_id === viewer)} />}
                {onIt.length === 0 && <Button variant="ghost" className="text-destructive" disabled={pending} onClick={async () => { if (await confirm({ title: `Delete ${current.name}?`, description: "No metric uses this workflow. It goes away for everyone, with its steps.", confirmLabel: "Delete workflow" })) run(async () => { unwrap(await deleteWorkflow(current.id)); router.push("/workflows"); }); }}><Trash2 aria-hidden /> Delete</Button>}
              </div>
            )}
            {!canEdit && <p className="mt-4 pl-12 text-sm text-muted-foreground">{first(current.owner_id)} owns this workflow; only they change it.</p>}
            <PeriodTimelines timelines={timelines} />
          </section>

          <aside className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold">Metrics on it</h2>
              <ul className="mt-2 space-y-2">
                {onIt.map((m) => {
                  const period = workingPeriod(day, m.period, yearStart);
                  const st = states.find((s) => s.metric_id === m.id && s.period_start === period);
                  const toks = tokens.filter((t) => t.metric_id === m.id);
                  return (
                    <li key={m.id} className="stock rounded-[var(--radius-card)] p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/metrics/${m.slug}`} className="font-medium hover:underline">{m.name}</Link>
                        {m.mine && <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" disabled={pending} aria-label={`Take ${m.name} off this workflow`} onClick={() => run(async () => { unwrap(await setMetricWorkflow(m.id, null)); toast.success(`${m.name} is off this workflow`); router.refresh(); })}>Remove</Button>}
                      </div>
                      <div className="text-xs text-muted-foreground">{periodLabel(period, m.period, yearStart)}, due {formatDate(dueDate(period, m.period, cfg))}</div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                        <span className={cn("rounded-[var(--radius-input)] border px-1.5 py-0.5", st?.state === "locked" ? "border-[var(--color-ink)]" : st?.state === "approval" ? "border-[var(--color-accent-2)] text-[var(--color-accent-2)]" : "border-border")}>{st ? STATE_LABEL[st.state] : "Not started"}</span>
                      </div>
                      {st?.note && <p className="mt-1 text-xs text-muted-foreground">{st.note}</p>}
                      {(() => { const offer = fillIns.find((f) => f.metricId === m.id && f.period === period); return offer ? <div className="mt-2"><FillIn offer={offer} metricName={m.name} periodLabel={periodLabel(period, m.period, yearStart)} placeholder={m.unit || "Value"} numberStyle={numberStyle} /></div> : null; })()}
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CircleUserRound aria-hidden className="size-3.5" /> {toks.map((t) => `${submitter(t.submitter_id)}${t.stand_in_id ? `, stand-in ${first(t.stand_in_id)}` : ""}`).join("; ") || "No submitter"}</p>
                    </li>
                  );
                })}
                {onIt.length === 0 && <p className="text-xs text-muted-foreground">No metrics yet.</p>}
              </ul>
              {current && <AddMetrics workflow={current} metrics={metrics} workflows={workflows} pending={pending} onAdd={(ids) => run(async () => { for (const id of ids) unwrap(await setMetricWorkflow(id, current.id)); toast.success(ids.length === 1 ? "Metric added" : `${ids.length} metrics added`); router.refresh(); })} />}
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              {schedule && current.config.asking && (
                <AskingPanel schedule={schedule} run={askingRun} saved={current.config.asking} canRun={canRun || current.owner_id === viewer} pending={pending}
                  onRun={() => run(async () => { const c = unwrap(await runTodayNow(current.id)); toast.success(c ? `Done: ${c.prompts} requests, ${c.reminders} reminders and ${c.escalations} escalations made. The Outbox shows which have gone out.` : "Today's steps ran already"); router.refresh(); })} />
              )}
              {schedule ? (
                <RunPanel schedule={schedule} canRun={canRun} pending={pending} onRun={() => run(async () => { const c = unwrap(await runTodayNow()); toast.success(c ? `Done: ${c.prompts} requests, ${c.reminders} reminders and ${c.escalations} escalations made. The Outbox shows which have gone out.` : "Today's steps ran already"); router.refresh(); })} />
              ) : (
                <DemoControls hint="In a real workspace Workflows run by themselves every morning. Pick a day to see the Workflows as they stand then.">
                  <div className="space-y-2">
                    <label className="block text-xs">
                      <span className="mb-1 block font-medium">Pretend today is</span>
                      <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); router.replace(`/workflows?id=${current.id}&asOf=${e.target.value}`); }} />
                    </label>
                    <Button variant="outline" className="w-full" disabled={pending} onClick={() => run(async () => { const l = unwrap(await runWorkflowsNow(day)); setLog(l); toast.success(l.length ? `${l.length} step${l.length === 1 ? "" : "s"} run` : "Nothing to do on that day"); router.refresh(); })}><Play aria-hidden /> Run workflows</Button>
                  </div>
                </DemoControls>
              )}
              {log && log.length > 0 && <ul className="space-y-0.5 rounded-[var(--radius-input)] bg-muted p-2 text-xs">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              {current.owner_id === viewer && onIt.length > 0 && (
                <Button variant="outline" className="w-full" disabled={pending} onClick={async () => { if (await confirm({ title: `Close the period on ${current.name}?`, description: "Every metric on it that has a value for the last period is locked. Late values and corrections then need approval, and only a metric's owner can unlock it.", confirmLabel: "Lock the period" })) run(async () => { const n = unwrap(await closeWorkflowPeriod(current.id, day)); toast.success(`${n} metric${n === 1 ? "" : "s"} locked`); router.refresh(); }); }}><Lock aria-hidden /> Close the period</Button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Node({ icon: Icon, title, text, controls, children }: { icon: typeof Send; title: string; text: string; controls?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="relative flex gap-3">
      <span className="z-[1] flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-rule-2)] bg-card"><Icon aria-hidden className="size-4" /></span>
      <div className="stock min-w-0 flex-1 rounded-[var(--radius-card)] p-3 text-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><span className="font-semibold">{title}</span><p className="text-muted-foreground">{text}</p></div>
          {controls}
        </div>
        {children}
      </div>
    </li>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground">{children}</button>;
}

function StepFields({ s, people, submitters, tellFacts, dashboards, lockHeld, onChange }: { s: WorkflowStep; people: Profile[]; submitters: Set<string>; tellFacts: TellEditorFacts; dashboards: { id: number; name: string; pick: boolean }[]; lockHeld: boolean; onChange: (s: WorkflowStep) => void }) {
  const field = "h-8 rounded-[var(--radius-input)] border border-input bg-card px-2 text-xs";
  const num = (v: number, set: (n: number) => void, max = 30) => <input type="number" min={0} max={max} value={v} onChange={(e) => set(Number(e.target.value))} className={cn(field, "w-16")} />;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {s.type === "remind" && <label className="flex items-center gap-1.5">{num(s.daysBefore, (n) => onChange({ ...s, daysBefore: n }))} days before the due date</label>}
      {s.type === "escalate" && (
        <>
          <label className="flex items-center gap-1.5">{num(s.daysAfter, (n) => onChange({ ...s, daysAfter: n }))} days after the due date</label>
          <select aria-label="Escalate to" value={s.to} onChange={(e) => onChange({ ...s, to: e.target.value as "stand-in" | "owner" })} className={field}><option value="stand-in">ask the stand-in</option><option value="owner">tell the metric owner</option></select>
        </>
      )}
      {s.type === "check" && (
        <>
          <label className="flex items-center gap-1.5">changes more than {num(s.changePct, (n) => onChange({ ...s, changePct: n }), 1000)} %</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.outsideTarget} onChange={(e) => onChange({ ...s, outsideTarget: e.target.checked })} className="size-4 accent-[var(--color-ink)]" /> or outside the target</label>
        </>
      )}
      {s.type === "approve" && (
        <>
          <select aria-label="Which values wait for Approval" value={s.values === "every" ? "every" : "unusual"} onChange={(e) => onChange({ ...s, values: e.target.value === "every" ? "every" : "unusual" })} className={field}>
            <option value="unusual">Unusual values only</option>
            <option value="every">Every value</option>
          </select>
          <span>approved by</span>
          {s.approvers.map((a, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>then</span>}
              <select aria-label={`Approver ${i + 1}`} value={a} onChange={(e) => onChange({ ...s, approvers: s.approvers.map((x, j) => (j === i ? e.target.value : x)) })} className={field}>
                {people.filter((p) => !p.contact).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <IconBtn label={`Remove approver ${i + 1}`} onClick={() => onChange({ ...s, approvers: s.approvers.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></IconBtn>
            </span>
          ))}
          {s.approvers.length < 3 && <button type="button" onClick={() => onChange({ ...s, approvers: [...s.approvers, people[0]?.id ?? ""] })} className="underline">Add approver</button>}
          <span>Nobody approves their own value; the next one does.</span>
          <label className="flex basis-full flex-wrap items-center gap-1.5">
            <span>When nobody else can approve</span>
            <select aria-label="When nobody else can approve" value={s.nobodyElse === "count" ? "count" : "self-check"} onChange={(e) => onChange({ ...s, nobodyElse: e.target.value === "count" ? "count" : "self-check" })} className={field}>
              <option value="self-check">let the submitter check it</option>
              <option value="count">count it without approval</option>
            </select>
            <span className="text-xs text-muted-foreground">{s.nobodyElse === "count" ? "Such a value counts at once, with a note that nobody else could approve it." : "The submitter gets a task to confirm or correct it, recorded as confirmed by the submitter, not as approved."}</span>
          </label>
          {s.approvers.length > 0 && s.approvers.every((a) => submitters.has(a)) && (
            <span role="note" className="basis-full text-[var(--color-ink)]">
              {s.approvers.length === 1 ? "The only Approver" : "Every Approver"} also submits a Metric on this Workflow: their own values go to the Metric Owner, or the Workflow&apos;s owner, for Approval instead. If that is them too, {s.nobodyElse === "count" ? "the value counts without approval" : "they check it themselves"}. Add another Approver for four eyes.
            </span>
          )}
        </>
      )}
      {s.type === "tell" && <TellFields s={s} people={people} tellFacts={tellFacts} onChange={onChange} field={field} />}
      {s.type === "checklist" && <ChecklistFields s={s} people={people} tellFacts={tellFacts} onChange={onChange} field={field} />}
      {s.type === "send_snapshot" && <SnapshotFields s={s} people={people} dashboards={dashboards} tellFacts={tellFacts} onChange={onChange} field={field} />}
      {s.type === "publish" && <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.lock} disabled={lockHeld} onChange={(e) => onChange({ ...s, lock: e.target.checked })} className="size-4 accent-[var(--color-ink)]" /> lock the period once published{lockHeld && <span>(kept on: the Send Snapshot step waits for the lock)</span>}</label>}
    </div>
  );
}

/** The people and Groups a Tell step or a Checklist Item names: each as a chip with its remove button, and the lists to add more from (never Contacts). */
function Recipients({ named, people, groups, field, onChange }: { named: { people: string[]; groups: number[] }; people: Profile[]; groups: TellEditorFacts["groups"]; field: string; onChange: (r: { people: string[]; groups: number[] }) => void }) {
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const chip = "flex items-center gap-1 rounded-[var(--radius-input)] border border-border px-1.5 py-0.5";
  const pickable = people.filter((p) => !p.contact && !named.people.includes(p.id));
  const more = groups.filter((g) => !named.groups.includes(g.id));
  return (
    <>
      {named.people.map((p) => <span key={p} className={chip}>{name(p)}<IconBtn label={`Do not tell ${name(p)}`} onClick={() => onChange({ ...named, people: named.people.filter((x) => x !== p) })}><Trash2 className="size-3.5" /></IconBtn></span>)}
      {named.groups.map((g) => <span key={g} className={chip}>Group {groups.find((x) => x.id === g)?.name ?? g}<IconBtn label="Do not tell this Group" onClick={() => onChange({ ...named, groups: named.groups.filter((x) => x !== g) })}><Trash2 className="size-3.5" /></IconBtn></span>)}
      {pickable.length > 0 && named.people.length < TELL_PEOPLE_PER_STEP && (
        <select aria-label="Add a person to tell" value="" onChange={(e) => e.target.value && onChange({ ...named, people: [...named.people, e.target.value] })} className={field}>
          <option value="">Add a person…</option>
          {pickable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {more.length > 0 && named.groups.length < TELL_GROUPS_PER_STEP && (
        <select aria-label="Add a Group to tell" value="" onChange={(e) => e.target.value && onChange({ ...named, groups: [...named.groups, Number(e.target.value)] })} className={field}>
          <option value="">Add a Group…</option>
          {more.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.members})</option>)}
        </select>
      )}
    </>
  );
}

/** A Checklist Item's fields: its words, its day, who is told and which Group reads its words on the page. Plain text,
 * as everywhere it is shown; the server checks every limit again. */
function ChecklistFields({ s, people, tellFacts, onChange, field }: { s: Extract<WorkflowStep, { type: "checklist" }>; people: Profile[]; tellFacts: TellEditorFacts; onChange: (s: WorkflowStep) => void; field: string }) {
  const readers = (
    <label className="flex items-center gap-1.5">
      <span>Its words are read on this page by</span>
      <select aria-label="Who reads its words" value={s.readGroup ?? ""} onChange={(e) => { const next = { ...s }; if (e.target.value) next.readGroup = Number(e.target.value); else delete next.readGroup; onChange(next); }} className={field}>
        <option value="">everyone who sees the Workflow</option>
        {tellFacts.groups.map((g) => <option key={g.id} value={g.id}>the Group {g.name}</option>)}
      </select>
    </label>
  );
  const text = (
    <label className="block basis-full">
      <span className="mb-1 block">Its words ({[...s.text].length} of {CHECKLIST_TEXT_MAX} characters; plain words, no line breaks or web addresses)</span>
      <textarea aria-label="Checklist item words" value={s.text} maxLength={CHECKLIST_TEXT_MAX} rows={2} onChange={(e) => onChange({ ...s, text: e.target.value })} className="w-full rounded-[var(--radius-input)] border border-input bg-card p-2 text-xs text-foreground" />
    </label>
  );
  if (s.kind === "tick") {
    return <>{text}<span className="basis-full">To tick off by a person: it is not given as a Task yet, so nothing is sent for it.</span>{readers}</>;
  }
  return (
    <>
      {text}
      <label className="flex items-center gap-1.5"><input type="number" aria-label="Working days after the period" min={1} max={CHECKLIST_DAYS_MAX} value={s.day} onChange={(e) => onChange({ ...s, day: Number(e.target.value) })} className={cn(field, "w-16")} /> working days after the period ends (1 is the first working day after it)</label>
      <span className="basis-full">Tell</span>
      <Recipients named={s} people={people} groups={tellFacts.groups} field={field} onChange={(r) => onChange({ ...s, ...r })} />
      {s.people.length === 0 && s.groups.length === 0 && <span role="note" className="basis-full text-[var(--color-ink)]">Nobody is chosen yet, so nothing is sent.</span>}
      <span className="basis-full">Sent once for each period, by each person&apos;s Delivery Preference, after their Quiet Hours, and never more than {TELL_PEOPLE_PER_STEP} people. It holds your words and a link, no value. Only members with a sign-in get it, and each can stop it in Your settings.</span>
      {readers}
    </>
  );
}

/** A Send Snapshot step's fields: the dashboard and who gets a link to its Snapshot. The server checks again that the dashboard
 * is one the owner may take a Snapshot of, and each recipient is checked for opening it when the link is sent. */
function SnapshotFields({ s, people, dashboards, tellFacts, onChange, field }: { s: Extract<WorkflowStep, { type: "send_snapshot" }>; people: Profile[]; dashboards: { id: number; name: string; pick: boolean }[]; tellFacts: TellEditorFacts; onChange: (s: WorkflowStep) => void; field: string }) {
  return (
    <>
      <label className="flex items-center gap-1.5">
        <span>Dashboard</span>
        <select aria-label="Dashboard whose Snapshot is sent" value={s.dashboardId || ""} onChange={(e) => onChange({ ...s, dashboardId: Number(e.target.value) || 0 })} className={field}>
          <option value="">Pick a dashboard…</option>
          {dashboards.filter((d) => d.pick || d.id === s.dashboardId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <span className="basis-full">Send to</span>
      <Recipients named={s} people={people} groups={tellFacts.groups} field={field} onChange={(r) => onChange({ ...s, ...r })} />
      {(!s.dashboardId || (s.people.length === 0 && s.groups.length === 0)) && <span role="note" className="basis-full text-[var(--color-ink)]">{!s.dashboardId ? "No dashboard is picked yet" : "Nobody is chosen yet"}, so nothing is sent.</span>}
      <span className="basis-full">Once the period is finished (every value locked and every checklist task done) it takes the period&apos;s Snapshot in your name, shows it, and sends each person who may open the dashboard a link to it, once for each period. The message holds no value and no Metric name; each person sees only the Metrics they may see. People who may not open the dashboard are skipped and you are told who: share it with them and they get the next one. Only members with a sign-in get it, and each can stop it in Your settings.</span>
    </>
  );
}

/** A Workflow on its own Asking Schedule: when it runs, its last run, and running it now. */
function AskingPanel({ schedule, run, saved, canRun, pending, onRun }: { schedule: Schedule; run: RunInfo | null; saved: NonNullable<WorkflowConfig["asking"]>; canRun: boolean; pending: boolean; onRun: () => void }) {
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium"><AskingSentence asking={saved} clock={schedule} /></p>
      {run ? (
        <p className={run.state === "failed" ? "text-destructive" : "text-muted-foreground"}>
          Last run {run.day === schedule.today ? "today" : `on ${formatDate(run.day)}`}{run.trigger === "manual" ? ", started by hand" : ""}: {run.state === "failed" ? "it failed" : run.state === "running" ? "still running" : `${run.counts.prompts} asked, ${run.counts.reminders} reminded, ${run.counts.escalations} escalated`}.
        </p>
      ) : (
        <p className="text-muted-foreground">No run yet. A schedule you save after its hour has passed starts on its next day.</p>
      )}
      {canRun && <Button variant="outline" className="w-full" disabled={pending} onClick={onRun}><Play aria-hidden /> Run this workflow now</Button>}
    </div>
  );
}

/** A real workspace's clock: when Workflows run, the last run, and running today's steps now. */
function RunPanel({ schedule, canRun, pending, onRun }: { schedule: Schedule; canRun: boolean; pending: boolean; onRun: () => void }) {
  const hh = `${String(schedule.runHour).padStart(2, "0")}:00`;
  const last = schedule.lastRun;
  return (
    <div className="space-y-2 text-xs">
      <p><span className="font-medium">Workflows without their own schedule run every day at {hh}</span> ({schedule.timeZone.replace(/_/g, " ")}). Owners and Admins change this in the workspace settings. Workflows with their own schedule run by themselves.</p>
      {last ? (
        <p className={last.state === "failed" ? "text-destructive" : "text-muted-foreground"}>
          Last run {last.day === schedule.today ? "today" : `on ${formatDate(last.day)}`}{last.trigger === "manual" ? ", started by hand" : ""}: {last.state === "failed" ? "it failed" : last.state === "running" ? "still running" : `${last.counts.prompts} asked, ${last.counts.reminders} reminded, ${last.counts.escalations} escalated`}.
        </p>
      ) : (
        <p className="text-muted-foreground">No run yet.</p>
      )}
      {!schedule.scheduled && <p className="text-muted-foreground">Nothing has run by the clock here yet. Whoever runs Ziffr for this workspace still has to turn on the hourly schedule; until then, run today’s steps by hand.</p>}
      {canRun && (
        <Button variant="outline" className="w-full" disabled={pending || schedule.todayRan} onClick={onRun}><Play aria-hidden /> {schedule.todayRan ? "Today's steps ran" : "Run today's steps now"}</Button>
      )}
    </div>
  );
}


/** A Tell step's fields: the condition, who is told (people and Groups), and who the step will skip for lack of sight. */
function TellFields({ s, people, tellFacts, onChange, field }: { s: Extract<WorkflowStep, { type: "tell" }>; people: Profile[]; tellFacts: TellEditorFacts; onChange: (s: WorkflowStep) => void; field: string }) {
  const c = s.condition;
  const level = "value" in c ? c.value : c.share;
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const setKind = (kind: typeof c.kind) => onChange({ ...s, condition: kind === "at_or_above" || kind === "below" ? { kind, value: level } : { kind, share: level } });
  const setLevel = (v: string) => onChange({ ...s, condition: "value" in c ? { ...c, value: v } : { ...c, share: v } });
  const skipped = tellFacts.steps.find((x) => x.id === s.id)?.skipped ?? [];
  const byPerson = new Map<string, string[]>();
  for (const k of skipped) byPerson.set(k.person, [...(byPerson.get(k.person) ?? []), k.metric]);
  const hooks = s.webhooks ?? [];
  const hook = (id: string) => tellFacts.webhooks.find((w) => w.id === id);
  const pickableHooks = tellFacts.webhooks.filter((w) => !hooks.includes(w.id));
  return (
    <>
      <label className="flex items-center gap-1.5">
        <span>when</span>
        <select aria-label="Tell when" value={c.kind} onChange={(e) => setKind(e.target.value as typeof c.kind)} className={field}>
          <option value="share_of_target">a value reaches a share of its target</option>
          <option value="at_or_above">a value reaches</option>
          <option value="below">a value falls below</option>
          <option value="changed_more">a value changes more than</option>
        </select>
        <input aria-label="Level" inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} className={cn(field, "w-24")} />
        {(c.kind === "share_of_target" || c.kind === "changed_more") && <span>%</span>}
      </label>
      <span className="basis-full">Tell</span>
      <Recipients named={s} people={people} groups={tellFacts.groups} field={field} onChange={(r) => onChange({ ...s, ...r })} />
      {hooks.map((id) => <span key={id} className="flex items-center gap-1 rounded-[var(--radius-input)] border border-border px-1.5 py-0.5">Webhook {hook(id)?.name ?? "(not shown to you)"}{tellFacts.webhooks.length > 0 && <IconBtn label={`Do not tell Webhook ${hook(id)?.name ?? ""}`} onClick={() => onChange({ ...s, webhooks: hooks.filter((x) => x !== id) })}><Trash2 className="size-3.5" /></IconBtn>}</span>)}
      {pickableHooks.length > 0 && hooks.length < TELL_WEBHOOKS_PER_STEP && (
        <select aria-label="Add a Webhook to tell" value="" onChange={(e) => e.target.value && onChange({ ...s, webhooks: [...hooks, e.target.value] })} className={field}>
          <option value="">Add a Webhook…</option>
          {pickableHooks.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      {hooks.some((id) => hook(id) && (!hook(id)!.enabled || !hook(id)!.hearsAlerts)) && <span role="note" className="basis-full text-[var(--color-ink)]">{hooks.filter((id) => hook(id) && (!hook(id)!.enabled || !hook(id)!.hearsAlerts)).map((id) => hook(id)!.name).join(", ")} {hooks.filter((id) => hook(id) && (!hook(id)!.enabled || !hook(id)!.hearsAlerts)).length === 1 ? "is" : "are"} switched off or did not choose the event “A Tell step fires” on the Webhooks page, and will get nothing until then.</span>}
      <span className="basis-full">A Webhook gets the Metric, period, value, target and condition, and only for a Metric shared with Everyone. Only an Owner or Admin names one.</span>
      <span className="basis-full">Once per crossing, for approved values only, and never more than {TELL_PEOPLE_PER_STEP} people. Each person is told by their Delivery Preference, only about Metrics they can see, and can stop it in Your settings.</span>
      {[...byPerson].map(([person, metrics]) => <span key={person} role="note" className="basis-full text-[var(--color-ink)]">{name(person)} cannot see {metrics.join(", ")} and will not be told about {metrics.length === 1 ? "it" : "them"}.</span>)}
    </>
  );
}

/** Picks Metrics onto a Workflow. Only Metrics the person owns are offered (the core checks the same on every one);
 * one already on another Workflow says so, because adding it moves it. */
function AddMetrics({ workflow, metrics, workflows, pending, onAdd }: { workflow: Workflow; metrics: { id: number; name: string; workflow_id: number | null; mine: boolean }[]; workflows: Workflow[]; pending: boolean; onAdd: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const offered = metrics.filter((m) => m.mine && m.workflow_id !== workflow.id);
  if (offered.length === 0) return <p className="mt-2 text-xs text-muted-foreground">Metrics you own can be added here.</p>;
  if (!open) return <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}><Plus aria-hidden /> Add Metrics…</Button>;
  return (
    <div className="mt-2 space-y-2 rounded-[var(--radius-card)] border border-border p-3 text-sm">
      <p className="text-xs text-muted-foreground">Metrics you own. One already on another workflow moves here.</p>
      <ul className="max-h-60 space-y-1 overflow-auto">
        {offered.map((m) => (
          <li key={m.id}>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={picked.includes(m.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} />
              <span>{m.name}{m.workflow_id !== null && <span className="text-xs text-muted-foreground"> (now on {workflows.find((w) => w.id === m.workflow_id)?.name ?? "another workflow"})</span>}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || picked.length === 0} onClick={() => { onAdd(picked); setPicked([]); setOpen(false); }}>Add {picked.length || ""}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setPicked([]); setOpen(false); }}>Cancel</Button>
      </div>
    </div>
  );
}
