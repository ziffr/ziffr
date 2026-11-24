// The demo's write budget (GLOSSARY: Demo Mode; spec 0051, Limits: A write budget, ticket 5). Before every change a
// visitor may make, `checkDemoBudget` counts it against five numbers and refuses in plain words past any of them. A
// visit's id is free to mint (a script sends a new cookie each time), so what protects the shared demo from a script is
// the counts of the network address, of its network (an IPv4 /24 or an IPv6 /48) and of the whole demo; the visit's
// counts are for a person who clicks too fast. The address's and the network's shares are small beside the demo's, so
// one script cannot use up the demo's budget alone.
//
// The address and network are counted only as KEYED hashes (HMAC-SHA256 with ZIFFR_DEMO_ADDRESS_KEY, a server secret):
// the IPv4 space is small enough to reverse an unkeyed hash from a database dump. Without the key, or without an address
// that can be trusted (ZIFFR_PROXY_HOPS, as the sign-in limits take it), a change is refused: the budget fails closed,
// and says so once per window in the server's log, so a misconfiguration is not mistaken for a busy demo.
import { createHmac } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { DEMO_WRITE_BUDGET } from "./demo-limits";
import { bumpDemoVisitCount, minuteStart, resetWindowStart, visitKey } from "./demo-visit";
import { DEMO_BUDGET_USED, DEMO_BUSY, DEMO_GOING_FAST, DEMO_VALUE_WORDS } from "./demo-words";
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

/** A keyed hash of a value: HMAC-SHA256 with the server's secret, as 32 hex characters (128 bits), or null when there is
 * no value or no usable secret. Stable for one secret and not reversible without it. `purpose` keeps an address's hash
 * apart from its network's. */
function keyed(purpose: string, value: string | null, secret: string | undefined): string | null {
  if (!value || !secret || secret.length < MIN_KEY_LENGTH) return null;
  return createHmac("sha256", secret).update(`ziffr-demo-${purpose}:${value}`).digest("hex").slice(0, 32);
}

/** The keyed hash of a network address, or null when there is no address or no usable secret (the budget then refuses). */
export function addressKey(address: string | null, secret: string | undefined): string | null {
  return keyed("address", address, secret);
}

/** The network an address belongs to: an IPv4 address's /24, or an IPv6 address's /48 (`networkAddress` gives an IPv6
 * address as its /64, "a:b:c:d::/64"), or null for anything else. */
export function networkOf(address: string | null): string | null {
  if (!address) return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(address);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  const v6 = /^([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4}):[0-9a-f]{1,4}::\/64$/i.exec(address);
  return v6 ? `${v6[1]}:${v6[2]}:${v6[3]}::/48`.toLowerCase() : null;
}

/** The keyed hash of an address's network, as `addressKey` is of the address. */
export function networkKey(address: string | null, secret: string | undefined): string | null {
  return keyed("network", networkOf(address), secret);
}

/** The counts after one more change, in the order they are asked in, so a refused change does not count against the next. */
export type BudgetCounts = { address: number; network: number; visitMinute: number; visitWindow: number; demo: number };

/** The words for the first budget that is over, or null when all hold. Counts that are not yet known are left out. */
export function budgetRefusal(counts: Partial<BudgetCounts>): string | null {
  const b = DEMO_WRITE_BUDGET;
  if (counts.address !== undefined && counts.address > b.perAddressPerWindow) return DEMO_BUDGET_USED;
  if (counts.network !== undefined && counts.network > b.perNetworkPerWindow) return DEMO_BUDGET_USED;
  if (counts.visitMinute !== undefined && counts.visitMinute > b.perVisitPerMinute) return DEMO_GOING_FAST;
  if (counts.visitWindow !== undefined && counts.visitWindow > b.perVisitPerWindow) return DEMO_BUDGET_USED;
  if (counts.demo !== undefined && counts.demo > b.demoPerWindow) return DEMO_BUSY;
  return null;
}

/** What a request says about who makes the change: the visit's id from the cookie and its headers (for the address). */
export type DemoRequester = { visitId: string; headers: { get(name: string): string | null } };

// The windows for which a misconfiguration was already logged, by reason: one line per window, never one per request.
const logged = new Map<string, number>();

/** Logs a misconfiguration once per reset window (the demo's own clock) so an operator sees it; the visitor only ever
 * reads "busy". The line names the setting to check and no address or visit. */
function logOncePerWindow(reason: "key" | "address", window: Date): void {
  if (logged.get(reason) === window.getTime()) return;
  logged.set(reason, window.getTime());
  console.error(reason === "key"
    ? "demo: no usable address key: set ZIFFR_DEMO_ADDRESS_KEY (at least 32 characters); visitors' changes are refused"
    : "demo: no trusted client address: check ZIFFR_PROXY_HOPS; visitors' changes are refused");
}

/** What a change weighs: `by` units (a paste of 100 values is 100), whether it writes values (counted per address against its share of the
 * values' cap), whether it runs the Workflows (one run per address in the slot's minutes) and whether it is an Ask me now claim (capped per address). */
export type BudgetWeight = { by?: number; values?: boolean; run?: boolean; askNow?: boolean };

/** Counts one change of a visitor against the budget, in the demo only, and throws `DemoBudgetUsed` with the words to
 * show when any budget is over (or the visit or address cannot be counted: closed, never open). A later ticket calls it
 * before every change it opens. The counts live in `demo_visit_counts` and are emptied by each Demo Reset. */
export async function checkDemoBudget(
  actor: Pick<Actor, "workspaceId">,
  who: DemoRequester,
  now: Date = new Date(),
  secret: string | undefined = process.env.ZIFFR_DEMO_ADDRESS_KEY,
  weight: BudgetWeight = {},
): Promise<void> {
  const by = Math.max(1, Math.min(1000, Math.floor(weight.by ?? 1)));
  const window = resetWindowStart(now);
  let visit: string;
  try { visit = visitKey(who.visitId); } catch { throw new DemoBudgetUsed(DEMO_BUSY); }
  const ip = networkAddress(who.headers);
  const address = addressKey(ip, secret);
  const network = networkKey(ip, secret);
  if (!address || !network) {
    if (!secret || secret.length < MIN_KEY_LENGTH) logOncePerWindow("key", window);
    else logOncePerWindow("address", window);
    throw new DemoBudgetUsed(DEMO_BUSY);
  }
  const counts: Partial<BudgetCounts> = {};
  // Address, network, visit, demo: a refusal stops the rest, so a script held by its address never counts against the demo's.
  counts.address = await bumpDemoVisitCount(actor, "address", address, window, by);
  let refused = budgetRefusal(counts);
  if (!refused) {
    counts.network = await bumpDemoVisitCount(actor, "network", network, window, by);
    refused = budgetRefusal(counts);
  }
  if (!refused) {
    counts.visitMinute = await bumpDemoVisitCount(actor, "visit_minute", visit, minuteStart(now));
    counts.visitWindow = await bumpDemoVisitCount(actor, "visit", visit, window, by);
    refused = budgetRefusal(counts);
  }
  if (!refused) {
    counts.demo = await bumpDemoVisitCount(actor, "demo", "", window, by);
    refused = budgetRefusal(counts);
  }
  const b = DEMO_WRITE_BUDGET;
  // One address's share of what the whole demo holds: values, Ask me now claims, and a slot to run the Workflows.
  if (!refused && weight.values && (await bumpDemoVisitCount(actor, "address_values", address, window, by)) > b.perAddressValuesPerWindow) refused = DEMO_BUDGET_USED;
  if (!refused && weight.askNow && (await bumpDemoVisitCount(actor, "ask_now", address, window)) > b.perAddressAskNowPerWindow) refused = DEMO_BUDGET_USED;
  if (!refused && weight.run) {
    const slot = new Date(Math.floor(now.getTime() / (b.workflowSlotMinutes * 60_000)) * b.workflowSlotMinutes * 60_000);
    if ((await bumpDemoVisitCount(actor, "workflow_slot", address, slot)) > 1) refused = DEMO_VALUE_WORDS.run;
  }
  if (refused) throw new DemoBudgetUsed(refused);
}

/** The key under which the one Workflow run a minute is counted: a hash-shaped constant, as every count but the demo's is keyed. */
const RUN_KEY = "0".repeat(32);

/** Lets one Workflow run in the whole demo each minute (spec 0051, Limits: Expensive work): counts this call under the
 * minute's start and throws `DemoBudgetUsed` for any past the first, in words that say when it works again. The count
 * lives in `demo_visit_counts` and is emptied by each Demo Reset. */
export async function takeDemoWorkflowRun(actor: Pick<Actor, "workspaceId">, now: Date = new Date()): Promise<void> {
  if ((await bumpDemoVisitCount(actor, "workflow_run", RUN_KEY, minuteStart(now))) > 1) throw new DemoBudgetUsed(DEMO_VALUE_WORDS.run);
}
