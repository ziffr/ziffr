// What a visitor of the demo may do with Metrics, Targets, Questions, Groups and Shares (GLOSSARY: Demo Mode, Metric, Derived
// Metric, Target Series, Projection, Tag, Group, Share, Task; spec 0051, ticket 11). The gates the operations of metrics.ts,
// derived-metrics.ts, tags.ts, team.ts, sharing.ts, questions.ts and archived-metrics.ts ask before their first write, under the
// core's rule that the core is the one place data is changed. Every gate does nothing outside a demo visit (the setting in effect
// and the visit's client), so a real Workspace, the seed and the demo with the setting off behave exactly as before; in a visit a
// change that passes none of them is refused in plain words before anything is written. The database holds the same lines as
// its backstop (the words trigger, the showcase, the row caps of migration 20270130090000).
import { type Actor } from "./actor";
import { demoCount, demoData } from "./demo-query";
import { db } from "./db";
import { DemoLimit, DemoReadOnly, DemoShowcase } from "./demo";
import { DEMO_METRIC_LIMITS, DEMO_ROW_CAPS } from "./demo-limits";
import { madeBySeed } from "./demo-seeded-rows";
import { DemoTextRefused, inDemoVisit } from "./demo-visitor-words";
import { DEMO_METRIC_WORDS } from "./demo-words";
import { formulaInputs } from "./formula";
import { DEMO_WORKSPACE_ID } from "./team";

/** For an operation that a demo visit may do (its server action is open in demo-changes.ts) but nothing else in the demo may (an API
 * call, a restore): refuses the demo unless this is a visit. Replaces a bare `refuseInDemo(actor)`, which refuses a visit too. */
export function refuseInDemoOutsideVisit(actor: Pick<Actor, "workspaceId">): void {
  if (actor.workspaceId === DEMO_WORKSPACE_ID && !inDemoVisit(actor)) throw new DemoReadOnly();
}

/** The tables whose seeded rows a visitor may not archive, hand over, share or put people into: what the seed made is everyone's. */
type Kept = "metrics" | "groups" | "dashboards" | "decks";

/** In a visit, refuses (in the showcase's words) a thing the seed made: the Metric to archive or share, the Group to put people in,
 * the dashboard or deck to share. A visitor's own are theirs. The database refuses the showcase and the seed's words as well. */
export async function refuseSeededOne(actor: Pick<Actor, "workspaceId">, table: Kept, id: number): Promise<void> {
  if (inDemoVisit(actor) && (await madeBySeed(table, id))) throw new DemoShowcase();
}

/** A number a visitor types as a target or the value of a series: finite and at most a million million, so that a sum or a ratio of
 * them stays small. Unchanged outside a visit. */
export function visitorNumber(actor: Pick<Actor, "workspaceId">, n: number | null | undefined): void {
  if (!inDemoVisit(actor) || n === null || n === undefined) return;
  if (!Number.isFinite(n) || Math.abs(n) > DEMO_METRIC_LIMITS.numberMax) throw new DemoTextRefused(DEMO_METRIC_WORDS.number);
}

/** A formula a visitor writes: short, over few Metrics, with few operations. A formula is code-like and the Metric is computed again
 * whenever an input changes, so the demo holds it to less than the grammar allows (formula.ts: 500 characters, 50 operations).
 * Its grammar already reads only + - * /, brackets, numbers and {slug}, and no input is itself a Derived Metric, so it never
 * nests and cannot cycle. Unchanged outside a visit. */
export function visitorFormula(actor: Pick<Actor, "workspaceId">, formula: string): void {
  if (!inDemoVisit(actor)) return;
  // The hyphens inside a {slug} are not operations.
  const operations = formula.replace(/\{[a-z0-9-]+\}/g, "").match(/[-+*/]/g)?.length ?? 0;
  if (formula.length > DEMO_METRIC_LIMITS.formulaChars || formulaInputs(formula).length > DEMO_METRIC_LIMITS.formulaInputs || operations > DEMO_METRIC_LIMITS.formulaOperations) {
    throw new DemoTextRefused(DEMO_METRIC_WORDS.formula);
  }
}

/** Refuses, before a Derived Metric is made, when visitors made as many as the demo takes (the database counts too, as the backstop). */
export async function visitorDerivedRoom(actor: Pick<Actor, "workspaceId">): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const state = demoData(await db().from("demo_state").select("seed_done_at").maybeSingle());
  if (!state?.seed_done_at) throw new DemoLimit("starting");
  const count = demoCount(await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).not("formula", "is", null).gt("created_at", state.seed_done_at as string));
  if (count >= DEMO_ROW_CAPS.derived_metrics) throw new DemoLimit("derived_metrics");
}

/** A Target Series or Projection call a visitor makes: at most 60 rows (or periods), each a day within two years of today, and each
 * value a number of reasonable size. `rows` is what the browser sent, still unchecked; the core checks its shape as it always does. */
export function visitorSeries(actor: Pick<Actor, "workspaceId">, rows: unknown, now = new Date()): void {
  if (!inDemoVisit(actor)) return;
  if (!Array.isArray(rows) || rows.length > DEMO_METRIC_LIMITS.seriesRowsPerCall) throw new DemoTextRefused(DEMO_METRIC_WORDS.rows);
  const from = new Date(now); from.setUTCMonth(from.getUTCMonth() - DEMO_METRIC_LIMITS.seriesMonths);
  const to = new Date(now); to.setUTCMonth(to.getUTCMonth() + DEMO_METRIC_LIMITS.seriesMonths);
  for (const r of rows) {
    const day = typeof r === "string" ? r : (r as { period?: unknown } | null)?.period;
    const t = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T00:00:00Z`) : NaN;
    // A row the core cannot read is the core's to refuse in its own words; only a day that is read and out of range is ours.
    if (Number.isFinite(t) && (t < from.getTime() || t > to.getTime())) throw new DemoTextRefused(DEMO_METRIC_WORDS.rows);
    if (typeof r === "object" && r !== null) visitorNumber(actor, (r as { value?: unknown }).value as number);
  }
}

/** A Task's due date in a visit: within a year of today (the core checks its shape). Unchanged outside a visit. */
export function visitorDue(actor: Pick<Actor, "workspaceId">, due: string | null | undefined, now = new Date()): void {
  if (!inDemoVisit(actor) || !due) return;
  const t = Date.parse(`${due}T00:00:00Z`);
  if (Number.isFinite(t) && Math.abs(t - now.getTime()) > DEMO_METRIC_LIMITS.dueDays * 86_400_000) throw new DemoTextRefused(DEMO_METRIC_WORDS.due);
}

/** In a visit, refuses a person who is not a Member of the demo: only its made-up people are asked, take part or share. (A Contact or
 * a Feed's person is someone outside the demo's rows.) Unchanged outside a visit. */
export async function visitorMembersOnly(actor: Pick<Actor, "workspaceId">, personIds: string[]): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const ids = [...new Set(personIds.map(String))];
  if (!ids.length) return;
  const data = demoData(await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", ids));
  if ((data ?? []).length !== ids.length) throw new DemoTextRefused(DEMO_METRIC_WORDS.people);
}

/** The slug a Metric of a visitor gets: its name's, short, with a random ending, so no name can take a word the screens use for
 * themselves ("new"), a slug of the seed's, or one that a visitor asked for (the slug is in the address and in formulas). */
export function visitorSlug(base: string, random: string): string {
  return `${base.slice(0, 40).replace(/-+$/, "") || "metric"}-${random}`;
}
