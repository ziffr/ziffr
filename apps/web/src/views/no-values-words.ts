// What stands where a Widget's view or a chart has no value to draw (GLOSSARY: Widget, View, Submitter). No "use client":
// the Metric's page, drawn on the server, says the same words as the cards.
import type { Metric } from "@ziffr/core/types";

/** What is said to someone who is offered no way to record a value. */
export const NOTHING_TO_SHOW = "No values to show yet.";

const AFTER_FIRST: Record<string, string> = { line: "The line appears", bars: "The bars appear", number: "The number appears", gauge: "The gauge appears", table: "The table appears" };

/** What is said to someone who submits the Metric, naming the view by its template. */
export const firstValueWords = (template: string) => `${AFTER_FIRST[template] ?? "The chart appears"} after your first value.`;

/** The button's words: a daily Metric is asked about today. */
export const recordLabel = (period: Metric["period"]) => (period === "day" ? "Record today's value" : "Record a value");
