import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addressKey, budgetRefusal, networkKey, networkOf } from "./demo-budget";
import { DEMO_BUDGET_USED, DEMO_BUSY, DEMO_GOING_FAST } from "./demo-words";
import { DEMO_WRITE_BUDGET as B } from "./demo-limits";

const secret = "s".repeat(32);

describe("addressKey", () => {
  it("is a keyed hash: 32 hex characters, stable for one secret, different for another", () => {
    const k = addressKey("203.0.113.7", secret);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(addressKey("203.0.113.7", secret)).toBe(k);
    expect(addressKey("203.0.113.7", "t".repeat(32))).not.toBe(k);
    expect(addressKey("203.0.113.8", secret)).not.toBe(k);
  });

  it("is not the bare SHA-256 of the address, which anyone could compute for the whole IPv4 space", () => {
    const bare = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
    const k = addressKey("203.0.113.7", secret);
    for (const guess of ["203.0.113.7", "ziffr-demo-address:203.0.113.7", "ziffr-demo-visit:203.0.113.7"]) expect(k).not.toBe(bare(guess));
  });

  it("is null without an address or without a usable secret, so the budget refuses", () => {
    expect(addressKey(null, secret)).toBeNull();
    expect(addressKey("", secret)).toBeNull();
    expect(addressKey("203.0.113.7", undefined)).toBeNull();
    expect(addressKey("203.0.113.7", "")).toBeNull();
    expect(addressKey("203.0.113.7", "short")).toBeNull();
  });
});

describe("budgetRefusal", () => {
  it("lets counts at the number pass and refuses one more, with each budget's words", () => {
    expect(budgetRefusal({ address: B.perAddressPerWindow, network: B.perNetworkPerWindow, visitMinute: B.perVisitPerMinute, visitWindow: B.perVisitPerWindow, demo: B.demoPerWindow })).toBeNull();
    expect(budgetRefusal({ address: B.perAddressPerWindow + 1 })).toBe(DEMO_BUDGET_USED);
    expect(budgetRefusal({ network: B.perNetworkPerWindow + 1 })).toBe(DEMO_BUDGET_USED);
    expect(budgetRefusal({ visitMinute: B.perVisitPerMinute + 1 })).toBe(DEMO_GOING_FAST);
    expect(budgetRefusal({ visitWindow: B.perVisitPerWindow + 1 })).toBe(DEMO_BUDGET_USED);
    expect(budgetRefusal({ demo: B.demoPerWindow + 1 })).toBe(DEMO_BUSY);
  });

  it("asks the address before the visit and the visit before the demo", () => {
    expect(budgetRefusal({ address: B.perAddressPerWindow + 1, visitMinute: B.perVisitPerMinute + 1, demo: B.demoPerWindow + 1 })).toBe(DEMO_BUDGET_USED);
    expect(budgetRefusal({ visitMinute: B.perVisitPerMinute + 1, demo: B.demoPerWindow + 1 })).toBe(DEMO_GOING_FAST);
  });

  it("says nothing for counts not yet known", () => {
    expect(budgetRefusal({})).toBeNull();
  });

  it("uses the spec's numbers", () => {
    expect(B).toEqual({ perVisitPerMinute: 30, perVisitPerWindow: 200, perAddressPerWindow: 200, perNetworkPerWindow: 400, demoPerWindow: 3000 });
  });

  it("lets no one address or network use up the demo alone: it takes at least eight networks", () => {
    expect(B.perAddressPerWindow).toBeLessThan(B.perNetworkPerWindow);
    expect(Math.ceil(B.demoPerWindow / B.perNetworkPerWindow)).toBeGreaterThanOrEqual(8);
  });
});

describe("networks", () => {
  it("are an IPv4 /24 or an IPv6 /48, and nothing else", () => {
    expect(networkOf("203.0.113.7")).toBe("203.0.113.0/24");
    expect(networkOf("203.0.113.200")).toBe("203.0.113.0/24");
    expect(networkOf("2001:db8:abcd:12::/64")).toBe("2001:db8:abcd::/48");
    expect(networkOf("2001:DB8:abcd:99::/64")).toBe("2001:db8:abcd::/48");
    for (const bad of [null, "", "nonsense", "1.2.3", "2001:db8::1"]) expect(networkOf(bad)).toBeNull();
  });

  it("are counted under a keyed hash of their own, apart from the address's", () => {
    const a = networkKey("203.0.113.7", secret);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(networkKey("203.0.113.99", secret)).toBe(a);
    expect(networkKey("203.0.114.7", secret)).not.toBe(a);
    expect(a).not.toBe(addressKey("203.0.113.7", secret));
    expect(networkKey("203.0.113.7", undefined)).toBeNull();
  });
});
