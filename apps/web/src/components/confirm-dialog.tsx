"use client";
// Asking before something that cannot be undone, such as deleting a Workflow, a Group or a Theme: one dialog
// that names the thing, says what happens and offers a clearly marked button, instead of the browser's confirm().
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** What the confirm dialog asks: a title naming the thing, the consequence and the button's words. */
export type ConfirmOptions = {
  /** Names the thing and the act, e.g. "Delete Monthly finance close?" */
  title: string;
  /** What happens to other things, in one or two sentences. */
  description?: string;
  /** The button that goes ahead, e.g. "Delete workflow". */
  confirmLabel: string;
  /** Red button for acts that remove or end something; true unless said otherwise. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

/** A confirm() that returns a promise and renders a dialog: call `confirm({...})`, render `dialog` once. */
export function useConfirm() {
  const [req, setReq] = useState<Pending | null>(null);
  const answered = useRef(false);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    answered.current = false;
    // Opened from a menu item: wait until the menu has closed and returned focus, or the dialog loses it.
    setTimeout(() => setReq({ ...o, resolve }), 0);
  }), []);
  const answer = (ok: boolean) => {
    if (!req || answered.current) return;
    answered.current = true;
    req.resolve(ok);
    setReq(null);
  };
  const dialog = req ? <ConfirmDialog {...req} onAnswer={answer} /> : null;
  return { confirm, dialog };
}

/** The dialog itself; most callers use `useConfirm` instead. */
export function ConfirmDialog({ title, description, confirmLabel, destructive = true, onAnswer }: ConfirmOptions & { onAnswer: (ok: boolean) => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onAnswer(false); }}>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" autoFocus onClick={() => onAnswer(false)}>Cancel</Button>
          <Button
            type="button"
            className={destructive ? "bg-destructive text-white shadow-none [text-shadow:none] hover:bg-destructive/90" : undefined}
            onClick={() => onAnswer(true)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
