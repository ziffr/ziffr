// The Extension manifest, ziffr.extension/1 (GLOSSARY: Extension Kit): `extension.json`, the file that names an Extension,
// its author, licence, signature and the Ziffr it was written for, so Packs can name it and the checks know what to
// expect. Plain data: the schema below is the only definition, and docs/reference/extension.schema.json is generated from it.
import { checkFormat, parseJson, type Problem, type Schema } from "@ziffr/pack/json-check";
import { plainText } from "@ziffr/pack/file-text";

/** The format this Kit writes and reads. */
export const EXTENSION_FORMAT = "ziffr.extension/1";
/** Every manifest format Ziffr ever published, oldest first. */
export const EXTENSION_FORMATS = [EXTENSION_FORMAT] as const;
/** The licences an Extension's own directory may carry (spec 0042, decision 3). */
export const EXTENSION_LICENSES = ["MIT", "Apache-2.0"] as const;
/** The kinds a value passed to or returned from an Extension has (spec 0041's `/2` format). */
export const VALUE_KINDS = ["series", "value", "table", "model"] as const;
/** The exact limits a manifest is held to. */
export const EXTENSION_LIMITS = { bytes: 16_384, depth: 6, inputs: 6, params: 6, name: 80, summary: 200, points: 120, drivers: 6, relativeTolerance: 1e-6 } as const;

/** What an Extension is handed or gives back: a series, a single value, a table or a fitted model. */
export type ValueKind = (typeof VALUE_KINDS)[number];

/** One Extension manifest, in the newest format. */
export type ExtensionManifest = {
  format: typeof EXTENSION_FORMAT;
  id: string;
  version: string;
  kind: "method" | "mark";
  name: string;
  summary: string;
  author: { name: string };
  license: (typeof EXTENSION_LICENSES)[number];
  signature: {
    inputs: { name: string; kind: ValueKind }[];
    params?: { name: string; min: number; max: number; default: number }[];
    gives: ValueKind | "shapes";
  };
  limits: { points: number; drivers?: number };
  /** How the Method's answer is compared with its reference's: exactly (the default), or within a relative tolerance. */
  equality?: { relative: number };
  ziffr: string;
  price: "free";
};

const WORD = "^[a-z][a-zA-Z0-9]{0,23}$";

/** The JSON Schema of ziffr.extension/1: the one definition the checks run and docs/reference is generated from. */
export const EXTENSION_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.extension-1.json",
  title: "Ziffr Extension (ziffr.extension/1)",
  description: "The manifest of an Extension: one Method or one mark written by someone other than Ziffr, checked by the Extension Kit and shipped in a Ziffr release.",
  type: "object",
  properties: {
    format: { const: EXTENSION_FORMAT, description: "The format and its version." },
    id: { type: "string", maxLength: 100, pattern: "^[a-z0-9][a-z0-9-]{0,38}/[a-z0-9][a-z0-9-]{0,59}$", description: "the author's handle and a slug, such as “acme/survival”, the same for every version" },
    version: { type: "string", maxLength: 20, pattern: "^(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})$", description: "three numbers, major, minor and patch, such as “1.2.0”; a change that alters a number is a new major version" },
    kind: { enum: ["method", "mark"], description: "A Method is a pure function over series, tables and numbers; a mark is a drawing rule." },
    name: { ...plainText(EXTENSION_LIMITS.name), minLength: 1 },
    summary: { ...plainText(EXTENSION_LIMITS.summary), minLength: 1 },
    author: { type: "object", properties: { name: { ...plainText(EXTENSION_LIMITS.name), minLength: 1 } }, required: ["name"], additionalProperties: false },
    license: { enum: [...EXTENSION_LICENSES], description: "The licence of the Extension's own directory (its LICENSE file)." },
    signature: {
      type: "object",
      description: "What the Extension is handed and what it gives back.",
      properties: {
        inputs: {
          type: "array",
          maxItems: EXTENSION_LIMITS.inputs,
          items: { type: "object", properties: { name: { type: "string", pattern: WORD }, kind: { enum: [...VALUE_KINDS] } }, required: ["name", "kind"], additionalProperties: false },
        },
        params: {
          type: "array",
          maxItems: EXTENSION_LIMITS.params,
          items: { type: "object", properties: { name: { type: "string", pattern: WORD }, min: { type: "number" }, max: { type: "number" }, default: { type: "number" } }, required: ["name", "min", "max", "default"], additionalProperties: false },
        },
        gives: { enum: [...VALUE_KINDS, "shapes"], description: "What comes back; a mark gives shapes, a Method one of the kinds." },
      },
      required: ["inputs", "gives"],
      additionalProperties: false,
    },
    limits: {
      type: "object",
      description: "The most the Extension is checked and run with.",
      properties: {
        points: { type: "integer", minimum: 1, maximum: EXTENSION_LIMITS.points, description: "the longest series it takes" },
        drivers: { type: "integer", minimum: 0, maximum: EXTENSION_LIMITS.drivers, description: "the most other series it takes beside the first" },
      },
      required: ["points"],
      additionalProperties: false,
    },
    equality: {
      type: "object",
      description: "How the checks compare the Method's answer with its reference's. Left out, they must be exactly equal; a Method that draws on a distribution may name a relative tolerance instead.",
      properties: { relative: { type: "number", minimum: 0, maximum: EXTENSION_LIMITS.relativeTolerance, description: "the largest relative difference accepted, above 0 and at most 1e-6" } },
      required: ["relative"],
      additionalProperties: false,
    },
    ziffr: { type: "string", maxLength: 20, pattern: "^>=(?:0|[1-9][0-9]{0,3})\\.(?:0|[1-9][0-9]{0,3})(?:\\.(?:0|[1-9][0-9]{0,3}))?$", description: "the oldest Ziffr it was written for, such as “>=0.14”" },
    price: { const: "free", description: "Free only for now; paid Extensions are a later decision." },
  },
  required: ["format", "id", "version", "kind", "name", "summary", "author", "license", "signature", "limits", "ziffr", "price"],
  additionalProperties: false,
};

/** What a schema cannot say: parameter ranges, names that are unique, and that a mark gives shapes and a Method does not. */
function meaning(m: ExtensionManifest, at: (path: string, message: string) => void): void {
  const names = new Set<string>();
  m.signature.inputs.forEach((x, i) => {
    if (names.has(x.name)) at(`signature.inputs[${i}].name`, `“${x.name}” is used twice: every input and parameter needs a name of its own.`);
    names.add(x.name);
  });
  (m.signature.params ?? []).forEach((p, i) => {
    const here = `signature.params[${i}]`;
    if (names.has(p.name)) at(`${here}.name`, `“${p.name}” is used twice: every input and parameter needs a name of its own.`);
    names.add(p.name);
    if (!(p.min < p.max)) at(`${here}.max`, "must be above min.");
    else if (p.default < p.min || p.default > p.max) at(`${here}.default`, "must be between min and max.");
  });
  if (m.equality && !(m.equality.relative > 0)) at("equality.relative", "must be above 0: leave equality out to require exact equality.");
  if (m.kind === "mark" && m.signature.gives !== "shapes") at("signature.gives", "of a mark must be “shapes”.");
  if (m.kind === "method" && m.signature.gives === "shapes") at("signature.gives", "of a Method must be a series, value, table or model: only a mark gives shapes.");
  if (m.kind === "mark" && !m.signature.inputs.length) at("signature.inputs", "of a mark must name what it draws: a mark takes its numbers from a Method.");
}

/** The result of checking a manifest: the manifest, or every problem with its line. */
export type ManifestCheck = { ok: true; manifest: ExtensionManifest } | { ok: false; problems: Problem[] };

/** Checks the text of `extension.json`: size and depth, the schema, then what a schema cannot say. */
export function checkManifest(text: string): ManifestCheck {
  const parsed = parseJson(text, { maxBytes: EXTENSION_LIMITS.bytes, maxDepth: EXTENSION_LIMITS.depth });
  if (!parsed.ok) return parsed;
  const res = checkFormat<ExtensionManifest>({ family: "ziffr.extension", reads: EXTENSION_FORMATS, schema: EXTENSION_SCHEMA, meaning }, parsed.value, parsed.lines);
  return res.ok ? { ok: true, manifest: res.value } : res;
}
