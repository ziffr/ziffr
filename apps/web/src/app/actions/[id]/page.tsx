import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, PencilLine, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getNumberStyle, getProfileMap, getYearStart } from "@/lib/data";
import { currentActor, viewerId } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { actionThread } from "@ziffr/core/page-data";
import { formatDate, formatValue } from "@ziffr/core/format";
import { decideCorrection, replyToAction, setActionStatus } from "@/app/actions";
import { markTaskDone } from "@/app/canvas-actions";
import { AnsweredButton } from "@/components/answered-form";
import { MetricChart } from "@/views/metric-chart";
import { Avatar } from "@/components/avatar";
import { StatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadMessage } from "@ziffr/core/types";
import { CONNECTORS, type ConnectorId } from "@ziffr/core/connectors/index";
import { ApprovalBar } from "@/components/approval-bar";
import { SelfCheckBar } from "@/components/self-check-bar";
import { periodLabel } from "@ziffr/core/periods";
import { approvalQuestionForWeb } from "@ziffr/core/approval-question";
import { periodValueNotes } from "@ziffr/core/value-notes";
import { PeriodValueNotes } from "@/components/period-value-notes";
import { periodRecordUrl } from "@/lib/period-record-url";

export default async function ActionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  // Only an Action the viewer may read, with its Thread (GLOSSARY: Thread), decided in the core: the value it is
  // about, and the periods around it only for a viewer who sees the Metric (ticket 323).
  // "View as" exists only in the demo: elsewhere nobody can answer as someone else, so the hint is left out.
  const actor = await currentActor();
  const [thread0, people, viewer, yearStart, numberStyle, demo] = await Promise.all([actionThread(actor, id), getProfileMap(), viewerId(), getYearStart(), getNumberStyle(), isDemo()]);
  if (!thread0) notFound();
  const { action: a, metric: m, about, chartMetric, observation: obs, chart: window, seesMetric, messages: msgs, deliveries: sent, externalLinks } = thread0;
  const isAsker = viewer === a.asker_id;
  // A Self-check is decided only by Confirm or Correct: closed or reopened by hand, it would decide nothing and leave
  // the value waiting (the core refuses it too).
  const canCloseOrReopen = isAsker && a.purpose !== "self_check";
  const isAssignee = viewer === a.assignee_id;
  const isOwner = m !== null && viewer === m.owner_id;
  const thread = msgs as ThreadMessage[];
  // What changed against the period before: only from the periods around, which a viewer who does not see the Metric never gets.
  const at = window.findIndex((p) => p.period === a.period_start);
  const before = at > 0 ? window[at - 1] : null;
  const change = before && obs && before.value !== 0 ? (obs.value - before.value) / Math.abs(before.value) : null;
  // The period's Value Notes (spec 0064), always as they are now: beside the value an Approval or Self-check is about,
  // and for the owner who has accepted a Correction here, to say what is behind the new number. The core gives them only
  // to someone who is shown the value, whatever they may read of this Thread.
  const aboutValue = a.purpose === "approval" || a.purpose === "self_check" || (isOwner && thread.some((t) => t.correction_value !== null && t.correction_status === "accepted"));
  // The current ones alone: this page shows no history, so none goes to the browser.
  const notes = m && aboutValue ? await periodValueNotes(actor, m.id, a.period_start, { currentOnly: true }) : null;
  const deciding = a.purpose === "approval" && m !== null && isAssignee && a.status === "open";
  const noteBlock = m && notes ? (
    <PeriodValueNotes metricId={m.id} period={a.period_start} notes={notes} metric={{ decimals: m.decimals, unit: m.unit, unit_position: m.unit_position }} numberStyle={numberStyle}
      task={a.purpose === "approval" ? { changeAt: `${periodRecordUrl(m.slug, a.period_start)}#notes` } : "add"} className={deciding ? undefined : "mt-4"} />
  ) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/schedule" className="mb-3 inline-flex items-center gap-1 text-sm max-sm:min-h-11 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Schedule</Link>
      <div className="stock rounded-[var(--radius-card)] p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={a.status} kind={a.kind} />
          <span className="rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-1.5 py-0.5 text-xs font-medium capitalize">{a.kind}</span>
          {a.due_date && <span className="text-xs">due {formatDate(a.due_date)}</span>}
          {/* A Checklist Task has no Metric: it names its Workflow and period instead (spec 0045). */}
          {m === null ? <>{about?.workflow ? <Link href={`/workflows?id=${about.workflow.id}`} className="font-medium text-foreground hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">{about.workflow.name}</Link> : null}<span>{about?.period}</span></> : <>{seesMetric ? <Link href={`/metrics/${m.slug}`} className="font-medium text-foreground hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">{m.name}</Link> : <span className="font-medium text-foreground">{m.name}</span>}<span>{periodLabel(a.period_start, m.period, yearStart)}</span></>}
          {a.breakdown_label && <span>row <span className="font-medium text-foreground">{a.breakdown_label}</span></span>}
          {obs && m && <><span className="fig text-foreground">{formatValue(m, obs.value, numberStyle)}</span>{obs.original_value !== null && <span className="line-through">{formatValue(m, obs.original_value, numberStyle)}</span>}</>}
        </div>
        <div className="mt-3 flex gap-3">
          <Avatar p={people[a.asker_id]} />
          <div>
            <div className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{people[a.asker_id]?.name}</span> {a.kind === "task" ? "assigned" : "asked"} <span className="font-medium text-foreground">{people[a.assignee_id]?.name}</span> {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
            <h1 className="mt-0.5 text-lg font-semibold">{a.purpose === "approval" ? approvalQuestionForWeb(a.question) : a.question}</h1>
          </div>
        </div>
        {chartMetric && window.length > 1 && <div className="mt-4"><MetricChart numberStyle={numberStyle} metric={chartMetric} points={window} markers={[a.period_start]} height={180} yearStart={yearStart} /></div>}
        {externalLinks.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Also in {externalLinks.map((l, i) => <span key={`${l.system}-${i}`}>{i > 0 && ", "}{l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">{l.system}</a> : l.system}</span>)}
          </p>
        )}
        {!deciding && noteBlock}
        {deciding && m && (
          <ApprovalBar actionId={a.id} current={obs?.value ?? null}>
            {obs ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Value</dt><dd className="fig text-base font-semibold">{formatValue(m, obs.value, numberStyle)}</dd>
                <dt className="text-muted-foreground">Period</dt><dd>{periodLabel(a.period_start, m.period, yearStart)}</dd>
                {before && <><dt className="text-muted-foreground">Period before</dt><dd><span className="fig">{formatValue(m, before.value, numberStyle)}</span>{change !== null && <span className="ml-2 text-muted-foreground">{change >= 0 ? "up" : "down"} {Math.abs(change * 100).toFixed(1)} %</span>}</dd></>}
                <dt className="text-muted-foreground">Submitted by</dt><dd>{obs.submitter_id ? people[obs.submitter_id]?.name ?? "Someone who left" : "A program"}</dd>
              </dl>
            ) : null}
            {noteBlock}
          </ApprovalBar>
        )}
        {a.purpose === "self_check" && isAssignee && a.status === "open" && <SelfCheckBar actionId={a.id} value={obs?.value ?? null} />}
        {sent.length > 0 && (
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Sent {sent.length} time{sent.length === 1 ? "" : "s"} through connectors</summary>
            <ul className="mt-1.5 space-y-0.5">
              {sent.map((d) => (
                <li key={d.id}>{d.kind} to {people[d.recipient_id]?.name.split(" ")[0]} via {CONNECTORS[d.connector as ConnectorId]?.label}{d.external_ref ? ` (${d.external_ref})` : ""}, {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</li>
              ))}
            </ul>
            <Link href="/connectors/outbox" className="mt-1 inline-block underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">Outbox</Link>
          </details>
        )}
      </div>

      <ol className="mt-4 space-y-3">
        {thread.map((t) => (
          <li key={t.id} className="flex gap-3 stock rounded-[var(--radius-card)] p-4">
            <Avatar p={people[t.author_id]} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{people[t.author_id]?.name}</span>{t.via && <> via {t.via}</>}, {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</div>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{t.body}</p>
              {t.correction_value !== null && m && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 text-sm">
                  <PencilLine className="size-4 text-primary" />
                  Correction: <span className="line-through text-muted-foreground">{formatValue(m, obs?.original_value ?? obs?.value, numberStyle)}</span> → <span className="font-semibold">{formatValue(m, Number(t.correction_value), numberStyle)}</span>
                  {t.correction_status === "accepted" ? <span className="pressed ml-auto text-sm">Corrected</span> : <span className="ml-auto text-xs capitalize text-muted-foreground">{t.correction_status}</span>}
                  {t.correction_status === "proposed" && isOwner && (
                    <span className="flex gap-1.5">
                      <form action={decideCorrection.bind(null, t.id, true)}><Button type="submit" size="sm"><Check /> Accept</Button></form>
                      <form action={decideCorrection.bind(null, t.id, false)}><Button type="submit" size="sm" variant="outline"><X /> Decline</Button></form>
                    </span>
                  )}
                  {t.correction_status === "proposed" && !isOwner && <span className="w-full text-xs text-muted-foreground">Waiting for the metric owner, {people[m.owner_id]?.name.split(" ")[0]}, to accept.</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {a.status !== "closed" && (isAsker || isAssignee || isOwner) ? (
        <form action={replyToAction.bind(null, a.id)} className="mt-4 stock rounded-[var(--radius-card)] p-4">
          {isAsker && !isAssignee && a.status === "open" && (
            <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Waiting for {people[a.assignee_id]?.name.split(" ")[0]}.{demo && <> To answer as {people[a.assignee_id]?.name.split(" ")[0]}, switch “Viewing as” (at the bottom of the sidebar).</>}
            </p>
          )}
          <Textarea name="body" rows={3} placeholder={a.purpose === "checklist" && isAssignee ? "A note for the person who asked (optional)…" : isAssignee ? "Explain what happened…" : "Reply…"} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {obs && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <PencilLine className="size-4" /> Propose a correction
                <Input name="correction" type="number" step="any" inputMode="decimal" placeholder={String(obs.value)} className="h-8 w-32" />
              </label>
            )}
            <div className="ml-auto flex gap-2">
              {/* An Approval or Self-check is decided by its own buttons: marking it done would leave the value waiting. */}
              {isAssignee && a.kind === "task" && a.status === "open" && a.purpose !== "approval" && a.purpose !== "self_check" && <AnsweredButton action={markTaskDone.bind(null, a.id)} variant="outline">Mark done</AnsweredButton>}
              {canCloseOrReopen && !(a.purpose === "approval" && a.status === "open") && <Button formAction={setActionStatus.bind(null, a.id, "closed")} variant="outline" type="submit">Close Action</Button>}
              <Button type="submit">Reply</Button>
            </div>
          </div>
        </form>
      ) : a.status === "closed" ? (
        <div className="mt-4 flex items-center justify-between rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">
          Closed.
          {canCloseOrReopen && <form action={setActionStatus.bind(null, a.id, "open")}><Button type="submit" variant="outline" size="sm">Reopen</Button></form>}
        </div>
      ) : (
        <p className="mt-4 rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">
          You’re viewing as {people[viewer]?.name}. Switch “Viewing as” to {people[a.assignee_id]?.name.split(" ")[0]} (at the bottom of the sidebar) to answer this.
        </p>
      )}
    </div>
  );
}
