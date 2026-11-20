"use client";
// The submitter's choices on a Self-check task (GLOSSARY: Self-check): when nobody else can approve their value, they
// confirm it or correct it. Never an Approval. The same works by replying "confirm" or "Correction: <value>" through
// Slack, email or Telegram. The core checks that the task is theirs and the number.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmOwnValue, correctOwnValue } from "@/app/workflow-actions";

/** Confirm and Correct for the submitter's own Self-check task. */
export function SelfCheckBar({ actionId, value }: { actionId: number; value: number | null }) {
  const router = useRouter();
  const [correcting, setCorrecting] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const run = (f: () => Promise<unknown>) => start(async () => {
    try { toast.success(String(unwrap(await f()))); router.refresh(); } catch (err) { toast.error("Not done", { description: shown(err) }); }
  });
  const corrected = Number(text.replace(",", "."));
  return (
    <div className="mt-4 rounded-[var(--radius-input)] border border-[var(--color-accent-2)] p-3 text-sm">
      <p className="font-medium">Check your value</p>
      <p className="text-xs text-muted-foreground">Nobody else can approve it, so you check it yourself. It is recorded as confirmed by you, not as approved.</p>
      {!correcting ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => run(() => confirmOwnValue(actionId))}><Check aria-hidden /> Confirm</Button>
          <Button variant="outline" disabled={pending} onClick={() => setCorrecting(true)}><PencilLine aria-hidden /> Correct</Button>
        </div>
      ) : (
        <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => correctOwnValue(actionId, corrected)); }}>
          <Input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder={value === null ? "" : String(value)} aria-label="The right value" className="h-8 w-36" autoFocus />
          <Button type="submit" disabled={pending || !text.trim() || !Number.isFinite(corrected)}>Correct</Button>
          <Button type="button" variant="ghost" onClick={() => setCorrecting(false)}>Cancel</Button>
        </form>
      )}
    </div>
  );
}
