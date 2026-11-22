// What Ziffr holds after a scenario (ticket #614; GLOSSARY: Metric, Asking Schedule, Submitter, Observation): read from
// the database the way the test fixtures do, so the eval judges the result and not what the assistant said it did.
import { db } from "@ziffr/core/db";
import type { AskingSchedule } from "@ziffr/core/types";
import { valuesOf } from "@ziffr/core/test/db-fixtures";

/** One Metric of the Workspace as the checks see it. */
export type MetricState = { slug: string; name: string; period: string; unit: string; polarity: string; formula: string | null; asking: AskingSchedule | null; submitters: string[]; values: number[] };
/** Everything a scenario's checks may look at. */
export type EvalState = { personId: string; teammateIds: string[]; metrics: MetricState[]; toolErrors: string[]; lastWords: string };
/** One assertion and its result; `detail` says what was found when it failed. */
export type Check = { name: string; ok: boolean; detail: string };

/** The Workspace's Metrics with their Asking Schedule, Submitters and recorded values (never touches other Workspaces). */
export async function readMetrics(workspaceId: string): Promise<MetricState[]> {
  const { data: rows } = await db().from("metrics").select("id, slug, name, period, unit, polarity, formula, workflow_id").eq("workspace_id", workspaceId).order("id");
  const out: MetricState[] = [];
  for (const m of rows ?? []) {
    const { data: workflow } = m.workflow_id ? await db().from("workflows").select("config").eq("id", m.workflow_id).maybeSingle() : { data: null };
    const { data: tokens } = await db().from("tokens").select("submitter_id").eq("metric_id", m.id);
    out.push({
      slug: m.slug, name: m.name, period: m.period, unit: m.unit ?? "", polarity: m.polarity, formula: m.formula ?? null,
      asking: (workflow?.config as { asking?: AskingSchedule } | null)?.asking ?? null,
      submitters: [...new Set((tokens ?? []).map((t) => t.submitter_id as string))],
      values: (await valuesOf(m.id)).map((v) => v.value),
    });
  }
  return out;
}
