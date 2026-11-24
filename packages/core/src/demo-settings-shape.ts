// The shape of a widget's settings a visitor of the demo may save (GLOSSARY: Demo Mode, Widget, Finding, Panel, Callout; spec 0051,
// final review D3). The text rules (`demoTextOk`) only ever saw strings, so a word that was an array or an object skipped them and
// was drawn for every visitor (or made the page throw). Here every key a widget's settings are made of has a type, in ONE table,
// and the settings are REBUILT from it: a value of the wrong type refuses the whole save, a key that is not in the table is dropped
// (so `__proto__`, `constructor` and the like never reach the copy), and nested lists and objects are rebuilt the same way. Pure.
// The words among the strings are then cleaned by `visitorSettings` (demo-visitor-words.ts).
import { COMPARE_LABEL } from "./compare";
import { isDisplayPeriod } from "./display-periods";
import { SLOPE_CHOICES } from "./view-design";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** What a check answers for a value that does not fit. */
const BAD: unique symbol = Symbol("not-a-setting");
type Check = (v: unknown) => unknown;

/** The longest a word may be here, before the text rules apply their own limits: it only bounds what the rebuild accepts. */
const WORD_MAX = 1000;
const text = (max = WORD_MAX): Check => (v) => (typeof v === "string" && v.length <= max ? v : BAD);
const number: Check = (v) => (typeof v === "number" && Number.isFinite(v) ? v : BAD);
const flag: Check = (v) => (typeof v === "boolean" ? v : BAD);
const oneOf = (allowed: readonly unknown[]): Check => (v) => (allowed.includes(v) ? v : BAD);
const day: Check = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : BAD);
const list = (item: Check, max: number): Check => (v) => {
  if (!Array.isArray(v) || v.length > max) return BAD;
  const out: unknown[] = [];
  for (const x of v) {
    const c = item(x);
    if (c === BAD) return BAD;
    out.push(c);
  }
  return out;
};
/** An object rebuilt from the keys of `spec` only; a key that is there with the wrong type (or null where null is not meant) refuses all. */
const shape = (spec: Record<string, Check>): Check => (v) => {
  if (!isObj(v)) return BAD;
  const out: Obj = {};
  for (const [key, check] of Object.entries(spec)) {
    if (!Object.prototype.hasOwnProperty.call(v, key) || v[key] === undefined) continue;
    // A key may always be null (cleared): the settings' own types say `| null` or optional, and null draws as absent.
    const c = v[key] === null ? null : check(v[key]);
    if (c === BAD) return BAD;
    out[key] = c;
  }
  return out;
};

const anchor = shape({ type: oneOf(["rule", "period", "row"]), rule: text(20), period: text(40), label: text(WORD_MAX) });
const annotation = shape({ kind: oneOf(["callout", "ring", "note"]), anchor, text: text(), arrow: flag });
const callout = shape({ period: text(40), text: text(), rule: text(20) });
const panel = shape({
  annotations: list(annotation, 50), type: text(30), metricIds: list(number, 20), slot: number, measure: text(20), periods: number,
  highlight: text(80), projections: flag, sharedScale: flag,
  refLine: shape({ kind: text(20), value: number, label: text() }),
  bridge: shape({ mode: text(20), period: text(40), from: text(40) }),
  title: text(),
});

/** Every key of a widget's settings (types.ts) except `tagView`, which is never stored, with its type: the one list the demo
 * checks them by. The words (a Finding's, a callout's, a panel's) are `DEMO_SETTING_WORD_KEYS` (demo-words-columns.ts). */
const SETTINGS: Record<string, Check> = {
  window: number, display: (v) => (isDisplayPeriod(v) ? v : BAD), showTarget: flag, showForecast: flag, rows: number,
  slope: oneOf(SLOPE_CHOICES), kicker: text(), footnote: text(), panels: list(panel, 20), headline: text(), subline: text(), source: text(),
  highlight: text(), callouts: list(callout, 50), period: text(40), compare: list(oneOf(Object.keys(COMPARE_LABEL)), 7),
  fullPeriods: flag, canvas: (v) => (isObj(v) ? { document: v.document ?? null, stamp: {} } : BAD), asOf: day,
  // The widget a free layout started from: its own settings are checked by the caller, as the top level's are.
  canvasSeed: (v) => (isObj(v) && typeof v.template === "string" && v.template.length <= 40 && isObj(v.settings)
    ? { template: v.template, metric_ids: list(number, 50)(v.metric_ids ?? []), settings: v.settings } : BAD),
  // A View Design is a checked copy made by the server (`checkedDesignSetting`), never typed by a visitor.
  design: (v) => (isObj(v) ? v : BAD),
  tagSource: shape({ id: text(64) }),
};

/** The widget's settings rebuilt from the keys it is made of, every one of the type the table says, or the words to refuse them
 * with. `canvasSeed.settings` is returned as sent: the caller checks it by the same rules. */
export function checkedSettingsShape(settings: unknown): { ok: true; settings: Obj } | { ok: false; words: string } {
  const out = shape(SETTINGS)(settings);
  if (out === BAD || !isObj(out)) return { ok: false, words: "Those settings can't be saved in the demo." };
  const seed = out.canvasSeed;
  if (isObj(seed) && (seed.metric_ids === BAD || !Array.isArray(seed.metric_ids))) return { ok: false, words: "Those settings can't be saved in the demo." };
  return { ok: true, settings: out };
}
