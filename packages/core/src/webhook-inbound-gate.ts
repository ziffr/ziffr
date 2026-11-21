// A cheap gate in front of a Webhook's inbound address (GLOSSARY: Webhook; spec 0034, ticket #487). Webhook ids are not
// secret, so anyone can send unsigned requests to /api/webhooks/{id}/in; each costs a database read and a key opening
// before it is refused. The gate counts FAILED requests (bad, missing or old signature, replay, unknown id), never
// successful ones, in memory:
//  - an address (IPv4 address, IPv6 /56) with 20 failures in a minute is refused (429) before the secret is opened;
//  - a Webhook with 600 failures in a minute from anywhere refuses everyone except known senders;
//  - a known sender is a network address that sent a valid signed request to that Webhook in the last hour (16 per
//    Webhook): it is never refused, so a real sender keeps working through any flood from other addresses.
// Without a network address (ZIFFR_PROXY_HOPS unset) nobody can be a known sender, so a flood past the Webhook's ceiling
// locks the real sender out until it stops. Tables are bounded and expire from the front in O(1) per request; when full
// they drop the oldest entry, never refuse. Counters are per process: this bounds the cost of a flood, it is not the
// 60-a-minute limit for senders who proved the secret (that stays in the database). Only the network address is held.
import { WEBHOOK_INBOUND_FAILURES_PER_ADDRESS, WEBHOOK_INBOUND_FAILURES_PER_ID, WEBHOOK_INBOUND_KNOWN_SENDERS } from "./webhook-limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const MAX_KEYS = 10_000;

/** An insertion-ordered table whose entries are stamped when (re)inserted, so the oldest is always first. */
class Table<V extends { at: number }> {
  private m = new Map<string, V>();
  constructor(private ttl: number) {}
  /** The live entry for a key, after dropping expired ones from the front (stops at the first live one). */
  get(key: string, now: number): V | undefined {
    for (const [k, v] of this.m) {
      if (now - v.at < this.ttl) break;
      this.m.delete(k);
    }
    return this.m.get(key);
  }
  /** Puts an entry last (it is the newest), dropping the oldest when the table is full. */
  put(key: string, v: V): void {
    this.m.delete(key);
    if (this.m.size >= MAX_KEYS) this.m.delete(this.m.keys().next().value as string);
    this.m.set(key, v);
  }
  clear(): void {
    this.m.clear();
  }
}

type Count = { at: number; n: number };
type Known = { at: number; units: { unit: string; at: number }[] };
const addressFailures = new Table<Count>(MINUTE);
const idFailures = new Table<Count>(MINUTE);
// Kept apart from the failure tables so a flood of failures can never push a known sender out.
const known = new Table<Known>(HOUR);

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
  if (unit && known.get(id, now)?.units.some((u) => u.unit === unit && now - u.at < HOUR)) return true;
  if (unit && (addressFailures.get(`${id}:${unit}`, now)?.n ?? 0) >= WEBHOOK_INBOUND_FAILURES_PER_ADDRESS) return false;
  return (idFailures.get(id, now)?.n ?? 0) < WEBHOOK_INBOUND_FAILURES_PER_ID;
}

/** Counts a request that was not taken (unknown, unsigned, wrong, old or replayed) against its address and its Webhook. */
export function recordWebhookInboundFailure(webhookId: string, network: string | null, now: number = Date.now()): void {
  const id = idOf(webhookId);
  if (!id) return;
  // A live counter is changed in place, so the table stays ordered by when each window began.
  const bump = (t: Table<Count>, key: string) => {
    const c = t.get(key, now);
    if (c) c.n++;
    else t.put(key, { at: now, n: 1 });
  };
  bump(idFailures, id);
  const unit = unitOf(network);
  if (unit) bump(addressFailures, `${id}:${unit}`);
}

/** Remembers that this address sent a valid signed request to this Webhook, so the gate never refuses it for an hour. */
export function recordWebhookInboundSender(webhookId: string, network: string | null, now: number = Date.now()): void {
  const id = idOf(webhookId);
  const unit = unitOf(network);
  if (!id || !unit) return;
  const units = (known.get(id, now)?.units ?? []).filter((u) => u.unit !== unit && now - u.at < HOUR);
  units.push({ unit, at: now });
  known.put(id, { at: now, units: units.slice(-WEBHOOK_INBOUND_KNOWN_SENDERS) });
}

/** Forgets every count (tests only). */
export function resetWebhookInboundGate(): void {
  addressFailures.clear();
  idFailures.clear();
  known.clear();
}
