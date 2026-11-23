"use client";
// The toolbar of a Dashboard or Metric page (GLOSSARY: Share, View Link, Version, Theme, Slide-over): Share is the one main
// button, the page's own secondary buttons sit next to it, and everything else is in a ⋯ menu, so a page never
// shows seven equal buttons.
import { Fragment, useState } from "react";
import { Check, Eye, History, Link2, MoreHorizontal, Palette } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ShareSheet } from "./share-sheet";
import { useShowWhoCanSee } from "./who-can-see";
import { useShowViewLinks } from "./view-links";
import { useOpenVersions, VersionsSheetOpen } from "./versions-sheet";
import { ThemePicker } from "./theme-picker";
import type { Group, Profile, Share, Theme } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

type Open = "theme" | null;

/** What the toolbar needs. `share` is set only for whoever may share (the owner); `viewLinks` and `theme` likewise. */
export type ObjectToolbarProps = {
  type: "dashboard" | "metric";
  id: number;
  people: Profile[];
  /** Buttons that belong to this page, such as Present or Analyze, shown before Share. */
  children?: React.ReactNode;
  /** On a phone only this stays in the row (with Share and ⋯), and `children` move into the ⋯ sheet (#535). */
  phone?: React.ReactNode;
  share?: { name: string; ownerId: string; shares: Share[]; groups?: Group[]; reveals?: Record<string, string[]>; canInvite?: boolean } | null;
  viewLinks?: boolean;
  theme?: { themes: Theme[]; value: number | null; onChange: (id: number | null) => Promise<unknown> } | null;
  /** This page's own entries at the top of the ⋯ menu, such as Make a deck. An entry with `sub` opens a submenu of
   * choices instead (a dashboard to add to); `danger` marks one that cannot be undone; `separated` puts a rule above it;
   * `checked` makes it a switch that shows whether it is on ("Home dashboard"), and `dimmed` draws it as off while it still answers. */
  menu?: MenuEntry[];
  /** The page's one main action (Record a value), shown first; Share then stops being the primary button. */
  lead?: React.ReactNode;
};

/** A row of the phone sheet: the same entries as the ⋯ menu. */
type SheetRow = { label: string; icon: React.ReactNode; checked?: boolean; go: () => void };

/** One entry of a page's ⋯ menu. */
export type MenuEntry = { label: string; icon: React.ReactNode; onSelect?: () => void; sub?: { key: string | number; label: string; onSelect: () => void; separated?: boolean }[]; danger?: boolean; separated?: boolean; checked?: boolean; dimmed?: boolean; hint?: string };

/** Share as the main button, the page's own buttons, and a ⋯ menu with Who can see this, View links, Theme and Versions. */
export function ObjectToolbar({ type, id, people, children, phone, share, viewLinks, theme, menu, lead }: ObjectToolbarProps) {
  const [open, setOpen] = useState<Open>(null);
  const [sheet, setSheet] = useState(false);
  const openVersions = useOpenVersions();
  // Who can see this and View links open in the side panel; the dialog left here is the Theme picker.
  const showWho = useShowWhoCanSee(people);
  const showLinks = useShowViewLinks();
  const close = () => setOpen(null);
  // Opened from a menu item: wait until the menu has closed and returned focus.
  const show = (o: Open) => () => setTimeout(() => setOpen(o), 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lead}
      {phone ? <><div className="flex flex-wrap items-center gap-2 max-md:hidden">{children}</div>{phone}</> : children}
      {share && (
        <ShareSheet
          primary={!lead}
          objectType={type}
          objectId={id}
          people={people}
          {...share}
          more={[
            { label: "Who can see this", icon: <Eye aria-hidden />, onClick: () => showWho(type, id) },
            ...(viewLinks ? [{ label: "View links for outsiders", icon: <Link2 aria-hidden />, onClick: () => showLinks("dashboard", id) }] : []),
          ]}
        />
      )}
      {phone && (
        <>
          <Button variant="outline" size="icon" aria-label={`More for this ${type}`} title={`More for this ${type}`} aria-haspopup="dialog" className="md:hidden" onClick={() => setSheet(true)}><MoreHorizontal aria-hidden /></Button>
          <Sheet open={sheet} onOpenChange={setSheet}>
            <SheetContent side="bottom" className="overflow-y-auto pb-[env(safe-area-inset-bottom)] md:hidden">
              <SheetHeader><SheetTitle>More for this {type}</SheetTitle></SheetHeader>
              {/* The page's own buttons stacked one under the other, then the same entries as the menu on a bigger screen. */}
              <div className="flex flex-col items-stretch gap-2 px-4 pb-2 [&>*]:w-full [&>*]:justify-start">{children}</div>
              <ul className="px-2 pb-3">
                {([...(menu ?? []).flatMap((m) => m.sub ? m.sub.map((c) => ({ label: `${m.label}: ${c.label}`, icon: m.icon, go: () => { setSheet(false); c.onSelect(); } })) : [{ label: m.label, icon: m.icon, checked: m.checked, go: () => { setSheet(false); m.onSelect?.(); } }]),
                  { label: "Who can see this", icon: <Eye aria-hidden />, go: () => { setSheet(false); setTimeout(() => showWho(type, id), 0); } },
                  ...(viewLinks ? [{ label: "View links…", icon: <Link2 aria-hidden />, go: () => { setSheet(false); setTimeout(() => showLinks("dashboard", id), 0); } }] : []),
                  ...(theme ? [{ label: "Theme…", icon: <Palette aria-hidden />, go: () => { setSheet(false); setOpen("theme"); } }] : []),
                  { label: "Versions", icon: <History aria-hidden />, go: () => { setSheet(false); setTimeout(() => openVersions(true), 0); } }] as SheetRow[]).map((r) => (
                  <li key={r.label}><button type="button" onClick={r.go} aria-pressed={r.checked} className="flex h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:text-muted-foreground">{r.icon}{r.label}{r.checked && <Check aria-hidden className="ml-auto" />}</button></li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`More for this ${type}`} title={`More for this ${type}`} className={cn(buttonVariants({ variant: "outline", size: "icon" }), phone && "max-md:hidden")}>
          <MoreHorizontal aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {menu?.map((m) => (
            <MenuRow key={m.label} m={m} />
          ))}
          <DropdownMenuItem onClick={() => setTimeout(() => showWho(type, id), 0)}><Eye aria-hidden /> Who can see this</DropdownMenuItem>
          {viewLinks && <DropdownMenuItem onClick={() => setTimeout(() => showLinks("dashboard", id), 0)}><Link2 aria-hidden /> View links…</DropdownMenuItem>}
          {theme && <DropdownMenuItem onClick={show("theme")}><Palette aria-hidden /> Theme…</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => setTimeout(() => openVersions(true), 0)}><History aria-hidden /> Versions</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VersionsSheetOpen type={type} id={id} people={people} />
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

/** An entry of the ⋯ menu: a choice, or a submenu of them. */
function MenuRow({ m }: { m: MenuEntry }) {
  const rule = m.separated ? <DropdownMenuSeparator /> : null;
  if (m.sub) {
    return (
      <>
        {rule}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{m.icon} {m.label}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {m.sub.map((s) => (<Fragment key={s.key}>{s.separated && <DropdownMenuSeparator />}<DropdownMenuItem onClick={s.onSelect}>{s.label}</DropdownMenuItem></Fragment>))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </>
    );
  }
  if (m.checked !== undefined) {
    return (
      <>
        {rule}
        {/* A switch: the menu stays open on it as a checkbox item would, so it closes by hand-off to the action. */}
        <DropdownMenuCheckboxItem checked={m.checked} closeOnClick title={m.hint} aria-disabled={m.dimmed || undefined} className={cn(m.dimmed && "cursor-not-allowed opacity-50")} onCheckedChange={() => m.onSelect?.()}>{m.icon} {m.label}</DropdownMenuCheckboxItem>
      </>
    );
  }
  return (
    <>
      {rule}
      <DropdownMenuItem variant={m.danger ? "destructive" : undefined} onClick={m.onSelect}>{m.icon} {m.label}</DropdownMenuItem>
    </>
  );
}
