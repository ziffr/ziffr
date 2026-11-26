// The record of a Set up (spec 0058, #1180; GLOSSARY: Pack, Position, Repeat, Workspace Key): what a Set up did, kept
// so that a line can be added later: the install and its version, who and when, the lines and their names, the people
// put into each Position and the ids of what was made.
// Security: the record decides nothing. No permission, message or sight is worked out from it; every later change goes
// through the same core operations as by hand. Line names are sealed with the Workspace Key. Written for the person
// setting up (an Owner or Admin, checked by the caller) and only in their Workspace.
import { db } from "./db";
import type { Actor } from "./actor";
import { ServerFault } from "./server-fault";
import { sealRow } from "./sealed-columns";
import type { BuiltLine } from "./pack-setup-build";

/** A thing a Set up made. */
export type MadeThing = { kind: "metric" | "dashboard" | "workflow"; key: string; line: BuiltLine | null; id: number };

/** A record being written: where its people and what it makes go. */
export type SetupRecord = {
  id: number;
  /** Notes one thing that was made. */
  made: (thing: MadeThing) => Promise<void>;
  /** Takes the record away again: nothing was made. */
  drop: () => Promise<void>;
};

const failed = (error: unknown) => {
  if (error) throw new ServerFault("The record of this Set up could not be written.");
};

/** Starts the record of a Set up, with its lines and the people of each Position, before anything is made. */
export async function startSetupRecord(actor: Actor, install: { id: number; version: string }, lines: BuiltLine[], people: Map<string, string[]>): Promise<SetupRecord> {
  const ws = actor.workspaceId;
  const { data, error } = await db().from("pack_setups").insert({ workspace_id: ws, install_id: install.id, pack_version: install.version, made_by: actor.personId }).select("id").single();
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
  return {
    id,
    drop,
    made: async (thing) => {
      failed((await db().from("pack_setup_items").insert({ workspace_id: ws, setup_id: id, line_id: thing.line ? lineIds.get(thing.line)! : null, kind: thing.kind, pack_key: thing.key, object_id: thing.id })).error);
    },
  };
}
