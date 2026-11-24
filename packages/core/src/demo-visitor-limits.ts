// What a visitor of the demo may store (GLOSSARY: Demo Mode, Version; spec 0051, Limits: growth; ticket 9). Sizes are
// checked before the write that holds them, and what one visit writes in a reset window is counted under keys derived from
// the visit's own (`demo_visit_counts`, kind "visit": the key is a hash of a purpose and the visit's hash, so it is
// another count and needs no new kind). Nothing here acts outside a demo visit. The visit's id is free to mint, so these
// counts only hold back a person; against a script the address, network and demo budgets of `checkDemoBudget` hold.
import { createHash } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { DEMO_STORE_MAX } from "./demo-limits";
import { bumpDemoVisitCount, resetWindowStart } from "./demo-visit";
import { visitHeaders } from "./demo-visit-scope";
import { inDemoVisit } from "./demo-visitor-words";
import { DEMO_BUDGET_USED, DEMO_BUSY } from "./demo-words";

/** A visitor's change refused because what it stores is too large or too much. A Forbidden, so its words are shown. */
export class DemoSizeRefused extends Forbidden {
  constructor(words: string) {
    super(words);
    this.name = "DemoSizeRefused";
  }
}

/** The size in bytes of a value as stored (JSON); refused with `words` past `max` in a demo visit. Unchanged elsewhere (0). */
export function visitorSize(actor: Pick<Actor, "workspaceId">, value: unknown, max: number, words: string): number {
  if (!inDemoVisit(actor)) return 0;
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  if (bytes > max) throw new DemoSizeRefused(words);
  return bytes;
}

/** Counts `by` of a purpose against the visit's cap for the window and refuses in the demo's words when it is over. Fails
 * closed without a visit's key. Only in a demo visit. */
export async function chargeVisitor(actor: Pick<Actor, "workspaceId">, purpose: "bytes" | "named" | "snapshots", by: number, cap: number, words: string = DEMO_BUDGET_USED): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const own = visitHeaders()?.["x-ziffr-demo-visit-key"];
  if (!own || !/^[0-9a-f]{32}$/.test(own)) throw new DemoSizeRefused(DEMO_BUSY);
  const key = createHash("sha256").update(`ziffr-demo-${purpose}:${own}`).digest("hex").slice(0, 32);
  const n = await bumpDemoVisitCount(actor, "visit", key, resetWindowStart(new Date()), Math.min(1000, Math.max(1, Math.ceil(by))));
  if (n > cap) throw new DemoSizeRefused(words);
}

/** Charges the kilobytes a visitor writes (a widget's settings, a template) against the visit's window. */
export function chargeVisitorBytes(actor: Pick<Actor, "workspaceId">, bytes: number): Promise<void> {
  return chargeVisitor(actor, "bytes", bytes / 1024, DEMO_STORE_MAX.visitKbPerWindow);
}
