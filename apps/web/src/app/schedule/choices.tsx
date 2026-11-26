// Choices above the Schedule's views (GLOSSARY: Schedule): links and plain forms, so a view can be linked and nothing
// needs a script. The chosen one is marked with `aria-current` and bold, never by colour alone.
import Link from "next/link";
import { cn } from "@/lib/utils";

/** What the address of the Schedule may carry. */
export type Params = { view?: string; kind?: string; workflow?: string; metric?: string; period?: string };

/** The address of the Schedule with some choices changed; empty ones are left out. */
export function href(sp: Params, change: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/schedule?${s}` : "/schedule";
}

/** A row of choices as links. */
export function Choices({ label, options, current, make }: { label: string; options: { id: string; label: string }[]; current: string; make: (id: string) => string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1 text-sm">
      {options.map((o) => (
        <Link key={o.id} href={make(o.id)} aria-current={o.id === current ? "true" : undefined} className={cn("inline-flex min-h-11 items-center rounded-[var(--radius-input)] border px-3 sm:min-h-0 sm:px-2 sm:py-0.5", o.id === current ? "border-foreground font-semibold" : "border-[var(--color-rule-2)] text-muted-foreground hover:text-foreground")}>{o.label}</Link>
      ))}
    </nav>
  );
}

/** A select that reloads the page with the choice: a form with a button. */
export function Pick({ name, label, value, options, sp }: { name: keyof Params; label: string; value: string; options: { id: string; label: string }[]; sp: Params }) {
  return (
    <form action="/schedule" className="flex items-center gap-1 text-sm max-sm:w-full">
      {Object.entries(sp).filter(([k, v]) => k !== name && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="text-muted-foreground max-sm:w-20 max-sm:shrink-0" htmlFor={`pick-${name}`}>{label}</label>
      <select id={`pick-${name}`} name={name} defaultValue={value} className="rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-card px-1.5 py-0.5 max-sm:min-w-0 max-sm:flex-1">
        <option value="">All</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button type="submit" className="rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-2 py-0.5 text-muted-foreground hover:text-foreground max-sm:shrink-0 max-sm:px-3">Show</button>
    </form>
  );
}
