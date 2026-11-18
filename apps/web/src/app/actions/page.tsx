import Link from "next/link";
import { getMetrics, getProfileMap, getYearStart } from "@/lib/data";
import { viewerId } from "@/lib/viewer";
import { readableActions } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { StatusBadge } from "@/components/status";
import type { Action } from "@ziffr/core/types";
import { periodLabel } from "@ziffr/core/periods";

export default async function ActionsPage() {
  const [actions, metrics, people, viewer, yearStart] = await Promise.all([viewerId().then((v) => readableActions(v)), getMetrics(), getProfileMap(), viewerId(), getYearStart()]);
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const groups: { title: string; hint: string; list: Action[] }[] = [
    { title: "Waiting for your answer", hint: "Actions assigned to you", list: actions.filter((a) => a.assignee_id === viewer && a.status === "open") },
    { title: "Answered or done, waiting for you to close", hint: "Actions you asked", list: actions.filter((a) => a.asker_id === viewer && a.status === "answered") },
    { title: "Everything else", hint: "", list: actions.filter((a) => !((a.assignee_id === viewer && a.status === "open") || (a.asker_id === viewer && a.status === "answered"))) },
  ];
  return (
    <>
      <PageHeader title="Actions" sub={`Questions and Tasks about specific values. Ask them from any widget’s ⋯ menu. You’re viewing as ${people[viewer]?.name}.`} />
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold">{g.title} <span className="font-normal text-muted-foreground">{g.list.length}</span></h2>
            {g.list.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">Nothing here.</p> : (
              <ul className="overflow-hidden stock rounded-[var(--radius-card)]">
                {g.list.map((a) => {
                  const m = byId[a.metric_id];
                  return (
                    <li key={a.id} className="border-b border-border last:border-0">
                      <Link href={`/actions/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--color-paper-2)]">
                        <StatusBadge status={a.status} kind={a.kind} />
                        {a.kind === "task" && <span className="rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-1.5 text-xs text-[var(--color-ink-2)]">Task{a.due_date ? `, due ${a.due_date.slice(5)}` : ""}</span>}
                        <span className="min-w-[12rem] flex-1 font-medium">{a.question}</span>
                        <span className="text-xs text-muted-foreground">{m?.name}, {m && periodLabel(a.period_start, m.period, yearStart, true)}</span>
                        <span className="flex items-center gap-1 text-xs"><Person p={people[a.asker_id]} /> asked <Person p={people[a.assignee_id]} /></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
