"use client";
// Under a Submitter who stopped requests for numbers (GLOSSARY: Submitter, Prompt), on a Metric's Who submits: copy
// their personal form link to send them, and, for the Metric's owner, have Ziffr ask them once whether they want the
// emails again. Only they can switch them on; the core decides who may ask and how often.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";
import { askToGetEmailsAgain } from "@/app/submitter-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

const TALL = "h-auto min-h-8 max-w-full whitespace-normal py-1 text-left max-md:min-h-11 pointer-coarse:min-h-11";

/** The date a question was sent, the same on the server and in the browser. */
const day = (at: string) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** The two ways on for one stopped Submitter. `code` is their form's code where the viewer may have it, else null;
 * `askAgain` is set for the Metric's owner alone. */
export function StoppedActions({ metricId, personId, name, code, askAgain }: { metricId: number; personId: string; name: string; code: string | null; askAgain: { askedAt: string | null; everyDays: number } | null }) {
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const router = useRouter();
  const copy = () => {
    const url = `${window.location.origin}/submit/${code}`;
    const failed = () => toast.message("Not copied. Select the link and copy it by hand.", { description: url });
    if (!navigator.clipboard) return failed();
    void navigator.clipboard.writeText(url).then(() => toast.success("Link copied", { description: `Send it to ${name} to enter the number.` }), failed);
  };
  const ask = async () => {
    if (!askAgain || !(await confirm({ title: `Ask ${name} whether they want these emails again?`, description: `Ziffr sends ${name} one email with a link. Nothing changes unless they confirm. This can be sent once in ${askAgain.everyDays} days.`, confirmLabel: "Send the question" }))) return;
    start(async () => {
      try {
        const r = await askToGetEmailsAgain(metricId, personId);
        if (isActionError(r)) { toast.error("Not sent", { description: r.error }); return; }
        toast.message(r);
        router.refresh();
      } catch {
        toast.error("Not sent", { description: UNEXPECTED });
      }
    });
  };
  return (
    <div className="flex basis-full flex-wrap items-center gap-2 pt-1">
      {code && <Button type="button" size="sm" variant="outline" className={TALL} onClick={copy}><Copy aria-hidden /> Copy a link to send {name}</Button>}
      {askAgain && (askAgain.askedAt
        ? <p className="text-xs text-muted-foreground">Asked on {day(askAgain.askedAt)} whether they want these emails again.</p>
        : <Button type="button" size="sm" variant="outline" className={TALL} disabled={pending} onClick={() => { void ask(); }}><Mail aria-hidden /> Ask whether they want the emails again</Button>)}
      {dialog}
    </div>
  );
}
