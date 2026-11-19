"use client";
// The workspace's Number Style (spec 0022, ticket #108; GLOSSARY: Number Style): how it writes numbers. Until an
// Owner or Admin picks one it follows the Workspace Profile's country; the core checks the pick again on the server.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setNumberStyle } from "@/app/settings-actions";
import { NUMBER_STYLES, numberStyleExample, type NumberStyle } from "@ziffr/core/number-style";

const field = "mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm font-normal disabled:opacity-70";

/** "Numbers look like", with a form for Owners and Admins; while nothing is chosen it says where the style comes from. */
export function NumberStyleForm({ style, chosen, country, canEdit }: { style: NumberStyle; chosen: boolean; country: string | null; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [s, setS] = useState<NumberStyle>(style);
  const source = chosen ? null : country ? `From the Workspace's country, ${country}, until an Owner or Admin picks a style.` : "The default, until an Owner or Admin picks a style or sets the Workspace's country.";
  const save = () => start(async () => {
    try { unwrap(await setNumberStyle(s)); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: shown(err) }); }
  });
  return (
    <section aria-labelledby="number-style-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="number-style-heading" className="font-medium">Number style</h2>
        <p className="text-sm text-muted-foreground">How the workspace writes numbers: which mark groups the digits and which is the decimal. Values will be written in it, and a number such as 1.500 read by it.</p>
      </div>
      {canEdit ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="min-w-48 text-sm font-medium">Numbers look like
            <select value={s} disabled={pending} onChange={(e) => setS(e.target.value as NumberStyle)} className={field}>
              {NUMBER_STYLES.map((x) => <option key={x} value={x}>{numberStyleExample(x)}</option>)}
            </select>
          </label>
          {/* Saving the shown style while it only follows the country fixes it, so the button is on then too. */}
          <Button type="submit" variant="outline" disabled={pending || (chosen && s === style)}>Save</Button>
        </form>
      ) : (
        <p className="text-sm">Numbers look like {numberStyleExample(style)}</p>
      )}
      {source && <p className="text-sm text-muted-foreground">{source}</p>}
    </section>
  );
}
