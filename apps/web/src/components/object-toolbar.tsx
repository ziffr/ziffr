"use client";
// The toolbar of a Dashboard or Metric page (GLOSSARY: Share, View Link, Version, Theme): Share is the one main
// button, the page's own secondary buttons sit next to it, and everything else is in a ⋯ menu, so a page never
// shows seven equal buttons.
import { useState } from "react";
import { Eye, History, Link2, MoreHorizontal, Palette } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ShareDialog } from "./share-dialog";
import { WhoCanSeeDialog } from "./who-can-see";
import { ViewLinksDialog } from "./view-links";
import { VersionsDialogOpen } from "./versions-dialog";
import { ThemePicker } from "./theme-picker";
import type { Group, Profile, Share, Theme } from "@ziffr/core/types";

type Open = "who" | "links" | "versions" | "theme" | null;

/** What the toolbar needs. `share` is set only for whoever may share (the owner); `viewLinks` and `theme` likewise. */
export type ObjectToolbarProps = {
  type: "dashboard" | "metric";
  id: number;
  people: Profile[];
  /** Buttons that belong to this page, such as Present or Analyze, shown before Share. */
  children?: React.ReactNode;
  share?: { name: string; ownerId: string; shares: Share[]; groups?: Group[]; reveals?: Record<string, string[]> } | null;
  viewLinks?: boolean;
  theme?: { themes: Theme[]; value: number | null; onChange: (id: number | null) => Promise<unknown> } | null;
  /** This page's own entries at the top of the ⋯ menu, such as Make a deck. */
  menu?: { label: string; icon: React.ReactNode; onSelect: () => void }[];
};

/** Share as the main button, the page's own buttons, and a ⋯ menu with Who can see this, View links, Theme and Versions. */
export function ObjectToolbar({ type, id, people, children, share, viewLinks, theme, menu }: ObjectToolbarProps) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  // Opened from a menu item: wait until the menu has closed and returned focus.
  const show = (o: Open) => () => setTimeout(() => setOpen(o), 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {share && (
        <ShareDialog
          primary
          objectType={type}
          objectId={id}
          people={people}
          {...share}
          more={[
            { label: "Who can see this", icon: <Eye aria-hidden />, onClick: () => setOpen("who") },
            ...(viewLinks ? [{ label: "View links for outsiders", icon: <Link2 aria-hidden />, onClick: () => setOpen("links") }] : []),
          ]}
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="More" title="More" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <MoreHorizontal aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {menu?.map((m) => <DropdownMenuItem key={m.label} onClick={m.onSelect}>{m.icon} {m.label}</DropdownMenuItem>)}
          <DropdownMenuItem onClick={show("who")}><Eye aria-hidden /> Who can see this</DropdownMenuItem>
          {viewLinks && <DropdownMenuItem onClick={show("links")}><Link2 aria-hidden /> View links…</DropdownMenuItem>}
          {theme && <DropdownMenuItem onClick={show("theme")}><Palette aria-hidden /> Theme…</DropdownMenuItem>}
          <DropdownMenuItem onClick={show("versions")}><History aria-hidden /> Versions</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "who" && <WhoCanSeeDialog type={type} id={id} people={people} onClose={close} />}
      {open === "links" && type === "dashboard" && <ViewLinksDialog type="dashboard" id={id} onClose={close} />}
      {open === "versions" && <VersionsDialogOpen type={type} id={id} people={people} onClose={close} />}
      {open === "theme" && theme && (
        <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
          <DialogContent>
            <DialogTitle>Theme</DialogTitle>
            <DialogDescription>The colours and fonts this {type} is drawn in. Ziffr&rsquo;s own screens keep their look.</DialogDescription>
            <ThemePicker {...theme} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
