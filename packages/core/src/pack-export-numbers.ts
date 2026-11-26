// Where each number comes from, as the person who exports a Pack says it (spec 0058, GLOSSARY: Comes From, Pack): one
// answer per number picked, "a person types it" where nothing is said. Pure.
// Security: the answers come from a browser. Each is read by its own key through a Map-like own-property look-up, held
// to the format's own schema and its rule that a system is named exactly when another system sends the number, and
// refused in words; nothing is mended quietly beyond spaces at its ends.
import { checkSchema } from "./json-check";
import { COMES_FROM_FIELD, type PackComesFrom } from "@ziffr/pack/comes-from";

/** The answers by what was picked, as "metric:12" or "catalog:7". */
export type ComesFromChoice = Record<string, PackComesFrom>;

/** One answer that a Pack may not hold. */
export type ComesFromProblem = { ref: string; message: string };

/** An answer as the file would hold it, or why it may not. */
function read(input: unknown): { value: PackComesFrom } | { why: string } {
  if (input === undefined || input === null) return { value: { by: "person" } };
  if (typeof input !== "object") return { why: "Say where the number comes from." };
  const x = input as Record<string, unknown>;
  const words = (v: unknown) => (typeof v === "string" ? v.replace(/[ \t ]+/g, " ").replace(/^ | $/g, "") : v);
  const system = x.by === "system" ? words(x.system) : undefined;
  const note = words(x.note);
  const value = { by: x.by, ...(system ? { system } : {}), ...(note ? { note } : {}) };
  const [problem] = checkSchema(COMES_FROM_FIELD, value);
  if (problem) return { why: `${problem.path === "system" ? "The kind of system" : problem.path === "note" ? "The note" : "Where it comes from"} ${problem.message}` };
  if (x.by === "system" && !system) return { why: "Name the kind of system, such as CRM." };
  return { value: value as PackComesFrom };
}

const answerFor = (choice: unknown, ref: string) => (choice && typeof choice === "object" && Object.prototype.hasOwnProperty.call(choice, ref) ? (choice as Record<string, unknown>)[ref] : undefined);

/** Where the number picked as `ref` comes from, as the file holds it; throws in words, naming the number, when the
 * answer may not go into a Pack. */
export function comesFromOf(choice: unknown, ref: string, name: string): PackComesFrom {
  const r = read(answerFor(choice, ref));
  if ("why" in r) throw new Error(`The Pack cannot be made: “${name}”: ${r.why}`);
  return r.value;
}

/** Every answer a Pack may not hold, for the fields to say beside the number. */
export function comesFromProblems(choice: unknown): ComesFromProblem[] {
  const refs = choice && typeof choice === "object" ? Object.keys(choice).slice(0, 100) : [];
  return refs.flatMap((ref) => { const r = read(answerFor(choice, ref)); return "why" in r ? [{ ref, message: r.why }] : []; });
}
