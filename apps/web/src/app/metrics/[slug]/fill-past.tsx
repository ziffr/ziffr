"use client";
// Fill past periods (GLOSSARY: Metric, Submitter, Import; spec 0026, spec 0043): one place that lists every way to bring a
// Metric's past values in, easiest first, so nobody has to know which page or tool does it: paste or upload a spreadsheet,
// fill in a template, ask their own assistant, or have another system send them. Each card says in a sentence what it is and
// does one thing; the dialog holds no data and records nothing itself.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, ClipboardPaste, Download, FileSpreadsheet, Plug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SCROLLING_DIALOG, SCROLLING_DIALOG_BODY, SCROLLING_DIALOG_TITLE } from "./scrolling-dialog";
import { shown, unwrap } from "@/lib/action-error";
import { pasteTemplateFile } from "@/app/paste-actions";

/** What the person may use here: the first two need the Metric to take values by the web form, which they submit; the last two need them to submit it at all. */
export type FillPastWays = { paste: boolean; assistant: boolean; system: boolean };

/** One way: what it is, in a sentence, and its one button. */
function Way({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-[var(--radius-input)] border border-input p-3 max-sm:flex-wrap">
      <span className="mt-0.5 text-muted-foreground" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
      {/* Under the words on a phone: beside them the button leaves no room for them and pushes the dialog past the screen. */}
      <div className="shrink-0 self-center max-sm:basis-full max-sm:[&>button]:w-full">{action}</div>
    </li>
  );
}

/** The dialog opened by the ⋯ menu's "Fill past periods…". `onAssistant` opens the text for the person's own assistant. */
export function FillPast({ metric, ways, from, open, onOpenChange, onAssistant }: { metric: { id: number; name: string; slug: string }; ways: FillPastWays; /** Where it was opened from, so the paste page leads back there. */ from?: "analyze"; open: boolean; onOpenChange: (open: boolean) => void; onAssistant: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [downloaded, setDownloaded] = useState(false);
  const pasteHref = `/paste-values?metric=${encodeURIComponent(metric.slug)}${from ? `&from=${from}` : ""}`;
  const download = () => start(async () => {
    try {
      const r = unwrap(await pasteTemplateFile({ kind: "history", metricId: metric.id })) as { fileName: string; text: string; periods: number };
      const url = URL.createObjectURL(new Blob([r.text], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.fileName; a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      toast.success(r.periods ? `${r.periods} period${r.periods === 1 ? "" : "s"} without a value` : "Every recent period already has a value", { description: r.periods ? "Fill in the numbers, then paste or upload them here." : undefined });
    } catch (e) {
      toast.error("No template was made", { description: shown(e) });
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${SCROLLING_DIALOG} sm:max-w-xl`}>
        <DialogTitle className={SCROLLING_DIALOG_TITLE}>Fill past periods of {metric.name}</DialogTitle>
        <div className={SCROLLING_DIALOG_BODY}>
          <p className="text-sm text-muted-foreground">Pick the way that suits where your numbers are. Whichever you choose, Ziffr checks every value as it checks any other, and shows what each would do before it records.</p>
          <ul className="space-y-2">
            {ways.paste && (
              <Way icon={<ClipboardPaste className="size-5" />} title="Paste or upload a spreadsheet"
                action={<Button size="sm" onClick={() => router.push(pasteHref)}>Open Paste history</Button>}>
                Copy the cells from Excel or Google Sheets, or drop a CSV or Excel file. Ziffr reads the layout for you.
              </Way>
            )}
            {ways.paste && (
              <Way icon={<FileSpreadsheet className="size-5" />} title="Fill in a template"
                action={downloaded
                  ? <Button size="sm" onClick={() => router.push(pasteHref)}>Bring it back</Button>
                  : <Button size="sm" variant="outline" disabled={pending} onClick={download}><Download aria-hidden /> Download</Button>}>
                {downloaded ? "Fill in the numbers in your spreadsheet, then paste or upload them in Paste history." : "A file that already lists the periods without a value, to fill in your spreadsheet and bring back."}
              </Way>
            )}
            {ways.assistant && (
              <Way icon={<Bot className="size-5" />} title="Ask my assistant"
                action={<Button size="sm" variant="outline" onClick={() => { onOpenChange(false); setTimeout(onAssistant, 0); }}>Get the text</Button>}>
                A text for an assistant that is connected to Ziffr and can read where your numbers are. It shows you a table first.
              </Way>
            )}
            {ways.system && (
              <Way icon={<Plug className="size-5" />} title="Send from another system"
                action={<Button size="sm" variant="outline" onClick={() => router.push("/connectors/send")}>See how</Button>}>
                Keep it filled from Google Sheets, Excel, Stripe or HubSpot, or send values from a program.
              </Way>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
