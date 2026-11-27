"use client";
// Adding and removing a person under a Metric's Who submits (GLOSSARY: Submitter), for its owner and Editors. Both
// say what will happen and wait for a yes; the core checks who may.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addSubmitter, removeSubmitter } from "@/app/submitter-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PHONE_BUTTON_SM, PHONE_FIELD } from "@/app/setup/phone";
import { SCROLLING_DIALOG, SCROLLING_DIALOG_BODY } from "./scrolling-dialog";
import { addingWords, askNowWords } from "./submitter-words";

/** Someone who may be added, as the core lists them. */
type Choice = { id: string; name: string; kind: "member" | "guest" | "contact" };

const KIND = { member: "", guest: " (Guest)", contact: " (Contact)" } as const;

/** What the Metric says about asking someone for it. */
type About = { id: number; webForm: boolean; ways: string[]; workflow: boolean; archived: boolean };

/** A select of the people not yet submitting to this Metric, and a confirmation that says what they get. */
export function AddSubmitter({ metric, choices }: { metric: About; choices: Choice[] }) {
  const [picked, setPicked] = useState("");
  const [open, setOpen] = useState(false);
  const person = choices.find((c) => c.id === picked);
  if (!choices.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <label className="text-xs text-muted-foreground" htmlFor={`submitter-${metric.id}`}>Add a person</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select id={`submitter-${metric.id}`} value={person ? picked : ""} onChange={(e) => setPicked(e.target.value)} className={`${PHONE_FIELD} sm:min-w-0 sm:max-w-xs sm:flex-1`}>
          <option value="">Who?</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{KIND[c.kind]}</option>)}
        </select>
        <Button size="sm" variant="outline" className={PHONE_BUTTON_SM} disabled={!person} onClick={() => setOpen(true)}>Add…</Button>
      </div>
      {open && person && <ConfirmAdd metric={metric} person={person} onClose={(added) => { setOpen(false); if (added) setPicked(""); }} />}
    </div>
  );
}

/** Says what adding the person does and lets the actor choose whether to ask them now. */
function ConfirmAdd({ metric, person, onClose }: { metric: About; person: Choice; onClose: (added: boolean) => void }) {
  const [askNow, setAskNow] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  const contact = person.kind === "contact";
  const add = () => start(async () => {
    try {
      // An Archived Metric asks nobody, so none is asked for.
      const r = await addSubmitter(metric.id, person.id, askNow && !metric.archived);
      if (isActionError(r)) { toast.error("Not added", { description: r.error }); return; }
      toast.success(`${person.name} added`, { description: r });
      onClose(true);
      router.refresh();
    } catch {
      toast.error("Not added", { description: UNEXPECTED });
    }
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(false); }}>
      <DialogContent showCloseButton={false} className={`${SCROLLING_DIALOG} sm:max-w-md`}>
        <DialogTitle className="leading-snug [overflow-wrap:anywhere]">Add {person.name} to Who submits?</DialogTitle>
        <div className={SCROLLING_DIALOG_BODY}>
          {addingWords({ name: person.name, contact, webForm: metric.webForm, ways: metric.ways }).map((line) => <p key={line}>{line}</p>)}
          {metric.archived ? (
            <p className="text-muted-foreground">This Metric is archived, so nobody is asked for it until it is brought back.</p>
          ) : (
            <div>
              <label className="flex min-h-11 items-center gap-2 font-medium sm:min-h-0">
                <input type="checkbox" checked={askNow} onChange={(e) => setAskNow(e.target.checked)} aria-describedby="ask-now-says" className="size-4 shrink-0 accent-primary" />
                Ask them for the current value now
              </label>
              <p id="ask-now-says" className="text-muted-foreground">{askNowWords({ askNow, workflow: metric.workflow, contact })}</p>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className={PHONE_BUTTON_SM} onClick={() => onClose(false)}>Cancel</Button>
            <Button className={PHONE_BUTTON_SM} disabled={pending} onClick={add}>{pending ? "Adding…" : "Add as Submitter"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Remove" beside a person who submits: asks first, with what ends and what stays. */
export function RemoveSubmitter({ metricId, personId, name, says }: { metricId: number; personId: string; name: string; says: string }) {
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const router = useRouter();
  const remove = async () => {
    if (!(await confirm({ title: `Remove ${name} from Who submits?`, description: says, confirmLabel: "Remove" }))) return;
    start(async () => {
      try {
        const r = await removeSubmitter(metricId, personId);
        if (isActionError(r)) { toast.error("Not removed", { description: r.error }); return; }
        toast.success(`${name} removed`);
        router.refresh();
      } catch {
        toast.error("Not removed", { description: UNEXPECTED });
      }
    });
  };
  return (
    <>
      <Button size="sm" variant="ghost" className="max-md:min-h-11 pointer-coarse:min-h-11" disabled={pending} aria-label={`Remove ${name} from Who submits`} onClick={remove}>Remove</Button>
      {dialog}
    </>
  );
}
