// The API reference page (spec 0002, ticket #50): docs/reference/api.md rendered from the OpenAPI document, so it is
// never written by hand. `pnpm --filter @ziffr/web api:reference` writes it; a test fails when it is out of date.
import type { openApiDocument } from "./openapi";

type Doc = ReturnType<typeof openApiDocument>;
type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; anyOf?: Schema[]; enum?: unknown[]; description?: string; $ref?: string; minimum?: number; maximum?: number; maxLength?: number; minLength?: number; pattern?: string; default?: unknown; maxItems?: number; format?: string };
type Operation = { summary: string; description: string; "x-scope": string; parameters?: { name: string; in: string; required: boolean; description?: string; schema: Schema }[]; requestBody?: { content: { "application/json": { schema: Schema } } }; responses: Record<string, { description: string; content?: { "application/json": { schema: Schema } } }> };

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** A short type for a table: string, integer 1–100, "a" | "b", array of object, or nullable. */
function typeOf(s: Schema, doc: Doc): string {
  if (s.$ref) return typeOf(resolve(s, doc), doc);
  if (s.anyOf) return s.anyOf.map((x) => typeOf(x, doc)).join(" or ");
  if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(", ");
  const t = Array.isArray(s.type) ? s.type.join(" or ") : (s.type ?? "any");
  if (t === "array") return `array of ${typeOf(s.items ?? {}, doc)}${s.maxItems !== undefined ? ` (at most ${s.maxItems})` : ""}`;
  const limits = [
    // zod writes the safe-integer bounds on every integer; they say nothing to a reader.
    s.minimum !== undefined && s.maximum !== undefined && s.maximum < Number.MAX_SAFE_INTEGER ? `${s.minimum} to ${s.maximum}` : "",
    s.maxLength !== undefined ? `at most ${s.maxLength} characters` : "",
    s.default !== undefined ? `default ${JSON.stringify(s.default)}` : "",
  ].filter(Boolean);
  return limits.length ? `${t}, ${limits.join(", ")}` : t;
}

const resolve = (s: Schema, doc: Doc): Schema => (s.$ref ? (doc.components.schemas[s.$ref.split("/").pop()!] as Schema) : s);

/** Rows for an object's fields, with nested objects (array items too) as dotted names. */
function fields(s: Schema, doc: Doc, prefix = ""): string[] {
  s = resolve(s, doc);
  const out: string[] = [];
  for (const [name, f] of Object.entries(s.properties ?? {})) {
    const full = `${prefix}${name}`;
    const required = (s.required ?? []).includes(name);
    out.push(`| \`${full}\` | ${cell(typeOf(f, doc))} | ${required ? "yes" : "no"} | ${cell(f.description ?? "")} |`);
    const inner = f.items ?? f.anyOf?.find((x) => x.type === "array")?.items ?? f;
    const nested = resolve(inner, doc);
    if (nested.properties && nested !== s) out.push(...fields(nested, doc, `${full}${inner === f ? "." : "[]."}`));
  }
  return out;
}

const table = (rows: string[]) => ["| Field | Type | Required | What it is |", "| --- | --- | --- | --- |", ...rows].join("\n");

/** The reference page as Markdown. */
export function renderReference(doc: Doc): string {
  const out = [
    "<!-- Generated from the OpenAPI document by `pnpm --filter @ziffr/web api:reference`. Never edit by hand. -->",
    "",
    `# ${doc.info.title}, version ${doc.info.version}`,
    "",
    doc.info.description,
    "",
    "Every path is under `/api/v1`. The machine-readable description is at `/api/v1/openapi.json`. To make a first call, see [the API guide](../guides/api.md).",
  ];
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, raw] of Object.entries(methods)) {
      const op = raw as Operation;
      out.push("", `## ${op.summary}`, "", `\`${method.toUpperCase()} ${path}\` · scope \`${op["x-scope"]}\``, "", op.description);
      if (op.parameters?.length) {
        out.push("", "**Parameters**", "", "| Name | In | Type | Required | What it is |", "| --- | --- | --- | --- | --- |");
        for (const p of op.parameters) out.push(`| \`${p.name}\` | ${p.in} | ${cell(typeOf(p.schema, doc))} | ${p.required ? "yes" : "no"} | ${cell(p.description ?? "")} |`);
      }
      if (op.requestBody) out.push("", "**Body** (JSON)", "", table(fields(op.requestBody.content["application/json"].schema, doc)));
      const [okStatus, ok] = Object.entries(op.responses).find(([s]) => Number(s) < 300)!;
      out.push("", `**Answer** (${okStatus})`, "", table(fields(ok.content!["application/json"].schema, doc)));
      out.push("", "**Errors**", "", ...Object.entries(op.responses).filter(([s]) => Number(s) >= 400).map(([s, r]) => `- ${s}: ${r.description}`));
    }
  }
  out.push("", "## Errors", "", "Every error answer has this shape:", "", "```json", '{ "error": { "code": "not_found", "message": "Not found." } }', "```", "");
  return out.join("\n");
}
