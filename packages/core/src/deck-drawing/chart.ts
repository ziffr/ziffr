// Charts of a deck's slides (spec 0069; GLOSSARY: Slide), drawn as shapes: one group of columns or lines, markers,
// category names and direct labels. It looks the same in a browser, PowerPoint, Keynote and Google Slides. There are no
// legend boxes: a series is named at the end of its line. Labels never collide: a label with no free place is left out,
// the latest first to get one. Numbers come written by the caller, so there is one way figures are written. Pure.
import type { Measure } from "./measure";
import type { Box, GroupObj, Obj, Pen } from "./objects";
import type { Role } from "./theme";

/** One series of a chart. */
export type ChartSeries = {
  name: string;
  /** One value per category; null where there is none. */
  values: (number | null)[];
  color: Role;
  /** A colour per column, where some stand out. */
  pointColors?: Role[];
  /** How it is drawn; absent: as the chart's kind says. A `marks` series is a short mark per category, as a target over columns. */
  as?: "columns" | "line" | "marks";
  dash?: boolean;
  /** Each value as written, null for none. Absent: no value labels. */
  words?: (string | null)[];
  /** The colour of the value labels; inside stacked columns it must read on the column's colour. */
  wordColor?: Role;
  /** The series' name written at its last value, in place of a legend. */
  endLabel?: string;
};

/** What a chart shows. */
export type ChartSpec = {
  kind: "columns" | "line";
  categories: string[];
  series: ChartSeries[];
  /** Column series stand on one another. */
  stacked?: boolean;
  /** The value range; absent: from the values, with zero for columns. */
  min?: number;
  max?: number;
  /** Alternative text: what the chart shows. */
  alt: string;
};

/** Where a drawn chart put its categories and values, so a slide can add a bracket or a note. */
export type ChartScale = { plot: Box; band: number; column: number; x: (category: number) => number; y: (value: number) => number };

const VALUE = 12;
const NAME = 11;
const LINE_HEIGHT = 1.35;
const MARK = 8;
/** The colours words are read in on a slide. */
const READS: Role[] = ["ink", "muted", "accent", "good", "bad"];

type Point = { x: number; y: number };

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Whether a line between two points runs through a box. */
function crosses(a: Point, b: Point, box: Box): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2) + 1;
  for (let k = 0; k <= steps; k++) {
    const x = a.x + ((b.x - a.x) * k) / steps;
    const y = a.y + ((b.y - a.y) * k) / steps;
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return true;
  }
  return false;
}

/** The width a name gets where every n-th category is named: one at either end may not reach past the chart. */
const nameRoom = (band: number, every: number) => (every === 1 ? band : (band * (every + 1)) / 2);

const plain = (words: string) => words.replaceAll("\u00a0", " ");

/** Which categories are named, every one or every n-th counted from the last, with each name's lines written in. */
function categoryNames(measure: Measure, names: string[], band: number): { every: number; lines: number; shown: [category: number, name: string][] } {
  for (let every = 1; ; every++) {
    const shown = [...names.entries()].filter(([i]) => (names.length - 1 - i) % every === 0);
    const wrapped = shown.map(([, name]) => measure.wrap(name, nameRoom(band, every) - 4, { size: NAME }));
    // A name is never cut inside a word: the words of its lines are the words of the name.
    const whole = wrapped.every((lines, i) => lines.length <= 2 && plain(lines.join(" ")) === plain(shown[i]![1]));
    // The last name alone always stands, cut where it must be.
    if (whole || every >= names.length) {
      const lines = Math.max(1, ...wrapped.map((l) => Math.min(2, l.length)));
      return { every, lines, shown: shown.map(([i, name]) => [i, measure.fit(name, nameRoom(band, every) - 4, { size: NAME }, 2)]) };
    }
  }
}

/** The range the values are drawn in. Columns start at zero, so their heights compare. */
function rangeOf(spec: ChartSpec, columns: ChartSeries[]): [number, number] {
  const known = spec.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const stacks = spec.stacked
    ? spec.categories.flatMap((_, i) => {
        const values = columns.map((s) => s.values[i] ?? 0);
        return [values.filter((v) => v > 0).reduce((a, b) => a + b, 0), values.filter((v) => v < 0).reduce((a, b) => a + b, 0)];
      })
    : [];
  const all = [...known, ...stacks, ...(columns.length ? [0] : [])];
  let low = all.length ? Math.min(...all) : 0;
  let high = all.length ? Math.max(...all) : 1;
  if (!columns.length) {
    const air = (high - low || Math.abs(high) || 1) * 0.1;
    low -= air;
    high += air;
  }
  low = spec.min ?? low;
  high = spec.max ?? high;
  return [low, high > low ? high : low + 1];
}

/** A chart's title above it: a mark in the accent, what is shown and its unit, on one line. */
export function chartTitle(pen: Pen, measure: Measure, at: { x: number; y: number; w: number }, words: string, unit: string): Obj[] {
  const setting = { size: 13, bold: true };
  const title = measure.fit(unit ? `${words}, ${unit}` : words, at.w - 12, setting, 1);
  return [
    pen.rect({ x: at.x, y: at.y + 3, w: 4, h: 14 }, "accent"),
    pen.text({ x: at.x + 12, y: at.y, w: at.w - 12, h: 20 }, [title], { ...setting, role: "chart-title", unit, wrap: false }),
  ];
}

/** Draws a chart into a box. */
export function drawChart(pen: Pen, measure: Measure, box: Box, spec: ChartSpec): { object: GroupObj; scale: ChartScale } {
  const kindOf = (s: ChartSeries) => s.as ?? spec.kind;
  const columns = spec.series.filter((s) => kindOf(s) === "columns");
  const count = Math.max(1, spec.categories.length);
  const labelHeight = Math.ceil(VALUE * LINE_HEIGHT);
  const ends = spec.series.filter((s) => s.endLabel);
  const endRoom = ends.length ? Math.min(box.w * 0.28, Math.max(...ends.map((s) => measure.columnFor([[s.endLabel!, { size: VALUE, bold: true }]], 10)))) : 0;
  const band = (box.w - endRoom) / count;
  const names = categoryNames(measure, spec.categories, band);
  const namesHeight = Math.ceil(names.lines * NAME * LINE_HEIGHT) + 6;
  const [low, high] = rangeOf(spec, columns);
  // Room above the highest value for its label, and below the lowest where one stands under a column or a point.
  const under = spec.series.some((s) => s.words && (kindOf(s) !== "columns" || s.values.some((v) => v !== null && v < 0))) ? labelHeight + 4 : 0;
  const plot: Box = { x: box.x, y: box.y + labelHeight + 6, w: box.w - endRoom, h: Math.max(1, box.h - labelHeight - 6 - under - namesHeight) };
  const x = (i: number) => plot.x + i * band + band / 2;
  const y = (v: number) => plot.y + plot.h - ((v - low) / (high - low)) * plot.h;
  const column = band * 0.62;

  const marks: Obj[] = [];
  const segments: [Point, Point][] = [];
  /** Columns, marks and points: a label stands beside them, never on them. */
  const solids: Box[] = [];
  const taken: Box[] = [];
  const labels: Obj[] = [];
  /** Writes a value at the first of these places that is free, if any is. `on` names a column it is written inside. */
  const place = (words: string, places: Box[], color: Role, bold: boolean, on?: Box) => {
    const free = places.find(
      (p) =>
        p.x >= box.x - 1 &&
        p.x + p.w <= box.x + box.w + 1 &&
        p.y >= box.y - 1 &&
        !taken.some((t) => overlaps(t, p)) &&
        !solids.some((t) => t !== on && overlaps(t, p)) &&
        !segments.some(([a, b]) => crosses(a, b, p)),
    );
    if (!free) return;
    taken.push(free);
    labels.push(pen.text(free, [words], { size: VALUE, line: LINE_HEIGHT, color, bold, align: "center", wrap: false }));
  };
  /** The box of a value label centred on a point, kept inside the chart. */
  const around = (words: string, centre: number, top: number, bold: boolean): Box => {
    const w = measure.columnFor([[words, { size: VALUE, bold }]], 2);
    return { x: Math.max(box.x, Math.min(centre - w / 2, box.x + box.w - w)), y: top, w, h: labelHeight };
  };
  /**
   * How a series' values are written. The order is the order they get a place in: the latest, the first, the highest and
   * the lowest before the others, from the latest back. Where values are too wide to stand side by side only those four
   * are written, so that a crowded chart does not name whichever happen to find room.
   */
  const labelling = (series: ChartSeries): { order: number[]; wordsAt: (category: number) => string | null } => {
    const known = series.values.flatMap((v, i) => (v === null ? [] : [{ v, i }]));
    const byValue = [...known].sort((a, b) => a.v - b.v);
    const keys = new Set([known[known.length - 1], known[0], byValue[byValue.length - 1], byValue[0]].flatMap((k) => (k ? [k.i] : [])));
    const order = [...new Set([...keys, ...known.map((k) => k.i).reverse()])];
    const words = series.words ?? [];
    const crowded = words.some((w) => w && measure.width(w, { size: VALUE }) > band + 4);
    return { order, wordsAt: (i) => (crowded && !keys.has(i) ? null : (words[i] ?? null)) };
  };

  // ---- columns
  const top = Array<number>(count).fill(0);
  const bottom = Array<number>(count).fill(0);
  const columnLabels: (() => void)[] = [];
  /** The middle of each series' latest column, where a series that stands in a stack is named. */
  const middles = new Map<ChartSeries, number>();
  for (const series of columns) {
    const { order, wordsAt } = labelling(series);
    for (const i of order) {
      const v = series.values[i]!;
      const from = spec.stacked ? (v >= 0 ? top[i]! : bottom[i]!) : Math.max(low, Math.min(0, high));
      const to = spec.stacked ? from + v : v;
      if (spec.stacked) (v >= 0 ? top : bottom)[i] = to;
      const [a, b] = [y(from), y(to)];
      const shape = { x: x(i) - column / 2, y: Math.min(a, b), w: column, h: Math.abs(b - a) };
      const words = wordsAt(i);
      marks.push(pen.rect(shape, series.pointColors?.[i] ?? series.color, { alt: `${spec.categories[i]}, ${series.name}: ${series.words?.[i] ?? v}` }));
      solids.push(shape);
      // The first drawn is the latest.
      if (!middles.has(series)) middles.set(series, shape.y + shape.h / 2);
      if (!words) continue;
      if (spec.stacked) {
        // Inside its part, where the part is tall and wide enough for it.
        const inside = around(words, x(i), shape.y + (shape.h - labelHeight) / 2, true);
        if (shape.h >= labelHeight + 2 && inside.w <= column) columnLabels.push(() => place(words, [inside], series.wordColor ?? "ink", true, shape));
      } else {
        const at = around(words, x(i), v >= 0 ? b - labelHeight - 3 : b + 3, i === count - 1);
        // Beyond the column's end or, where a target mark or a taller neighbour stands there, a little further.
        columnLabels.push(() => {
          const inWay = solids.filter((s) => overlaps(s, { ...at, y: at.y - labelHeight, h: labelHeight * 3 }));
          const beyond = v >= 0 ? Math.min(b, ...inWay.map((s) => s.y)) - labelHeight - 2 : Math.max(b, ...inWay.map((s) => s.y + s.h)) + 2;
          const near = Math.abs(beyond - at.y) <= labelHeight * 1.5;
          place(words, near ? [at, { ...at, y: beyond }] : [at], series.wordColor ?? "ink", i === count - 1);
        });
      }
    }
  }

  // ---- lines and marks
  const pointLabels: (() => void)[] = [];
  const endLabels: { words: string; at: number; color: Role }[] = [];
  for (const series of spec.series) {
    const as = kindOf(series);
    const points = Array.from({ length: count }, (_, i) => (series.values[i] === null || series.values[i] === undefined ? null : { x: x(i), y: y(series.values[i]!) }));
    const last = points.reduce<Point | null>((found, p) => p ?? found, null);
    // A name in a fill's own pale colour would not be read: it takes the ink.
    const named = (spec.stacked ? middles.get(series) : undefined) ?? last?.y;
    if (series.endLabel && named !== undefined) endLabels.push({ words: series.endLabel, at: named, color: READS.includes(series.color) ? series.color : "ink" });
    if (as === "columns") continue;
    if (as === "line") {
      const known = points.filter((p) => p !== null);
      const level = known.length > 1 && known.every((p) => p.y === known[0]!.y);
      // A level line is one line, so that its dashes run through.
      const pairs = level ? [[known[0]!, known[known.length - 1]!] as const] : points.slice(1).map((p, i) => [points[i]!, p] as const);
      for (const [a, b] of pairs) {
        if (!a || !b) continue;
        segments.push([a, b]);
        marks.push(pen.line([a.x, a.y], [b.x, b.y], { color: series.color, width: series.dash ? 1.5 : 2.5, dash: series.dash }));
      }
    }
    const { order, wordsAt } = labelling(series);
    for (const i of order) {
      const p = points[i]!;
      const words = wordsAt(i);
      const alt = `${spec.categories[i]}, ${series.name}: ${series.words?.[i] ?? series.values[i]}`;
      // A dashed line is a level to read against: it gets no points of its own.
      if (as === "marks" || !series.dash) {
        const solid = as === "marks" ? { x: p.x - column * 0.42, y: p.y - 1.5, w: column * 0.84, h: 3 } : { x: p.x - MARK / 2, y: p.y - MARK / 2, w: MARK, h: MARK };
        marks.push(pen.shape(as === "marks" ? "rect" : "ellipse", solid, { fill: series.color, alt }));
        solids.push(solid);
      }
      if (!words) continue;
      const bold = i === count - 1;
      const above = around(words, p.x, p.y - MARK / 2 - labelHeight - 1, bold);
      const below = around(words, p.x, p.y + MARK / 2 + 1, bold);
      // A point lower than both its neighbours is named below itself, so the lines do not run through the name.
      const lowest = [points[i - 1], points[i + 1]].every((q) => !q || q.y <= p.y) && Boolean(points[i - 1] || points[i + 1]);
      // Where the lines run through both, beside the point: above or below it, to the side the lines leave free.
      const beside = [above, below].flatMap((at) => [at.w / 2 + 3, -at.w / 2 - 3].map((step) => ({ ...at, x: at.x + step })));
      pointLabels.push(() => place(words, [...(lowest ? [below, above] : [above, below]), ...beside], series.wordColor ?? "ink", bold));
    }
  }

  // The names at the ends first, spread so none stands on another; then the values, which give way to them.
  endLabels.sort((a, b) => a.at - b.at);
  const spread = endLabels.map((e) => {
    const words = measure.fit(e.words, endRoom - 6, { size: VALUE, bold: true }, 2);
    return { ...e, words, h: labelHeight * words.split("\n").length };
  });
  let free = box.y;
  let below = spread.reduce((sum, e) => sum + e.h, 0);
  for (const e of spread) {
    const at = Math.min(Math.max(e.at - e.h / 2, free), plot.y + plot.h - below);
    free = at + e.h;
    below -= e.h;
    const spot = { x: plot.x + plot.w + 6, y: at, w: endRoom - 6, h: e.h };
    taken.push(spot);
    labels.push(pen.text(spot, [e.words], { size: VALUE, line: LINE_HEIGHT, color: e.color, bold: true }));
  }
  for (const write of [...columnLabels, ...pointLabels]) write();

  if (columns.length) marks.push(pen.line([plot.x, y(Math.max(low, Math.min(0, high)))], [plot.x + plot.w, y(Math.max(low, Math.min(0, high)))], { color: "muted" }));
  for (const [i, name] of names.shown) {
    const wide = band * names.every;
    const [start, end] = [x(i) - wide / 2, x(i) + wide / 2];
    const edge = names.every > 1 && (start < plot.x || end > plot.x + plot.w);
    const w = edge ? (band * (names.every + 1)) / 2 : wide;
    const left = edge ? (start < plot.x ? plot.x : plot.x + plot.w - w) : start;
    const align = edge ? (start < plot.x ? "left" : "right") : "center";
    labels.push(pen.text({ x: left + 2, y: plot.y + plot.h + under + 6, w: w - 4, h: namesHeight - 6 }, [name], { size: NAME, line: LINE_HEIGHT, color: "muted", align }));
  }

  return { object: pen.group("Chart", spec.alt, [...marks, ...labels]), scale: { plot, band, column, x, y } };
}
