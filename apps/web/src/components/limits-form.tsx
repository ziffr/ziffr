"use client";
// Settable limits (ticket #518; GLOSSARY: Settable Limit): one row per limit with its range, what is in effect and a
// field to set it lower; empty follows the level above. Used for the Workspace's limits (Owners and Admins) and for
// a person's own. The core checks every value again, against the level above.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shown, unwrap, type ActionError } from "@/lib/action-error";
import type { LimitView } from "@ziffr/core/limit-levels";

const field = "mt-1 block h-9 w-28 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm font-normal disabled:opacity-70";
const UNIT: Record<LimitView["unit"], string> = { alerts: "Alerts", messages: "messages", days: "days", percent: "%" };

function Row({ limit, canEdit, save }: { limit: LimitView; canEdit: boolean; save: (key: string, value: number | null) => Promise<ActionError | void> }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState(limit.set === null ? "" : String(limit.set));
  const parsed = text.trim() === "" ? null : /^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : undefined;
  const changed = parsed !== undefined && parsed !== limit.set;
  const run = () => start(async () => {
    try { unwrap((await save(limit.key, parsed ?? null)) ?? undefined); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: shown(err) }); }
  });
  return (
    <li className="space-y-1 py-3">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (parsed !== undefined) run(); }}>
        <label className="min-w-64 flex-1 text-sm font-medium">{limit.label}
          <span className="block text-sm font-normal text-muted-foreground">{limit.help}</span>
        </label>
        {canEdit ? (
          <>
            <label className="text-sm font-medium"><span className="sr-only">{limit.label}, {UNIT[limit.unit]}</span>
              <input inputMode="numeric" value={text} placeholder={String(limit.ceiling)} disabled={pending} onChange={(e) => setText(e.target.value)} aria-describedby={`${limit.key}-range`} className={field} />
            </label>
            <Button type="submit" variant="outline" disabled={pending || !changed}>Save</Button>
          </>
        ) : null}
      </form>
      <p id={`${limit.key}-range`} className="text-sm text-muted-foreground">
        In effect: <strong className="font-medium text-foreground">{limit.effective} {UNIT[limit.unit]}</strong>. Allowed: {limit.min} to {limit.max}.{limit.set === null ? " Follows the level above." : " Leave empty to follow the level above."}
      </p>
    </li>
  );
}

/** A list of settable limits with a field each; `save` is the server action that sets or clears one. */
export function LimitsForm({ title, intro, limits, canEdit, save }: { title: string; intro: string; limits: LimitView[]; canEdit: boolean; save: (key: string, value: number | null) => Promise<ActionError | void> }) {
  const id = title.toLowerCase().replace(/\W+/g, "-");
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id={`${id}-heading`} className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      <ul className="divide-y divide-border">{limits.map((l) => <Row key={l.key} limit={l} canEdit={canEdit} save={save} />)}</ul>
    </section>
  );
}
