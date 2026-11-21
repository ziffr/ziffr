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
  it("with an address known, one sender never uses up the id's budget for another", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ID * 2; i++) admitWebhookInbound(A, `10.0.${i % 250}.1`, 0);
    expect(admitWebhookInbound(A, "3.3.3.3", 1)).toBe(true);
  });
  it("without an address caps the id as a whole, and not another id", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ID; i++) expect(admitWebhookInbound(A, null, 0)).toBe(true);
    expect(admitWebhookInbound(A, null, 1)).toBe(false);
    expect(admitWebhookInbound(B, null, 1)).toBe(true);
  });
  it("does not count ids that are not UUIDs", () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ID + 5; i++) expect(admitWebhookInbound("junk", null, 0)).toBe(true);
  });
  it("holds a bounded number of keys and never refuses a new sender because the table is full", () => {
    for (let i = 0; i < 10_000; i++) admitWebhookInbound(A, `a${i}`, 0);
    expect(admitWebhookInbound(A, "fresh", 1)).toBe(true);
    for (let i = 0; i <= WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) admitWebhookInbound(B, "fresh", 1);
    expect(admitWebhookInbound(B, "fresh", 2)).toBe(false);
  });
});
