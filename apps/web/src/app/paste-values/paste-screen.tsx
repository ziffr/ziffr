"use client";
// The Paste values screen (spec 0026; GLOSSARY: Observation, Import, Approval): a labelled text box that takes a paste
// or typing, Ctrl+V anywhere on the page into it, the preview with what each value would do, leaving out cells,
// Record as history, and the result. The browser reads nothing itself: it sends the text and the person's choices,
// and the core reads and checks every value on the server.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isActionError } from "@/lib/action-error";
import { PASTE_LIMITS } from "@ziffr/core/paste-reader";
import type { PasteLayout } from "@ziffr/core/paste-reader";
import type { PasteOutcome, PasteReport, PasteRow } from "@ziffr/core/paste-values";
import { previewPaste, recordPaste } from "@/app/paste-actions";
import { readFile } from "./read-file";
import { TemplateDownload } from "./template-download";
import { cn } from "@/lib/utils";

/** A Metric the person submits for, to pick for a two-column paste. */
export type PasteChoice = { id: number; name: string };

const OUTCOME_WORD: Record<PasteOutcome, string> = {
  recorded: "recorded", history: "as history", replaces: "replaces", adds_up: "adds up", kept_beside: "kept beside",
  locked: "locked", duplicate: "duplicate", refused: "refused",
};
// The colour only stands beside the word, never instead of it.
const OUTCOME_TONE: Record<PasteOutcome, string> = {
  recorded: "bg-[var(--color-good,#2f855a)]", history: "bg-[var(--color-good,#2f855a)]", replaces: "bg-amber-500", adds_up: "bg-amber-500",
  kept_beside: "bg-amber-500", locked: "bg-sky-600", duplicate: "bg-[var(--color-bad,#c53030)]", refused: "bg-[var(--color-bad,#c53030)]",
};
const LAYOUT_WORDS: Record<PasteLayout, string> = {
  wide: "Metrics as rows, periods as columns",
  wide_transposed: "Periods as rows, Metrics as columns",
  long: "One value per row, with its Metric and period",
  one_metric: "Two columns, period and value",
};
const SENT: readonly PasteOutcome[] = ["recorded", "history", "replaces", "adds_up", "kept_beside", "locked"];

/** The word for a row's outcome: an Unusual Value, or one that waits for Approval, says so. */
function outcomeWord(r: PasteRow): string {
  if (r.leftOut) return "left out";
  if (r.approval && r.outcome !== "history") return r.approval.reasons.length ? "unusual" : "needs approval";
  return OUTCOME_WORD[r.outcome];
}

/** "118 to record (4 of them unusual), 2 locked, 6 refused": the preview's summary, in words; after recording,
 * "118 recorded". */
function summary(rep: PasteReport, done: boolean): string {
  const c = rep.counts;
  const unusual = rep.rows.filter((r) => !r.leftOut && r.outcome !== "history" && r.approval?.reasons.length).length;
  const n = (x: number) => x.toLocaleString("en");
  const recorded = c.recorded + c.replaces + c.adds_up + c.kept_beside;
  const parts = [
    recorded ? `${n(recorded)} ${done ? "recorded" : "to record"}${unusual ? ` (${unusual === recorded ? (recorded === 1 ? "unusual" : "all unusual") : `${n(unusual)} of them unusual`})` : ""}` : "",
    c.history ? `${n(c.history)} as history` : "",
    c.locked ? `${n(c.locked)} locked` : "",
    c.duplicate ? `${n(c.duplicate)} duplicate` : "",
    c.refused ? `${n(c.refused)} refused` : "",
  ].filter(Boolean);
  return parts.join(", ") || (done ? "Nothing was recorded" : "Nothing to record");
}

/** "14 values would ask Ana for Approval." */
function approvalWords(rep: PasteReport, done: boolean): string[] {
  const would = done ? "" : "would ";
  return rep.approvals.map((a) => {
    const n = `${a.count.toLocaleString("en")} value${a.count === 1 ? "" : "s"}`;
    return a.name ? `${n} ${would}${done ? "asked" : "ask"} ${a.name.split(" ")[0]} for Approval.` : `${n} ${would}wait${done || a.count !== 1 ? "" : "s"} for Approval: nobody but you can approve ${a.count === 1 ? "it" : "them"}.`;
  });
}

/** The Paste values screen. `metricId` is the Metric the page was opened for (Paste history). */
export function PasteScreen({ metrics, metricId: opened }: { metrics: PasteChoice[]; metricId: number | null }) {
  const [text, setText] = useState("");
  const [metricId, setMetricId] = useState<number | null>(opened);
  const [layout, setLayout] = useState<PasteLayout | null>(null);
  const [leaveOut, setLeaveOut] = useState<Set<string>>(new Set());
  const [asHistory, setAsHistory] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<PasteReport | null>(null);
  const [result, setResult] = useState<PasteReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  // The file the text came from, and its workbook's sheets, to pick another one.
  const [file, setFile] = useState<{ file: File; sheets: string[]; sheet: string | null } | null>(null);
  const [dragging, setDragging] = useState(false);

  const read = useCallback((next: { text?: string; metricId?: number | null; layout?: PasteLayout | null; leaveOut?: Set<string>; asHistory?: Set<number> } = {}) => {
    const t = next.text ?? text;
    setResult(null);
    if (!t.trim()) { setPreview(null); setError(null); return; }
    // Said before sending, too: the server refuses more, never cuts it.
    if (new Blob([t]).size > PASTE_LIMITS.bytes) { setPreview(null); setError("That is more than 256 KB of text. Paste fewer cells at a time."); return; }
    start(async () => {
      const r = await previewPaste({
        text: t, metricId: next.metricId === undefined ? metricId : next.metricId, layout: next.layout === undefined ? layout : next.layout,
        leaveOut: [...(next.leaveOut ?? leaveOut)], asHistory: [...(next.asHistory ?? asHistory)],
      });
      if (isActionError(r)) { setPreview(null); setError(r.error); return; }
      if (!r.ok) { setPreview(null); setError(r.detail); return; }
      setError(null);
      setPreview(r);
    });
  }, [text, metricId, layout, leaveOut, asHistory]);

  // Ctrl+V (⌘V) anywhere on the page puts the paste into the text box; a paste into another field stays there.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])"))) return;
      const pasted = e.clipboardData?.getData("text/plain");
      if (!pasted) return;
      e.preventDefault();
      setText(pasted);
      setLeaveOut(new Set());
      box.current?.focus();
      read({ text: pasted, leaveOut: new Set() });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [read]);

  // A dropped or picked file becomes the same text a paste is, read in the browser, and goes the same way.
  const takeFile = async (f: File, sheet?: string | null) => {
    const r = await readFile(f, sheet);
    if (!r.ok) { setError(r.error); setPreview(null); return; }
    setFile({ file: f, sheets: r.sheets, sheet: r.sheet });
    setText(r.text);
    setLeaveOut(new Set());
    read({ text: r.text, leaveOut: new Set() });
  };

  const toggle = (places: string[], out: boolean) => {
    const next = new Set(leaveOut);
    for (const p of places) if (out) next.add(p); else next.delete(p);
    setLeaveOut(next);
    read({ leaveOut: next });
  };
  const toggleHistory = (id: number, on: boolean) => {
    const next = new Set(asHistory);
    if (on) next.add(id); else next.delete(id);
    setAsHistory(next);
    read({ asHistory: next });
  };
  const record = () => {
    if (!preview) return;
    const expected = Object.fromEntries(preview.rows.filter((r) => !r.leftOut).map((r) => [r.place, r.outcome]));
    start(async () => {
      const r = await recordPaste({ text, metricId, layout: preview.layout, leaveOut: [...leaveOut], asHistory: [...asHistory], expected });
      if (isActionError(r)) { setError(r.error); return; }
      if (!r.ok) { setError(r.detail); return; }
      setError(null);
      setResult(r);
      setPreview(null);
    });
  };
  const restart = () => { setFile(null); setText(""); setPreview(null); setResult(null); setLeaveOut(new Set()); setAsHistory(new Set()); setLayout(null); setError(null); box.current?.focus(); };

  const shown = result ?? preview;
  const toSend = preview ? preview.rows.filter((r) => !r.leftOut && SENT.includes(r.outcome)).length : 0;

  return (
    <div className="space-y-6">
      {!result && (
        <section
          className={cn("stock space-y-3 rounded-[var(--radius-card)] p-5", dragging && "outline-2 outline-dashed outline-[var(--color-ink-2)]")}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { const f = e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); setDragging(false); void takeFile(f); }}
        >
          <label htmlFor="paste-text" className="block font-medium">Cells from your spreadsheet</label>
          <p id="paste-help" className="text-sm text-muted-foreground">
            Copy the cells in Excel, Google Sheets, LibreOffice or Numbers and press Ctrl+V (⌘V) here. Metrics as rows and periods as columns (or the other way round), or one value per row with its Metric and period. At most {PASTE_LIMITS.values.toLocaleString("en")} values at a time.
          </p>
          <Textarea
            id="paste-text" ref={box} aria-describedby="paste-help" rows={6} spellCheck={false} className="font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => { const pasted = e.clipboardData.getData("text/plain"); if (!pasted) return; e.preventDefault(); setText(pasted); setLeaveOut(new Set()); read({ text: pasted, leaveOut: new Set() }); }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span>Two columns are for</span>
              <select className="rounded-[var(--radius-input)] border border-input bg-card px-2 py-1 text-sm" value={metricId ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; setMetricId(id); read({ metricId: id }); }}>
                <option value="">no Metric (name it in the cells)</option>
                {metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <Button variant="outline" disabled={pending || !text.trim()} onClick={() => read()}>Read the paste</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="cursor-pointer underline">
              Or choose a file
              <input type="file" className="sr-only" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,text/csv" disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void takeFile(f); }} />
            </label>
            <span className="text-muted-foreground">(CSV, Excel or OpenDocument), or drop one here. It is read in your browser; only its cells are sent.</span>
          </div>
          <TemplateDownload metrics={metrics} metricId={metricId} />
          {file && (
            <p className="text-sm text-muted-foreground">
              Read from {file.file.name}
              {file.sheets.length > 1 && (
                <label className="ml-2">
                  , sheet{" "}
                  <select className="rounded-[var(--radius-input)] border border-input bg-card px-2 py-1 text-sm" value={file.sheet ?? ""} disabled={pending} onChange={(e) => void takeFile(file.file, e.target.value)}>
                    {file.sheets.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              {file.sheets.length === 1 && file.sheet ? `, sheet ${file.sheet}` : ""}.
            </p>
          )}
        </section>
      )}

      <p role="status" aria-live="polite" className={cn("text-sm", error ? "text-destructive" : "sr-only")}>
        {error ?? (pending ? "Reading…" : shown ? `${result ? "Done: " : ""}${summary(shown, !!result)}.` : "")}
      </p>

      {shown && (
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm">
              <span className="font-medium">{LAYOUT_WORDS[shown.layout]}</span>
              {shown.layout === "one_metric" ? `: ${shown.periods} periods.` : `: ${shown.metrics} Metric${shown.metrics === 1 ? "" : "s"} × ${shown.periods} period${shown.periods === 1 ? "" : "s"}.`}
              {!result && shown.alternatives.map((alt) => (
                <Button key={alt} variant="link" size="sm" disabled={pending} onClick={() => { setLayout(alt); read({ layout: alt }); }}>Read it as: {LAYOUT_WORDS[alt]}</Button>
              ))}
            </p>
            <p className="text-lg font-medium" aria-hidden>{result ? "Done: " : ""}{summary(shown, !!result)}</p>
            {approvalWords(shown, !!result).map((w) => <p key={w} className="text-sm text-muted-foreground">{w}</p>)}
            {result && <p className="text-sm text-muted-foreground">{result.leftToday.toLocaleString("en")} more values may be pasted today.</p>}
          </div>

          {!result && preview && preview.historyMetrics.length > 0 && (
            <fieldset className="stock space-y-2 rounded-[var(--radius-card)] p-4">
              <legend className="px-1 text-sm font-medium">Record as history</legend>
              <p className="text-xs text-muted-foreground">No Unusual Value check, marked as imported. Only for past periods that have no value yet; the others are checked as usual.</p>
              {preview.historyMetrics.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={asHistory.has(m.id)} disabled={pending} onChange={(e) => toggleHistory(m.id, e.target.checked)} />
                  {m.name}
                </label>
              ))}
            </fieldset>
          )}

          <Rows report={shown} done={!!result} pending={pending} onToggle={toggle} />

          <div className="flex flex-wrap gap-2">
            {!result && <Button disabled={pending || toSend === 0} onClick={record}>Record {toSend.toLocaleString("en")} value{toSend === 1 ? "" : "s"}</Button>}
            {result && <Button onClick={restart}>Paste more</Button>}
          </div>
        </section>
      )}
    </div>
  );
}

/** The preview's or result's table, grouped by Metric, with a checkbox per value and per Metric to leave it out. */
function Rows({ report, done, pending, onToggle }: { report: PasteReport; done: boolean; pending: boolean; onToggle: (places: string[], out: boolean) => void }) {
  const groups = useMemo(() => {
    const out = new Map<string, { metric: PasteRow["metric"]; rows: PasteRow[] }>();
    for (const r of report.rows) {
      const k = r.metric ? String(r.metric.id) : "none";
      out.set(k, { metric: r.metric, rows: [...(out.get(k)?.rows ?? []), r] });
    }
    return [...out.values()];
  }, [report]);
  const choosable = (r: PasteRow) => !done && (r.leftOut || SENT.includes(r.outcome));
  return (
    <div className="stock overflow-x-auto rounded-[var(--radius-card)]">
      <table className="w-full text-sm">
        <caption className="sr-only">{done ? "What became of each value" : "What each value would do"}, grouped by Metric</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {!done && <th scope="col" className="w-8 px-3 py-2 font-medium"><span className="sr-only">Record</span></th>}
            <th scope="col" className="px-3 py-2 font-medium">Cell</th>
            <th scope="col" className="px-3 py-2 font-medium">Period</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
            <th scope="col" className="px-3 py-2 font-medium">Outcome</th>
            <th scope="col" className="px-3 py-2 font-medium">Why</th>
          </tr>
        </thead>
        {groups.map((g) => {
          const places = g.rows.filter(choosable).map((r) => r.place);
          const allOut = places.length > 0 && g.rows.filter(choosable).every((r) => r.leftOut);
          const name = g.metric?.name ?? "Not a Metric you can see here";
          return (
            <tbody key={g.metric?.id ?? "none"}>
              <tr className="border-b bg-[var(--color-paper-2)]">
                {!done && (
                  <td className="px-3 py-2">
                    {places.length > 0 && <input type="checkbox" className="size-4" aria-label={`Record ${name}`} checked={!allOut} disabled={pending} onChange={(e) => onToggle(places, !e.target.checked)} />}
                  </td>
                )}
                <th scope="rowgroup" colSpan={5} className="px-3 py-2 text-left font-medium">
                  {g.metric ? <Link href={`/metrics/${g.metric.slug}`}>{g.metric.name}</Link> : name}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.place} className={cn("border-b last:border-0", r.leftOut && "text-muted-foreground")}>
                  {!done && (
                    <td className="px-3 py-2">
                      {choosable(r) && <input type="checkbox" className="size-4" aria-label={`Record ${r.place}, ${name}`} checked={!r.leftOut} disabled={pending} onChange={(e) => onToggle([r.place], !e.target.checked)} />}
                    </td>
                  )}
                  <td className="fig px-3 py-2">{r.place}</td>
                  <td className="px-3 py-2">{r.periodLabel ?? "–"}</td>
                  <td className="fig px-3 py-2 text-right">{r.valueText ?? r.text}{r.before && <span className="block text-xs text-muted-foreground">there now: {r.before}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span aria-hidden className={cn("mr-1.5 inline-block size-2 rounded-full", r.leftOut ? "bg-muted-foreground" : OUTCOME_TONE[r.outcome])} />
                    {outcomeWord(r)}
                    {r.changed && <span className="block text-xs text-muted-foreground">changed since the preview</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.leftOut ? "Left out." : r.detail}
                    {r.approval?.reasons.length ? <span className="block">{r.approval.reasons.join("; ")}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
