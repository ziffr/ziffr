import Link from "next/link";
import { getActions, getMetrics, getProfileMap } from "@/lib/data";
import { viewerId } from "@/lib/viewer";
import { periodLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { StatusBadge } from "@/components/status";
import type { Action } from "@/lib/types";

export default async function ActionsPage() {
  const [actions, metrics, people, viewer] = await Promise.all([getActions(), getMetrics(), getProfileMap(), viewerId()]);
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const groups: { title: string; hint: string; list: Action[] }[] = [
    { title: "Waiting for your answer", hint: "Actions assigned to you", list: actions.filter((a) => a.assignee_id === viewer && a.status === "open") },
    { title: "Answered, waiting for you to close", hint: "Actions you asked", list: actions.filter((a) => a.asker_id === viewer && a.status === "answered") },
    { title: "Everything else", hint: "", list: actions.filter((a) => !((a.assignee_id === viewer && a.status === "open") || (a.asker_id === viewer && a.status === "answered"))) },
  ];
  return (
    <>
      <PageHeader title="Actions" sub={`Questions and tasks about specific values. You’re viewing as ${people[viewer]?.name}.`} />
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold">{g.title} <span className="font-normal text-muted-foreground">{g.list.length}</span></h2>
            {g.list.length === 0 ? <p className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">Nothing here.</p> : (
              <ul className="overflow-hidden rounded-xl border bg-background">
                {g.list.map((a) => {
                  const m = byId[a.metric_id];
                  return (
                    <li key={a.id} className="border-b last:border-0">
                      <Link href={`/actions/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                        <StatusBadge status={a.status} />
                        <span className="min-w-0 flex-1 font-medium">{a.question}</span>
                        <span className="text-xs text-muted-foreground">{m?.name} · {m && periodLabel(a.period_start, m.period, true)}</span>
                        <span className="flex items-center gap-1 text-xs"><Person p={people[a.asker_id]} /> → <Person p={people[a.assignee_id]} /></span>
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
