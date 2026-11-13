"use client";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { VersionsPanel } from "./versions-panel";
import type { Profile } from "@/lib/types";

/** A "Versions" button that opens the history of one object. */
export function VersionsDialog({ type, id, people, reload }: { type: "dashboard" | "deck" | "master" | "metric"; id: number; people: Profile[]; reload?: "refresh" | "page" }) {
  const router = useRouter();
  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: "outline" })}><History aria-hidden /> Versions</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="sr-only">Versions</DialogTitle>
        <VersionsPanel type={type} id={id} people={people} onRestored={() => (reload === "page" ? window.location.reload() : router.refresh())} />
      </DialogContent>
    </Dialog>
  );
}
