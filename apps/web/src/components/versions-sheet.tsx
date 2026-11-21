"use client";
// Version history as a slide-over (GLOSSARY: Version, Slide-over): beside the page, with `?panel=versions` as its direct URL.
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { usePanel } from "@/lib/panel-param";
import { VersionsPanel } from "./versions-panel";
import type { Profile } from "@ziffr/core/types";

type Props = { type: "dashboard" | "deck" | "metric" | "snapshot"; id: number; people: Profile[]; reload?: "refresh" | "page" };

// The panel itself, the same for both ways in: the history, and after a restore a refresh or a full reload.
function VersionsContent({ type, id, people, reload }: Props) {
  const router = useRouter();
  return (
    <SheetContent className="sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Versions</SheetTitle>
        <SheetDescription>Who changed what and when. Restoring writes an old version back as a new one.</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <VersionsPanel type={type} id={id} people={people} hideTitle onRestored={() => (reload === "page" ? window.location.reload() : router.refresh())} />
      </div>
    </SheetContent>
  );
}

/** A "Versions" button that opens the history of one object beside the page. */
export function VersionsSheet({ type, id, people, reload }: Props) {
  const [open, setOpen] = usePanel("versions");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={buttonVariants({ variant: "outline" })}><History aria-hidden /> Versions</SheetTrigger>
      <VersionsContent type={type} id={id} people={people} reload={reload} />
    </Sheet>
  );
}

/** The Versions panel without its button, for menus that open it; its open state is the address. */
export function VersionsSheetOpen({ type, id, people, reload }: Omit<Props, "type"> & { type: "dashboard" | "deck" | "metric" }) {
  const [open, setOpen] = usePanel("versions");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <VersionsContent type={type} id={id} people={people} reload={reload} />
    </Sheet>
  );
}

/** Opens the Versions panel from a menu item. */
export function useOpenVersions() {
  return usePanel("versions")[1];
}
