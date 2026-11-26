// What each shape of a slide that keeps numbers draws (spec 0061; GLOSSARY: Snapshot Part, Slide, Deck): the
// Snapshot's numbers as the core answered them for this viewer, or the words that stand in their place. Pure, so the
// editor, presenting and both exports say the same.
// Visibility: nothing here is ever filled from the live data; only the Theme's colours come from it.
import type { KeptSnapshot, ShareGap } from "@ziffr/core/deck-snapshots";
import { formatDate } from "@ziffr/core/format";
import type { KeptRequest, KeptShape } from "@ziffr/core/snapshot-parts";
import type { CanvasData, Widget, WidgetSettings } from "@ziffr/core/types";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";

/** What was asked of the core for a deck and what it answered; `failed` when the last ask did not come back. */
export type Kept = { asked: KeptRequest[]; read: KeptSnapshot[]; failed?: boolean };

/** One Snapshot as the viewer gets it. */
export type ShownKept = Extract<KeptSnapshot, { state: "shown" }>;

/** The sentences said where a viewer gets no numbers. */
export const KEPT_WORDS = {
  part: "This part is not available to you.",
  deleted: "This Snapshot was deleted.",
  numbers: "These numbers are not shown to you: this slide keeps a Snapshot's numbers.",
  several: "This slide holds parts of two Snapshots. Move this to a slide of one to see numbers.",
  failed: "The Snapshot's numbers could not be loaded. Reload the page.",
  corrected: "Corrected since: see the Snapshot",
} as const;

/** The line that says whose numbers a part or a slide keeps. */
export const keptLine = (s: Pick<ShownKept, "takenAt" | "name" | "label">) => `Numbers as of ${formatDate(s.takenAt)} · ${s.name}, ${s.label}`;

/** What a slide of a deck made from a Snapshot before decks kept numbers says (`end`, its period's last day). */
export const liveLine = (end: string) => `Live numbers, periods up to ${formatDate(end)}`;

/** What a kept shape draws: still asking, words in place of numbers, or the numbers; `widget` is a part's own (null
 * for the opening part and for a shape that brings its own). */
export type KeptDrawing =
  | { state: "loading" }
  | { state: "notice"; words: string }
  | { state: "shown"; snapshot: ShownKept; data: CanvasData; widget: Widget | null; corrected: boolean };

const notice = (words: string): KeptDrawing => ({ state: "notice", words });

/** Whether everything `want` asks of a Snapshot was asked. */
function asks(asked: readonly KeptRequest[], want: KeptRequest): boolean {
  const had = asked.find((a) => a.snapshotId === want.snapshotId);
  return Boolean(had) && want.parts.every((p) => had!.parts.includes(p)) && want.metricIds.every((m) => had!.metricIds.includes(m));
}

/** Whether `kept` has asked the core everything the deck draws now. */
export const asksAll = (kept: Kept, requests: readonly KeptRequest[]) => requests.every((r) => asks(kept.asked, r));

/** What one kept shape draws, from what the core answered. `live` lends the Themes only. */
export function keptDrawing(shape: KeptShape, kept: Kept | null, live: Pick<CanvasData, "themes">): KeptDrawing {
  const isPart = shape.part !== null;
  const unavailable = notice(isPart ? KEPT_WORDS.part : KEPT_WORDS.numbers);
  if (shape.snapshotId === null) return notice(isPart ? KEPT_WORDS.part : KEPT_WORDS.several);
  if (!kept) return unavailable;
  const answer = kept.read.find((s) => s.snapshotId === shape.snapshotId);
  const want = { snapshotId: shape.snapshotId, parts: isPart ? [shape.part!] : [], metricIds: shape.metricIds };
  if (!answer || !asks(kept.asked, want)) return kept.failed ? notice(KEPT_WORDS.failed) : { state: "loading" };
  if (answer.state === "deleted") return notice(KEPT_WORDS.deleted);
  if (answer.state !== "shown") return unavailable;
  const part = isPart ? answer.parts.find((p) => p.part === shape.part) : undefined;
  if (isPart && !part) return unavailable;
  const widget = part?.widget ?? null;
  const needed = widget ? widgetMetricIds(widget.metric_ids ?? [], widget.settings) : shape.metricIds;
  // A shape is drawn whole or not at all: a title or a Slot can name a Metric the viewer does not get.
  if (!needed.every((id) => answer.data.metrics.some((m) => m.id === id))) return unavailable;
  return { state: "shown", snapshot: answer, data: { ...answer.data, themes: live.themes }, widget, corrected: needed.some((id) => answer.corrected.includes(id)) };
}

/** What a Widget or Slide Element of a slide is drawn from: the data and settings, or words (null while asking). */
export type OnSlide = { data: CanvasData; settings: WidgetSettings; kept: boolean } | { words: string | null };

/** The one place that decides it, for the editor, presenting and the exports: a shape that keeps no numbers is drawn
 * from the live data; one that does only ever from what the core answered, never from the live data. */
export function onSlide(shape: KeptShape | undefined, kept: Kept | null, live: CanvasData, settings: WidgetSettings): OnSlide {
  if (!shape) return { data: live, settings, kept: false };
  const drawing = keptDrawing(shape, kept, live);
  if (drawing.state !== "shown") return { words: drawing.state === "notice" ? drawing.words : null };
  // Its day (spec 0013) cuts nothing here: the Snapshot already did.
  const rest = { ...settings };
  delete rest.asOf;
  return { data: drawing.data, settings: rest, kept: true };
}

/** The Metrics whose live series an export fetches first: those of the Widgets that keep no numbers. */
export function liveMetricIds(widgets: readonly { id: string; metricIds: readonly number[] }[], kept: ReadonlyMap<string, unknown>): number[] {
  return [...new Set(widgets.filter((w) => !kept.has(w.id)).flatMap((w) => w.metricIds))];
}

/** The lines under a slide's own numbers: whose numbers its Widgets and Slide Elements keep, and whether one was
 * corrected since. `shapes` are the slide's kept shapes; a part says its own line, so none is repeated for it. */
export function keptSlideLines(shapes: readonly KeptShape[], kept: Kept | null, live: Pick<CanvasData, "themes">): string[] {
  const lines = new Map<number, boolean>();
  const said = new Map<number, ShownKept>();
  for (const shape of shapes) {
    if (shape.part !== null) continue;
    const d = keptDrawing(shape, kept, live);
    if (d.state !== "shown") continue;
    said.set(d.snapshot.snapshotId, d.snapshot);
    lines.set(d.snapshot.snapshotId, d.corrected || (lines.get(d.snapshot.snapshotId) ?? false));
  }
  return [...said].map(([id, s]) => (lines.get(id) ? `${keptLine(s)} · ${KEPT_WORDS.corrected}` : keptLine(s)));
}

const partCount = (n: number) => (n === 1 ? "1 Snapshot Part" : `${n} Snapshot Parts`);

/** What one person or Group will not see of a deck's Snapshots, as its owner reads it before sharing. */
export function leftOutWords(gaps: readonly ShareGap[]): string {
  const each = gaps.map((g, i) => `${i === 0 ? partCount(g.count) : g.count} (${g.from})`);
  const list = each.length > 1 ? `${each.slice(0, -1).join(", ")} and ${each.at(-1)}` : each[0];
  return `Cannot see ${list}. Ask ${gaps.length === 1 ? "the dashboard's owner" : "each dashboard's owner"} to share it.`;
}

/** The requests of a deck with one more Snapshot's parts, as when it is being added. */
export function withParts(requests: readonly KeptRequest[], snapshotId: number, parts: readonly number[]): KeptRequest[] {
  const had = requests.find((r) => r.snapshotId === snapshotId) ?? { snapshotId, parts: [], metricIds: [] };
  return [...requests.filter((r) => r.snapshotId !== snapshotId), { ...had, parts: [...new Set([...had.parts, ...parts])] }];
}
