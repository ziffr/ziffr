// The record of a Set up (spec 0058, #1180; GLOSSARY: Pack, Position, Repeat, Workspace Key): what a Set up did, kept
// so that a line can be added later: the install and its version, who and when, the lines and their names, the people
// put into each Position and the ids of what was made.
// Security: the record decides nothing. No permission, message or sight is worked out from it; every later change goes
// through the same core operations as by hand. Line names are sealed with the Workspace Key. Written for the person
// setting up (an Owner or Admin, checked by the caller) and only in their Workspace.
import { db } from "./db";
import type { Actor } from "./actor";
import { ServerFault } from "./server-fault";
import { openRows, sealRow } from "./sealed-columns";
import type { BuiltLine } from "./pack-setup-build";

/** A thing a Set up made. */
export type MadeThing = { kind: "metric" | "dashboard" | "workflow"; key: string; line: Pick<BuiltLine, "repeat" | "name"> | null; id: number };

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
    finish: (messages) => update({ messages, finished_at: new Date().toISOString() }),
    drop: async () => { await db().from("pack_setups").delete().eq("id", id).eq("workspace_id", ws); },
  };
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
    for (const line of lines) {
      // The name is sealed for its row, so the row is made first, without it.
      const { data: row, error: lineError } = await db().from("pack_setup_lines").insert({ workspace_id: ws, setup_id: id, repeat_key: line.repeat }).select("id").single();
      failed(lineError);
      const lineId = Number(row!.id);
      const sealed = await sealRow("pack_setup_lines", ws, { id: lineId, name: line.name });
      failed((await db().from("pack_setup_lines").update({ name: sealed.name }).eq("id", lineId).eq("workspace_id", ws)).error);
      lineIds.set(line, lineId);
    }
    const rows = [[null, people] as const, ...lines.map((l) => [lineIds.get(l)!, l.fills] as const)].flatMap(([lineId, fills]) =>
      [...fills].flatMap(([position, ids]) => ids.map((person) => ({ workspace_id: ws, setup_id: id, line_id: lineId, position_key: position, person_id: person }))));
    if (rows.length) failed((await db().from("pack_setup_people").insert(rows)).error);
  } catch (e) {
    await drop();
    throw e;
  }
  return recordOf(ws, id, 0, (line) => lineIds.get(line)!);
}

/** Takes up the next step of a Set up in steps: only the person who started it, only with the same choices, only while
 * it is not finished, and each step once. Answers the record, what it made so far and how many requests went out. */
export async function resumeSetupRecord(actor: Actor, installId: number, run: { id: number; step: number }, mark: string): Promise<{ record: SetupRecord; made: MadeThing[]; messages: number }> {
  const ws = actor.workspaceId;
  const gone = "This Set up cannot go on: it was finished or stopped, or its choices changed. Open the Packs page again to see what was made.";
  if (!Number.isSafeInteger(run?.id) || !Number.isSafeInteger(run?.step) || run.step < 0) throw new Error(gone);
  // Taken in one write, so two requests for the same step never both make things.
  const { data: taken } = await db().from("pack_setups").update({ step: run.step + 1 })
    .eq("id", run.id).eq("workspace_id", ws).eq("install_id", installId).eq("made_by", actor.personId).eq("input_mark", mark).eq("step", run.step).is("finished_at", null).select("id, messages");
  if (!taken?.length) throw new Error(gone);
  const [{ data: lineRows }, { data: items }] = await Promise.all([
    db().from("pack_setup_lines").select("id, repeat_key, name").eq("setup_id", run.id).eq("workspace_id", ws),
    db().from("pack_setup_items").select("kind, pack_key, line_id, object_id").eq("setup_id", run.id).eq("workspace_id", ws).order("id"),
  ]);
  const opened = await openRows("pack_setup_lines", ws, lineRows);
  const byId = new Map(opened.map((l) => [Number(l.id), { repeat: String(l.repeat_key), name: String(l.name) }]));
  const made = (items ?? []).map((i): MadeThing => ({ kind: i.kind as MadeThing["kind"], key: String(i.pack_key), line: i.line_id === null ? null : byId.get(Number(i.line_id)) ?? null, id: Number(i.object_id) }));
  const lineId = (line: BuiltLine) => [...byId].find(([, l]) => l.repeat === line.repeat && l.name === line.name)![0];
  return { record: recordOf(ws, run.id, run.step + 1, lineId), made, messages: Number(taken[0].messages) };
}
