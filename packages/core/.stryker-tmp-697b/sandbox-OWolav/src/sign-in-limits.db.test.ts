// @ts-nocheck
// Ziffr's own limits on sign-in links (spec 0009, ticket #129), against the real database.
import { randomUUID, createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { claimSignInLink, inboxOf, LINKS_PER_ADDRESS, LINKS_PER_NETWORK, LINKS_PER_PLACE, networkAddress } from "./sign-in-limits";

const made: string[] = [];
const hash = (kind: string, value: string) => createHash("sha256").update(`ziffr-sign-in:${kind}:${value}`).digest("hex");
afterEach(async () => {
  for (const key of made.splice(0)) {
    await db().from("sign_in_requests").delete().eq("address_key", key);
    await db().from("sign_in_requests").delete().eq("network_key", key);
  }
});
const address = () => { const a = `limit-${randomUUID()}@example.test`; made.push(hash("address", inboxOf(a))); return a; };
const network = () => { const n = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`; made.push(hash("network", n)); return n; };

describe("sign-in link limits", () => {
  it("allow a few links per address from one place, counting requests at the same moment one by one", async () => {
    const a = address(); const n = network();
    const answers = await Promise.all(Array.from({ length: LINKS_PER_PLACE + 2 }, () => claimSignInLink(a, n)));
    expect(answers.filter(Boolean)).toHaveLength(LINKS_PER_PLACE);
    // The same inbox written another way is the same address.
    const [local, domain] = a.split("@");
    expect(await claimSignInLink(`${local.toUpperCase()}+other@${domain}`, n)).toBe(false);
    // From somewhere else the person can still ask: one place cannot lock them out.
    expect(await claimSignInLink(a, network())).toBe(true);
  });

  it("cap an address from anywhere, and one network address across many addresses", async () => {
    const a = address();
    let granted = 0;
    for (let i = 0; i < LINKS_PER_ADDRESS + 3; i++) if (await claimSignInLink(a, network())) granted++;
    expect(granted).toBe(LINKS_PER_ADDRESS);
    const n = network();
    for (let i = 0; i < LINKS_PER_NETWORK; i++) expect(await claimSignInLink(address(), n)).toBe(true);
    expect(await claimSignInLink(address(), n)).toBe(false);
  });

  it("without a network address, hold only the address's higher ceiling, so nobody is locked out by a few requests", async () => {
    const a = address();
    let granted = 0;
    for (let i = 0; i < LINKS_PER_PLACE + 3; i++) if (await claimSignInLink(a, null)) granted++;
    expect(granted).toBe(LINKS_PER_PLACE + 3);
  });

  it("keep only hashes, and nothing older than a day", async () => {
    const a = address(); const n = network();
    await claimSignInLink(a, n);
    const key = hash("address", inboxOf(a));
    const { data } = await db().from("sign_in_requests").select("*").eq("address_key", key);
    expect(data).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(a);
    expect(JSON.stringify(data)).not.toContain(n);
    await db().from("sign_in_requests").update({ at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq("address_key", key);
    await claimSignInLink(address(), null);
    expect((await db().from("sign_in_requests").select("id").eq("address_key", key)).data).toEqual([]);
  });

  it("count one inbox however it is written", () => {
    expect(inboxOf(" Ann+Ziffr@Example.TEST ")).toBe("ann@example.test");
    expect(inboxOf("a.n.n+x@googlemail.com")).toBe("ann@gmail.com");
    expect(inboxOf("a.nn@example.test")).toBe("a.nn@example.test");
  });

  it("trust only the proxy's own entry, and count IPv6 by its /64", () => {
    const h = (xff: string) => ({ get: (k: string) => (k === "x-forwarded-for" ? xff : null) });
    // Without ZIFFR_PROXY_HOPS nothing is trusted: a client can write X-Forwarded-For itself.
    expect(networkAddress(h("203.0.113.7"), {})).toBeNull();
    // One proxy: its entry is the last; what the client put before it does not count.
    expect(networkAddress(h("6.6.6.6, 203.0.113.7"), { ZIFFR_PROXY_HOPS: "1" })).toBe("203.0.113.7");
    expect(networkAddress(h("203.0.113.7, 10.0.0.2"), { ZIFFR_PROXY_HOPS: "2" })).toBe("203.0.113.7");
    expect(networkAddress(h("10.0.0.2"), { ZIFFR_PROXY_HOPS: "2" })).toBeNull();
    expect(networkAddress(h("2001:db8:1:2:3:4:5:6"), { ZIFFR_PROXY_HOPS: "1" })).toBe("2001:db8:1:2::/64");
    expect(networkAddress(h("2001:db8::1"), { ZIFFR_PROXY_HOPS: "1" })).toBe("2001:db8:0:0::/64");
    expect(networkAddress(h("not an address"), { ZIFFR_PROXY_HOPS: "1" })).toBeNull();
  });
});
