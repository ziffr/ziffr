// @ts-nocheck
// What on a slide or a free layout would load from another site (spec 0009, ticket #131; GLOSSARY: Deck, Widget).
// Pure, on the tldraw documents decks and free layouts keep. Showing a deck, also through a View Link, must not tell
// other sites that someone looked, so only images stored in the document itself (uploaded, `data:` URLs) may stay;
// bookmarks, embeds, linked images and images or videos from elsewhere may not.

/** An uploaded image: stored in the document, loaded from nowhere. */
const UPLOADED = /^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);base64,/i;

type Rec = { id?: unknown; typeName?: unknown; type?: unknown; props?: Record<string, unknown> | null; fromId?: unknown; toId?: unknown };

/** Why one record would reach another site, or null when it would not. */
function outside(r: Rec): string | null {
  const props = r.props ?? {};
  if (r.typeName === "asset") {
    if (r.type === "bookmark") return "a link preview";
    if (r.type === "image" || r.type === "video") {
      const src = props.src;
      // An asset without a source yet (an upload still running) loads nothing.
      if (src === null || src === undefined || src === "") return null;
      return typeof src === "string" && UPLOADED.test(src) ? null : r.type === "video" ? "a video from another site" : "an image from another site";
    }
    return null;
  }
  if (r.typeName === "shape") {
    if (r.type === "bookmark") return "a link preview";
    if (r.type === "embed") return "an embedded page";
    if (r.type === "image" && typeof props.url === "string" && props.url.trim()) return "an image that links to another site";
  }
  return null;
}

/** How deep free layouts placed inside one another are read; the editors never nest them, so this is plenty, and
 * one nested deeper is refused (and left out when shown) rather than left unread. */
const MAX_DEPTH = 4;

/** A widget shape's settings, kept as a JSON string on slides and as an object elsewhere, or null. */
function settingsOf(r: Rec): Record<string, unknown> | null {
  const raw = r.props?.settings;
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  // Always parsed: a text check first could be dodged with JSON escapes ("\\u0063anvas") that parse to the same thing.
  if (typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** The free layout drawn inside a widget shape (its `canvas.document`), or undefined. */
const nestedDocument = (r: Rec): unknown => (r.typeName === "shape" ? (settingsOf(r)?.canvas as { document?: unknown } | null | undefined)?.document : undefined);

/** The records of a tldraw document (`{ store: { id: record } }`), or none. */
function records(document: unknown): [string, Rec][] {
  const store = (document as { store?: unknown } | null)?.store;
  if (!store || typeof store !== "object") return [];
  return Object.entries(store as Record<string, unknown>).filter(([, r]) => r && typeof r === "object") as [string, Rec][];
}

/** What in this document would load from or link to another site, in words for the person saving it; empty when
 * nothing would. */
export function deckOutsideContent(document: unknown, depth = 0): string[] {
  const found = records(document).flatMap(([, r]) => {
    const own = outside(r);
    // A widget on a slide can be a free layout with a document of its own: it is read the same way.
    const inner = nestedDocument(r);
    if (inner && depth >= MAX_DEPTH) return [...(own ? [own] : []), "layouts nested too deeply"];
    return [...(own ? [own] : []), ...(inner ? deckOutsideContent(inner, depth + 1) : [])];
  });
  return [...new Set(found)];
}

/** The document without anything that would load from or link to another site, for showing a deck or a free layout
 * saved before such content was refused. Shapes using a removed asset go with it. Returns the document unchanged
 * when nothing is removed. */
export function stripOutsideContent<T>(document: T, depth = 0): T {
  let changed = false;
  // Free layouts inside widget shapes first, each written back the way it was kept (a JSON string or an object).
  const entries = records(document).map(([key, r]): [string, Rec] => {
    const inner = nestedDocument(r);
    if (!inner) return [key, r];
    // Nested deeper than is read: the widget goes rather than be shown unread.
    if (depth >= MAX_DEPTH) { changed = true; return [key, { ...r, typeName: "removed" }]; }
    const cleaned = stripOutsideContent(inner, depth + 1);
    if (cleaned === inner) return [key, r];
    changed = true;
    const settings = { ...settingsOf(r)!, canvas: { ...(settingsOf(r)!.canvas as object), document: cleaned } };
    return [key, { ...r, props: { ...r.props, settings: typeof r.props?.settings === "string" ? JSON.stringify(settings) : settings } }];
  });
  const removed = new Set(entries.filter(([, r]) => outside(r) !== null || r.typeName === "removed").map(([key]) => key));
  if (!removed.size && !changed) return document;
  // An image or video shape whose asset was removed would show a broken frame: it goes too.
  for (const [key, r] of entries) {
    const asset = r.props?.assetId;
    if (r.typeName === "shape" && typeof asset === "string" && removed.has(asset)) removed.add(key);
  }
  // Arrows are bound to the shapes they point at (ticket #153), so a binding to a removed shape would leave the arrow
  // pointing at nothing: the binding goes, and the arrow stays where it was last drawn.
  for (const [key, r] of entries) {
    if (r.typeName === "binding" && (removed.has(String(r.fromId)) || removed.has(String(r.toId)))) removed.add(key);
  }
  const store = Object.fromEntries(entries.filter(([key]) => !removed.has(key)));
  return { ...(document as object), store } as T;
}

/** Refuses a document with anything that would load from or link to another site, saying what to do. */
export function assertNoOutsideContent(document: unknown, what: "deck" | "layout"): void {
  const found = deckOutsideContent(document);
  if (found.length) throw new Error(`This ${what} has ${found.join(", ")}, which would load from another site whenever it is shown. Remove it, or paste the image itself instead of a link.`);
}

/** A widget as it may be shown: a free layout without anything from other sites (see stripOutsideContent). */
export function widgetWithoutOutside<W extends { settings?: unknown }>(w: W): W {
  const canvas = (w.settings as { canvas?: { document?: unknown } | null } | null | undefined)?.canvas;
  if (!canvas?.document) return w;
  const document = stripOutsideContent(canvas.document);
  return document === canvas.document ? w : { ...w, settings: { ...(w.settings as object), canvas: { ...canvas, document } } };
}
