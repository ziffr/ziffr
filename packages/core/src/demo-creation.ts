// A visitor's share of what the demo can hold (GLOSSARY: Demo Mode; spec 0051, Limits, final review D2). The row caps hold for the
// whole demo, so without a share per address one script could fill every kind for every visitor (and a cron could repeat it each
// window). Before a server action that makes rows of a capped kind (`DEMO_CREATES`) the visitor's wrapper charges this: a quarter
// of the kind's cap to one network address and half to one network in a reset window, counted under the same keyed hashes as the
// values' share (`chargeShares`). An automatic Version is charged the same way but is only ever left out, never refused, so it can
// not fail the edit it follows. Nothing here acts outside a demo visit.
import type { Actor } from "./actor";
import type { DemoRequester } from "./demo-budget";
import { DEMO_CREATES, DEMO_ROW_CAPS, demoCreationShare } from "./demo-limits";
import { chargeShares } from "./demo-shares";
import { visitWho } from "./demo-visit-scope";
import { demoShareWords } from "./demo-words";

/** Counts one row of `kind` against the address's and network's share of its cap, refusing in plain words past it. */
async function chargeKind(actor: Pick<Actor, "workspaceId">, who: DemoRequester | null, kind: keyof typeof DEMO_ROW_CAPS, secret?: string, demo?: number): Promise<void> {
  await chargeShares(actor, who, `create-${kind}`, 1, { ...demoCreationShare(DEMO_ROW_CAPS[kind]), demo }, demoShareWords(kind), secret);
}

/** Counts one creation of the kind `operation` makes (`DEMO_CREATES`) against the visitor's address and network, before the write;
 * refuses in plain words past the share. An operation that makes nothing capped costs nothing here. Only in a demo visit. */
export async function chargeCreation(actor: Pick<Actor, "workspaceId">, who: DemoRequester | null, operation: string, secret?: string): Promise<void> {
  const kind = DEMO_CREATES[operation];
  if (kind) await chargeKind(actor, who, kind, secret);
}

/** Whether an automatic Version (or a baseline) may be written now: false past this address's or network's share of the Versions'
 * cap, so the caller leaves the Version out and goes on with the edit. A visit with no requester (its scope was not made by the
 * visitor's wrapper) is let through: the database's cap still holds. Any failure to count says no (the Version is a courtesy). */
export async function mayRecordAutoVersion(actor: Pick<Actor, "workspaceId">): Promise<boolean> {
  const who = visitWho();
  if (!who) return true;
  try {
    // Automatic Versions also have a share of the whole demo, two thirds of the cap, so named ones always find room.
    await chargeKind(actor, who, "versions", undefined, Math.floor((DEMO_ROW_CAPS.versions * 2) / 3));
    return true;
  } catch {
    return false;
  }
}
