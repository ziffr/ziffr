// The words and shapes a visitor of the demo puts on a deck (GLOSSARY: Demo Mode, Deck, Widget; spec 0051, ticket 10). A deck's
// store is a tldraw document, a large JSON of free text and shapes, and the next visitor sees it: in a demo visit every record
// is rebuilt from what is known to be safe before it is saved. Only the kinds of shape a slide holds stay (no picture, video,
// embed or link preview: those come from outside the demo), every word goes through the text rules (the cleaned text is what is
// saved), a widget's settings through the widget rules, and every other string must be a short token (an id, a colour, a font),
// so no free text can hide in a property nobody looks at. Like the rest of the demo's gates, nothing here acts outside a demo
// visit, and a refusal comes before the write that would hold the deck, so no change is half done.
import { DemoTextRefused, inDemoVisit, visitorOptionalText, visitorSettings } from "./demo-visitor-words";
import { demoTextOk } from "./demo-text";
import { DEMO_DECK_STORE_MAX_BYTES } from "./demo-limits";
import { chargeVisitorBytes, visitorSize } from "./demo-visitor-limits";
import { DEMO_TEXT_WORDS } from "./demo-words";
import { db } from "./db";
import { checkedDesignSetting } from "./widget-designs";
import { SNAPSHOT_PART_SHAPE } from "./snapshot-parts";
import type { Actor } from "./actor";
import type { WidgetSettings } from "./types";

const NOT_KEPT = "This deck has something the demo can't keep. Try a simpler slide.";
const PICTURES = "Pictures and links can't be added in the demo.";
/** What a refused deck, too large for the demo, says. */
export const DECK_TOO_LARGE = "This deck is too large for the demo.";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const notKept = () => new DemoTextRefused(NOT_KEPT);

/** The kinds of shape a slide holds: frames (the slides), text, a note, shapes, lines, drawing, the widget and the Snapshot Part (numbers only). */
const SHAPES = ["frame", "text", "geo", "note", "arrow", "line", "draw", "highlight", "group", "ziffr-widget", SNAPSHOT_PART_SHAPE];
/** What comes from outside the demo: refused with its own words. */
const OUTSIDE_SHAPES = ["image", "video", "embed", "bookmark"];
const RECORDS = ["document", "page", "shape", "binding"];
/** The nodes and marks of a rich text (tldraw's editor); anything else is not kept, and a link mark goes. */
const NODES = ["doc", "paragraph", "text", "hardBreak", "bulletList", "orderedList", "listItem", "heading"];
const MARKS = ["bold", "italic", "code", "strike"];
/** An id, an index, a colour, a font, a size: the strings a record is made of apart from its words. */
const TOKEN = /^[A-Za-z0-9_:#-]{0,64}$/;
/** A drawing's path: base64, as tldraw writes it. */
const PATH = /^[A-Za-z0-9+/=]{0,40000}$/;
const KEY = /^[A-Za-z0-9_$-]{1,64}$/;
/** The most records, array items and depth a deck of the demo has: far above any slide, and a bound on the walk. */
const MAX_RECORDS = 1500;
const MAX_WIDGETS = 60;
const MAX_SHAPES_PER_SLIDE = 300;
const MAX_ITEMS = 5000;
const MAX_DEPTH = 10;

/** One run of words: through the text rules, with the plain spaces at its ends kept (they separate it from the run next to it);
 * a run of nothing but blanks stays one space. */
function run(s: string): string {
  const r = demoTextOk(s, "description");
  if (r.ok) {
    let lead = 0;
    while (lead < 20 && s[lead] === " ") lead++;
    let trail = 0;
    while (trail < 20 && s[s.length - 1 - trail] === " ") trail++;
    return " ".repeat(lead) + r.text + " ".repeat(trail);
  }
  if (r.words === DEMO_TEXT_WORDS.empty) return s.length ? " " : "";
  throw new DemoTextRefused(r.words);
}

/** A rich text (the document of a text, a note or a shape's label): known nodes and marks only, words through the rules, and
 * attributes only where they are numbers or flags (an attribute that is a string could carry words or a link). */
function richText(node: unknown, depth: number): unknown {
  if (!isObj(node) || depth > MAX_DEPTH || typeof node.type !== "string" || !NODES.includes(node.type)) throw notKept();
  const out: Obj = { type: node.type };
  if (node.type === "text") out.text = run(String(node.text ?? ""));
  if (Array.isArray(node.content)) {
    if (node.content.length > 500) throw notKept();
    out.content = node.content.map((c) => richText(c, depth + 1));
    // Runs next to each other draw as one line ("evil" + ".com/login"): the words are checked joined, as a reader sees them,
    // each run alone being only normalised. A hard break reads as a space.
    const runs = (out.content as Obj[]).filter((c) => c.type === "text" || c.type === "hardBreak");
    if (runs.length > 1) {
      const joined = runs.map((c) => (c.type === "text" ? String(c.text) : " ")).join("");
      const r = demoTextOk(joined, "description");
      if (!r.ok && r.words !== DEMO_TEXT_WORDS.empty) throw new DemoTextRefused(r.words);
    }
  }
  if (Array.isArray(node.marks)) out.marks = node.marks.filter((m) => isObj(m) && typeof m.type === "string" && MARKS.includes(m.type)).map((m) => ({ type: (m as Obj).type }));
  if (isObj(node.attrs)) out.attrs = Object.fromEntries(Object.entries(node.attrs).filter(([k, v]) => KEY.test(k) && (v === null || typeof v === "number" || typeof v === "boolean")));
  return out;
}

/** A widget shape's settings (kept as JSON text on a slide), through the widget rules and the demo's size for them. */
function widgetSettings(actor: Pick<Actor, "workspaceId">, text: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(text || "{}"); } catch { throw notKept(); }
  if (!isObj(parsed)) throw notKept();
  const clean = visitorSettings(actor, parsed as WidgetSettings) as Obj;
  heldDesignOnly(clean);
  const out = JSON.stringify(clean);
  visitorSize(actor, out, 8 * 1024, "That widget is too large for the demo.");
  return out;
}

/** One value of a record, by the key it sits under: words are cleaned, a rich text rebuilt, a widget's settings checked, and any
 * other string must be a token. Numbers, flags and null pass; nothing else does. */
function value(actor: Pick<Actor, "workspaceId">, v: unknown, key: string, depth: number): unknown {
  if (depth > MAX_DEPTH) throw notKept();
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") {
    // A position or a size beyond any slide, or a scale or turn beyond any use, is a way to make the editor draw without end.
    const [lo, hi] = key === "scale" ? [0.01, 20] : key === "rotation" ? [-100, 100] : ["x", "y", "w", "h"].includes(key) ? [-20000, 20000] : [-Infinity, Infinity];
    if (!Number.isFinite(v) || v < lo || v > hi) throw new DemoTextRefused(NOT_KEPT);
    return v;
  }
  if (typeof v === "string") {
    // An address on a shape: dropped, a link to outside the demo.
    if (key === "url") return "";
    if (key === "text") return run(v);
    if (key === "name" || key === "title") return visitorOptionalText(actor, v, "name");
    if (key === "settings") return widgetSettings(actor, v);
    if (key === "path") { if (!PATH.test(v)) throw notKept(); return v; }
    if (!TOKEN.test(v)) throw notKept();
    return v;
  }
  if (Array.isArray(v)) {
    if (v.length > MAX_ITEMS) throw notKept();
    return v.map((x) => value(actor, x, key, depth + 1));
  }
  if (isObj(v)) {
    if (key === "richText") return richText(v, depth);
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) {
      if (!KEY.test(k)) throw notKept();
      out[k] = k === "richText" ? richText(x, depth + 1) : value(actor, x, k, depth + 1);
    }
    return out;
  }
  throw notKept();
}

/** What a design the Workspace does not hold is refused with. */
const DESIGN_NOT_HELD = "That View Design is not one of this Workspace's. Pick one from the list.";
/** The View Designs the Workspace holds, by id, as the synchronous walk below reads them. Set just before the walk and cleared right
 * after it (`withDesigns`); the walk has no await, so nothing else runs in between. */
let heldDesigns: Map<number, unknown> | null = null;

/** Runs a synchronous walk over a deck's records with the Workspace's View Designs at hand. They are read only when the text holds
 * the word "design" at all, as a deck saves itself after each change. */
async function withDesigns<T>(actor: Pick<Actor, "workspaceId">, subject: unknown, walk: () => T): Promise<T> {
  let held: Map<number, unknown> | null = null;
  if (JSON.stringify(subject ?? null).includes("design")) {
    const { data, error } = await db().from("view_designs").select("id, body").eq("workspace_id", actor.workspaceId);
    if (error) throw notKept();
    held = new Map((data ?? []).map((r) => [Number(r.id), r.body]));
  }
  heldDesigns = held;
  try { return walk(); } finally { heldDesigns = null; }
}

/** A widget's `design` in a visit, by the rule a dashboard's has (`allowedDesign`, view-designs.ts): only a View Design the Workspace
 * holds, drawn from the Workspace's own copy by its id, so a visitor's own words or links in a design never reach a deck. Applies to
 * the Free layout's seed too. Changes `s` in place. */
function heldDesignOnly(s: Obj): void {
  if (s.design !== undefined && s.design !== null) {
    const id = isObj(s.design) ? s.design.id : null;
    const body = typeof id === "number" ? heldDesigns?.get(id) : undefined;
    if (body === undefined) throw new DemoTextRefused(DESIGN_NOT_HELD);
    s.design = checkedDesignSetting({ id, body });
  }
  if (isObj(s.canvasSeed) && isObj(s.canvasSeed.settings)) {
    const inner: Obj = { ...s.canvasSeed.settings };
    heldDesignOnly(inner);
    s.canvasSeed = { ...s.canvasSeed, settings: inner };
  }
}

/** The words of the shapes of one slide (a slide layout's shapes come from the editor, as a deck's records do): in a demo
 * visit each shape is rebuilt as a deck's are. Unchanged elsewhere. */
export async function visitorSlideShapes<T>(actor: Pick<Actor, "workspaceId">, shapes: T): Promise<T> {
  if (!inDemoVisit(actor)) return shapes;
  if (!Array.isArray(shapes) || shapes.length > 80) throw notKept();
  return withDesigns(actor, shapes, () => shapes.map((sh) => {
    if (!isObj(sh) || typeof sh.type !== "string") throw notKept();
    if (OUTSIDE_SHAPES.includes(sh.type)) throw new DemoTextRefused(PICTURES);
    if (!SHAPES.includes(sh.type)) throw notKept();
    return value(actor, sh, "shape", 0);
  }) as T);
}

/** The editor's schema: version numbers by the names of what they version ("com.tldraw.shape.geo": 3), shown nowhere. Kept
 * as that and nothing else. */
function schemaOf(schema: unknown): Obj {
  const names = /^[A-Za-z0-9_.$-]{1,80}$/;
  if (!isObj(schema) || typeof schema.schemaVersion !== "number" || !Number.isFinite(schema.schemaVersion) || !isObj(schema.sequences)) throw notKept();
  const entries = Object.entries(schema.sequences);
  if (entries.length > 200 || entries.some(([k, v]) => !names.test(k) || typeof v !== "number" || !Number.isFinite(v))) throw notKept();
  return { schemaVersion: schema.schemaVersion, sequences: Object.fromEntries(entries) };
}

/** A deck's document for saving. In a demo visit: the records are rebuilt (see the module's comment), the result is at most
 * 512 KB, and what it grows by over the deck as stored (`before`) is counted against the visit's writes in this window, all before
 * the write that holds it. Unchanged outside a demo visit. */
export async function visitorDeckDocument(actor: Pick<Actor, "workspaceId">, document: unknown, before: unknown): Promise<unknown> {
  if (!inDemoVisit(actor)) return document;
  if (!isObj(document) || !isObj(document.store)) throw notKept();
  const records = Object.entries(document.store);
  if (records.length > MAX_RECORDS) throw new DemoTextRefused(DECK_TOO_LARGE);
  const store: Obj = {};
  // The shapes a deck draws are bounded as its size is: widgets (each computes its numbers when shown), and shapes on a slide.
  let widgets = 0;
  const perParent = new Map<string, number>();
  await withDesigns(actor, document.store, () => { for (const [id, r] of records) {
    if (!isObj(r) || r.id !== id || typeof r.typeName !== "string") throw notKept();
    if (r.typeName === "asset") throw new DemoTextRefused(PICTURES);
    if (!RECORDS.includes(r.typeName)) throw notKept();
    if (r.typeName === "shape") {
      if (typeof r.type !== "string") throw notKept();
      if (OUTSIDE_SHAPES.includes(r.type)) throw new DemoTextRefused(PICTURES);
      if (!SHAPES.includes(r.type)) throw notKept();
      if ((r.type === "ziffr-widget" || r.type === SNAPSHOT_PART_SHAPE) && ++widgets > MAX_WIDGETS) throw new DemoTextRefused(DECK_TOO_LARGE);
      const parent = String(r.parentId);
      perParent.set(parent, (perParent.get(parent) ?? 0) + 1);
      if ((perParent.get(parent) ?? 0) > MAX_SHAPES_PER_SLIDE) throw new DemoTextRefused(DECK_TOO_LARGE);
    }
    store[id] = value(actor, r, "record", 0);
  } });
  const clean = { store, ...(document.schema === undefined ? {} : { schema: schemaOf(document.schema) }) };
  await chargeVisitorDeckGrowth(actor, clean, before);
  return clean;
}

/** In a demo visit, holds a deck's document to 512 KB and counts what it grows by over the deck as stored (`before`)
 * against the visit's writes in this window, before the write that holds it. Nothing outside a demo visit. */
export async function chargeVisitorDeckGrowth(actor: Pick<Actor, "workspaceId">, document: unknown, before: unknown): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const bytes = visitorSize(actor, document, DEMO_DECK_STORE_MAX_BYTES, DECK_TOO_LARGE);
  const had = new TextEncoder().encode(JSON.stringify(before ?? null)).length;
  // A deck saves itself after each change: only what it grows by is counted, so working on a deck does not use the window up.
  if (bytes > had) await chargeVisitorBytes(actor, bytes - had);
}
