// The Marketplace connection's rules (spec 0030, #278): off unless turned on, an https address outside the server's
// network, and the trusted keys by their part (spec 0059; the signatures themselves: packages/pack marketplace.test.ts).
import { describe, expect, it } from "vitest";
import { marketplaceConfig, marketplaceKeyProblem, marketplaceUrlProblem, MARKETPLACE_DEFAULT_URL, MARKETPLACE_PUBLIC_KEYS, trustedKeys } from "./marketplace";
import { testKeys } from "./test/marketplace-keys";

describe("the connection's settings", () => {
  it("is off unless turned on", () => {
    expect(marketplaceConfig({}).on).toBe(false);
    expect(marketplaceConfig({ ZIFFR_MARKETPLACE: "off" }).on).toBe(false);
    expect(marketplaceConfig({ ZIFFR_MARKETPLACE: "on" }).url?.href).toBe(`${MARKETPLACE_DEFAULT_URL}/`);
    expect(marketplaceConfig({ ZIFFR_MARKETPLACE: "on", ZIFFR_MARKETPLACE_URL: "https://packs.example.com/market" }).url?.href).toBe("https://packs.example.com/market/");
  });

  it.each([
    ["http://packs.example.com", "starts with https"],
    ["https://user:pw@packs.example.com", "no user"],
    ["https://packs.example.com/?x=1", "no user"],
    ["https://localhost", "inside this server's own network"],
    ["https://10.0.0.5", "inside this server's own network"],
    ["https://[::1]", "inside this server's own network"],
    ["https://169.254.169.254", "inside this server's own network"],
    ["https://intranet", "inside this server's own network"],
    ["not an address", "not an address"],
  ])("refuses %s", (url, message) => {
    expect(marketplaceUrlProblem(url, {})).toContain(message);
    expect(marketplaceConfig({ ZIFFR_MARKETPLACE: "on", ZIFFR_MARKETPLACE_URL: url }).url).toBeNull();
  });

  it("takes an address inside the network only when the server allows it", () => {
    expect(marketplaceUrlProblem("https://localhost:8443", { ZIFFR_ALLOW_PRIVATE_MARKETPLACE: "1" })).toBeNull();
  });
});

describe("trusted keys", () => {
  it("ships none yet, so nothing is trusted unless the server names a key", () => {
    expect(MARKETPLACE_PUBLIC_KEYS).toEqual([]);
    expect(trustedKeys({})).toEqual({ signing: [], reserve: [] });
  });
  it("reads the server's keys by their part, a key alone being a signing key", () => {
    expect(trustedKeys({ ZIFFR_MARKETPLACE_PUBLIC_KEY: " aaa , signing:bbb, reserve:ccc ,," })).toEqual({ signing: ["aaa", "bbb"], reserve: ["ccc"] });
    // An unknown part is not a part: the whole entry is a key that no signature holds for.
    expect(trustedKeys({ ZIFFR_MARKETPLACE_PUBLIC_KEY: "root:ddd" })).toEqual({ signing: ["root:ddd"], reserve: [] });
  });
});

describe("a key in both parts", () => {
  const [one, other] = [testKeys().publicKey, testKeys().publicKey];
  it("is said at start, and keys of their own are not", () => {
    expect(marketplaceKeyProblem({ ZIFFR_MARKETPLACE_PUBLIC_KEY: `signing:${one},reserve:${one}` })).toContain("both signing and reserve");
    expect(marketplaceKeyProblem({ ZIFFR_MARKETPLACE_PUBLIC_KEY: `${one},reserve:${one}` })).toContain("both signing and reserve");
    expect(marketplaceKeyProblem({ ZIFFR_MARKETPLACE_PUBLIC_KEY: `signing:${one},reserve:${other}` })).toBeNull();
    expect(marketplaceKeyProblem({ ZIFFR_MARKETPLACE_PUBLIC_KEY: "signing:nonsense,reserve:nonsense" })).toBeNull();
    expect(marketplaceKeyProblem({})).toBeNull();
  });
});

describe("the request itself", () => {
  // The transport's own tests (private names, redirects, size, slow answers) live with the shared module: outbound-request.test.ts.
  it("refuses a private answer unless the server allows its own network", async () => {
    const { marketplaceTransport } = await import("./marketplace");
    await expect(marketplaceTransport.request(new URL("https://127.0.0.1/v1/packs"), { method: "GET", maxBytes: 1000, env: {} })).rejects.toThrow("private address");
  });
});
