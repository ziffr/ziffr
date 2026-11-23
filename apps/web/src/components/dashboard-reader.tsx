"use client";
// A dashboard's Read view (spec 0013, ticket #174; GLOSSARY: Dashboard, Finding): its name, its introduction, then its
// widgets one below the other in reading order (top to bottom, left to right), each at full width, readable on any
// screen. Findings read like the sections of an article. Nothing here changes the dashboard: it is changed in the
// Grid view's Edit mode. Through a View Link it shows only the cards and their numbers, nothing that calls the server.
import { RecipeBudgetProvider } from "@/views/recipe-budget";
import { WidgetFrame } from "@/components/widget-frame";
import { ThemeScope } from "@/components/theme-scope";
import { themeFor } from "@ziffr/core/themes";
import type { CanvasData, Widget } from "@ziffr/core/types";

/** What the Read view shows of the dashboard itself. */
export type ReadDashboard = { id: number; name: string; intro: string; theme_id: number | null };

/** How tall a widget is drawn: its place's height in rows, as on the grid, but never cramped. */
const height = (w: Widget) => Math.max(8, w.h) * 44;

/** The dashboard read top to bottom. `readOnly` through a View Link; `header` false when the page shows the name. */
export function DashboardReader({ dashboard, widgets, data, readOnly = false, header = true }: { dashboard: ReadDashboard; widgets: Widget[]; data: CanvasData; readOnly?: boolean; header?: boolean }) {
  const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
  return (
    <article className="mx-auto max-w-3xl">
      {(header || dashboard.intro) && (
        <header className="mb-8">
          {header && <h1 className="text-[length:var(--text-3xl,2rem)] leading-tight">{dashboard.name}</h1>}
          {dashboard.intro && <p className="mt-3 text-lg whitespace-pre-line text-muted-foreground">{dashboard.intro}</p>}
        </header>
      )}
      {/* Read-only means a Snapshot or a View Link: they keep the look they were made or shared with, not the viewer's Appearance (#583). */}
      <ThemeScope theme={themeFor(data.themes, dashboard.theme_id)} scheme={readOnly ? "designed" : "follow"} className="space-y-8">
        {ordered.length === 0 && (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm text-muted-foreground">This dashboard has no widgets yet.</p>
        )}
        <RecipeBudgetProvider data={data}>
        {ordered.map((w, i) => (
          <section key={w.id} aria-label={`Part ${i + 1} of ${ordered.length}`} style={{ height: height(w) }}>
            <WidgetFrame widget={w} data={data} targets={[]} editable={false} readOnly={readOnly} />
          </section>
        ))}
        </RecipeBudgetProvider>
      </ThemeScope>
    </article>
  );
}
