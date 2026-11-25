"use client";
// The Actions about a Widget's Metrics (GLOSSARY: Action, Question, Task, Slide-over): the "N open" mark in a Widget's
// header opens them beside the page, with `?panel=actions-<slug>[,<slug>]` as the direct URL. Each row opens the
// Action's own page, where it is answered. The list is read on open by a server action that returns only what this
// person may read.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { metricActions } from "@/app/metric-actions-actions";
import type { MetricActionRow } from "@ziffr/core/metric-actions";
import { approvalQuestionForWeb } from "@ziffr/core/approval-question";
import { isActionError } from "@/lib/action-error";
import { actionsPanel, useOpenPanel, writePanel } from "@/lib/panel-param";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const PREFIX = actionsPanel([]);
const MOST_SLUGS = 12;

/** Whether the address is a View Link page (/v/<token>), where nobody is signed in. */
export const isViewLinkPath = (path: string | null) => path === "/v" || (path ?? "").startsWith("/v/");

type Load = { state: "loading" } | { state: "refused"; words: string } | { state: "failed" } | { state: "ready"; rows: MetricActionRow[] };

function Panel({ slugs }: { slugs: string[] }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const key = slugs.join(",");
  useEffect(() => {
    let live = true;
    metricActions(key.split(",")).then((r) => live && setLoad(isActionError(r) ? { state: "refused", words: r.error } : { state: "ready", rows: r })).catch(() => live && setLoad({ state: "failed" }));
    return () => { live = false; };
  }, [key]);
  const several = slugs.length > 1;
  const named = load.state === "ready" ? [...new Set(load.rows.map((a) => a.metric.name))].join(", ") : "";
  return (
    <>
      <SheetHeader>
        <SheetTitle>Open questions and tasks</SheetTitle>
        <SheetDescription>{named || "About this widget's metrics"}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        {load.state === "loading" && <p className="text-sm text-muted-foreground" aria-live="polite">Loading…</p>}
        {load.state === "refused" && <p className="text-sm">{load.words}</p>}
        {load.state === "failed" && <p className="text-sm">The list did not load. Close it and try again.</p>}
        {load.state === "ready" && load.rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing is open for you to see.</p>}
        {load.state === "ready" && load.rows.length > 0 && (
          <ul className="divide-y divide-border">
            {load.rows.map((a) => (
              <li key={a.id}>
                <Link href={`/actions/${a.id}`} className="block py-2.5 text-sm outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="block font-medium">{a.isApproval ? approvalQuestionForWeb(a.question) : a.question}</span>
                  <span className="block text-xs text-muted-foreground">
                    {a.kind === "task" ? "Task" : "Question"}, {a.status === "answered" ? "answered" : "open"}{several ? `, ${a.metric.name}` : ""}, {a.periodLabel}{a.assigneeName ? `, for ${a.assigneeName}` : ""}{a.dueDate ? `, due ${a.dueDate}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Opens the Actions about these Metrics (by slug) through the address; the host below draws them. */
function openMetricActions(slugs: string[]) {
  writePanel(actionsPanel(slugs));
}

/** The Actions panel, once per page (in the app shell): open whenever the address names it. */
export function MetricActionsHost() {
  const panel = useOpenPanel();
  // A View Link page has no signed-in person: the call would send the viewer to sign in, so the panel stays shut there.
  const open = !isViewLinkPath(usePathname());
  const wanted = open && panel?.startsWith(PREFIX) ? panel.slice(PREFIX.length).split(",").filter(Boolean).slice(0, MOST_SLUGS) : [];
  const wantedKey = wanted.join(",");
  // Kept after closing so the panel slides out with its content instead of emptying first.
  const [shown, setShown] = useState<string[]>([]);
  useEffect(() => { if (wantedKey) setShown(wantedKey.split(",")); }, [wantedKey]);
  if (!shown.length) return null;
  return (
    <Sheet open={wantedKey !== ""} onOpenChange={(o) => { if (!o) writePanel(null); }}>
      <SheetContent>
        <Panel key={shown.join(",")} slugs={shown} />
      </SheetContent>
    </Sheet>
  );
}

/** The "N open" mark in a Widget's header, as a button that opens the panel. */
export function OpenActionsButton({ slugs, count, label }: { slugs: string[]; count: number; label: string }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={(e) => { e.stopPropagation(); openMetricActions(slugs); }} onMouseDown={(e) => e.stopPropagation()} className="widget-text-xs flex shrink-0 items-center gap-1 rounded-md px-1 text-muted-foreground max-md:min-h-11 max-md:min-w-11 max-md:justify-center max-md:-my-2.5 max-[420px]:order-3 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <MessageSquare aria-hidden className="size-[1.15em]" /><span className="fig">{count}</span>
    </button>
  );
}
