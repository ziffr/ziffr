// The texts a file people bring in may hold (GLOSSARY: View Design, Analysis Recipe, Pack): one rule for plain text,
// shared by every format, so a name in a Pack is held to exactly what a name in a View Design is.
// Security: refusing markup, templates and web addresses keeps a file obviously harmless to whoever reads it.
import type { Schema } from "./json-check.js";

// Plain text: letters, digits, spaces and everyday punctuation. No < or > (so no HTML), no braces, brackets or
// backslashes (so nothing that reads as a template or a script), no line breaks, and no web address or scheme
// (://, www., javascript:, data:, url( ). Ziffr draws text as text anyway. Nor a bare address such as "evil.example/x"
// or "https:evil.example", which mail, Slack and Telegram turn into links when a name goes out in a Prompt: a name, a dot
// and a top-level domain people link (evil.com, shop.de), any name and dot followed by a path (evil.example/x), or a
// scheme and a colon with no space after it. Ordinary names with a dot pass: "Node.js users", "No.of orders", "e.g.".
// A bare IP address ("1.2.3.4/x") is not refused: few clients link one, and refusing digits and dots would refuse
// version numbers and dates.
// JSON Schema patterns take no flags, so a word in any case is written letter by letter: [Hh][Tt]….
const anyCase = (word: string) => [...word].map((c) => (/[a-z]/.test(c) ? `[${c.toUpperCase()}${c}]` : c)).join("");
const SCHEMES = ["https?", "ftp", "mailto", "tel", "sms", "file", "vbscript"].map(anyCase).join("|");
// The top-level domains mail and chat clients turn into links without a scheme, and the punycode of any other.
const TLDS = ["com", "net", "org", "io", "co", "info", "biz", "app", "dev", "xyz", "me", "ai", "ly", "gl", "gg", "to", "cc", "tv", "ws", "link", "click", "site", "online", "top", "tk", "ru", "cn", "de", "uk", "fr", "eu", "us", "nl", "ch", "at", "it", "es"].map(anyCase).join("|");
// A name of letters, digits and dashes, a dot, then a known top-level domain that ends there, or any letters and a "/".
const HOST = `[\\p{L}\\p{N}](?:\\.(?:${TLDS})(?![\\p{L}\\p{N}])|\\.${anyCase("xn--")}|\\.\\p{L}{2,}/)`;
const NO_ADDRESS = `(?![\\s\\S]*(?:://|${anyCase("www")}\\.|${anyCase("javascript")}:|${anyCase("data")}:|${anyCase("url")}\\(|${HOST}|\\b(?:${SCHEMES}):(?!\\s)))`;
const CHARS = "[\\p{L}\\p{M}\\p{N} .,;:!?'\"’‘“”«»()%€$£¥+\\-–—/&#*=_·…°]";

/** The pattern of plain text, as a JSON Schema `pattern` (read with the `u` flag). */
export const PLAIN = `^${NO_ADDRESS}${CHARS}*$`;

// The text check reads Unicode the way a person does: a web address is also looked for in the text as it reads, with
// compatibility forms (NFKC) as the plain characters they stand for, and without combining marks and characters that
// show nothing. An accented letter stays a letter. Long runs of marks are cut first: all of them go anyway, and putting
// a very long run in Unicode's order takes more time than a text is worth.
const asRead = (text: string) => text.replace(/(\p{M}{8})\p{M}+/gu, "$1").normalize("NFKC").replace(/[\p{M}\p{Default_Ignorable_Code_Point}]/gu, "");
const NO_ADDRESS_READ = new RegExp(`^${NO_ADDRESS}`, "u");

/** Whether a text passes a JSON Schema `pattern`; a pattern of plain text, words or slide words, which refuses web
 * addresses, must also find none in the text as a person reads it. */
export function textPasses(pattern: string, text: string): boolean {
  return new RegExp(pattern, "u").test(text) && (!pattern.startsWith(`^${NO_ADDRESS}`) || NO_ADDRESS_READ.test(asRead(text)));
}

// The Placeholders every text knows. How a Metric is calculated (spec 0060) is added where a format says so: widgets,
// Slide Elements and, from ziffr.deck-template/3 on, a slide's text and boxes.
const SHARED_PLACEHOLDERS = "metrics|metric|period|latest|change yoy|change prev|top row|target";
const withPlaceholders = (names: string) => `^${NO_ADDRESS}(?:${CHARS}|\\{(?:${names})(?: [1-9])?\\})*$`;

/** Plain text that may also hold Placeholders such as {metric} or {latest} (GLOSSARY: Placeholder): only the known
 * ones, each a fixed word, so braces can never read as a template of anything else. For words filled each time they
 * are drawn. */
export const WORDS = withPlaceholders(`${SHARED_PLACEHOLDERS}|calculation note`);

/** As `WORDS` for a slide's text and boxes in formats /1 and /2: without {calculation note}. */
export const SAVED_WORDS = withPlaceholders(SHARED_PLACEHOLDERS);

/** Plain text that may hold the Placeholders of a slide's own words (spec 0057): those above, the quarter, the changes
 * and gaps between an element's Metrics ({gap 2 1}, {left 2 3}), the unit they are written in and the page number. */
export const SLIDE_WORDS = `^${NO_ADDRESS}(?:${CHARS}|\\{(?:metrics|metric|period|latest|change yoy|change prev|top row|target|calculation note|quarter weeks|quarter week|quarter|weeks left|change|scale|slide)(?: [1-9])?\\}|\\{(?:difference|gap|left) [1-9] [1-9]\\})*$`;

// What a person typed into the app: any text but control characters, line and paragraph separators, characters that
// reverse the direction of text and invisible ones (zero-width spaces, soft hyphens, tag characters, lone surrogates). Markup and web addresses are data here, never rendered or followed as such.
/** The pattern of what a person typed into the app. */
export const APP_TEXT = "^[^\\p{Cc}\\p{Cs}\\u00AD\\u200B\\u2060\\uFEFF\\u{E0000}-\\u{E007F}\\u2028\\u2029\\u061C\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]*$";

/** A text a person typed into the app, of at most `max` characters. */
export const appText = (max: number, description = "text without control characters, line breaks or characters that reverse its direction"): Schema => ({ type: "string", maxLength: max, pattern: APP_TEXT, description });

/** A plain text of at most `max` characters, described as `description` in the schema and its messages. */
export const plainText = (max: number, description = "plain text, without markup or web addresses"): Schema => ({ type: "string", maxLength: max, pattern: PLAIN, description });

/** Words of a widget or slide, which may hold Placeholders, of at most `max` characters. */
export const words = (max: number): Schema => ({ type: "string", maxLength: max, pattern: WORDS, description: "plain text, without markup or web addresses; Placeholders such as {metric} are allowed" });

/** Words of a slide's text or box in formats /1 and /2, of at most `max` characters. */
export const savedWords = (max: number): Schema => ({ type: "string", maxLength: max, pattern: SAVED_WORDS, description: "plain text, without markup or web addresses; Placeholders such as {metric} are allowed, {calculation note} only in widgets and Slide Elements, and in text and boxes from ziffr.deck-template/3 on" });

/** Words of a Slide Element, which may hold a slide's Placeholders, of at most `max` characters. */
export const slideWords = (max: number): Schema => ({ type: "string", maxLength: max, pattern: SLIDE_WORDS, description: "plain text, without markup or web addresses; Placeholders such as {gap 2 1} are allowed" });

/** The pattern of an item's key in a Pack, such as “mrr” or “saas-overview”: also how a formula names it ({mrr}). */
export const KEY = "^[a-z][a-z0-9-]{0,39}$";

/** An item's key in a Pack, or a reference to one, in a schema. */
export const itemKey = (description: string): Schema => ({ type: "string", pattern: KEY, description });
