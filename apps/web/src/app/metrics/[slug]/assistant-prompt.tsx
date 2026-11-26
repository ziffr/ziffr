"use client";
// Fill past periods with my assistant (spec 0043, ticket 7; GLOSSARY: Metric, Submitter, MCP Server): a text to copy into
// the person's own assistant, written from this Metric. Ziffr does not run it, sends it nowhere and gives the assistant no
// key: the assistant uses the connection its owner already made, and what it records is recorded as that person.
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SCROLLING_DIALOG, SCROLLING_DIALOG_BODY, SCROLLING_DIALOG_TITLE } from "./scrolling-dialog";
import { backfillPrompt, type BackfillPromptInput } from "@ziffr/core/assistant-backfill-prompt";

/** The dialog opened by the ⋯ menu's "Fill past periods with my assistant…". */
export function AssistantPrompt({ metric, open, onOpenChange }: { metric: BackfillPromptInput; open: boolean; onOpenChange: (open: boolean) => void }) {
  const text = backfillPrompt(metric);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${SCROLLING_DIALOG} sm:max-w-2xl`}>
        <DialogTitle className={SCROLLING_DIALOG_TITLE}>Fill past periods with my assistant</DialogTitle>
        <div className={SCROLLING_DIALOG_BODY}>
          <p className="text-sm text-muted-foreground">Copy this text into an assistant that is connected to Ziffr and can read the place where your numbers are. It fills in the past once; it is not a schedule. Add where the numbers are, where the text says so. Ziffr does not run it and gives the assistant no key: what it records is recorded as you, by this Metric&rsquo;s rules.</p>
          <textarea readOnly value={text} rows={14} aria-label="The text for your assistant" className="w-full rounded-[var(--radius-input)] border border-input bg-transparent p-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end">
            <Button onClick={() => { void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => toast.error("Not copied", { description: "Select the text and copy it by hand." })); }}><Copy aria-hidden /> Copy the text</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
