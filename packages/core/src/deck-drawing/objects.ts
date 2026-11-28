// The drawing of a deck's Slides (spec 0069; GLOSSARY: Deck, Slide): one list of objects that the screen and the
// PowerPoint file both read, so they say the same in the same places. Every object is something PowerPoint has natively.
// Units are pixels of a 1280 by 720 slide. Words are plain text and never markup: bold is a Run of its own. Pure, no
// colour (only the roles a Theme gives colours to) and no font name (only the heading and the text face).
import type { Role } from "./theme";

/** The size of every slide, in the drawing's pixels (13.333 by 7.5 inches). */
export const SLIDE = { w: 1280, h: 720 } as const;

/** The only sizes words come in. */
export const TYPE_SCALE = [11, 12, 13, 14, 16, 18, 22, 26, 40, 56, 96] as const;

/** A rectangle on the slide: left, top, width and height. */
export type Box = { x: number; y: number; w: number; h: number };

/** A Theme font: the heading face or the text face. */
export type Face = "head" | "body";

/** A stretch of words with one look. Anything left out comes from the paragraph or the text body. */
export type Run = { t: string; bold?: boolean; color?: Role; size?: number; face?: Face };

/** One paragraph. Anything left out comes from the text body. */
export type Para = {
  runs: Run[];
  bullet?: "dot" | "number";
  spaceBefore?: number;
  spaceAfter?: number;
  size?: number;
  color?: Role;
  bold?: boolean;
  face?: Face;
  /** Line height as a multiple of the size. */
  line?: number;
};

/** Words in a box. */
export type TextBody = {
  paras: Para[];
  size: number;
  color: Role;
  face: Face;
  bold: boolean;
  line: number;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
  caps?: boolean;
  /** Letter spacing in em. */
  track?: number;
  /** Left, top, right and bottom padding. */
  inset: [number, number, number, number];
  /** False: one line that never wraps. */
  wrap: boolean;
};

/** What a placeholder of a PowerPoint slide layout takes. */
export type Placeholder = "title" | "source" | "number";

/** What the quality check reads an object as. */
export type ObjectRole = "title" | "tracker" | "source" | "page" | "footer" | "panel" | "badge" | "chart-title" | "section" | "logo" | "bleed";

type Common = {
  /** A name that is unique on its slide, also the PowerPoint shape name: ties a screen object to its file object. */
  id: string;
  role?: ObjectRole;
  /** Alternative text. */
  alt?: string;
};

/** A text box. */
export type TextObj = Common & Box & {
  type: "text";
  body: TextBody;
  placeholder?: Placeholder;
  /** The unit a chart title names. */
  unit?: string;
};

/** A line around a shape. */
export type Stroke = { color: Role; width: number; dash?: boolean };

/** A preset shape, with or without words in it. */
export type ShapeObj = Common & Box & {
  type: "shape";
  shape: "rect" | "ellipse" | "diamond";
  fill?: Role;
  /** 0 to 1. */
  opacity?: number;
  stroke?: Stroke;
  body?: TextBody;
};

/** A straight line; `arrow` puts a head at its end. */
export type LineObj = Common & { type: "line"; x1: number; y1: number; x2: number; y2: number; color: Role; width: number; dash?: boolean; arrow?: boolean };

/** A connector glued to two shapes: from the right side of one to the left side of another, with two bends. */
export type ConnectorObj = Common & { type: "connector"; from: string; to: string; x1: number; y1: number; x2: number; y2: number; color: Role; width: number };

/** One table cell. */
export type Cell = { body: TextBody; fill?: Role; borderBottom?: { color: Role; width: number } };

/** One table row; a header row names the columns. */
export type Row = { h: number; header?: boolean; cells: Cell[] };

/** A table with fixed column widths and row heights. */
export type TableObj = Common & { type: "table"; x: number; y: number; cols: number[]; rows: Row[] };

/** A picture carried inside the drawing, as a data address (the Theme's logo): never a link to anywhere. */
export type PictureObj = Common & Box & { type: "picture"; src: string; alt: string };

/** Objects that arrive in PowerPoint as one group. */
export type GroupObj = Common & { type: "group"; children: Obj[] };

/** Anything a slide draws. */
export type Obj = TextObj | ShapeObj | LineObj | ConnectorObj | TableObj | PictureObj | GroupObj;

/** Every object of a list in drawing order, groups opened. */
export function flatten(objects: Obj[]): Exclude<Obj, GroupObj>[] {
  return objects.flatMap((o) => (o.type === "group" ? flatten(o.children) : [o]));
}

/** The rectangle an object covers. */
export function boundsOf(o: Obj): Box {
  if (o.type === "line" || o.type === "connector") return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  if (o.type === "table") return { x: o.x, y: o.y, w: o.cols.reduce((a, b) => a + b, 0), h: o.rows.reduce((a, r) => a + r.h, 0) };
  if (o.type === "group") {
    const all = o.children.map(boundsOf);
    if (!all.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...all.map((b) => b.x));
    const y = Math.min(...all.map((b) => b.y));
    return { x, y, w: Math.max(...all.map((b) => b.x + b.w)) - x, h: Math.max(...all.map((b) => b.y + b.h)) - y };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

/** A number and its unit never part at a line end. */
export function keep(s: string): string {
  return s.replace(/(\d) (?=%|€|k€|M€|\$|h\b|pts?\b|points?\b)/g, "$1 ");
}

/** A paragraph of plain words in one look. */
export function para(words: string, look: Omit<Para, "runs"> = {}): Para {
  return { ...look, runs: [{ t: keep(words) }] };
}

/** How a text body is set; what is left out is 14 px text in ink, left and top, that wraps. */
export type BodyLook = Partial<Omit<TextBody, "paras">>;

/** A text body from plain words or paragraphs. */
export function textBody(content: string | (string | Para)[], look: BodyLook = {}): TextBody {
  const list = Array.isArray(content) ? content : [content];
  return {
    paras: list.map((c) => (typeof c === "string" ? para(c) : c)),
    size: 14,
    color: "ink",
    face: "body",
    bold: false,
    line: 1.35,
    align: "left",
    valign: "top",
    inset: [0, 0, 0, 0],
    wrap: true,
    ...look,
  };
}

type TextOptions = BodyLook & { role?: ObjectRole; placeholder?: Placeholder; unit?: string };
type ShapeOptions = Pick<ShapeObj, "fill" | "opacity" | "stroke" | "body" | "role" | "alt">;

/**
 * Makes the objects of one slide, naming them in the order they are made, so the same slide drawn again has the same
 * names. Use one pen per slide.
 */
export function createPen() {
  let made = 0;
  const name = (kind: string) => `${kind} ${++made}`;
  const shape = (kind: ShapeObj["shape"], box: Box, options: ShapeOptions = {}): ShapeObj => ({ type: "shape", shape: kind, id: name(kind), ...box, ...options });
  return {
    /** A text box. */
    text(box: Box, content: string | (string | Para)[], options: TextOptions = {}): TextObj {
      const { role, placeholder, unit, ...look } = options;
      return { type: "text", id: name(placeholder ?? "text"), ...box, body: textBody(content, look), role, placeholder, unit };
    },
    shape,
    /** A filled rectangle. */
    rect(box: Box, fill: ShapeObj["fill"], options: Omit<ShapeOptions, "fill"> = {}): ShapeObj {
      return shape("rect", box, { fill, ...options });
    },
    /** A straight line from one point to another. */
    line(from: [number, number], to: [number, number], options: Partial<Pick<LineObj, "color" | "width" | "dash" | "arrow">> = {}): LineObj {
      return { type: "line", id: name("line"), x1: from[0], y1: from[1], x2: to[0], y2: to[1], color: "rule", width: 1, ...options };
    },
    /** A connector between two shapes' sides. */
    connector(from: ShapeObj, to: ShapeObj, color: ConnectorObj["color"] = "muted", width = 1): ConnectorObj {
      return { type: "connector", id: name("connector"), from: from.id, to: to.id, x1: from.x + from.w, y1: from.y + from.h / 2, x2: to.x, y2: to.y + to.h / 2, color, width };
    },
    /** A table. */
    table(x: number, y: number, cols: number[], rows: Row[], alt?: string): TableObj {
      return { type: "table", id: name("table"), x, y, cols, rows, alt };
    },
    /** A picture from a data address. */
    picture(box: Box, src: string, alt: string, role?: ObjectRole): PictureObj {
      return { type: "picture", id: name("picture"), ...box, src, alt, role };
    },
    /** Objects as one group, such as a chart. */
    group(kind: string, alt: string, children: Obj[]): GroupObj {
      return { type: "group", id: name(kind), alt, children };
    },
  };
}

/** The pen of one slide. */
export type Pen = ReturnType<typeof createPen>;
