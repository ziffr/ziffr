// The heatmap mark of a View Design (GLOSSARY: View Design, Period): where each period of one Metric sits in a grid, and
// how dark it is, worked out once so the widget, a Snapshot, a View Link and a deck's picture show the same grid. The view
// only turns it into squares. Pure: it reads the points it is given and nothing else.
//
// Honest rules, said under the grid (`caption`) and in its text alternative (`alt`):
// - Colour is the lightness of the data tone only, in HEAT_STEPS steps by a value's rank among the drawn values.
//   Darker is a higher value, never a better one: this is a pattern view, and colour means on or off target nowhere here.
// - A period with no value is an empty outline, never a 0 and never the lightest step. A place that is no period (a day
//   after the newest, week 53 of a year that has 52) is not drawn at all.
// - A constant series has no range to rank: every cell is one step and the caption says so.
import { addDays, format, getISOWeek, getISOWeekYear, parseISO, startOfISOWeek } from "date-fns";
import { periodLabel, periodStart, shiftPeriod } from "./periods";
import { windowProblem } from "./polar-marks";
import type { Period, YearStart } from "./types";

/** How many shades the scale has, from the lightest to the darkest. */
export const HEAT_STEPS = 5;
/** What the window counts when it is left at its default (26): weeks of a daily Metric, but years of the others. */
export const HEAT_DEFAULT_WINDOW = 26;
/** How many years a weekly and a monthly heatmap show at the default window. */
export const HEAT_DEFAULT_YEARS: Record<"week" | "month", number> = { week: 3, month: 5 };
/** The most years of rows a heatmap draws: more cannot be read. */
export const HEAT_MAX_YEARS = 20;
/** The weekdays as rows, Monday first as ISO weeks start. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** One period of the grid: its value (null when it has none), its step (null when it has no value), and its words. */
export type HeatCell = { period: string; value: number | null; step: number | null; label: string; text: string | null };
/** One row: its name and its places in order, a place that is no period null. */
export type HeatRow = { label: string; cells: (HeatCell | null)[] };
/** What a heatmap draws: columns, rows, the legend and its words, or why it draws nothing. */
export type HeatmapModel =
  | { ok: true; by: "day" | "week" | "month"; columns: string[]; rows: HeatRow[]; legend: { low: string; high: string; text: string } | null; caption: string; alt: string }
  | { ok: false; reason: string };

/** What the model is given. `points` are the Metric's own values (a value that is not a number counts as none). */
export type HeatmapInput = {
  name: string;
  by: Period;
  points: { period: string; value: number }[];
  yearStart: YearStart;
  /** The setting "window": weeks of a daily Metric, years of a weekly or monthly one. */
  window: number;
  lowerIsBetter: boolean;
  write: (value: number) => string;
};

/**
 * The step (0 to HEAT_STEPS - 1) of each value by its rank among all of them: a value takes the middle of the ranks it
 * shares, so equal values always share a step and a higher value never has a lower one. A constant series is one step, the
 * middle, with `constant` set; nothing gives no steps.
 */
export function quantileSteps(values: number[]): { steps: number[]; constant: boolean } {
  if (values.length === 0) return { steps: [], constant: false };
  if (values.every((v) => v === values[0])) return { steps: values.map(() => Math.floor(HEAT_STEPS / 2)), constant: true };
  const sorted = [...values].sort((a, b) => a - b);
  const first = new Map<number, number>();
  const count = new Map<number, number>();
  sorted.forEach((v, i) => {
    if (!first.has(v)) first.set(v, i);
    count.set(v, (count.get(v) ?? 0) + 1);
  });
  const steps = values.map((v) => {
    const q = (first.get(v)! + count.get(v)! / 2) / values.length;
    return Math.min(HEAT_STEPS - 1, Math.floor(q * HEAT_STEPS));
  });
  return { steps, constant: false };
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

// A place of the grid before it has a value or a step.
type Place = { period: string; label: string } | null;
type Layout = { by: "day" | "week" | "month"; columns: string[]; rows: { label: string; places: Place[] }[]; clamped: boolean };

/** Where the periods sit: rows of places, in the grid of the Metric's own period. Needs the newest period with a value. */
function layout(input: HeatmapInput, by: "day" | "week" | "month", newest: string): Layout | string {
  const { yearStart, window } = input;
  const named = (p: string) => periodLabel(p, by, yearStart, false);
  if (by === "day") {
    // Columns are the weeks that end with the newest day's, oldest first; rows are Monday to Sunday.
    const lastWeek = periodStart(newest, "week", yearStart);
    const weeks = Array.from({ length: window }, (_, k) => shiftPeriod(lastWeek, "week", k - (window - 1)));
    const columns = weeks.map((w) => (parseISO(w).getDate() <= 7 ? format(parseISO(w), "MMM") : ""));
    const rows = WEEKDAYS.map((label, d) => ({
      label,
      places: weeks.map((w): Place => {
        const day = shiftPeriod(w, "day", d);
        return day > newest ? null : { period: day, label: named(day) };
      }),
    }));
    return { by, columns, rows, clamped: false };
  }
  const defaulted = window === HEAT_DEFAULT_WINDOW ? HEAT_DEFAULT_YEARS[by] : window;
  const years = Math.min(defaulted, HEAT_MAX_YEARS);
  const clamped = defaulted > HEAT_MAX_YEARS;
  if (by === "week") {
    // Rows are ISO years, columns ISO weeks 1 to 53; week 53 exists only in a year that has one.
    const endYear = getISOWeekYear(parseISO(newest));
    const rows = Array.from({ length: years }, (_, k) => {
      const year = endYear - (years - 1) + k;
      const week1 = startOfISOWeek(new Date(year, 0, 4));
      return {
        label: String(year),
        places: Array.from({ length: 53 }, (_, w): Place => {
          const monday = iso(addDays(week1, 7 * w));
          if (getISOWeekYear(parseISO(monday)) !== year || monday > newest) return null;
          return { period: monday, label: `${named(monday)} (week ${getISOWeek(parseISO(monday))})` };
        }),
      };
    });
    return { by, columns: Array.from({ length: 53 }, (_, w) => String(w + 1)), rows, clamped };
  }
  // Rows are the Workspace's years, columns its twelve months from the year start.
  const lastYear = periodStart(newest, "year", yearStart);
  const starts = Array.from({ length: years }, (_, k) => shiftPeriod(lastYear, "year", k - (years - 1)));
  const rows = starts.map((s) => ({
    label: periodLabel(s, "year", yearStart, true),
    places: Array.from({ length: 12 }, (_, j): Place => {
      const month = shiftPeriod(s, "month", j);
      return month > newest ? null : { period: month, label: named(month) };
    }),
  }));
  const columns = Array.from({ length: 12 }, (_, j) => format(parseISO(shiftPeriod(starts[0], "month", j)), "MMM"));
  return { by, columns, rows, clamped };
}

/** The grid a Metric's periods make, each shaded by its value, or why there is none. */
export function heatmapModel(input: HeatmapInput): HeatmapModel {
  const by = input.by;
  if (by !== "day" && by !== "week" && by !== "month") return { ok: false, reason: "A heatmap needs a Metric by day, week or month." };
  const problem = windowProblem(input.window);
  if (problem) return { ok: false, reason: problem };
  const values = new Map<string, number>();
  for (const p of input.points) if (Number.isFinite(p.value)) values.set(p.period, p.value);
  const newest = [...values.keys()].sort().pop();
  if (!newest) return { ok: false, reason: `${input.name} has no values to draw yet.` };
  const grid = layout(input, by, newest);
  if (typeof grid === "string") return { ok: false, reason: grid };

  // Steps are ranked among the values that are drawn (those inside the grid), nothing else.
  const drawn = grid.rows.flatMap((r) => r.places).flatMap((p) => (p && values.has(p.period) ? [{ ...p, value: values.get(p.period)! }] : []));
  if (drawn.length === 0) return { ok: false, reason: `${input.name} has no values in the periods shown.` };
  const { steps, constant } = quantileSteps(drawn.map((d) => d.value));
  const stepOf = new Map(drawn.map((d, i) => [d.period, steps[i]]));
  let rows: HeatRow[] = grid.rows.map((r) => ({
    label: r.label,
    cells: r.places.map((p): HeatCell | null => {
      if (!p) return null;
      const value = values.get(p.period);
      return value === undefined ? { period: p.period, value: null, step: null, label: p.label, text: null } : { period: p.period, value, step: stepOf.get(p.period)!, label: p.label, text: input.write(value) };
    }),
  }));
  // Before the Metric had a value there is nothing to compare: leading weeks (daily) or years (the others) with no value are not drawn.
  const has = (c: HeatCell | null) => !!c && c.value !== null;
  let columns = grid.columns;
  if (grid.by === "day") {
    const from = Math.max(0, columns.findIndex((_, j) => rows.some((r) => has(r.cells[j]))));
    columns = columns.slice(from);
    rows = rows.map((r) => ({ ...r, cells: r.cells.slice(from) }));
  } else {
    rows = rows.slice(Math.max(0, rows.findIndex((r) => r.cells.some(has))));
  }
  const span = grid.by === "day" ? `${count(columns.length, "week")}, ${rows[0].cells[0]!.label} to ${periodLabel(newest, "day", input.yearStart, false)}` : `${count(rows.length, "year")}, ${rows[0].label} to ${rows[rows.length - 1].label}`;
  const empty = rows.flatMap((r) => r.cells).filter((c) => c && c.value === null).length;

  const byValue = [...drawn].sort((a, b) => b.value - a.value || a.period.localeCompare(b.period));
  const lowest = [...drawn].sort((a, b) => a.value - b.value || a.period.localeCompare(b.period));
  const high = byValue[0].value;
  const low = lowest[0].value;
  const legend = constant ? null : { low: input.write(low), high: input.write(high), text: `lowest ${input.write(low)} to highest ${input.write(high)}` };
  const caption = [
    input.lowerIsBetter ? "Darker is a higher value, not a better one." : "Darker is a higher value.",
    constant ? "All values are the same." : "",
    empty ? `An empty square has no value (${count(empty, "period")}).` : "",
    grid.clamped ? `Showing the latest ${HEAT_MAX_YEARS} years.` : "",
  ].filter(Boolean).join(" ");
  const five = (list: typeof drawn) => list.slice(0, 5).map((c) => `${c.label} ${input.write(c.value)}`).join("; ");
  const alt = [
    `Heatmap of ${input.name} by ${input.by}, ${span}, shaded by value in ${HEAT_STEPS} steps.`,
    legend ? `Lightest is the lowest value, ${legend.low}; darkest is the highest, ${legend.high}.` : `Every value is ${input.write(high)}.`,
    ...(constant ? [] : [`Highest: ${five(byValue)}.`, `Lowest: ${five(lowest)}.`]),
    caption,
  ].join(" ");
  return { ok: true, by: grid.by, columns, rows, legend, caption, alt };
}
