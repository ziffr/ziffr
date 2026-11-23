// @ts-nocheck
// The Marketplace connection's rules (spec 0030, #278): off unless turned on, an https address outside the server's
// network, and Ed25519 signatures of a trusted key over the file's exact bytes.
import { describe, expect, it } from "vitest";
import { marketplaceConfig, marketplaceUrlProblem, MARKETPLACE_DEFAULT_URL, signedByMarketplace } from "./marketplace";
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

describe("signatures", () => {
  const keys = testKeys();
  const env = { ZIFFR_MARKETPLACE_PUBLIC_KEY: keys.publicKey };
  const file = '{"format":"ziffr.pack/1"}';

  it("holds for the exact file signed by a trusted key", () => {
    expect(signedByMarketplace(file, keys.sign(file), env)).toBe(true);
  });
  it("fails for a changed byte, another key, no key, or no signature", () => {
    expect(signedByMarketplace(`${file} `, keys.sign(file), env)).toBe(false);
    expect(signedByMarketplace(file, testKeys().sign(file), env)).toBe(false);
    expect(signedByMarketplace(file, keys.sign(file), {})).toBe(false);
    expect(signedByMarketplace(file, "", env)).toBe(false);
    expect(signedByMarketplace(file, "x".repeat(86) + "==", env)).toBe(false);
  });
});

describe("the request itself", () => {
  // The transport's own tests (private names, redirects, size, slow answers) live with the shared module: outbound-request.test.ts.
  it("refuses a private answer unless the server allows its own network", async () => {
    const { marketplaceTransport } = await import("./marketplace");
    await expect(marketplaceTransport.request(new URL("https://127.0.0.1/v1/packs"), { method: "GET", maxBytes: 1000, env: {} })).rejects.toThrow("private address");
  });
});
