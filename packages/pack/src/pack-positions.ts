// Positions and Repeats in a Pack (spec 0058, GLOSSARY: Position, Repeat, Pack): the places people fill when a Pack is
// set up, the parts Set up makes once for each line of a list, and the rules that tie ziffr.pack/2 items to both.
// Security: a Pack names no person. These checks only hold the file's keys to each other: every Position and Repeat an
// item names exists, a place for one person never takes a Position for several, and nothing outside a Repeat reaches into
// it where one thing is needed. Keys are matched through Maps, so "constructor" is only a key. A Position grants nothing
// by itself; who may fill it, and what is shared, is decided at Set up by the server.
import type { Schema } from "./json-check.js";
import { itemKey, plainText } from "./file-text.js";
import { formulaKeys } from "./formula-check.js";
import { workflowTemplateReferences } from "./workflow-template-file.js";
import type { Pack } from "./pack.js";

/** The limits of a Pack's Positions and Repeats: how many, their names, the lines of a Repeat and the people of one
 * place (as many as a Tell step takes). */
export const PACK_POSITION_LIMITS = { positions: 20, repeats: 5, name: 60, lines: 50, people: 20 } as const;

/** A named place that people fill when the Pack is set up (GLOSSARY: Position); `per` names the Repeat it belongs to,
 * so that each line has its own. In ziffr.pack/3, `question` and `hint` are what asks for its holder. */
export type PackPosition = { key: string; name: string; people: "one" | "several"; per?: string; question?: string; hint?: string };
/** A part of a Pack made once for each line of a list (GLOSSARY: Repeat); `max` is the most lines it takes. In
 * ziffr.pack/3, `question` is asked above the lines. */
export type PackRepeat = { key: string; name: string; max?: number; question?: string };

const L = PACK_POSITION_LIMITS;
const named = { ...plainText(L.name), minLength: 1 };
const repeatKey = itemKey("the key of one of the Pack's Repeats: the item is made once for each of its lines");
const position = itemKey("the key of one of the Pack's Positions");
const positions: Schema = { type: "array", minItems: 1, maxItems: L.positions, uniqueItems: true, items: position, description: "Keys of the Pack's Positions." };

/** The manifest's `positions` and `repeats`, as a schema. */
export const POSITION_FIELDS: Record<"positions" | "repeats", Schema> = {
  positions: {
    type: "array",
    maxItems: L.positions,
    description: "The places people fill when the Pack is set up, such as “Sales lead”. A Position grants nothing by itself.",
    items: {
      type: "object",
      properties: {
        key: itemKey("a key unique among the Pack's Positions and kept across its versions"),
        name: { ...named, description: "plain text, without markup or web addresses" },
        people: { enum: ["one", "several"], description: `How many people fill it; “several” is at most ${L.people}.` },
        per: itemKey("the key of one of the Pack's Repeats, when each line of it has its own holder"),
      },
      required: ["key", "name", "people"],
      additionalProperties: false,
    },
  },
  repeats: {
    type: "array",
    maxItems: L.repeats,
    description: "Parts Set up makes once for each line of a list a person types, such as each salesperson or site.",
    items: {
      type: "object",
      properties: {
        key: itemKey("a key unique among the Pack's Repeats and kept across its versions"),
        name: { ...named, description: "plain text, without markup or web addresses" },
        max: { type: "integer", minimum: 1, maximum: L.lines, description: `The most lines it takes; ${L.lines} without it.` },
      },
      required: ["key", "name"],
      additionalProperties: false,
    },
  },
};

/** What the wrapper of a Metric Catalog entry, a Dashboard Template and a Workflow Template gains in ziffr.pack/2. */
export const WRAPPER_FIELDS: { metrics: Record<string, Schema>; dashboards: Record<string, Schema>; workflows: Record<string, Schema> } = {
  metrics: {
    per: repeatKey,
    submitters: { ...positions, description: "Positions that submit the Metric's values." },
    standIn: { ...position, description: "the key of a Position for one person, who stands in for the Submitters" },
    viewers: { ...positions, description: "Positions Set up proposes to share the Metric with, as Viewers." },
    editors: { ...positions, description: "Positions Set up proposes to share the Metric with, as Editors." },
  },
  dashboards: {
    per: repeatKey,
    viewers: { ...positions, description: "Positions Set up proposes to share the dashboard with, as Viewers." },
    editors: { ...positions, description: "Positions Set up proposes to share the dashboard with, as Editors." },
  },
  workflows: { per: repeatKey },
};

type At = (path: string, message: string) => void;

/** A list of the manifest by key, refusing a key given twice. */
function byKey<T extends { key: string }>(list: T[], name: string, at: At): Map<string, T> {
  const out = new Map<string, T>();
  list.forEach((x, i) => {
    if (out.has(x.key)) at(`${name}[${i}].key`, `“${x.key}” is given twice: every entry of ${name} needs a key of its own.`);
    else out.set(x.key, x);
  });
  return out;
}

/** The Positions and Repeats of a Pack held to each other and to its items. `sound` tells which items passed their own
 * format's checks: only those are read further. */
export function checkPositions(p: Pack, sound: (item: object) => boolean, at: At): void {
  const repeats = byKey(p.repeats ?? [], "repeats", at);
  const places = byKey(p.positions ?? [], "positions", at);
  (p.positions ?? []).forEach((x, i) => {
    if (x.per !== undefined && !repeats.has(x.per)) at(`positions[${i}].per`, `names “${x.per}”, which is not a Repeat of this Pack.`);
  });
  // A place an item gives to a Position: `one` when it takes one person, `per` the item's own Repeat.
  const use = (path: string, key: string, one: boolean, per: string | undefined) => {
    const x = places.get(key);
    if (!x) return at(path, `names “${key}”, which is not a Position of this Pack.`);
    if (!one) return;
    if (x.people === "several") at(path, `names “${key}”, a Position for several people, where one person is needed.`);
    else if (x.per !== undefined && x.per !== per) at(path, `names “${key}”, a Position of the Repeat “${x.per}”: outside that Repeat it means everyone in all its lines, and one person is needed here.`);
  };
  const repeated = (path: string, per: string | undefined) => {
    if (per !== undefined && !repeats.has(per)) at(path, `names “${per}”, which is not a Repeat of this Pack.`);
  };
  metricPlaces(p, use, repeated, at);
  const entries = new Map((p.contents.metrics ?? []).map((m) => [m.key, m]));
  const dashboards = new Map((p.contents.dashboards ?? []).map((d) => [d.key, d]));
  (p.contents.dashboards ?? []).forEach((d, i) => {
    const here = `contents.dashboards[${i}]`;
    repeated(`${here}.per`, d.per);
    for (const field of ["viewers", "editors"] as const) d[field]?.forEach((k, n) => use(`${here}.${field}[${n}]`, k, false, d.per));
    if (!sound(d)) return;
    d.template.slots.forEach((slot, n) => {
      const entry = slot.suggests === undefined ? undefined : entries.get(slot.suggests);
      if (entry?.per !== undefined && entry.per !== d.per && !slot.multiple) at(`${here}.template.slots[${n}].suggests`, `names “${entry.key}”, made once per “${entry.per}”: a dashboard outside that Repeat takes it only in a Slot with “multiple”: true.`);
    });
  });
  (p.contents.workflows ?? []).forEach((w, i) => {
    const here = `contents.workflows[${i}]`;
    repeated(`${here}.per`, w.per);
    if (!sound(w)) return;
    const refs = workflowTemplateReferences(w.template);
    for (const r of refs.positions) use(`${here}.template.${r.path}`, r.key, r.one, w.per);
    for (const r of refs.dashboards) {
      const d = dashboards.get(r.key);
      if (!d) at(`${here}.template.${r.path}`, `names “${r.key}”, which is not a Dashboard Template of this Pack.`);
      else if (d.per !== undefined && d.per !== w.per) at(`${here}.template.${r.path}`, `names “${r.key}”, a dashboard made once per “${d.per}”: only a Workflow of the same Repeat can send it.`);
    }
  });
}

/** A Metric Catalog entry's places, and the rule of formulas: an entry may be computed from entries of its own Repeat
 * and from entries outside every Repeat. */
function metricPlaces(p: Pack, use: (path: string, key: string, one: boolean, per: string | undefined) => void, repeated: (path: string, per: string | undefined) => void, at: At) {
  const perOf = new Map((p.contents.metrics ?? []).map((m) => [m.key, m.per]));
  (p.contents.metrics ?? []).forEach((m, i) => {
    const here = `contents.metrics[${i}]`;
    repeated(`${here}.per`, m.per);
    m.submitters?.forEach((k, n) => use(`${here}.submitters[${n}]`, k, false, m.per));
    if (m.standIn !== undefined) {
      use(`${here}.standIn`, m.standIn, true, m.per);
      if (!m.submitters) at(`${here}.standIn`, "needs “submitters”: a Stand-in stands in for a Submitter.");
      else if (m.submitters.includes(m.standIn)) at(`${here}.standIn`, `“${m.standIn}” submits the values already: a Stand-in is never the Submitter.`);
    }
    for (const field of ["viewers", "editors"] as const) m[field]?.forEach((k, n) => use(`${here}.${field}[${n}]`, k, false, m.per));
    const formula = m.metric.formula;
    if (typeof formula !== "string") return;
    for (const field of ["submitters", "standIn"] as const) if (m[field] !== undefined) at(`${here}.${field}`, "is on a Derived Metric: it is computed and takes no values, so nobody submits it.");
    for (const key of formulaKeys(formula)) {
      const other = perOf.get(key);
      if (other !== undefined && other !== m.per) at(`${here}.metric.formula`, `{${key}} is made once per “${other}”: only an entry of the same Repeat can be computed from it, since a formula cannot name every line.`);
    }
  });
}
