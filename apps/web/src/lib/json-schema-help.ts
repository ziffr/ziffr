// Help while typing a View Design (GLOSSARY: View Design, Playground): which fields and values the format allows where
// the cursor is, and what the field there means, read from the format's own JSON Schema, the one the checks run.
// Pure text in, answers out, so it is tested without a browser; the editor (components/json-editor-cm.tsx) only draws them.
// Security: nothing is fetched or run; the text is the person's own, read with a tolerant parser, and nothing leaves the page.
import { parser } from "@lezer/json";
import type { SyntaxNode } from "@lezer/common";
import type { Schema } from "@ziffr/core/json-check";

/** One thing the editor may offer: a field name or an allowed value, with what it means. */
type HelpItem = { label: string; apply: string; info?: string; kind: "field" | "value" };
/** Where to offer them: the text from `from` to `to` is replaced by the chosen item's `apply`. */
export type HelpFound = { from: number; to: number; items: HelpItem[] };

type Step = { key: string; at: Record<string, string> } | { index: number };

const read = (text: string, n: SyntaxNode): unknown => {
  try {
    return JSON.parse(text.slice(n.from, n.to));
  } catch {
    return undefined;
  }
};
const isValue = (n: SyntaxNode) => ["String", "Number", "True", "False", "Null", "Object", "Array"].includes(n.name);

/** The schemas a schema stands for: references followed, a choice split into its branches. */
function flatten(root: Schema, s: Schema | undefined, depth = 0): Schema[] {
  if (!s || depth > 8) return [];
  if (s.$ref) return flatten(root, root.$defs?.[s.$ref.replace("#/$defs/", "")], depth + 1);
  if (s.oneOf) return s.oneOf.flatMap((b) => flatten(root, b, depth + 1));
  return [s];
}

/** The `mark` and `format` an object names, which say which branch of a choice it follows. */
function discriminators(text: string, obj: SyntaxNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (let p = obj.firstChild; p; p = p.nextSibling) {
    if (p.name !== "Property") continue;
    const k = p.getChild("PropertyName");
    let v = k ? k.nextSibling : null;
    while (v && !isValue(v)) v = v.nextSibling;
    const key = k ? read(text, k) : undefined;
    if ((key === "mark" || key === "format") && v?.name === "String") {
      const value = read(text, v);
      if (typeof value === "string") out[key] = value;
    }
  }
  return out;
}

/** Where a value or an object sits in the file, from the top. */
function pathOf(text: string, node: SyntaxNode): Step[] {
  const steps: Step[] = [];
  for (let n: SyntaxNode = node; n.parent; n = n.parent) {
    const p = n.parent;
    if (p.name === "Property" && n.name !== "PropertyName") {
      const k = p.getChild("PropertyName");
      const key = k ? read(text, k) : undefined;
      if (typeof key === "string" && p.parent) steps.unshift({ key, at: discriminators(text, p.parent) });
    } else if (p.name === "Array") {
      let index = 0;
      for (let s = n.prevSibling; s; s = s.prevSibling) if (isValue(s)) index++;
      steps.unshift({ index });
    }
  }
  return steps;
}

/** The schemas that can hold what is at `steps`. */
function schemasAt(root: Schema, steps: Step[]): Schema[] {
  let now = flatten(root, root);
  for (const step of steps) {
    if ("index" in step) now = now.flatMap((s) => flatten(root, s.items));
    else
      now = now.flatMap((s) => {
        if (!fits(s, step.at)) return [];
        return flatten(root, s.properties?.[step.key]);
      });
  }
  return now;
}

/** Whether an object schema is the branch an object with these `mark` and `format` follows. */
function fits(s: Schema, at: Record<string, string>): boolean {
  const c = s.properties?.mark?.const;
  const f = s.properties?.format?.const;
  return !((typeof c === "string" && at.mark && c !== at.mark) || (typeof f === "string" && at.format && f !== at.format));
}

/** The schemas of the value of a property of the file. */
function propertySchemas(root: Schema, text: string, property: SyntaxNode): Schema[] {
  const k = property.getChild("PropertyName");
  const key = k ? read(text, k) : undefined;
  if (typeof key !== "string" || !property.parent) return [];
  return schemasAt(root, [...pathOf(text, property.parent), { key, at: discriminators(text, property.parent) }]);
}

/** The text a field's schema gives for help: its description, and the values it allows. */
function describe(schemas: Schema[]): string | null {
  const description = schemas.find((s) => s.description)?.description;
  const values = [...new Set(schemas.flatMap((s) => (s.enum ? s.enum.map(String) : s.const !== undefined ? [String(s.const)] : [])))];
  const bits = [description, values.length > 1 && values.length <= 30 ? `Allowed: ${values.join(", ")}.` : null].filter(Boolean);
  return bits.length ? bits.join("\n\n") : null;
}

/** Fields and values the format allows at `pos` (the cursor), or null when there is nothing to offer. */
export function completionsAt(schema: Schema, text: string, pos: number): HelpFound | null {
  const tree = parser.parse(text);
  const node = tree.resolveInner(pos, -1);
  // A field name being typed: the object that holds it decides which fields exist.
  const keyed = node.name === "PropertyName" ? node.parent?.parent : node.name === "Object" ? node : null;
  if (keyed && keyed.name === "Object") {
    const at = discriminators(text, keyed);
    const have = new Set<string>();
    for (let p = keyed.firstChild; p; p = p.nextSibling) {
      const k = p.name === "Property" ? p.getChild("PropertyName") : null;
      if (k && !(node.name === "PropertyName" && k.from === node.from)) {
        const v = read(text, k);
        if (typeof v === "string") have.add(v);
      }
    }
    const here = schemasAt(schema, pathOf(text, keyed)).filter((x) => fits(x, at));
    const seen = new Map<string, Schema[]>();
    for (const s of here) for (const [k, v] of Object.entries(s.properties ?? {})) if (!have.has(k)) seen.set(k, [...(seen.get(k) ?? []), ...flatten(schema, v)]);
    const items: HelpItem[] = [...seen].map(([label, ss]) => ({ label, apply: `"${label}": `, info: describe(ss) ?? undefined, kind: "field" as const }));
    if (!items.length) return null;
    const [from, to] = node.name === "PropertyName" ? [node.from, node.to] : [pos, pos];
    return { from, to, items };
  }
  // A value: one that is there (a string, a number) or the empty place after a colon.
  const parent = node.parent;
  const there = isValue(node) && node.name !== "Object" && (parent?.name === "Property" || parent?.name === "Array") ? node : null;
  const empty = node.name === "Property" && !node.getChild("String") && !node.getChild("Number") && !node.getChild("Array") ? node : null;
  if (!there && !empty) return null;
  const ss = there ? (parent?.name === "Property" ? propertySchemas(schema, text, parent) : schemasAt(schema, pathOf(text, there))) : propertySchemas(schema, text, empty as SyntaxNode);
  const value = there;
  const options = new Map<string, string | undefined>();
  for (const s of ss) {
    for (const v of s.enum ?? []) options.set(JSON.stringify(v), undefined);
    if (s.const !== undefined) options.set(JSON.stringify(s.const), s.description);
    if (s.type === "boolean") {
      options.set("true", undefined);
      options.set("false", undefined);
    }
  }
  if (!options.size) return null;
  const from = value ? value.from : pos;
  const to = value ? value.to : pos;
  return { from, to, items: [...options].map(([apply, info]) => ({ label: apply.replace(/^"|"$/g, ""), apply, info, kind: "value" as const })) };
}

/** What the field or value at `pos` means, in the format's own words, or null. */
export function hoverAt(schema: Schema, text: string, pos: number): { from: number; to: number; text: string } | null {
  const node = parser.parse(text).resolveInner(pos, 1);
  const name = node.name === "PropertyName" ? node : null;
  const property = name?.parent ?? (isValue(node) ? node.parent : null);
  if (!property || property.name !== "Property") return null;
  const ss = propertySchemas(schema, text, property);
  const words = describe(ss);
  if (!words) return null;
  const target = name ?? node;
  return { from: target.from, to: target.to, text: words };
}
