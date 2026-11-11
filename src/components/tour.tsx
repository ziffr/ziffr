"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Compass } from "lucide-react";

const STEPS = [
  { href: "/metrics/new", title: "Define a metric", body: "Pick “Customer satisfaction” from the catalog, adjust it, and choose who reports it." },
  { href: "/sources", title: "Capture a value", body: "Answer Anna’s Slack Prompt with a number. Send a second one and watch the Submission Rule." },
  { href: "/dashboards", title: "Build your dashboard", body: "Drag metrics from the Pool onto the canvas. Right-click a widget → Change visualization, then Save as Widget." },
  { href: "/dashboards", title: "Ask without leaving", body: "Right-click the Cost widget → Ask a question to Ben. Switch “View as” to Ben, answer with a correction, switch back and accept." },
  { href: "/analyze", title: "Analyze", body: "Run “What drives Cost?” or drop metrics yourself. Right-click a result → Add to dashboard." },
  { href: "/dashboards", title: "Share", body: "Share your dashboard with Anna, then “View as” Anna to see what she gets." },
];

const KEY = "ziffr-tour-v2";

export function Tour() {
  const [done, setDone] = useState<boolean[]>(STEPS.map(() => false));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (s) {
        setDone(s.done);
        setOpen(s.open);
      }
    } catch {}
  }, []);
  const save = (d: boolean[], o: boolean) => {
    setDone(d);
    setOpen(o);
    try {
      localStorage.setItem(KEY, JSON.stringify({ done: d, open: o }));
    } catch {}
  };
  const count = done.filter(Boolean).length;
  return (
    <div className="fixed right-4 bottom-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-lg">
      <button onClick={() => save(done, !open)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium">
        <Compass className="size-4 text-primary" />
        Guided tour
        {!open && count < STEPS.length && <span className="truncate font-normal text-muted-foreground">· Next: {STEPS[done.findIndex((d) => !d)].title}</span>}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{count}/{STEPS.length}</span>
        {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>
      {open && (
        <ol className="space-y-1 border-t px-2 py-2">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-2 rounded-lg p-2 hover:bg-muted/60">
              <button aria-label="Mark done" onClick={() => save(done.map((d, j) => (j === i ? !d : d)), open)} className="mt-0.5 shrink-0">
                {done[i] ? <CheckCircle2 className="size-4 text-chart-2" /> : <Circle className="size-4 text-muted-foreground" />}
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
