"use client";
// The search in the top bar (ticket #412; GLOSSARY: Metric, Archived Metric, Period Record): opened with ⌘K or Ctrl+K,
// it finds Metrics, dashboards and decks by name, and "Metric + period" for words such as "churn march 2026". Keyboard
// first: type, arrows, Enter, Esc. An ARIA combobox over a listbox; results are asked for after a short pause in typing,
// and an answer that arrives late for words no longer typed is dropped. The core decides what may be seen.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchEverything, type SearchRow } from "@/app/search-actions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { cn } from "@/lib/utils";

/** How long typing pauses before a search is asked for. */
const PAUSE_MS = 200;

const KIND_LABEL: Record<SearchRow["kind"], string> = { metric: "Metric", period: "Value", dashboard: "Dashboard", deck: "Deck" };

/** What a result is called on screen. */
function title(r: SearchRow): string {
  return r.kind === "period" ? `${r.name} · ${r.label}` : r.name;
}

/** The search button for the top bar, and the dialog it opens (also by ⌘K / Ctrl+K from anywhere). */
export function SearchDialog({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const asked = useRef(0);
  const id = useId();
  const listId = `${id}-results`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closed: forget the words and drop any answer still on its way.
  useEffect(() => {
    if (open) return;
    asked.current++;
    setWords(""); setRows([]); setActive(0); setStatus("idle");
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
        setRows(answer); setActive(0); setStatus("done");
      } catch {
        // Details stay on the server; the person is told in general words.
        if (mine === asked.current) { setRows([]); setStatus("failed"); }
      }
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [words, open]);

  const go = (row: SearchRow) => { setOpen(false); router.push(row.href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!rows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % rows.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + rows.length) % rows.length); }
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); go(rows[Math.min(active, rows.length - 1)]); }
  };
  const optionId = (i: number) => `${id}-option-${i}`;
  const shownRows = rows;
  const message = status === "failed" ? UNEXPECTED : status === "done" && !rows.length ? "Nothing found. Try a Metric's name, or add a period such as \"march 2026\"." : status === "idle" ? "Type a name, or a name with a period: \"churn march 2026\", \"revenue Q3\", \"visits last week\"." : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title="Search (Ctrl+K)" className={cn("flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", className)}>
        <Search aria-hidden className="size-4" />
        <span className="sr-only md:not-sr-only md:hidden xl:inline">Search</span>
        <kbd aria-hidden className="hidden rounded border border-border px-1.5 text-xs md:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="top-[15%] -translate-y-0 gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Find a Metric, dashboard or deck by name, or the value of a Metric for a period. Use the arrow keys to choose and Enter to open.</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus role="combobox" aria-expanded={shownRows.length > 0} aria-controls={listId} aria-autocomplete="list" aria-label="Search"
              aria-activedescendant={shownRows.length ? optionId(Math.min(active, shownRows.length - 1)) : undefined}
              value={words} onChange={(e) => setWords(e.target.value)} onKeyDown={onKeyDown} maxLength={100} autoComplete="off" spellCheck={false}
              placeholder="Search Metrics, dashboards, decks…" className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(24rem,60vh)] overflow-y-auto p-1 empty:hidden">
            {shownRows.map((r, i) => (
              <li key={`${r.kind}-${r.href}`} id={optionId(i)} role="option" aria-selected={i === active}>
                <Link href={r.href} tabIndex={-1} onClick={() => setOpen(false)} onMouseMove={() => setActive(i)} className={cn("flex items-baseline gap-2 rounded-[var(--radius-input)] px-2 py-2 text-sm", i === active && "bg-muted")}>
                  <span className="min-w-0 flex-1 truncate">{title(r)}</span>
                  {("archived" in r && r.archived) && <span className="shrink-0 rounded border border-border px-1.5 text-xs text-muted-foreground">Archived</span>}
                  <span className="shrink-0 text-xs text-muted-foreground">{KIND_LABEL[r.kind]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p role="status" aria-live="polite" className={cn("px-3 py-3 text-sm text-muted-foreground", !message && "sr-only")}>
            {message ?? (shownRows.length === 1 ? "1 result" : `${shownRows.length} results`)}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
