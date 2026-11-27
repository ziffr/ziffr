// What a slide type is (spec 0069; GLOSSARY: Slide, Slide Type): two pure steps, `fill` (what the slide says, from the
// data) and `draw` (where it says it, inside the region its Deck Design gives). One file per slide type in `slides/`.
// Visibility: `fill` may read only the Metrics the slide lists, from data already cut to what the viewer sees (the
// core's readDeck); drawing adds nothing of its own. Pure.
import type { CanvasData } from "../types";
import type { Design } from "./designs";
import type { Measure } from "./measure";
import type { Box, Obj, Pen } from "./objects";

/**
 * What a drawing reads of one slide of a deck's description (`ziffr.deck/1`, spec 0069). The checked
 * `SlideDescription` of `@ziffr/pack` fits it.
 */
export type SlideSource = {
  id: string;
  type: string;
  metrics: number[];
  options: Record<string, unknown>;
  /** The person's own headline; null for Ziffr's. */
  headline: string | null;
  hidden?: boolean;
  answers?: { question: string; text: string; writtenOn: string | null }[];
};

/** One line of the cover's agenda: a section and the headline that opens it. */
export type AgendaEntry = { section: string; headline: string };

/** What a slide knows of its deck. `agenda` is filled for the cover only, from the other slides' headlines. */
export type DeckFacts = {
  name: string;
  /** The period the deck is about, in words ("Third quarter 2026"). */
  period: string;
  /** The day it shows, in words. */
  date: string;
  /** The Theme's or the deck's footer words. */
  footer: string;
  agenda: AgendaEntry[];
};

/** A so-what beside the content: short points, and one large figure. */
export type Aside = { heading?: string; points?: { lead: string; words: string }[]; figure?: { value: string; words: string } };

type Filled = {
  /** Ziffr's headline. The person's own, where given, takes its place. */
  headline: string;
  /** Where the numbers come from, without "Source:". */
  source: string;
};

/** What `fill` gives: the content to draw, or, where the data cannot carry the slide, the sentence that says why. */
export type SlideFill<Content> =
  // `note` stands above the source line: what a reader must know to read the figures.
  | (Filled & { note?: string; aside?: Aside; content: Content })
  | (Filled & { cannot: string });

/** The room a slide type draws in, with the design it is drawn in and the slide's pen and measures. */
export type Region = Box & { design: Design; pen: Pen; measure: Measure };

/** One slide type. */
export type SlideType<Content = unknown> = {
  /** The name a description gives it. */
  id: string;
  /** The section the tracker and the agenda put it in. */
  section: string;
  /** False: the cover's agenda does not name it. */
  agenda?: false;
  /** The cover: its region is the whole slide, and it gets no headline, tracker or footer from the frame. */
  cover?: true;
  /** True: the content needs the design's wide form, and a so-what stands under it. */
  wide?: boolean;
  fill(slide: SlideSource, data: CanvasData, deck: DeckFacts): SlideFill<Content>;
  draw(content: Content, region: Region): Obj[];
};
