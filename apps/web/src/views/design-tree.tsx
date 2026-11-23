"use client";
// The `tree` mark of a View Design (GLOSSARY: Formula Tree, View Design): the formula of a Derived Metric as boxes. What every box says (its
// number, its share, the words for a gap, a note, a part taken away) is worked out once by the core in formula-tree.ts, exactly, so a widget,
// a Snapshot, a View Link and a deck's picture all show the same numbers; where each box goes is tree-layout.ts. This file only draws
// them, from Theme tokens. It reaches no Metric the person may not see: the core refuses a formula with an input that is not in the data.
import { useId, type ReactNode } from "react";
import { treeFromData, type TreeBox, type TreeModel } from "@ziffr/core/formula-tree";
import type { DesignValues } from "./design-view";
import { fitWords } from "./label-fit";
import { layoutTree, OPERATOR_WIDTH, ROW, TREE_WIDTH, treeHeight, type Placed } from "./tree-layout";

const SIZE = 9;
const STEP = SIZE + 1;
const CHAR = 0.55 * SIZE;
// What a box writes: its name on at most two lines and its number, only when its number fits whole (a number is never cut) and, for a part
// taken away, room for its sign beside it. A name that had to be cut is still listed whole beneath the drawing, like a box with no room at all.
function wordsOf(b: TreeBox, p: Placed): { lines: { t: string; muted: boolean }[]; whole: boolean } | null {
  const sign = b.taken ? 8 : 0;
  if (p.w < 30 || [...b.text].length * 0.6 * SIZE + 6 + sign > p.w) return null;
  const name = fitWords(b.label, Math.floor((p.w - 6) / CHAR), 2);
  return { lines: [...name.map((t) => ({ t, muted: false })), { t: b.text, muted: b.value === null }], whole: name.join(" ") === b.label.split(/\s+/).filter(Boolean).join(" ") };
}

function Words({ children }: { children: ReactNode }) {
  return <p className="widget-text-xs mt-0.5 text-muted-foreground">{children}</p>;
}

/** One box: its rectangle, hatched when taken away and dashed when it has no value, its name and its number and the sign of a part taken away; a box thinner than a line still has a mark. */
function Box({ box, at, hatch }: { box: TreeBox; at: Placed; hatch: string }) {
  const gap = box.value === null;
  const words = wordsOf(box, at);
  const lines = words?.lines ?? [];
  const first = at.y + (ROW.h - lines.length * STEP) / 2 + SIZE - 1;
  // Each line is its own text, isolated, so a name written right to left and its number never run together; a halo keeps it readable over the hatching.
  const halo = { stroke: "var(--color-paper-3)", strokeWidth: 2.4, paintOrder: "stroke", strokeLinejoin: "round", unicodeBidi: "plaintext" } as const;
  return (
    <g data-box={box.id} data-taken={box.taken || undefined} data-gap={gap || undefined}>
      <title>{box.alt}</title>
      <rect x={at.x} y={at.y} width={at.w} height={at.h} fill={gap ? "none" : "var(--color-data)"} fillOpacity={box.level === 0 ? 0.3 : 0.14} stroke={gap ? "var(--color-muted)" : "var(--color-data)"} strokeWidth={0.9} strokeDasharray={gap ? "3 2" : undefined} />
      {box.taken && <rect x={at.x} y={at.y} width={at.w} height={at.h} fill={`url(#${hatch})`} />}
      {/* A box thinner than a line is still found: a mark as wide as the line, over its place. */}
      {at.w < 1.5 && <rect x={at.x + at.w / 2 - 0.75} y={at.y} width={1.5} height={at.h} fill="var(--color-ink)" />}
      {lines.map((ln, k) => <text key={k} x={at.x + 3} y={first + k * STEP} fontSize={SIZE} fill={ln.muted ? "var(--color-muted)" : "var(--color-ink)"} fontWeight={k === lines.length - 1 ? 600 : 400} style={halo}>{ln.t}</text>)}
      {words && box.taken && <text x={at.x + at.w - 3} y={first + (lines.length - 1) * STEP} fontSize={SIZE} textAnchor="end" fill="var(--color-ink)" style={halo}>−</text>}
    </g>
  );
}

/** The boxes of a tree model, drawn; a model that was refused is its words. */
export function TreeDrawing({ model }: { model: TreeModel }) {
  const hatch = useId().replace(/:/g, "");
  if (!model.ok) return <Words>{model.refusal}</Words>;
  const { boxes } = model;
  const placed = layoutTree(boxes);
  const unlabelled = boxes.filter((b) => !wordsOf(b, placed[b.id])?.whole);
  const height = treeHeight(boxes);
  return (
    <>
      <div className="relative min-h-24 w-full flex-1">
        <svg viewBox={`0 0 ${TREE_WIDTH} ${height}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
          <defs>
            <pattern id={hatch} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={5} stroke="var(--color-ink)" strokeOpacity={0.4} strokeWidth={1.4} />
            </pattern>
          </defs>
          {boxes.map((b) => <Box key={b.id} box={b} at={placed[b.id]} hatch={hatch} />)}
          {boxes.filter((b) => b.op === "product").flatMap((p) => boxes.filter((k) => k.parent === p.id && k.glyph).map((k) => (
            <text key={`op${k.id}`} x={placed[k.id].x - OPERATOR_WIDTH / 2} y={placed[k.id].y + ROW.h / 2 + SIZE / 3} fontSize={SIZE + 2} textAnchor="middle" fill="var(--color-ink)">{k.glyph}</text>
          )))}
        </svg>
      </div>
      {unlabelled.length > 0 && <Words>Too narrow to write in the drawing: {unlabelled.map((b) => b.alt).join("; ")}.</Words>}
      <Words>{model.rule}</Words>
    </>
  );
}

/** The formula of a Derived Metric as boxes: each part's number, in exact arithmetic, and its share of the box above. */
export function TreeMark({ v }: { v: DesignValues }) {
  return <TreeDrawing model={treeFromData(v.m, v.data, { display: v.offersDisplay ? v.settings.display : undefined, asOf: v.settings.asOf })} />;
}
