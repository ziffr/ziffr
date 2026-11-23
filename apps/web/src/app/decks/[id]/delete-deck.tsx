"use client";
// Deleting a Deck (GLOSSARY: Deck): for its owner, after a confirmation. Its Shares and View Links go with it; the core
// refuses anyone else.
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteDeck } from "@/app/deck-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** The confirmation that "Delete…" in the editor's ⋯ menu opens. Owner only: the page offers it only to the owner, and the core checks again. */
export function DeleteDeckDialog({ deckId, name, onClose }: { deckId: number; name: string; onClose: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Delete {name}?</DialogTitle>
        <p className="text-sm text-muted-foreground">Its slides, Shares and View Links go with it, and this cannot be undone. Its widgets and the Metrics behind them stay.</p>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => start(async () => {
            try {
              const r = await deleteDeck(deckId);
              if (isActionError(r)) { toast.error("Not deleted", { description: r.error }); return; }
              toast.success(`${name} deleted`);
              router.push("/decks");
            } catch {
              toast.error("Not deleted", { description: UNEXPECTED });
            }
          })}
        >{pending ? "Deleting…" : "Delete the deck"}</Button>
      </DialogContent>
    </Dialog>
  );
}
