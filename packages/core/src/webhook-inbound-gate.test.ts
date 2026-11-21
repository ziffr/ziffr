import { beforeEach, describe, expect, it } from "vitest";
import { admitWebhookInbound, resetWebhookInboundGate } from "./webhook-inbound-gate";
import { WEBHOOK_INBOUND_GATE_PER_ADDRESS, WEBHOOK_INBOUND_GATE_PER_ID } from "./webhook-limits";

beforeEach(resetWebhookInboundGate);

describe("admitWebhookInbound", () => {
  it("lets one address through up to its limit, then refuses, and another address still passes", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) expect(admitWebhookInbound("A", "1.1.1.1", 0)).toBe(true);
    expect(admitWebhookInbound("a", "1.1.1.1", 1)).toBe(false);
    expect(admitWebhookInbound("a", "2.2.2.2", 1)).toBe(true);
  });
  it("starts a new window after a minute", () => {
    for (let i = 0; i <= WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) admitWebhookInbound("a", "1.1.1.1", 0);
    expect(admitWebhookInbound("a", "1.1.1.1", 60_000)).toBe(true);
  });
  it("caps one id from anywhere, also without a network address, and not another id", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ID; i++) expect(admitWebhookInbound("a", null, 0)).toBe(true);
    expect(admitWebhookInbound("a", null, 1)).toBe(false);
    expect(admitWebhookInbound("b", null, 1)).toBe(true);
  });
  it("holds a bounded number of keys: expired ones are dropped, live ones refuse new keys", () => {
    for (let i = 0; i < 10_000; i++) admitWebhookInbound(`id${i}`, null, 0);
    expect(admitWebhookInbound("fresh", null, 1)).toBe(false);
    expect(admitWebhookInbound("fresh", null, 60_001)).toBe(true);
  });
});
