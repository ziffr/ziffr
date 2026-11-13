"use client";
// Workflows (GLOSSARY: Workflow): a vertical timeline you build from a few kinds of step, the metrics on it
// and where each one's value is this period.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BellRing, CheckCheck, CircleUserRound, Lock, Plus, Play, ScanSearch, Send, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { closeWorkflowPeriod, deleteWorkflow, runWorkflowsNow, saveWorkflow } from "@/app/workflow-actions";
import { dueDate, stepLabel, STEP_TITLE, workingPeriod } from "@/lib/workflow-rules";
import { periodLabel, periodStart } from "@/lib/format";
import type { Metric, PeriodState, Profile, Workflow, WorkflowConfig, WorkflowStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<WorkflowStep["type"], typeof BellRing> = { remind: BellRing, escalate: TriangleAlert, check: ScanSearch, approve: CheckCheck, publish: Lock };
const NEW_STEP: Record<WorkflowStep["type"], WorkflowStep> = {
  remind: { type: "remind", daysBefore: 2 },
  escalate: { type: "escalate", to: "stand-in", daysAfter: 0 },
  check: { type: "check", changePct: 30, outsideTarget: true },
  approve: { type: "approve", approvers: [] },
  publish: { type: "publish", lock: true },
};
const STATE_LABEL: Record<PeriodState["state"], string> = { asked: "Asked, waiting", submitted: "In, not approved yet", approval: "Waiting for approval", published: "Published", locked: "Published and locked" };
const BLANK: WorkflowConfig = { dueWorkingDays: 3, steps: [NEW_STEP.remind, NEW_STEP.escalate, NEW_STEP.check, NEW_STEP.approve, NEW_STEP.publish] };

type Tok = { metric_id: number; submitter_id: string; stand_in_id: string | null };

export function WorkflowsScreen({ viewer, people, metrics, workflows, current, states, tokens, asOf }: { viewer: string; people: Profile[]; metrics: (Pick<Metric, "id" | "name" | "slug" | "period"> & { workflow_id: number | null })[]; workflows: Workflow[]; current: Workflow | null; states: PeriodState[]; tokens: Tok[]; asOf: string }) {
  const router = useRouter();
  const isNew = !current;
  const [name, setName] = useState(current?.name ?? "New workflow");
  const [cfg, setCfg] = useState<WorkflowConfig>(current?.config ?? BLANK);
  const [day, setDay] = useState(asOf);
  const [log, setLog] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const canEdit = isNew || current?.owner_id === viewer;
  const first = (id: string) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  const steps = cfg.steps;
  const setStep = (i: number, s: WorkflowStep) => setCfg({ ...cfg, steps: steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, d: -1 | 1) => { const s = [...steps]; [s[i], s[i + d]] = [s[i + d], s[i]]; setCfg({ ...cfg, steps: s }); };
  const onIt = metrics.filter((m) => current && m.workflow_id === current.id);
  const run = (f: () => Promise<unknown>) => start(async () => { try { await f(); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Workflows" className="space-y-1">
        {workflows.map((w) => (
          <Link key={w.id} href={`/workflows?id=${w.id}`} aria-current={w.id === current?.id ? "page" : undefined} className={cn("block rounded-[var(--radius-input)] px-2.5 py-2 text-sm hover:bg-muted", w.id === current?.id && "stock font-medium")}>
            {w.name}
            <span className="block text-xs font-normal text-muted-foreground">by {first(w.owner_id)}, {metrics.filter((m) => m.workflow_id === w.id).length} metrics</span>
          </Link>
        ))}
        <Button variant="ghost" className="w-full justify-start" disabled={pending} onClick={() => run(async () => { const id = await saveWorkflow(null, "New workflow", BLANK); router.push(`/workflows?id=${id}`); })}><Plus aria-hidden /> New workflow</Button>
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

            <ol className="relative mt-6 space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-px before:bg-[var(--color-rule-2)]">
              <Node icon={Send} title="Ask" text="When the period ends, ask each submitter through their connector. While someone is away, their stand-in is asked." />
              {steps.map((s, i) => (
                <Node key={i} icon={ICON[s.type]} title={STEP_TITLE[s.type]} text={stepLabel(s, people)}
                  controls={canEdit && (
                    <span className="flex gap-0.5">
                      {s.type !== "publish" && i > 0 && <IconBtn label="Earlier" onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></IconBtn>}
                      {s.type !== "publish" && i < steps.length - 1 && steps[i + 1]?.type !== "publish" && <IconBtn label="Later" onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></IconBtn>}
                      {s.type !== "publish" && <IconBtn label="Remove step" onClick={() => setCfg({ ...cfg, steps: steps.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></IconBtn>}
                    </span>
                  )}
                >
                  {canEdit && <StepFields s={s} people={people} onChange={(x) => setStep(i, x)} />}
                </Node>
              ))}
            </ol>

            {canEdit && (
              <div className="mt-4 flex flex-wrap gap-2 pl-12">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-input)] border border-input bg-card px-3 text-sm"><Plus aria-hidden className="size-4" /> Add step</DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {(["remind", "escalate", "check", "approve"] as const).filter((t) => (t !== "check" && t !== "approve") || !steps.some((x) => x.type === t)).map((t) => {
                      const Icon = ICON[t];
                      return <DropdownMenuItem key={t} onClick={() => { const at = steps.findIndex((x) => x.type === "publish"); const s = [...steps]; s.splice(at < 0 ? s.length : at, 0, NEW_STEP[t]); setCfg({ ...cfg, steps: s }); }}><Icon aria-hidden /> {STEP_TITLE[t]}</DropdownMenuItem>;
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button disabled={pending} onClick={() => run(async () => { await saveWorkflow(current.id, name, cfg); toast.success("Workflow saved"); router.refresh(); })}>Save workflow</Button>
                {onIt.length === 0 && <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => { if (confirm(`Delete ${current.name}?`)) run(async () => { await deleteWorkflow(current.id); router.push("/workflows"); }); }}><Trash2 aria-hidden /> Delete</Button>}
              </div>
            )}
            {!canEdit && <p className="mt-4 pl-12 text-sm text-muted-foreground">{first(current.owner_id)} owns this workflow; only they change it.</p>}
          </section>

          <aside className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold">Metrics on it</h2>
              <ul className="mt-2 space-y-2">
                {onIt.map((m) => {
                  const period = workingPeriod(day, m.period, periodStart);
                  const st = states.find((s) => s.metric_id === m.id && s.period_start === period);
                  const toks = tokens.filter((t) => t.metric_id === m.id);
                  return (
                    <li key={m.id} className="stock rounded-[var(--radius-card)] p-3 text-sm">
                      <Link href={`/metrics/${m.slug}`} className="font-medium hover:underline">{m.name}</Link>
                      <div className="text-xs text-muted-foreground">{periodLabel(period, m.period)}, due {dueDate(period, m.period, cfg)}</div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                        <span className={cn("rounded-[var(--radius-input)] border px-1.5 py-0.5", st?.state === "locked" ? "border-[var(--color-ink)]" : st?.state === "approval" ? "border-[var(--color-accent-2)] text-[var(--color-accent-2)]" : "border-border")}>{st ? STATE_LABEL[st.state] : "Not started"}</span>
                      </div>
                      {st?.note && <p className="mt-1 text-xs text-muted-foreground">{st.note}</p>}
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CircleUserRound aria-hidden className="size-3.5" /> {toks.map((t) => `${first(t.submitter_id)}${t.stand_in_id ? `, stand-in ${first(t.stand_in_id)}` : ""}`).join("; ") || "No submitter"}</p>
                    </li>
                  );
                })}
                {onIt.length === 0 && <p className="text-xs text-muted-foreground">No metrics yet. A metric&rsquo;s owner picks its workflow on the metric&rsquo;s page.</p>}
              </ul>
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <label className="block text-xs">
                <span className="mb-1 block font-medium">Pretend today is</span>
                <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); router.replace(`/workflows?id=${current.id}&asOf=${e.target.value}`); }} />
              </label>
              <Button variant="outline" className="w-full" disabled={pending} onClick={() => run(async () => { const l = await runWorkflowsNow(day); setLog(l); toast.success(l.length ? `${l.length} step${l.length === 1 ? "" : "s"} run` : "Nothing to do on that day"); router.refresh(); })}><Play aria-hidden /> Run workflows</Button>
              <p className="text-xs text-muted-foreground">In the product this runs by itself every morning.</p>
              {log && log.length > 0 && <ul className="space-y-0.5 rounded-[var(--radius-input)] bg-muted p-2 text-xs">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              {current.owner_id === viewer && onIt.length > 0 && (
                <Button variant="outline" className="w-full" disabled={pending} onClick={() => { if (confirm(`Lock the last period for every metric on ${current.name} that has a value?`)) run(async () => { const n = await closeWorkflowPeriod(current.id, day); toast.success(`${n} metric${n === 1 ? "" : "s"} locked`); router.refresh(); }); }}><Lock aria-hidden /> Close the period</Button>
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

function StepFields({ s, people, onChange }: { s: WorkflowStep; people: Profile[]; onChange: (s: WorkflowStep) => void }) {
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
          {s.approvers.map((a, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>then</span>}
              <select aria-label={`Approver ${i + 1}`} value={a} onChange={(e) => onChange({ ...s, approvers: s.approvers.map((x, j) => (j === i ? e.target.value : x)) })} className={field}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <IconBtn label="Remove approver" onClick={() => onChange({ ...s, approvers: s.approvers.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></IconBtn>
            </span>
          ))}
          {s.approvers.length < 3 && <button type="button" onClick={() => onChange({ ...s, approvers: [...s.approvers, people[0]?.id ?? ""] })} className="underline">Add approver</button>}
          <span>Nobody approves their own value; the next one does.</span>
        </>
      )}
      {s.type === "publish" && <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.lock} onChange={(e) => onChange({ ...s, lock: e.target.checked })} className="size-4 accent-[var(--color-ink)]" /> lock the period once published</label>}
    </div>
  );
}
