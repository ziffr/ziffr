"use client";
// Present mode (dashboards): the dashboard in its theme on the whole screen, without the Pool or menus.
// Overview keeps the layout on wide screens and stacks in reading order on narrow ones;
// one at a time walks through the widgets with arrow keys or swipes.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Maximize, Minimize, Square, X } from "lucide-react";
import { ThemeScope } from "@/components/theme-scope";
import { WidgetFrame } from "@/components/widget-frame";
import { themeFor } from "@/lib/themes";
import { useFullscreen, useStepper } from "@/lib/use-stepper";
import type { DashboardAccess } from "@/lib/access";
import type { CanvasData, Widget } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PresentDashboard({ dashboard, data, widgets, start }: { dashboard: DashboardAccess; data: CanvasData; widgets: Widget[]; start: number }) {
  const router = useRouter();
  const back = `/dashboards/${dashboard.id}`;
  const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const [mode, setMode] = useState<"overview" | "single">(start ? "single" : "overview");
  const step = useStepper(ordered.length, start, () => router.push(back));
  const full = useFullscreen();
  const rows = Math.max(1, ...ordered.map((w) => w.y + w.h));
  const theme = themeFor(data.themes, dashboard.theme_id);

  const bar = "flex min-h-10 items-center gap-1.5 rounded-[var(--radius-input)] px-2.5 text-sm hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent-2)]";
  return (
    <ThemeScope theme={theme} className="desk fixed inset-0 z-[var(--z-modal)] flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2 sm:px-6">
        <h1 className="min-w-0 flex-1 truncate font-[family-name:var(--font-heading)] text-[length:clamp(1.1rem,2.2vw,1.6rem)] font-semibold tracking-[-0.02em]">{dashboard.name}</h1>
        <div role="group" aria-label="View" className="flex gap-0.5 rounded-[var(--radius-input)] border border-[var(--border)] p-0.5">
          <button type="button" aria-label="Overview" aria-pressed={mode === "overview"} onClick={() => setMode("overview")} className={cn(bar, mode === "overview" && "bg-[var(--muted)] font-medium")}><LayoutGrid aria-hidden className="size-4" /> <span className="hidden sm:inline">Overview</span></button>
          <button type="button" aria-label="One at a time" aria-pressed={mode === "single"} onClick={() => setMode("single")} className={cn(bar, mode === "single" && "bg-[var(--muted)] font-medium")}><Square aria-hidden className="size-4" /> <span className="hidden sm:inline">One at a time</span></button>
        </div>
        <button type="button" onClick={full.toggle} className={bar} aria-label={full.on ? "Leave full screen" : "Full screen"}>{full.on ? <Minimize aria-hidden className="size-4" /> : <Maximize aria-hidden className="size-4" />}</button>
        <Link href={back} className={bar} aria-label="Stop presenting"><X aria-hidden className="size-4" /> <span className="hidden sm:inline">Close</span></Link>
      </header>

      {ordered.length === 0 ? (
        <p className="m-auto text-sm text-[var(--muted-foreground)]">This dashboard is empty.</p>
      ) : mode === "overview" ? (
        <main
          className="grid flex-1 auto-rows-auto grid-cols-1 content-start gap-4 overflow-y-auto px-4 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-12 lg:auto-rows-[var(--row)]"
          // On wide screens the rows share the height of the screen, so the whole dashboard fits without scrolling.
          style={{ "--row": `max(2.2rem, calc((100dvh - 5.5rem - ${(rows - 1) * 16}px) / ${rows}))` } as React.CSSProperties}
        >
          {ordered.map((w, n) => (
            <div
              key={w.id}
              className="h-[max(16rem,calc(var(--h)*2.4rem))] min-w-0 sm:[grid-column:span_var(--sm)] lg:h-auto lg:[grid-column:var(--x)/span_var(--w)] lg:[grid-row:var(--y)/span_var(--h)]"
              style={{ "--x": w.x + 1, "--y": w.y + 1, "--w": w.w, "--h": w.h, "--sm": w.w >= 6 ? 2 : 1 } as React.CSSProperties}
              onDoubleClick={() => { step.go(n); setMode("single"); }}
            >
              <WidgetFrame widget={w} data={data} targets={[]} />
            </div>
          ))}
        </main>
      ) : (
        <main className="relative flex min-h-0 flex-1 flex-col px-3 pb-3 sm:px-6" {...step.swipe} style={{ touchAction: "pan-y" }}>
          <div className="mx-auto min-h-0 w-full max-w-[min(100%,calc((100dvh-8rem)*1.9))] flex-1">
            <WidgetFrame key={ordered[step.i].id} widget={ordered[step.i]} data={data} targets={[]} className="h-full" />
          </div>
          <nav aria-label="Widgets" className="mt-2 flex items-center justify-center gap-3 text-sm">
            <button type="button" onClick={step.prev} disabled={step.i === 0} className={cn(bar, "disabled:opacity-40")} aria-label="Previous"><ChevronLeft aria-hidden className="size-5" /></button>
            <span className="fig min-w-14 text-center" aria-live="polite">{step.i + 1} / {ordered.length}</span>
            <button type="button" onClick={step.next} disabled={step.i === ordered.length - 1} className={cn(bar, "disabled:opacity-40")} aria-label="Next"><ChevronRight aria-hidden className="size-5" /></button>
          </nav>
        </main>
      )}
    </ThemeScope>
  );
}
