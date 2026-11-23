import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addressKey, budgetRefusal } from "./demo-budget";
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
    expect(budgetRefusal({ address: B.perAddressPerWindow, visitMinute: B.perVisitPerMinute, visitWindow: B.perVisitPerWindow, demo: B.demoPerWindow })).toBeNull();
    expect(budgetRefusal({ address: B.perAddressPerWindow + 1 })).toBe(DEMO_BUDGET_USED);
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
    expect(B).toEqual({ perVisitPerMinute: 30, perVisitPerWindow: 300, perAddressPerWindow: 600, demoPerWindow: 3000 });
  });
});
