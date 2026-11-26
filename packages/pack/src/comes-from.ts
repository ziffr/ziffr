// Where a Pack's numbers come from, and what its installer gets and still needs (spec 0058, GLOSSARY: Comes From, Pack):
// a field of a Metric Catalog entry in ziffr.pack/2, and the overview a page shows before installing, in Help and at Set
// up. The creator says only whether a person types a number, another system sends it or it is set once as a target, with
// a short note; what Ziffr calculates, the n8n templates delivered, the Workflows and the list of needs are worked out
// from the Pack, never typed.
// Security: `system` and `note` are text from a stranger, plain as every name in a Pack is, bounded, read by the
// assistant-words check with the rest of the contents, and drawn as text. An overview read back from where it was kept is
// held to its own schema again. Keys are matched through Maps, so "constructor" is only a key.
import { checkSchema, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import { formulaKeys } from "./formula-check.js";
import type { Pack } from "./pack.js";

/** The limits of what a Pack says of where a number comes from: the kind of system, the note, and how many names a
 * calculated number lists. */
export const COMES_FROM_LIMITS = { system: 60, note: 300, entries: 50, of: 20 } as const;

/** Who or what a Metric Catalog entry's number comes from, as its creator says it. */
export const COMES_FROM_BY = ["person", "system", "target"] as const;

/** What a creator says of one entry's number: a person types it, another system (`system` names its kind, such as
 * “CRM”) sends it, or it is set once as a target. */
export type PackComesFrom = { by: (typeof COMES_FROM_BY)[number]; system?: string; note?: string };

/** The n8n templates Ziffr ships, by id, as a person reads them (docs/automations/feed-templates.json). */
export const FEED_TEMPLATE_LABELS: Record<string, string> = { "google-sheets": "Google Sheets", excel: "Microsoft Excel", stripe: "Stripe", hubspot: "HubSpot", bigquery: "BigQuery", snowflake: "Snowflake", "hubspot-forecast": "HubSpot forecast", "salesforce-forecast": "Salesforce forecast", "pipedrive-forecast": "Pipedrive forecast" };

const L = COMES_FROM_LIMITS;
const system = { ...plainText(L.system), minLength: 1 };
const note = { ...plainText(L.note), minLength: 1 };

/** The wrapper field `comesFrom` of a Metric Catalog entry in ziffr.pack/2. A property's description is also what its
 * refusal says it must be, so what each means is told in the field's own. */
export const COMES_FROM_FIELD: Schema = {
  type: "object",
  description: `Where the entry's number comes from, shown before installing, in Help and at Set up: “by” a “person” who types it, another “system” that sends it, or a “target” it is set once as. With “system” only, and needed then, the kind of system, such as “CRM”. A “note” of at most ${L.note} characters may say more, such as where in that system the number is found. Not on a Derived Metric or a Total, which Ziffr calculates.`,
  properties: {
    by: { enum: [...COMES_FROM_BY] },
    system,
    note,
  },
  required: ["by"],
  additionalProperties: false,
};

/** What the schema cannot say: only an entry that takes values says where its number comes from, and the kind of system
 * is named exactly when another system sends it. */
export function checkComesFrom(p: Pick<Pack, "contents">, at: (path: string, message: string) => void): void {
  (p.contents.metrics ?? []).forEach((m, i) => {
    const c = m.comesFrom;
    if (!c) return;
    const here = `contents.metrics[${i}].comesFrom`;
    if (m.metric.formula !== undefined || m.total !== undefined) return at(here, "is on a number Ziffr calculates: leave it out, the Pack's formula says where it comes from.");
    if (c.by === "system" && c.system === undefined) at(here, "needs the field “system”: the kind of system that sends the number, such as “CRM”.");
    if (c.by !== "system" && c.system !== undefined) at(`${here}.system`, "is only for a number another system sends: leave it out, or set “by” to “system”.");
  });
}

/** The Sources a person answers by, in the order and words a page names them. “api” is the other way in: a program, such
 * as a Feed, sends the value. */
const ANSWERS_BY: Record<string, string> = { web_form: "web form", mail: "email", slack: "Slack", telegram: "Telegram" };
const SOURCES = [...Object.keys(ANSWERS_BY), "api"];

/** One number of a Pack as a page lists it. `calculated` names what it is worked out from, `target` whose target it is;
 * `unsaid` is an entry whose creator said nothing, which is described by the ways Ziffr has: its `sources` (left out:
 * every Source) and the delivered n8n `templates` that fill it. */
export type PackNumber = {
  key: string;
  name: string;
  by: PackComesFrom["by"] | "calculated" | "unsaid";
  system?: string;
  note?: string;
  templates?: string[];
  of?: string[];
  sources?: string[];
};

/** What a Workflow Template of a Pack does, in the order of its steps. */
export const WORKFLOW_DOES = ["asks", "reminds", "escalates", "checks", "approves", "checklist", "tells", "snapshot", "publishes", "locks"] as const;
/** One Workflow a Pack delivers: its name, what it does, and how many Approvers are picked at Set up. */
export type PackWorkflowSummary = { name: string; does: (typeof WORKFLOW_DOES)[number][]; approvers: number };

/** What a Pack delivers and where its numbers come from: enough for a page to show both, and what is still needed,
 * without the Pack's file. */
export type PackOverview = {
  numbers: PackNumber[];
  workflows: PackWorkflowSummary[];
  dashboards: string[];
  decks: string[];
  views: string[];
  themes: string[];
};

/** The target a formula only reads, as in “target({commit})”: that number is set once, as the target of another. */
const ONLY_TARGET = /^\s*target\(\s*\{([a-z0-9-]+)\}\s*\)\s*$/;
const TARGETS = /target\(\s*\{([a-z0-9-]+)\}\s*\)/g;

/** The overview of a checked Pack. */
export function packOverview(pack: Pick<Pack, "contents" | "feeds">): PackOverview {
  const c = pack.contents;
  const entries = c.metrics ?? [];
  const names = new Map(entries.map((m) => [m.key, m.metric.name]));
  const named = (keys: string[]) => [...new Set(keys)].flatMap((k) => names.get(k) ?? []).slice(0, L.of);
  const numbers = entries.map((m): PackNumber => {
    const head = { key: m.key, name: m.metric.name };
    const formula = m.metric.formula;
    if (m.total) return { ...head, by: "calculated", of: named([m.total.of]) };
    if (typeof formula === "string") {
      const only = ONLY_TARGET.exec(formula);
      return only ? { ...head, by: "target", of: named([only[1]]) } : { ...head, by: "calculated", of: named(formulaKeys(formula)) };
    }
    // In the order of Ziffr's own list, whatever order the Pack names them in.
    const fills = new Set<string>((pack.feeds ?? []).filter((f) => f.fills.includes(m.key)).map((f) => f.template));
    const templates = Object.keys(FEED_TEMPLATE_LABELS).filter((t) => fills.has(t));
    const said = m.comesFrom;
    // Kept only where the Pack narrows them, and only where they change the words.
    const allowed = said && said.by !== "person" ? [] : SOURCES.filter((s) => (m.metric.sources as string[] | undefined)?.includes(s));
    const sources = allowed.length && allowed.length < SOURCES.length ? allowed : undefined;
    return { ...head, by: said?.by ?? "unsaid", ...(said?.system ? { system: said.system } : {}), ...(said?.note ? { note: said.note } : {}), ...(templates.length ? { templates } : {}), ...(sources ? { sources } : {}) };
  });
  const workflows = (c.workflows ?? []).map((w): PackWorkflowSummary => {
    const does = new Set<PackWorkflowSummary["does"][number]>(["asks"]);
    let approvers = 0;
    for (const s of w.template.steps) {
      if (s.type === "remind") does.add("reminds");
      else if (s.type === "escalate") does.add("escalates");
      else if (s.type === "check") does.add("checks");
      else if (s.type === "approve") { approvers += s.approvers; if (s.approvers > 0) does.add("approves"); }
      else if (s.type === "checklist") does.add("checklist");
      else if (s.type === "tell") does.add("tells");
      else if (s.type === "send_snapshot") does.add("snapshot");
      else if (s.type === "publish") { does.add("publishes"); if (s.lock) does.add("locks"); }
    }
    return { name: w.template.name, does: WORKFLOW_DOES.filter((d) => does.has(d)), approvers };
  });
  return {
    numbers,
    workflows,
    dashboards: (c.dashboards ?? []).map((d) => d.template.name),
    decks: (c.decks ?? []).map((d) => d.template.name),
    views: [...(c.views ?? []).map((v) => v.design.name), ...(c.analyses ?? []).map((a) => String((a.recipe as { name?: unknown }).name ?? ""))].filter(Boolean),
    themes: (c.themes ?? []).map((t) => t.theme.name),
  };
}

/** The targets a Pack's formulas read, by the name of the Metric whose target it is. */
export function targetsRead(pack: Pick<Pack, "contents">): string[] {
  const entries = pack.contents.metrics ?? [];
  const names = new Map(entries.map((m) => [m.key, m.metric.name]));
  const keys = entries.flatMap((m) => (typeof m.metric.formula === "string" ? [...m.metric.formula.matchAll(TARGETS)].map((x) => x[1]) : []));
  return [...new Set(keys)].flatMap((k) => names.get(k) ?? []);
}

const list = (names: string[], word = "and") => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${word} ${names.at(-1)}`);

/** Which of Ziffr's two ways a number without a creator's word can arrive by. A delivered template is a way for a system
 * whatever the Sources say, since connecting it adds the Feed. */
function ways(n: PackNumber): { asked: string[]; system: boolean } {
  const sources = n.sources ?? SOURCES;
  return { asked: Object.keys(ANSWERS_BY).filter((s) => sources.includes(s)).map((s) => ANSWERS_BY[s]!), system: sources.includes("api") || Boolean(n.templates?.length) };
}

/** Where a number comes from, in words: the line itself, and under it how that is done. `count` is how many numbers the
 * words stand for, so a group reads “them”. */
export function comesFromWords(n: PackNumber, count = 1): { from: string; delivered: string } {
  const it = count > 1 ? "them" : "it";
  const of = list(n.of ?? []);
  if (n.by === "calculated") return { from: of ? `Ziffr calculates ${it} from ${of}` : `Ziffr calculates ${it}`, delivered: "" };
  if (n.by === "target") return { from: of ? `Set once as the target of ${of}` : `Set once as ${count > 1 ? "targets" : "a target"}`, delivered: "" };
  const templates = (n.templates ?? []).map((t) => FEED_TEMPLATE_LABELS[t] ?? t);
  const included = templates.length ? `${list(templates, "or")} (${templates.length === 1 ? "template" : "templates"} included)` : "";
  const connect = "with n8n, a SQL Feed or another program";
  if (n.by === "system") {
    return { from: `Another system sends ${it}: ${n.system ?? "not named"}`, delivered: included ? `Fill ${it} from ${included}; you connect it.` : `Connect ${it} ${connect}.` };
  }
  const { asked, system } = ways(n);
  const answers = asked.length ? `A person answers by ${list(asked, "or")}` : "";
  if (n.by === "unsaid" && !asked.length) {
    return included ? { from: `Fill ${it} from ${included}`, delivered: `Or connect another system ${connect}.` } : { from: `Another system sends ${it}`, delivered: `Connect ${it} ${connect}.` };
  }
  // A delivered template is named whoever types the number; without one, a creator who says a person does is taken at
  // their word.
  if (included) return { from: `Ask a person, or fill ${it} from ${included}`, delivered: answers && `${answers}.` };
  if (n.by === "person" || !system) return { from: "Ask a person", delivered: answers && `${answers}.` };
  return { from: `Ask a person, or another system sends ${it}`, delivered: `${answers}; a system sends ${it} ${connect}.` };
}

/** The numbers of a Pack that share one answer, as one line of a page: their keys and names, the words and the note. */
export type ComesFromGroup = { keys: string[]; names: string[]; from: string; delivered: string; note?: string };

/** The numbers grouped by what is said of them, in the Pack's order of each group's first number. */
export function comesFromGroups(numbers: PackNumber[]): ComesFromGroup[] {
  const groups = new Map<string, PackNumber[]>();
  for (const n of numbers) {
    const words = comesFromWords(n);
    const same = JSON.stringify([words.from, words.delivered, n.note ?? ""]);
    groups.set(same, [...(groups.get(same) ?? []), n]);
  }
  return [...groups.values()].map((g) => ({ keys: g.map((n) => n.key), names: g.map((n) => n.name), ...comesFromWords(g[0]!, g.length), ...(g[0]!.note ? { note: g[0]!.note } : {}) }));
}

/** Up to three names, else how many numbers: the table above a list of needs names them all. */
const few = (numbers: PackNumber[]) => (numbers.length > 3 ? `${numbers.length} numbers` : list(numbers.map((n) => n.name)));

const DOES: Record<PackWorkflowSummary["does"][number], string> = {
  asks: "asks for the values", reminds: "reminds", escalates: "raises late values", checks: "marks unusual values", approves: "has values approved",
  checklist: "keeps a checklist", tells: "tells people", snapshot: "sends a dashboard's Snapshot", publishes: "publishes", locks: "locks the period",
};

/** What a Pack brings (“Included”) and what its installer still has to provide (“What you still need”), as lines of
 * words, worked out from the overview. `targets` are the Metrics whose target a formula reads (`targetsRead`). */
export function includedAndNeeded(o: PackOverview, targets: string[] = []): { included: string[]; needed: string[] } {
  const included: string[] = [];
  const say = (one: string, many: string, names: string[]) => { if (names.length) included.push(`${names.length === 1 ? one : many}: ${list(names)}`); };
  say("Metric", "Metrics", o.numbers.map((n) => n.name));
  say("Dashboard", "Dashboards", o.dashboards);
  say("Deck", "Decks", o.decks);
  for (const w of o.workflows) included.push(`Workflow ${w.name}: ${list(w.does.map((d) => DOES[d]))}`);
  say("View Design", "View Designs", o.views);
  say("Theme", "Themes", o.themes);
  const used = new Set(o.numbers.flatMap((n) => n.templates ?? []));
  const delivered = Object.entries(FEED_TEMPLATE_LABELS).flatMap(([id, label]) => (used.has(id) ? [label] : []));
  if (delivered.length) included.push(`${delivered.length === 1 ? "An n8n template" : "n8n templates"} for ${list(delivered)}`);

  const needed: string[] = [];
  const by = (kind: PackNumber["by"]) => o.numbers.filter((n) => n.by === kind);
  const unsaid = by("unsaid").map((n) => ({ n, ...ways(n) }));
  const people = [...by("person"), ...unsaid.filter((u) => u.asked.length && !u.system).map((u) => u.n)];
  if (people.length) needed.push(`Someone to ask for ${few(people)}`);
  const either = unsaid.filter((u) => u.asked.length && u.system).map((u) => u.n);
  if (either.length) needed.push(`Someone to ask, or a system that sends the values, for ${few(either)}`);
  const sent = unsaid.filter((u) => !u.asked.length).map((u) => u.n);
  if (sent.length) needed.push(`A system that sends the values for ${few(sent)}`);
  const systems = new Map<string, PackNumber[]>();
  for (const n of by("system")) systems.set(n.system ?? "", [...(systems.get(n.system ?? "") ?? []), n]);
  for (const [name, numbers] of systems) {
    const bare = numbers.filter((n) => !n.templates?.length);
    const filled = numbers.filter((n) => n.templates?.length);
    if (filled.length) needed.push(`A connection to your ${name} for ${few(filled)}, using a delivered n8n template that you connect`);
    if (bare.length) needed.push(`A connection to your ${name} for ${few(bare)}, which you set up yourself`);
  }
  // A number said to be a target and not itself worked out from another's is set on its own Metric.
  const set = [...new Set([...targets, ...by("target").filter((n) => !n.of?.length).map((n) => n.name)])];
  if (set.length) needed.push(`A target, set once, on ${list(set)}`);
  for (const w of o.workflows) {
    if (w.approvers) needed.push(`${w.approvers === 1 ? "An Approver" : `${w.approvers} Approvers`} for the Workflow ${w.name}`);
    if (w.does.includes("snapshot")) needed.push(`The dashboard and the people for the Snapshot of the Workflow ${w.name}`);
  }
  if (o.themes.length) needed.push("An Owner to install it, because it holds a Theme");
  return { included, needed };
}

const name = (max: number): Schema => ({ ...plainText(max), minLength: 1 });
const names = (max: number, length: number): Schema => ({ type: "array", maxItems: max, items: name(length) });

/** The shape of an overview as it is kept, with the targets its formulas read: held to it again when it is read. */
export const PACK_OVERVIEW_SCHEMA: Schema = {
  type: "object",
  properties: {
    numbers: {
      type: "array", maxItems: L.entries,
      items: {
        type: "object",
        properties: { key: name(40), name: name(120), by: { enum: [...COMES_FROM_BY, "calculated", "unsaid"] }, system, note, templates: { type: "array", maxItems: 10, items: { enum: Object.keys(FEED_TEMPLATE_LABELS) } }, of: names(L.of, 120), sources: { type: "array", maxItems: SOURCES.length, items: { enum: SOURCES } } },
        required: ["key", "name", "by"], additionalProperties: false,
      },
    },
    workflows: { type: "array", maxItems: L.entries, items: { type: "object", properties: { name: name(80), does: { type: "array", maxItems: WORKFLOW_DOES.length, items: { enum: [...WORKFLOW_DOES] } }, approvers: { type: "integer", minimum: 0, maximum: 99 } }, required: ["name", "does", "approvers"], additionalProperties: false } },
    dashboards: names(L.entries, 80),
    decks: names(L.entries, 80),
    views: names(2 * L.entries, 120),
    themes: names(L.entries, 80),
    targets: names(L.entries, 120),
  },
  required: ["numbers", "workflows", "dashboards", "decks", "views", "themes"],
  additionalProperties: false,
};

/** An overview as it is kept: with the targets its formulas read. */
export type KeptOverview = PackOverview & { targets?: string[] };

/** The overview to keep of a checked Pack. */
export function keptOverview(pack: Pick<Pack, "contents" | "feeds">): KeptOverview {
  return { ...packOverview(pack), targets: targetsRead(pack) };
}

/** A kept overview as it may be shown, or null when there is none or it does not have the shape. */
export function readOverview(value: unknown): KeptOverview | null {
  return value === undefined || checkSchema(PACK_OVERVIEW_SCHEMA, value).length ? null : (value as KeptOverview);
}
