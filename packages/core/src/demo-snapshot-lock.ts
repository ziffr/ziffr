// One Snapshot at a time in the demo (GLOSSARY: Demo Mode, Snapshot; spec 0051, Limits: Expensive work, ticket 10). Taking a
// Snapshot freezes a whole dashboard's numbers: the demo's most expensive change. So a visitor takes one only while holding the
// demo's one turn (a lease in `demo_snapshot_lock`, taken and released in single statements, that runs out by itself so a crash
// cannot hold it), and only a few in a reset window for one visit and for one network address (the visit's id is free to
// mint, so the address's share is what holds against a script). Nothing here acts outside a demo visit.
import { randomBytes } from "node:crypto";
import type { Actor } from "./actor";
import { addressKey, type DemoRequester } from "./demo-budget";
import { db } from "./db";
import { DEMO_SNAPSHOT_LIMITS } from "./demo-limits";
import { chargeShares } from "./demo-shares";
import { chargeVisitor, DemoSizeRefused } from "./demo-visitor-limits";
import { inDemoVisit } from "./demo-visitor-words";
import { DEMO_BUSY } from "./demo-words";
import { networkAddress } from "./sign-in-limits";

/** What a visitor reads when another visitor is taking a Snapshot. */
export const DEMO_SNAPSHOT_BUSY = "Another visitor is taking a Snapshot. Try again in a moment.";
/** What a visitor reads when their visit or network address has taken its share of Snapshots. */
export const DEMO_SNAPSHOT_USED = "You have taken a few Snapshots already. Try again when the demo starts fresh.";

/** The demo's one turn to take a Snapshot, held while the work runs; `takeSnapshot` takes it as proof in a demo visit. */
export type SnapshotTurn = { readonly holder: string };
const turns = new WeakSet<object>();

/** In a demo visit, refuses unless `turn` was handed out by `withSnapshotTurn`: nothing takes a Snapshot there without the lock.
 * Nothing elsewhere. */
export function assertSnapshotTurn(actor: Pick<Actor, "workspaceId">, turn: SnapshotTurn | undefined): void {
  if (inDemoVisit(actor) && !(turn && turns.has(turn))) throw new DemoSizeRefused(DEMO_BUSY);
}

/** Runs `work` holding the demo's turn to take a Snapshot, in a demo visit; elsewhere just runs it (`turn` is then null).
 * Refused in the demo's words when another visitor holds the turn, when the visit or its network address has taken its share
 * of the window, or when the address cannot be known (closed, as the write budget is). The turn is given back when the work
 * ends, however it ends. */
export async function withSnapshotTurn<T>(actor: Pick<Actor, "workspaceId">, who: DemoRequester | null, work: (turn: SnapshotTurn | null) => Promise<T>, secret: string | undefined = process.env.ZIFFR_DEMO_ADDRESS_KEY): Promise<T> {
  if (!inDemoVisit(actor)) return work(null);
  const address = who ? addressKey(networkAddress(who.headers), secret) : null;
  if (!address) throw new DemoSizeRefused(DEMO_BUSY);
  const holder = randomBytes(16).toString("hex");
  const { data, error } = await db().rpc("demo_snapshot_lock_take", { p_holder: holder, p_seconds: DEMO_SNAPSHOT_LIMITS.lockSeconds });
  if (error) { console.error("demo snapshot lock (take):", error.message); throw new DemoSizeRefused(DEMO_BUSY); }
  if (data !== true) throw new DemoSizeRefused(DEMO_SNAPSHOT_BUSY);
  try {
    await chargeVisitor(actor, "snapshots", 1, DEMO_SNAPSHOT_LIMITS.perVisitPerWindow, DEMO_SNAPSHOT_USED);
    // The address's and the network's share, under keys of their own (a script mints visits freely, not addresses and networks).
    await chargeShares(actor, who, "snapshots", 1, { address: DEMO_SNAPSHOT_LIMITS.perAddressPerWindow, network: DEMO_SNAPSHOT_LIMITS.perNetworkPerWindow }, DEMO_SNAPSHOT_USED, secret);
    const turn: SnapshotTurn = { holder };
    turns.add(turn);
    return await work(turn);
  } finally {
    // A lease that is not given back runs out by itself.
    const { error: e } = await db().rpc("demo_snapshot_lock_release", { p_holder: holder });
    if (e) console.error("demo snapshot lock (release):", e.message);
  }
}
