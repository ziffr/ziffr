// A cheap gate in front of a Webhook's inbound address (GLOSSARY: Webhook; spec 0034, ticket #487). Webhook ids are not
// secret, so anyone can send unsigned requests to /api/webhooks/{id}/in; each would cost a database read and a key
// opening before it is refused. This counts requests per id and per network address in memory, before any of that
// happens, whether signed or not. It keeps no personal data beyond the network address in memory for one minute, and a
// process that restarts or a second instance simply counts on its own: this bounds the cost of a flood, it is not the
// 60-a-minute limit for senders who proved the secret (that stays in the database).
import { WEBHOOK_INBOUND_GATE_PER_ADDRESS, WEBHOOK_INBOUND_GATE_PER_ID } from "./webhook-limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WINDOW_MS = 60_000;
/** Most address buckets and most id buckets held at once, so made-up keys cannot grow memory without bound. */
const MAX_KEYS = 10_000;
/** Requests a minute from one address (or IPv6 /56) that are normal for a sender; only what passes this counts towards the id's ceiling. */
const QUIET_PER_ADDRESS = 20;

type Counter = { start: number; n: number };
const byAddress = new Map<string, Counter>();
const byId = new Map<string, Counter>();

/** The bucket for a key in its window, or null when it is new and the table is full of live ones. `evict`: drop the oldest instead of refusing. */
function bucket(map: Map<string, Counter>, key: string, now: number, evict: boolean): Counter | null {
  const c = map.get(key);
  if (c && now - c.start < WINDOW_MS) return c;
  if (!c && map.size >= MAX_KEYS) {
    for (const [k, v] of map) if (now - v.start >= WINDOW_MS) map.delete(k);
    if (map.size >= MAX_KEYS) {
      if (!evict) return null;
      map.delete(map.keys().next().value as string);
    }
  }
  const fresh = { start: now, n: 0 };
  map.delete(key);
  map.set(key, fresh);
  return fresh;
}

/** The unit an address is counted by: an IPv4 address as it is, an IPv6 /64 (as networkAddress gives it) widened to its /56,
 * which is what one allocation usually is, so rotating addresses inside it does not help. */
function unitOf(network: string): string {
  const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4})::\/64$/.exec(network);
  return m ? `${m[1]}:${m[2]}:${m[3]}:${m[4].padStart(4, "0").slice(0, 2)}::/56` : network;
}

/** Whether one more request to this Webhook id from this network address (null when unknown) may go on to be judged.
 * Each address (IPv6: /56) has its own bucket, so one that does not prove the secret only uses up its own share. Only an
 * address past a normal sender's volume adds to the id's ceiling, so a flood from many addresses still cannot cost more
 * than that ceiling, while a quiet real sender is never counted towards it. A full table of addresses refuses new ones
 * rather than forgetting those already counted. Without an address (ZIFFR_PROXY_HOPS unset) every request counts towards
 * the id's ceiling, and a flood can lock the real sender out until it stops. */
export function admitWebhookInbound(webhookId: string, network: string | null, now: number = Date.now()): boolean {
  // Only well-formed ids are counted, so made-up strings cannot fill the tables; the core answers the rest 404 itself.
  const id = String(webhookId).toLowerCase();
  if (!UUID.test(id)) return true;
  let noisy = true;
  if (network) {
    const a = bucket(byAddress, `${id}:${unitOf(String(network).slice(0, 64).toLowerCase())}`, now, false);
    if (!a) return false;
    a.n++;
    if (a.n > WEBHOOK_INBOUND_GATE_PER_ADDRESS) return false;
    noisy = a.n > QUIET_PER_ADDRESS;
  }
  if (!noisy) return true;
  // Only noisy traffic creates these, so evicting the oldest costs a flooder far more than it costs a sender.
  const i = bucket(byId, id, now, true)!;
  i.n++;
  return i.n <= WEBHOOK_INBOUND_GATE_PER_ID;
}

/** Forgets every count (tests only). */
export function resetWebhookInboundGate(): void {
  byAddress.clear();
  byId.clear();
}
