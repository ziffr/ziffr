// What the Packs page offers for a Pack after its set-up (spec 0068, #1345; GLOSSARY: Pack, Submitter, Position,
// Target Series, Invitation, Self-check): finish a set-up that stopped, open its dashboard, choose who provides numbers,
// set the asked numbers for a new period, change who approves, invite the people the set-up named.
// Security: only Owners and Admins, only their Workspace's installs; each way is offered only where this person may use
// it now, and a dashboard only to someone who sees it. It answers counts, yes or no, fixed words and that dashboard's
// id; each screen reads and checks for itself.
import { visibleDashboards } from "./access";
import { type Actor } from "./actor";
import { db } from "./db";
import { packAfter } from "./pack-after";
import { holderPositions } from "./pack-after-holder";
import { ownChecks, packInvitees } from "./pack-after-invite";
import { askedMetrics, numbersLabel } from "./pack-after-numbers";
import { unprovided } from "./pack-after-providers";
import { assertSetsUp } from "./pack-setup-install";
import { setupStates } from "./pack-setup-record";

/** The ways offered for one installed Pack. */
export type PackCard = {
  installId: number;
  /** Whether something was set up from it, or a set-up finished: then it is not set up a first time again. */
  setUp: boolean;
  /** The first dashboard a set-up made that this person sees, or null. */
  dashboard: number | null;
  /** A guided set-up that stopped half way: this person's to finish, or someone else's. */
  finish: "you" | "someone" | null;
  /** How many numbers made here nobody provides and this person may choose for. */
  providers: number;
  /** The words of setting the asked numbers again, or null. */
  numbers: string | null;
  /** Whether this person may change who approves. */
  approver: boolean;
  /** How many people of the set-up can be invited and are not yet. */
  invite: number;
  /** Whether a value of this person's on its numbers waits for their own check. */
  check: boolean;
};

async function cardOf(actor: Actor, installId: number, seen: ReadonlySet<number>): Promise<PackCard> {
  const states = await setupStates(actor, installId);
  const open = states.find((s) => s.guided && !s.finished && s.made > 0);
  const a = await packAfter(actor, installId);
  const [approver, invitees, checks] = await Promise.all([holderPositions(actor, a), packInvitees(actor, a), ownChecks(actor, a)]);
  return {
    installId,
    setUp: states.some((s) => s.finished || s.made > 0),
    dashboard: a.made.find((m) => m.kind === "dashboard" && seen.has(Number(m.id)))?.id ?? null,
    finish: open ? (open.by === actor.personId ? "you" : "someone") : null,
    providers: unprovided(a).length,
    numbers: numbersLabel(askedMetrics(a)),
    approver: approver > 0,
    invite: invitees.filter((p) => p.state === "open").length,
    check: checks.length > 0,
  };
}

/** The ways offered for each installed Pack of the actor's Workspace that has a record of a set-up (Owners and Admins).
 * One whose read fails offers nothing, a first set-up included, rather than breaking the page. */
export async function packCards(actor: Actor): Promise<PackCard[]> {
  assertSetsUp(actor);
  const { data, error } = await db().from("pack_setups").select("install_id").eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("What was set up could not be read.");
  const installs = [...new Set((data ?? []).map((r) => Number(r.install_id)))];
  const seen = new Set((await visibleDashboards(actor.workspaceId, actor.personId)).map((d) => Number(d.id)));
  return Promise.all(installs.map((id) => cardOf(actor, id, seen).catch((e: unknown): PackCard => {
    console.error("The ways after a Pack's set-up could not be read:", e);
    return { installId: id, setUp: true, dashboard: null, finish: null, providers: 0, numbers: null, approver: false, invite: 0, check: false };
  })));
}
