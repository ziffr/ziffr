"use client";
// Pinned dashboards (GLOSSARY: Pinned Dashboard; ticket #509): the person's pins under Dashboards in the sidebar, and
// the button that pins or unpins one. The list arrives already cut to the dashboards the person may open (the core,
// pinned-dashboards.ts); the browser only reorders it, and the core checks the order again.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { MoreHorizontal, Pin } from "lucide-react";
import { toast } from "sonner";
import { pinDashboard, reorderPinned, unpinDashboard } from "@/app/pin-actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarItem, useSidebar } from "@/components/ui/sidebar";
import { buttonVariants } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { cn } from "@/lib/utils";
import { useDemoPrefs } from "@/components/demo-visit-prefs";

/** A pinned dashboard as the layout sends it: the id and the name, nothing more. */
export type Pinned = { id: number; name: string };

/** A refusal says why in a toast; anything unforeseen says only that it went wrong (lib/action-error.ts). */
function toastFailure(err: unknown) {
  toast.error("Not done", { description: shown(err) });
}

/** The dashboard's first letter in a small tile: the icon of a pinned row, also when the sidebar is shrunk to icons. */
function Tile({ name }: { name: string }) {
  return <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-sidebar-border text-[10px] leading-none font-semibold text-sidebar-foreground">{name.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

/** The pins under Dashboards. Drag a row to move it; its ⋯ menu has Move up, Move down and Unpin for keyboards. Shrunk
 * to icons, each is a tile with a tooltip. */
export function PinnedDashboards({ pinned, path, demo = false }: { pinned: Pinned[]; path: string; demo?: boolean }) {
  const { collapsed } = useSidebar();
  const router = useRouter();
  // Where visitors may change the demo, the pins are this visit's own, kept in the browser (demo-visit-prefs.tsx).
  const visit = useDemoPrefs();
  const [items, setItems] = useState(pinned);
  const [dragging, setDragging] = useState<number | null>(null);
  const [, start] = useTransition();
  // A change from the server (another tab, a dashboard no longer shared) replaces what is shown.
  const key = pinned.map((p) => `${p.id}:${p.name}`).join("|");
  useEffect(() => setItems(pinned), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return null;

  const save = (next: Pinned[]) => {
    setItems(next);
    start(async () => {
      try { unwrap(await reorderPinned(next.map((p) => p.id))); router.refresh(); } catch (err) { toastFailure(err); setItems(pinned); router.refresh(); }
    });
  };
  const moveTo = (id: number, to: number) => {
    const from = items.findIndex((p) => p.id === id);
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    if (visit) { visit.movePin(id, to); return; }
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    save(next);
  };
  const unpin = (id: number) => visit ? void visit.togglePin(items.find((p) => p.id === id) ?? { id, name: "" }) : start(async () => {
    try { unwrap(await unpinDashboard(id)); router.refresh(); } catch (err) { toastFailure(err); }
  });

  const rows = items.map((p, i) => {
    const row = <SidebarItem render={<Link href={`/dashboards/${p.id}`} />} icon={<Tile name={p.name} />} label={p.name} tooltip={`${p.name} (pinned)`} active={path === `/dashboards/${p.id}`} className={cn(!collapsed && "pr-7")} />;
    // The demo saves nothing (ADR 0005): its pins are shown, but cannot be moved or taken off, so no handle that fails.
    if (collapsed || (demo && !visit)) return <li key={p.id}>{row}</li>;
    return (
      <li
        key={p.id}
        draggable
        onDragStart={(e) => { setDragging(p.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); }}
        onDragOver={(e) => { if (dragging !== null) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
        onDrop={(e) => { e.preventDefault(); if (dragging !== null) moveTo(dragging, i); setDragging(null); }}
        onDragEnd={() => setDragging(null)}
        className={cn("group/pin relative", dragging === p.id && "opacity-50")}
      >
        {row}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`${p.name}: move or unpin`} className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-focus-within/pin:opacity-100 group-hover/pin:opacity-100 hover:bg-sidebar-border focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:opacity-100">
            <MoreHorizontal aria-hidden className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-40">
            <DropdownMenuItem disabled={i === 0} onClick={() => moveTo(p.id, i - 1)}>Move up</DropdownMenuItem>
            <DropdownMenuItem disabled={i === items.length - 1} onClick={() => moveTo(p.id, i + 1)}>Move down</DropdownMenuItem>
            <DropdownMenuItem onClick={() => unpin(p.id)}>Unpin</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  });
  return <ul aria-label="Pinned dashboards" className={cn("flex flex-col gap-0.5", !collapsed && "ml-3.5 border-l border-sidebar-border pl-1.5")}>{rows}</ul>;
}

/** What the Pin button says in the demo, which saves nothing (GLOSSARY: Demo Mode). */
export const PIN_OFF_IN_DEMO = "Pinning is off in the demo";

/** Pin or unpin one dashboard, as the Pin button and the dashboard's ⋯ menu both do it. In the demo, which saves nothing, it
 * answers "Pinning is off in the demo" and calls nothing. */
export function usePin({ dashboardId, name, pinned: pinnedByServer, demo: inDemo = false }: { dashboardId: number; name: string; pinned: boolean; demo?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Where visitors may change the demo, a pin is this visit's own, kept in the browser, and works as a real one does.
  const visit = useDemoPrefs();
  const pinned = visit ? visit.isPinned(dashboardId) : pinnedByServer;
  const demo = inDemo && !visit;
  const label = demo ? PIN_OFF_IN_DEMO : pinned ? `Unpin ${name} from the sidebar` : `Pin ${name} to the sidebar`;
  const toggleHere = () => {
    const refused = visit?.togglePin({ id: dashboardId, name });
    if (refused) toast.error("Not done", { description: refused });
    else toast.success(pinned ? `${name} is unpinned` : `${name} is pinned to the sidebar`);
  };
  const toggle = visit ? toggleHere : () => start(async () => {
    try {
      unwrap(await (pinned ? unpinDashboard(dashboardId) : pinDashboard(dashboardId)));
      toast.success(pinned ? `${name} is unpinned` : `${name} is pinned to the sidebar`);
      router.refresh();
    } catch (err) { toastFailure(err); }
  });
  return { label, pending, pinned, demo, onPress: demo ? () => { toast.info(PIN_OFF_IN_DEMO); } : toggle };
}

/** The button that pins a dashboard or takes the pin off. A refusal (the list is full, the dashboard is not yours to
 * open any more) says why in a toast. `compact` is the icon alone, for a card in the list. In the demo it looks off
 * and says why on hover and on tap (aria-disabled, not disabled, so a tap on a phone still shows the reason). */
export function PinButton({ dashboardId, name, pinned: pinnedByServer, compact = false, demo: inDemo = false, className }: { dashboardId: number; name: string; pinned: boolean; compact?: boolean; demo?: boolean; className?: string }) {
  const { label, pending, pinned, demo, onPress } = usePin({ dashboardId, name, pinned: pinnedByServer, demo: inDemo });
  return (
    <button type="button" aria-pressed={pinned} aria-label={compact ? label : undefined} title={label} disabled={!demo && pending} aria-disabled={demo || undefined} onClick={onPress} className={cn(demo && "cursor-not-allowed opacity-50", compact ? cn("flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", className) : cn(buttonVariants({ variant: "outline" }), className))}>
      <Pin aria-hidden className={cn("size-4", pinned && "fill-current")} />{!compact && (pinned ? "Pinned" : "Pin")}
    </button>
  );
}
