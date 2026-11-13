import { format } from "date-fns";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getMetrics, getProfiles } from "@/lib/data";
import { visibleMetricIds } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { WorkflowsScreen } from "./screen";
import type { PeriodState, Workflow } from "@/lib/types";

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ id?: string; asOf?: string }> }) {
  const sp = await searchParams;
  const [viewer, people, all, { data: workflows }] = await Promise.all([viewerId(), getProfiles(), getMetrics(), db.from("workflows").select("*").order("id")]);
  // Only metrics this viewer may see, and only what the page shows of them.
  const ids = [...(await visibleMetricIds(viewer, all))];
  const [{ data: states }, { data: tokens }, { data: assigned }] = await Promise.all([
    db.from("period_states").select("*").in("metric_id", ids),
    db.from("tokens").select("metric_id, submitter_id, stand_in_id").in("metric_id", ids).is("stands_in_for", null),
    db.from("metrics").select("id, workflow_id").in("id", ids),
  ]);
  const metrics = all.filter((m) => ids.includes(m.id)).map((m) => ({ id: m.id, name: m.name, slug: m.slug, period: m.period }));
  const list = (workflows ?? []) as Workflow[];
  const current = list.find((w) => w.id === Number(sp.id)) ?? list[0] ?? null;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : format(new Date(), "yyyy-MM-dd");
  return (
    <>
      <PageHeader title="Workflows" sub="The path a value takes each period: who is asked, when they are reminded, who steps in, which values need approval, and when a period locks." />
      <WorkflowsScreen
        key={current ? `${current.id}-${current.updated_at}` : "new"}
        viewer={viewer}
        people={people}
        metrics={metrics.map((m) => ({ ...m, workflow_id: assigned?.find((a) => a.id === m.id)?.workflow_id ?? null }))}
        workflows={list}
        current={current}
        states={(states ?? []) as PeriodState[]}
        tokens={tokens ?? []}
        asOf={asOf}
      />
    </>
  );
}
