"use client";
// The pieces the screens of a guided Pack set-up share (spec 0068; GLOSSARY: Pack, Contact), from the app's own tokens,
// fields and button, beside the question and choice cards it takes from First Steps.
import { useId } from "react";
import { PHONE_ACTIONS, PHONE_BUTTON, PHONE_FIELD } from "@/app/setup/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StartPickable } from "@ziffr/core/pack-start-plan";
import { cn } from "@/lib/utils";
import type { PersonDraft } from "./answers";

/** A text field: 44 px and 16 px text on a phone. */
export const TEXT_FIELD = "mt-1 h-11 text-base md:h-9 md:text-sm";
/** A line of words that stands on its own: a note, or what is wrong. */
export const NOTE = "rounded-[var(--radius-input)] bg-muted p-2.5 text-sm break-words";
/** A text button that is a comfortable target. */
export const TEXT_BUTTON = "h-11 md:h-9";

/** One screen's form: Enter goes on, as the button does. While `problem` stands the button is off and says why. */
export function StepForm({ problem, onContinue, label = "Continue", aside, note, children }: {
  /** Why the screen cannot go on yet, or null. */
  problem: string | null;
  onContinue: () => void;
  label?: string;
  /** Another way on, beside the button. */
  aside?: React.ReactNode;
  /** Words under the button. */
  note?: string;
  children: React.ReactNode;
}) {
  const why = useId();
  return (
    <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!problem) onContinue(); }}>
      {children}
      <div className="space-y-2">
        <div className={PHONE_ACTIONS}>
          <Button type="submit" className={cn(PHONE_BUTTON, "sm:px-6")} disabled={problem !== null} aria-describedby={problem || note ? why : undefined}>{label}</Button>
          {aside}
        </div>
        {(problem || note) && <p id={why} role="status" className="text-sm text-muted-foreground break-words">{problem ?? note}</p>}
      </div>
    </form>
  );
}

/** A card that holds a group of fields or rows. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("stock rounded-[var(--radius-card)] p-4", className)} {...props} />;
}

/** A small heading with a list of short lines under it, such as what happens every week. */
export function Lines({ title, items }: { title: string; items: string[] }) {
  const id = useId();
  if (!items.length) return null;
  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <h2 id={id} className="text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="stock divide-y divide-border rounded-[var(--radius-card)] text-sm">
        {items.map((item, i) => <li key={i} className="px-4 py-3 break-words">{item}</li>)}
      </ul>
    </section>
  );
}

/** A box to tick with its words, 44 px high on a phone. */
export function Tick({ checked, onChange, title, hint }: { checked: boolean; onChange: (checked: boolean) => void; title: string; hint?: string }) {
  return (
    <label className="flex min-h-11 w-full cursor-pointer items-start gap-3 py-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" />
      <span className="min-w-0 break-words">
        <span className="font-medium">{title}</span>
        {hint && <span className="block text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/** The name and email address of someone new. `of` tells a screen reader whose they are. */
export function NewPersonFields({ value, of, onChange }: { value: PersonDraft; of: string; onChange: (value: PersonDraft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block min-w-0 text-sm font-medium">
        Name<span className="sr-only"> of {of}</span>
        <Input className={TEXT_FIELD} value={value.name} maxLength={80} autoComplete="off" onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </label>
      <label className="block min-w-0 text-sm font-medium">
        Email<span className="sr-only"> of {of}</span>
        <Input className={TEXT_FIELD} type="email" inputMode="email" autoCapitalize="none" value={value.email} maxLength={254} autoComplete="off" onChange={(e) => onChange({ ...value, email: e.target.value })} />
      </label>
    </div>
  );
}

type PersonProps = {
  value: PersonDraft;
  /** Whose person this is, such as "line 2" or "Sales lead", for the field's name. */
  of: string;
  /** The words above the list. */
  label: string;
  onChange: (value: PersonDraft) => void;
  /** Those who may be picked here. */
  people: StartPickable[];
  /** The name of the person setting up, where they may be chosen. */
  me?: string;
  /** Whether someone new may be added (not in a Practice Workspace). */
  allowNew: boolean;
};

const KIND_HINT: Record<StartPickable["kind"], string> = { member: "", guest: " (Guest)", contact: " (Contact)" };

/** Picks a person: someone new by name and email address, the person setting up, or someone already here. */
export function PersonPick({ value, of, label, onChange, people, me, allowNew }: PersonProps) {
  const choosing = me !== undefined || people.length > 0 || !allowNew;
  return (
    <div className="space-y-3">
      {choosing && (
        <label className="block text-sm font-medium">
          {label}<span className="sr-only"> for {of}</span>
          <select
            className={cn(PHONE_FIELD, "mt-1 block sm:w-full")}
            value={value.who === "here" ? `here:${value.here}` : value.who}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v.startsWith("here:") ? { ...value, who: "here", here: v.slice(5) } : { ...value, who: v === "me" ? "me" : "new", here: "" });
            }}
          >
            {allowNew ? <option value="new">Someone new</option> : <option value="here:" disabled>Pick someone</option>}
            {me !== undefined && <option value="me">Me ({me})</option>}
            {people.length > 0 && (
              <optgroup label="Already here">
                {people.map((p) => <option key={p.id} value={`here:${p.id}`}>{p.name}{KIND_HINT[p.kind]}</option>)}
              </optgroup>
            )}
          </select>
        </label>
      )}
      {value.who === "new" && allowNew && <NewPersonFields value={value} of={of} onChange={onChange} />}
    </div>
  );
}
