"use client";
// The approver's choices on an approval task (GLOSSARY: Approval). The same works by replying
// "approve" or "send back: …" through Slack, email or WhatsApp.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveValue, sendValueBack } from "@/app/workflow-actions";

export function ApprovalBar({ actionId }: { actionId: number }) {
  const router = useRouter();
  const [back, setBack] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const run = (f: () => Promise<unknown>, ok: (r: unknown) => string) => start(async () => {
    try { const r = await f(); toast.success(ok(r)); router.refresh(); } catch (err) { toast.error("Not done", { description: (err as Error).message }); }
  });
  return (
    <div className="mt-4 rounded-[var(--radius-input)] border border-[var(--color-accent-2)] p-3 text-sm">
      <p className="font-medium">You approve this value</p>
      <p className="text-xs text-muted-foreground">To correct it, propose a correction below; it goes through approval again.</p>
      {!back ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => run(() => approveValue(actionId), (r) => String(r))}><CheckCheck aria-hidden /> Approve</Button>
          <Button variant="outline" disabled={pending} onClick={() => setBack(true)}><Undo2 aria-hidden /> Send back</Button>
        </div>
      ) : (
        <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => sendValueBack(actionId, comment), () => "Sent back to the submitter"); }}>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What should they check?" aria-label="What should they check?" autoFocus />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !comment.trim()}>Send back</Button>
            <Button type="button" variant="ghost" onClick={() => setBack(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
