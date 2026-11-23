"use client";
// "In this Workspace" on Your profile: the person says what part of the business they work in (GLOSSARY: Business
// Function). Only they and the Workspace's Owners and Admins can see it; the core checks the value against the list.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { setMyBusinessFunction } from "@/app/settings-actions";
import { BUSINESS_FUNCTIONS, BUSINESS_FUNCTION_LABELS, type BusinessFunction } from "@ziffr/pack/business-functions";

/** The question about your own work in this Workspace, with the line saying who sees the answer. */
export function BusinessFunctionForm({ value }: { value: BusinessFunction | null }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<BusinessFunction | null>(value);
  const [pick, setPick] = useState<string>(value ?? "");
  const save = () => start(async () => {
    try {
      unwrap(await setMyBusinessFunction(pick || null));
      setSaved((pick || null) as BusinessFunction | null);
      toast.success("Saved");
    } catch (err) { toast.error("Not saved", { description: shown(err) }); }
  });
  return (
    <section aria-labelledby="in-workspace-heading" className="mt-8 max-w-xl space-y-3 border-t border-border pt-6">
      <h2 id="in-workspace-heading" className="font-medium">In this Workspace</h2>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="block text-sm font-medium">
          What do you work on yourself?
          <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={pending} className="mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
            <option value="">Not said</option>
            {BUSINESS_FUNCTIONS.map((k) => <option key={k} value={k}>{BUSINESS_FUNCTION_LABELS[k]}</option>)}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">So Ziffr can suggest what fits. Only you and this Workspace&apos;s Owners and Admins see it; it stays in this Workspace.</p>
        <Button type="submit" disabled={pending || pick === (saved ?? "")}>Save</Button>
      </form>
    </section>
  );
}
