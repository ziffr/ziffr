// The set-up questions of an exported Pack (spec 0068; GLOSSARY: Pack, Position, Repeat, Metric Catalog), as the person
// who exports writes them under "Describe your Pack": the words of its preview, the question that fills each Position and
// lists each Repeat, and the numbers asked at set-up. They go into the Pack of what was picked, which makes it
// ziffr.pack/3. Pure.
// Security: the answers come from a browser. Only the fields named here are read, each by its own key; a Position,
// Repeat or number the file does not hold is ignored. Nothing is mended beyond spaces: what a Pack may hold is decided by
// the pack kit's own checks (the limits are in @ziffr/pack/set-up), and each of their refusals is said at its field. No
// text is ever made up from the Workspace, so no name or address of a person enters a file through these fields unless
// the person types it.
import type { PackAskEvery } from "@ziffr/pack/set-up";
import { checkPackValue, PACK_FORMAT_3, type Pack } from "./pack";

/** What the person wrote under "Set-up questions". Positions and Repeats are named by their key in the Pack, a number
 * asked by what was picked for it ("metric:12" or "catalog:7"); a number that is listed here is asked. */
export type PackSetUpChoice = {
  line?: string;
  happens?: string[];
  needs?: string[];
  positions?: Record<string, { question?: string; hint?: string }>;
  repeats?: Record<string, { question?: string }>;
  asks?: Record<string, { question?: string; name?: string; every?: PackAskEvery }>;
};

/** A field the pack kit refused: `field` is "line", "happens.0", "needs.1", "positions.<key>.question",
 * "repeats.<key>.question" or "asks.<what was picked>", the last with ".question", ".name" or ".every" after it where
 * one of its fields is meant. */
export type PackSetUpProblem = { field: string; message: string };

// Longer than any field may be, so that a long text is still refused for its length, and a huge one costs little.
const MOST = 1000;
// More lines than a field takes, so that one line too many is still refused.
const LINES_MOST = 10;

const object = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const own = (v: unknown, key: string): unknown => (Object.prototype.hasOwnProperty.call(object(v), key) ? object(v)[key] : undefined);
/** A text on one line, as a Pack keeps it; empty for anything that is no text. */
const words = (v: unknown) => (typeof v === "string" ? v.slice(0, MOST * 2).replace(/\s+/g, " ").trim().slice(0, MOST) : "");

/** The Pack with the set-up questions written into it, whether any was written, and, for the path of every field written,
 * which field of the form it is. `picked` names what was picked for each Metric Catalog entry, by its key. */
export function withSetUp(pack: Pack, picked: ReadonlyMap<string, string>, input: unknown): { pack: Pack; used: boolean; fields: Map<string, string> } {
  const fields = new Map<string, string>();
  let used = false;
  const put = (path: string, field: string) => { used = true; fields.set(path, field); };

  // The words of the preview. Once one is written, the sentence and at least one line of what happens are needed: they
  // are written empty then, for the checks to say so at their field.
  const line = words(own(input, "line"));
  const lines = (name: "happens" | "needs") => {
    const raw = own(input, name);
    return (Array.isArray(raw) ? raw.slice(0, 100) : []).flatMap((v, at) => { const text = words(v); return text ? [{ text, at }] : []; }).slice(0, LINES_MOST);
  };
  const happens = lines("happens");
  const needs = lines("needs");
  let setUp: Pack["setUp"];
  if (line || happens.length || needs.length) {
    setUp = { line, happens: happens.map((x) => x.text), ...(needs.length ? { needs: needs.map((x) => x.text) } : {}) };
    put("setUp.line", "line");
    put("setUp.happens", "happens.0");
    put("setUp.needs", "needs.0");
    happens.forEach((x, i) => put(`setUp.happens[${i}]`, `happens.${x.at}`));
    needs.forEach((x, i) => put(`setUp.needs[${i}]`, `needs.${x.at}`));
  }

  const positions = pack.positions?.map((p, i) => {
    const said = own(own(input, "positions"), p.key);
    const question = words(own(said, "question"));
    const hint = words(own(said, "hint"));
    if (question) put(`positions[${i}].question`, `positions.${p.key}.question`);
    if (hint) put(`positions[${i}].hint`, `positions.${p.key}.hint`);
    return { ...p, ...(question ? { question } : {}), ...(hint ? { hint } : {}) };
  });
  const repeats = pack.repeats?.map((r, i) => {
    const question = words(own(own(own(input, "repeats"), r.key), "question"));
    if (question) put(`repeats[${i}].question`, `repeats.${r.key}.question`);
    return { ...r, ...(question ? { question } : {}) };
  });
  const metrics = pack.contents.metrics?.map((m, i) => {
    const ref = picked.get(m.key);
    const said = ref === undefined ? undefined : own(own(input, "asks"), ref);
    if (ref === undefined || said === undefined || said === null) return m;
    const here = `contents.metrics[${i}].ask`;
    put(here, `asks.${ref}`);
    for (const f of ["question", "name", "every"]) put(`${here}.${f}`, `asks.${ref}.${f}`);
    // Every field is written, filled or not, so that an empty one is refused at its place.
    return { ...m, ask: { question: words(own(said, "question")), name: words(own(said, "name")), every: words(own(said, "every")) as PackAskEvery } };
  });

  if (!used) return { pack, used, fields };
  return {
    pack: {
      ...pack, format: PACK_FORMAT_3,
      ...(setUp ? { setUp } : {}), ...(positions ? { positions } : {}), ...(repeats ? { repeats } : {}),
      contents: { ...pack.contents, ...(metrics ? { metrics } : {}) },
    },
    used, fields,
  };
}

/** What the pack kit refuses of the set-up questions, field by field. The rest of the file is checked when it is made:
 * `pack` must have a manifest that passes, or the checks that need the whole file are not reached. */
export function setUpProblems(pack: Pack, picked: ReadonlyMap<string, string>, input: unknown): PackSetUpProblem[] {
  const made = withSetUp(pack, picked, input);
  if (!made.used) return [];
  const res = checkPackValue(made.pack);
  return res.ok ? [] : res.problems.flatMap((p) => { const field = made.fields.get(p.path); return field ? [{ field, message: p.message }] : []; });
}
