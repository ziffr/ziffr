// The two Deck Designs (spec 0069; GLOSSARY: Deck Design): where the regions of every slide are. A design names no
// colour and no font. `band` has a headline band across the top; `column` a side column at the left. Pure.
import type { Box } from "./objects";

/** The id of a Deck Design. */
export type DeckDesignId = "band" | "column";

/** The places of one form of a content slide. */
export type Form = {
  /** The design's coloured area. */
  panel: Box;
  /** The section line: left, top and width. */
  tracker: { x: number; y: number; w: number };
  title: Box;
  /** Where a slide's content stands. */
  body: Box;
  /** Where the so-what stands: a column left of the content, the side panel, or columns under the content. */
  aside: "lead" | "panel" | "row";
  /** The lead column's place, where the form has one. */
  lead?: Box;
  /** The footer: its left edge and width, from the rule above it. */
  footer: { x: number; w: number };
  /** The largest box the Theme's logo gets, and whether it stands on the panel. */
  logo: Box & { onPanel?: boolean };
};

/** One Deck Design, as data. */
export type Design = {
  id: DeckDesignId;
  /** The cover's form: a panel across the top, or a column at the left. */
  cover: { panel: Box; logo: Box };
  /** The form of a slide with a so-what beside it. */
  full: Form;
  /** The form of a slide whose content takes the width. */
  wide: Form;
};

const bandTitle: Box = { x: 64, y: 40, w: 1152, h: 74 };
const bandCommon = {
  panel: { x: 0, y: 0, w: 1280, h: 128 },
  tracker: { x: 64, y: 16, w: 1152 },
  title: bandTitle,
  footer: { x: 64, w: 1152 },
  logo: { x: 1048, y: 673, w: 112, h: 22 },
};

/** The two designs. */
export const DECK_DESIGNS: Record<DeckDesignId, Design> = {
  band: {
    id: "band",
    cover: { panel: { x: 0, y: 0, w: 1280, h: 440 }, logo: { x: 64, y: 48, w: 140, h: 30 } },
    full: { ...bandCommon, body: { x: 360, y: 152, w: 856, h: 498 }, aside: "lead", lead: { x: 64, y: 152, w: 264, h: 498 } },
    wide: { ...bandCommon, body: { x: 64, y: 152, w: 1152, h: 498 }, aside: "row" },
  },
  column: {
    id: "column",
    cover: { panel: { x: 0, y: 0, w: 360, h: 720 }, logo: { x: 48, y: 48, w: 140, h: 30 } },
    full: {
      panel: { x: 0, y: 0, w: 360, h: 720 },
      tracker: { x: 408, y: 20, w: 808 },
      title: { x: 408, y: 44, w: 808, h: 74 },
      body: { x: 408, y: 140, w: 808, h: 510 },
      aside: "panel",
      footer: { x: 408, w: 808 },
      logo: { x: 48, y: 668, w: 120, h: 24, onPanel: true },
    },
    wide: {
      panel: { x: 0, y: 0, w: 40, h: 720 },
      tracker: { x: 88, y: 20, w: 1128 },
      title: { x: 88, y: 44, w: 1128, h: 74 },
      body: { x: 88, y: 140, w: 1128, h: 510 },
      aside: "row",
      footer: { x: 88, w: 1128 },
      logo: { x: 1048, y: 673, w: 112, h: 22 },
    },
  },
};
