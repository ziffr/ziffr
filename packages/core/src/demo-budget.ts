// The demo's write budget (GLOSSARY: Demo Mode; spec 0051, Limits: A write budget, ticket 5). Before every change a
// visitor may make, `checkDemoBudget` counts it against four numbers and refuses in plain words past any of them. A
// visit's id is free to mint (a script sends a new cookie each time), so what protects the shared demo from a script is
// the network address's count and the whole demo's; the visit's counts are for a person who clicks too fast.
//
// The address is counted only as a KEYED hash (HMAC-SHA256 with ZIFFR_DEMO_ADDRESS_KEY, a server secret): the IPv4
// space is small enough to reverse an unkeyed hash from a database dump. Without the key, or without an address that
// can be trusted (ZIFFR_PROXY_HOPS, as the sign-in limits take it), a change is refused: the budget fails closed.
import { createHmac } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { DEMO_WRITE_BUDGET } from "./demo-limits";
import { bumpDemoVisitCount, minuteStart, resetWindowStart, visitKey } from "./demo-visit";
import { DEMO_BUDGET_USED, DEMO_BUSY, DEMO_GOING_FAST } from "./demo-words";
import { networkAddress } from "./sign-in-limits";

/** A change refused because a budget is used up. A Forbidden, so every place that shows a refusal shows its words. */
export class DemoBudgetUsed extends Forbidden {
  constructor(message: string) {
    super(message);
    this.name = "DemoBudgetUsed";
  }
}

/** The shortest secret accepted for the address key: 32 characters, as the job secret is. */
const MIN_KEY_LENGTH = 32;

/** The keyed hash of a network address: HMAC-SHA256 with the server's secret, as 32 hex characters (128 bits), or null
 * when there is no address or no usable secret (the budget then refuses). Stable for one secret, and not reversible
 * without it, so a database dump holds no address that anyone can recover. */
export function addressKey(address: string | null, secret: string | undefined): string | null {
  if (!address || !secret || secret.length < MIN_KEY_LENGTH) return null;
  return createHmac("sha256", secret).update(`ziffr-demo-address:${address}`).digest("hex").slice(0, 32);
}

/** The counts after one more change, and which of the four budgets they are over, if any; the order is the order they
 * are asked in, so a refused change does not count against the next budget. */
export type BudgetCounts = { address: number; visitMinute: number; visitWindow: number; demo: number };

/** The words for the first budget that is over, or null when all hold. Counts that are not yet known are left out. */
export function budgetRefusal(counts: Partial<BudgetCounts>): string | null {
  const b = DEMO_WRITE_BUDGET;
  if (counts.address !== undefined && counts.address > b.perAddressPerWindow) return DEMO_BUDGET_USED;
  if (counts.visitMinute !== undefined && counts.visitMinute > b.perVisitPerMinute) return DEMO_GOING_FAST;
  if (counts.visitWindow !== undefined && counts.visitWindow > b.perVisitPerWindow) return DEMO_BUDGET_USED;
  if (counts.demo !== undefined && counts.demo > b.demoPerWindow) return DEMO_BUSY;
  return null;
}

/** What a request says about who makes the change: the visit's id from the cookie and its headers (for the address). */
export type DemoRequester = { visitId: string; headers: { get(name: string): string | null } };

/** Counts one change of a visitor against the budget, in the demo only, and throws `DemoBudgetUsed` with the words to
 * show when any budget is over (or the visit or address cannot be counted: closed, never open). A later ticket calls it
 * before every change it opens. The counts live in `demo_visit_counts` and are emptied by each Demo Reset. */
export async function checkDemoBudget(
  actor: Pick<Actor, "workspaceId">,
  who: DemoRequester,
  now: Date = new Date(),
  secret: string | undefined = process.env.ZIFFR_DEMO_ADDRESS_KEY,
): Promise<void> {
  let visit: string;
  try { visit = visitKey(who.visitId); } catch { throw new DemoBudgetUsed(DEMO_BUSY); }
  const address = addressKey(networkAddress(who.headers), secret);
  if (!address) throw new DemoBudgetUsed(DEMO_BUSY);
  const window = resetWindowStart(now);
  const counts: Partial<BudgetCounts> = {};
  // Address first, then the visit, then the demo: a script held by the address's count never uses up the demo's.
  counts.address = await bumpDemoVisitCount(actor, "address", address, window);
  let refused = budgetRefusal(counts);
  if (!refused) {
    counts.visitMinute = await bumpDemoVisitCount(actor, "visit_minute", visit, minuteStart(now));
    counts.visitWindow = await bumpDemoVisitCount(actor, "visit", visit, window);
    refused = budgetRefusal(counts);
  }
  if (!refused) {
    counts.demo = await bumpDemoVisitCount(actor, "demo", "", window);
    refused = budgetRefusal(counts);
  }
  if (refused) throw new DemoBudgetUsed(refused);
}
