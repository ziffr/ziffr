"use client";
// "Add up Metrics" (GLOSSARY: Total; spec 0058, "Team totals"): the form for a Total over Metrics the person owns or
// edits. Only the choices the core listed come here (id, name, period, unit, format, Aggregation). Once one is picked,
// only those that go with it can be added; the core checks all of it again and its refusal is shown in its own words.
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTotal } from "@/app/total-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import type { YearStart } from "@ziffr/core/periods";
import { PERIOD_LABEL } from "@ziffr/core/periods";
import { partsProblem, TOTAL_MAX_PARTS } from "@ziffr/core/total-rules";
import type { TotalChoice } from "@ziffr/core/total-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { periodChoices } from "../period-choices";

const field = "min-h-11 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-base sm:min-h-9 sm:text-sm";
const number = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** The form: a name, the Metrics to add up, from when they count and what the Total aims at. */
export function TotalForm({ choices, yearStart }: { choices: TotalChoice[]; yearStart: YearStart }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [targets, setTargets] = useState("own");
  const chosen = choices.filter((c) => picked.includes(c.id));
  const first = chosen[0];
  const fits = (c: TotalChoice) => !first || picked.includes(c.id) || !partsProblem([{ ...first, formula: null }, { ...c, formula: null }]);
  const full = picked.length >= TOTAL_MAX_PARTS;
  return (
    <form
      className="grid gap-6 lg:grid-cols-[1fr_20rem]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const text = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          setError(null);
          try {
            const made = await createTotal({ name: text("name"), description: text("description"), parts: picked, from: text("from") || null, targets, targetMin: number(text("target_min")), targetMax: number(text("target_max")) });
            if (isActionError(made)) { setError(made.error); return; }
            router.push(`/metrics/${made.slug}?created=1`);
          } catch {
            setError(UNEXPECTED);
          }
        });
      }}
    >
      <div className="space-y-6">
        <section className="stock rounded-[var(--radius-card)] p-5">
          <h2 className="mb-4 font-medium">What is it?</h2>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="total-name" className="mb-1.5 block">Name</Label>
              <Input id="total-name" name="name" required maxLength={120} placeholder="e.g. Commit, whole team" className="max-sm:min-h-11 max-sm:text-base" />
            </div>
            <div>
              <Label htmlFor="total-description" className="mb-1.5 block">Description</Label>
              <Textarea id="total-description" name="description" rows={2} placeholder="What is it, and why does it matter?" className="max-sm:text-base" />
            </div>
          </div>
        </section>

        <section className="stock rounded-[var(--radius-card)] p-5">
          <h2 className="mb-1 font-medium">Which Metrics does it add up?</h2>
          <p className="mb-4 text-xs text-muted-foreground">Metrics you own or edit that share a period, unit, number format and Aggregation. You can add and end them later.</p>
          {choices.length === 0 ? (
            <p role="status" className="rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-4 text-sm">
              You have no Metric to add up yet. <Link href="/metrics/new?scratch=1" className="underline">Make one first</Link>.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {choices.map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-11 items-center gap-3 py-1 text-sm has-disabled:text-muted-foreground">
                    <input
                      type="checkbox" className="size-5 shrink-0 accent-primary" checked={picked.includes(c.id)} disabled={!picked.includes(c.id) && (!fits(c) || full)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((id) => id !== c.id)))}
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{c.name} <span className="text-muted-foreground">· {PERIOD_LABEL[c.period].toLowerCase()}{c.unit ? ` · ${c.unit}` : ""}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {first && (
            <div className="mt-4">
              <Label htmlFor="total-from" className="mb-1.5 block">Count them from</Label>
              <select id="total-from" name="from" className={field} defaultValue="">
                <option value="">First period with a value</option>
                {periodChoices(first.period, yearStart).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          )}
        </section>

        <section className="stock rounded-[var(--radius-card)] p-5">
          <h2 className="mb-4 font-medium">Target</h2>
          <fieldset className="space-y-1 text-sm">
            <legend className="sr-only">Where the target comes from</legend>
            <label className="flex min-h-11 items-center gap-3"><input type="radio" name="targets" className="size-5 accent-primary" checked={targets === "own"} onChange={() => setTargets("own")} /> Its own target, such as the team’s quota</label>
            <label className="flex min-h-11 items-center gap-3"><input type="radio" name="targets" className="size-5 accent-primary" checked={targets === "parts"} onChange={() => setTargets("parts")} /> The targets of its Metrics, added up</label>
          </fieldset>
          {targets === "own" && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div><Label htmlFor="total-min" className="mb-1.5 block">Target from</Label><Input id="total-min" name="target_min" type="number" step="any" className="max-sm:min-h-11 max-sm:text-base" /></div>
              <div><Label htmlFor="total-max" className="mb-1.5 block">Target to</Label><Input id="total-max" name="target_max" type="number" step="any" className="max-sm:min-h-11 max-sm:text-base" /></div>
            </div>
          )}
        </section>
      </div>
      <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="stock rounded-[var(--radius-card)] p-4 text-sm">
          <div className="font-medium">Who sees its numbers</div>
          <p className="mt-1 text-muted-foreground">You own it. Whoever you share it with sees a period’s sum only if they may see every Metric counted in it, unless you decide otherwise on its page.</p>
        </div>
        {error && <p role="alert" className="rounded-[var(--radius-card)] border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full max-sm:min-h-11" disabled={pending || picked.length === 0}>Create metric</Button>
        <Link href="/metrics/new" className={buttonVariants({ variant: "ghost", className: "w-full max-sm:min-h-11" })}>Cancel</Link>
      </aside>
    </form>
  );
}
