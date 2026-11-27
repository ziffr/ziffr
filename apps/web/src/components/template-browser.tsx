"use client";
// GLOSSARY: Widget Template, Preview. Browse templates: every built-in and team template as a Preview, larger than
// the Pool's list, to compare them. It is the content of the side panel (spec 0050); the Pool opens it. Previews draw Sample Data only (see preview.tsx), each once it scrolls into view.
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DropSource } from "@/app/canvas-actions";
import type { CanvasData, WidgetTemplate } from "@ziffr/core/types";
import { TemplatePreview } from "./preview";
import { TEMPLATE_GROUPS, builtinTemplates } from "./template-groups";

type Card = { key: string; name: string; blurb: string; draw: () => React.ReactNode; source: DropSource };

/** The panel's title and line under it for Browse templates. */
export const BROWSE_TEMPLATES = { title: "Browse templates", description: "Drawn with sample data. Pick one to choose its metrics." } as const;

/** What Browse templates shows in the side panel; `onUse` adds the chosen template the way the Pool's + does. */
export function TemplateBrowser({ data, onUse }: { data: CanvasData; onUse: (s: DropSource) => void }) {
  const [q, setQ] = useState("");
  const match = (...s: string[]) => s.some((x) => x.toLowerCase().includes(q.toLowerCase()));
  const groups: { title: string; cards: Card[] }[] = [
    ...TEMPLATE_GROUPS.map((g) => ({
      title: g.title,
      cards: builtinTemplates(false).filter((t) => t.kind === g.kind && match(t.label, t.blurb)).map((t): Card => ({
        key: `b${t.id}`, name: t.label, blurb: t.blurb,
        draw: () => <TemplatePreview template={t.id} viewer={data.viewer} numberStyle={data.numberStyle} width={232} />,
        source: { type: "spec", template: t.id, metricIds: [] },
      })),
    })),
    {
      title: "The team's",
      cards: data.templates.filter((t): t is WidgetTemplate => t.kind === "widget" && match(t.name, t.description)).map((t): Card => ({
        key: `t${t.id}`, name: t.name, blurb: t.description,
        draw: () => <TemplatePreview template={t} viewer={data.viewer} numberStyle={data.numberStyle} width={232} />,
        source: { type: "template", id: t.id },
      })),
    },
  ].filter((g) => g.cards.length);

  return (
    <div className="space-y-3">
        <label className="flex items-center gap-1.5 rounded-[var(--radius-input)] border border-input bg-card px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter templates" className="h-9 w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3 className="pb-2 text-xs font-medium text-muted-foreground">{g.title}</h3>
              <ul className="grid gap-3">
                {g.cards.map((c) => (
                  <li key={c.key} className="stock flex flex-col gap-2 rounded-[var(--radius-stock)] p-3">
                    <WhenVisible className="flex h-44 items-start justify-center overflow-hidden rounded-[var(--radius-input)] bg-[var(--color-paper-2)] p-2">{c.draw}</WhenVisible>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.blurb && <p className="text-xs text-muted-foreground">{c.blurb}</p>}
                    </div>
                    <Button size="sm" variant="outline" className="self-start" onClick={() => onUse(c.source)} aria-label={`Use ${c.name}`}>Use</Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No template matches.</p>}
        </div>
    </div>
  );
}

/** Draws its child once it has scrolled into view, and keeps it drawn: a grid of charts costs little this way. */
export function WhenVisible({ children, className }: { children: () => React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return <div ref={ref} className={className}>{seen ? children() : null}</div>;
}
