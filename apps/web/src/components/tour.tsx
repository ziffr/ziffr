"use client";
// The guided tour of Demo Mode (GLOSSARY: Demo Mode): a few steps through the made-up company, remembered per browser.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Compass, Minus, X } from "lucide-react";
import { OPEN_TOUR } from "@/lib/open-tour";

/** The demo changes nothing, so the tour reads first and only then tries what the demo will refuse (#528). Where visitors may change
 * the demo (spec 0051) the steps that enter a value or define a Metric say it works. */
const MEMBER_STEPS = [
  { href: "/", title: "Look at a dashboard", body: "Open the Monthly overview and click a number to see its history. Right-click a widget → Change view." },
  { href: "/", title: "See what others see", body: "Switch “Viewing as” to Anna, then to the Guest, and watch what each can open. Roles decide it." },
  { href: "/analyze", title: "Analyze", body: "Run “What drives Cost?” and look at what it finds. Right-click a result → Add to dashboard." },
  { href: "/decks", title: "Open a deck", body: "Open the board update and click through its slides. Its numbers are live." },
  { href: "/connectors/sources", title: "Capture a value", body: "Answer Anna’s Slack Prompt with a number. Send a second one and watch the Submission Rule." },
  { href: "/metrics/new", title: "Define a metric", body: "Pick “Customer satisfaction” from the catalog and choose who reports it. The demo won’t save it: that is what a trial is for." },
];

/** The steps' words where visitors may change the demo: what the last steps do now works, and is shared until the demo starts fresh. */
const CHANGES_WORDS: Record<string, string> = {
  "Capture a value": "Answer Anna’s Slack Prompt with a number: it is recorded, and the dashboard moves. Send a second one and watch the Submission Rule.",
  "Define a metric": "Pick “Customer satisfaction” from the catalog and choose who reports it. The Metric is saved, and everyone in the demo sees it until the demo starts fresh.",
  "Submit a value": "Open a metric you submit and record its latest value, or answer the Prompt you get. Everyone in the demo sees it until the demo starts fresh.",
};

/** A Guest creates nothing (GLOSSARY: Workspace Role), so their tour only looks at what is shared with them. */
const GUEST_STEPS = [
  { href: "/dashboards", title: "Look at what is shared", body: "Open a dashboard that was shared with you and click a number to see its history." },
  { href: "/metrics", title: "Submit a value", body: "Open a metric you submit and record its latest value, or answer the Prompt you get." },
  { href: "/schedule", title: "Answer a question", body: "Questions and tasks waiting for you are in Schedule. Reply there." },
];

const KEY = "ziffr-tour-v4";

/** The demo's guided tour: bottom right on a larger screen, folding down to a small round button; on a phone a sheet above the tab bar that More opens and the close button puts away. */
export function Tour({ guest = false, changes = false }: { guest?: boolean; /** Visitors may change the demo: the steps that enter a value say it works. */ changes?: boolean }) {
  const base = guest ? GUEST_STEPS : MEMBER_STEPS;
  const STEPS = changes ? base.map((s) => ({ ...s, body: CHANGES_WORDS[s.title] ?? s.body })) : base;
  const [done, setDone] = useState<boolean[]>(STEPS.map(() => false));
  const key = guest ? `${KEY}-guest` : KEY;
  const [open, setOpen] = useState(false);
  const [small, setSmall] = useState(false);
  // Drawn only once the browser has said whether this is a phone, so a phone never sees the card flash up first.
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const isPhone = window.matchMedia("(max-width: 767px)").matches;
    setPhone(isPhone);
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? "null");
      if (s) {
        setDone(s.done);
        // On a phone the tour is a sheet the person opens from More, and it never comes back open on its own on the next page (#1120).
        setOpen(isPhone ? false : s.open);
        setSmall(isPhone ? true : Boolean(s.small));
      } else if (isPhone) setSmall(true);
    } catch { if (isPhone) setSmall(true); }
    setReady(true);
  }, [key]);
  // On a phone the sheet puts itself away when a step's link (or anything else) opens another page, so it never follows the visitor around.
  const path = usePathname();
  useEffect(() => { if (window.matchMedia("(max-width: 767px)").matches) { setOpen(false); setSmall(true); } }, [path]);
  // More's "Guided tour" row opens it (phones have no floating button).
  useEffect(() => {
    const show = () => { setSmall(false); setOpen(true); };
    window.addEventListener(OPEN_TOUR, show);
    return () => window.removeEventListener(OPEN_TOUR, show);
  }, []);
  const save = (d: boolean[], o: boolean, sm = small) => {
    setDone(d);
    setOpen(o);
    setSmall(sm);
    try {
      localStorage.setItem(key, JSON.stringify({ done: d, open: o, small: sm }));
    } catch {}
  };
  const count = done.filter(Boolean).length;
  if (!ready) return null;
  if (small && phone) return null;
  if (small) {
    return (
      <button onClick={() => save(done, true, false)} aria-label={`Open the guided tour, ${count} of ${STEPS.length} done`} title="Guided tour" className="stock fixed right-4 bottom-4 z-40 flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-medium">
        <Compass aria-hidden className="size-4 text-primary" />
        <span className="fig text-muted-foreground max-md:sr-only">{count}/{STEPS.length}</span>
      </button>
    );
  }
  return (
    <div role={phone ? "dialog" : undefined} aria-label={phone ? "Guided tour" : undefined} className="fixed right-4 bottom-4 z-40 w-[min(24rem,calc(100vw-2rem))] stock rounded-[var(--radius-card)] max-md:inset-x-0 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-md:w-auto max-md:rounded-b-none">
      <div className="flex items-center">
        <button onClick={() => save(done, !open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-4 text-left text-sm font-medium">
          <Compass className="size-4 shrink-0 text-primary" />
          Guided tour
          {!open && count < STEPS.length && <span className="truncate font-normal text-muted-foreground">Next: {STEPS[done.findIndex((d) => !d)].title}</span>}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{count}/{STEPS.length}</span>
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronUp className="size-4 shrink-0" />}
        </button>
        <button onClick={() => save(done, false, true)} aria-label={phone ? "Close the guided tour" : "Fold the guided tour away"} title={phone ? "Close" : "Fold away"} className="mr-2 ml-1 flex size-8 max-md:size-11 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground">
          {phone ? <X aria-hidden className="size-4" /> : <Minus aria-hidden className="size-4" />}
        </button>
      </div>
      {open && (
        <ol className="max-h-[40dvh] space-y-1 overflow-y-auto border-t px-2 py-2">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-2 rounded-lg p-2 hover:bg-muted/60">
              <button aria-label="Mark done" onClick={() => save(done.map((d, j) => (j === i ? !d : d)), open)} className="mt-0.5 shrink-0">
                {done[i] ? <CheckCircle2 className="size-4 text-[var(--color-success)]" /> : <Circle className="size-4 text-muted-foreground" />}
              </button>
              <Link href={s.href} className="text-sm">
                <span className={done[i] ? "text-muted-foreground line-through" : "font-medium"}>
                  {i + 1}. {s.title}
                </span>
                <span className="block text-xs text-muted-foreground">{s.body}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
