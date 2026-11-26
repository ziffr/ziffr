"use client";
// What a Total adds up, on its page (GLOSSARY: Total; spec 0058, "Team totals"): how its latest periods stand, the
// Metrics counted in it and, for those who may change them, adding, ending and removing one, its target, and for its
// owner opening it. Only what the core gave for this person is drawn (totalPage names no Metric they do not see); every
// change is checked in the core again.
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTotalPart, removeTotalPart, setTotalPartPeriods, setTotalTargets } from "@/app/total-actions";
import { isActionError, UNEXPECTED, type ActionError } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { NotApprovedMark } from "@/views/approval-mark";
import { formatValue } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import { NOT_ALL_IN, NOT_SHOWN, OWNER_CANNOT_SHARE } from "@ziffr/core/total-rules";
import type { TotalPageData } from "@ziffr/core/total-page";
import type { Metric, Point } from "@ziffr/core/types";
import type { PeriodChoice } from "../period-choices";
import { TotalOpening } from "./total-opening";

const select = "min-h-11 max-w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-base sm:min-h-9 sm:text-sm";

/** What the owner of an open Total confirms before changing what it adds up. */
const CONFIRM = "I know that people who see this open Total learn the changed sums, and through them a single Metric’s numbers.";

type Props = { metric: Metric; data: TotalPageData; values: Point[]; yearStart: YearStart; numberStyle: NumberStyle; periods: PeriodChoice[] };

/** The section "What it adds up" of a Total's page. */
export function TotalPanel({ metric, data, values, yearStart, numberStyle, periods }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [part, setPart] = useState("");
  const [from, setFrom] = useState(periods[0]?.value ?? "");
  const name = (p: string) => periodLabel(p, metric.period, yearStart, true);
  const byPeriod = new Map(values.map((v) => [v.period, v.value]));
  // One change: its refusal in the core's words, else the page read afresh.
  const change = (work: () => Promise<ActionError | void>, done: string) => start(async () => {
    try {
      const r = await work();
      if (isActionError(r)) { toast.error("Not changed", { description: r.error }); return; }
      toast.success(done);
      setRemoving(null);
      router.refresh();
    } catch {
      toast.error("Not changed", { description: UNEXPECTED });
    }
  });
  const blocked = pending || (data.open && !confirmed);
  return (
    <section aria-labelledby="total-h" className="stock rounded-[var(--radius-card)] p-5 text-sm">
      <h2 id="total-h" className="font-medium">What it adds up</h2>
      <p className="mt-1 text-muted-foreground">
        {data.open
          ? "Open: people who see this Total see its sums, also without seeing every Metric it adds up."
          : "A period is shown only to people who see every Metric counted in it."}
      </p>
      {metric.inputs_withheld && <p role="status" className="mt-3">{OWNER_CANNOT_SHARE}</p>}
      {data.periods.length > 0 && (
        <table className="mt-3 w-full">
          <caption className="sr-only">The latest periods</caption>
          <tbody>
            {data.periods.map((p) => (
              <tr key={p.period} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left align-top font-normal whitespace-nowrap text-muted-foreground">{name(p.period)}</th>
                <td className="py-2 text-right">
                  {p.state === "shown" && byPeriod.has(p.period)
                    ? <span className="inline-flex flex-wrap items-center justify-end gap-2"><span className="fig">{formatValue(metric, byPeriod.get(p.period)!, numberStyle)}</span>{data.unapproved.includes(p.period) && <NotApprovedMark />}</span>
                    : p.state === "withheld" ? NOT_SHOWN : p.of ? `${p.in} of ${p.of} in` : NOT_ALL_IN}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="mt-5 font-medium">Metrics</h3>
      <p className="mt-1 text-xs text-muted-foreground">Only Metrics you may see are listed.</p>
      {data.open && data.mayChange && (
        <label className="mt-3 flex min-h-11 items-start gap-2">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
          <span>{CONFIRM}</span>
        </label>
      )}
      <ul className="mt-2 divide-y divide-border">
        {data.parts.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link href={`/metrics/${p.slug}`} className="inline-block py-1 [overflow-wrap:anywhere]">{p.name}</Link>
              <div className="text-xs text-muted-foreground">Counted from {name(p.first)}{p.last ? ` up to ${name(p.last)}` : ""}</div>
            </div>
            {data.mayChange && (removing === p.id ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span>Past totals change too.</span>
                <Button variant="destructive" className="min-h-11 sm:min-h-9" disabled={blocked} onClick={() => change(() => removeTotalPart(metric.id, p.id, confirmed), `${p.name} removed`)}>Remove {p.name}</Button>
                <Button variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setRemoving(null)}>Keep it</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Count ${p.name} up to`} className={select} value={p.last ?? ""} disabled={blocked}
                  onChange={(e) => change(() => setTotalPartPeriods(metric.id, p.id, e.target.value || null, confirmed), e.target.value ? `${p.name} counts up to ${name(e.target.value)}` : `${p.name} counts again`)}
                >
                  <option value="">Counts from now on</option>
                  {[...(p.last && !periods.some((c) => c.value === p.last) ? [{ value: p.last, label: name(p.last) }] : []), ...periods].filter((c) => c.value >= p.first).map((c) => <option key={c.value} value={c.value}>Up to {c.label}</option>)}
                </select>
                <Button variant="ghost" className="min-h-11 sm:min-h-9" disabled={pending} onClick={() => setRemoving(p.id)}>Remove…</Button>
              </div>
            ))}
          </li>
        ))}
      </ul>
      {data.mayChange && data.choices.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select aria-label="Metric to add" className={select} value={part} onChange={(e) => setPart(e.target.value)}>
            <option value="">Add a Metric…</option>
            {data.choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Count it from" className={select} value={from} onChange={(e) => setFrom(e.target.value)}>
            {periods.map((c) => <option key={c.value} value={c.value}>From {c.label}</option>)}
          </select>
          <Button variant="outline" className="min-h-11 sm:min-h-9" disabled={blocked || !part} onClick={() => change(async () => { const r = await addTotalPart(metric.id, Number(part), from, confirmed); if (!isActionError(r)) setPart(""); return r; }, "Added")}>Add</Button>
        </div>
      )}
      {data.mayChange && (
        <div className="mt-5">
          <label htmlFor="total-targets" className="block font-medium">Target</label>
          <select id="total-targets" className={`${select} mt-1.5`} value={data.targets} disabled={blocked} onChange={(e) => change(() => setTotalTargets(metric.id, e.target.value, confirmed), "Target changed")}>
            <option value="own">Its own target</option>
            <option value="parts">Its Metrics’ targets added up</option>
          </select>
          {data.targets === "own" && <p className="mt-1.5 text-xs text-muted-foreground">Set it under Targets. Choosing the added-up targets takes its own target range away.</p>}
        </div>
      )}
      {data.open && !data.mayChange && <p className="mt-3 text-xs text-muted-foreground">While it is open, only its owner changes what it adds up.</p>}
      {data.mayOpen && <TotalOpening metricId={metric.id} open={data.open} period={metric.period} yearStart={yearStart} />}
    </section>
  );
}
