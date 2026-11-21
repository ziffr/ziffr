"use client";
// "Calculated from other Metrics" (GLOSSARY: Derived Metric; ticket #619): the form for a Metric worked out by a
// formula from Metrics the person sees. Only the choices the core listed come here (slug, name, period, unit); the
// core checks the formula, the period and every field again, and its refusal is shown under the form in its own words.
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createDerivedMetric } from "@/app/actions";
import type { ActionError } from "@/lib/action-error";
import type { FormulaChoice } from "@ziffr/core/derived-metrics";
import { POLARITY_LABEL } from "@ziffr/core/format";
import { PERIOD_LABEL } from "@ziffr/core/periods";
import type { Period, Polarity } from "@ziffr/core/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

/** The form: a name, the formula written with the Metrics' names picked from a list, and what is optional. */
export function DerivedForm({ choices }: { choices: FormulaChoice[] }) {
  const [result, action, pending] = useActionState<ActionError | null, FormData>(createDerivedMetric, null);
  const [formula, setFormula] = useState("");
  const box = useRef<HTMLInputElement>(null);
  // "change" or "prev" chosen: the next Metric picked goes inside it, as change({slug}).
  const [wrap, setWrap] = useState<"change" | "prev" | null>(null);
  // Inserted where the cursor stands, so a formula is built by clicking and typing the signs between.
  const insert = (text: string) => {
    const el = box.current;
    const at = el?.selectionStart ?? formula.length;
    const end = el?.selectionEnd ?? at;
    setFormula(formula.slice(0, at) + text + formula.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + text.length, at + text.length); });
  };
  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <section className="stock rounded-[var(--radius-card)] p-5">
          <h2 className="mb-4 font-medium">What is it?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="derived-name" className="mb-1.5 block">Name</Label>
              <Input id="derived-name" name="name" required maxLength={120} placeholder="e.g. Gross margin" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="derived-description" className="mb-1.5 block">Description</Label>
              <Textarea id="derived-description" name="description" rows={2} placeholder="What does the number say?" />
            </div>
          </div>
        </section>

        <section className="stock rounded-[var(--radius-card)] p-5">
          <h2 className="mb-1 font-medium">How is it calculated?</h2>
          <p className="mb-4 text-xs text-muted-foreground">A formula over Metrics you own or edit. Pick a Metric to add it, and type <code>+ - * /</code>, brackets and numbers between them.</p>
          {choices.length === 0 ? (
            <p role="status" className="rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-4 text-sm">
              You see no Metric to calculate from yet. <Link href="/metrics/new?scratch=1" className="underline">Make one first</Link>.
            </p>
          ) : (
            <>
              <Label htmlFor="derived-formula" className="mb-1.5 block">Formula</Label>
              <Input
                id="derived-formula" name="formula" required maxLength={500} ref={box} value={formula} onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g. ({revenue} - {cost}) / {revenue} * 100" className="font-mono" autoComplete="off" spellCheck={false}
                aria-describedby={result ? "derived-error" : "derived-help"}
              />
              <div id="derived-help" className="mt-3 space-y-3">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Metrics</div>
                  <div className="flex flex-wrap gap-1.5">
                    {choices.map((c) => (
                      <button key={c.slug} type="button" onClick={() => { insert(wrap ? `${wrap}({${c.slug}})` : `{${c.slug}}`); setWrap(null); }} className="rounded-full border border-[var(--color-rule-2)] bg-card px-2.5 py-1 text-xs hover:bg-muted/60">
                        {c.name} <span className="text-muted-foreground">· {PERIOD_LABEL[c.period].toLowerCase()}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Compared with the period before</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["change", "prev"] as const).map((fn) => (
                      <button key={fn} type="button" aria-pressed={wrap === fn} onClick={() => setWrap(wrap === fn ? null : fn)} className="rounded-full border border-[var(--color-rule-2)] bg-card px-2.5 py-1 text-xs hover:bg-muted/60 aria-pressed:border-primary aria-pressed:bg-primary/10">
                        {fn}( )
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Press one, then pick a Metric above to put it inside. <code>change({"{odometer}"})</code> is this period&rsquo;s value minus the previous period&rsquo;s, <code>prev({"{odometer}"})</code> the previous period&rsquo;s value. Put a Metric between the brackets, for example <code>change({"{odometer}"}) / 7</code> for the kilometres a day from a weekly reading. A Metric like this is shown by its own period only.
                  </p>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="stock rounded-[var(--radius-card)] p-5">
          <h2 className="mb-1 font-medium">How is it shown?</h2>
          <p className="mb-4 text-xs text-muted-foreground">Everything here is optional: left empty, Ziffr takes the period and, where it fits, the unit of the Metrics it is calculated from. You can change it afterwards.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="derived-unit" className="mb-1.5 block">Unit</Label>
              <Input id="derived-unit" name="unit" maxLength={20} placeholder="e.g. km per day" />
            </div>
            <div>
              <Label htmlFor="derived-decimals" className="mb-1.5 block">Decimals</Label>
              <Input id="derived-decimals" name="decimals" type="number" min={0} max={6} step={1} placeholder="automatic" />
            </div>
            <div>
              <Label htmlFor="derived-period" className="mb-1.5 block">Period</Label>
              <select id="derived-period" name="period" defaultValue="" className={field}>
                <option value="">Same as its Metrics</option>
                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="derived-polarity" className="mb-1.5 block">Which way is good</Label>
              <select id="derived-polarity" name="polarity" defaultValue="higher" className={field}>
                {(Object.keys(POLARITY_LABEL) as Polarity[]).map((p) => <option key={p} value={p}>{POLARITY_LABEL[p]}</option>)}
              </select>
            </div>
          </div>
        </section>
      </div>
      <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="stock rounded-[var(--radius-card)] p-4 text-sm">
          <div className="font-medium">Owner</div>
          <p className="mt-1 text-muted-foreground">You. Nobody is asked for its values: it has a value in each period its Metrics have.</p>
        </div>
        {result && <p id="derived-error" role="alert" className="rounded-[var(--radius-card)] border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{result.error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={pending || choices.length === 0}>Create metric</Button>
        <Link href="/metrics/new" className={buttonVariants({ variant: "ghost", className: "w-full" })}>Cancel</Link>
      </aside>
    </form>
  );
}
