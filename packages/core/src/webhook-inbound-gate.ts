// A cheap gate in front of a Webhook's inbound address (GLOSSARY: Webhook; spec 0034, ticket #487). Webhook ids are not
// secret, so anyone can send unsigned requests to /api/webhooks/{id}/in; each would cost a database read and a key
// opening before it is refused. This counts requests per id and per network address in memory, before any of that
// happens, whether signed or not. It keeps no personal data beyond the network address in memory for one minute, and a
// process that restarts or a second instance simply counts on its own: this bounds the cost of a flood, it is not the
// 60-a-minute limit for senders who proved the secret (that stays in the database).
import { WEBHOOK_INBOUND_GATE_PER_ADDRESS, WEBHOOK_INBOUND_GATE_PER_ID } from "./webhook-limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WINDOW_MS = 60_000;
/** Most keys held at once, so a flood of made-up ids or addresses cannot grow memory without bound. */
const MAX_KEYS = 10_000;

type Counter = { start: number; n: number };
const counters = new Map<string, Counter>();

function hit(key: string, max: number, now: number): boolean {
  let c = counters.get(key);
  if (!c || now - c.start >= WINDOW_MS) {
    // Full: drop the oldest key (insertion order) rather than refuse, so a flood of made-up keys can never lock out
    // everyone else; it only forgets the count of whoever was counted first.
    if (!c && counters.size >= MAX_KEYS) counters.delete(counters.keys().next().value as string);
    c = { start: now, n: 0 };
    counters.delete(key);
    counters.set(key, c);
  }
  c.n++;
  return c.n <= max;
}

/** Whether one more request to this Webhook id from this network address (null when unknown) may go on to be judged. With
 * an address, only that address is counted: a sender that does not prove the secret can then only use up its own share,
 * never lock out the real sender of the Webhook. Without one (ZIFFR_PROXY_HOPS unset) there is nobody to tell apart, so
 * the id as a whole has a ceiling well above what a real sender makes, and a flood can lock the sender out until it stops. */
export function admitWebhookInbound(webhookId: string, network: string | null, now: number = Date.now()): boolean {
  // Only well-formed ids are counted, so made-up strings cannot fill the table; the route answers the rest 404 itself.
  const id = String(webhookId).toLowerCase();
  if (!UUID.test(id)) return true;
  return network ? hit(`ip:${id}:${network}`, WEBHOOK_INBOUND_GATE_PER_ADDRESS, now) : hit(`id:${id}`, WEBHOOK_INBOUND_GATE_PER_ID, now);
}

/** Forgets every count (tests only). */
export function resetWebhookInboundGate(): void {
  counters.clear();
}
