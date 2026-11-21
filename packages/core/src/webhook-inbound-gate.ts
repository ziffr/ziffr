// A cheap gate in front of a Webhook's inbound address (GLOSSARY: Webhook; spec 0034, ticket #487). Webhook ids are not
// secret, so anyone can send unsigned requests to /api/webhooks/{id}/in; each would cost a database read and a key
// opening before it is refused. This counts requests per id and per network address in memory, before any of that
// happens, whether signed or not. It keeps no personal data beyond the network address in memory for one minute, and a
// process that restarts or a second instance simply counts on its own: this bounds the cost of a flood, it is not the
// 60-a-minute limit for senders who proved the secret (that stays in the database).
import { WEBHOOK_INBOUND_GATE_PER_ADDRESS, WEBHOOK_INBOUND_GATE_PER_ID } from "./webhook-limits";

const WINDOW_MS = 60_000;
/** Most keys held at once, so a flood of made-up ids or addresses cannot grow memory without bound. */
const MAX_KEYS = 10_000;

type Counter = { start: number; n: number };
const counters = new Map<string, Counter>();

function hit(key: string, max: number, now: number): boolean {
  let c = counters.get(key);
  if (!c || now - c.start >= WINDOW_MS) {
    if (!c && counters.size >= MAX_KEYS) {
      for (const [k, v] of counters) if (now - v.start >= WINDOW_MS) counters.delete(k);
      // Still full of live keys: refuse rather than grow; a flood this wide is the case the gate exists for.
      if (counters.size >= MAX_KEYS) return false;
    }
    c = { start: now, n: 0 };
    counters.set(key, c);
  }
  c.n++;
  return c.n <= max;
}

/** Whether one more request to this Webhook id from this network address (null when unknown) may go on to be judged. */
export function admitWebhookInbound(webhookId: string, network: string | null, now: number = Date.now()): boolean {
  const id = String(webhookId).slice(0, 64).toLowerCase();
  // Both are counted always, so a refused request still counts against the sender who keeps sending.
  const byId = hit(`id:${id}`, WEBHOOK_INBOUND_GATE_PER_ID, now);
  const byAddress = network ? hit(`ip:${id}:${network}`, WEBHOOK_INBOUND_GATE_PER_ADDRESS, now) : true;
  return byId && byAddress;
}

/** Forgets every count (tests only). */
export function resetWebhookInboundGate(): void {
  counters.clear();
}
