// The Setup Guide's Starting point, from a Pack (spec 0052, ticket 6; GLOSSARY: Setup Guide, Pack, Metric Catalog, Metric
// Owner): after Ziffr's own Pack is installed, "Set up from this Pack" makes the person's first Metrics from its Metric
// Catalog entries in place, through the one operation that does it on the Packs page (setUpFromPack: the Workspace Limit
// and the Trial Limits, the Audit Log, Submitters), and notes the first Metric made as the guide's Metric. Owners and
// Admins only, never through a key, never in the demo. Asking twice never makes a Metric twice: an entry that already
// became a Metric of this Workspace is left alone. Nothing here is sent anywhere; only ids and names come back.
import type { Actor } from "./actor";
import { assertCan, Forbidden } from "./actor";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { setUpFromPack, type PackSetupInput, type PackSetupResult } from "./pack-setup";
import { formulaInputs } from "./formula";
import { startSetupGuide } from "./setup-guide";
import { openRows } from "./sealed-columns";
import { canSee } from "./sharing";

/** What setting up from the guide made, and what was there from an earlier click. */
export type GuidePackSetupResult = PackSetupResult & {
  /** Metrics of this install that already existed, so were not made again. */
  existing: { id: number; name: string; slug: string; key: string; takesValues: boolean }[];
  /** The Metric the guide now tries both ways (the first one made, or the one it already had). */
  firstMetricId: number | null;
};

function assertManages(actor: Actor): void {
  if ((actor as { key?: unknown }).key || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("There is no Setup Guide here.");
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins set up the Workspace.");
  assertCan(actor, "create");
}

/** Makes the picked entries of an installed Pack into Metrics for the Setup Guide, leaving out any that already became a
 * Metric here (a second click is harmless), and records the first Metric as the guide's Metric when it has none. Everything
 * else (checks, limits, audit, the dashboard and Workflow when asked) is `setUpFromPack`'s. Owners and Admins only. */
export async function setUpGuideFromPack(actor: Actor, installId: number, input: PackSetupInput): Promise<GuidePackSetupResult> {
  assertManages(actor);
  if (!Number.isSafeInteger(installId) || installId <= 0) throw new Forbidden();
  const ws = actor.workspaceId;
  const { data: install } = await db().from("pack_installs").select("id").eq("id", installId).eq("workspace_id", ws).maybeSingle();
  if (!install) throw new Forbidden();

  // The entries of this install and the Metrics already made from them (an archived Metric was made all the same).
  const { data: entries } = await db().from("catalog_metrics").select("id, pack_key, formula, total").eq("workspace_id", ws).eq("pack_install_id", installId);
  const keyOf = new Map((entries ?? []).map((e) => [Number(e.id), String(e.pack_key)]));
  const formulaOf = new Map((entries ?? []).map((e) => [String(e.pack_key), (e.formula as string | null) ?? null]));
  const rows = keyOf.size ? (await db().from("metrics").select("id, name, slug, from_catalog_id").eq("workspace_id", ws).in("from_catalog_id", [...keyOf.keys()]).order("id")).data : [];
  const all = (await openRows("metrics", ws, rows)).map((m) => ({ id: Number(m.id), name: String(m.name), slug: String(m.slug), key: keyOf.get(Number(m.from_catalog_id))!, takesValues: !formulaOf.get(keyOf.get(Number(m.from_catalog_id))!) }));
  // Made already, whether or not the person sees it; only what they see is named back to them (visibility is the product).
  const have = new Set(all.map((m) => m.key));
  const existing: typeof all = [];
  for (const m of all) if (await canSee(actor, "metric", m.id)) existing.push(m);

  const asked = Array.isArray(input?.metrics) ? input.metrics.slice(0, 51).map(String) : [];
  const remaining = asked.filter((k) => !have.has(k));
  // A Derived Metric asked for again would make its inputs a second time: refuse in words, as the Packs page can handle it.
  for (const k of remaining) {
    const f = formulaOf.get(k);
    if (f && formulaInputs(f).some((i) => have.has(i))) throw new Error("A Metric computed from others cannot be added here once its inputs exist. Add it from the Packs page.");
  }

  let made: PackSetupResult = { metrics: [], dashboardId: null, workflowId: null, dashboards: [], workflows: [], shares: 0, messages: 0, later: { nextRun: 0, noWorkflow: [] }, widgets: 0, totals: 0, byHand: [], tagsLeftOut: [] };
  // Nothing left to make: the earlier click did it, and a dashboard or Workflow is not made a second time with it.
  if (remaining.length > 0) made = await setUpFromPack(actor, installId, { ...input, metrics: remaining });

  // The guide's Metric: the first one made that takes values (the First Metric step asks for values), else any; only when none is set.
  const pool = made.metrics.length ? made.metrics : existing;
  const first = pool.find((m) => m.takesValues) ?? pool[0] ?? null;
  if (first) {
    await startSetupGuide(actor);
    // Set the choice that the person's click made: the guide's Metric only when it has none, and the start as a Pack.
    await db().from("setup_guides").update({ first_metric_id: first.id, updated_at: new Date().toISOString() }).eq("workspace_id", ws).is("first_metric_id", null);
    await db().from("setup_guides").update({ starting_point: "pack", updated_at: new Date().toISOString() }).eq("workspace_id", ws).is("starting_point", null);
  }
  const { data: g } = await db().from("setup_guides").select("first_metric_id").eq("workspace_id", ws).maybeSingle();
  return { ...made, existing, firstMetricId: (g?.first_metric_id as number | null | undefined) ?? null };
}

/** A Metric made on the Metric Catalog's page with the guide's return link becomes the guide's Metric when it has none.
 * Quiet for anyone who is not an Owner or Admin and for a guide that already has a Metric; never throws on those. Only a
 * Metric of the actor's Workspace is taken. */
export async function adoptSetupFirstMetric(actor: Actor, metricId: number): Promise<void> {
  if ((actor as { key?: unknown }).key || actor.workspaceId === DEMO_WORKSPACE_ID || (actor.role !== "owner" && actor.role !== "admin")) return;
  if (!Number.isSafeInteger(metricId) || metricId <= 0) return;
  const { data: m } = await db().from("metrics").select("id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || !(await canSee(actor, "metric", metricId))) return;
  await startSetupGuide(actor);
  await db().from("setup_guides").update({ first_metric_id: metricId, updated_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId).is("first_metric_id", null);
}
