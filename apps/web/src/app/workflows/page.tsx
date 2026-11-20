import { format } from "date-fns";
import { currentActor } from "@/lib/viewer";
import { getProfiles, getYearStart } from "@/lib/data";
import { workflowsView } from "@ziffr/core/page-data";
import { workflowSchedule } from "@ziffr/core/workflows";
import { listWorkflowTemplates } from "@ziffr/core/workflow-templates";
import { can } from "@ziffr/core/actor";
import { isDemo } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { WorkflowsScreen } from "./screen";
import type { PeriodState, Workflow } from "@ziffr/core/types";

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ id?: string; asOf?: string }> }) {
  const sp = await searchParams;
  const actor = await currentActor();
  const viewer = actor.personId;
  // Only Metrics this viewer may see, decided in the core, and only what the page shows of them.
  const [people, { workflows, states, tokens, feeds, metrics: seen, assigned }, demo, yearStart] = await Promise.all([getProfiles(), workflowsView(actor), isDemo(), getYearStart()]);
  // A real workspace runs on the clock; the demo pretends a day instead.
  const schedule = demo ? null : await workflowSchedule(actor);
  const metrics = seen.map((m) => ({ id: m.id, name: m.name, slug: m.slug, period: m.period }));
  const list = workflows as Workflow[];
  const current = list.find((w) => w.id === Number(sp.id)) ?? list[0] ?? null;
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : format(new Date(), "yyyy-MM-dd");
  return (
    <>
      <PageHeader title="Workflows" sub="The path a value takes each period: who is asked, when they are reminded, who steps in, which values need approval, and when a period locks." />
      <WorkflowsScreen
        key={current ? `${current.id}-${current.updated_at}` : "new"}
        viewer={viewer}
        people={people}
        metrics={metrics.map((m) => ({ ...m, workflow_id: assigned.find((a) => a.id === m.id)?.workflow_id ?? null }))}
        workflows={list}
        current={current}
        states={states as PeriodState[]}
        tokens={tokens}
        feeds={feeds}
        asOf={schedule ? schedule.today : asOf}
        schedule={schedule}
        canRun={actor.role === "owner" || actor.role === "admin"}
        yearStart={yearStart}
        templates={await listWorkflowTemplates(actor)}
        canCreate={can(actor, "create")}
      />
    </>
  );
}
