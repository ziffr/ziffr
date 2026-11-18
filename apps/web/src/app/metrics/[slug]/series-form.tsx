"use client";
// Target Series and Projections on a metric's page (GLOSSARY: Target Series, Projection): a table its owner edits
// row by row or fills by pasting two spreadsheet columns, with a preview before anything changes. Others read it.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste, Plus, X } from "lucide-react";
import { parseISO } from "date-fns";
import { removeSeriesRows, saveSeriesRows } from "@/app/series-actions";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatValue } from "@ziffr/core/format";
import { NUMBER_STYLE_MARKS, type NumberStyle } from "@ziffr/core/number-style";
import { readNumber } from "@ziffr/core/numbers";
import { parseSeriesText } from "@ziffr/core/series-lines";
import type { Metric, Point } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { periodLabel, periodStart, periodStartsIn, shiftPeriod, type YearStart } from "@ziffr/core/periods";

type Kind = "target" | "projection";
type Row = { key: string; period: string; value: string; saved?: number };
type M = Pick<Metric, "id" | "period" | "format" | "decimals" | "unit" | "unit_position">;

// A value in a cell is written with the Number Style's decimal mark, so it reads back as the same number ("1.234" is
// 1234 in a Workspace that writes 1.234,5; "1,234" is 1.234 there).
const cell = (v: number, style: NumberStyle) => String(v).replace(".", NUMBER_STYLE_MARKS[style].decimal);
const toRows = (pts: Point[], style: NumberStyle): Row[] => [...pts].sort((a, b) => a.period.localeCompare(b.period)).map((p) => ({ key: p.period, period: p.period, value: cell(p.value, style), saved: p.value }));

/** The targets and projections of one metric as an editable table (owner) or a plain one (everyone else). Typed and
 * pasted numbers are read in the Workspace's Number Style, by the core's one reader. */
export function TargetsEditor({ metric, targets, projections, canEdit, yearStart, numberStyle }: { metric: M; targets: Point[]; projections: Point[]; canEdit: boolean; yearStart: YearStart; numberStyle: NumberStyle }) {
  const read = (s: string) => readNumber(s, numberStyle);
  const [kind, setKind] = useState<Kind>("target");
  const [rows, setRows] = useState<Record<Kind, Row[]>>({ target: toRows(targets, numberStyle), projection: toRows(projections, numberStyle) });
  const [note, setNote] = useState("");
  const [paste, setPaste] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const list = rows[kind];
  const setList = (f: (r: Row[]) => Row[]) => setRows((all) => ({ ...all, [kind]: f(all[kind]) }));
  const month = metric.period === "month";
  // A quarter or year is picked from a list by its name ("Q3 2026", "FY 2026/27"): ten years back, ten ahead.
  const long = metric.period === "quarter" || metric.period === "year";
  const current = periodStart(new Date(), metric.period, yearStart);
  const choices = useMemo(() => (long ? periodStartsIn(metric.period, shiftPeriod(current, "year", -10), shiftPeriod(current, "year", 11), yearStart) : []), [long, metric.period, current, yearStart]);
  const changed = list.filter((r) => r.period && read(r.value) !== null && read(r.value) !== r.saved);
  const invalid = list.filter((r) => !r.period || read(r.value) === null);
  const preview = useMemo(() => (paste ? parseSeriesText(paste, metric.period, yearStart, numberStyle) : null), [paste, metric.period, yearStart, numberStyle]);
  const word = kind === "target" ? "target" : "projection";

  const nextPeriod = () => {
    const last = [...list].map((r) => r.period).filter(Boolean).sort().pop();
    if (!last) return periodStart(new Date(), metric.period, yearStart);
    return shiftPeriod(last, metric.period, 1);
  };
  const merge = (incoming: { period: string; value: number }[]) => setList((r) => {
    const by = new Map(r.map((x) => [x.period, x]));
    for (const p of incoming) by.set(p.period, { ...(by.get(p.period) ?? { key: `n${p.period}` }), period: p.period, value: cell(p.value, numberStyle) });
    return [...by.values()].sort((a, b) => a.period.localeCompare(b.period));
  });
  const save = () => start(async () => {
    try {
      const r = await saveSeriesRows(metric.id, kind, changed.map((x) => ({ period: x.period, value: read(x.value)! })), note);
      toast.success(`${r.saved} ${r.saved === 1 ? word : `${word}s`} saved`);
      setList((all) => all.map((x) => (read(x.value) !== null && x.period ? { ...x, saved: read(x.value)! } : x)));
      router.refresh();
    } catch (err) {
      toast.error("Not saved", { description: (err as Error).message });
    }
  });

  // A saved row goes from the database right away, after asking; an unsaved one only leaves the table.
  const removeSaved = async (r: Row) => {
    const label = periodLabel(r.period, metric.period, yearStart);
    if (!(await confirm({ title: `Remove the ${word} for ${label}?`, description: `The chart and the target box no longer use it. You can add it again later.`, confirmLabel: `Remove ${word}` }))) return;
    start(async () => {
      try {
        await removeSeriesRows(metric.id, kind, [r.period]);
        setList((all) => all.filter((x) => x.key !== r.key));
        toast.success(`${label} removed`);
        router.refresh();
      } catch (err) {
        toast.error("Not removed", { description: (err as Error).message });
      }
    });
  };

  if (!canEdit) {
    const periods = [...new Set([...targets, ...projections].map((p) => p.period))].sort();
    if (!periods.length) return <p className="text-sm text-muted-foreground">No target series or projections yet.</p>;
    return (
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-1.5 font-normal">Period</th><th className="pb-1.5 text-right font-normal">Target</th><th className="pb-1.5 text-right font-normal">Projection</th></tr></thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p} className="border-t border-border">
              <td className="py-1.5">{periodLabel(p, metric.period, yearStart)}</td>
              <td className="fig py-1.5 text-right">{formatValue(metric, targets.find((x) => x.period === p)?.value ?? null, numberStyle)}</td>
              <td className="fig py-1.5 text-right">{formatValue(metric, projections.find((x) => x.period === p)?.value ?? null, numberStyle)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-3">
      {dialog}
      <div role="tablist" aria-label="Series" className="inline-flex rounded-[var(--radius-input)] border border-border p-0.5 text-sm">
        {(["target", "projection"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={kind === k} onClick={() => { setKind(k); setPaste(null); }} className={cn("rounded-[calc(var(--radius-input)-2px)] px-3 py-1", kind === k ? "stock font-medium" : "text-muted-foreground hover:text-foreground")}>
            {k === "target" ? "Targets" : "Projections"}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="pb-1.5 font-normal">Period</th><th className="pb-1.5 font-normal">{kind === "target" ? "Target" : "Projection"}</th><th className="w-9"><span className="sr-only">Remove</span></th></tr>
        </thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={3} className="py-3 text-muted-foreground">No {word}s yet. Add a row, or paste two columns from a spreadsheet.</td></tr>}
          {list.map((r, i) => {
            const bad = !r.period || read(r.value) === null;
            return (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  {r.saved !== undefined ? <span>{periodLabel(r.period, metric.period, yearStart)}</span> : long ? (
                    <select
                      aria-label={`Period of row ${i + 1}`}
                      value={r.period}
                      onChange={(e) => { const v = e.target.value; setList((all) => all.map((x) => (x.key === r.key ? { ...x, period: v } : x))); }}
                      className="h-8 w-44 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"
                    >
                      {(choices.includes(r.period) || !r.period ? choices : [r.period, ...choices]).map((p) => <option key={p} value={p}>{periodLabel(p, metric.period, yearStart)}</option>)}
                    </select>
                  ) : (
                    <Input
                      type={month ? "month" : "date"}
                      lang="en-GB"
                      aria-label={`Period of row ${i + 1}`}
                      value={month ? r.period.slice(0, 7) : r.period}
                      onChange={(e) => { const v = e.target.value; setList((all) => all.map((x) => (x.key === r.key ? { ...x, period: v ? (month ? `${v}-01` : periodStart(parseISO(v), metric.period, yearStart)) : "" } : x))); }}
                      className="h-8 w-44"
                    />
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    inputMode="decimal"
                    aria-label={`${kind === "target" ? "Target" : "Projection"} for ${r.period ? periodLabel(r.period, metric.period, yearStart) : `row ${i + 1}`}`}
                    aria-invalid={bad && r.value !== "" ? true : undefined}
                    value={r.value}
                    onChange={(e) => { const v = e.target.value; setList((all) => all.map((x) => (x.key === r.key ? { ...x, value: v } : x))); }}
                    className={cn("fig h-8 w-40 text-right", read(r.value) !== r.saved && !bad && "border-[var(--color-accent-2)]")}
                  />
                </td>
                <td className="py-1.5 text-right">
                  <button type="button" disabled={pending} aria-label={r.saved === undefined ? "Remove this row" : `Remove the ${word} for ${periodLabel(r.period, metric.period, yearStart)}`} title="Remove this row" onClick={() => (r.saved === undefined ? setList((all) => all.filter((x) => x.key !== r.key)) : removeSaved(r))} className="flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setList((r) => [...r, { key: `n${Date.now()}`, period: nextPeriod(), value: "" }])}><Plus aria-hidden /> Add row</Button>
        <Button type="button" variant="outline" size="sm" aria-expanded={paste !== null} onClick={() => setPaste(paste === null ? "" : null)}><ClipboardPaste aria-hidden /> Paste from a spreadsheet</Button>
      </div>
      {paste !== null && (
        <div className="space-y-2 rounded-[var(--radius-card)] border border-border p-3">
          <label className="block text-xs font-medium" htmlFor="series-paste">Copy two columns, period and value, and paste them here</label>
          <textarea id="series-paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={month ? "2026-12\t140000\n2027-01\t112000" : long ? [current, shiftPeriod(current, metric.period, 1)].map((p, i) => `${p.slice(0, 7)}\t${140000 + 12000 * i}`).join("\n") : "2026-12-07\t140000"} className="fig w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 py-2 text-sm" />
          {preview && (preview.rows.length > 0 || preview.skipped.length > 0) && (
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">{preview.rows.length} row{preview.rows.length === 1 ? "" : "s"} read{preview.skipped.length ? `, ${preview.skipped.length} line${preview.skipped.length === 1 ? "" : "s"} skipped` : ""}. Rows for a period already in the table replace it there.</p>
              {preview.rows.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto text-xs">
                  {preview.rows.map((p) => <li key={p.period} className="flex justify-between border-t border-border py-1"><span>{periodLabel(p.period, metric.period, yearStart)}</span><span className="fig">{formatValue(metric, p.value, numberStyle)}</span></li>)}
                </ul>
              )}
              {preview.skipped.length > 0 && <p className="mt-1 text-xs text-destructive">Skipped: {preview.skipped.slice(0, 3).map((s) => `“${s}”`).join(", ")}{preview.skipped.length > 3 ? " …" : ""}</p>}
              <Button type="button" size="sm" className="mt-2" disabled={!preview.rows.length} onClick={() => { merge(preview.rows); setPaste(null); }}>Add {preview.rows.length} to the table</Button>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="text-xs text-muted-foreground">Note, for everyone who reads it<Input placeholder="e.g. Budget 2027" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-56" /></label>
        <Button type="button" disabled={pending || changed.length === 0} onClick={save}>{changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Saved"}</Button>
        {invalid.length > 0 && <span className="text-xs text-destructive">{invalid.length} row{invalid.length === 1 ? " needs" : "s need"} a period and a number; {invalid.length === 1 ? "it is" : "they are"} not saved.</span>}
      </div>
    </div>
  );
}
