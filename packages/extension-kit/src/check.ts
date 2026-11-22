// The Extension Kit's checks on a folder (GLOSSARY: Extension Kit): the shape (the files an Extension must have, the
// manifest, at most 400 lines for the implementation, a LICENSE that matches) and the static rules on every TypeScript
// file. Every problem names its file and line. Nothing here runs the Extension's code: that is the next ticket's checks.
import { checkManifest, type ExtensionManifest } from "./manifest.js";
import { checkRules, type RuleName } from "./rules.js";

/** The most lines an implementation (`method.ts` or `mark.ts`) may have. */
export const IMPLEMENTATION_MAX_LINES = 400;
/** The files every Extension has besides its implementation. */
export const REQUIRED_FILES = ["extension.json", "reference.ts", "cases.ts", "catalogue.md", "wording.ts", "LICENSE"] as const;

/** The name of the reason the shape check refuses an Extension. */
export type ShapeRule = "missing-file" | "empty-file" | "wrong-implementation" | "too-long" | "bad-manifest" | "license-mismatch";
/** One thing wrong with an Extension: its reason, the file and line (null for a file that is missing) and what, in plain words. */
export type ExtensionProblem = { rule: RuleName | ShapeRule; file: string; line: number | null; message: string };
/** An Extension's files: each path relative to its folder, with its text. */
export type ExtensionFiles = ReadonlyMap<string, string>;

/** Counts the lines of a text the way an editor does: a final line break does not start another. */
const lineCount = (text: string) => (text === "" ? 0 : text.replace(/\n$/, "").split("\n").length);

/** The manifest's problems as Extension problems, each with its line of `extension.json`, and the manifest when it is sound. */
function manifestProblems(text: string): { problems: ExtensionProblem[]; manifest?: ExtensionManifest } {
  const res = checkManifest(text);
  if (res.ok) return { problems: [], manifest: res.manifest };
  return { problems: res.problems.map((p) => ({ rule: "bad-manifest", file: "extension.json", line: p.line, message: `${p.path ? `${p.path} ` : ""}${p.message}` })) };
}

/** Whether a LICENSE text is the licence the manifest names. */
const licenceMatches = (text: string, licence: ExtensionManifest["license"]) => (licence === "MIT" ? /^\s*MIT License\b/.test(text) : /Apache License/.test(text) && /Version 2\.0/.test(text));

/** The shape checks: the files, the manifest, the length of the implementation, the licence. */
function shapeProblems(files: ExtensionFiles): { problems: ExtensionProblem[]; implementation?: string } {
  const problems: ExtensionProblem[] = [];
  const add = (rule: ShapeRule, file: string, line: number | null, message: string) => void problems.push({ rule, file, line, message });
  for (const f of REQUIRED_FILES) {
    const text = files.get(f);
    if (text === undefined) add("missing-file", f, null, `is missing: every Extension has ${REQUIRED_FILES.join(", ")} and method.ts or mark.ts.`);
    else if (text.trim() === "") add("empty-file", f, 1, "is empty.");
  }
  let manifest: ExtensionManifest | undefined;
  const mText = files.get("extension.json");
  if (mText !== undefined) {
    const m = manifestProblems(mText);
    problems.push(...m.problems);
    manifest = m.manifest;
  }
  const has = (f: string) => files.has(f);
  let implementation: string | undefined;
  if (manifest) {
    const want = manifest.kind === "method" ? "method.ts" : "mark.ts";
    const other = manifest.kind === "method" ? "mark.ts" : "method.ts";
    if (has(other)) add("wrong-implementation", other, 1, `is here, but extension.json says this is a ${manifest.kind}: it has ${want}.`);
    if (!has(want)) add("missing-file", want, null, `is missing: the implementation of a ${manifest.kind}.`);
    else implementation = want;
    const lic = files.get("LICENSE");
    if (lic !== undefined && lic.trim() !== "" && !licenceMatches(lic, manifest.license)) add("license-mismatch", "LICENSE", 1, `is not the ${manifest.license} licence that extension.json names.`);
  } else if (mText !== undefined) {
    // The manifest is broken, so which implementation it wants is not known: one of the two must be there.
    implementation = has("method.ts") ? "method.ts" : has("mark.ts") ? "mark.ts" : undefined;
    if (!implementation) add("missing-file", "method.ts", null, "is missing: an Extension has method.ts or mark.ts.");
  }
  if (!mText && !has("method.ts") && !has("mark.ts")) add("missing-file", "method.ts", null, "is missing: an Extension has method.ts or mark.ts.");
  if (implementation) {
    const n = lineCount(files.get(implementation) ?? "");
    if (n > IMPLEMENTATION_MAX_LINES) add("too-long", implementation, IMPLEMENTATION_MAX_LINES + 1, `has ${n} lines; at most ${IMPLEMENTATION_MAX_LINES} are allowed, so that a person can read it all.`);
  }
  return { problems, implementation };
}

/** Checks an Extension's files: the shape, then the static rules on every `.ts` file (`wording.ts` also on its words). */
export function checkExtensionFiles(files: ExtensionFiles): ExtensionProblem[] {
  const { problems } = shapeProblems(files);
  for (const [file, text] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!file.endsWith(".ts")) continue;
    for (const p of checkRules(file, text, { wording: file === "wording.ts" })) problems.push({ ...p, file });
  }
  return problems;
}

/** A problem as one line, the way `@ziffr/pack check` writes it: `file:line: message`. */
export const problemLine = (p: ExtensionProblem): string => `${p.file}${p.line ? `:${p.line}` : ""}: ${p.message}`;
