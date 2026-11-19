// The texts a file people bring in may hold (GLOSSARY: View Design, Analysis Recipe, Pack): one rule for plain text,
// shared by every format, so a name in a Pack is held to exactly what a name in a View Design is.
// Security: refusing markup, templates and web addresses keeps a file obviously harmless to whoever reads it.
import type { Schema } from "./json-check";

// Plain text: letters, digits, spaces and everyday punctuation. No < or > (so no HTML), no braces, brackets or
// backslashes (so nothing that reads as a template or a script), no line breaks, and no web address or scheme
// (://, www., javascript:, data:, url( ). Ziffr draws text as text anyway.
const NO_ADDRESS = "(?![\\s\\S]*(?:://|[Ww][Ww][Ww]\\.|[Jj][Aa][Vv][Aa][Ss][Cc][Rr][Ii][Pp][Tt]:|[Dd][Aa][Tt][Aa]:|[Uu][Rr][Ll]\\())";
const CHARS = "[\\p{L}\\p{M}\\p{N} .,;:!?'\"’‘“”«»()%€$£¥+\\-–—/&#*=_·…°]";

/** The pattern of plain text, as a JSON Schema `pattern` (read with the `u` flag). */
export const PLAIN = `^${NO_ADDRESS}${CHARS}*$`;

/** Plain text that may also hold Placeholders such as {metric} or {latest} (GLOSSARY: Placeholder): only the known
 * ones, each a fixed word, so braces can never read as a template of anything else. */
export const WORDS = `^${NO_ADDRESS}(?:${CHARS}|\\{(?:metrics|metric|period|latest|change yoy|change prev|top row|target)(?: [1-9])?\\})*$`;

/** A plain text of at most `max` characters, described as `description` in the schema and its messages. */
export const plainText = (max: number, description = "plain text, without markup or web addresses"): Schema => ({ type: "string", maxLength: max, pattern: PLAIN, description });

/** Words of a widget or slide, which may hold Placeholders, of at most `max` characters. */
export const words = (max: number): Schema => ({ type: "string", maxLength: max, pattern: WORDS, description: "plain text, without markup or web addresses; Placeholders such as {metric} are allowed" });

/** The pattern of an item's key in a Pack, such as “mrr” or “saas-overview”: also how a formula names it ({mrr}). */
export const KEY = "^[a-z][a-z0-9-]{0,39}$";

/** An item's key in a Pack, or a reference to one, in a schema. */
export const itemKey = (description: string): Schema => ({ type: "string", pattern: KEY, description });
