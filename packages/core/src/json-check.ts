// Checks a file people bring in (GLOSSARY: View Design, Analysis Recipe) before anything reads it: the text is parsed
// with every value's line kept, so a problem names its line, and held to a JSON Schema the reference is generated from.
// Security: nothing here runs what it reads. Size and depth are limited before the text is walked, so a hostile file
// cannot make the parser or the checks work without end.

/** The JSON Schema keywords these checks understand: enough for a file format, nothing that loads or runs anything. */
export type Schema = {
  $ref?: string;
  $defs?: Record<string, Schema>;
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
  const?: string | number | boolean;
  enum?: (string | number)[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  oneOf?: Schema[];
  default?: unknown;
};

/** One thing wrong with a file: where (a path such as `parts[2].show` and its line) and what, in plain words. */
export type Problem = { path: string; line: number | null; message: string };

/** A file read: its value and the line each path starts on. */
export type Parsed = { ok: true; value: unknown; lines: Map<string, number> } | { ok: false; problems: Problem[] };

/** The limits a text is held to before it is checked. */
export type TextLimits = { maxBytes: number; maxDepth: number };

const key = (parent: string, k: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? (parent ? `${parent}.${k}` : k) : `${parent}[${JSON.stringify(k)}]`);

/** Reads a JSON text, refusing it when it is larger or nested deeper than `limits`, and notes every value's line. */
export function parseJson(text: string, limits: TextLimits): Parsed {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > limits.maxBytes) return { ok: false, problems: [{ path: "", line: null, message: `The file is ${bytes.toLocaleString("en")} bytes; at most ${limits.maxBytes.toLocaleString("en")} are allowed.` }] };
  const lines = new Map<string, number>();
  let i = 0;
  let line = 1;
  const fail = (message: string): never => {
    throw new ParseError(message, line);
  };
  const space = () => {
    while (i < text.length) {
      const c = text[i];
      if (c === "\n") line++;
      else if (c !== " " && c !== "\t" && c !== "\r") break;
      i++;
    }
  };
  const string = (): string => {
    // JSON.parse reads the escapes; this only finds where the string ends.
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") i++;
      else if (text[i] === "\n" || text.charCodeAt(i) < 0x20) fail("A text runs over the end of its line: is a closing quote missing?");
      i++;
    }
    if (i >= text.length) fail("A text has no closing quote.");
    i++;
    try {
      return JSON.parse(text.slice(start, i)) as string;
    } catch {
      return fail("A text has an escape JSON does not know.");
    }
  };
  const value = (path: string, depth: number): unknown => {
    if (depth > limits.maxDepth) fail(`The file is nested more than ${limits.maxDepth} levels deep.`);
    space();
    lines.set(path, line);
    const c = text[i];
    if (c === "{") {
      i++;
      const out: Record<string, unknown> = {};
      space();
      if (text[i] === "}") return i++, out;
      for (;;) {
        space();
        if (text[i] !== '"') fail("Expected a field name in double quotes.");
        const at = line;
        const k = string();
        if (Object.prototype.hasOwnProperty.call(out, k)) fail(`The field “${k}” is given twice.`);
        space();
        if (text[i] !== ":") fail(`Expected “:” after “${k}”.`);
        i++;
        const p = key(path, k);
        const v = value(p, depth + 1);
        lines.set(p, lines.get(p) ?? at);
        // A plain record: "__proto__" and friends are data here, never the object's prototype.
        Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
        space();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return out; }
        fail("Expected “,” or “}”.");
      }
    }
    if (c === "[") {
      i++;
      const out: unknown[] = [];
      space();
      if (text[i] === "]") return i++, out;
      for (;;) {
        out.push(value(`${path}[${out.length}]`, depth + 1));
        space();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return out; }
        fail("Expected “,” or “]”.");
      }
    }
    if (c === '"') return string();
    const lit = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    if (!lit) return fail(i >= text.length ? "The file ends too early." : "Expected a value: a text in double quotes, a number, true, false, a list or an object.");
    i += lit[0].length;
    return JSON.parse(lit[0]);
  };
  try {
    const v = value("", 1);
    space();
    if (i < text.length) fail("There is more after the end of the file’s object.");
    return { ok: true, value: v, lines };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, problems: [{ path: "", line: e.line, message: e.message }] };
    throw e;
  }
}

class ParseError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
  }
}

const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);
const WORD: Record<string, string> = { object: "an object", array: "a list", string: "a text", integer: "a whole number", number: "a number", boolean: "true or false", null: "null" };
const quoted = (xs: (string | number)[]) => xs.map((x) => `“${x}”`).join(", ");
const chars = (s: string) => [...s].length;

/** How many problems a check names at most. */
export const MAX_PROBLEMS = 50;

/** Holds `value` to `schema` (and its `$defs`), adding each problem found to the list; `lines` names where. */
export function checkSchema(root: Schema, value: unknown, lines: Map<string, number> = new Map()): Problem[] {
  const problems: Problem[] = [];
  // A file with hundreds of mistakes is named by its first ones: enough to fix it, and the answer stays small.
  const at = (path: string, message: string) => void (problems.length < MAX_PROBLEMS && problems.push({ path, line: lines.get(path) ?? null, message }));
  const resolve = (s: Schema): Schema => {
    if (!s.$ref) return s;
    const name = s.$ref.replace("#/$defs/", "");
    const def = root.$defs?.[name];
    if (!def) throw new Error(`The schema refers to ${s.$ref}, which it does not define.`);
    return resolve(def);
  };
  const walk = (raw: Schema, v: unknown, path: string): void => {
    const s = resolve(raw);
    if (s.oneOf) {
      // Each branch names itself by one field's constant (a mark's "mark", a step's "fn"): the value is held to the
      // branch it names, so a mistake is reported in that branch's words, not as "matches none of".
      const picked = pick(s.oneOf.map(resolve), v);
      if (picked.branch) walk(picked.branch, v, path);
      else at(picked.path ? key(path, picked.path) : path, picked.message);
      return;
    }
    const t = typeOf(v);
    if (s.type && !(t === s.type || (s.type === "number" && t === "integer"))) return void at(path, `must be ${WORD[s.type]}, not ${WORD[t]}.`);
    if (s.const !== undefined && v !== s.const) return void at(path, `must be “${s.const}”.`);
    if (s.enum && !s.enum.includes(v as string)) return void at(path, `must be one of ${quoted(s.enum)}.`);
    if (typeof v === "string") {
      if (s.minLength !== undefined && chars(v) < s.minLength) at(path, s.minLength === 1 ? "must not be empty." : `must have at least ${s.minLength} characters.`);
      if (s.maxLength !== undefined && chars(v) > s.maxLength) at(path, `has ${chars(v)} characters; at most ${s.maxLength} are allowed.`);
      if (s.pattern !== undefined && !new RegExp(s.pattern, "u").test(v)) at(path, s.description ? `must be ${s.description.replace(/\.$/, "")}.` : "is not allowed here.");
    }
    if (typeof v === "number") {
      if (s.minimum !== undefined && v < s.minimum) at(path, `must be at least ${s.minimum}.`);
      if (s.maximum !== undefined && v > s.maximum) at(path, `must be at most ${s.maximum}.`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) at(path, s.minItems === 1 ? "must not be empty." : `must have at least ${s.minItems} entries.`);
      if (s.maxItems !== undefined && v.length > s.maxItems) return void at(path, `has ${v.length} entries; at most ${s.maxItems} are allowed.`);
      if (s.items) v.forEach((x, n) => walk(s.items!, x, `${path}[${n}]`));
    }
    if (t === "object") {
      const o = v as Record<string, unknown>;
      for (const r of s.required ?? []) if (!Object.prototype.hasOwnProperty.call(o, r)) at(path, `needs the field “${r}”.`);
      for (const [k, x] of Object.entries(o)) {
        const p = key(path, k);
        const sub = s.properties && Object.prototype.hasOwnProperty.call(s.properties, k) ? s.properties[k] : undefined;
        if (sub) walk(sub, x, p);
        // The path already names the field (`marks[0].onClick`), so the message does not say it again.
        else if (s.additionalProperties === false) at(p, `is not a field here${s.properties ? `; the fields are ${quoted(Object.keys(s.properties))}` : ""}.`);
      }
    }
  };
  walk(root, value, "");
  return problems;
}

/** Which branch of a oneOf a value names: by a type (a text or an object), or by the constant of one of its fields. */
function pick(branches: Schema[], v: unknown): { branch?: Schema; path?: string; message: string } {
  const t = typeOf(v);
  const sameType = branches.filter((b) => !b.type || b.type === t || (b.type === "number" && t === "integer"));
  if (!sameType.length) return { message: `must be ${[...new Set(branches.map((b) => WORD[b.type ?? "object"]))].join(" or ")}, not ${WORD[t]}.` };
  if (sameType.length === 1) return { branch: sameType[0], message: "" };
  const field = Object.entries(sameType[0].properties ?? {}).find(([, p]) => p.const !== undefined)?.[0];
  if (!field) throw new Error("A oneOf needs a field with a constant that names each branch.");
  const names = sameType.map((b) => b.properties?.[field]?.const as string);
  const o = v as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(o, field)) return { message: `needs the field “${field}”: one of ${quoted(names)}.` };
  const branch = sameType.find((b) => b.properties?.[field]?.const === o[field]);
  return branch ? { branch, message: "" } : { path: field, message: `must be one of ${quoted(names)}.` };
}
