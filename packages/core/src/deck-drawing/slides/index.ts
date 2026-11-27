// The slide types Ziffr can draw (spec 0069; GLOSSARY: Slide Type): one file per type beside this one, listed here.
// A new type is a new file and one line in the list; the browser check then asks for a sample of it
// (apps/web/src/decks/slides/check/samples.ts). Pure.
import type { SlideType } from "../slide-type";
import { about } from "./about";
import { bridge } from "./bridge";
import { chartSlide } from "./chart-slide";
import { cover } from "./cover";
import { definitions } from "./definitions";
import { driverTree } from "./driver-tree";
import { gapTable } from "./gap-table";
import { mosaic } from "./mosaic";
import { questions } from "./questions";
import { summary } from "./summary";
import { table } from "./table";

/** Every slide type by the name a deck's description gives it. */
export const SLIDE_TYPES: Record<string, SlideType> = Object.fromEntries([cover, summary, chartSlide, table, gapTable, bridge, mosaic, driverTree, questions, definitions, about].map((type) => [type.id, type as SlideType]));
