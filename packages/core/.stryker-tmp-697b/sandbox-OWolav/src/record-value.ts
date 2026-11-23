// @ts-nocheck
// Recording a value under its Metric's Submission Rule (GLOSSARY: Submission Rule, Observation, Breakdown, Workspace Key;
// spec 0028 step 2, ticket #248; spec 0022). Values are sealed, so the database can no longer add them up or find a
// Breakdown row to add to: the core reads the period's values, applies the rule itself (adding up exactly, as the
// database's numeric did, see adding-up.ts), seals what it writes for the row it lives in, and hands it to record_value,
// which writes only if the rows are still as the core read them (a compare-and-swap under the same lock as before) and
// raises ZF409 otherwise. The core then reads again, a few times. Security: a value is opened and sealed here and
// nowhere else in this path; the database sees ciphertext (or, where the Workspace seals nothing, the plain number).
import { db } from "./db";
import { addUp } from "./adding-up";
import { numberPlace, openRow, reserveIds } from "./sealed-columns";
import { isSealed, normaliseForIndex, workspaceCipher, type WorkspaceCipher } from "./workspace-keys";
import type { Metric } from "./types";

/** What recording a value did: the value's id, the outcome, what was there before and what is there now. */
export type Recorded = { observation_id: number; outcome: string; before: number | string | null; after: number | string; earlier: number };

/** A recording as takeValue asks for it: the answer, or the database's refusal (its words stay in the server log). */
export type Recording = (workspaceId: string, metric: Metric, period: string, value: number, row: { submitter_id: string | null; source: string; access_key_id: number | null }, imported: boolean, rows: { label: string; value: number }[]) => Promise<{ data: Recorded | null; error: { message: string; code?: string } | null }>;

/** How often the core reads the period again when it changed between reading and writing, and for how long: with many
 * writers at the same moment each round lets one through, so a dozen attempts, a little apart, serve a burst of them, and
 * a submission never holds a request for more than a few seconds. */
const ATTEMPTS = 12;
const BUDGET_MS = 5000;
const CONFLICT = "ZF409";
const PURPOSE = "breakdown_rows.label";

type Stored = { id: number; value?: unknown; value_sealed?: unknown };

/** A value as stored, to give back to the database as what the core read: the sealed text, or the plain number as text. */
const asStored = (r: { value?: unknown; value_sealed?: unknown }): string => (typeof r.value_sealed === "string" ? r.value_sealed : String(r.value));

/** A number written for a row (also by a Workspace import, which writes many values at once): sealed for its place where the Workspace seals, as a plain number where it does not. */
export function written(cipher: WorkspaceCipher, table: "observations" | "breakdown_rows", id: number, v: number): { value: number | null; value_sealed: string | null } {
  if (!cipher.sealing) return { value: v, value_sealed: null };
  const place = numberPlace(table, "value", { id }) as NonNullable<ReturnType<typeof numberPlace>>;
  return { value: null, value_sealed: cipher.seal(place, String(v)) };
}

/** A Breakdown row of the period's latest value, as read: its stored value for the database to check, its opened one to add to. */
type Existing = { id: number; label: string; label_index: string | null; value: number; stored: string };
/** A row the recording writes: a new one, or one already there that grows. */
type Working = { id: number; fresh: boolean; label: string; index: string | null; value: number; stored: string | null };

/** Records a value under its Metric's Submission Rule. For the demo's preview nothing is written (see submissions.ts). */
export const recordObservation: Recording = async (workspaceId, metric, period, value, row, imported, rows) => {
  const cipher = await workspaceCipher(workspaceId);
  const [[newId], rowIds] = await Promise.all([reserveIds("observations", 1), rows.length ? reserveIds("breakdown_rows", rows.length) : Promise.resolve([] as number[])]);
  const started = Date.now();
  for (let attempt = 0; attempt < ATTEMPTS && Date.now() - started < BUDGET_MS; attempt++) {
    // The latest value, and how many the period has (a keep-both period may hold more than a page of them).
    const { data, count } = await db().from("observations").select("id, value, value_sealed", { count: "exact" }).eq("workspace_id", workspaceId).eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
    const latest = ((data ?? []) as Stored[])[0] ?? null;
    const earlier = count ?? (latest ? 1 : 0);
    const before = latest ? (openRow(cipher, "observations", latest as Record<string, unknown>).value as number | null) : null;
    const rule = metric.submission_rule;
    // Only adding to the latest value, or telling that it is there, needs it opened: replacing it or keeping it beside
    // another does not, so a value that does not open never blocks its period.
    if (latest && before === null && (rule === "add" || rule === "reject")) return { data: null, error: { message: "The period's value did not open." } };
    if (latest && rule === "reject") return { data: { observation_id: latest.id, outcome: "rejected_duplicate", before, after: before!, earlier }, error: null };
    const op = !latest || rule === "keep_both" ? "insert" : rule === "overwrite" ? "overwrite" : "add";
    const after = op === "add" ? addUp(before!, value) : value;
    const outcome = !latest ? "recorded" : op === "insert" ? "kept_both" : op === "overwrite" ? "overwritten" : "added";
    const obs = written(cipher, "observations", op === "insert" ? newId : latest!.id, after);

    let existing: Existing[] = [];
    if (op === "add" && rows.length) {
      const { data: have } = await db().from("breakdown_rows").select("id, label, label_index, value, value_sealed").eq("workspace_id", workspaceId).eq("observation_id", latest!.id).order("position").order("id");
      existing = ((have ?? []) as Record<string, unknown>[]).map((r) => {
        const opened = openRow(cipher, "breakdown_rows", r);
        return { id: Number(r.id), label: String(opened.label ?? ""), label_index: (r.label_index as string | null) ?? null, value: opened.value as number, stored: asStored(r) };
      });
      // A row whose value does not open cannot be added to; the period is left as it is.
      if (existing.some((r) => typeof r.value !== "number")) return { data: null, error: { message: "A row's value did not open." } };
    }
    const planned = planRows(cipher, op === "add", existing, rows, rowIds);
    const { data: id, error } = await db().rpc("record_value", {
      p_metric: metric.id, p_period: period, p_op: op, p_new_id: newId, p_value: obs.value, p_value_sealed: obs.value_sealed, p_submitter: row.submitter_id, p_source: row.source,
      p_access_key: row.access_key_id, p_imported: imported, p_expect_id: latest?.id ?? null, p_expect_count: earlier, p_expect_value: latest ? asStored(latest) : null,
      p_expect_rows: op === "add" && rows.length ? existing.length : null, p_rows: planned,
    });
    if (error?.code === CONFLICT) {
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 15 * (attempt + 1)));
      continue;
    }
    if (error) return { data: null, error: { message: error.message, code: error.code } };
    return { data: { observation_id: Number(id), outcome, before, after, earlier }, error: null };
  }
  return { data: null, error: { message: "The period kept changing." } };
};

/** What to do with a submission's Breakdown rows: under "add", a row is added to the existing one with the same label
 * (by blind index, or by the plain label of a row written before sealing) and rows with the same label in one
 * submission merge; otherwise every row is a new one. The database writes the list as it is. */
export function planRows(cipher: WorkspaceCipher, adding: boolean, existing: Existing[], rows: { label: string; value: number }[], ids: number[]): Record<string, unknown>[] {
  const working: Working[] = existing.map((r) => ({ id: r.id, fresh: false, label: r.label, index: r.label_index, value: r.value, stored: r.stored }));
  const have = new Map(existing.map((r) => [r.id, r]));
  rows.forEach((r, i) => {
    const indexes = cipher.blindIndexes(PURPOSE, r.label);
    const legacy = normaliseForIndex(r.label);
    const hit = adding ? working.find((w) => {
      const e = have.get(w.id);
      if (e) return (e.label_index !== null && indexes.includes(e.label_index)) || (e.label_index === null && !isSealed(e.label) && normaliseForIndex(e.label) === legacy);
      return w.index !== null ? indexes.includes(w.index) : normaliseForIndex(w.label) === legacy;
    }) : undefined;
    if (hit) { hit.value = addUp(hit.value, r.value); return; }
    working.push({ id: ids[i], fresh: true, label: r.label, index: cipher.blindIndex(PURPOSE, r.label), value: r.value, stored: null });
  });
  const touched = working.filter((w) => w.fresh || w.value !== have.get(w.id)?.value);
  const sealedLabel = (w: Working) => (cipher.sealing ? cipher.seal({ table: "breakdown_rows", column: "label", row: w.id }, w.label) : w.label);
  const number = (w: Working) => written(cipher, "breakdown_rows", w.id, w.value);
  return [
    ...touched.filter((w) => !w.fresh).map((w) => ({ op: "update", id: w.id, ...number(w), expect: w.stored })),
    ...touched.filter((w) => w.fresh).map((w) => ({ op: "insert", id: w.id, label: sealedLabel(w), index: w.index, ...number(w) })),
  ];
}
