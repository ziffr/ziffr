// The slide types Ziffr can draw (spec 0069; GLOSSARY: Slide Type): one file per type beside this one, listed here.
// A new type is a new file and one line in the list; the browser check then asks for a sample of it
// (apps/web/src/decks/slides/samples.ts). Pure.
import type { SlideType } from "../slide-type";
import { cover } from "./cover";

/** Every slide type by the name a deck's description gives it. */
export const SLIDE_TYPES: Record<string, SlideType> = Object.fromEntries([cover].map((type) => [type.id, type as SlideType]));
