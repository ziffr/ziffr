// The Marketplace connection's rules (spec 0030, #278): off unless turned on, an https address outside the server's
// network, and Ed25519 signatures of a trusted key over the file's exact bytes.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { marketplaceConfig, marketplaceTls, marketplaceTransport, marketplaceUrlProblem, MARKETPLACE_DEFAULT_URL, signedByMarketplace } from "./marketplace";
import { mailHostResolver } from "./mail-hosts";
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
  it("connects to no name that resolves inside the server's network, whatever the address said", async () => {
    const real = mailHostResolver.lookup;
    mailHostResolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }];
    try {
      await expect(marketplaceTransport.request(new URL("https://packs.example.com/v1/packs"), { method: "GET", maxBytes: 1000, env: {} })).rejects.toThrow("private address");
    } finally {
      mailHostResolver.lookup = real;
    }
  });
});

// A TLS server of the test's own, reached through the real transport: the lookup, the TLS check and the limits.
const openssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();
describe.skipIf(!openssl)("the real request, against a local Marketplace", () => {
  let port = 0;
  let close = () => {};
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "ziffr-market-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
    const cert = readFileSync(join(dir, "cert.pem"), "utf8");
    const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
      if (req.url === "/big") { res.end("x".repeat(5000)); return; }
      if (req.url === "/drip") {
        // One byte every 100 ms: never idle long enough for an idle timeout, never done.
        res.writeHead(200);
        const t = setInterval(() => res.write("x"), 100);
        res.on("close", () => clearInterval(t));
        return;
      }
      if (req.url === "/moved") { res.writeHead(302, { location: "https://localhost/elsewhere" }); res.end(); return; }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ path: req.url, ua: req.headers["user-agent"] }));
    });
    await new Promise<void>((r) => server.listen(0, "localhost", () => r()));
    port = (server.address() as AddressInfo).port;
    marketplaceTls.ca = cert;
    close = () => server.close();
  });
  afterAll(() => { marketplaceTls.ca = undefined; close(); });
  const get = (path: string, env: Record<string, string> = { ZIFFR_ALLOW_PRIVATE_MARKETPLACE: "1" }, maxBytes = 1000, deadlineMs?: number) =>
    marketplaceTransport.request(new URL(`https://localhost:${port}${path}`), { method: "GET", maxBytes, env, deadlineMs });

  it("connects when the server allows its own network, and says only Ziffr's version", async () => {
    const res = await get("/v1/packs?q=x");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ path: "/v1/packs?q=x", ua: expect.stringMatching(/^Ziffr\/\d+\.\d+\.\d+$/) });
  });
  it("refuses its own network otherwise, cuts an answer too big, and follows no redirect", async () => {
    await expect(get("/v1/packs", {})).rejects.toThrow("private address");
    expect((await get("/big", undefined, 100)).tooBig).toBe(true);
    expect((await get("/moved")).status).toBe(302);
  });
  it("ends an answer that trickles in at its deadline, however steadily the bytes come", async () => {
    const started = Date.now();
    await expect(get("/drip", undefined, 1_000_000, 600)).rejects.toThrow("timeout");
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
