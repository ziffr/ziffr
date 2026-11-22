// "Asked by me" (GLOSSARY: Schedule, Action, Question, Task): the Questions and Tasks the person asked: answered ones
// waiting for them to close, open ones waiting for a reply, and Done, folded, grey and ticked, never red. The core
// decides what this person may read; this only draws it.
import Link from "next/link";
import { Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { approvalQuestionForWeb } from "@ziffr/core/approval-question";
import type { Profile } from "@ziffr/core/types";
import type { AskedRow } from "@ziffr/core/actions-overview";
import { Person } from "@/components/avatar";
import { StatusBadge } from "@/components/status";
import { cn } from "@/lib/utils";

type People = Record<string, Profile | undefined>;

function Row({ a, people, quiet }: { a: AskedRow; people: People; quiet?: boolean }) {
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

/** The three groups of what the person asked. */
export function AskedView({ rows, people }: { rows: AskedRow[]; people: People }) {
  const groups = [
    { id: "answered", title: "Answered, waiting for you to close", list: rows.filter((r) => r.group === "answered") },
    { id: "open", title: "Open, waiting for a reply", list: rows.filter((r) => r.group === "open") },
  ];
  const done = rows.filter((r) => r.group === "done");
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.id} aria-label={g.title}>
          <h2 className="mb-2 text-sm font-semibold">{g.title} <span className="font-normal text-muted-foreground">{g.list.length}</span></h2>
          {g.list.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">Nothing here.</p> : (
            <ul className="overflow-hidden stock rounded-[var(--radius-card)]">{g.list.map((a) => <Row key={a.id} a={a} people={people} />)}</ul>
          )}
        </section>
      ))}
      <details aria-label="Done">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Check aria-hidden className="size-4 text-muted-foreground" />Done <span className="font-normal text-muted-foreground">{done.length}</span></summary>
        {done.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing here.</p> : (
          <ul className="mt-2 overflow-hidden stock rounded-[var(--radius-card)]">{done.map((a) => <Row key={a.id} a={a} people={people} quiet />)}</ul>
        )}
      </details>
    </div>
  );
}
