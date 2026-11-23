// How a View Design goes into a PowerPoint deck (GLOSSARY: View Design, Snapshot): what PowerPoint can draw as its own
// editable object is drawn natively, everything else becomes a picture of the widget as the app draws it.
import type { Part, PlotMark, ViewDesign } from "./view-design";
import type { WidgetSettings } from "./types";

/** What a design becomes in PowerPoint: a native line or bar chart, a number as text, a table, or a picture. */
export type NativeForm = "line" | "bar" | "number" | "table" | "picture";

// Marks a native chart leaves out, as it always has: the target band and line, and the forecast. A design whose
// forecast is the point (its words say what is expected) has those words left over, so it becomes a picture.
const LEFT_OUT: PlotMark["show"][] = ["target", "target.line", "forecast", "forecast.range"];
// Words that only say which period and status the number has: PowerPoint gets them as text with the number.
const BESIDE_NUMBER = new Set(["latest.period", "latest.status", "latest.approval"]);

/** The native form a design takes in PowerPoint with these settings: decided by its marks, never by its name. */
export function nativeForm(d: ViewDesign, settings: WidgetSettings): NativeForm {
  const on = (k: "showTarget" | "showForecast") => settings[k] ?? d.options?.[k]?.default ?? k === "showTarget";
  // Whether a part is drawn with these settings; what depends on the data counts as drawn.
  const drawn = (p: { when?: string[] }) => (p.when ?? []).every((f) => (f === "showTarget" || f === "showForecast" ? on(f) : true));
  const flat = (parts: Part[]): Part[] => parts.filter(drawn).flatMap((p) => (p.mark === "group" ? flat(p.parts) : [p]));
  const parts = flat(d.parts).filter((p) => !(p.mark === "text" && p.style === "note") && !(p.mark === "plot" && p.axes === "none"));
  if (parts.length === 1 && parts[0].mark === "rows" && parts[0].show === "values") return "table";
  if (parts.length === 1 && parts[0].mark === "plot" && parts[0].x !== "value") {
    // A range is never left out: PowerPoint has no chart that draws it, so a design that has one becomes a picture.
    const marks = parts[0].marks.filter(drawn).filter((k) => k.mark === "range" || !LEFT_OUT.includes(k.show));
    if (marks.length === 1 && marks[0].show === "values") return marks[0].mark === "line" ? "line" : marks[0].mark === "bar" ? "bar" : "picture";
    return "picture";
  }
  const pieces = parts.flatMap((p) => (p.mark === "text" ? p.content : [null]));
  if (pieces.length && pieces.every((c) => c !== null && (typeof c === "string" || c.show === "latest.value" || BESIDE_NUMBER.has(c.show))) && pieces.some((c) => typeof c !== "string" && c?.show === "latest.value")) return "number";
  return "picture";
}
