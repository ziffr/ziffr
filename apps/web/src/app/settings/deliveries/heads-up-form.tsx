"use client";
// Your Heads-ups (spec 0041, ticket 14; GLOSSARY: Heads-up, Delivery Preference): whether Ziffr shows you Heads-ups at all, whether it
// also tells you by message (by your Delivery Preference for updates, at most 3 a week), and the Metrics you muted. Only your own.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { setHeadsUpChoices, unmuteHeadsUpMetric } from "@/app/heads-up-actions";
import { Button } from "@/components/ui/button";

/** The two switches and the list of muted Metrics (only ones you still see). `canEdit` is false in the demo. */
export function HeadsUpForm({ show, byMessage, muted, canEdit }: { show: boolean; byMessage: boolean; muted: { id: number; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shownOn, setShown] = useState(show);
  const [told, setTold] = useState(byMessage);
  const save = (next: { show?: boolean; byMessage?: boolean }, done: string, undo: () => void) => start(async () => {
    try { unwrap(await setHeadsUpChoices(next)); toast.success(done); router.refresh(); }
    catch (e) { undo(); toast.error("Not saved", { description: shown(e) }); }
  });
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={shownOn} disabled={pending || !canEdit} className="mt-0.5 size-4 accent-[var(--color-ink)]"
          onChange={(e) => { const on = e.target.checked; setShown(on); save({ show: on }, on ? "Heads-ups are shown again" : "Heads-ups are off for you", () => setShown(!on)); }} />
        <span>Show me Heads-ups under Analyze<span className="block text-muted-foreground">When you turn this off you also get none by message.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={told} disabled={pending || !canEdit || !shownOn} className="mt-0.5 size-4 accent-[var(--color-ink)]"
          onChange={(e) => { const on = e.target.checked; setTold(on); save({ byMessage: on }, on ? "You will be told by message" : "No more messages", () => setTold(!on)); }} />
        <span>Also tell me by message<span className="block text-muted-foreground">The strongest ones, at most 3 a week, by the way you get replies and updates. The rest wait under Analyze.</span></span>
      </label>
      {muted.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Metrics you muted</p>
          <ul className="divide-y divide-[var(--color-rule-2)] rounded-[var(--radius-card)] border border-[var(--color-rule-2)]">
            {muted.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                <span>{m.name}</span>
                <Button variant="outline" size="sm" disabled={pending || !canEdit} onClick={() => start(async () => { try { unwrap(await unmuteHeadsUpMetric(m.id)); toast.success(`${m.name} is not muted any more`); router.refresh(); } catch (e) { toast.error("Not saved", { description: shown(e) }); } })}>Hear about it again</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!canEdit && <p className="text-sm text-muted-foreground">Heads-up choices can&apos;t be changed in the demo.</p>}
    </div>
  );
}
