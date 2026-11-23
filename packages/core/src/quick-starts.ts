// The quick starts of the Analysis Canvas (GLOSSARY: Analysis Canvas, Method, Recipe; ticket #988): the four tiles that offer an
// Analysis by how many Metrics are on the canvas, and the Recipe chips, as one list. "Choose a method" (method-picker.ts) is the
// front door; a tile or a chip is a shortcut into it, so each names the picker entry it is a shortcut for, and a test fails for one
// that does not (and for an entry that declares a presentation no quick start has). Two tiles show a canvas widget of their own
// (Drivers, the Correlation matrix) that the picker does not offer as a Method; they say so with `entry: null`, and why.
// Pure data, so the screen can import it.
import type { EntryId } from "./method-picker";

/** Which widget template a quick start runs on the canvas. */
export type QuickTemplate = "forecast" | "correlation" | "drivers" | "matrix" | "did-it-work";

/** One shortcut: a tile (offered by what is on the canvas) or a chip (a ready-made question). */
export type QuickStart = {
  id: string;
  kind: "tile" | "chip";
  label: string;
  /** A tile's one line. */
  blurb?: string;
  /** The picker entry this is a shortcut for, or null for a canvas widget the picker does not offer as a Method. */
  entry: EntryId | null;
  /** Why there is no entry: required when `entry` is null. */
  because?: string;
  template: QuickTemplate;
};

/** Every tile and chip, in the order shown. */
export const QUICK_STARTS: readonly QuickStart[] = [
  { id: "tile-forecast", kind: "tile", label: "Forecast", blurb: "Project each metric a few periods ahead.", entry: "forecast", template: "forecast" },
  { id: "tile-correlation", kind: "tile", label: "Correlation", blurb: "Do these two move together?", entry: "correlation", template: "correlation" },
  { id: "tile-drivers", kind: "tile", label: "Drivers", entry: "moves", template: "drivers" },
  { id: "tile-matrix", kind: "tile", label: "Correlation matrix", blurb: "Every pair at once.", entry: null, because: "a table of every pair at once is a canvas widget, not one question", template: "matrix" },
  { id: "chip-cost", kind: "chip", label: "What drives Cost?", entry: "moves", template: "drivers" },
  { id: "chip-heading", kind: "chip", label: "Where is Revenue heading?", entry: "forecast", template: "forecast" },
  { id: "chip-target", kind: "chip", label: "Will we reach the Target?", entry: "reach-target", template: "forecast" },
  { id: "chip-did-it-work", kind: "chip", label: "Did it work?", entry: "after-date", template: "did-it-work" },
  { id: "chip-tickets", kind: "chip", label: "Do support tickets drive returns?", entry: "correlation", template: "correlation" },
];

/** What the picker does not offer, each in one plain line with the reason in words. */
export const NOT_OFFERED_LINES: readonly string[] = [
  "Clustering is not offered: groups found by a program cannot be said in a sentence without being wrong.",
];
