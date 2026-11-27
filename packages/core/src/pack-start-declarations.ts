// What a Pack declares for its guided set-up (spec 0068; GLOSSARY: Pack, Metric Catalog, Position, Repeat, Total),
// read from what an install keeps, or would keep: the manifest (`setUp`, and with the places the questions and `ask`),
// the Metric Catalog entries and the templates. One reader for both, so the preview of a Pack not yet installed shows
// the steps its install will have.
// Security: a Pack is untrusted input and a stored manifest a document read defensively. A text that is missing, too
// long or not plain (markup, a web address, brackets) is left out, and the flow uses Ziffr's own words instead.
import { PLAIN, textPasses } from "@ziffr/pack/file-text";
import { PACK_ASK_EVERY, PACK_SET_UP_LIMITS as L, type PackAsk, type PackSetUpWords } from "@ziffr/pack/set-up";
import { safeOverview } from "./installed-pack-guides";
import { readPlaces, type PackPlaces, type PlacedWorkflow } from "./pack-places";
import { placeMaps } from "./pack-setup-build";
import type { EntryRow, TemplateRow } from "./pack-setup-install";
import { entryTotal, isComputed } from "./pack-setup-totals";
import type { StartDeclarations, StartMetric, StartSlot, StartWorkflow } from "./pack-start-steps";
import type { Period, WorkflowTemplateBody } from "./types";

/** An entry as the reader needs it: a row of the Metric Catalog, or what installing would store. */
export type DeclaredEntry = Pick<EntryRow, "pack_key" | "name" | "period" | "formula" | "total">;
/** A template likewise. */
export type DeclaredTemplate = Pick<TemplateRow, "pack_key" | "name" | "slots" | "body"> & { kind: "dashboard" | "deck" | "workflow" };

const plain = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() !== "" && [...v].length <= max && textPasses(PLAIN, v) ? v : undefined);
const object = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const some = <K extends string, V>(key: K, v: V | undefined) => (v === undefined ? {} : ({ [key]: v } as Record<K, V>));

function setUpWords(raw: unknown): Partial<PackSetUpWords> {
  const s = object(raw);
  const lines = (v: unknown, most: number) => (Array.isArray(v) ? v.slice(0, most).flatMap((x) => plain(x, L.listed) ?? []) : undefined);
  return { ...some("line", plain(s.line, L.line)), ...some("happens", lines(s.happens, L.happens)), ...some("needs", lines(s.needs, L.needs)) };
}

function askOf(raw: unknown): PackAsk | undefined {
  const a = object(raw);
  const question = plain(a.question, L.question);
  const name = plain(a.name, L.name);
  const every = PACK_ASK_EVERY.find((e) => e === a.every);
  return question && name && every ? { question, name, every } : undefined;
}

function workflowOf(t: DeclaredTemplate, placed: PlacedWorkflow | undefined): StartWorkflow {
  const steps = (t.body as WorkflowTemplateBody).steps;
  const at = new Map((placed?.steps ?? []).map((s) => [s.at, s]));
  const approveBy: string[] = [];
  const uses: NonNullable<StartWorkflow["uses"]> = [];
  const use = (keys: string | string[] | undefined, place: NonNullable<StartWorkflow["uses"]>[number]["place"]) => { for (const position of keys === undefined ? [] : [keys].flat()) uses.push({ position, place }); };
  let approvers = 0;
  steps.forEach((s, i) => {
    const named = at.get(i);
    if (s.type === "approve") { approvers += s.approvers; approveBy.push(...(named?.by ?? [])); }
    use(named?.assignee, "tick");
    use(named?.standIn, "tickStandIn");
    use(named?.to, s.type === "send_snapshot" ? "snapshot" : "told");
  });
  for (const tell of placed?.tells ?? []) use(tell.to, "told");
  return { key: t.pack_key, name: t.name, approvers, ...some("per", placed?.per), ...(approveBy.length ? { approveBy } : {}), ...(uses.length ? { uses } : {}) };
}

/** The declarations of a Pack, from its manifest, entries and templates in the Pack's order. */
export function declarationsFrom(manifest: unknown, entries: DeclaredEntry[], templates: DeclaredTemplate[]): StartDeclarations {
  const m = object(manifest);
  const places: PackPlaces | null = readPlaces(m.places);
  const rows = new Map(templates.filter((t) => t.kind === "workflow").map((t) => [t.pack_key, t as unknown as TemplateRow]));
  const maps = placeMaps(places, rows);
  const comes = new Map((safeOverview(m)?.numbers ?? []).map((n) => [n.key, n.by]));
  const metrics = entries.map((e): StartMetric => {
    const placed = maps.metrics.get(e.pack_key);
    const by = comes.get(e.pack_key);
    return {
      key: e.pack_key, name: e.name, period: e.period as Period, takesValues: !isComputed(e),
      ...some("total", entryTotal(e) ?? undefined),
      ...some("per", placed?.per), ...some("submitters", placed?.submitters), ...some("standIn", placed?.standIn), ...some("viewers", placed?.viewers), ...some("editors", placed?.editors),
      ...some("comesFrom", by === "person" || by === "system" || by === "target" ? by : undefined),
      ...some("ask", askOf((placed as { ask?: unknown } | undefined)?.ask)),
    };
  });
  const slots = (t: DeclaredTemplate): StartSlot[] => (t.slots ?? []).map((s) => ({ suggests: s.suggests ?? null, multiple: Boolean(s.multiple) }));
  const of = (kind: DeclaredTemplate["kind"]) => templates.filter((t) => t.kind === kind);
  const feeds = Array.isArray(m.feeds) ? m.feeds.flatMap((f) => { const x = object(f); return typeof x.template === "string" && Array.isArray(x.fills) ? [{ template: x.template, fills: x.fills.filter((k): k is string => typeof k === "string") }] : []; }) : [];
  return {
    name: String(m.name ?? ""),
    ...some("summary", typeof m.summary === "string" ? m.summary : undefined),
    setUp: setUpWords(m.setUp),
    metrics,
    positions: [...maps.positions.values()].map((p) => {
      const words = p as { question?: unknown; hint?: unknown };
      return { key: p.key, name: p.name, ...some("per", p.per), ...some("question", plain(words.question, L.question)), ...some("hint", plain(words.hint, L.hint)) };
    }),
    repeats: [...maps.repeats.values()].map((r) => ({ key: r.key, name: r.name, ...some("max", r.max), ...some("question", plain((r as { question?: unknown }).question, L.question)) })),
    dashboards: of("dashboard").map((t) => {
      const placed = maps.dashboards.get(t.pack_key);
      return { key: t.pack_key, name: t.name, slots: slots(t), ...some("per", placed?.per), ...some("viewers", placed?.viewers), ...some("editors", placed?.editors) };
    }),
    decks: of("deck").map((t) => ({ key: t.pack_key, name: t.name, slots: slots(t) })),
    workflows: of("workflow").map((t) => workflowOf(t, maps.workflows.get(t.pack_key))),
    feeds,
  };
}
