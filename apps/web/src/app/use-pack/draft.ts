// The answers of a guided Pack set-up while it is under way (spec 0068; GLOSSARY: Pack): kept in this browser tab only
// (sessionStorage), per person, Workspace and Pack, dropped when the set-up is done, on Start over and at the sign-in
// page. They hold the names and addresses the person typed, so nothing keeps them longer or sends them anywhere. What is
// read back is whatever the browser holds, so it is checked field by field; the server checks everything again.
import { emptyLine, type Answers, type LineDraft, type LinesStep, type PersonDraft, type ProviderDraft } from "./answers";
import type { StartStep } from "@ziffr/core/pack-start-steps";

const PREFIX = "ziffr-use-pack:";
const LINES_MOST = 50;

/** Where one person's answers for one Pack in one Workspace are kept. */
export const draftKey = (personId: string, workspaceId: string, packId: string) => `${PREFIX}${personId}:${workspaceId}:${packId}`;

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, most: number) => (typeof v === "string" ? v.slice(0, most) : "");
const flag = (v: unknown, otherwise: boolean) => (typeof v === "boolean" ? v : otherwise);

function person(v: unknown, otherwise: PersonDraft): PersonDraft {
  const p = record(v);
  const who = p.who === "me" || p.who === "here" || p.who === "new" ? p.who : null;
  return who ? { who, here: text(p.here, 64), name: text(p.name, 320), email: text(p.email, 320) } : otherwise;
}

/** The kept answers over the fresh ones, field by field: only what the steps of this Pack ask is taken. Null when the
 * text holds none. */
export function readDraft(kept: string | null, fresh: Answers, steps: StartStep[]): Answers | null {
  if (!kept) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(kept);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  let next = fresh.next;
  const take = () => next++;
  const lines: Answers["lines"] = { ...fresh.lines };
  const lineIds = new Map<number, number>();
  for (const step of steps.filter((s): s is LinesStep => s.step === "lines")) {
    const list = record(raw.lines)[step.repeat];
    if (!Array.isArray(list) || !list.length) continue;
    lines[step.repeat] = list.slice(0, LINES_MOST).map((v): LineDraft => {
      const l = record(v);
      // Ids are given anew, so two lines never share one.
      const empty = emptyLine(step, { practice: false }, take());
      if (typeof l.id === "number") lineIds.set(l.id, empty.id);
      return {
        id: empty.id, name: text(l.name, 240), person: person(l.person, empty.person),
        others: Object.fromEntries(step.others.map((o) => [o.position, person(record(l.others)[o.position], empty.others[o.position])])),
      };
    });
  }
  const who = Object.fromEntries(Object.entries(fresh.who).map(([key, v]) => [key, person(record(raw.who)[key], v)]));
  const p = record(raw.providers);
  const providers = {
    me: flag(p.me, fresh.providers.me), others: flag(p.others, false), nobody: flag(p.nobody, fresh.providers.nobody),
    people: (Array.isArray(p.people) ? p.people.slice(0, 20) : []).map((v): ProviderDraft => ({ ...person(v, { who: "new", here: "", name: "", email: "" }), id: take() })),
  };
  const numbers = Object.fromEntries(Object.entries(record(raw.numbers)).slice(0, 600).flatMap(([key, value]): [string, string][] => {
    const [metric, line, more] = key.split("|");
    if (more !== undefined || line === undefined || typeof value !== "string") return [];
    const id = line === "" ? "" : lineIds.get(Number(line));
    return id === undefined ? [] : [[`${metric.slice(0, 40)}|${id}`, value.slice(0, 40)]];
  }));
  const shares = Object.fromEntries(Object.entries(record(raw.shares)).slice(0, 1000).filter((e): e is [string, boolean] => e[0].length <= 400 && typeof e[1] === "boolean"));
  return {
    lines, who, providers, numbers, shares, next,
    later: flag(raw.later, false),
    source: raw.source === "typed" || raw.source === "system" ? raw.source : fresh.source,
    // A confirmation is given again: it stands for what the person read just now.
    confirmed: false,
  };
}

// Storage can be blocked, full or absent (a private window): the flow then works for as long as the page is open.
/** The kept answers, if any. */
export function loadDraft(key: string, fresh: Answers, steps: StartStep[]): Answers | null {
  try { return readDraft(window.sessionStorage.getItem(key), fresh, steps); } catch { return null; }
}
/** Keeps the answers. */
export function keepDraft(key: string, answers: Answers): void {
  try { window.sessionStorage.setItem(key, JSON.stringify(answers)); } catch { /* not kept */ }
}
/** Drops one set-up's kept answers. */
export function dropDraft(key: string): void {
  try { window.sessionStorage.removeItem(key); } catch { /* nothing kept */ }
}
/** Drops the kept answers of every set-up in this tab: nobody is signed in any more. */
export function dropAllDrafts(): void {
  try {
    for (const key of Object.keys(window.sessionStorage)) if (key.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
  } catch { /* nothing kept */ }
}
