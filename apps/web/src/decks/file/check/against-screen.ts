// Screen against file (spec 0069; GLOSSARY: Slide, Deck): whether every object of a drawn slide stands in the
// PowerPoint file where it stands on screen, within 2 px. A placeholder takes its place from the slide, then its layout,
// then the master, as PowerPoint does. Test material: no screen imports it.
import type { SlideDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import { flatten } from "@ziffr/core/deck-drawing/objects";
import JSZip from "jszip";
import { PLACEHOLDERS } from "../xml";

type Rect = { x: number; y: number; w: number; h: number };

/** Where the screen has each object of a slide, by the object's id, in the slide's own pixels. */
export type ScreenPlaces = Record<string, Rect>;

/** Every part of a file, read as text. */
export async function readParts(file: Uint8Array): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(file);
  return Object.fromEntries(await Promise.all(Object.entries(zip.files).map(async ([name, part]) => [name, await part.async("string")] as const)));
}

const pixels = (emu: string) => Number(emu) / 9525;
const shapes = (xml: string) => xml.match(/<p:(sp|cxnSp|graphicFrame|pic)>[\s\S]*?<\/p:\1>/g) ?? [];

/** The place a shape of the file says for itself, with the outline PowerPoint centres on its edge. */
function placeOf(shape: string | undefined): Rect | null {
  const found = shape?.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/);
  if (!found) return null;
  const [x, y, w, h] = found.slice(1).map(pixels) as [number, number, number, number];
  const outline = shape!.startsWith("<p:sp>") ? shape!.match(/<p:spPr>(?:(?!<\/p:spPr>)[\s\S])*?<a:ln w="(\d+)"/)?.[1] : undefined;
  const edge = outline ? pixels(outline) : 0;
  return { x: x - edge / 2, y: y - edge / 2, w: w + edge, h: h + edge };
}

/** What of one slide stands elsewhere in the file than on screen, as words; empty where all agree. */
export function misplaced(parts: Record<string, string>, index: number, slide: SlideDrawing, screen: ScreenPlaces): string[] {
  const part = (name: string) => parts[name] ?? "";
  const own = part(`ppt/slides/slide${index + 1}.xml`);
  const layout = part(`ppt/slideLayouts/${part(`ppt/slides/_rels/slide${index + 1}.xml.rels`).match(/slideLayout\d+\.xml/)?.[0]}`);
  const levels = [own, layout, part("ppt/slideMasters/slideMaster1.xml")].map(shapes);
  return flatten([...slide.layout.objects, ...slide.objects]).flatMap((o) => {
    const placeholder = o.type === "text" ? o.placeholder : undefined;
    const marked = placeholder ? PLACEHOLDERS[placeholder].ph : `name="${o.id}"`;
    // A layout's placeholder shows nothing on a slide of its own: only its slide counts it.
    const file = levels.map((level) => placeOf(level.find((s) => s.includes(marked)))).find(Boolean);
    const seen = screen[o.id];
    if (!file || !seen) return [`${o.id}: not found ${file ? "on screen" : "in the file"}`];
    // A line's picture on screen has 8 px of room around it.
    const room = o.type === "line" || o.type === "connector" ? 8 : 0;
    const there = { x: seen.x + room, y: seen.y + room, w: seen.w - 2 * room, h: seen.h - 2 * room };
    // A text box is as high as its words need: its origin and width have to agree.
    const sides = o.type === "text" ? (["x", "y", "w"] as const) : (["x", "y", "w", "h"] as const);
    const off = sides.some((side) => Math.abs(file[side] - there[side]) > 2);
    return off ? [`${o.id}: file ${sides.map((s) => Math.round(file[s]))}, screen ${sides.map((s) => Math.round(there[s]))}`] : [];
  });
}
