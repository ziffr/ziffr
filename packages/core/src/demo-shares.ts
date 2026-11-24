// A visitor's share of an expensive resource of the demo (GLOSSARY: Demo Mode; spec 0051, Limits: Expensive work, ticket 10): counted per
// network address, per network (an IPv4 /24 or IPv6 /48) and, where there is a demo-wide cap, for the whole demo, in a reset window. A
// visit's id is free to mint, so these are what hold against a script. The counts live in `demo_visit_counts` under keys of their own,
// derived (hashed) from the keyed address and network hashes of the write budget with a purpose, so they never share a row with its
// counts. Nothing here acts outside a demo visit.
import { createHash } from "node:crypto";
import type { Actor } from "./actor";
import { addressKey, networkKey, type DemoRequester } from "./demo-budget";
import { DEMO_DECK_BYTES } from "./demo-limits";
import { bumpDemoVisitCount, resetWindowStart } from "./demo-visit";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { inDemoVisit } from "./demo-visitor-words";
import { DEMO_BUSY } from "./demo-words";
import { networkAddress } from "./sign-in-limits";

/** What one purpose may use in a window: per address, per network and (optionally) for the whole demo, in units of `by`. */
export type Shares = { address: number; network: number; demo?: number };

/** The most one count goes up by in one step (`bumpDemoVisitCount` takes 1 to 1000): a larger charge is split. */
const STEP = 1000;

/** Adds `by` to a count in steps and answers the count after it. */
async function add(actor: Pick<Actor, "workspaceId">, kind: "address" | "network", key: string, by: number): Promise<number> {
  const window = resetWindowStart(new Date());
  let total = 0;
  for (let left = Math.max(1, Math.ceil(by)); left > 0; left -= STEP) total = await bumpDemoVisitCount(actor, kind, key, window, Math.min(STEP, left));
  return total;
}

/** Counts `by` of a purpose against the visitor's address and network (and the demo's, where `shares.demo` is set) and refuses with
 * `words` past any of them. Refused as busy (closed) where the address cannot be known. Only in a demo visit. */
export async function chargeShares(
  actor: Pick<Actor, "workspaceId">, who: DemoRequester | null, purpose: string, by: number, shares: Shares, words: string,
  secret: string | undefined = process.env.ZIFFR_DEMO_ADDRESS_KEY,
): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const ip = who ? networkAddress(who.headers) : null;
  const address = addressKey(ip, secret);
  const network = networkKey(ip, secret);
  if (!address || !network) throw new DemoSizeRefused(DEMO_BUSY);
  const key = (base: string) => createHash("sha256").update(`ziffr-demo-${purpose}:${base}`).digest("hex").slice(0, 32);
  if (await add(actor, "address", key(address), by) > shares.address) throw new DemoSizeRefused(words);
  if (await add(actor, "network", key(network), by) > shares.network) throw new DemoSizeRefused(words);
  if (shares.demo !== undefined && await add(actor, "network", key("the whole demo"), by) > shares.demo) throw new DemoSizeRefused(DEMO_BUSY);
}

/** In a demo visit, counts the bytes of a deck's save above the threshold against the address's, the network's and the demo's
 * share of the window, before the save is made. Smaller saves cost only the write budget. */
export async function chargeDeckSave(actor: Pick<Actor, "workspaceId">, who: DemoRequester | null, document: unknown, words: string, secret?: string): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const bytes = Math.min(DEMO_DECK_BYTES.maxCountedBytes, new TextEncoder().encode(JSON.stringify(document ?? null) ?? "").length);
  if (bytes < DEMO_DECK_BYTES.thresholdBytes) return;
  await chargeShares(actor, who, "deck-bytes", Math.ceil(bytes / 1024), { address: DEMO_DECK_BYTES.perAddressKb, network: DEMO_DECK_BYTES.perNetworkKb, demo: DEMO_DECK_BYTES.demoKb }, words, secret);
}
