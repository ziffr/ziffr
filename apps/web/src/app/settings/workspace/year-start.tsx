"use client";
// The workspace's year start (spec 0017, ticket #39; GLOSSARY: Fiscal Year): where its quarters, half-years and years
// begin. The core says which months it may move to and checks the month again on the server.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setYearStart } from "@/app/settings-actions";
import { monthName, periodLabel, periodStart, type YearStart } from "@ziffr/core/periods";

const MONTHS = Array.from({ length: 12 }, (_, i) => (i + 1) as YearStart);
const field = "mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm font-normal disabled:opacity-70";

/** "Year starts in", with a form for Owners and Admins; months that would split what is kept by quarter or year are
 * left out, and the page says why. */
export function YearStartForm({ yearStart, allowed, why, canEdit, today }: { yearStart: YearStart; allowed: YearStart[]; why: string | null; canEdit: boolean; today: string }) {
  const [pending, start] = useTransition();
  const [m, setM] = useState<YearStart>(yearStart);
  // What the choice means, in the names Ziffr will use: this year and its quarter now.
  const example = `This year is ${periodLabel(periodStart(today, "year", m), "year", m)}; this quarter is ${periodLabel(periodStart(today, "quarter", m), "quarter", m)}.`;
  const save = () => start(async () => {
    try { await setYearStart(m); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: (err as Error).message }); }
  });
  return (
    <section aria-labelledby="year-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="year-heading" className="font-medium">Fiscal year</h2>
        <p className="text-sm text-muted-foreground">Where quarters, half-years and years begin, for Metrics, Comparisons and Snapshots alike. Months, weeks and days keep their calendar names.</p>
      </div>
      {canEdit ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="min-w-48 text-sm font-medium">Year starts in
            <select value={m} disabled={pending} onChange={(e) => setM(Number(e.target.value) as YearStart)} className={field}>
              {MONTHS.map((x) => <option key={x} value={x} disabled={!allowed.includes(x)}>{monthName(x)}</option>)}
            </select>
          </label>
          <Button type="submit" variant="outline" disabled={pending || m === yearStart}>Save</Button>
        </form>
      ) : (
        <p className="text-sm">Year starts in {monthName(yearStart)}</p>
      )}
      <p className="text-sm text-muted-foreground">{example}</p>
      {/* Stored quarters and years keep the starts they were kept with, so a month that would split them is out. */}
      {canEdit && why && <p className="text-sm text-muted-foreground">{why}</p>}
    </section>
  );
}
