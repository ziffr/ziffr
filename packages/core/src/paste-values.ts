// Paste values (spec 0026; GLOSSARY: Observation, Token, Submission Rule, Lock, Unusual Value, Approval, Import): a
// signed-in person's paste from a spreadsheet, previewed without writing and then recorded value by value through
// submitValue, on the web form, through a Token they hold. Only Metrics they may see are read, so one they cannot
// see is never named; only Metrics they submit for are recorded. "Record as history" makes a paste an Import, only
// for its Metric Owner or an Owner or Admin who submits for it, and only for past periods without a value.
import { format } from "date-fns";
import { Forbidden, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { targetFor } from "./compare";
import { db } from "./db";
import { yearStartOf } from "./fiscal-year";
import { formatValue } from "./format";
import { periodLabel, periodStart, shiftPeriod, type YearStart } from "./periods";
import { PASTE_LIMITS, pasteProblemText, pasteReadingText, readPaste, type PasteLayout, type PasteMetric, type PasteValue } from "./paste-reader";
import { peopleIn, submissionEffects, submitValue, type SubmissionEffects, type SubmissionResult } from "./submissions";
import { assertSeesMetrics } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { tokenValid, type TokenRow } from "./tokens";
import type { Metric } from "./types";
import { valueOutlook, type ValueOutlook } from "./workflow-engine";
import { unusualReasons } from "./workflow-rules";
import { getLatestObservations, getMetrics } from "./workspace-data";
import { answerReadingOf, numberStyleOf } from "./workspace-settings";
import type { NumberStyle } from "./number-style";

/** The most values one person may paste in any 24 hours, across all their pastes (spec 0026, "Limits"). */
export const PASTED_VALUES_PER_DAY = 10_000;

/** The same in the demo, where every visitor acts as the same made-up people: one visitor cannot use up a day for all
 * the others, nor fill the shared Workspace with values. */
export const PASTED_VALUES_PER_DAY_IN_DEMO = 500;

/** The day's limit for the actor's Workspace. */
const dailyLimit = (actor: Actor) => (actor.workspaceId === DEMO_WORKSPACE_ID ? PASTED_VALUES_PER_DAY_IN_DEMO : PASTED_VALUES_PER_DAY);

/** What a value of a paste does, or did: recorded as it stands, recorded as history (an Import), replacing, added to
 * or kept beside the value there, a proposed Correction for a Locked period, refused by the Submission Rule or for
 * being in the paste twice, or refused for another reason. Whether it asks for Approval is said beside it. */
export type PasteOutcome = "recorded" | "history" | "replaces" | "adds_up" | "kept_beside" | "locked" | "duplicate" | "refused";

const OUTCOMES: readonly PasteOutcome[] = ["recorded", "history", "replaces", "adds_up", "kept_beside", "locked", "duplicate", "refused"];

/** One value of a paste and what it does. Metric, period and earlier value are named only for a Metric the person
 * may see; for any other the row holds the cell's place and text and nothing more. */
export type PasteRow = {
  place: string;
  /** The value cell as it was pasted. */
  text: string;
  metric: { id: number; slug: string; name: string } | null;
  period: string | null;
  periodLabel: string | null;
  value: number | null;
  /** The value as Ziffr will store and show it, in the Workspace's Number Style and the Metric's unit. */
  valueText: string | null;
  /** The value there now, shown when this one replaces it, adds to it or is kept beside it. */
  before: string | null;
  outcome: PasteOutcome;
  /** Why, in words. */
  detail: string;
  /** The Workflow asks for Approval: the Unusual Value check's reasons (none when every value is approved), and who
   * is asked first (null: nobody but the person pasting could approve it, so it waits). */
  approval: { reasons: string[]; approver: string | null } | null;
  /** Left out by the person: neither counted nor recorded. */
  leftOut: boolean;
  /** At recording: the outcome is not the one the preview gave, since something changed in between. */
  changed?: boolean;
};

/** A paste previewed or recorded: the layout read, the other readings that fit, every value with what it does, the
 * counts by outcome, who would be asked for Approval how often, the Metrics the person may record as history, and
 * how many values they may still paste today. */
export type PasteReport = {
  ok: true;
  layout: PasteLayout;
  alternatives: PasteLayout[];
  metrics: number;
  periods: number;
  rows: PasteRow[];
  counts: Record<PasteOutcome, number>;
  approvals: { approver: string | null; name: string | null; count: number }[];
  historyMetrics: { id: number; name: string }[];
  leftToday: number;
};

/** A paste that was not read, or not recorded because it would cross the day's limit; `detail` says why. */
export type PasteRefusal = { ok: false; reason: string; detail: string };

/** What the browser sends: the pasted text, the Metric the page was opened for, the layout picked, the places left
 * out, the Metrics to record as history, and (at recording) the outcomes the preview showed, to say what changed. */
export type PasteInput = { text: string; metricId?: number | null; layout?: string | null; leaveOut?: string[]; asHistory?: number[]; expected?: Record<string, string> };

/** A PasteInput checked for shape and size: it comes from a browser. */
type Checked = { text: string; metricId: number | null; layout: PasteLayout | null; leaveOut: Set<string>; asHistory: Set<number>; expected: Map<string, PasteOutcome> };

const LAYOUTS: readonly PasteLayout[] = ["wide", "wide_transposed", "long", "one_metric"];
const PLACE = /^[A-Z]{1,3}[1-9]\d{0,6}$/;

/** Checks what a browser sent: a string within the size limit, ids as integers, places as cell names, at most as
 * many of each as a paste may hold. Anything else is refused, never cut or guessed. */
function check(input: unknown): Checked {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.text !== "string") throw new Error("Paste the cells as text.");
  // Counted in bytes of UTF-8, as the limit is: "€" is three.
  if (new TextEncoder().encode(i.text).length > PASTE_LIMITS.bytes) throw new Error(pasteReadingText({ ok: false, reason: "too_large" }));
  const metricId = i.metricId === null || i.metricId === undefined ? null : Number(i.metricId);
  if (metricId !== null && !Number.isSafeInteger(metricId)) throw new Error("That is not a Metric.");
  const layout = i.layout === null || i.layout === undefined ? null : (LAYOUTS as readonly unknown[]).includes(i.layout) ? (i.layout as PasteLayout) : undefined;
  if (layout === undefined) throw new Error("That is not a layout Ziffr reads.");
  const list = (v: unknown, max: number): unknown[] => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > max) throw new Error("The paste could not be read. Paste it again.");
    return v;
  };
  const leaveOut = list(i.leaveOut, PASTE_LIMITS.values).map((p) => (typeof p === "string" && PLACE.test(p) ? p : null));
  const asHistory = list(i.asHistory, PASTE_LIMITS.values).map((x) => (Number.isSafeInteger(x) ? (x as number) : null));
  const expectedIn = i.expected === undefined || i.expected === null ? [] : typeof i.expected === "object" && !Array.isArray(i.expected) ? Object.entries(i.expected as object) : null;
  if (!expectedIn || expectedIn.length > PASTE_LIMITS.values) throw new Error("The paste could not be read. Paste it again.");
  const expected = expectedIn.map(([p, o]) => (PLACE.test(p) && (OUTCOMES as readonly unknown[]).includes(o) ? ([p, o as PasteOutcome] as const) : null));
  if (leaveOut.includes(null) || asHistory.includes(null) || expected.includes(null)) throw new Error("The paste could not be read. Paste it again.");
  return { text: i.text, metricId, layout, leaveOut: new Set(leaveOut as string[]), asHistory: new Set(asHistory as number[]), expected: new Map(expected as [string, PasteOutcome][]) };
}

/** Everything a paste is read and judged with, for this person in their Workspace. */
type Setting = {
  ws: string;
  actorId: string;
  style: NumberStyle;
  yearStart: YearStart;
  reading: { languages: string[]; monthFirst: boolean };
  /** Metrics the person may see, by id. */
  visible: Map<number, Metric>;
  /** The Token each Metric they submit for is recorded through: their own, else one they hold as a Stand-in. */
  tokens: Map<number, string>;
  /** Metrics they may record as history: they submit for it, and own it or are an Owner or Admin. */
  history: Set<number>;
  leftToday: number;
};

/** Loads the setting: only a signed-in person, never a key; only their Workspace's Metrics they may see. */
async function settingFor(actor: Actor): Promise<Setting> {
  if (actor.key || !actor.personId) throw new Forbidden();
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const [ids, style, yearStart, reading, { data: mine }, leftToday] = await Promise.all([
    visibleMetricIds(ws, actor.personId, metrics),
    numberStyleOf(ws),
    yearStartOf(ws),
    answerReadingOf(ws),
    db().from("tokens").select("code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at, id").eq("workspace_id", ws).eq("submitter_id", actor.personId).order("id"),
    leftTodayFor(actor),
  ]);
  const visible = new Map(metrics.filter((m) => ids.has(m.id)).map((m) => [m.id, m]));
  // A Stand-in's Token counts only while they still stand in on the submitter's own Token (tokens.ts): those are read
  // for the Metrics the person holds a Token for, and nothing else.
  const held = ((mine ?? []) as (TokenRow & { code: string })[]).filter((t) => visible.has(t.metric_id));
  const { data: others } = held.some((t) => t.stands_in_for)
    ? await db().from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for").eq("workspace_id", ws).in("metric_id", [...new Set(held.map((t) => t.metric_id))]).is("stands_in_for", null)
    : { data: [] };
  const all = [...held, ...((others ?? []) as TokenRow[])];
  const tokens = new Map<number, string>();
  // Their own Token first: a Stand-in's is used only for a Metric they hold no Token of their own for.
  for (const t of [...held].sort((a, b) => Number(Boolean(a.stands_in_for)) - Number(Boolean(b.stands_in_for)))) {
    if (!tokens.has(t.metric_id) && tokenValid(t, all)) tokens.set(t.metric_id, t.code);
  }
  const elevated = actor.role === "owner" || actor.role === "admin";
  const history = new Set([...tokens.keys()].filter((id) => elevated || visible.get(id)!.owner_id === actor.personId));
  return { ws, actorId: actor.personId, style, yearStart, reading, visible, tokens, history, leftToday };
}

/** How many more values the person may paste today, in any of their Workspaces: the limit less what their pastes
 * claimed in the last 24 hours (claimPasted, in the database). */
async function leftTodayFor(actor: Actor): Promise<number> {
  return claimPasted(actor, 0);
}

/** Claims `count` values of the person's daily limit in one locked step in the database, so two pastes at once never
 * both pass on the same count. Returns how many are left after it, or, when the claim would cross the limit, a
 * negative number: -1 minus how many were left, and nothing is claimed. */
async function claimPasted(actor: Actor, count: number): Promise<number> {
  const { data, error } = await db().rpc("claim_pasted_values", { p_person: actor.personId, p_count: count, p_limit: dailyLimit(actor) });
  if (error || typeof data !== "number") {
    console.error("claim_pasted_values failed:", error?.message ?? "no answer");
    throw new Error("The paste could not be checked. Try again in a moment.");
  }
  return data;
}

/** The paste read for the person: only Metrics they may see are matched. */
function readFor(s: Setting, c: Checked) {
  const metrics: PasteMetric[] = [...s.visible.values()].map((m) => ({ id: m.id, slug: m.slug, name: m.name, period: m.period, unit: m.unit, format: m.format }));
  return readPaste(c.text, { style: s.style, today: format(new Date(), "yyyy-MM-dd"), yearStart: s.yearStart, ...s.reading, metrics, metricId: c.metricId, layout: c.layout });
}

/** A row for a value refused before any rule of its Metric was asked. */
function refusedRow(v: PasteValue, s: Setting, detail: string, leftOut: boolean, outcome: PasteOutcome = "refused"): PasteRow {
  const m = v.metricId === null ? undefined : s.visible.get(v.metricId);
  return {
    place: v.place, text: v.text, metric: m ? { id: m.id, slug: m.slug, name: m.name } : null,
    period: v.period, periodLabel: m && v.period ? periodLabel(v.period, m.period, metricYearStart(m, s)) : null,
    value: v.value, valueText: m && v.value !== null ? formatValue(m, v.value, s.style) : null, before: null, outcome, detail, approval: null, leftOut,
  };
}

/** A day, week or month is the same whatever the year start; quarters and years follow the Workspace's. */
const metricYearStart = (m: Metric, s: Setting): YearStart => (m.period === "quarter" || m.period === "year" ? s.yearStart : 1);

/** Why a value the reader took is refused before its Metric's rules are asked: the person does not submit for it, it
 * is derived, or it does not take values on the web form. Null when nothing stands in its way. */
function refusalOf(v: PasteValue, s: Setting): string | null {
  if (v.problem) return pasteProblemText(v.problem, v.metricId === null ? undefined : s.visible.get(v.metricId)?.period);
  const m = s.visible.get(v.metricId!)!;
  if (!s.tokens.has(m.id)) return `${m.name} is not a Metric you submit for.`;
  if (m.formula) return `${m.name} is a Derived Metric: it is computed, never submitted.`;
  if (!m.sources.includes("web_form")) return `${m.name} does not take values from the web form, so it takes no pasted values.`;
  return null;
}

/** The values to judge, in the order they are recorded: per Metric, oldest period first, so the Unusual Value check
 * compares each with the one before as it stands by then. */
function inRecordingOrder(values: PasteValue[]): PasteValue[] {
  return [...values].sort((a, b) => (a.metricId ?? 0) - (b.metricId ?? 0) || String(a.period).localeCompare(String(b.period)));
}

/** Previews a paste for the actor (spec 0026, "The preview"): every value with what it would do under the Metric's
 * Submission Rule, Locks, Unusual Value check and Approvals, as of now, without writing anything. */
export async function previewValues(actor: Actor, input: PasteInput): Promise<PasteReport | PasteRefusal> {
  const c = check(input);
  const s = await settingFor(actor);
  const read = readFor(s, c);
  if (!read.ok) return { ok: false, reason: read.reason, detail: pasteReadingText(read) };
  const rows = await judge(s, c, read.values);
  return report(s, read, rows);
}

/** What each value would do, simulated in recording order against the values there now. */
async function judge(s: Setting, c: Checked, values: PasteValue[]): Promise<PasteRow[]> {
  const byPlace = new Map<string, PasteRow>();
  const go: PasteValue[] = [];
  for (const v of values) {
    const leftOut = c.leaveOut.has(v.place);
    const why = refusalOf(v, s);
    if (why) byPlace.set(v.place, refusedRow(v, s, why, leftOut, v.problem?.reason === "duplicate" ? "duplicate" : "refused"));
    else if (leftOut) byPlace.set(v.place, refusedRow(v, s, "Left out.", true));
    else go.push(v);
  }
  const ids = [...new Set(go.map((v) => v.metricId!))];
  if (ids.length) {
    const [latest, { data: states }, { data: targets }, outlooks] = await Promise.all([
      getLatestObservations(s.ws, { metricIds: ids }),
      db().from("period_states").select("metric_id, period_start, state").eq("workspace_id", s.ws).in("metric_id", ids).eq("state", "locked"),
      db().from("series_values").select("metric_id, period_start, value").eq("workspace_id", s.ws).in("metric_id", ids).eq("kind", "target"),
      // Values are recorded under the person pasting, also through a Token they hold as a Stand-in.
      Promise.all(ids.map(async (id) => [id, await valueOutlook(id, s.actorId)] as const)),
    ]);
    // The values as they will stand while the paste is recorded, period by period.
    const now = new Map(latest.map((o) => [`${o.metric_id} ${o.period_start}`, Number(o.value)]));
    const locked = new Set((states ?? []).map((x) => `${x.metric_id} ${x.period_start}`));
    const outlook = new Map(outlooks);
    const today = format(new Date(), "yyyy-MM-dd");
    for (const v of inRecordingOrder(go)) {
      const m = s.visible.get(v.metricId!)!;
      const ys = metricYearStart(m, s);
      const key = `${m.id} ${v.period}`;
      const row: PasteRow = { ...refusedRow(v, s, "", false, "recorded") };
      const there = now.get(key);
      const fv = (x: number) => formatValue(m, x, s.style);
      if (locked.has(key)) {
        byPlace.set(v.place, { ...row, outcome: "locked", detail: `${row.periodLabel} is locked: the value would go to the Metric Owner as a proposed Correction.` });
        continue;
      }
      let after = v.value!;
      if (there === undefined) {
        const current = periodStart(today, m.period, ys);
        const history = c.asHistory.has(m.id) && s.history.has(m.id) && v.period! < current && v.period! >= shiftPeriod(current, m.period, -1000);
        Object.assign(row, history ? { outcome: "history", detail: "Recorded as history: imported, without the Unusual Value check." } : { outcome: "recorded", detail: "Recorded." });
      } else {
        row.before = fv(there);
        switch (m.submission_rule) {
          case "reject":
            byPlace.set(v.place, { ...row, outcome: "duplicate", detail: `${row.periodLabel} already has ${fv(there)}, and the Metric's rule rejects a second value.` });
            continue;
          case "overwrite": Object.assign(row, { outcome: "replaces", detail: `Replaces ${fv(there)}.` }); break;
          case "add": after = Math.round((there + v.value!) * 1e6) / 1e6; Object.assign(row, { outcome: "adds_up", detail: `Adds up: ${fv(there)} + ${fv(v.value!)} = ${fv(after)}.` }); break;
          default: Object.assign(row, { outcome: "kept_beside", detail: `Kept beside ${fv(there)}.` });
        }
      }
      row.approval = approvalFor(m, v.period!, after, now, outlook.get(m.id) ?? null, row.outcome === "history", s, (targets ?? []).filter((t) => t.metric_id === m.id));
      now.set(key, after);
      byPlace.set(v.place, row);
    }
  }
  return values.map((v) => byPlace.get(v.place)!);
}

/** Whether the Workflow would ask for Approval of this value as it will stand, and why (onValue, without writing). */
function approvalFor(m: Metric, period: string, value: number, now: Map<string, number>, o: ValueOutlook | null, imported: boolean, s: Setting, targets: { period_start: string; value: number | string }[]): PasteRow["approval"] {
  if (!o || !o.approves) return null;
  let reasons: string[] = [];
  if (o.check && !imported) {
    const before = shiftPeriod(period, m.period, -1);
    const t = targetFor(m, period, targets.map((x) => ({ period: x.period_start, value: Number(x.value) })));
    reasons = unusualReasons(m, value, now.get(`${m.id} ${before}`), before, o.check, o.yearStart, s.style, t);
  }
  const every = o.every && (!imported || period >= o.working);
  return reasons.length || every ? { reasons, approver: o.approver } : null;
}

/** The report of a paste's rows: counts, approvals by approver, and the Metrics offered as history. */
async function report(s: Setting, read: Extract<ReturnType<typeof readPaste>, { ok: true }>, rows: PasteRow[]): Promise<PasteReport> {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<PasteOutcome, number>;
  const asked = new Map<string | null, number>();
  for (const r of rows) {
    if (r.leftOut) continue;
    counts[r.outcome]++;
    if (r.approval) asked.set(r.approval.approver, (asked.get(r.approval.approver) ?? 0) + 1);
  }
  const people = asked.size ? await peopleIn(s.ws) : [];
  const approvals = [...asked].map(([approver, count]) => ({ approver, name: people.find((p) => p.id === approver)?.name ?? null, count }));
  const inPaste = new Set(rows.map((r) => r.metric?.id).filter((id): id is number => id !== undefined));
  const historyMetrics = [...s.history].filter((id) => inPaste.has(id)).map((id) => ({ id, name: s.visible.get(id)!.name }));
  return { ok: true, layout: read.layout, alternatives: read.alternatives, metrics: read.metrics, periods: read.periods, rows, counts, approvals, historyMetrics, leftToday: s.leftToday };
}

/** The outcome a recorded value got, from submitValue's. */
const RECORDED: Record<string, PasteOutcome> = { recorded: "recorded", overwritten: "replaces", added: "adds_up", kept_both: "kept_beside", rejected_duplicate: "duplicate", proposed_locked: "locked" };

/** Records a paste for the actor (spec 0026, "Confirming"): reads the text again, leaves out the places asked, and
 * records each value through submitValue on the web form, per Metric in period order, each with the outcome it gets
 * now. Record as history is honoured only for Metrics the person may record as history; for any other it is
 * ignored and the values are checked. A paste that would cross the day's limit is refused whole, before anything is
 * recorded. */
export async function recordPastedValues(actor: Actor, input: PasteInput, effects: SubmissionEffects = submissionEffects): Promise<PasteReport | PasteRefusal> {
  const c = check(input);
  const s = await settingFor(actor);
  const read = readFor(s, c);
  if (!read.ok) return { ok: false, reason: read.reason, detail: pasteReadingText(read) };
  const rows = new Map<string, PasteRow>();
  const go: PasteValue[] = [];
  for (const v of read.values) {
    const leftOut = c.leaveOut.has(v.place);
    const why = leftOut ? "Left out." : refusalOf(v, s);
    if (why) rows.set(v.place, refusedRow(v, s, why, leftOut, !leftOut && v.problem?.reason === "duplicate" ? "duplicate" : "refused"));
    else go.push(v);
  }
  const claimed = go.length ? await claimPasted(actor, go.length) : s.leftToday;
  if (claimed < 0) {
    const left = (-1 - claimed).toLocaleString("en");
    return { ok: false, reason: "daily_limit", detail: `You may paste ${dailyLimit(actor).toLocaleString("en")} values a day; ${left} are left today, and this paste holds ${go.length.toLocaleString("en")}. Nothing was recorded.` };
  }
  // The values there now, kept up to date while recording, so a row names the value it replaced or added to.
  const ids = [...new Set(go.map((v) => v.metricId!))];
  const now = new Map((ids.length ? await getLatestObservations(s.ws, { metricIds: ids }) : []).map((o) => [`${o.metric_id} ${o.period_start}`, Number(o.value)]));
  for (const v of inRecordingOrder(go)) {
    const m = s.visible.get(v.metricId!)!;
    const key = `${m.id} ${v.period}`;
    const there = now.get(key);
    const history = c.asHistory.has(m.id) && s.history.has(m.id);
    const r: SubmissionResult = await submitValue({
      source: "web_form", sender: s.tokens.get(m.id)!, workspaceId: s.ws, text: v.text.slice(0, 200),
      value: { value: v.value! }, period: v.period!, paste: { import: history },
    }, effects);
    // The reply's Workflow part names people by id; the row says who approves in its own field.
    const row = refusedRow(v, s, r.detail.replace(/ Workflow: [\s\S]*$/, ""), false, r.imported ? "history" : (RECORDED[r.outcome] ?? "refused"));
    if (there !== undefined && ["replaces", "adds_up", "kept_beside", "duplicate"].includes(row.outcome)) row.before = formatValue(m, there, s.style);
    if (r.ok) {
      now.set(key, row.outcome === "adds_up" && there !== undefined ? there + v.value! : v.value!);
      const { data: state } = await db().from("period_states").select("state, note").eq("metric_id", m.id).eq("period_start", v.period!).maybeSingle();
      if (state?.state === "approval") {
        const { data: task } = await db().from("actions").select("assignee_id").eq("metric_id", m.id).eq("period_start", v.period!).eq("purpose", "approval").eq("kind", "task").eq("status", "open").order("id", { ascending: false }).limit(1);
        row.approval = { reasons: String(state.note ?? "").startsWith("Waits for Approval") ? [] : String(state.note ?? "").split("; ").filter(Boolean), approver: (task?.[0]?.assignee_id as string | undefined) ?? null };
      }
    }
    const expected = c.expected.get(v.place);
    if (expected && expected !== row.outcome) row.changed = true;
    rows.set(v.place, row);
  }
  for (const [place, outcome] of c.expected) {
    const row = rows.get(place);
    if (row && !row.leftOut && row.outcome !== outcome) row.changed = true;
  }
  return report({ ...s, leftToday: claimed }, read, read.values.map((v) => rows.get(v.place)!));
}

/** Which of a Metric's values came from a paste (spec 0026), among the ones given: the intake log marks each pasted
 * value and names the value it became. Only for someone who sees the Metric, and only ids of its own values. */
export async function pastedValueIds(actor: Actor, metricId: number, observationIds: number[]): Promise<number[]> {
  await assertSeesMetrics(actor, [metricId]);
  const ids = observationIds.filter((id) => Number.isSafeInteger(id)).slice(0, PASTE_LIMITS.values);
  if (!ids.length) return [];
  const { data, error } = await db().from("intake_log").select("observation_id").eq("workspace_id", actor.workspaceId).eq("metric_id", metricId).contains("marks", ["paste"]).in("observation_id", ids);
  if (error) throw new Error("The values could not be read. Try again in a moment.");
  return [...new Set((data ?? []).map((r) => Number(r.observation_id)))];
}

/** The Metrics the actor may paste values for: those they see and submit for on the web form, through their own Token
 * or one they hold as a Stand-in. For the page's choice of Metric for a two-column paste. */
export async function pasteMetrics(actor: Actor): Promise<{ id: number; slug: string; name: string }[]> {
  const s = await settingFor(actor);
  return [...s.tokens.keys()]
    .map((id) => s.visible.get(id)!)
    .filter((m) => !m.formula && m.sources.includes("web_form"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ id: m.id, slug: m.slug, name: m.name }));
}
