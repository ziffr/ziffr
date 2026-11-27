"use client";
// The panel at the side of the Analysis Canvas (GLOSSARY: Analysis Canvas, Pool, Method, Slide-over), made like a dashboard's Add
// widget panel: on a wide screen it stands beside the canvas, which stays usable, so Metrics are dragged onto it and a question's
// answer shows under it with the list still open; on a narrower one it is the Slide-over and a Metric is tapped. One panel lists
// either the Pool or the questions. It shows only what the page holds of the person: their canvas data, and the Method list the core
// gives for the Metrics they see.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wand2 } from "lucide-react";
import type { CanvasData } from "@ziffr/core/types";
import type { EntryView } from "@ziffr/core/analysis-picker";
import type { DropSource } from "@/app/canvas-actions";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { BesidePanel } from "@/components/beside-panel";
import { Pool } from "@/components/pool";
import { SlideOverWindow } from "@/components/slide-over-window";
import { cn } from "@/lib/utils";
import type { CanvasPanel } from "./canvas-board";
import { MethodPicker } from "./method-picker";
import type { ResultItem } from "./results";

/** What the panel shows now, and what it can ask of the page. */
export type PanelState = {
  kind: CanvasPanel;
  data: CanvasData;
  /** The Metrics on the canvas, and the one to explain. */
  ids: number[];
  explains: number | null;
  /** The question to start open (the example's). */
  openEntry: EntryView["id"] | null;
  writes: boolean;
  onAdd: (source: DropSource) => void;
  onQuestions: () => void;
  onResult: (r: Omit<ResultItem, "key">) => void;
  onClose: () => void;
};

const TITLES: Record<CanvasPanel, string> = { metrics: "Add a Metric", methods: "Pick a question" };
const hintOf = (kind: CanvasPanel, docked: boolean) =>
  kind === "methods" ? "Pick the question you want answered about the Metrics on the canvas."
    : docked ? "Drag a Metric onto the canvas, or press + to add it." : "Tap a Metric to add it to the canvas.";

// The Slide-over is handed its content once, so what changes while it is open (the canvas, the list it shows) reaches it through this.
function useShared<T>(value: T) {
  const [shared] = useState(() => {
    let now = value;
    const listeners = new Set<() => void>();
    return {
      get: () => now,
      set: (next: T) => { now = next; listeners.forEach((l) => l()); },
      subscribe: (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); },
    };
  });
  useEffect(() => shared.set(value));
  return shared;
}

/** The panel, beside the canvas (`docked`) or in the Slide-over. Render it only while it is open. */
export function CanvasSidePanel({ docked, ...state }: PanelState & { docked: boolean }) {
  const shared = useShared<PanelState>(state);
  const title = TITLES[state.kind];
  const hint = hintOf(state.kind, docked);
  if (!docked) return <SlideOverWindow title={title} description={hint} onClose={state.onClose}><Live shared={shared} /></SlideOverWindow>;
  return <BesidePanel id="canvas-panel" title={title} hint={hint} onClose={state.onClose}><Body {...state} docked /></BesidePanel>;
}

function Live({ shared }: { shared: ReturnType<typeof useShared<PanelState>> }) {
  const state = useSyncExternalStore(shared.subscribe, shared.get, shared.get);
  return <Body {...state} docked={false} />;
}

function Body(props: PanelState & { docked: boolean }) {
  const { kind, docked } = props;
  const box = useRef<HTMLDivElement>(null);
  const was = useRef(kind);
  // In the Slide-over the button that switched the list goes with it, so the focus moves to the new list. Beside the canvas the panel takes it.
  useEffect(() => {
    if (was.current === kind) return;
    was.current = kind;
    if (!docked) box.current?.focus();
  }, [kind, docked]);
  return (
    <div ref={box} tabIndex={-1} className="outline-none">
      {kind === "metrics"
        ? <Metrics {...props} />
        : <MethodPicker key={props.openEntry ?? ""} ids={props.ids} explains={props.explains} writes={props.writes} openEntry={props.openEntry} onResult={props.onResult} />}
    </div>
  );
}

// The Pool with a store of its own for the series its Previews draw: the Slide-over stands outside the page's.
function Metrics({ data: sent, ids, onAdd, onQuestions, docked }: PanelState & { docked: boolean }) {
  const { data, ensure } = useCanvasSeries(sent);
  return (
    <SeriesProvider ensure={ensure}>
      <Pool data={data} saved={[]} metricsOnly onAdd={onAdd} inPanel={{ added: ids, drag: docked }} />
      {ids.length > 0 && (
        <div className={cn("sticky border-t border-[var(--color-rule-2)] py-3", docked ? "-bottom-3 bg-[var(--color-paper-2)]" : "bottom-0 bg-popover")}>
          <button type="button" onClick={onQuestions} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-stock)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 sm:min-h-10"><Wand2 aria-hidden className="size-4" /> Pick a question</button>
        </div>
      )}
    </SeriesProvider>
  );
}
