import { beforeEach, describe, expect, it } from "vitest";
import { admitWebhookInbound, resetWebhookInboundGate } from "./webhook-inbound-gate";
import { WEBHOOK_INBOUND_GATE_PER_ADDRESS, WEBHOOK_INBOUND_GATE_PER_ID } from "./webhook-limits";

const A = "6f1c2d3e-0000-4000-8000-000000000001";
const B = "6f1c2d3e-0000-4000-8000-000000000002";
beforeEach(resetWebhookInboundGate);

describe("admitWebhookInbound", () => {
  it("lets one address through up to its limit, then refuses; another address and another id still pass", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) expect(admitWebhookInbound(A.toUpperCase(), "1.1.1.1", 0)).toBe(true);
    expect(admitWebhookInbound(A, "1.1.1.1", 1)).toBe(false);
    expect(admitWebhookInbound(A, "2.2.2.2", 1)).toBe(true);
    expect(admitWebhookInbound(B, "1.1.1.1", 1)).toBe(true);
  });
  it("starts a new window after a minute", () => {
    for (let i = 0; i <= WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) admitWebhookInbound(A, "1.1.1.1", 0);
    expect(admitWebhookInbound(A, "1.1.1.1", 60_000)).toBe(true);
  });
  it("counts an IPv6 sender by its /56, so rotating addresses inside it does not escape, and another /56 is separate", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) admitWebhookInbound(A, `2001:db8:1:a7${(i % 256).toString(16).padStart(2, "0")}::/64`, 0);
    expect(admitWebhookInbound(A, "2001:db8:1:a7ff::/64", 1)).toBe(false);
    expect(admitWebhookInbound(A, "2001:db8:1:a800::/64", 1)).toBe(true);
    expect(admitWebhookInbound(A, "2001:db8:1:5::/64", 1)).toBe(true);
  });
  it("a distributed flood is capped at the id's ceiling, but a quiet real sender is never counted towards it", () => {
    expect(admitWebhookInbound(A, "7.7.7.7", 0)).toBe(true);
    let refused = 0;
    for (let i = 0; i < 100; i++) for (let j = 0; j < 20; j++) if (!admitWebhookInbound(A, `10.0.0.${i}`, 0)) refused++;
    // 100 addresses x 20 quiet requests count nothing towards the id.
    expect(refused).toBe(0);
    for (let i = 0; i < 100; i++) for (let j = 0; j < 10; j++) admitWebhookInbound(A, `10.0.0.${i}`, 0);
    // Noisy requests (21st to 30th of each address) now hold the id at its ceiling, and a new noisy address is refused...
    for (let j = 0; j < 30; j++) admitWebhookInbound(A, "9.9.9.9", 0);
    expect(admitWebhookInbound(A, "9.9.9.9", 0)).toBe(false);
    // ...while the real sender, still under 20 a minute, passes.
    expect(admitWebhookInbound(A, "7.7.7.7", 1)).toBe(true);
    expect(WEBHOOK_INBOUND_GATE_PER_ID).toBe(600);
  });
  it("without an address caps the id as a whole, and not another id", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ID; i++) expect(admitWebhookInbound(A, null, 0)).toBe(true);
    expect(admitWebhookInbound(A, null, 1)).toBe(false);
    expect(admitWebhookInbound(B, null, 1)).toBe(true);
  });
  it("does not count ids that are not UUIDs", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ID + 5; i++) expect(admitWebhookInbound("junk", null, 0)).toBe(true);
  });
  it("a full table of addresses refuses new addresses but keeps counting the ones it has, and frees expired ones", () => {
    for (let i = 0; i < 10_000; i++) admitWebhookInbound(A, `a${i}`, 0);
    expect(admitWebhookInbound(A, "fresh", 1)).toBe(false);
    expect(admitWebhookInbound(A, "a5", 1)).toBe(true);
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) admitWebhookInbound(A, "a6", 2);
    expect(admitWebhookInbound(A, "a6", 3)).toBe(false);
    expect(admitWebhookInbound(A, "fresh", 60_001)).toBe(true);
  });
  it("a full table of ids evicts the oldest instead of refusing", () => {
    for (let i = 0; i < 10_000; i++) admitWebhookInbound(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, null, 0);
    expect(admitWebhookInbound(A, null, 1)).toBe(true);
  });
});
