"use client";
// A metric's Workflow on its page (GLOSSARY: Workflow, Stand-in, Lock): which one, where the last period is,
// who stands in for whom, and locking by hand.
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { GitPullRequestArrow, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lockPeriod, setMetricWorkflow, setStandIn } from "@/app/workflow-actions";
import { dueDate } from "@ziffr/core/workflow-rules";
import { formatDate } from "@ziffr/core/format";
import type { Metric, PeriodState, Profile, Workflow } from "@ziffr/core/types";
import { periodLabel, type YearStart } from "@ziffr/core/periods";

const STATE: Record<PeriodState["state"], string> = { asked: "asked, waiting for the value", submitted: "in, not approved yet", approval: "waiting for approval", published: "published", locked: "published and locked" };

export function MetricWorkflow({ metric, workflowId, workflows, period, state, tokens, people, isOwner, yearStart }: {
  metric: Metric; yearStart: YearStart; workflowId: number | null; workflows: Workflow[]; period: string; state: PeriodState | null;
  tokens: { submitter_id: string; stand_in_id: string | null }[]; people: Profile[]; isOwner: boolean;
}) {
  const [pending, start] = useTransition();
  const wf = workflows.find((w) => w.id === workflowId);
  const name = (id: string | null) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "nobody";
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });
  const field = "h-8 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm disabled:opacity-70";
  return (
    <section className="stock rounded-[var(--radius-card)] p-5 text-sm">
      <h2 className="mb-1 flex items-center gap-2 font-medium"><GitPullRequestArrow aria-hidden className="size-4" /> Workflow</h2>
      <select aria-label="Workflow" disabled={!isOwner || pending} value={workflowId ?? ""} onChange={(e) => run(() => setMetricWorkflow(metric.id, e.target.value ? Number(e.target.value) : null), "Workflow set")} className={field}>
        <option value="">None: values publish as they come</option>
        {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {wf && (
        <div className="mt-3 space-y-1 text-xs">
          <p><span className="font-medium">{periodLabel(period, metric.period, yearStart)}</span>, due {formatDate(dueDate(period, metric.period, wf.config))}: {state ? STATE[state.state] : "not started"}.</p>
          {state?.note && <p className="text-muted-foreground">{state.note}</p>}
          <Link href={`/workflows?id=${wf.id}`} className="underline">Open {wf.name}</Link>
        </div>
      )}
      {isOwner && (
        <div className="mt-3">
          {state?.state === "locked" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { const r = window.prompt(`Why unlock ${periodLabel(period, metric.period, yearStart)}? It shows in the history.`); if (r) run(() => lockPeriod(metric.id, period, false, r), "Unlocked"); }}><LockOpen aria-hidden /> Unlock {periodLabel(period, metric.period, yearStart, true)}</Button>
          ) : state?.state === "approval" || state?.state === "submitted" ? (
            // A Lock never stands in for an Approval (the core refuses it too): say why there is no Lock button.
            <p className="text-muted-foreground">{periodLabel(period, metric.period, yearStart)} can be locked once its value is approved.</p>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => lockPeriod(metric.id, period, true), "Locked")}><Lock aria-hidden /> Lock {periodLabel(period, metric.period, yearStart, true)}</Button>
          )}
        </div>
      )}
      {tokens.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1.5 text-xs font-medium">Stand-ins</div>
          <ul className="space-y-1.5">
            {tokens.map((t) => (
              <li key={t.submitter_id} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-xs">
                <span>For {name(t.submitter_id)}</span>
                <select aria-label={`Stand-in for ${name(t.submitter_id)}`} disabled={!isOwner || pending} value={t.stand_in_id ?? ""} onChange={(e) => run(() => setStandIn(metric.id, t.submitter_id, e.target.value || null))} className={field}>
                  <option value="">Nobody</option>
                  {people.filter((p) => p.id !== t.submitter_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
