"use client";
// What the charts drawn in SVG of a View Design share (GLOSSARY: View Design, Widget): the size of the card they are drawn
// to, the widget's type scale, the frame that measures it and the line of words under a chart. The type and the nominal
// size are the charts' own; this file only keeps the measuring in one place.
import type { ReactNode, RefObject } from "react";
import { useBoxSize } from "./use-box-size";
import { useWidgetScale } from "./widget-scale";

/** The widget's type scale, the two boxes to measure (the whole chart, and the room for the drawing) and the size to draw at: the measured one, or a nominal one until it is measured (the first render on the server, a drawing made without a screen). */
export function useChartSize(nominal: { w: number; h: number }) {
  const scale = useWidgetScale();
  const [whole, all] = useBoxSize<HTMLDivElement>();
  const [box, size] = useBoxSize<HTMLDivElement>();
  const measured = size.w > 0 && size.h > 0;
  return { scale, whole, all, box, W: measured ? size.w : nominal.w, H: measured ? size.h : nominal.h };
}

/** The frame of a chart: the drawing fills the room it has, and the words below it keep their own. */
export function ChartFrame({ whole, box, below, children }: { whole: RefObject<HTMLDivElement | null>; box: RefObject<HTMLDivElement | null>; below?: ReactNode; children: ReactNode }) {
  return (
    <div ref={whole} className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={box} className="relative min-h-[5rem] w-full flex-1">{children}</div>
      {below}
    </div>
  );
}

/** A line of words under a chart. */
export function Words({ children }: { children: ReactNode }) {
  return <p className="widget-text-xs mt-0.5 text-muted-foreground">{children}</p>;
}
