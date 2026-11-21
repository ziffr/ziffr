"use client";
// The views of My schedule (spec 0027, ticket #507; GLOSSARY: Schedule, Due Date): the list the page renders, or the
// same duties in a week or a month. The switch is remembered in this browser. It gets only what a chip shows (a title,
// a day, a path), computed by the page from the core's Schedule; nothing here asks for more.
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { monthGrid, moveDay, placeEntries, step, weekDays, type Placed } from "@ziffr/core/schedule-calendar";

/** One duty as a chip shows it. */
export type Duty = { key: string; kind: "value_due" | "approval" | "task" | "question"; title: string; date: string; overdue: boolean; lateDays: number; path: string };
type View = "list" | "week" | "month";
const VIEWS: { id: View; label: string }[] = [{ id: "list", label: "List" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }];
const MAX_CHIPS = 3;

/** The colour of each kind: a left edge on the chip. The words (due, Approve:, Task:, Question:) carry the kind too. */
const KIND_EDGE: Record<Duty["kind"], string> = {
  value_due: "var(--color-success)",
  approval: "var(--color-accent-2)",
  task: "var(--color-ink-2)",
  question: "oklch(48% 0.1 280)",
};

const dayName = (d: string) => format(parseISO(d), "EEE d MMM");
const fullName = (d: string) => format(parseISO(d), "EEEE d MMMM");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The chosen view lives in this browser's storage; a browser that refuses storage keeps it for the visit only. */
const STORE_EVENT = "ziffr:schedule-view";
const storeKey = (person: string) => `ziffr:schedule-view:${person}`;
function stored(person: string): View | null {
  try {
    const v = window.localStorage.getItem(storeKey(person));
    return v === "week" || v === "month" || v === "list" ? v : null;
  } catch {
    return null;
  }
}
function remember(person: string, view: View) {
  try {
    window.localStorage.setItem(storeKey(person), view);
    window.dispatchEvent(new Event(STORE_EVENT));
  } catch {
    // Storage is refused (private window, blocked site data): the choice holds until the page is left.
  }
}
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(STORE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(STORE_EVENT, notify);
  };
};

/** A duty as a chip: a link to what the list row opens, with a mark when it is overdue and the day it was due. */
function Chip({ p, today, compact }: { p: Placed<Duty>; today: string; compact?: boolean }) {
  const d = p.entry;
  return (
    <Link
      href={d.path}
      style={{ borderLeftColor: KIND_EDGE[d.kind] }}
      className="block rounded-[var(--radius-sm)] border border-border border-l-[3px] bg-[var(--color-cotton)] px-2 py-1 text-xs leading-snug hover:bg-[var(--color-paper-2)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <span className={cn("block font-medium", compact && "line-clamp-2")}>
        {d.overdue && <span className="mr-1 rounded-sm bg-[var(--color-error)] px-1 py-px text-[10px] font-semibold text-white">Overdue</span>}
        {d.title}
      </span>
      {p.originalDate && <span className="block text-[11px] text-muted-foreground">{p.originalDate !== today && `from ${dayName(p.originalDate)}, `}{plural(d.lateDays, "working day")} late</span>}
    </Link>
  );
}

/** What a day holds, in words for a screen reader. */
function dayLabel(day: string, count: number, today: string) {
  return `${fullName(day)}${day === today ? ", today" : ""}, ${count === 0 ? "nothing to do" : `${count} ${count === 1 ? "duty" : "duties"}`}`;
}

/** Arrow keys move between day cells (the focused cell is the one tab stop); Enter does `open`. */
function useDayKeys(span: { from: string; to: string }, open: (day: string) => void) {
  const root = useRef<HTMLDivElement>(null);
  return {
    root,
    onKeyDown(e: React.KeyboardEvent<HTMLElement>, day: string) {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter") return open(day);
      const next = moveDay(day, e.key, span);
      if (next === null) return;
      e.preventDefault();
      root.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
    },
  };
}

function Nav({ label, onPrev, onNext, onToday, today }: { label: string; onPrev: (() => void) | null; onNext: (() => void) | null; onToday: () => void; today: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Previous" disabled={!onPrev} onClick={() => onPrev?.()}><ChevronLeft /></Button>
      <Button variant="outline" size="icon" aria-label="Next" disabled={!onNext} onClick={() => onNext?.()}><ChevronRight /></Button>
      <Button variant="outline" size="sm" disabled={today} onClick={onToday}>Today</Button>
      <h2 className="ml-1 text-sm font-semibold" aria-live="polite">{label}</h2>
    </div>
  );
}

const cell = "min-w-0 rounded-[var(--radius-sm)] border border-border p-1.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

function Week({ anchor, setAnchor, today, span, placed, weekStart }: { anchor: string; setAnchor: (d: string) => void; today: string; span: { from: string; to: string }; placed: Map<string, Placed<Duty>[]>; weekStart: 0 | 1 }) {
  const days = weekDays(anchor, weekStart);
  const { root, onKeyDown } = useDayKeys(span, (day) => root.current?.querySelector<HTMLElement>(`[data-day="${day}"] a`)?.focus());
  const focusDay = days.includes(today) ? today : days[0];
  const prev = step("week", anchor, -1, span, weekStart);
  const next = step("week", anchor, 1, span, weekStart);
  return (
    <>
      <Nav label={`${dayName(days[0])} to ${dayName(days[6])}`} onPrev={prev ? () => setAnchor(prev) : null} onNext={next ? () => setAnchor(next) : null} onToday={() => setAnchor(today)} today={days.includes(today)} />
      <div ref={root}>
        {/* A week on a wide screen: seven columns. On a phone: a day-by-day agenda, below. */}
        <ol className="hidden gap-2 md:grid md:grid-cols-7" aria-label="Week">
          {days.map((day) => {
            const list = placed.get(day) ?? [];
            return (
              <li
                key={day}
                data-day={day}
                tabIndex={day === focusDay ? 0 : -1}
                aria-label={dayLabel(day, list.length, today)}
                onKeyDown={(e) => onKeyDown(e, day)}
                className={cn(cell, "min-h-40", day === today && "bg-[var(--color-paper-2)] ring-2 ring-[var(--color-ink)]", day > span.to && "opacity-45")}
              >
                <p className={cn("mb-1.5 text-xs", day === today ? "font-semibold" : "text-muted-foreground")}>{format(parseISO(day), "EEE d")}{day === today && " · Today"}</p>
                <ul className="space-y-1.5">{list.map((p) => <li key={p.entry.key}><Chip p={p} today={today} /></li>)}</ul>
              </li>
            );
          })}
        </ol>
        <ol className="space-y-3 md:hidden" aria-label="Week, day by day">
          {days.map((day) => {
            const list = placed.get(day) ?? [];
            return (
              <li key={day} className={cn("rounded-[var(--radius-sm)] border border-border p-2", day === today && "bg-[var(--color-paper-2)] ring-2 ring-[var(--color-ink)]")}>
                <h3 className="mb-1.5 text-sm font-semibold">{day === today ? `Today, ${dayName(day)}` : dayName(day)}</h3>
                {list.length ? <ul className="space-y-1.5">{list.map((p) => <li key={p.entry.key}><Chip p={p} today={today} /></li>)}</ul> : <p className="text-xs text-muted-foreground">Nothing to do.</p>}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

function Month({ anchor, setAnchor, today, span, placed, weekStart }: { anchor: string; setAnchor: (d: string) => void; today: string; span: { from: string; to: string }; placed: Map<string, Placed<Duty>[]>; weekStart: 0 | 1 }) {
  const [picked, setPicked] = useState(today);
  const grid = monthGrid(anchor, weekStart);
  const inView = grid.flat().some((c) => c.date === picked && c.inMonth) ? picked : anchor.slice(0, 7) === today.slice(0, 7) ? today : `${anchor.slice(0, 7)}-01`;
  const { root, onKeyDown } = useDayKeys(span, setPicked);
  const prev = step("month", anchor, -1, span, weekStart);
  const next = step("month", anchor, 1, span, weekStart);
  const names = Array.from({ length: 7 }, (_, i) => weekDays("2026-11-23", weekStart)[i]);
  const list = placed.get(inView) ?? [];
  return (
    <>
      <Nav label={format(parseISO(anchor), "MMMM yyyy")} onPrev={prev ? () => setAnchor(prev) : null} onNext={next ? () => setAnchor(next) : null} onToday={() => { setAnchor(today); setPicked(today); }} today={anchor.slice(0, 7) === today.slice(0, 7) && inView === today} />
      <div ref={root}>
        <div className="grid grid-cols-7 gap-1 md:gap-2" aria-hidden="true">
          {names.map((d) => <p key={d} className="px-1 text-xs text-muted-foreground"><span className="md:hidden">{format(parseISO(d), "EEEEE")}</span><span className="hidden md:inline">{format(parseISO(d), "EEE")}</span></p>)}
        </div>
        <ol className="mt-1 grid grid-cols-7 gap-1 md:gap-2" aria-label="Month">
          {grid.flat().map(({ date, inMonth }) => {
            const items = placed.get(date) ?? [];
                        return (
              <li
                key={date}
                data-day={date}
                tabIndex={date === inView ? 0 : -1}
                aria-label={dayLabel(date, items.length, today)}
                aria-current={date === today ? "date" : undefined}
                onClick={() => setPicked(date)}
                onKeyDown={(e) => onKeyDown(e, date)}
                className={cn(cell, "min-h-14 cursor-pointer md:min-h-28", (!inMonth || date > span.to) && "opacity-45", date === today && "bg-[var(--color-paper-2)] ring-2 ring-[var(--color-ink)]", date === inView && "outline-2 outline-offset-1 outline-[var(--color-focus)]")}
              >
                <p className={cn("text-xs", date === today ? "font-semibold" : "text-muted-foreground")}>{Number(date.slice(8))}</p>
                {/* A phone has no room for chips: a dot per duty, in its kind's colour; the day's list is below the grid. */}
                <div className="mt-1 flex flex-wrap gap-0.5 md:hidden" aria-hidden="true">
                  {items.slice(0, 6).map((p) => <span key={p.entry.key} className="size-1.5 rounded-full" style={{ background: KIND_EDGE[p.entry.kind] }} />)}
                </div>
                <ul className="mt-1 hidden space-y-1 md:block">
                  {items.slice(0, MAX_CHIPS).map((p) => <li key={p.entry.key}><Chip p={p} today={today} compact /></li>)}
                  {items.length > MAX_CHIPS && <li><button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={(e) => { e.stopPropagation(); setPicked(date); }}>+ {items.length - MAX_CHIPS} more</button></li>}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
      <section className="mt-4 space-y-2" aria-label={`${fullName(inView)}`}>
        <h3 className="text-sm font-semibold">{inView === today ? `Today, ${dayName(inView)}` : dayName(inView)}</h3>
        {list.length ? <ul className="grid gap-1.5 md:grid-cols-2">{list.map((p) => <li key={p.entry.key}><Chip p={p} today={today} /></li>)}</ul> : <p className="text-sm text-muted-foreground">{inView > span.to ? "Not loaded: this day is further ahead than My schedule looks." : "Nothing to do."}</p>}
      </section>
    </>
  );
}

/** The switch and the chosen view. `list` is the page's own list; the calendar views draw the same duties. */
export function ScheduleViews({ person, list, today, span, overdue, days, weekStart = 1 }: { person: string; list: React.ReactNode; today: string; span: { from: string; to: string }; overdue: Duty[]; days: { date: string; entries: Duty[] }[]; weekStart?: 0 | 1 }) {
  const saved = useSyncExternalStore(subscribe, () => stored(person), () => null);
  const [chosen, setChosen] = useState<View | null>(null);
  const [anchor, setAnchor] = useState(today);
  const view = chosen ?? saved ?? "list";
  const placed = placeEntries({ today, overdue, days });
  const pick = (v: View) => { setChosen(v); remember(person, v); };
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="View" className="inline-flex rounded-[var(--radius-stock)] border border-border p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={view === v.id}
            onClick={() => pick(v.id)}
            className={cn("rounded-[var(--radius-sm)] px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring", view === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "list" && list}
      {view === "week" && <Week anchor={anchor} setAnchor={setAnchor} today={today} span={span} placed={placed} weekStart={weekStart} />}
      {view === "month" && <Month anchor={anchor} setAnchor={setAnchor} today={today} span={span} placed={placed} weekStart={weekStart} />}
    </div>
  );
}
