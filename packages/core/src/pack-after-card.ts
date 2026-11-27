// What the Packs page offers for a Pack after its set-up (spec 0068, #1345; GLOSSARY: Pack, Submitter, Position,
// Target Series, Invitation): finish a set-up that stopped, choose who provides numbers, set the asked numbers for a new
// period, change who approves, invite the people the set-up named.
// Security: only Owners and Admins, only their Workspace's installs; each way is offered only where this person may use
// it now. It answers counts and fixed words; each screen reads and checks for itself.
import { type Actor } from "./actor";
import { db } from "./db";
import { packAfter } from "./pack-after";
import { holderPositions } from "./pack-after-holder";
import { packInvitees } from "./pack-after-invite";
import { askedMetrics, numbersLabel } from "./pack-after-numbers";
import { unprovided } from "./pack-after-providers";
import { assertSetsUp } from "./pack-setup-install";
import { setupStates } from "./pack-setup-record";

/** The ways offered for one installed Pack. */
export type PackCard = {
  installId: number;
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
};

async function cardOf(actor: Actor, installId: number): Promise<PackCard> {
  const states = await setupStates(actor, installId);
  const open = states.find((s) => s.guided && !s.finished && s.made > 0);
  const a = await packAfter(actor, installId);
  const [approver, invitees] = await Promise.all([holderPositions(actor, a), packInvitees(actor, a)]);
  return {
    installId,
    finish: open ? (open.by === actor.personId ? "you" : "someone") : null,
    providers: unprovided(a).length,
    numbers: numbersLabel(askedMetrics(a)),
    approver: approver > 0,
    invite: invitees.filter((p) => p.state === "open").length,
  };
}

/** The ways offered for each installed Pack of the actor's Workspace that was set up from (Owners and Admins). A Pack
 * with nothing to offer is left out; one whose read fails offers nothing rather than breaking the page. */
export async function packCards(actor: Actor): Promise<PackCard[]> {
  assertSetsUp(actor);
  const { data, error } = await db().from("pack_setups").select("install_id").eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("What was set up could not be read.");
  const installs = [...new Set((data ?? []).map((r) => Number(r.install_id)))];
  const cards = await Promise.all(installs.map((id) => cardOf(actor, id).catch((e: unknown) => {
    console.error("The ways after a Pack's set-up could not be read:", e);
    return null;
  })));
  return cards.filter((c): c is PackCard => c !== null && Boolean(c.finish || c.providers || c.numbers || c.approver || c.invite));
}
