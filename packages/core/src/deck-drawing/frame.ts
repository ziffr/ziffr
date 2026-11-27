// What every content slide shares, placed by its Deck Design (spec 0069; GLOSSARY: Deck Design, Slide): the panel, the
// section tracker, the headline, a so-what, the source line, footer words, the Theme's logo and the page number. What is
// the same on every slide of one form is its layout (a PowerPoint slide layout); the rest is the slide's own. Pure.
import type { Design, Form } from "./designs";
import type { Measure } from "./measure";
import { para, SLIDE, textBody, type Box, type Obj, type Para, type Pen, type ShapeObj } from "./objects";
import type { Aside } from "./slide-type";
import type { Emphasis, Role } from "./theme";

/** The Theme's logo: its picture as a data address, and its width over its height. */
export type Logo = { src: string; ratio: number } | null;

/** The layout a slide stands on: what is behind every slide of its form. */
export type SlideLayout = { name: string; objects: Obj[] };

/** The form of a slide in its design. */
export type SlideForm = "cover" | "full" | "wide";

/** The sizes a headline takes: the first that keeps it to two lines. */
const HEADLINE_SIZES = [26, 22, 18, 16, 14] as const;
const FOOTER_Y = 668;
const PAGE_W = 44;
const SMALL = 11;

/** The logo in the box a design gives it, as large as its shape allows. On a strong panel it stands on a plate of the
 * slide's own surface, so a logo made for the slides is read there too. */
export function logoObjects(logo: Logo, place: Box & { onPanel?: boolean }, align: "left" | "right", emphasis: Emphasis): Obj[] {
  if (!logo) return [];
  const ratio = logo.ratio > 0 ? logo.ratio : 3;
  const w = Math.min(place.w, place.h * ratio);
  const h = w / ratio;
  const x = align === "left" ? place.x : place.x + place.w - w;
  const y = place.y + (place.h - h) / 2;
  const picture: Obj = { type: "picture", id: "Logo", role: "logo", x, y, w, h, src: logo.src, alt: "Logo" };
  if (!place.onPanel || emphasis !== "strong") return [picture];
  return [{ type: "shape", shape: "rect", id: "Logo plate", role: "bleed", x: x - 6, y: y - 4, w: w + 12, h: h + 8, fill: "surface" }, picture];
}

/** The panel of a design, behind everything. */
export const panelObject = (box: Box): ShapeObj => ({ type: "shape", shape: "rect", id: "Design panel", role: "panel", ...box, fill: "panel" });

/** The layout of the content slides of one form: panel, footer rule and logo. */
export function contentLayout(design: Design, form: "full" | "wide", logo: Logo, emphasis: Emphasis): SlideLayout {
  const g = design[form];
  const rule: Obj = { type: "line", id: "Footer rule", x1: g.footer.x, y1: 660, x2: g.footer.x + g.footer.w, y2: 660, color: "rule", width: 1 };
  return { name: `${design.id}, ${form}`, objects: [panelObject(g.panel), rule, ...logoObjects(logo, g.logo, g.logo.onPanel ? "left" : "right", emphasis)] };
}

/** A numbered badge: a square with its number inside. */
export function badge(pen: Pen, cx: number, cy: number, label: string | number, r = 16, fill: Role = "accent", ink: Role = "onaccent"): ShapeObj {
  return pen.shape("rect", { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, {
    fill,
    role: "badge",
    body: textBody([String(label)], { size: 14, color: ink, bold: true, line: 1.4, align: "center", valign: "middle", wrap: false }),
  });
}

/** The headline in its place: its break chosen, in the largest size that keeps it to two lines. It stands on the bottom
 * of its box, so the distance to the content is the same for one line and two. */
function headlineObject(pen: Pen, measure: Measure, box: Box, words: string, color: Role): Obj {
  const fits = (size: number) => measure.wrap(words, box.w, { size, face: "head", bold: true }).length <= 2;
  const size = HEADLINE_SIZES.find(fits) ?? HEADLINE_SIZES[HEADLINE_SIZES.length - 1]!;
  const setting = { size, face: "head" as const, bold: true };
  const set = measure.fit(measure.balance(words, box.w, setting), box.w, setting, 2);
  return pen.text(box, [set], { size, color, face: "head", bold: true, line: 1.25, valign: "bottom", inset: [0, 0, 0, 4], placeholder: "title", role: "title" });
}

type Tone = { words: Role; mark: Role };

/** So-what points one under another, each cut to the room it has. */
function points(pen: Pen, measure: Measure, box: Box, items: NonNullable<Aside["points"]>, tone: Tone): Obj[] {
  const shown = items.slice(0, 3);
  const pitch = Math.min(112, box.h / Math.max(1, shown.length));
  const lines = Math.max(2, Math.floor((pitch - 12) / (13 * 1.4)));
  return shown.flatMap((point, i) => {
    const y = box.y + i * pitch;
    const lead = measure.fit(point.lead, box.w, { size: 13, bold: true }, Math.min(2, lines - 1));
    const words = measure.fit(point.words, box.w, { size: 13 }, lines - measure.wrap(lead, box.w, { size: 13, bold: true }).length);
    const rule = i ? [pen.rect({ x: box.x, y: y - 9, w: box.w, h: 1 }, tone.mark, { opacity: 0.4 })] : [];
    return [...rule, pen.text({ x: box.x, y, w: box.w, h: pitch - 12 }, [para(lead, { bold: true }), para(words)], { size: 13, color: tone.words, line: 1.4 })];
  });
}

/** The so-what of a form with room beside the content: a heading, the points and the large figure at the bottom. */
function asideColumn(pen: Pen, measure: Measure, box: Box, aside: Aside, tone: Tone): Obj[] {
  const { x, y, w } = box;
  const bottom = y + box.h;
  const figure = aside.figure;
  const out: Obj[] = [];
  if (aside.points?.length) {
    out.push(pen.text({ x, y, w, h: 24 }, [measure.fit(aside.heading ?? "So what", w, { size: 12, bold: true, caps: true, track: 0.1 }, 1)], { size: 12, color: tone.mark, bold: true, caps: true, track: 0.1, line: 1.4 }));
    out.push(...points(pen, measure, { x, y: y + 42, w, h: (figure ? bottom - 140 : bottom) - y - 42 }, aside.points, tone));
  }
  if (figure) {
    const size = measure.width(figure.value, { size: 40, bold: true }) <= w * 0.92 ? 40 : 26;
    // The space under the line is for the letters that reach below it in some fonts.
    out.push(pen.text({ x, y: bottom - 124, w, h: 58 }, [measure.fit(figure.value, w, { size, bold: true }, 1)], { size, color: tone.mark, bold: true, line: 1.25, valign: "bottom", inset: [0, 0, 0, 6], wrap: false }));
    out.push(pen.text({ x, y: bottom - 62, w, h: 56 }, [measure.fit(figure.words, w, { size: 13 }, 3)], { size: 13, color: tone.words, line: 1.4 }));
  }
  return out;
}

/** The so-what as columns under the content of a wide form: the figure first, then the points. */
function asideRow(pen: Pen, measure: Measure, box: Box, aside: Aside): Obj[] {
  const { x, y, w } = box;
  const columns: ({ figure: NonNullable<Aside["figure"]> } | { point: NonNullable<Aside["points"]>[number] })[] = [
    ...(aside.figure ? [{ figure: aside.figure }] : []),
    ...(aside.points ?? []).slice(0, 3).map((point) => ({ point })),
  ];
  if (!columns.length) return [];
  const cw = (w - 24 * (columns.length - 1)) / columns.length;
  const out: Obj[] = [pen.text({ x, y, w, h: 18 }, [measure.fit(aside.heading ?? "So what", w, { size: SMALL, bold: true, caps: true, track: 0.1 }, 1)], { size: SMALL, color: "accent", bold: true, caps: true, track: 0.1 })];
  columns.forEach((c, i) => {
    const cx = x + i * (cw + 24);
    const inner = cw - 12;
    out.push(pen.rect({ x: cx, y: y + 24, w: 3, h: box.h - 24 }, "accent"));
    if ("figure" in c) {
      out.push(pen.text({ x: cx + 12, y: y + 21, w: inner, h: 32 }, [measure.fit(c.figure.value, inner, { size: 22, bold: true }, 1)], { size: 22, color: "accent", bold: true, wrap: false }));
      out.push(pen.text({ x: cx + 12, y: y + 54, w: inner, h: box.h - 54 }, [measure.fit(c.figure.words, inner, { size: 12 }, Math.floor((box.h - 54) / (12 * 1.3)))], { size: 12, line: 1.3 }));
    } else {
      const lead = measure.fit(c.point.lead, inner, { size: 12, bold: true }, 2);
      const lines = Math.floor((box.h - 24) / (12 * 1.36)) - measure.wrap(lead, inner, { size: 12, bold: true }).length;
      out.push(pen.text({ x: cx + 12, y: y + 24, w: inner, h: box.h - 24 }, [para(lead, { bold: true }), para(measure.fit(c.point.words, inner, { size: 12 }, Math.max(1, lines)))], { size: 12, line: 1.36 }));
    }
  });
  return out;
}

/** The footer: the source line (after a note), the footer words and the page number. */
function footerObjects(pen: Pen, measure: Measure, g: Form, o: { source: string; note?: string; footer: string; page: number | null; logo: Logo }): Obj[] {
  const right = g.footer.x + g.footer.w;
  const logoInFooter = Boolean(o.logo) && !g.logo.onPanel;
  const end = logoInFooter ? g.logo.x - 16 : right - (o.page === null ? 0 : PAGE_W + 16);
  const wordsW = o.footer ? Math.min(360, Math.round(g.footer.w * 0.32)) : 0;
  const sourceW = end - (wordsW ? wordsW + 16 : 0) - g.footer.x;
  const out: Obj[] = [];
  const line = (words: string, most: number) => measure.fit(words, sourceW, { size: SMALL }, most);
  const lines: Para[] = [...(o.note ? [para(line(o.note, 1))] : []), ...(o.source ? [para(line(`Source: ${o.source}`, o.note ? 1 : 2))] : [])];
  if (lines.length) out.push(pen.text({ x: g.footer.x, y: FOOTER_Y, w: sourceW, h: 34 }, lines, { size: SMALL, color: "muted", line: 1.4, placeholder: "source", role: "source" }));
  if (o.footer) {
    out.push(pen.text({ x: end - wordsW, y: FOOTER_Y, w: wordsW, h: 34 }, [measure.fit(o.footer, wordsW, { size: SMALL }, 2)], { size: SMALL, color: "muted", line: 1.4, align: "right", role: "footer" }));
  }
  if (o.page !== null) out.push(pen.text({ x: right - PAGE_W, y: 676, w: PAGE_W, h: 18 }, [String(o.page)], { size: SMALL, color: "muted", align: "right", wrap: false, placeholder: "number", role: "page" }));
  return out;
}

/** What the frame draws a content slide from. */
export type FrameInput = {
  design: Design;
  form: "full" | "wide";
  pen: Pen;
  measure: Measure;
  headline: string;
  sections: string[];
  section: string;
  source: string;
  note?: string;
  footer: string;
  /** The page number; null where the Theme shows none. */
  page: number | null;
  logo: Logo;
  aside?: Aside;
};

/** The frame of a content slide: its own shared objects, the box left for its content and the places content may stand. */
export function frame(o: FrameInput): { objects: Obj[]; body: Box; regions: Box[] } {
  const { design, pen, measure } = o;
  const g = design[o.form];
  const onBand = design.id === "band";
  const number = String(o.sections.indexOf(o.section) + 1).padStart(2, "0");
  const objects: Obj[] = [];
  const tracker: Para = {
    runs: o.sections.flatMap((s, i) => [...(i ? [{ t: "    " }] : []), s === o.section ? { t: s, bold: true, color: (onBand ? "panelmark" : "accent") as Role } : { t: s }]),
  };
  objects.push(pen.text({ x: g.tracker.x, y: g.tracker.y, w: g.tracker.w, h: 18 }, [tracker], { size: SMALL, color: onBand ? "paneltext" : "muted", caps: true, track: 0.08, role: "tracker", wrap: false }));
  objects.push(headlineObject(pen, measure, g.title, o.headline, onBand ? "paneltext" : "ink"));

  const body = { ...g.body };
  const regions: Box[] = [];
  const aside = o.aside && (o.aside.points?.length || o.aside.figure) ? o.aside : undefined;
  if (g.aside === "panel") {
    // The side column: which section this is, and the so-what below.
    const ix = g.panel.x + 48;
    objects.push(badge(pen, ix + 16, 44, number, 16, "panelmark", "panel"));
    objects.push(pen.text({ x: ix + 46, y: 35, w: 218, h: 18 }, [o.section], { size: 12, color: "paneltext", bold: true, caps: true, track: 0.1, role: "section", wrap: false }));
    if (aside) {
      const place = { x: ix, y: 140, w: 264, h: 510 };
      objects.push(...asideColumn(pen, measure, place, aside, { words: "paneltext", mark: "panelmark" }));
      regions.push(place);
    }
  } else {
    if (!onBand) objects.push(badge(pen, g.panel.x + g.panel.w / 2, 44, number, 14, "panelmark", "panel"));
    if (aside && g.aside === "lead") {
      const place = g.lead!;
      objects.push(...asideColumn(pen, measure, place, aside, { words: "ink", mark: "accent" }));
      objects.push(pen.line([place.x + place.w + 16, place.y], [place.x + place.w + 16, place.y + place.h], { color: "rule" }));
      regions.push({ ...place, w: place.w + 18 });
    }
    if (aside && g.aside === "row") {
      body.h -= 114;
      const place = { x: body.x, y: body.y + body.h + 10, w: body.w, h: 104 };
      objects.push(...asideRow(pen, measure, place, aside));
      regions.push(place);
    }
  }
  objects.push(...footerObjects(pen, measure, g, o));
  return { objects, body, regions: [body, ...regions] };
}

/** The sentence a slide shows where its data cannot carry it any more. */
export function cannotObjects(pen: Pen, measure: Measure, body: Box, sentence: string): Obj[] {
  const w = Math.min(body.w, 640);
  return [pen.text({ x: body.x, y: body.y + 24, w, h: SLIDE.h / 4 }, [measure.fit(sentence, w, { size: 18 }, 6)], { size: 18, color: "muted", line: 1.45 })];
}
