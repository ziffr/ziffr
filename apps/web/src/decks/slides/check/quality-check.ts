// The automatic half of the quality bar for slides (spec 0069; GLOSSARY: Slide): measures one slide as the browser laid
// it out and says what fails. It checks that nothing stands outside its place, is clipped or overlaps, that headlines
// keep to their lines, words to the type scale and colours to a readable contrast, and that every slide carries what
// every slide must. This file is bundled into the test page by slides.browser.test.ts; it runs nowhere else.
import type { Box } from "@ziffr/core/deck-drawing/objects";

/** What the drawing says a slide's places are. */
export type CheckPlan = {
  cover: boolean;
  /** The design's panel. */
  panel: Box;
  /** The places of headline and tracker, and whether a page number is due; absent on a cover. */
  places?: { title: Box; tracker: { x: number; y: number }; page: boolean };
  /** Where content may stand. */
  regions: Box[];
  /** The layout's own objects, which stand where the design says. */
  layout: string[];
  scale: readonly number[];
};

type Word = Box & { el: Element; owner: Element; block: Element | null; size: number; weight: number; colour: string; text: string };

/** Roles the frame places; everything else is content and stands in a region. */
const FRAME = ["title", "tracker", "source", "page", "footer", "panel", "logo", "bleed", "section", "badge"];

/** Every fault of a slide, each once, as "rule: what". */
export function checkSlide(slide: HTMLElement, plan: CheckPlan): string[] {
  const fails = new Set<string>();
  const fail = (rule: string, what: unknown) => fails.add(`${rule}: ${String(what).replace(/\s+/g, " ").slice(0, 90)}`);
  const origin = slide.getBoundingClientRect();
  const rel = (r: DOMRect): Box => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  const objects = [...slide.querySelectorAll<HTMLElement>("[data-id], [data-kind='words']")];
  const words = wordsOf(slide, rel);
  checkWords(words, plan, objects, rel, fail);
  checkBoxes(objects, fail);
  checkOverlaps(words, fail);
  checkLines(slide, words, rel, fail);
  checkGrounds(slide, words, rel, fail);
  checkCarries(slide, plan, rel, fail);
  checkPlaces(objects, plan, rel, fail);
  checkSpare(objects, fail);
  return [...fails];
}

type Fail = (rule: string, what: unknown) => void;
type Rel = (r: DOMRect) => Box;

/** The words as drawn: one box per line, cut to the height of the letters. */
function wordsOf(slide: HTMLElement, rel: Rel): Word[] {
  const found: Word[] = [];
  const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent!.trim()) continue;
    const el = node.parentElement!;
    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const raw of range.getClientRects()) {
      const r = rel(raw);
      if (r.w < 1) continue;
      const cut = Math.max(0, (r.h - size * 0.92) / 2);
      found.push({ x: r.x, y: r.y + cut, w: r.w, h: r.h - 2 * cut, el, owner: el.closest("[data-kind]")!, block: el.closest("div, td, th"), size, weight: Number(style.fontWeight), colour: style.color, text: node.textContent!.trim() });
    }
  }
  return found;
}

/** Type scale, a number with its unit, the slide's margins and each word inside its own box. */
function checkWords(words: Word[], plan: CheckPlan, objects: HTMLElement[], rel: Rel, fail: Fail) {
  const panels = objects.filter((o) => o.dataset.role === "panel").map((o) => rel(o.getBoundingClientRect()));
  for (const w of words) {
    if (/\d (%|€|k€|M€|\$|pts?\b|points?\b)/.test(w.el.textContent!)) fail("number and unit may part", w.text);
    if (!plan.scale.includes(Math.round(w.size * 10) / 10)) fail("type scale", `${w.size}px ${w.text}`);
    // Words on a narrow panel keep their distance from its edges instead of the slide's margins.
    const onPanel = panels.some((p) => w.x >= p.x + 4 && w.x + w.w <= p.x + p.w - 4 && w.y >= p.y && w.y + w.h <= p.y + p.h);
    if (!onPanel && (w.x < 39 || w.x + w.w > 1241 || w.y < 12 || w.y + w.h > 710)) fail("margin", w.text);
    if (w.owner.tagName === "DIV") {
      const b = rel(w.owner.getBoundingClientRect());
      if (w.x < b.x - 1.5 || w.x + w.w > b.x + b.w + 1.5 || w.y < b.y - 1.5 || w.y + w.h > b.y + b.h + 1.5) fail("clipped: leaves its box", w.text);
    }
  }
}

/** Nothing clipped: no box whose words need more room, no table that grew. */
function checkBoxes(objects: HTMLElement[], fail: Fail) {
  for (const o of objects) {
    if (o.tagName === "DIV" && o.children.length) {
      if (o.scrollHeight > o.clientHeight + 1) fail("clipped: too tall", o.textContent);
      if (o.scrollWidth > o.clientWidth + 1) fail("clipped: too wide", o.textContent);
    }
    if (o.tagName === "TABLE") {
      if (o.getBoundingClientRect().height > Number(o.dataset.h) + 3) fail("table grew", `${Math.round(o.getBoundingClientRect().height)} > ${o.dataset.h}`);
      for (const cell of o.querySelectorAll("td, th")) if (cell.scrollWidth > cell.clientWidth + 1) fail("clipped: cell", cell.textContent);
    }
  }
}

const meet = (a: Box, b: Box, by = 1.5) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > by && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > by;

function checkOverlaps(words: Word[], fail: Fail) {
  words.forEach((a, i) => {
    for (const b of words.slice(i + 1)) {
      if (a.owner === b.owner && a.block === b.block) continue; // runs of one paragraph
      if (meet(a, b)) fail("words overlap", `${a.text} | ${b.text}`);
    }
  });
}

const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** No line runs through words, unless a shape drawn after the line covers it under them. */
function checkLines(slide: HTMLElement, words: Word[], rel: Rel, fail: Fail) {
  const filled = [...slide.querySelectorAll<HTMLElement>("div[data-kind='shape']")].filter((o) => getComputedStyle(o).backgroundColor !== "rgba(0, 0, 0, 0)");
  const origin = slide.getBoundingClientRect();
  for (const line of slide.querySelectorAll("line")) {
    const matrix = line.getScreenCTM()!;
    const point = (x: number, y: number) => {
      const q = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: q.x - origin.left, y: q.y - origin.top };
    };
    const a = point(line.x1.baseVal.value, line.y1.baseVal.value);
    const b = point(line.x2.baseVal.value, line.y2.baseVal.value);
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2) + 1;
    for (const w of words) {
      for (let k = 0; k <= steps; k++) {
        const x = a.x + ((b.x - a.x) * k) / steps;
        const y = a.y + ((b.y - a.y) * k) / steps;
        if (!(x > w.x + 1 && x < w.x + w.w - 1 && y > w.y + 1.5 && y < w.y + w.h - 1.5)) continue;
        const covered = filled.some((o) => {
          const r = rel(o.getBoundingClientRect());
          return follows(line, o) && follows(o, w.owner) && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        });
        if (!covered) fail("line through words", w.text);
        break;
      }
    }
  }
}

const rgb = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => (c.startsWith("color(") ? v * 255 : v));
const luminance = (c: string) => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Words on a shape lie wholly on it, and can be read against it: 4.5 to 1, 3 to 1 for large words. */
function checkGrounds(slide: HTMLElement, words: Word[], rel: Rel, fail: Fail) {
  const grounds = [{ x: 0, y: 0, w: 1280, h: 720, colour: getComputedStyle(slide).backgroundColor, node: slide as Element, edges: false }];
  for (const el of slide.querySelectorAll("div[data-kind='shape'], svg[data-kind='shape'] polygon, tr, td, th")) {
    const style = getComputedStyle(el);
    const colour = el instanceof SVGElement ? style.fill : style.backgroundColor;
    if (!colour || colour === "none" || colour === "rgba(0, 0, 0, 0)" || Number(style.opacity) < 0.9) continue;
    // Cells and irregular shapes count for contrast, not for edges.
    const edges = el instanceof HTMLDivElement && style.borderTopLeftRadius === "0px";
    grounds.push({ ...rel(el.getBoundingClientRect()), colour, node: el, edges });
  }
  for (const w of words) {
    let under = grounds[0]!;
    for (const g of grounds.slice(1)) {
      if (!follows(g.node, w.el) && !g.node.contains(w.el)) continue;
      const ix = Math.min(w.x + w.w, g.x + g.w) - Math.max(w.x, g.x);
      const iy = Math.min(w.y + w.h, g.y + g.h) - Math.max(w.y, g.y);
      if (ix <= 1.5 || iy <= 1.5) continue;
      if (ix >= w.w - 2 && iy >= w.h - 2) under = g;
      else if (g.edges && g.w > 8 && g.h > 8) fail("words cross a shape's edge", w.text);
    }
    const [hi, lo] = [luminance(w.colour), luminance(under.colour)].sort((a, b) => b - a) as [number, number];
    const ratio = (hi + 0.05) / (lo + 0.05);
    const large = w.size >= 22 || (w.size >= 18 && w.weight >= 600);
    if (ratio < (large ? 3 : 4.5)) fail(`contrast ${ratio.toFixed(1)}`, w.text);
  }
}

/** The lines of an element as laid out, top to bottom: how many words each holds and how wide it is. */
function linesOf(el: Element) {
  const rows: { mid: number; words: number; left: number; right: number }[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const word of node.textContent!.matchAll(/[^ \n]+/g)) {
      const range = document.createRange();
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      for (const box of range.getClientRects()) {
        let row = rows.find((r) => Math.abs(r.mid - (box.top + box.height / 2)) < box.height / 2);
        if (!row) rows.push((row = { mid: box.top + box.height / 2, words: 0, left: box.left, right: box.right }));
        row.words++;
        row.left = Math.min(row.left, box.left);
        row.right = Math.max(row.right, box.right);
      }
    }
  }
  return rows.sort((a, b) => a.mid - b.mid);
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1.5;

/** The headline, and what every content slide carries, in the places the design gives them. */
function checkCarries(slide: HTMLElement, plan: CheckPlan, rel: Rel, fail: Fail) {
  const byRole = (role: string) => slide.querySelector<HTMLElement>(`[data-kind='text'][data-role='${role}']`);
  const title = byRole("title");
  if (!title) return void fail("title", "missing");
  const rows = linesOf(title);
  if (rows.length > (plan.cover ? 3 : 2)) fail("title", `${rows.length} lines`);
  for (const chart of slide.querySelectorAll<HTMLElement>("[data-role='chart-title']")) if (!chart.dataset.unit) fail("unit", chart.textContent);
  const panel = slide.querySelector<HTMLElement>("[data-role='panel']");
  const at = panel && rel(panel.getBoundingClientRect());
  if (!at || !near(at.x, plan.panel.x) || !near(at.y, plan.panel.y) || !near(at.w, plan.panel.w) || !near(at.h, plan.panel.h)) fail("deck design", "the panel is not in its place");
  if (!plan.places) return;
  if (rows.length > 1) {
    const longest = Math.max(...rows.map((r) => r.right - r.left));
    const last = rows[rows.length - 1]!;
    if (rows.some((r) => r.words < 2)) fail("headline balance", `one word alone: ${title.textContent}`);
    else if (last.right - last.left < longest * 0.45) fail("headline balance", `short last line: ${title.textContent}`);
  }
  for (const role of ["tracker", "source", ...(plan.places.page ? ["page"] : [])]) if (!byRole(role)) fail(role, "missing");
  if (byRole("source") && !byRole("source")!.textContent!.includes("Source:")) fail("source", "no source named");
  const t = rel(title.getBoundingClientRect());
  if (!near(t.x, plan.places.title.x) || !near(t.y, plan.places.title.y) || !near(t.w, plan.places.title.w) || !near(t.h, plan.places.title.h)) fail("deck design", "the headline is not in its place");
  const tracker = byRole("tracker");
  if (tracker) {
    const r = rel(tracker.getBoundingClientRect());
    if (!near(r.x, plan.places.tracker.x) || !near(r.y, plan.places.tracker.y)) fail("deck design", "the tracker is not in its place");
  }
}

/** Content stands inside a region of the design, and nothing outside the slide. */
function checkPlaces(objects: HTMLElement[], plan: CheckPlan, rel: Rel, fail: Fail) {
  for (const o of objects) {
    const role = o.dataset.role ?? "";
    const name = o.textContent || o.dataset.id;
    const r = rel(o.getBoundingClientRect());
    if (role !== "bleed" && o.dataset.kind !== "line" && (r.x < -1 || r.y < -1 || r.x + r.w > 1281 || r.y + r.h > 721)) fail("outside the slide", name);
    if (plan.cover || FRAME.includes(role) || plan.layout.includes(o.dataset.id ?? "")) continue;
    // A line's drawing is 8 pixels wider than the line on every side.
    const pad = o.dataset.kind === "line" ? 9 : 2;
    const inside = plan.regions.some((g) => r.x >= g.x - pad && r.y >= g.y - pad && r.x + r.w <= g.x + g.w + pad && r.y + r.h <= g.y + g.h + pad);
    if (!inside) fail("outside its region", `${name} @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`);
  }
}

const lineCount = (el: Element) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  return new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top / 4))).size;
};

/** Room to spare: PowerPoint breaks lines itself, so words fit in 92 % of their box without gaining a line. */
function checkSpare(objects: HTMLElement[], fail: Fail) {
  for (const el of objects.filter((o) => o.dataset.kind === "text" || o.dataset.kind === "words")) {
    const blocks = [...el.children];
    if (getComputedStyle(el).whiteSpace === "pre") {
      const range = document.createRange();
      const widest = Math.max(0, ...blocks.map((block) => (range.selectNodeContents(block), range.getBoundingClientRect().width)));
      if (widest > el.clientWidth * 0.92 + 0.5) fail("no room to spare: one line", el.textContent);
      continue;
    }
    const before = blocks.reduce((sum, b) => sum + lineCount(b), 0);
    const width = el.style.width;
    el.style.width = `${parseFloat(width) * 0.92 + 0.5}px`;
    if (blocks.reduce((sum, b) => sum + lineCount(b), 0) > before) fail("no room to spare: gains a line", el.textContent);
    el.style.width = width;
  }
  for (const cell of objects.filter((o) => o.dataset.kind === "table").flatMap((t) => [...t.querySelectorAll<HTMLElement>("td, th")])) {
    const style = getComputedStyle(cell);
    const room = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    for (const block of cell.querySelectorAll<HTMLElement>(":scope > div")) {
      const before = lineCount(block);
      block.style.width = `${room * 0.92 + 0.5}px`;
      if (lineCount(block) > before || block.scrollWidth > block.clientWidth + 1) fail("no room to spare: cell", block.textContent);
      block.style.width = "";
      const most = cell.tagName === "TH" && block.textContent!.trim().split(/\s+/).length <= 3 ? 1 : 2;
      if (lineCount(block) > most) fail(`cell runs to ${lineCount(block)} lines`, block.textContent);
    }
  }
}
