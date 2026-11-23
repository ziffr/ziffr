"use client";
// The Playground (spec 0024; GLOSSARY: Playground, View Design, Sample Data): a design's file on the left, checked as
// it is typed, and the design drawn on the right. Only a design that passes the checks is drawn; while the text has
// mistakes, the last one that passed stays and every mistake is listed with its line.
// Security: the drawing uses the same renderer and checks as a placed widget, with Sample Data or Metrics the person
// sees (their series come through the core). Nothing typed here is stored unless an Owner or Admin adds it.
import { useMemo, useRef, useState, useTransition } from "react";
import { inUse } from "@ziffr/core/metric-row";
import { Download, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { BUILT_IN_DESIGNS, DESIGNED_VIEWS, designSettings, designSlots } from "@ziffr/core/built-in-designs";
import { designWithRecipe, sampleDesignWidget } from "@ziffr/core/design-files";
import { BUILT_IN_RECIPES, RECIPES, type BuiltInRecipe } from "@ziffr/core/built-in-recipes";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { checkViewDesign, VIEW_DESIGN_SCHEMA, VIEW_LIMITS, writeViewDesign, type ViewDesign } from "@ziffr/core/view-design";
import type { Problem } from "@ziffr/core/json-check";
import type { CanvasData } from "@ziffr/core/types";
import { Button } from "@/components/ui/button";
import { JsonEditor } from "@/components/json-editor";
import type { EditorHandle } from "@/components/json-editor-cm";
import { ReadOnlyFrame } from "@/components/read-only-frame";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { downloadDesign } from "@/lib/design-download";
import { addViewDesign } from "@/app/design-actions";

/** The Playground: edit a View Design's file and see it drawn. */
export function PlaygroundScreen({ data: page, manages }: { data: CanvasData; manages: boolean }) {
  const { data, ensure } = useCanvasSeries(page);
  const [text, setText] = useState(() => writeViewDesign(BUILT_IN_DESIGNS.line));
  const [server, setServer] = useState<Problem[] | null>(null);
  const [mine, setMine] = useState(false);
  const [fills, setFills] = useState<number[][]>([]);
  const [pending, start] = useTransition();
  const editor = useRef<EditorHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const check = useMemo(() => checkViewDesign(text), [text]);
  // The last design that passed: drawn while the text has mistakes, so the drawing does not flicker away.
  const good = useRef<ViewDesign>(BUILT_IN_DESIGNS.line);
  if (check.ok) good.current = check.design;
  const design = good.current;
  const problems = server ?? (check.ok ? [] : check.problems);
  const sample = useMemo(() => sampleCanvasData(data.viewer, data.numberStyle), [data.viewer, data.numberStyle]);
  const slots = designSlots(design);
  const filled = slots.every((s, i) => (fills[i]?.length ?? 0) > 0);

  const goTo = (line: number | null) => {
    if (line) editor.current?.goTo(line);
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > VIEW_LIMITS.bytes) return toast.error(`That file is ${f.size.toLocaleString("en")} bytes; a View Design has at most ${VIEW_LIMITS.bytes.toLocaleString("en")}.`);
    setServer(null);
    setText(await f.text());
  };
  const widget = mine && filled
    ? { template: "design" as const, metric_ids: fills.flat(), settings: { ...designSettings(design), design: { id: null, body: design } }, title: null }
    : sampleDesignWidget(design);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="pg-file" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="pg-file" className="mr-auto text-sm font-medium">The design&rsquo;s file, with its Analysis Recipe under “analysis”</h2>
          <label className="text-xs text-muted-foreground">
            Start from{" "}
            <select aria-label="Start from a built-in View Design" className="rounded-[var(--radius-input)] border border-input bg-transparent px-1.5 py-1 text-xs" value="" onChange={(e) => { const v = e.target.value; if (!v) return; setServer(null); setText(writeViewDesign(v.startsWith("recipe:") ? designWithRecipe(BUILT_IN_RECIPES[v.slice(7) as BuiltInRecipe]) : BUILT_IN_DESIGNS[v as (typeof DESIGNED_VIEWS)[number]])); }}>
              <option value="">a built-in View or Analysis Recipe…</option>
              <optgroup label="Views">
                {DESIGNED_VIEWS.map((id) => <option key={id} value={id}>{BUILT_IN_DESIGNS[id].name}</option>)}
              </optgroup>
              {/* A recipe comes inside a design that draws it: the file is still one View Design. */}
              <optgroup label="Analysis Recipes">
                {RECIPES.map((id) => <option key={id} value={`recipe:${id}`}>{BUILT_IN_RECIPES[id].name}</option>)}
              </optgroup>
            </select>
          </label>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
          <Button variant="outline" size="sm" onClick={() => file.current?.click()}><Upload /> Upload</Button>
        </div>
        <div aria-live="polite" className="text-xs">
          {problems.length === 0 ? (
            <p className="text-muted-foreground">“{design.name}” passes the checks.</p>
          ) : (
            <ul className="space-y-0.5 text-destructive">
              {problems.slice(0, 30).map((p, i) => (
                <li key={i}>
                  {/* Each mistake leads to its line in the file. */}
                  <button type="button" className="text-left hover:underline" onClick={() => goTo(p.line)}>
                    {p.line ? `Line ${p.line}: ` : ""}{p.path && <code>{p.path}</code>}{p.path ? " " : ""}{p.message}
                  </button>
                </li>
              ))}
              {problems.length > 30 && <li>…and {problems.length - 30} more.</li>}
            </ul>
          )}
        </div>
        {/* A code editor with help from the format's schema (loaded on demand); a plain text box until then, and if it cannot load. */}
        <JsonEditor ref={editor} label="The View Design's file" value={text} onChange={(t) => { setServer(null); setText(t); }} schema={VIEW_DESIGN_SCHEMA} />
      </section>
      <section aria-labelledby="pg-drawn" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="pg-drawn" className="mr-auto text-sm font-medium">Drawn {problems.length ? "(the last version that passed)" : ""}</h2>
          <div role="radiogroup" aria-label="Values to draw with" className="flex gap-1 text-xs">
            <Button size="sm" variant={mine ? "ghost" : "outline"} role="radio" aria-checked={!mine} onClick={() => setMine(false)}>Sample Data</Button>
            <Button size="sm" variant={mine ? "outline" : "ghost"} role="radio" aria-checked={mine} onClick={() => setMine(true)}>My Metrics</Button>
          </div>
        </div>
        {mine && (
          <div className="flex flex-wrap gap-3">
            {slots.map((s, i) => (
              <label key={i} className="text-xs text-muted-foreground">
                {s.label}{" "}
                <select
                  multiple={s.multiple}
                  aria-label={s.label}
                  className="rounded-[var(--radius-input)] border border-input bg-transparent px-1.5 py-1 text-xs"
                  value={s.multiple ? (fills[i] ?? []).map(String) : String(fills[i]?.[0] ?? "")}
                  onChange={(e) => {
                    const ids = [...e.target.selectedOptions].map((o) => Number(o.value)).filter((n) => n);
                    void ensure(ids);
                    setFills((f) => { const next = [...f]; next[i] = ids; return next; });
                  }}
                >
                  {!s.multiple && <option value="">Choose a metric</option>}
                  {inUse(data.metrics).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-[var(--radius-card)]" style={{ height: Math.max(240, design.size.h * 52) }}>
          <SeriesProvider ensure={ensure}>
            <ReadOnlyFrame widget={widget} data={mine && filled ? data : sample} wordsUnder />
          </SeriesProvider>
        </div>
        {mine && !filled && <p className="text-xs text-muted-foreground">Choose a Metric for every Slot; until then it is drawn with Sample Data.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!check.ok} onClick={() => check.ok && downloadDesign(check.design)}><Download /> Download with Sample Data</Button>
          {manages && (
            <Button size="sm" disabled={!check.ok || pending} onClick={() => start(async () => {
              const res = await addViewDesign(text);
              if (res.ok) toast.success("Added to the Workspace", { description: "Everyone finds it in the Pool." });
              else setServer(res.problems);
            })}><Plus /> Add to the Workspace</Button>
          )}
        </div>
      </section>
    </div>
  );
}
