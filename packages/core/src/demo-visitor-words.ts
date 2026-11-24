// The words a visitor of the demo writes into what they make (GLOSSARY: Demo Mode, Dashboard, Widget, Theme, Widget
// Template; spec 0051, Limits: Texts). The text rules (`demoTextOk`) are pure; this is where the operations that save a
// visitor's words ask them, under the core's rule that the core is the one place data is changed. Every function does
// nothing outside a demo visit (the setting in effect and a visit's client, `visitHeaders`), so a real Workspace, the seed
// and the demo with the setting off behave exactly as before; in a demo visit a text that fails the rules is refused in
// plain words before anything is written. What passes is the cleaned text (NFKC, hidden characters stripped), and that is
// what is saved.
import { Forbidden, type Actor } from "./actor";
import { DemoReadOnly } from "./demo";
import { demoTextOk, type DemoTextKind } from "./demo-text";
import { visitHeaders } from "./demo-visit-scope";
import { SETTING_WORDS } from "./sealed-words";
import { DEMO_WORKSPACE_ID } from "./team";
import type { ThemeSlides, WidgetSettings } from "./types";

/** A visitor's words refused by the text rules; a Forbidden, so every place that shows a refusal shows its words. */
export class DemoTextRefused extends Forbidden {
  constructor(words: string) {
    super(words);
    this.name = "DemoTextRefused";
  }
}

/** Whether this work is a visitor's change to the demo: the demo Workspace, inside a visit's scope (which exists only with
 * the setting in effect). */
export function inDemoVisit(actor: Pick<Actor, "workspaceId">): boolean {
  return actor.workspaceId === DEMO_WORKSPACE_ID && visitHeaders() !== null;
}

/** The text to save for a name or a message a visitor wrote: cleaned, or refused (empty too). Unchanged outside a visit. */
export function visitorText(actor: Pick<Actor, "workspaceId">, text: string, kind: DemoTextKind): string {
  if (!inDemoVisit(actor)) return text;
  const r = demoTextOk(text, kind);
  if (!r.ok) throw new DemoTextRefused(r.words);
  return r.text;
}

/** As `visitorText` for words that may be left empty (an introduction, a description, a footer, a title): blank stays blank. */
export function visitorOptionalText<T extends string | null | undefined>(actor: Pick<Actor, "workspaceId">, text: T, kind: DemoTextKind): T | string {
  if (text === null || text === undefined || String(text).trim() === "") return text;
  return visitorText(actor, String(text), kind);
}

/** The kinds of object whose Versions a visitor may name or bring back: only those they may make or change (their tables are open). */
const VISITOR_VERSION_TYPES: readonly string[] = ["dashboard", "widget", "theme", "template"];

/** Refuses, in a demo visit, a Version of a kind a visitor may not change (a Metric, a Workflow, a deck, a Snapshot). */
export function visitorVersionType(actor: Pick<Actor, "workspaceId">, type: string): void {
  if (inDemoVisit(actor) && !VISITOR_VERSION_TYPES.includes(type)) throw new DemoReadOnly();
}

/** A Theme's slide part for saving: in a demo visit its footer is words (checked) and no picture comes in or changes, because
 * a logo or a background is a file from outside the demo. `stored` is the Theme as it is now. */
export function visitorThemeSlides(actor: Pick<Actor, "workspaceId">, slides: ThemeSlides, stored: ThemeSlides | null): ThemeSlides {
  if (!inDemoVisit(actor)) return slides;
  if ((slides?.logo ?? null) !== (stored?.logo ?? null) || (slides?.background_image ?? null) !== (stored?.background_image ?? null)) throw new DemoTextRefused("Pictures can't be added in the demo.");
  return { ...slides, footer: String(visitorOptionalText(actor, String(slides?.footer ?? ""), "name")) };
}

/** Free layouts keep a drawing with words in it of every shape; the demo does not take one from a visitor. */
const NO_FREE_LAYOUTS = "A free layout can't be saved in the demo. Try another view.";

type Obj = Record<string, unknown>;
/** Every key of WidgetSettings (types.ts) except `tagView`, which is never stored. The words among them are DEMO_SETTING_WORD_KEYS. */
const SETTING_KEYS: readonly string[] = ["window", "display", "showTarget", "showForecast", "rows", "slope", "kicker", "footnote", "panels", "headline", "subline", "source", "highlight", "callouts", "period", "compare", "fullPeriods", "canvas", "asOf", "canvasSeed", "design", "tagSource"];
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Cleans one word of a settings object in place (on a copy), when it is a string. */
function cleanWord(actor: Pick<Actor, "workspaceId">, o: Obj, key: string, kind: DemoTextKind): void {
  if (typeof o[key] === "string") o[key] = visitorOptionalText(actor, o[key] as string, kind);
}

/** A widget's settings with every word a visitor can type into them checked and cleaned: a Finding's kicker, headline,
 * subline, footnote and source, the highlighted row's label, callouts, and the titles, reference-line labels and notes of a
 * story's panels. A free layout is refused and keys that are not a widget's settings are dropped. Unchanged outside a visit. Words in a place not named here are not a visitor's
 * to type (the editor offers no field for them), and the server drops what it does not keep. */
export function visitorSettings(actor: Pick<Actor, "workspaceId">, settings: WidgetSettings): WidgetSettings {
  if (!inDemoVisit(actor)) return settings;
  // Only the keys a widget's settings are made of (types.ts): anything else a browser sends is dropped, not stored (growth).
  const s: Obj = Object.fromEntries(Object.entries(settings as Obj).filter(([k]) => SETTING_KEYS.includes(k)));
  if (isObj(s.canvas) && s.canvas.document !== null && s.canvas.document !== undefined) throw new DemoTextRefused(NO_FREE_LAYOUTS);
  for (const key of SETTING_WORDS) cleanWord(actor, s, key, key === "kicker" || key === "headline" ? "name" : "description");
  cleanWord(actor, s, "highlight", "name");
  if (Array.isArray(s.callouts)) s.callouts = s.callouts.map((c) => (isObj(c) ? (() => { const o = { ...c }; cleanWord(actor, o, "text", "description"); return o; })() : c));
  if (Array.isArray(s.panels)) {
    s.panels = s.panels.map((p) => {
      if (!isObj(p)) return p;
      const o: Obj = { ...p };
      cleanWord(actor, o, "title", "name");
      if (isObj(o.refLine)) { const r: Obj = { ...o.refLine }; cleanWord(actor, r, "label", "name"); o.refLine = r; }
      if (Array.isArray(o.annotations)) {
        o.annotations = o.annotations.map((a) => {
          if (!isObj(a)) return a;
          const n: Obj = { ...a };
          cleanWord(actor, n, "text", "description");
          if (isObj(n.anchor)) { const an: Obj = { ...n.anchor }; cleanWord(actor, an, "label", "name"); n.anchor = an; }
          return n;
        });
      }
      return o;
    });
  }
  if (isObj(s.canvasSeed) && isObj(s.canvasSeed.settings)) s.canvasSeed = { ...s.canvasSeed, settings: visitorSettings(actor, s.canvasSeed.settings as WidgetSettings) };
  return s as WidgetSettings;
}
