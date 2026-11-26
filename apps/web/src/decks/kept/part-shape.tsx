"use client";
// A Snapshot Part as a tldraw shape (spec 0061; GLOSSARY: Snapshot Part, Snapshot, Slide): one Widget as a shown
// Snapshot kept it, or the opening part with the dashboard's name, the period and the introduction, with the line
// saying whose numbers these are. The shape holds only the Snapshot's id and the part number.
// Visibility: everything drawn is what the core answered for this viewer; one who gets nothing reads one sentence.
import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from "tldraw";
import { SeriesProvider } from "@/canvas/series-store";
import { OPENING_PART, SNAPSHOT_PART_SHAPE } from "@ziffr/core/snapshot-parts";
import { useDeckData, WidgetCard } from "../widget-shape";
import { KEPT_WORDS, keptDrawing, keptLine } from "./kept-drawing";
import { useKept, useKeptShape } from "./kept-store";
import { ShapeNotice } from "./shape-notice";

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [SNAPSHOT_PART_SHAPE]: { w: number; h: number; snapshotId: number; part: number };
  }
}

/** A Snapshot Part on the canvas. */
export type PartShape = TLShape<typeof SNAPSHOT_PART_SHAPE>;

function PartCard({ shape }: { shape: PartShape }) {
  const live = useDeckData();
  const kept = useKeptShape(shape.id);
  const numbers = useKept();
  if (!live || !kept) return null;
  const drawing = keptDrawing(kept, numbers, live);
  if (drawing.state !== "shown") return <ShapeNotice words={drawing.state === "notice" ? drawing.words : null} />;
  const { snapshot, widget, data, corrected } = drawing;
  const line = (
    <p className="shrink-0 truncate px-4 pb-2 text-xs text-muted-foreground">
      {keptLine(snapshot)}
      {corrected && <span className="font-medium"> · {KEPT_WORDS.corrected}</span>}
    </p>
  );
  if (shape.props.part === OPENING_PART || !widget) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden font-sans">
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-hidden px-4">
          <p className="text-5xl leading-tight font-semibold">{snapshot.name}</p>
          <p className="text-2xl text-muted-foreground">{snapshot.label}</p>
          {snapshot.intro && <p className="max-w-4xl text-xl whitespace-pre-line">{snapshot.intro}</p>}
        </div>
        {line}
      </div>
    );
  }
  const drawn = { template: widget.template, metric_ids: widget.metric_ids, settings: widget.settings, title: widget.title };
  return (
    <SeriesProvider ensure={null}>
      <WidgetCard widget={drawn} data={data} footer={line} />
    </SeriesProvider>
  );
}

/** The shape of a Snapshot Part: moved, resized and deleted like any other, never changed. */
export class SnapshotPartShapeUtil extends BaseBoxShapeUtil<PartShape> {
  static override type = SNAPSHOT_PART_SHAPE;
  static override props = { w: T.number, h: T.number, snapshotId: T.number, part: T.number };

  getDefaultProps(): PartShape["props"] {
    return { w: 560, h: 320, snapshotId: 0, part: OPENING_PART };
  }

  override canEdit() {
    return false;
  }

  component(shape: PartShape) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", width: shape.props.w, height: shape.props.h }}>
        <PartCard shape={shape} />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: PartShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}
