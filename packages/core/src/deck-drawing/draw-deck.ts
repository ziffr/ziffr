// Drawing a deck (spec 0069; GLOSSARY: Deck, Slide, Theme): from its description, its data and its Theme to the one
// list of objects of every slide, which the screen and a file both read. Visibility: it draws what it is given and reads
// nothing else. The core's readDeck hands it only the slides and data a person may see, so hidden slides, the agenda and
// page numbers are counted from that. Words are data here: nothing in them is markup. Pure.
import { cleanLogo } from "../theme-look";
import type { CanvasData, ThemeSlides, ThemeTokens } from "../types";
import { DECK_DESIGNS, type DeckDesignId } from "./designs";
import { deckFonts, type DeckFonts, type FontSet } from "./fonts";
import { cannotObjects, contentLayout, frame, logoObjects, panelObject, type Logo, type SlideForm, type SlideLayout } from "./frame";
import { createMeasure } from "./measure";
import { createPen, SLIDE, type Box, type Obj } from "./objects";
import type { AgendaEntry, DeckFacts, SlideSource, SlideType } from "./slide-type";
import { SLIDE_TYPES } from "./slides";
import { deckSlots, roleColours, type Emphasis, type Role, type Slots } from "./theme";

/** What a deck is drawn from. */
export type DeckDrawingInput = {
  name: string;
  design: DeckDesignId;
  emphasis: Emphasis;
  slides: SlideSource[];
  /** Only what the viewer may see. */
  data: CanvasData;
  theme: { tokens: ThemeTokens; slides: ThemeSlides };
  /** The deck's own footer words; absent or null: the Theme's. */
  footer?: string | null;
  /** The Theme's fonts (the screen's choice) or the ones any computer has. */
  fonts?: FontSet;
  period: string;
  date: string;
};

/** How a drawn deck looks: its design, emphasis, fonts and colours. */
export type DeckLook = { design: DeckDesignId; emphasis: Emphasis; fonts: DeckFonts; slots: Slots; colours: Record<Role, string> };

/** One slide as drawn. */
export type SlideDrawing = {
  /** The slide's id in the description. */
  id: string;
  type: string;
  form: SlideForm;
  layout: SlideLayout;
  /** The slide's own objects, drawn over its layout's. */
  objects: Obj[];
  /** Where content may stand, for the quality check. */
  regions: Box[];
  headline: string;
};

/** A drawn deck. */
export type DeckDrawing = { look: DeckLook; slides: SlideDrawing[] };

/** A slide of a type this Ziffr does not draw stays, and says so. */
const unknown = (id: string): SlideType => ({
  id,
  section: "Slides",
  agenda: false,
  fill: () => ({ headline: "This slide cannot be shown", source: "", cannot: "Ziffr cannot draw this kind of slide." }),
  draw: () => [],
});

/** The first headline of each section the agenda names, four at most. */
function agendaOf(slides: { type: SlideType; headline: string }[]): AgendaEntry[] {
  const entries = new Map<string, string>();
  for (const { type, headline } of slides) {
    if (type.agenda !== false && !entries.has(type.section)) entries.set(type.section, headline);
  }
  return [...entries].slice(0, 4).map(([section, headline]) => ({ section, headline }));
}

/** Draws every slide of a deck that is not hidden, with the slide types given (all that Ziffr has, unless a test says). */
export function drawDeck(input: DeckDrawingInput, types: Record<string, SlideType> = SLIDE_TYPES): DeckDrawing {
  const design = DECK_DESIGNS[input.design];
  const { tokens, slides: theme } = input.theme;
  const fonts = deckFonts(tokens, input.fonts);
  const slots = deckSlots(tokens);
  const look: DeckLook = { design: design.id, emphasis: input.emphasis, fonts, slots, colours: roleColours(slots, input.emphasis) };
  const measure = createMeasure(fonts);
  // Only a checked picture carried as data is drawn: never an address that would be fetched.
  const src = cleanLogo(theme.logo);
  const logo: Logo = src ? { src, ratio: theme.logo_ratio } : null;
  const facts: DeckFacts = { name: input.name, period: input.period, date: input.date, footer: input.footer ?? theme.footer, agenda: [] };

  const shown = input.slides.filter((s) => !s.hidden).map((source) => ({ source, type: Object.hasOwn(types, source.type) ? types[source.type]! : unknown(source.type) }));
  // The content slides say what they say first: the cover's agenda is made from their headlines.
  const content = shown.filter((s) => !s.type.cover).map((s) => {
    const filled = s.type.fill(s.source, input.data, facts);
    return { ...s, filled, headline: s.source.headline || filled.headline };
  });
  const sections = [...new Set(content.map((s) => s.type.section))];
  const agenda = agendaOf(content);

  const slides: SlideDrawing[] = shown.map(({ source, type }) => {
    const pen = createPen();
    const base = { id: source.id, type: source.type };
    if (type.cover) {
      const filled = type.fill(source, input.data, { ...facts, agenda });
      const whole: Box = { x: 0, y: 0, w: SLIDE.w, h: SLIDE.h };
      const objects = "cannot" in filled ? cannotObjects(pen, measure, whole, filled.cannot) : type.draw(filled.content, { ...whole, design, pen, measure });
      const layout = { name: `${design.id}, cover`, objects: [panelObject(design.cover.panel), ...logoObjects(logo, { ...design.cover.logo, onPanel: true }, "left", input.emphasis)] };
      return { ...base, form: "cover", layout, objects, regions: [whole], headline: filled.headline };
    }
    const index = content.findIndex((s) => s.source === source);
    const { filled, headline } = content[index]!;
    const aside = "cannot" in filled ? undefined : filled.aside;
    // A design that keeps its so-what in a column of the content's width gives the content that width where there is none.
    const form = type.wide || (design.full.aside === "lead" && !aside) ? "wide" : "full";
    const framed = frame({
      design,
      form,
      pen,
      measure,
      headline,
      sections,
      section: type.section,
      source: filled.source,
      note: "cannot" in filled ? undefined : filled.note,
      footer: facts.footer,
      page: theme.show_slide_number ? index + 1 : null,
      logo,
      aside,
    });
    const own = "cannot" in filled ? cannotObjects(pen, measure, framed.body, filled.cannot) : type.draw(filled.content, { ...framed.body, design, pen, measure });
    return { ...base, form, layout: contentLayout(design, form, logo, input.emphasis), objects: [...framed.objects, ...own], regions: framed.regions, headline };
  });
  return { look, slides };
}
