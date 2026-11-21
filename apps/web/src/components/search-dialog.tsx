"use client";
// The search in the top bar (tickets #412, #530; GLOSSARY: Search, Metric, Archived Metric, Period Record, Workflow,
// Group): opened with ⌘K or Ctrl+K, it finds Metrics, dashboards, decks, Workflows, people and Groups by name,
// "Metric + period" for words such as "churn march 2026", every page by name and plain words ("invite", "webhook"), and
// commands: New metric, Record a value for a Metric you submit, Switch Workspace, Toggle sidebar. Opened empty it shows
// the recent items (kept in this browser, under this person) and the commands. Keyboard first: type, arrows, Enter, Esc.
// An ARIA combobox over a listbox with groups; results are asked for after a short pause in typing, and an answer that
// arrives late for words no longer typed is dropped. The server decides what may be seen and done.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { searchEverything, searchStart, type SearchRow } from "@/app/search-actions";
import { switchWorkspace } from "@/app/auth-actions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Account } from "@/components/top-bar";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { told } from "@/lib/action-toast";
import { matchEntries, type Entry } from "@/lib/search-entries";
import { cn } from "@/lib/utils";

/** The window event that opens the search from another button. */
export const OPEN_SEARCH = "ziffr:search";

/** How long typing pauses before a search is asked for. */
const PAUSE_MS = 200;
/** How many recent items are kept and shown. */
const RECENT = 5;

/** The groups of the list, in the order they are shown. */
const GROUPS = ["Recent", "Commands", "Pages", "Metrics", "Dashboards", "Decks", "Workflows", "People", "Groups"] as const;
type Group = (typeof GROUPS)[number];

/** One line of the list: where it leads (`href`) or what it does (`run`). */
type Item = { key: string; group: Group; label: string; hint?: string; archived?: boolean; href?: string; run?: () => void };

const KIND_GROUP: Record<SearchRow["kind"], Group> = { command: "Commands", record: "Commands", page: "Pages", metric: "Metrics", period: "Metrics", dashboard: "Dashboards", deck: "Decks", workflow: "Workflows", person: "People", group: "Groups" };

/** A row from the server as a line of the list. */
function itemOf(r: SearchRow): Item {
  const key = `${r.kind}-${"id" in r ? r.id : "slug" in r ? r.slug : ""}-${r.href}`;
  const group = KIND_GROUP[r.kind];
  switch (r.kind) {
    case "period": return { key, group, label: `${r.name} · ${r.label}`, hint: "Value", archived: r.archived, href: r.href };
    case "metric": return { key, group, label: r.name, hint: "Metric", archived: r.archived, href: r.href };
    case "record": return { key, group, label: `Record a value for ${r.name}`, href: r.href };
    case "person": return { key, group, label: r.you ? `${r.name} (you)` : r.name, hint: r.contact ? "Contact" : "Member", href: r.href };
    case "group": return { key, group, label: r.name, hint: "Group", href: r.href };
    case "workflow": return { key, group, label: r.name, hint: "Workflow", href: r.href };
    case "dashboard": return { key, group, label: r.name, hint: "Dashboard", href: r.href };
    case "deck": return { key, group, label: r.name, hint: "Deck", href: r.href };
    default: return { key, group, label: r.label, hint: r.kind === "page" ? r.hint : undefined, href: r.href };
  }
}

/** The recent items kept in this browser for one person; anything unreadable counts as none. */
function readRecent(key: string): Item[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(`ziffr:recent:${key}`) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.flatMap((x): Item[] => typeof x?.label === "string" && typeof x?.href === "string" && x.href.startsWith("/") && !/^\/[/\\]/.test(x.href) ? [{ key: `recent-${x.href}`, group: "Recent", label: x.label.slice(0, 120), hint: typeof x.hint === "string" ? x.hint.slice(0, 40) : undefined, href: x.href }] : []).slice(0, RECENT);
  } catch { return []; }
}

/** Keeps an opened item at the top of the recent ones. A person's own form link is never kept: it is their key. */
function remember(key: string, item: Item) {
  if (!key || !item.href || item.group === "Recent" || item.group === "Commands" || item.href.startsWith("/submit/")) return;
  try {
    const kept = readRecent(key).filter((r) => r.href !== item.href);
    localStorage.setItem(`ziffr:recent:${key}`, JSON.stringify([{ label: item.label, hint: item.hint, href: item.href }, ...kept].slice(0, RECENT)));
  } catch { /* a browser that keeps nothing simply shows no recent items */ }
}

/** The commands only the browser can do: toggling the sidebar, switching Workspace, opening the demo. */
function browserCommands(account: Account | null | undefined, toggleSidebar: (() => void) | undefined, switchTo: (id: string) => void): { entry: Entry; run: () => void }[] {
  const entry = (id: string, label: string, words: string): Entry => ({ kind: "command", id, label, hint: "Command", words, href: "" });
  return [
    ...(toggleSidebar ? [{ entry: entry("toggle-sidebar", "Toggle sidebar", "hide show collapse menu navigation"), run: toggleSidebar }] : []),
    ...(account ? account.workspaces.filter((w) => w.id !== account.current).map((w) => ({ entry: entry(`switch-${w.id}`, `Switch Workspace to ${w.name}`, "change workspace"), run: () => switchTo(w.id) })) : []),
    ...(account?.demo ? [{ entry: entry("demo", "Open the demo", "try example look around"), run: () => window.location.assign("/demo") }] : []),
  ];
}

/** The search button for the top bar, and the dialog it opens (also by ⌘K / Ctrl+K from anywhere). `account` adds
 * Switch Workspace and Open the demo; `toggleSidebar` adds Toggle sidebar (only the sidebar layout has one). */
export function SearchDialog({ className, hideButton, account, toggleSidebar }: { className?: string; hideButton?: boolean; account?: Account | null; toggleSidebar?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState("");
  const [rows, setRows] = useState<Item[]>([]);
  const [start, setStart] = useState<{ key: string; commands: Entry[] } | null>(null);
  const [recent, setRecent] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [, startSwitch] = useTransition();
  const asked = useRef(0);
  const id = useId();
  const listId = `${id}-results`;
  const here = browserCommands(account, toggleSidebar, (to) => startSwitch(async () => { told(await switchWorkspace(to)); }));
  const runOf = new Map(here.map((c) => [c.entry.id, c.run]));
  const withRun = (e: Entry): Item => ({ key: `command-${e.id}`, group: "Commands", label: e.label, href: e.href || undefined, run: runOf.get(e.id) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    // Other buttons (the sidebar's search field, the phone's tab bar) open it with this event.
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH, onOpen); };
  }, []);

  // Closed: forget the words and drop any answer still on its way.
  useEffect(() => {
    if (open) return;
    asked.current++;
    setWords(""); setRows([]); setActive(0); setStatus("idle");
  }, [open]);

  // Opened: the commands this person may use, and their recent items.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void searchStart().then((a) => { if (live && !isActionError(a)) { setStart(a); setRecent(readRecent(a.key)); } }).catch(() => undefined);
    return () => { live = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = words.trim();
    const mine = ++asked.current;
    if (!q) { setRows([]); setStatus("idle"); return; }
    setStatus("busy");
    const timer = setTimeout(async () => {
      try {
        const answer = await searchEverything(q);
        if (mine !== asked.current) return;
        if (isActionError(answer)) { setRows([]); setStatus("failed"); return; }
        setRows(answer.map(itemOf)); setActive(0); setStatus("done");
      } catch {
        // Details stay on the server; the person is told in general words.
        if (mine === asked.current) { setRows([]); setStatus("failed"); }
      }
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [words, open]);

  const typed = words.trim();
  // What is listed: while typing, the browser's own commands that fit and then the server's answer; empty, the recent
  // items and the commands. Grouped in the order of GROUPS.
  const wanted: Item[] = typed
    ? [...matchEntries(here.map((c) => c.entry), typed, 3).map(withRun), ...(status === "done" ? rows : [])]
    : [...recent, ...(start?.commands ?? []).map(withRun), ...here.map((c) => withRun(c.entry))];
  const items = GROUPS.flatMap((g) => wanted.filter((i) => i.group === g));
  const at = Math.min(active, Math.max(items.length - 1, 0));

  const go = (item: Item) => {
    setOpen(false);
    remember(start?.key ?? "", item);
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); go(items[at]); }
  };
  const optionId = (i: number) => `${id}-option-${i}`;
  const message = status === "failed" ? UNEXPECTED : typed && status === "done" && !items.length ? "Nothing found. Try a Metric, page or person by name, or a Metric with a period such as \"march 2026\"." : !typed && !items.length ? "Type a name, or a name with a period: \"churn march 2026\", \"revenue Q3\", \"visits last week\"." : null;
  const count = items.length === 1 ? "1 result" : `${items.length} results`;

  return (
    <>
      {!hideButton && <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title="Search (Ctrl+K)" className={cn("flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", className)}>
        <Search aria-hidden className="size-4" />
        <span className="sr-only md:not-sr-only md:hidden xl:inline">Search</span>
        <kbd aria-hidden className="hidden rounded border border-border px-1.5 text-xs md:inline">⌘K</kbd>
      </button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="top-[15%] -translate-y-0 gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Find a Metric, dashboard, deck, Workflow, person or page by name, the value of a Metric for a period, or a command. Use the arrow keys to choose and Enter to open.</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus role="combobox" aria-expanded={items.length > 0} aria-controls={listId} aria-autocomplete="list" aria-label="Search"
              aria-activedescendant={items.length ? optionId(at) : undefined}
              value={words} onChange={(e) => setWords(e.target.value)} onKeyDown={onKeyDown} maxLength={100} autoComplete="off" spellCheck={false}
              placeholder="Search or type a command…" className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(24rem,60vh)] overflow-y-auto p-1 empty:hidden">
            {GROUPS.map((g) => {
              const inGroup = items.map((item, i) => ({ item, i })).filter((x) => x.item.group === g);
              if (!inGroup.length) return null;
              return (
                <li key={g} role="group" aria-labelledby={`${id}-group-${g}`}>
                  <div id={`${id}-group-${g}`} className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{g}</div>
                  <ul role="none">
                    {inGroup.map(({ item, i }) => (
                      <li key={item.key} id={optionId(i)} role="option" aria-selected={i === at}>
                        {item.run ? (
                          <button type="button" tabIndex={-1} onClick={() => go(item)} onMouseMove={() => setActive(i)} className={cn("flex w-full items-baseline gap-2 rounded-[var(--radius-input)] px-2 py-2 text-left text-sm", i === at && "bg-muted")}>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                          </button>
                        ) : (
                          <Link href={item.href ?? "/"} tabIndex={-1} onClick={() => { remember(start?.key ?? "", item); setOpen(false); }} onMouseMove={() => setActive(i)} className={cn("flex items-baseline gap-2 rounded-[var(--radius-input)] px-2 py-2 text-sm", i === at && "bg-muted")}>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {item.archived && <span className="shrink-0 rounded border border-border px-1.5 text-xs text-muted-foreground">Archived</span>}
                            {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <p role="status" aria-live="polite" className={cn("px-3 py-3 text-sm text-muted-foreground", !message && "sr-only")}>
            {message ?? (typed ? count : `${count} to choose from`)}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
