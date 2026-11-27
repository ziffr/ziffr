// The periods Ziffr asked for and still waits on, as a personal form link may record them (GLOSSARY: Prompt, Token,
// Stand-in, Schedule). A Workflow asks for the period that ended last, while a form link on its own records the running
// one: this reads, from Ziffr's own Prompts, which periods this one Token's holder was asked for and has not answered.
// Internal to the core: it checks no Actor. Its callers hold the Token (the form link's page and the intake), and only
// periods come out of it, never a value or a person.
import { db } from "./db";
import { isArchived } from "./metric-row";
import { isPeriodStart, type YearStart } from "./periods";
import { periodsStillDue, scheduleReach } from "./schedule";
import type { Metric, Token } from "./types";
import { allRows, mustRead } from "./workspace-data";

/** The most Prompts looked at for one form: far more than the reminders of every period the Schedule still reaches. */
const PROMPTS_READ = 1000;

/** Of one Metric, the first days of the periods up to the running one (`current`) that were asked of this Token and are
 * still due, newest first. A request counts only for the Token it was sent for: a Stand-in's Token takes the Prompts
 * sent in that submitter's place, a person's own Token the others. None for a Metric that takes no form values. */
export async function askedPeriods(ws: string, metric: Metric, token: Pick<Token, "submitter_id" | "stands_in_for">, current: string, yearStart: YearStart): Promise<string[]> {
  if (metric.formula || isArchived(metric) || !metric.sources.includes("web_form")) return [];
  const prompts = db().from("prompts").select("period_start").eq("workspace_id", ws).eq("metric_id", metric.id).eq("submitter_id", token.submitter_id).is("answered_at", null).lte("period_start", current);
  const mine = token.stands_in_for ? prompts.eq("stands_in_for", token.stands_in_for) : prompts.is("stands_in_for", null);
  const { data, error } = await mine.order("period_start", { ascending: false }).limit(PROMPTS_READ);
  // Never read as "nothing waiting": the value would then be recorded for the running period without a word.
  if (error) throw new Error("What was asked for could not be read. Try again in a moment.");
  // A Prompt from before the Metric's period was changed may name no period of it any more.
  const starts = [...new Set((data ?? []).map((p) => String(p.period_start)))].filter((s) => isPeriodStart(s, metric.period, yearStart));
  return periodsStillDue(ws, metric, starts);
}

/** One Metric a person records for: the Token they record by, the periods a form offers and those that hold a value. */
export type Recordable = { metric: Metric; token: Pick<Token, "stands_in_for">; starts: readonly string[]; has: { has(period: string): boolean } };

/** For each of these Metrics, by its id, the first day of the oldest period among those offered that the person was asked
 * for and still owes: where Record a value starts. One read of the requests for all. A request counts only for the Token
 * it was sent for, as above. Internal to the core: it checks no Actor, and `person` must be the one asking. */
export async function oldestAsked(ws: string, person: string, wanted: readonly Recordable[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!wanted.length) return out;
  const rows = await allRows<{ metric_id: number; period_start: string; stands_in_for: string | null }>((from, to) =>
    mustRead(db().from("prompts").select("metric_id, period_start, stands_in_for").eq("workspace_id", ws).eq("submitter_id", person).in("metric_id", wanted.map((w) => w.metric.id)).is("answered_at", null).order("period_start").order("id").range(from, to), "What was asked for could not be read. Try again in a moment."),
  );
  if (!rows.length) return out;
  const reaches = await scheduleReach(ws);
  for (const { metric, token, starts, has } of wanted) {
    const found = rows.find((r) => r.metric_id === metric.id && (r.stands_in_for ?? null) === (token.stands_in_for ?? null) && starts.includes(r.period_start) && !has.has(r.period_start) && reaches(metric, r.period_start));
    if (found) out.set(metric.id, found.period_start);
  }
  return out;
}
