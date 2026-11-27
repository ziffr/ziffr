// A drawn deck as a PowerPoint file (spec 0069; GLOSSARY: Deck, Slide, Deck Design, Theme), made in the browser.
// Visibility: it writes the drawing it is given and reads nothing else, so the file holds what the person who asked may
// see: a hidden or left out slide is not in the drawing and so not in the file. PptxGenJS (MIT) makes the package; the
// XML of the slides, theme, master and layouts, the links and the pictures are Ziffr's own. Words are escaped, never
// markup; the only links are to Ziffr's own address, and there is none without one.
import type { DeckDrawing, SlideDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import { DECK_FONT_FAMILIES, type FontSet } from "@ziffr/core/deck-drawing/fonts";
import { flatten, type PictureObj, type TextObj } from "@ziffr/core/deck-drawing/objects";
import JSZip from "jszip";
import { layoutXml, masterXml, representatives, themeXml, type Placeholders } from "./package";
import { clean, esc, NS, placeholderXml, shapeTree, XML, type Blip, type Look, type Part } from "./xml";

/** The two downloads, each with the fonts its drawing has to be made with: ones any computer has, or the Theme's. */
export const FILE_FONTS = { office: "office", google: "theme" } as const satisfies Record<string, FontSet>;

/** Which download: for PowerPoint and Keynote, or for Google Slides. */
export type DeckFileKind = keyof typeof FILE_FONTS;

/** Makes the PNG pixels of a picture that not every app can show (SVG, WebP). */
type Rasterize =(picture: { src: string; width: number; height: number }) => Promise<Uint8Array>;

/** How a drawn deck is to be written. */
export type DeckFileOptions = {
  title: string;
  kind: DeckFileKind;
  /** The Installation's own address: only links below it are written. Left out through a View Link, which gets none. */
  address?: string;
  /** Absent: the browser draws the picture on a canvas. */
  rasterize?: Rasterize;
};

const RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PICTURE = /^data:image\/(png|jpeg|svg\+xml|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MEDIA_TYPES = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml" } as const;

/** The pixels a browser makes of a picture, three for each of the slide's, so it stays sharp on a large screen. */
const onCanvas: Rasterize = async ({ src, width, height }) => {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * 3));
  canvas.height = Math.max(1, Math.round(height * 3));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("the browser cannot draw the picture");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("the browser cannot draw the picture");
  return new Uint8Array(await blob.arrayBuffer());
};

type Media = { pixels: string; svg?: string };

/** Puts every picture into the package once, and says under which names. A picture that is not carried as data is left out. */
async function addPictures(zip: JSZip, pictures: PictureObj[], rasterize: Rasterize): Promise<Map<string, Media>> {
  const media = new Map<string, Media>();
  let count = 0;
  const put = (extension: keyof typeof MEDIA_TYPES, bytes: Uint8Array) => {
    const name = `ziffr-${++count}.${extension}`;
    zip.file(`ppt/media/${name}`, bytes, { createFolders: false });
    return name;
  };
  for (const picture of pictures) {
    const found = media.has(picture.src) ? null : PICTURE.exec(picture.src);
    if (!found) continue;
    const bytes = () => Uint8Array.from(atob(found[2]!), (c) => c.charCodeAt(0));
    const drawn = () => rasterize({ src: picture.src, width: picture.w, height: picture.h });
    if (found[1] === "png") media.set(picture.src, { pixels: put("png", bytes()) });
    else if (found[1] === "jpeg") media.set(picture.src, { pixels: put("jpg", bytes()) });
    else if (found[1] === "webp") media.set(picture.src, { pixels: put("png", await drawn()) });
    else media.set(picture.src, { pixels: put("png", await drawn()), svg: put("svg", bytes()) });
  }
  return media;
}

/** An address a link may be written for: below Ziffr's own, over http or https, without a sign-in in it. */
function ownLink(href: string, address: string | undefined): string | null {
  const parse = (s: string | undefined) => {
    const url = s && URL.canParse(s) ? new URL(s) : null;
    return url && /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null;
  };
  const own = parse(address);
  const url = parse(href);
  if (!own || !url) return null;
  return url.href.startsWith(`${own.origin}${own.pathname.replace(/\/+$/, "")}/`) ? url.href : null;
}

/** The relationships a part needs for its links and pictures, collected while its shapes are written. */
function partOf(media: Map<string, Media>, address: string | undefined) {
  const ids = new Map<string, string>();
  const entries: string[] = [];
  const relation = (type: "hyperlink" | "image", target: string) => {
    const key = `${type} ${target}`;
    let id = ids.get(key);
    if (!id) {
      id = `rIdZ${ids.size + 1}`;
      ids.set(key, id);
      entries.push(`<Relationship Id="${id}" Type="${RELATIONSHIP}/${type}" Target="${esc(target)}"${type === "hyperlink" ? ' TargetMode="External"' : ""}/>`);
    }
    return id;
  };
  const part: Part = {
    link: (href) => {
      const url = ownLink(href, address);
      return url ? relation("hyperlink", url) : null;
    },
    picture: (o): Blip | null => {
      const found = media.get(o.src);
      if (!found) return null;
      const embed = (name: string) => relation("image", `../media/${name}`);
      return { pixels: embed(found.pixels), ...(found.svg ? { svg: embed(found.svg) } : {}) };
    },
  };
  return { part, entries };
}

const text = async (zip: JSZip, name: string): Promise<string> => {
  const file = zip.file(name);
  if (!file) throw new Error(`the package has no ${name}`);
  return file.async("string");
};
const set = (zip: JSZip, name: string, xml: string) => zip.file(name, xml, { createFolders: false });

/** Adds relationships to those a part of the package already has. */
async function relate(zip: JSZip, folder: string, file: string, entries: string[]): Promise<void> {
  if (!entries.length) return;
  const name = `${folder}/_rels/${file}.rels`;
  set(zip, name, (await text(zip, name)).replace("</Relationships>", () => `${entries.join("")}</Relationships>`));
}

const numbered = (zip: JSZip, pattern: RegExp): string[] =>
  Object.keys(zip.files)
    .filter((f) => pattern.test(f))
    .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));

/** An empty presentation with a layout of each name and as many slides as the drawing has. */
async function blankPackage(slides: SlideDrawing[], title: string): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  pptx.subject = title;
  pptx.author = "Ziffr";
  pptx.company = "";
  for (const name of new Set(slides.map((s) => s.layout.name))) pptx.defineSlideMaster({ title: name });
  for (const slide of slides) pptx.addSlide({ masterName: slide.layout.name });
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

/**
 * The number PowerPoint gives the first slide so that its own slide numbers say what the drawing says. The drawing
 * counts the slides after the cover, which makes the cover number 0.
 */
function firstNumber(slides: SlideDrawing[]): number | null {
  for (const [index, slide] of slides.entries()) {
    const shown = slide.objects.find((o): o is TextObj => o.type === "text" && o.placeholder === "number");
    if (shown) {
      const first = Number(shown.body.paras[0]?.runs[0]?.t) - index;
      return Number.isInteger(first) && first >= 0 ? first : null;
    }
  }
  return null;
}

/** The slide list comes after the master lists in the schema; PptxGenJS 4.0.1 puts the notes master after it. */
function presentationXml(xml: string, first: number | null): string {
  const notes = xml.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/)?.[0];
  const ordered = notes ? xml.replace(notes, "").replace("</p:sldMasterIdLst>", () => `</p:sldMasterIdLst>${notes}`) : xml;
  const numberedFrom = first === null ? ordered : ordered.replace("<p:presentation ", () => `<p:presentation firstSlideNum="${first}" `);
  return numberedFrom.replace(/<p:sldSz [^>]*\/>/, '<p:sldSz cx="12192000" cy="6858000"/>');
}

/** Writes a drawn deck as the bytes of a .pptx file. */
export async function writeDeckFile(drawing: DeckDrawing, options: DeckFileOptions): Promise<Uint8Array> {
  const { look: drawn, slides } = drawing;
  if (!slides.length) throw new Error("a deck without slides has no file");
  const google = options.kind === "google";
  // The words were measured and broken for these fonts: a drawing made for the screen must not go out as this file.
  if (!google && ![drawn.fonts.head, drawn.fonts.body].every((f) => f === "arial" || f === "georgia")) throw new Error('draw the deck with fonts: "office" for this download');
  const look: Look = { slots: drawn.slots, emphasis: drawn.emphasis, google, bodyFamily: DECK_FONT_FAMILIES[drawn.fonts.body].family };

  const made = await JSZip.loadAsync(await blankPackage(slides, clean(options.title)));
  // Only files: the folder entries a zip may list are no parts of a presentation.
  const zip = new JSZip();
  for (const file of Object.values(made.files)) if (!file.dir) zip.file(file.name, await file.async("uint8array"), { createFolders: false });

  const pictures = flatten(slides.flatMap((s) => [...s.layout.objects, ...s.objects])).filter((o): o is PictureObj => o.type === "picture");
  const media = await addPictures(zip, pictures, options.rasterize ?? onCanvas);

  set(zip, "ppt/theme/theme1.xml", themeXml(drawing));

  const content = slides.filter((s) => s.form !== "cover");
  const master: Placeholders = representatives(content.length ? content : slides);
  const masterPart = "ppt/slideMasters/slideMaster1.xml";
  const layoutList = (await text(zip, masterPart)).match(/<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>/)?.[0];
  if (!layoutList) throw new Error("the package has no list of layouts");
  set(zip, masterPart, masterXml(look, master, layoutList));

  const layouts = new Map<string, Placeholders>();
  for (const name of numbered(zip, /^ppt\/slideLayouts\/slideLayout\d+\.xml$/)) {
    const written = (await text(zip, name)).match(/<p:cSld name="([^"]*)"/)?.[1] ?? "";
    const on = slides.filter((s) => s.layout.name === written);
    const first = on[0];
    const placeholders = representatives(on);
    if (first) layouts.set(written, placeholders);
    const { part, entries } = partOf(media, options.address);
    const layout = first
      ? { name: written, type: first.form === "cover" ? ("title" as const) : ("titleOnly" as const), objects: first.layout.objects, placeholders }
      : { name: "Blank", type: "blank" as const, objects: [], placeholders: {} };
    set(zip, name, layoutXml(look, part, layout, master));
    await relate(zip, "ppt/slideLayouts", name.split("/").pop()!, entries);
  }

  const files = numbered(zip, /^ppt\/slides\/slide\d+\.xml$/);
  if (files.length !== slides.length) throw new Error(`the package has ${files.length} slides, not ${slides.length}`);
  const first = firstNumber(slides);
  for (const [index, name] of files.entries()) {
    const slide = slides[index]!;
    const base = layouts.get(slide.layout.name)!;
    const { part, entries } = partOf(media, options.address);
    const tree = shapeTree(look, part, slide.objects, (o, id) => {
      // A field only where PowerPoint's count and the drawing's agree; else the number stands as words.
      const field = o.placeholder === "number" && first !== null && o.body.paras[0]?.runs[0]?.t === String(first + index);
      return placeholderXml(look, part, o, base[o.placeholder!]!, id, field);
    });
    set(zip, name, `${XML}<p:sld ${NS}><p:cSld name="Slide ${index + 1}">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    await relate(zip, "ppt/slides", name.split("/").pop()!, entries);
  }

  set(zip, "ppt/presentation.xml", presentationXml(await text(zip, "ppt/presentation.xml"), first));

  let types = await text(zip, "[Content_Types].xml");
  for (const [extension, type] of Object.entries(MEDIA_TYPES)) {
    if (!types.includes(`Extension="${extension}"`)) types = types.replace("</Types>", `<Default Extension="${extension}" ContentType="${type}"/></Types>`);
  }
  set(zip, "[Content_Types].xml", types);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}
