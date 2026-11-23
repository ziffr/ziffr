// @ts-nocheck
// Sealed Workflow numbers (spec 0028, ticket #248; GLOSSARY: Workflow, Unusual Value, Tell, Workspace Key): the level of a
// Workflow's check step (`changePct`) and what a Tell step waits for (`condition.value` or `.share`) are numbers people
// chose, so they are sealed inside the config as text, each bound to the Workflow and to its place in the config
// (`config.steps.2.change_pct`). Pure: it takes a cipher and returns copies; reading and writing the database stays in
// the functions that own the table. Where the Workspace does not seal, the config stays as it is; a config written
// before sealing passes through as it is until the re-encryption job seals it. Security: a number that does not
// open (another Workflow, a changed text, a destroyed key) never reads as ciphertext or 0: a Check holds the strictest level,
// a Tell step is left out.
import { isSealed, type WorkspaceCipher } from "./workspace-keys";

/** The strictest level a Check can have: the smallest change that counts as unusual. */
const STRICTEST = "1";

type Obj = Record<string, unknown>;
type Change = (column: string, text: string) => string | undefined;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A copy of a Workflow config with each sealable number passed through a change, by its place below `base`
 * (`<base>steps.<index>.change_pct`, `<base>steps.<index>.condition.value`). A step whose number the change leaves out
 * (it does not open) is dropped. The change gets and returns text: a check level that comes back sealed stays text, one
 * that comes back plain (not sealing, or just opened) is a number. */
export function mapConfigNumbers<T>(config: T, change: Change, base: string): T {
  if (!isObj(config) || !Array.isArray(config.steps)) return config;
  const steps: unknown[] = [];
  config.steps.forEach((step, i) => {
    if (!isObj(step)) { steps.push(step); return; }
    const at = `${base}steps.${i}.`;
    if (step.type === "check" && (typeof step.changePct === "number" || typeof step.changePct === "string")) {
      const text = String(step.changePct);
      const out = change(`${at}change_pct`, text);
      if (out === undefined) return;
      if (out === text) { steps.push(step); return; }
      const n = Number(out);
      if (isSealed(out)) steps.push({ ...step, changePct: out });
      // A level that is no number is no reason to drop the guard: the strictest one holds.
      else steps.push({ ...step, changePct: Number.isFinite(n) ? n : Number(STRICTEST) });
      return;
    }
    if (step.type === "tell" && isObj(step.condition)) {
      const key = typeof step.condition.value === "string" ? "value" : typeof step.condition.share === "string" ? "share" : null;
      if (!key) { steps.push(step); return; }
      const out = change(`${at}condition.${key}`, step.condition[key] as string);
      if (out !== undefined) steps.push({ ...step, condition: { ...step.condition, [key]: out } });
      return;
    }
    steps.push(step);
  });
  return { ...config, steps } as T;
}

/** The change that seals a number's text for a place; the opposite of `open` below. */
const seal = (cipher: WorkspaceCipher, id: number): Change => (column, text) => cipher.seal({ table: "workflows", column, row: id }, text);
/** The change that opens a number's text of a place: a plain one as it is. A sealed one that does not open must not
 * make a guard vanish: a Check whose level is lost holds the strictest one (every change is unusual, so Approval still
 * happens), and a Tell step that cannot tell what it waits for is left out. */
const open = (cipher: WorkspaceCipher, id: number): Change => (column, text) => {
  if (!isSealed(text)) return text;
  return cipher.open({ table: "workflows", column, row: id }, text) ?? (column.endsWith(".change_pct") ? STRICTEST : undefined);
};

/** A Workflow config with its numbers sealed for the Workflow; as it is where nothing is sealed. */
export function sealConfig<T>(cipher: WorkspaceCipher, id: number, config: T): T {
  return cipher.sealing ? mapConfigNumbers(config, seal(cipher, id), "config.") : config;
}

/** A stored Workflow config opened: plain numbers pass, sealed ones are opened, steps whose numbers do not open are left out. */
export function openConfig<T>(cipher: WorkspaceCipher, id: number, config: T): T {
  return mapConfigNumbers(config, open(cipher, id), "config.");
}
