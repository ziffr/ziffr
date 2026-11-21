"use client";
// The approver's choices on an approval task (GLOSSARY: Approval): Approve, Send back with a reason, or Correct the
// value. The same works by replying in Slack, email or WhatsApp; no chat words show here. The frame is neutral: red is
// the colour of "too low" in Ziffr.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, PencilLine, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { approveValue, proposeValueCorrection, sendValueBack } from "@/app/workflow-actions";

type Mode = "choose" | "back" | "correct";

export function ApprovalBar({ actionId, children, current }: { actionId: number; children?: ReactNode; current: number | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [comment, setComment] = useState("");
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const run = (f: () => Promise<unknown>, ok: (r: unknown) => string) => start(async () => {
    try { const r = unwrap(await f()); toast.success(ok(r)); router.refresh(); } catch (err) { toast.error("Not done", { description: shown(err) }); }
  });
  return (
    <section aria-label="Approval" className="mt-4 rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-muted/40 p-4 text-sm">
      {children}
      {mode === "choose" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => run(() => approveValue(actionId), (r) => String(r))}><CheckCheck aria-hidden /> Approve</Button>
          <Button variant="outline" disabled={pending} onClick={() => setMode("back")}><Undo2 aria-hidden /> Send back</Button>
          <Button variant="outline" disabled={pending} onClick={() => setMode("correct")}><PencilLine aria-hidden /> Correct the value</Button>
        </div>
      )}
      {mode === "back" && (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => sendValueBack(actionId, comment), () => "Sent back to the submitter"); }}>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What should they check?" aria-label="What should they check?" autoFocus />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !comment.trim()}>Send back</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("choose")}>Cancel</Button>
          </div>
        </form>
      )}
      {mode === "correct" && (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => proposeValueCorrection(actionId, Number(value), comment), () => "Correction proposed"); }}>
          <label className="flex items-center gap-2 text-sm">
            Corrected value
            <Input type="number" step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={current === null ? undefined : String(current)} className="h-8 w-36" autoFocus required />
          </label>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Why (optional)" aria-label="Why the value changes" />
          <p className="text-xs text-muted-foreground">The Metric’s owner accepts a correction, and the new value is approved again.</p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || value.trim() === ""}>Propose correction</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("choose")}>Cancel</Button>
          </div>
        </form>
      )}
    </section>
  );
}
