"use client";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { VersionsPanel } from "./versions-panel";
import type { Profile } from "@ziffr/core/types";

type Props = { type: "dashboard" | "deck" | "metric" | "snapshot"; id: number; people: Profile[]; reload?: "refresh" | "page" };

// The dialog's body, the same for both ways in: the history, and after a restore a refresh or a full reload.
function VersionsContent({ type, id, people, reload }: Props) {
  const router = useRouter();
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogTitle className="sr-only">Versions</DialogTitle>
      <VersionsPanel type={type} id={id} people={people} onRestored={() => (reload === "page" ? window.location.reload() : router.refresh())} />
    </DialogContent>
  );
}

/** A "Versions" button that opens the history of one object. */
export function VersionsDialog({ type, id, people, reload }: Props) {
  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: "outline" })}><History aria-hidden /> Versions</DialogTrigger>
      <VersionsContent type={type} id={id} people={people} reload={reload} />
    </Dialog>
  );
}

/** The Versions dialog without its button, for menus that open it. */
export function VersionsDialogOpen({ type, id, people, reload, onClose }: { type: "dashboard" | "deck" | "metric"; id: number; people: Profile[]; reload?: "refresh" | "page"; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <VersionsContent type={type} id={id} people={people} reload={reload} />
    </Dialog>
  );
}
