"use client";
// A Slide Element in a PowerPoint export (GLOSSARY: Slide Element; spec 0057): the element is drawn once, out of sight,
// at its size and in the Theme's designed colours, and what the browser laid out is read back as PowerPoint's own text
// boxes, rectangles, lines and circles at the same places. So the file follows the screen without a second layout.
// Fonts are named, not embedded; a chart arrives as shapes, not as an editable chart.
// Visibility: only what the element draws for this viewer is read; nothing else of the data reaches the file.
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { FONTS, themeVars } from "@ziffr/core/themes";
import type { Theme } from "@ziffr/core/types";
import { SlideElementView, type ElementProps } from "./element-view";

type Pptx = InstanceType<typeof import("pptxgenjs").default>;
type Slide = ReturnType<Pptx["addSlide"]>;
/** Where the element stands on the slide, in slide pixels, and how many inches a slide pixel is. */
export type Placed = { x: number; y: number; inch: number };

// A slide pixel is 1/96 inch on a 1280 pixel wide slide of 13.333 inches: three quarters of a point.
const POINT = 0.75;

type Paint = { color: string; transparency: number } | null;

/** A computed CSS colour as PowerPoint takes it, or null for none. */
function paintOf(css: string, opacity = 1): Paint {
  const n = css.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (!n || n.length < 3) return null;
  const alpha = (n[3] ?? 1) * opacity;
  if (alpha <= 0) return null;
  return { color: n.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase(), transparency: Math.round((1 - Math.min(1, alpha)) * 100) };
}

/** The font PowerPoint knows for a CSS font list. */
function officeFont(family: string): string {
  const first = family.split(",")[0].replace(/["']/g, "").trim();
  return Object.values(FONTS).find((f) => f.stack.replace(/["']/g, "").startsWith(first))?.office ?? first;
}

type Out = { pptx: Pptx; slide: Slide; at: Placed; origin: DOMRect };

const place = (o: Out, x: number, y: number, w: number, h: number) => ({ x: (o.at.x + x) * o.at.inch, y: (o.at.y + y) * o.at.inch, w: Math.max(w, 0.5) * o.at.inch, h: Math.max(h, 0.5) * o.at.inch });

function rect(o: Out, r: { x: number; y: number; w: number; h: number }, fill: Paint, line?: { paint: Paint; width: number; dashed: boolean }) {
  if (!fill && !line?.paint) return;
  o.slide.addShape(o.pptx.ShapeType.rect, { ...place(o, r.x, r.y, r.w, r.h), fill: fill ? fill : { type: "none" }, line: line?.paint ? { ...line.paint, width: line.width * POINT, dashType: line.dashed ? "dash" : "solid" } : { type: "none" } });
}

function line(o: Out, a: { x: number; y: number }, b: { x: number; y: number }, paint: Paint, width: number, dashed: boolean) {
  if (!paint) return;
  o.slide.addShape(o.pptx.ShapeType.line, { x: (o.at.x + Math.min(a.x, b.x)) * o.at.inch, y: (o.at.y + Math.min(a.y, b.y)) * o.at.inch, w: Math.abs(b.x - a.x) * o.at.inch, h: Math.abs(b.y - a.y) * o.at.inch, flipV: (b.x - a.x) * (b.y - a.y) < 0, line: { ...paint, width: width * POINT, dashType: dashed ? "dash" : "solid" } });
}

const relative = (o: Out, r: DOMRect) => ({ x: r.x - o.origin.x, y: r.y - o.origin.y, w: r.width, h: r.height });

/** The backgrounds and edges of one box. A radius of half its size is a dot. */
function box(o: Out, el: HTMLElement, style: CSSStyleDeclaration, opacity: number) {
  const r = relative(o, el.getBoundingClientRect());
  const fill = paintOf(style.backgroundColor, opacity);
  if (fill && parseFloat(style.borderTopLeftRadius) >= r.w / 2 && r.w > 0) o.slide.addShape(o.pptx.ShapeType.ellipse, { ...place(o, r.x, r.y, r.w, r.h), fill, line: { type: "none" } });
  else rect(o, r, fill);
  const sides = (["Top", "Right", "Bottom", "Left"] as const).map((s) => ({ width: parseFloat(style[`border${s}Width`]) || 0, paint: paintOf(style[`border${s}Color`], opacity), dashed: style[`border${s}Style`] === "dashed", side: s }));
  if (sides.every((s) => s.width > 0 && s.paint?.color === sides[0].paint?.color)) return rect(o, r, null, { paint: sides[0].paint, width: sides[0].width, dashed: sides[0].dashed });
  for (const s of sides) {
    if (!s.width) continue;
    const mid = s.width / 2;
    const [a, b] = s.side === "Top" ? [{ x: r.x, y: r.y + mid }, { x: r.x + r.w, y: r.y + mid }] : s.side === "Bottom" ? [{ x: r.x, y: r.y + r.h - mid }, { x: r.x + r.w, y: r.y + r.h - mid }] : s.side === "Left" ? [{ x: r.x + mid, y: r.y }, { x: r.x + mid, y: r.y + r.h }] : [{ x: r.x + r.w - mid, y: r.y }, { x: r.x + r.w - mid, y: r.y + r.h }];
    line(o, a, b, s.paint, s.width, s.dashed);
  }
}

/** The runs of text inside one block, each with the look the browser gave it. */
function runsOf(el: Element, opacity: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: { text: string; options: Record<string, unknown> }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const s = getComputedStyle(node.parentElement!);
    const raw = node.textContent ?? "";
    const text = s.textTransform === "uppercase" ? raw.toUpperCase() : raw;
    // Words in a drawing take the drawing's fill as their colour.
    const paint = paintOf(node.parentElement instanceof SVGElement ? s.fill : s.color, opacity);
    if (!text || !paint) continue;
    const spacing = parseFloat(s.letterSpacing) || 0;
    out.push({ text, options: { ...paint, bold: Number(s.fontWeight) >= 600, fontSize: parseFloat(s.fontSize) * POINT, fontFace: officeFont(s.fontFamily), ...(spacing ? { charSpacing: spacing * POINT } : {}) } });
  }
  return out;
}

/** One block of words as a text box where the browser put it. A single line gets room to spare and does not wrap, since
 * a substitute font may run wider. */
function words(o: Out, el: Element, align: string, opacity: number) {
  const runs = runsOf(el, opacity);
  if (!runs.length) return;
  const style = getComputedStyle(el);
  const outer = relative(o, el.getBoundingClientRect());
  // The words start inside the box's padding.
  const pad = (side: "Top" | "Right" | "Bottom" | "Left") => parseFloat(style[`padding${side}`]) || 0;
  const r = { x: outer.x + pad("Left"), y: outer.y + pad("Top"), w: outer.w - pad("Left") - pad("Right"), h: outer.h - pad("Top") - pad("Bottom") };
  const size = parseFloat(style.fontSize);
  const lineHeight = parseFloat(style.lineHeight) || size * 1.21;
  const single = r.h < lineHeight * 1.5;
  const side = align === "center" || align === "middle" ? "center" : align === "right" || align === "end" ? "right" : "left";
  const spare = single ? Math.max(24, r.w * 0.2) : r.w * 0.02;
  const x = side === "right" ? r.x - spare : side === "center" ? r.x - spare / 2 : r.x;
  o.slide.addText(runs.map((run) => ({ text: run.text, options: run.options })), { ...place(o, x, r.y, r.w + spare, r.h), margin: 0, valign: single ? "middle" : "top", align: side, wrap: !single, ...(single ? {} : { lineSpacing: lineHeight * POINT }) });
}

/** One shape of an element's drawing, mapped from the drawing's own units to slide pixels. */
function drawn(o: Out, el: SVGElement, opacity: number) {
  const s = getComputedStyle(el);
  const ctm = (el as SVGGraphicsElement).getScreenCTM?.();
  if (!ctm) return;
  const point = (x: number, y: number) => { const p = new DOMPoint(x, y).matrixTransform(ctm); return { x: p.x - o.origin.x, y: p.y - o.origin.y }; };
  const attr = (name: string) => Number(el.getAttribute(name) ?? 0);
  const fill = paintOf(s.fill, opacity * Number(s.fillOpacity || 1));
  const stroke = s.stroke === "none" ? null : paintOf(s.stroke, opacity * Number(s.strokeOpacity || 1));
  const width = parseFloat(s.strokeWidth) || 1;
  const dashed = Boolean(s.strokeDasharray && s.strokeDasharray !== "none");
  if (el.tagName === "text") return words(o, el, s.textAnchor === "middle" ? "center" : s.textAnchor === "end" ? "right" : "left", opacity);
  if (el.tagName === "line") return line(o, point(attr("x1"), attr("y1")), point(attr("x2"), attr("y2")), stroke, width, dashed);
  if (el.tagName === "rect") {
    const a = point(attr("x"), attr("y")), b = point(attr("x") + attr("width"), attr("y") + attr("height"));
    return rect(o, { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, fill);
  }
  if (el.tagName === "circle" && fill) {
    const a = point(attr("cx") - attr("r"), attr("cy") - attr("r")), b = point(attr("cx") + attr("r"), attr("cy") + attr("r"));
    o.slide.addShape(o.pptx.ShapeType.ellipse, { ...place(o, a.x, a.y, b.x - a.x, b.y - a.y), fill, line: { type: "none" } });
  }
  if (el.tagName === "polyline" && stroke) {
    const pts = (el.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => { const [x, y] = p.split(",").map(Number); return point(x, y); });
    // Segment by segment: every program that opens the file draws straight lines alike.
    for (let i = 1; i < pts.length; i++) line(o, pts[i - 1], pts[i], stroke, width, dashed);
  }
}

function walk(o: Out, el: Element, opacity: number) {
  const style = getComputedStyle(el);
  const seen = opacity * Number(style.opacity || 1);
  if (el instanceof SVGElement && el.tagName !== "svg") {
    if (el.tagName === "g") for (const child of el.children) walk(o, child, seen);
    else drawn(o, el, seen);
    return;
  }
  if (el instanceof HTMLElement) {
    box(o, el, style, seen);
    if (el.hasAttribute("data-words")) return words(o, el, style.textAlign, seen);
    if (el instanceof HTMLImageElement) return void o.slide.addImage({ data: el.src, ...place(o, ...(Object.values(relative(o, el.getBoundingClientRect())) as [number, number, number, number])) });
  }
  for (const child of el.children) walk(o, child, seen);
}

/** Adds one Slide Element to a PowerPoint slide as text boxes and shapes. */
export async function addElement(pptx: Pptx, slide: Slide, props: ElementProps, theme: Theme | undefined, at: Placed) {
  const host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", left: "-20000px", top: "0", width: `${props.w}px`, height: `${props.h}px`, lineHeight: "normal" });
  // The designed colours, whatever the person's Appearance: a file looks the same whoever made it.
  for (const [k, v] of Object.entries(theme ? themeVars(theme.tokens) : {})) if (k.startsWith("--") && v !== undefined) host.style.setProperty(k, String(v));
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<SlideElementView {...props} />));
    await document.fonts.ready;
    for (const child of host.children) walk({ pptx, slide, at, origin: host.getBoundingClientRect() }, child, 1);
  } finally {
    root.unmount();
    host.remove();
  }
}
