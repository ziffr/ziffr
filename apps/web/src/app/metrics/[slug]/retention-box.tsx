// A Metric's Retention box on its Settings tab (GLOSSARY: Retention; spec 0033, ticket #381): what is in force, what waits
// for its first day, and the form for those who may set it. The core says who may and what the setting is.
import { currentActor } from "@/lib/viewer";
import { MetricRetention } from "@/components/retention-form";
import { retentionFor } from "@ziffr/core/retention-setting";
import type { Metric } from "@ziffr/core/types";

/** The Retention box: Owners, Admins and the Metric Owner see the form, everyone else the setting; never in the demo. */
export async function RetentionBox({ metric, demo }: { metric: Metric; demo: boolean }) {
  const actor = await currentActor();
  const kept = await retentionFor(actor, metric.id);
  return <MetricRetention metricId={metric.id} name={metric.name} period={metric.period} aggregation={metric.aggregation} retention={kept.retention} pending={kept.pending} canSet={kept.canSet && !demo} />;
}
