import { beforeEach, describe, expect, it } from "vitest";
import { admitWebhookInbound as admit, recordWebhookInboundFailure as fail, recordWebhookInboundSender as sender, resetWebhookInboundGate } from "./webhook-inbound-gate";
import { WEBHOOK_INBOUND_FAILURES_PER_ADDRESS as PER_ADDRESS, WEBHOOK_INBOUND_FAILURES_PER_ID as PER_ID, WEBHOOK_INBOUND_KNOWN_SENDERS as KNOWN } from "./webhook-limits";

const A = "6f1c2d3e-0000-4000-8000-000000000001";
const B = "6f1c2d3e-0000-4000-8000-000000000002";
const ip = (i: number) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
beforeEach(resetWebhookInboundGate);

describe("the gate counts failures, not requests", () => {
  it("successful traffic never adds up, however much", () => {
    for (let i = 0; i < PER_ID * 3; i++) expect(admit(A, "1.1.1.1", 0)).toBe(true);
  });
  it("refuses an address after its failures, for that Webhook only, and forgets after a minute", () => {
    for (let i = 0; i < PER_ADDRESS; i++) fail(A.toUpperCase(), "1.1.1.1", 0);
    expect(admit(A, "1.1.1.1", 1)).toBe(false);
    expect(admit(A, "2.2.2.2", 1)).toBe(true);
    expect(admit(B, "1.1.1.1", 1)).toBe(true);
    expect(admit(A, "1.1.1.1", 60_000)).toBe(true);
  });
  it("counts an IPv6 sender by its /56: rotating inside it does not escape, another /56 is separate", () => {
    for (let i = 0; i < PER_ADDRESS; i++) fail(A, `2001:db8:1:a7${(i % 256).toString(16).padStart(2, "0")}::/64`, 0);
    expect(admit(A, "2001:db8:1:a7ff::/64", 1)).toBe(false);
    expect(admit(A, "2001:db8:1:a800::/64", 1)).toBe(true);
    expect(admit(A, "2001:db8:1:5::/64", 1)).toBe(true);
    fail(A, "2001:db8:1:5::/64", 1);
  });
  it("ignores ids that are not UUIDs", () => {
    for (let i = 0; i < PER_ID + 5; i++) fail("junk", null, 0);
    expect(admit("junk", null, 0)).toBe(true);
  });
});

describe("a real sender keeps passing", () => {
  it("(a) during a flood from a single address", () => {
    sender(A, "7.7.7.7", 0);
    for (let i = 0; i < 1000; i++) fail(A, "9.9.9.9", 1);
    expect(admit(A, "9.9.9.9", 2)).toBe(false);
    expect(admit(A, "7.7.7.7", 2)).toBe(true);
  });
  it("(b) during a distributed flood over 10k addresses, which others cannot join but a known sender can", () => {
    sender(A, "7.7.7.7", 0);
    for (let i = 0; i < 10_000; i++) fail(A, ip(i), 1);
    expect(admit(A, "8.8.8.8", 2)).toBe(false);
    expect(admit(A, ip(5), 2)).toBe(false);
    expect(admit(A, "7.7.7.7", 2)).toBe(true);
    expect(admit(B, "8.8.8.8", 2)).toBe(true);
  });
  it("(c) during a flood of made-up Webhook ids filling every table", () => {
    sender(A, "7.7.7.7", 0);
    for (let i = 0; i < 25_000; i++) fail(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ip(i), 1);
    expect(admit(A, "7.7.7.7", 2)).toBe(true);
    expect(admit(A, "6.6.6.6", 2)).toBe(true);
  });
  it("is known for an hour only, and only 16 senders per Webhook are remembered, the oldest dropped", () => {
    sender(A, "7.7.7.7", 0);
    sender(A, "7.7.7.7", 10);
    for (let i = 0; i < PER_ID; i++) fail(A, ip(i), 20);
    expect(admit(A, "7.7.7.7", 30)).toBe(true);
    for (let i = 0; i < KNOWN + 1; i++) sender(A, `5.5.5.${i}`, 40);
    expect(admit(A, "7.7.7.7", 41)).toBe(false);
    expect(admit(A, "5.5.5.0", 41)).toBe(false);
    expect(admit(A, "5.5.5.1", 41)).toBe(true);
    expect(admit(A, "5.5.5.16", 41)).toBe(true);
    sender(A, null, 41);
  });
  it("an address known an hour ago but not since is judged like any other", () => {
    sender(A, "7.7.7.7", 0);
    const late = 3_600_001;
    for (let i = 0; i < PER_ADDRESS; i++) fail(A, "7.7.7.7", late);
    expect(admit(A, "7.7.7.7", late + 1)).toBe(false);
  });
});

describe("without a network address", () => {
  it("the Webhook as a whole is refused past its failure ceiling, and no one is a known sender", () => {
    for (let i = 0; i < PER_ID; i++) fail(A, null, 0);
    expect(admit(A, null, 1)).toBe(false);
    expect(admit(B, null, 1)).toBe(true);
  });
});

describe("cost and bounds", () => {
  it("a full table drops the oldest and never refuses a new key", () => {
    for (let i = 0; i < 12_000; i++) fail(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ip(i), 0);
    expect(admit(A, "fresh", 1)).toBe(true);
    for (let i = 0; i < PER_ADDRESS; i++) fail(A, "fresh", 2);
    expect(admit(A, "fresh", 3)).toBe(false);
  });
  it("a request does a bounded amount of work: expired entries leave once, from the front", () => {
    const t0 = performance.now();
    for (let i = 0; i < 20_000; i++) { fail(A, ip(i), i * 10); admit(A, ip(i), i * 10); }
    expect(performance.now() - t0).toBeLessThan(2_000);
  });
});
