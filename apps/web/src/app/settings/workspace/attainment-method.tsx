"use client";
// The workspace's Attainment method (spec 0022, ticket #130; GLOSSARY: Attainment): how the percentage of target is
// computed for Metrics without a method of their own. Owners and Admins change it; the core checks the pick again.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setAttainmentMethod } from "@/app/settings-actions";
import { ATTAINMENT_METHODS, ATTAINMENT_METHOD_LABEL, ATTAINMENT_METHOD_RULE, type AttainmentMethod } from "@ziffr/core/attainment-method";

const field = "mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm font-normal disabled:opacity-70";

/** "Attainment", with a form for Owners and Admins and the method in words for everyone else. */
export function AttainmentMethodForm({ method, canEdit }: { method: AttainmentMethod; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [m, setM] = useState<AttainmentMethod>(method);
  const save = () => start(async () => {
    try { await setAttainmentMethod(m); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: (err as Error).message }); }
  });
  return (
    <section aria-labelledby="attainment-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="attainment-heading" className="font-medium">Attainment</h2>
        <p className="text-sm text-muted-foreground">How the percentage of target is computed, for every Metric without a method of its own. The two agree for “higher is better” with a target above zero; for 5 against at most 10, by ratio is 200 %, by distance 150 %. Snapshots and frozen View Links keep the method they were made with.</p>
      </div>
      {canEdit ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="min-w-72 flex-1 text-sm font-medium">Attainment is computed
            <select value={m} disabled={pending} onChange={(e) => setM(e.target.value as AttainmentMethod)} className={field}>
              {ATTAINMENT_METHODS.map((x) => <option key={x} value={x}>{ATTAINMENT_METHOD_LABEL[x].toLowerCase()}: {ATTAINMENT_METHOD_RULE[x]}</option>)}
            </select>
          </label>
          <Button type="submit" variant="outline" disabled={pending || m === method}>Save</Button>
        </form>
      ) : (
        <p className="text-sm">Attainment is computed {ATTAINMENT_METHOD_LABEL[method].toLowerCase()}: {ATTAINMENT_METHOD_RULE[method]}.</p>
      )}
    </section>
  );
}
