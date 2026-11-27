// The record of a Set up (spec 0058, #1180; GLOSSARY: Pack, Position, Repeat, Workspace Key): what a Set up did, kept
// so that a line can be added later: the install and its version, who and when, the lines and their names, the people
// put into each Position and the ids of what was made.
// The guided set-up (spec 0068) keeps one such record for an install, which stays open when a step stops, so that its
// person takes it up again and makes only what is missing.
// Security: the record decides nothing. No permission, message or sight is worked out from it; every later change goes
// through the same core operations as by hand. Line names are sealed with the Workspace Key. Written for the person
// setting up (an Owner or Admin, checked by the caller) and only in their Workspace.
import { db } from "./db";
import type { Actor } from "./actor";
import { ServerFault } from "./server-fault";
import { openRows, sealRow } from "./sealed-columns";
import type { BuiltLine } from "./pack-setup-build";

/** A thing a Set up made. */
export type MadeThing = { kind: "metric" | "dashboard" | "workflow" | "deck"; key: string; line: Pick<BuiltLine, "repeat" | "name"> | null; id: number };

/** A record being written: where its people and what it makes go, and how far a Set up in steps is. */
export type SetupRecord = {
  id: number;
  /** How many steps have been taken up after the first. */
  step: number;
  /** Notes one thing that was made. */
  made: (thing: Omit<MadeThing, "line"> & { line: BuiltLine | null }) => Promise<void>;
  /** Keeps how many requests went out, for the next step. */
  keep: (messages: number) => Promise<void>;
  /** Ends the Set up: it takes no further step. */
  finish: (messages: number) => Promise<void>;
  /** Takes the record away again: nothing was made. */
  drop: () => Promise<void>;
};

const failed = (error: unknown) => {
  if (error) throw new ServerFault("The record of this Set up could not be written.");
};

/** The record of a row, writing to it and its children only in its Workspace. */
function recordOf(ws: string, id: number, step: number, lineId: (line: BuiltLine) => number): SetupRecord {
  const update = async (patch: Record<string, unknown>) => { failed((await db().from("pack_setups").update(patch).eq("id", id).eq("workspace_id", ws)).error); };
  return {
    id,
    step,
    made: async (thing) => {
      failed((await db().from("pack_setup_items").insert({ workspace_id: ws, setup_id: id, line_id: thing.line ? lineId(thing.line) : null, kind: thing.kind, pack_key: thing.key, object_id: thing.id })).error);
    },
    keep: (messages) => update({ messages }),
    finish: (messages) => update({ messages, finished_at: new Date().toISOString(), working_since: null }),
    drop: async () => { await db().from("pack_setups").delete().eq("id", id).eq("workspace_id", ws); },
  };
}

/** Recorded lines by their row's id, their names opened. */
async function openedLines(ws: string, rows: unknown): Promise<Map<number, { repeat: string; name: string }>> {
  const opened = await openRows("pack_setup_lines", ws, rows as Record<string, unknown>[] | null);
  return new Map(opened.map((l) => [Number(l.id), { repeat: String(l.repeat_key), name: String(l.name) }]));
}

/** Recorded items as the things they name. */
const madeThings = (rows: unknown, lines: ReadonlyMap<number, { repeat: string; name: string }>): MadeThing[] =>
  ((rows ?? []) as { kind: MadeThing["kind"]; pack_key: string; line_id: number | null; object_id: number }[]).map((i) => ({ kind: i.kind, key: i.pack_key, line: i.line_id === null ? null : lines.get(Number(i.line_id)) ?? null, id: Number(i.object_id) }));

const GONE = "This Set up cannot go on: it was finished or stopped, or its choices changed. Open the Packs page again to see what was made.";

/** Writes one line of a Set up's record and answers its row's id. */
async function insertLine(ws: string, setup: number, line: BuiltLine): Promise<number> {
  // The name is sealed for its row, so the row is made first, without it.
  const { data: row, error } = await db().from("pack_setup_lines").insert({ workspace_id: ws, setup_id: setup, repeat_key: line.repeat }).select("id").single();
  failed(error);
  const id = Number(row!.id);
  const sealed = await sealRow("pack_setup_lines", ws, { id, name: line.name });
  failed((await db().from("pack_setup_lines").update({ name: sealed.name }).eq("id", id).eq("workspace_id", ws)).error);
  return id;
}

/** How a held Position is named: by its key and the line's name, empty for none. */
export const heldKey = (line: string | null, position: string) => `${position} ${line ?? ""}`;

/** The rows that say who was put into each Position, of a line or of none. `heldFor` names, by heldKey, the person a
 * holder stands in for until they have joined. */
function peopleRows(ws: string, setup: number, from: (readonly [number | null, string | null, Map<string, string[]>])[], heldFor: ReadonlyMap<string, string> = new Map()) {
  return from.flatMap(([lineId, lineName, fills]) => [...fills].flatMap(([position, ids]) => ids.map((person) => {
    const held = heldFor.get(heldKey(lineName, position));
    return { workspace_id: ws, setup_id: setup, line_id: lineId, position_key: position, person_id: person, ...(held ? { held_for: held } : {}) };
  })));
}

/** Starts the record of a Set up, with its lines and the people of each Position, before anything is made. `mark`
 * names the choices it is made from: only the same ones may take its further steps. */
export async function startSetupRecord(actor: Actor, install: { id: number; version: string }, lines: BuiltLine[], people: Map<string, string[]>, mark: string): Promise<SetupRecord> {
  const ws = actor.workspaceId;
  const { data, error } = await db().from("pack_setups").insert({ workspace_id: ws, install_id: install.id, pack_version: install.version, made_by: actor.personId, input_mark: mark }).select("id").single();
  failed(error);
  const id = Number(data!.id);
  const drop = async () => { await db().from("pack_setups").delete().eq("id", id).eq("workspace_id", ws); };
  const lineIds = new Map<BuiltLine, number>();
  try {
    for (const line of lines) lineIds.set(line, await insertLine(ws, id, line));
    const rows = peopleRows(ws, id, [[null, null, people] as const, ...lines.map((l) => [lineIds.get(l)!, l.name, l.fills] as const)]);
    if (rows.length) failed((await db().from("pack_setup_people").insert(rows)).error);
  } catch (e) {
    await drop();
    throw e;
  }
  return recordOf(ws, id, 0, (line) => lineIds.get(line)!);
}

/** Everything recorded of an install's Set ups, oldest first: the lines with their names, what was made, and who was
 * put into the Positions outside every Repeat. `except` leaves one Set up out: the one that is still in its steps. For
 * an Owner or Admin, whom the caller checks; it decides nothing. */
export async function recordedSetups(actor: Actor, installId: number, except?: number): Promise<{ lines: { repeat: string; name: string }[]; made: MadeThing[]; people: { setup: number; position: string; person: string }[] }> {
  const ws = actor.workspaceId;
  const { data: setups } = await db().from("pack_setups").select("id").eq("workspace_id", ws).eq("install_id", installId).order("id");
  const ids = (setups ?? []).map((x) => Number(x.id)).filter((id) => id !== except);
  if (!ids.length) return { lines: [], made: [], people: [] };
  const of = (table: string, columns: string) => db().from(table).select(columns).eq("workspace_id", ws).in("setup_id", ids).order("id");
  const [{ data: lineRows }, { data: items }, { data: people }] = await Promise.all([
    of("pack_setup_lines", "id, repeat_key, name"), of("pack_setup_items", "kind, pack_key, line_id, object_id"), of("pack_setup_people", "setup_id, position_key, person_id, line_id"),
  ]);
  const byId = await openedLines(ws, lineRows);
  return {
    lines: [...byId.values()],
    made: madeThings(items, byId),
    people: ((people ?? []) as unknown as { setup_id: number; position_key: string; person_id: string; line_id: number | null }[]).filter((x) => x.line_id === null).map((x) => ({ setup: x.setup_id, position: x.position_key, person: x.person_id })),
  };
}

/** Takes up the next step of a Set up in steps: only the person who started it, only with the same choices, only while
 * it is not finished, and each step once. Answers the record, what it made so far and how many requests went out. */
export async function resumeSetupRecord(actor: Actor, installId: number, run: { id: number; step: number }, mark: string): Promise<{ record: SetupRecord; made: MadeThing[]; messages: number }> {
  const ws = actor.workspaceId;
  if (!Number.isSafeInteger(run?.id) || !Number.isSafeInteger(run?.step) || run.step < 0) throw new Error(GONE);
  // Taken in one write, so two requests for the same step never both make things.
  const { data: taken } = await db().from("pack_setups").update({ step: run.step + 1 })
    .eq("id", run.id).eq("workspace_id", ws).eq("install_id", installId).eq("made_by", actor.personId).eq("input_mark", mark).eq("step", run.step).is("finished_at", null).select("id, messages");
  if (!taken?.length) throw new Error(GONE);
  const [{ data: lineRows }, { data: items }] = await Promise.all([
    db().from("pack_setup_lines").select("id, repeat_key, name").eq("setup_id", run.id).eq("workspace_id", ws),
    db().from("pack_setup_items").select("kind, pack_key, line_id, object_id").eq("setup_id", run.id).eq("workspace_id", ws).order("id"),
  ]);
  const byId = await openedLines(ws, lineRows);
  const made = madeThings(items, byId);
  const lineId = (line: BuiltLine) => [...byId].find(([, l]) => l.repeat === line.repeat && l.name === line.name)![0];
  return { record: recordOf(ws, run.id, run.step + 1, lineId), made, messages: Number(taken[0].messages) };
}

/** A Set up of an install as the guided set-up reads it: whether it made it, who, from which choices, how far, and how
 * many things it made. */
export type SetupState = { id: number; guided: boolean; by: string | null; mark: string | null; step: number; finished: boolean; made: number };

/** Every Set up recorded of an install of the actor's Workspace, oldest first (for an Owner or Admin, whom the caller
 * checks). */
export async function setupStates(actor: Actor, installId: number): Promise<SetupState[]> {
  const ws = actor.workspaceId;
  const { data, error } = await db().from("pack_setups").select("id, guided, made_by, input_mark, step, finished_at").eq("workspace_id", ws).eq("install_id", installId).order("id");
  failed(error);
  const counts = await Promise.all((data ?? []).map((r) => db().from("pack_setup_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("setup_id", r.id)));
  return (data ?? []).map((r, i) => ({ id: Number(r.id), guided: r.guided === true, by: (r.made_by as string | null) ?? null, mark: (r.input_mark as string | null) ?? null, step: Number(r.step), finished: r.finished_at !== null, made: counts[i].count ?? 0 }));
}

/** How long a step of the guided set-up holds its record when it never answers. */
const STALE_MS = 3 * 60_000;
const BUSY = "This Pack is being set up right now. Wait a moment, then try again.";
const TABLES = { metric: "metrics", dashboard: "dashboards", workflow: "workflows", deck: "decks" } as const;

/** Of the things recorded, those still there: what was deleted since is missing and made again. */
async function stillThere(ws: string, made: MadeThing[]): Promise<MadeThing[]> {
  const found = await Promise.all((Object.keys(TABLES) as MadeThing["kind"][]).map(async (kind) => {
    const ids = made.filter((m) => m.kind === kind).map((m) => m.id);
    if (!ids.length) return [];
    const { data, error } = await db().from(TABLES[kind]).select("id").eq("workspace_id", ws).in("id", ids);
    failed(error);
    return (data ?? []).map((r) => `${kind} ${Number(r.id)}`);
  }));
  const there = new Set(found.flat());
  return made.filter((m) => there.has(`${m.kind} ${m.id}`));
}

/** What the guided set-up made for an install that is still there, oldest first. */
export async function stillMade(actor: Actor, setupId: number): Promise<MadeThing[]> {
  const ws = actor.workspaceId;
  const [{ data: lineRows }, { data: items, error }] = await Promise.all([
    db().from("pack_setup_lines").select("id, repeat_key, name").eq("setup_id", setupId).eq("workspace_id", ws),
    db().from("pack_setup_items").select("kind, pack_key, line_id, object_id").eq("setup_id", setupId).eq("workspace_id", ws).order("id"),
  ]);
  failed(error);
  return stillThere(ws, madeThings(items, await openedLines(ws, lineRows)));
}

/** The guided set-up's record, held by one step at a time. */
export type GuidedRecord = SetupRecord & {
  /** What it made before that is still there. */
  madeBefore: MadeThing[];
  /** Metrics it made whose people were not all put on them yet. */
  unstaffed: ReadonlySet<number>;
  /** Notes that these Metrics have their people. */
  staffed: (metricIds: number[]) => Promise<void>;
  /** Writes the lines it does not hold yet, and who is in each Position as answered now. */
  layOut: (lines: BuiltLine[], people: Map<string, string[]>, heldFor: ReadonlyMap<string, string>) => Promise<void>;
  /** Ends this step, so that another may take the record up. A record that made nothing is taken away instead. */
  stop: () => Promise<void>;
};

const lineKey = (line: { repeat: string; name: string }) => `${line.repeat} ${line.name}`;

/** Takes away an unfinished guided set-up that made nothing and that no step holds, so that it keeps nobody from
 * starting one. */
export async function dropIdleGuided(actor: Actor, setupId: number): Promise<void> {
  const ws = actor.workspaceId;
  const { count, error } = await db().from("pack_setup_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("setup_id", setupId);
  failed(error);
  if (count !== 0) return;
  const idle = () => db().from("pack_setups").delete().eq("id", setupId).eq("workspace_id", ws).eq("guided", true).is("finished_at", null);
  failed((await idle().is("working_since", null)).error);
  failed((await idle().lt("working_since", new Date(Date.now() - STALE_MS).toISOString())).error);
}

/** Takes the record of an unfinished guided set-up for one step, in one write, so two requests never both make things.
 * Only the person who started it. Answers its new step. */
async function takeGuided(actor: Actor, installId: number, mark: string, open: SetupState): Promise<number> {
  const step = open.step + 1;
  const claim = () => db().from("pack_setups").update({ step, input_mark: mark, working_since: new Date().toISOString() })
    .eq("id", open.id).eq("workspace_id", actor.workspaceId).eq("install_id", installId).eq("made_by", actor.personId).eq("guided", true).eq("step", open.step).is("finished_at", null);
  const free = await claim().is("working_since", null).select("id");
  failed(free.error);
  if (free.data?.length) return step;
  const stale = await claim().lt("working_since", new Date(Date.now() - STALE_MS).toISOString()).select("id");
  failed(stale.error);
  if (!stale.data?.length) throw new Error(BUSY);
  return step;
}

/** Takes the guided set-up's record for one step: a new one, or `open`, the unfinished one the caller found to be this
 * person's. Only one step holds it at a time, so a second press makes nothing twice. While unfinished it keeps the mark
 * `marks.open` (who was named), once finished `marks.done` (every answer). */
export async function claimGuidedRecord(actor: Actor, install: { id: number; version: string }, marks: { open: string; done: string }, open: SetupState | null): Promise<GuidedRecord> {
  const mark = marks.open;
  const ws = actor.workspaceId;
  let id: number;
  let step = 0;
  if (open) {
    id = open.id;
    step = await takeGuided(actor, install.id, mark, open);
  } else {
    const { data, error } = await db().from("pack_setups").insert({ workspace_id: ws, install_id: install.id, pack_version: install.version, made_by: actor.personId, input_mark: mark, guided: true, working_since: new Date().toISOString() }).select("id").single();
    // The database keeps one guided set-up for an install.
    if (error?.code === "23505") throw new Error(BUSY);
    failed(error);
    id = Number(data!.id);
  }
  const [{ data: lineRows }, { data: items, error }] = await Promise.all([
    db().from("pack_setup_lines").select("id, repeat_key, name").eq("setup_id", id).eq("workspace_id", ws),
    db().from("pack_setup_items").select("kind, pack_key, line_id, object_id, people_done").eq("setup_id", id).eq("workspace_id", ws).order("id"),
  ]);
  failed(error);
  const byId = await openedLines(ws, lineRows);
  const lineIds = new Map([...byId].map(([row, line]) => [lineKey(line), row]));
  const made = await stillThere(ws, madeThings(items, byId));
  const waiting = new Set((items ?? []).filter((i) => i.kind === "metric" && i.people_done !== true).map((i) => Number(i.object_id)));
  const record = recordOf(ws, id, step, (line) => lineIds.get(lineKey(line))!);
  return {
    ...record,
    finish: async (messages) => {
      failed((await db().from("pack_setups").update({ messages, input_mark: marks.done, finished_at: new Date().toISOString(), working_since: null }).eq("id", id).eq("workspace_id", ws)).error);
    },
    madeBefore: made,
    unstaffed: new Set(made.filter((m) => m.kind === "metric" && waiting.has(m.id)).map((m) => m.id)),
    staffed: async (ids) => {
      if (ids.length) failed((await db().from("pack_setup_items").update({ people_done: true }).eq("workspace_id", ws).eq("setup_id", id).eq("kind", "metric").in("object_id", ids)).error);
    },
    layOut: async (lines, people, heldFor) => {
      for (const line of lines) if (!lineIds.has(lineKey(line))) lineIds.set(lineKey(line), await insertLine(ws, id, line));
      const laid = lines.map((l) => lineIds.get(lineKey(l))!);
      const clear = () => db().from("pack_setup_people").delete().eq("workspace_id", ws).eq("setup_id", id);
      failed((await clear().is("line_id", null)).error);
      if (laid.length) failed((await clear().in("line_id", laid)).error);
      const rows = peopleRows(ws, id, [[null, null, people] as const, ...lines.map((l) => [lineIds.get(lineKey(l))!, l.name, l.fills] as const)], heldFor);
      if (rows.length) failed((await db().from("pack_setup_people").insert(rows)).error);
    },
    stop: async () => {
      const { count, error: unread } = await db().from("pack_setup_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("setup_id", id);
      if (!unread && count === 0) return record.drop();
      failed((await db().from("pack_setups").update({ working_since: null }).eq("id", id).eq("workspace_id", ws)).error);
    },
  };
}
