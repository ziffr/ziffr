"use client";
// Changing a Metric's description (GLOSSARY: Metric, Target Range, Polarity, Submission Rule, Aggregation): for its
// owner, in a dialog on the Settings tab. The core checks the owner and every field, refuses a new period once the
// Metric has values, and keeps each change as a Version. The target range is read in the Workspace's Number Style by
// the core's one reader, and a number it cannot read is refused rather than dropped.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilLine } from "lucide-react";
import { updateMetricDetails } from "@/app/series-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { POLARITY_LABEL, RULE_LABEL } from "@ziffr/core/format";
import type { Metric, Period, Polarity, SubmissionRule } from "@ziffr/core/types";
import { PERIOD_LABEL } from "@ziffr/core/periods";
import { NUMBER_STYLE_MARKS, type NumberStyle } from "@ziffr/core/number-style";
import { readNumber } from "@ziffr/core/numbers";

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";
type M = Pick<Metric, "id" | "name" | "description" | "unit" | "format" | "decimals" | "period" | "submission_rule" | "polarity" | "aggregation" | "target_min" | "target_max" | "formula">;

/** "Edit details…" with the Metric's description as a form. `fixed` keeps the period as it is, and says why: the
 * Metric has values, or targets or projections by period. */
export function EditDetails({ metric, fixed, numberStyle }: { metric: M; fixed: "values" | "series" | null; numberStyle: NumberStyle }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  // Empty is no target; anything else must read as a number, or nothing is saved.
  const num = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = readNumber(s, numberStyle);
    if (n === null) throw new Error(`“${s}” is not a number. Write it like ${numberStyle}.`);
    return n;
  };
  // Written with the style's decimal mark, so the field reads back as the same number.
  const shown = (v: number | null) => (v === null ? "" : String(v).replace(".", NUMBER_STYLE_MARKS[numberStyle].decimal));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}><PencilLine aria-hidden /> Edit details…</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Edit {metric.name}</DialogTitle>
        <form
          className="mt-2 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              try {
                await updateMetricDetails(metric.id, {
                  name: String(f.get("name") ?? ""), description: String(f.get("description") ?? ""), unit: String(f.get("unit") ?? ""),
                  format: String(f.get("format")), decimals: Number(f.get("decimals")), period: String(f.get("period") ?? metric.period),
                  submissionRule: metric.formula ? undefined : String(f.get("submission_rule")), polarity: String(f.get("polarity")),
                  aggregation: String(f.get("aggregation")), targetMin: num(f.get("target_min")), targetMax: num(f.get("target_max")),
                });
                toast.success("Saved");
                setOpen(false);
                router.refresh();
              } catch (err) {
                toast.error("Not saved", { description: (err as Error).message });
              }
            });
          }}
        >
          <div className="sm:col-span-2"><Label htmlFor="ed-name">Name</Label><Input id="ed-name" name="name" defaultValue={metric.name} required maxLength={120} /></div>
          <div className="sm:col-span-2"><Label htmlFor="ed-desc">Description</Label><Textarea id="ed-desc" name="description" defaultValue={metric.description ?? ""} maxLength={2000} rows={3} /></div>
          <div>
            <Label htmlFor="ed-format">Format</Label>
            <select id="ed-format" name="format" defaultValue={metric.format} className={field}>
              <option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option>
            </select>
          </div>
          <div><Label htmlFor="ed-unit">Unit</Label><Input id="ed-unit" name="unit" defaultValue={metric.unit ?? ""} maxLength={20} placeholder="e.g. orders, €" /></div>
          <div><Label htmlFor="ed-dec">Decimals</Label><Input id="ed-dec" name="decimals" type="number" min={0} max={6} defaultValue={metric.decimals} /></div>
          <div>
            <Label htmlFor="ed-period">Period</Label>
            <select id="ed-period" name="period" defaultValue={metric.period} disabled={Boolean(fixed)} className={field}>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
            </select>
            {fixed && <p className="mt-1 text-xs text-muted-foreground">{fixed === "values" ? "Fixed once values exist; duplicate the Metric for another period." : "Fixed while it has targets or projections by period; remove them first."}</p>}
          </div>
          <div>
            <Label htmlFor="ed-pol">Which way is good</Label>
            <select id="ed-pol" name="polarity" defaultValue={metric.polarity} className={field}>
              {(["higher", "lower", "target"] as Polarity[]).map((p) => <option key={p} value={p}>{POLARITY_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="ed-agg">Aggregation</Label>
            <select id="ed-agg" name="aggregation" defaultValue={metric.aggregation} className={field}>
              <option value="sum">Sum</option><option value="average">Average</option><option value="last">Last value</option><option value="none">Does not combine</option>
            </select>
          </div>
          <div><Label htmlFor="ed-tmin">Target from</Label><Input id="ed-tmin" name="target_min" inputMode="decimal" defaultValue={shown(metric.target_min)} placeholder="no lower target" /></div>
          <div><Label htmlFor="ed-tmax">Target up to</Label><Input id="ed-tmax" name="target_max" inputMode="decimal" defaultValue={shown(metric.target_max)} placeholder="no upper target" /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">This range applies to every period without its own target; targets for single periods are on the Targets tab.</p>
          {!metric.formula && (
            <div className="sm:col-span-2">
              <Label htmlFor="ed-rule">A second value for a period</Label>
              <select id="ed-rule" name="submission_rule" defaultValue={metric.submission_rule} className={field}>
                {(["overwrite", "reject", "add", "keep_both"] as SubmissionRule[]).map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
