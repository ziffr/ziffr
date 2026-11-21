// A cheap gate in front of a Webhook's inbound address (GLOSSARY: Webhook; spec 0034, ticket #487). Webhook ids are not
// secret, so anyone can send unsigned requests to /api/webhooks/{id}/in; each costs a database read and a key opening
// before it is refused. The gate counts FAILED requests (bad, missing or old signature, replay, unknown id), never
// successful ones, in memory:
//  - an address (IPv4 address, IPv6 /56) with 20 failures in a minute to one Webhook, or 100 to all Webhooks together, is
//    refused (429) before the secret is opened;
//  - a Webhook with 600 failures in a minute from anywhere refuses everyone except known senders and, at most 60 a minute,
//    addresses with no failures of their own (a real new sender); a known sender is still refused if its own address keeps failing against that Webhook (counted since its last success), but not for failures against other Webhooks;
//  - a known sender is a network address that sent a valid signed request to that Webhook in the last day (16 per
//    Webhook, held on this process only): it skips the Webhook's ceiling (not its own address's failures), so a real sender keeps working through any flood from other addresses.
// Remaining trade-off: past the ceiling, a sender that is neither known (on this process, in the last day) nor lucky in the
// 60-a-minute budget is refused until the flood eases. Without a network address (ZIFFR_PROXY_HOPS unset) nobody can be
// known or admitted by the budget, so a flood past the ceiling locks the real sender out until it stops. Tables are bounded and expire from the front in O(1) per request; when full
// they drop the oldest entry, never refuse. Counters are per process: this bounds the cost of a flood, it is not the
// 60-a-minute limit for senders who proved the secret (that stays in the database). Only the network address is held.
import { WEBHOOK_INBOUND_FAILURES_PER_ADDRESS, WEBHOOK_INBOUND_FAILURES_PER_ADDRESS_ANY_ID, WEBHOOK_INBOUND_FAILURES_PER_ID, WEBHOOK_INBOUND_KNOWN_SENDERS, WEBHOOK_INBOUND_NEW_SENDERS_PER_MINUTE } from "./webhook-limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_KEYS = 10_000;
/** Known senders can only be added by a valid signature, so their table is larger: nobody can cheaply push a real sender out. */
const MAX_KNOWN = 100_000;

/** An insertion-ordered table whose entries are stamped when (re)inserted, so the oldest is always first. */
class Table<V extends { at: number }> {
  private m = new Map<string, V>();
  constructor(private ttl: number, private max: number = MAX_KEYS) {}
  /** The live entry for a key, after dropping expired ones from the front (stops at the first live one). */
  get(key: string, now: number): V | undefined {
    for (const [k, v] of this.m) {
      if (now - v.at < this.ttl) break;
      this.m.delete(k);
    }
    const v = this.m.get(key);
    // A clock set back can leave a newer entry in front of an older one; an entry past its time is never returned.
    return v && now - v.at < this.ttl ? v : undefined;
  }
  /** Puts an entry last (it is the newest), dropping the oldest when the table is full. */
  put(key: string, v: V): void {
    this.m.delete(key);
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(key, v);
  }
  delete(key: string): void {
    this.m.delete(key);
  }
  clear(): void {
    this.m.clear();
  }
}

type Count = { at: number; n: number };
type Known = { at: number; units: { unit: string; at: number }[] };
const addressFailures = new Table<Count>(MINUTE);
const idFailures = new Table<Count>(MINUTE);
const anyIdFailures = new Table<Count>(MINUTE);
const newSenders = new Table<Count>(MINUTE);
// Kept apart from the failure tables so a flood of failures can never push a known sender out.
const known = new Table<Known>(DAY, MAX_KNOWN);

/** The unit an address is counted by: an IPv4 address as it is, an IPv6 /64 (as networkAddress gives it) widened to its /56,
 * which is what one allocation usually is, so rotating addresses inside it does not help. */
function unitOf(network: string | null): string | null {
  if (!network) return null;
  const n = String(network).slice(0, 64).toLowerCase();
  const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4})::\/64$/.exec(n);
  return m ? `${m[1]}:${m[2]}:${m[3]}:${m[4].padStart(4, "0").slice(0, 2)}::/56` : n;
}

const idOf = (webhookId: string) => {
  const id = String(webhookId).toLowerCase();
  return UUID.test(id) ? id : null;
};

/** Whether a request to this Webhook id from this network address (null when unknown) may go on to be judged. Ids that are
 * not UUIDs are not counted: the core answers them 404 without any work. */
export function admitWebhookInbound(webhookId: string, network: string | null, now: number = Date.now()): boolean {
  const id = idOf(webhookId);
  if (!id) return true;
  const unit = unitOf(network);
  const own = unit ? addressFailures.get(`${id}:${unit}`, now)?.n ?? 0 : 0;
  // 1. An address that keeps failing against this Webhook since its last success is refused, a known sender included.
  if (unit && own >= WEBHOOK_INBOUND_FAILURES_PER_ADDRESS) return false;
  // 2. A known sender of this Webhook is let in ahead of the cross-Webhook count: others behind the same NAT or /56 failing against other ids must not revoke it.
  if (unit && known.get(id, now)?.units.some((u) => u.unit === unit && now - u.at < DAY)) return true;
  // 3. An address failing against many Webhooks.
  if (unit && (anyIdFailures.get(unit, now)?.n ?? 0) >= WEBHOOK_INBOUND_FAILURES_PER_ADDRESS_ANY_ID) return false;
  // 4. The Webhook's ceiling, with the budget below.
  if ((idFailures.get(id, now)?.n ?? 0) < WEBHOOK_INBOUND_FAILURES_PER_ID) return true;
  // Past the ceiling: only an address with no failures of its own, and only 60 of those a minute, so a real new sender
  // can still get in. A flood of fresh addresses uses the budget up, and each one that then fails counts against itself.
  if (!unit || own > 0) return false;
  const budget = newSenders.get(id, now);
  if (!budget) {
    newSenders.put(id, { at: now, n: 1 });
    return true;
  }
  return ++budget.n <= WEBHOOK_INBOUND_NEW_SENDERS_PER_MINUTE;
}

/** Counts a request that was not taken against its address and, when the Webhook exists, against the Webhook. */
export function recordWebhookInboundFailure(webhookId: string, network: string | null, exists: boolean, now: number = Date.now()): void {
  const id = idOf(webhookId);
  if (!id) return;
  // A live counter is changed in place, so the table stays ordered by when each window began.
  const bump = (t: Table<Count>, key: string) => {
    const c = t.get(key, now);
    if (c) c.n++;
    else t.put(key, { at: now, n: 1 });
  };
  // Made-up ids count against their address only: they must not wear out (or evict) the counter of a real Webhook.
  if (exists) bump(idFailures, id);
  const unit = unitOf(network);
  if (unit) {
    bump(addressFailures, `${id}:${unit}`);
    bump(anyIdFailures, unit);
  }
}

/** Remembers that this address sent a valid signed request to this Webhook, so the gate lets it past the Webhook's ceiling for a day (not past its own address's failures). Only for a request whose signature was valid and taken. */
export function recordWebhookInboundSender(webhookId: string, network: string | null, now: number = Date.now()): void {
  const id = idOf(webhookId);
  const unit = unitOf(network);
  if (!id || !unit) return;
  const units = (known.get(id, now)?.units ?? []).filter((u) => u.unit !== unit && now - u.at < DAY);
  units.push({ unit, at: now });
  // Failures count "since the last success": a taken request clears this address's own count for this Webhook.
  addressFailures.delete(`${id}:${unit}`);
  known.put(id, { at: now, units: units.slice(-WEBHOOK_INBOUND_KNOWN_SENDERS) });
}

/** Forgets every count (tests only). */
export function resetWebhookInboundGate(): void {
  addressFailures.clear();
  idFailures.clear();
  anyIdFailures.clear();
  newSenders.clear();
  known.clear();
}
