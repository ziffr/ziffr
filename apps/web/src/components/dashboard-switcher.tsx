"use client";
// The dashboard switcher (spec 0010, ticket #146; GLOSSARY: Dashboard): the current dashboard's name opens a list of
// every dashboard the person may open, theirs first, then those shared with them, with search. The list comes from
// the core, so it holds only dashboards they may open.
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Home, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { DashboardAccess } from "@/lib/access";
import { cn } from "@/lib/utils";

/** The current dashboard's name as a button that opens the list. `homeId` marks the Home dashboard. */
export function DashboardSwitcher({ current, dashboards, homeId, ownerName, onNew }: { current: DashboardAccess; dashboards: DashboardAccess[]; homeId: number | null; ownerName: (id: string) => string; onNew?: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const match = (d: DashboardAccess) => d.name.toLowerCase().includes(q.trim().toLowerCase());
  const mine = dashboards.filter((d) => d.role === "owner" && match(d));
  const shared = dashboards.filter((d) => d.role !== "owner" && match(d));
  const item = (d: DashboardAccess) => (
    <li key={d.id}>
      <Link href={`/dashboards/${d.id}`} onClick={() => setOpen(false)} aria-current={d.id === current.id ? "page" : undefined} className={cn("flex items-center gap-2 rounded-[var(--radius-input)] px-2 py-1.5 text-sm hover:bg-muted", d.id === current.id && "font-medium")}>
        <span className="min-w-0 flex-1 truncate">{d.name}</span>
        {d.id === homeId && <Home aria-label="Home" className="size-3.5 text-muted-foreground" />}
        {d.role !== "owner" && <span className="shrink-0 text-xs text-muted-foreground">{ownerName(d.owner_id)}</span>}
      </Link>
    </li>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The heading holds the button, not the other way round: a button may not contain a heading. */}
      <h1 className="text-[length:var(--text-2xl)] leading-tight">
        <PopoverTrigger className="group -ml-1 flex max-w-full items-center gap-1.5 rounded-[var(--radius-input)] px-1 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${current.name}: switch dashboard`}>
          {/* Wraps to more lines when the name is long, so no dashboard title is ever cut off (#607). */}
          <span className="min-w-0 break-words">{current.name}</span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />
        </PopoverTrigger>
      </h1>
      <PopoverContent align="start" sideOffset={6} className="w-80 p-2">
        <div className="relative mb-2">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus type="search" aria-label="Find a dashboard" placeholder="Find a dashboard" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {mine.length > 0 && <><p className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">Mine</p><ul>{mine.map(item)}</ul></>}
          {shared.length > 0 && <><p className="px-2 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">Shared with me</p><ul>{shared.map(item)}</ul></>}
          {!mine.length && !shared.length && <p className="px-2 py-3 text-sm text-muted-foreground">No dashboard matches.</p>}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
          {onNew ? <button type="button" onClick={() => { setOpen(false); onNew(); }} className="flex items-center gap-1 rounded-[var(--radius-input)] px-2 py-1 hover:bg-muted"><Plus aria-hidden className="size-3.5" /> New dashboard</button> : <span />}
          <Link href="/dashboards" onClick={() => setOpen(false)} className="rounded-[var(--radius-input)] px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">All dashboards</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
