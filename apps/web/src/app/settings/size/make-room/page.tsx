// Make room (spec 0029, ticket #270; GLOSSARY: Archived Metric, Size): Ziffr Cloud sends an Owner here before a
// smaller Size, with the number of Metrics it allows (?to=50). The page names the Metrics to archive, the ones whose
// latest value is oldest first, ticked until enough are. Owners and Admins only; only Metrics they see.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { makeRoomPlan, roomTarget } from "@ziffr/core/make-room";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { MakeRoomForm } from "./form";

export default async function MakeRoomPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const [sp, actor, demo] = await Promise.all([searchParams, currentActor(), isDemo()]);
  if (demo) notFound();
  let plan;
  try {
    plan = await makeRoomPlan(actor, roomTarget(sp.to));
  } catch (e) {
    if (e instanceof Forbidden) notFound();
    throw e;
  }
  const n = (x: number) => x.toLocaleString("en-US");
  return (
    <>
      <PageHeader title="Make room" sub={`The smaller Size allows ${n(plan.to)} Metrics. This Workspace holds ${n(plan.metrics)}, Archived Metrics not counted.`} />
      <div className="max-w-2xl space-y-4 text-sm">
        {plan.need === 0 ? (
          <p>It fits already: nothing needs to be archived. <Link href="/settings/workspace#size" className="underline underline-offset-2">Back to Size and usage</Link></p>
        ) : (
          <>
            <p>Archive {n(plan.need)} Metric{plan.need === 1 ? "" : "s"} to fit. An Archived Metric keeps its values and history, is asked for nothing and can be brought back later. The ones whose latest value is oldest are ticked first; change the ticks as you like.</p>
            {plan.hidden > 0 && <p className="text-[var(--color-ink-2)]">{n(plan.hidden)} more Metric{plan.hidden === 1 ? " is" : "s are"} not shared with you; only their owners can archive them.</p>}
            <MakeRoomForm offered={plan.offered} ticked={plan.ticked} need={plan.need} />
          </>
        )}
      </div>
    </>
  );
}
