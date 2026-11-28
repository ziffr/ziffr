// A deck Ziffr made, drawn for the screen (GLOSSARY: Deck, Deck Description, Slide, Theme; spec 0069): from what the
// core's readDeck answered, which holds only the slides and numbers this person may see, to the drawing the viewer shows.
// Visibility: reads nothing but its argument. Pure, so a page and its tests can call it anywhere.
import type { ReadDeck } from "@ziffr/core/deck-read";
import { drawDeck, type DeckDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import { periodLabel } from "@ziffr/core/periods";
import { themeFor } from "@ziffr/core/themes";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The latest period any of the slides' Metrics has a value for, written as the period of the first of them. */
function periodOf(read: ReadDeck): string {
  const first = read.data.metrics[0];
  const latest = read.data.metrics.flatMap((m) => (read.data.series[m.slug] ?? []).map((p) => p.period)).sort().at(-1);
  return first && latest ? periodLabel(latest, first.period, read.data.yearStart) : "";
}

/** The drawing of every slide of a deck as one person is sent it, or null when the Workspace has no Theme to draw in. */
export function drawMadeDeck(read: ReadDeck, now: Date = new Date()): DeckDrawing | null {
  const theme = themeFor(read.data.themes, read.deck.themeId);
  if (!theme) return null;
  const { description } = read.deck;
  return drawDeck({
    name: read.deck.name,
    design: description.design,
    emphasis: description.emphasis,
    slides: description.slides,
    data: read.data,
    theme: { tokens: theme.tokens, slides: theme.slides },
    footer: read.deck.footer,
    period: periodOf(read),
    date: DAY.format(now),
    today: now.toISOString().slice(0, 10),
  });
}
