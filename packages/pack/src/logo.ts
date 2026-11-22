// A logo as a file may bring it (GLOSSARY: Pack, Theme): one picture as a data address, held to the checks that keep
// hostile images out. The core uses these very functions for a Theme's logo, so `npx @ziffr/pack check` and the server
// cannot disagree (spec 0039). Security: the picture is untrusted. A PNG or JPEG is only measured, never parsed for
// text; an SVG is refused unless it is plain; the type it says must be the type its bytes have. Pure, no dependencies.

/** The most a Theme's logo may weigh, in bytes, decoded. */
export const LOGO_MAX_BYTES = 256_000;
/** The most a Pack's logo may weigh, in bytes, decoded: a Marketplace lists Packs by the dozen with a logo each. */
export const PACK_LOGO_MAX_BYTES = 128_000;
/** The most a raster logo may measure on each side, in pixels. */
export const LOGO_MAX_PIXELS = 512;

type Kind = "png" | "jpeg" | "svg+xml";

/** The pixel size of a PNG or JPEG from its header, or null when the bytes are not that picture. */
function pixelSize(b: Uint8Array, kind: "png" | "jpeg"): { w: number; h: number } | null {
  if (kind === "png") {
    // The 8-byte signature, then the first chunk must be IHDR (length 13): width and height follow.
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return null;
    if (b[8] || b[9] || b[10] || b[11] !== 13 || b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
    return { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  // Walk the segments by their lengths (so a thumbnail inside EXIF is never read) to the frame header.
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** Why this is not a logo Ziffr keeps and shows, in words for the person who wrote it, or null when it is one: a PNG,
 * JPEG or plain SVG (no WebP) as a base64 data address, at most `maxBytes` decoded, a PNG or JPEG at most
 * LOGO_MAX_PIXELS each side, and the bytes the type they say. */
export function logoProblem(v: unknown, maxBytes: number = LOGO_MAX_BYTES): string | null {
  if (typeof v !== "string") return "must be a picture as a data address.";
  const m = /^data:image\/(png|jpeg|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) return "must be a PNG, JPEG or SVG as a base64 data address, such as “data:image/png;base64,…”.";
  if (m[2].length * 0.75 > maxBytes + 3) return `is larger than the ${maxBytes.toLocaleString("en")} bytes a logo may weigh here.`;
  let raw: string;
  try { raw = atob(m[2]); } catch { return "is not valid base64."; }
  if (raw.length > maxBytes) return `is larger than the ${maxBytes.toLocaleString("en")} bytes a logo may weigh here.`;
  const kind = m[1] as Kind;
  if (kind === "svg+xml") {
    const res = svgClean(utf8(raw));
    if (!res.ok) return `is an SVG that is not plain: ${res.reason}.`;
    return res.svg.length > maxBytes ? `is larger than the ${maxBytes.toLocaleString("en")} bytes a logo may weigh here.` : null;
  }
  const size = pixelSize(Uint8Array.from(raw, (c) => c.charCodeAt(0)), kind);
  if (!size) return `is not a ${kind === "png" ? "PNG" : "JPEG"}: its bytes say otherwise.`;
  if (size.w < 1 || size.h < 1 || size.w > LOGO_MAX_PIXELS || size.h > LOGO_MAX_PIXELS) return `measures ${size.w} by ${size.h} pixels; at most ${LOGO_MAX_PIXELS} on each side are allowed.`;
  return null;
}

/** The bytes of a binary string read as UTF-8, or null when they are not valid UTF-8 (the SVG is then refused). */
function utf8(raw: string): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))); } catch { return "\u0000"; }
}

/** The logo as it may be stored, served and put in a Pack's output, or null when it is not one (see `logoProblem`). A
 * raster picture is returned as it came; an SVG is the one Ziffr serialized itself from what it parsed (see `svgClean`),
 * so what was checked is exactly what a browser later reads, with nothing for two parsers to read differently. */
export function cleanLogo(v: unknown, maxBytes: number = LOGO_MAX_BYTES): string | null {
  if (logoProblem(v, maxBytes) !== null) return null;
  const s = v as string;
  if (!s.startsWith("data:image/svg+xml")) return s;
  const res = svgClean(utf8(atob(s.slice(s.indexOf(",") + 1))));
  if (!res.ok) return null;
  const bytes = new TextEncoder().encode(res.svg);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** The width over the height of a logo that passed `logoProblem`, read from its header (PNG, JPEG) or its root `width`
 * and `height` or `viewBox` (an SVG Ziffr serialized itself, see `cleanLogo`), kept between 0.05 and 20; 3 when the
 * picture says nothing usable. Pure, and never runs or renders anything. */
export function logoRatio(v: unknown): number {
  const clamp = (r: number) => (Number.isFinite(r) && r > 0 ? Math.min(20, Math.max(0.05, r)) : 3);
  if (typeof v !== "string" || logoProblem(v) !== null) return 3;
  const m = /^data:image\/(png|jpeg|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) return 3;
  let raw: string;
  try { raw = atob(m[2]); } catch { return 3; }
  if (m[1] === "svg+xml") {
    const text = utf8(raw);
    const at = text.indexOf("<svg");
    const root = at < 0 ? "" : text.slice(at, (text.indexOf(">", at) + 1) || at);
    const num = (n: string) => { const a = new RegExp(`\\s${n}="([0-9.]+)(?:px)?"`).exec(root); return a ? Number(a[1]) : NaN; };
    const vb = /\sviewBox="\s*[-0-9.e]+[\s,]+[-0-9.e]+[\s,]+([0-9.e]+)[\s,]+([0-9.e]+)\s*"/.exec(root);
    if (vb) return clamp(Number(vb[1]) / Number(vb[2]));
    return clamp(num("width") / num("height"));
  }
  const size = pixelSize(Uint8Array.from(raw, (c) => c.charCodeAt(0)), m[1] as "png" | "jpeg");
  return size ? clamp(size.w / size.h) : 3;
}

/** Whether this is a logo Ziffr keeps and shows (see `logoProblem`). */
export function logoOk(v: unknown, maxBytes: number = LOGO_MAX_BYTES): v is string {
  return logoProblem(v, maxBytes) === null;
}


// The SVG check parses, it does not pattern-match: a strict reader for the small part of XML a logo needs builds a tree,
// the tree is held to lists of elements, attributes and namespaces, and the SVG is written out again from the tree.
// Whatever the reader does not understand is refused: a DOCTYPE, an entity, a processing instruction, CDATA, a
// non-ASCII name, an unclosed or ill-formed anything. Comments are dropped.

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const ELEMENTS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "symbol", "marker", "title", "desc", "filter", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix", "feComposite", "feFlood", "feMerge", "feMergeNode", "feMorphology", "feDropShadow", "feComponentTransfer", "feFuncR", "feFuncG", "feFuncB", "feFuncA"]);
// No `style` attribute and no style element: a logo needs no CSS, and CSS can load things in ways no pattern can list.
const ATTRIBUTES = new Set(("id class lang role version viewBox preserveAspectRatio width height x y x1 x2 y1 y2 cx cy r rx ry fx fy d points transform " +
  "fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity " +
  "offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits patternUnits patternContentUnits patternTransform " +
  "font-family font-size font-style font-weight font-variant font-stretch text-anchor dominant-baseline alignment-baseline baseline-shift letter-spacing word-spacing text-decoration dx dy rotate textLength lengthAdjust writing-mode direction " +
  "display visibility color filter in in2 result stdDeviation mode type values flood-color flood-opacity operator k1 k2 k3 k4 radius tableValues slope intercept amplitude exponent baseFrequency " +
  "markerWidth markerHeight refX refY orient markerUnits vector-effect shape-rendering image-rendering color-interpolation color-interpolation-filters mix-blend-mode isolation paint-order href xlink:href xml:space").split(" "));
const TEXT_IN = new Set(["text", "tspan", "title", "desc"]);
const LIMITS = { depth: 40, nodes: 10_000, attributes: 64 };
// The only functions a value may call: a reference into the picture, colours, transforms and filters.
const FUNCTIONS = new Set(["url", "rgb", "rgba", "hsl", "hsla", "matrix", "translate", "scale", "rotate", "skewx", "skewy", "blur", "brightness", "contrast", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia", "drop-shadow"]);

type El = { name: string; attrs: [string, string][]; kids: (El | string)[] };
class Refuse extends Error {}

const NAME = /[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
const PROLOG = /<\?xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])utf-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*\?>/iy;

/** The text with its five predefined entities read; any other `&` is refused. */
function entities(t: string, fail: (m: string) => never): string {
  if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(t)) fail("an entity other than &amp; &lt; &gt; &quot; &apos;");
  return t.replace(/&(amp|lt|gt|quot|apos);/g, (_m, n: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[n]!);
}

/** Reads the SVG into a tree, or throws Refuse with what it did not accept. */
function readTree(src: string): El {
  let i = 0, nodes = 0;
  const fail = (m: string): never => { throw new Refuse(`${m}, ${line(src, i)}`); };
  const spaces = () => { while (i < src.length && " \t\r\n".includes(src[i])) i++; };
  /** Whitespace and comments between things; a comment may hold no "--" and must be closed. */
  const misc = () => {
    for (;;) {
      spaces();
      if (!src.startsWith("<!--", i)) return;
      const end = src.indexOf("-->", i + 4);
      if (end < 0) fail("a comment that is never closed");
      if (src.slice(i + 4, end).includes("--")) fail("“--” inside a comment");
      i = end + 3;
    }
  };
  const name = (): string => { NAME.lastIndex = i; const m = NAME.exec(src); if (!m) return fail("a name that is not plain ASCII letters, digits, “.”, “-” and “_”"); i += m[0].length; return m[0]; };
  const element = (depth: number): El => {
    if (depth > LIMITS.depth) fail(`elements nested deeper than ${LIMITS.depth}`);
    if (++nodes > LIMITS.nodes) fail(`more than ${LIMITS.nodes} elements`);
    i++; // the "<"
    const el: El = { name: name(), attrs: [], kids: [] };
    const seen = new Set<string>();
    for (;;) {
      const before = i;
      spaces();
      if (src.startsWith("/>", i)) { i += 2; return el; }
      if (src[i] === ">") { i++; break; }
      if (i === before) fail("an attribute that does not follow a space");
      if (i >= src.length) fail("a tag that is never closed");
      const at = name();
      spaces();
      if (src[i] !== "=") fail(`attribute “${at}” without a value`);
      i++; spaces();
      const q = src[i];
      if (q !== '"' && q !== "'") fail(`attribute “${at}” whose value is not quoted`);
      const end = src.indexOf(q, i + 1);
      if (end < 0) fail("a value that is never closed");
      const raw = src.slice(i + 1, end);
      if (raw.includes("<")) fail(`a “<” inside the value of “${at}”`);
      // Known names only, as each is read, so a flood of attributes costs nothing (and never a quadratic search).
      if (at !== "xmlns" && !at.startsWith("xmlns:") && !ATTRIBUTES.has(at)) fail(`attribute “${at}” is not one a plain logo has`);
      if (seen.has(at)) fail(`attribute “${at}” given twice`);
      if (seen.size >= LIMITS.attributes) fail(`more than ${LIMITS.attributes} attributes on one element`);
      seen.add(at);
      el.attrs.push([at, entities(raw, fail)]);
      i = end + 1;
    }
    for (;;) {
      if (i >= src.length) fail(`<${el.name}> is never closed`);
      if (src.startsWith("</", i)) {
        i += 2;
        if (name() !== el.name) fail(`</…> does not close <${el.name}>`);
        spaces();
        if (src[i] !== ">") fail("an end tag that is not closed");
        i++;
        return el;
      }
      if (src.startsWith("<!--", i)) { misc(); continue; }
      if (src.startsWith("<![CDATA[", i)) fail("CDATA");
      if (src.startsWith("<?", i)) fail("a processing instruction");
      if (src.startsWith("<!", i)) fail("a declaration such as <!DOCTYPE>");
      if (src[i] === "<") { el.kids.push(element(depth + 1)); continue; }
      const end = src.indexOf("<", i);
      if (end < 0) fail(`<${el.name}> is never closed`);
      const text = src.slice(i, end);
      if (text.includes("]]>")) fail("“]]>” in text");
      el.kids.push(entities(text, fail));
      i = end;
    }
  };
  if (/[^\t\n\r\u0020-\ufffd]|[\ufffe\uffff]/.test(src.replace(/[\u{10000}-\u{10ffff}]/gu, "x"))) throw new Refuse("a control or non-character code point");
  PROLOG.lastIndex = 0;
  if (src.startsWith("<?")) { const m = PROLOG.exec(src); if (!m) fail("a processing instruction or XML declaration other than a plain one"); i = m![0].length; }
  misc();
  if (src[i] !== "<") fail("no <svg> element");
  const root = element(1);
  misc();
  if (i < src.length) fail("something after the <svg> element");
  return root;
}

/** "line N", for the place an index is at. */
const line = (src: string, i: number) => `line ${src.slice(0, i).split("\n").length}`;

// A value that names anything but a place in this picture, or that is code, by whatever way it is written.
const BAD_VALUE = /url\s*\(\s*['"]?\s*(?!#)|image-set|src\s*\(|@import|expression\s*\(|-moz-binding|behavior\s*:|j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:|vbscript\s*:|(?<![a-z])data\s*:|\\/i;

/** Holds the tree to the allowlists and returns the one the SVG is written from: root namespaces set, comments gone. */
function plainTree(root: El): El {
  const walk = (el: El, isRoot: boolean): El => {
    if (!ELEMENTS.has(el.name)) throw new Refuse(`<${el.name}> is not an element a plain logo has`);
    if (isRoot !== (el.name === "svg")) throw new Refuse(isRoot ? "the first element is not <svg>" : "<svg> inside the picture");
    const attrs: [string, string][] = [];
    for (const [n, v] of el.attrs) {
      if (n === "xmlns" || n.startsWith("xmlns:")) {
        if (!isRoot || (n === "xmlns" ? v !== SVG_NS : n !== "xmlns:xlink" || v !== XLINK_NS)) throw new Refuse(`namespace “${n}” is not allowed: only SVG and xlink`);
        continue;
      }
      if (!ATTRIBUTES.has(n)) throw new Refuse(`attribute “${n}” is not one a plain logo has`);
      if ((n === "href" || n === "xlink:href") && !v.startsWith("#")) throw new Refuse(`“${n}” points outside the picture`);
      if (BAD_VALUE.test(v)) throw new Refuse(`the value of “${n}” loads something or runs`);
      if (n !== "font-family") for (const f of v.matchAll(/([A-Za-z][A-Za-z-]*)\s*\(/g)) if (!FUNCTIONS.has(f[1].toLowerCase())) throw new Refuse(`the value of “${n}” calls ${f[1]}(), which a plain logo does not`);
      attrs.push([n, v]);
    }
    const kids: (El | string)[] = [];
    for (const k of el.kids) {
      if (typeof k !== "string") kids.push(walk(k, false));
      else if (TEXT_IN.has(el.name)) kids.push(k);
      else if (k.trim() !== "") throw new Refuse(`text inside <${el.name}>`);
    }
    return { name: el.name, attrs, kids };
  };
  return walk(root, true);
}

const esc = (t: string, quote: boolean) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(quote ? /"/g : /(?!)/g, "&quot;");

/** The SVG written out from the tree: always the same form for the same tree, so cleaning twice changes nothing. */
function write(el: El, root: boolean): string {
  const ns = root ? ` xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"` : "";
  const attrs = el.attrs.map(([n, v]) => ` ${n}="${esc(v, true)}"`).join("");
  if (el.kids.length === 0) return `<${el.name}${ns}${attrs}/>`;
  return `<${el.name}${ns}${attrs}>${el.kids.map((k) => (typeof k === "string" ? esc(k, false) : write(k, false))).join("")}</${el.name}>`;
}

/** An SVG held to what a plain logo may be, written out again from what was parsed: the clean SVG, or why it was
 * refused. The clean SVG is the only form to store, serve or put in a Pack's output. */
export function svgClean(svg: string): { ok: true; svg: string } | { ok: false; reason: string } {
  try {
    return { ok: true, svg: write(plainTree(readTree(svg)), true) };
  } catch (e) {
    if (e instanceof Refuse) return { ok: false, reason: e.message };
    throw e;
  }
}

/** Whether an inline SVG is plain enough to show as a picture (see `svgClean`). */
export function svgIsPlain(svg: string): boolean {
  return svgClean(svg).ok;
}
