// The Actions page (GLOSSARY: Action, Question, Task, Assignee, Period Timeline): two views, switched at the top. The
// Inbox says what the person has to do now; the Timeline says what happened, in what order. Both come from the core,
// which decides what this person may see; the choices live in the address so a view can be linked.
import Link from "next/link";
import { Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { approvalQuestionForWeb } from "@ziffr/core/approval-question";
import { actionsInbox, actionsTimeline, type InboxRow, type InboxScope } from "@ziffr/core/actions-overview";
import { getProfileMap } from "@/lib/data";
import { currentActor, viewerId } from "@/lib/viewer";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { StatusBadge } from "@/components/status";
import { listShareProposals } from "@ziffr/core/share-proposals";
import { ShareProposalButtons } from "@/components/share-proposal-buttons";
import { ProposalFacts, proposalTitle } from "@/components/share-proposal-summary";
import { TimelineList } from "./actions-timeline-view";
import { cn } from "@/lib/utils";

type Params = { view?: string; scope?: string; kind?: string; workflow?: string; metric?: string; period?: string };

const SCOPES: { id: InboxScope; label: string }[] = [{ id: "mine", label: "Mine" }, { id: "asked", label: "Asked by me" }, { id: "all", label: "All" }];
const KINDS = [{ id: "", label: "Question and Task" }, { id: "question", label: "Question" }, { id: "task", label: "Task" }];

/** The address of this page with some choices changed; empty ones are left out. */
function href(sp: Params, change: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/actions?${s}` : "/actions";
}

/** A row of choices: links, the chosen one marked with `aria-current` and bold, not by colour. */
function Choices({ label, options, current, make }: { label: string; options: { id: string; label: string }[]; current: string; make: (id: string) => string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1 text-sm">
      {options.map((o) => (
        <Link key={o.id} href={make(o.id)} aria-current={o.id === current ? "true" : undefined} className={cn("rounded-[var(--radius-input)] border px-2 py-0.5", o.id === current ? "border-foreground font-semibold" : "border-[var(--color-rule-2)] text-muted-foreground hover:text-foreground")}>{o.label}</Link>
      ))}
    </nav>
  );
}

/** A native select that reloads the page with the choice: a form with a button, no script. */
function Pick({ name, label, value, options, sp }: { name: keyof Params; label: string; value: string; options: { id: string; label: string }[]; sp: Params }) {
  return (
    <form action="/actions" className="flex items-center gap-1 text-sm">
      {Object.entries(sp).filter(([k, v]) => k !== name && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="text-muted-foreground" htmlFor={`pick-${name}`}>{label}</label>
      <select id={`pick-${name}`} name={name} defaultValue={value} className="rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-card px-1.5 py-0.5">
        <option value="">All</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button type="submit" className="rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-2 py-0.5 text-muted-foreground hover:text-foreground">Show</button>
    </form>
  );
}

function Row({ a, people, quiet }: { a: InboxRow; people: Awaited<ReturnType<typeof getProfileMap>>; quiet?: boolean }) {
  return (
    <li className="border-b border-border last:border-0">
      <Link href={`/actions/${a.id}`} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--color-paper-2)]", quiet && "text-muted-foreground")}>
        <StatusBadge status={a.status} kind={a.kind} />
        {a.kind === "task" && <span className="rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-1.5 text-xs text-[var(--color-ink-2)]">Task{a.dueDate ? `, due ${a.dueDate.slice(5)}` : ""}</span>}
        <span className="min-w-[14rem] flex-1">
          <span className="block text-xs text-muted-foreground">{a.metricName}, {a.periodLabel}</span>
          <span className={cn("block", !quiet && "font-medium")}>{a.isApproval ? approvalQuestionForWeb(a.question) : a.question}</span>
        </span>
        {a.value && (
          <span className="text-xs">
            <span className="fig">{a.value}</span>
            {a.changePercent !== null && <span className="ml-1 text-muted-foreground">{a.changePercent >= 0 ? "up" : "down"} {Math.abs(a.changePercent).toFixed(1)} %</span>}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-1 text-xs"><Person p={people[a.askerId]} /> asked <Person p={people[a.assigneeId]} /><span className="text-muted-foreground">, {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span></span>
      </Link>
    </li>
  );
}

export default async function ActionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const view = sp.view === "timeline" ? "timeline" : "inbox";
  const [people, actor, viewer] = await Promise.all([getProfileMap(), currentActor(), viewerId()]);
  const proposals = await listShareProposals(actor);
  const scope: InboxScope = sp.scope === "asked" || sp.scope === "all" ? sp.scope : "mine";
  const kind = sp.kind === "question" || sp.kind === "task" ? sp.kind : "";
  const num = (s?: string) => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);
  const day = sp.period && /^\d{4}-\d{2}-\d{2}$/.test(sp.period) ? sp.period : null;

  const inbox = view === "inbox" ? (await actionsInbox(actor, scope)).filter((a) => !kind || a.kind === kind) : [];
  const timeline = view === "timeline" ? await actionsTimeline(actor, { workflowId: num(sp.workflow), metricId: num(sp.metric), period: day }) : null;
  const groups = [
    { id: "needs_you", title: "Needs you", hint: "Questions waiting for your answer, and answered items waiting for you to close", list: inbox.filter((a) => a.group === "needs_you") },
    { id: "waiting", title: "Waiting on others", hint: "Asked, and no reply yet", list: inbox.filter((a) => a.group === "waiting") },
  ];
  const done = inbox.filter((a) => a.group === "done");

  return (
    <>
      <PageHeader title="Actions" sub={`Questions and Tasks about specific values. Ask them from any widget’s ⋯ menu. You’re viewing as ${people[viewer]?.name}.`} />
      <div className="space-y-6">
        <Choices label="View" current={view} options={[{ id: "inbox", label: "Inbox" }, { id: "timeline", label: "Timeline" }]} make={(id) => href({}, { view: id === "timeline" ? "timeline" : "" })} />
        {proposals.length > 0 && (
          <section aria-label="Share Proposals">
            <h2 className="mb-2 text-sm font-semibold">Waiting for your confirmation <span className="font-normal text-muted-foreground">{proposals.length}</span></h2>
            <p className="mb-2 text-xs text-muted-foreground">An assistant or program prepared these. Nothing is shared or sent until you confirm.</p>
            <ul className="overflow-hidden stock rounded-[var(--radius-card)]">
              {proposals.map((p) => (
                <li key={p.id} className="space-y-3 border-b border-border px-4 py-3 last:border-0">
                  <p className="font-medium">{proposalTitle(p)}</p>
                  <ProposalFacts p={p} />
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/actions/share/${p.id}`} className="text-sm font-medium underline">{p.kind === "view_link" ? "See what they will see, and confirm" : "Review and confirm"}</Link>
                    <ShareProposalButtons id={p.id} showConfirm={false} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {view === "inbox" ? (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Choices label="Whose" current={scope} options={SCOPES} make={(id) => href(sp, { scope: id === "mine" ? "" : id })} />
              <Choices label="Kind" current={kind} options={KINDS} make={(id) => href(sp, { kind: id })} />
            </div>
            {groups.map((g) => (
              <section key={g.id} aria-label={g.title}>
                <h2 className="text-sm font-semibold">{g.title} <span className="font-normal text-muted-foreground">{g.list.length}</span></h2>
                <p className="mb-2 text-xs text-muted-foreground">{g.hint}</p>
                {g.list.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">Nothing here.</p> : (
                  <ul className="overflow-hidden stock rounded-[var(--radius-card)]">{g.list.map((a) => <Row key={a.id} a={a} people={people} />)}</ul>
                )}
              </section>
            ))}
            <details aria-label="Done" className="group">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Check aria-hidden className="size-4 text-muted-foreground" />Done <span className="font-normal text-muted-foreground">{done.length}</span></summary>
              {done.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing here.</p> : (
                <ul className="mt-2 overflow-hidden stock rounded-[var(--radius-card)]">{done.map((a) => <Row key={a.id} a={a} people={people} quiet />)}</ul>
              )}
            </details>
          </>
        ) : timeline && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Pick name="workflow" label="Workflow" value={sp.workflow ?? ""} options={timeline.workflows.map((w) => ({ id: String(w.id), label: w.name }))} sp={{ ...sp, view: "timeline" }} />
              <Pick name="metric" label="Metric" value={sp.metric ?? ""} options={timeline.metrics.map((m) => ({ id: String(m.id), label: m.name }))} sp={{ ...sp, view: "timeline" }} />
              <Pick name="period" label="Period" value={day ?? ""} options={timeline.periods.map((p) => ({ id: p.start, label: p.label }))} sp={{ ...sp, view: "timeline" }} />
            </div>
            <TimelineList timeline={timeline} />
          </>
        )}
      </div>
    </>
  );
}
