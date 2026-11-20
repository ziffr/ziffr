// The shared outbound request's rules (spec 0034 ticket 1; moved from the Marketplace tests, spec 0030): private
// addresses, DNS rebinding, redirects, slow and over-large answers, and the operator's list of exact hosts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mailHostResolver } from "./mail-hosts";
import { operatorPrivateHosts, outboundRequest, outboundTls, outboundUrlProblem } from "./outbound-request";

const answering = async (addresses: { address: string; family: number }[], f: () => Promise<void>) => {
  const real = mailHostResolver.lookup;
  mailHostResolver.lookup = async () => addresses;
  try { await f(); } finally { mailHostResolver.lookup = real; }
};
const send = (url: string, init: Partial<Parameters<typeof outboundRequest>[1]> = {}) => outboundRequest(new URL(url), { method: "GET", maxBytes: 1000, ...init });

describe("which addresses are refused", () => {
  it("connects to no name that resolves inside the server's network, whatever else it answered", async () => {
    await answering([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }], async () => {
      await expect(send("https://packs.example.com/x")).rejects.toThrow("private address");
    });
  });
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "2002:7f00:1::"])("refuses a name that answers %s", async (address) => {
    await answering([{ address, family: address.includes(":") ? 6 : 4 }], async () => {
      await expect(send("https://hook.example.com/")).rejects.toThrow("private address");
    });
  });
  it.each(["https://127.0.0.1/", "https://[::1]/", "https://169.254.169.254/latest/meta-data", "https://[::ffff:10.0.0.1]/", "https://2130706433/"])("refuses an address written as an IP: %s", async (url) => {
    await expect(send(url)).rejects.toThrow("private address");
  });
  it("refuses http and anything that is not https", async () => {
    await expect(send("http://hook.example.com/")).rejects.toThrow("https only");
    expect(outboundUrlProblem("http://hook.example.com/")).toContain("https");
    expect(outboundUrlProblem("https://u:p@hook.example.com/")).toContain("user");
    expect(outboundUrlProblem("https://localhost/")).toContain("own network");
    expect(outboundUrlProblem("https://intranet/")).toContain("own network");
    expect(outboundUrlProblem("https://hook.example.com/")).toBeNull();
  });
  it("refuses a name that answers public once and private the next time (every request looks up again)", async () => {
    const real = mailHostResolver.lookup;
    let calls = 0;
    mailHostResolver.lookup = async () => (calls++ === 0 ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);
    try {
      await expect(send("https://rebind.example.com/")).rejects.toThrow("private address");
    } finally { mailHostResolver.lookup = real; }
  });
});

describe("headers", () => {
  it("refuses a header Node would throw on, and ones that steer the connection, without leaving a timer behind", async () => {
    await expect(send("https://hook.example.com/", { headers: { "x-a": "a\r\nb: c" } })).rejects.toThrow("bad header");
    await expect(send("https://hook.example.com/", { headers: { "bad name": "x" } })).rejects.toThrow("bad header");
    await expect(send("https://hook.example.com/", { headers: { Host: "127.0.0.1" } })).rejects.toThrow("bad header");
    await expect(send("https://hook.example.com/", { headers: { "Transfer-Encoding": "chunked" } })).rejects.toThrow("bad header");
  });
});

describe("the operator's list of exact hosts", () => {
  it("reads comma-separated exact names, never a pattern, from the environment only", () => {
    expect(operatorPrivateHosts({})).toEqual([]);
    expect(operatorPrivateHosts({ ZIFFR_WEBHOOK_PRIVATE_HOSTS: " N8N.lan, ,10.0.0.5,[::1]. " })).toEqual(["n8n.lan", "10.0.0.5", "::1"]);
  });
  it("lets in exactly the named host and none of its neighbours", async () => {
    const privateHosts = ["n8n.lan"];
    expect(outboundUrlProblem("https://n8n.lan/hook", { privateHosts })).toBeNull();
    expect(outboundUrlProblem("https://N8N.LAN./hook", { privateHosts })).toBeNull();
    for (const other of ["https://n8n/", "https://localhost/", "https://10.0.0.5/"]) {
      expect(outboundUrlProblem(other, { privateHosts })).toContain("own network");
    }
    // A dotted neighbour is judged when it is looked up, below.
    await answering([{ address: "10.0.0.9", family: 4 }], async () => {
      // The named host passes the private-address check (and fails later, as nothing listens there)...
      await expect(send("https://n8n.lan/hook", { privateHosts, deadlineMs: 500 })).rejects.not.toThrow("private address");
      // ...its neighbours do not.
      for (const other of ["https://evil.n8n.lan/", "https://n8n.lan.evil.com/", "https://xn8n.lan/"]) {
        await expect(send(other, { privateHosts })).rejects.toThrow("private address");
      }
    });
  });
  it("lets in an exact IP only when it is named, and keeps http refused", async () => {
    await expect(send("https://10.0.0.6/", { privateHosts: ["10.0.0.5"] })).rejects.toThrow("private address");
    await expect(send("http://n8n.lan/", { privateHosts: ["n8n.lan"] })).rejects.toThrow("https only");
  });
  it("is not something a Workspace or Installation Setting can set: only the process environment is read", () => {
    // The function takes the server's environment and nothing else; no Setting, Workspace row or request feeds it.
    const source = readFileSync(join(__dirname, "outbound-request.ts"), "utf8");
    expect(source).not.toMatch(/settingsInEffect|from "\.\/db"/);
  });
});

// A TLS server of the test's own, reached through the real request: the lookup, the TLS check and the limits.
const openssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();
describe.skipIf(!openssl)("the real request, against a local TLS server", () => {
  let port = 0;
  let close = () => {};
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "ziffr-outbound-"));
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
    outboundTls.ca = cert;
    close = () => server.close();
  });
  afterAll(() => { outboundTls.ca = undefined; close(); });
  const get = (path: string, init: Partial<Parameters<typeof outboundRequest>[1]> = { allowPrivate: true }) => send(`https://localhost:${port}${path}`, init);

  it("connects when the server allows its own network, and says only Ziffr's version", async () => {
    const res = await get("/v1/packs?q=x");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ path: "/v1/packs?q=x", ua: expect.stringMatching(/^Ziffr\/\d+\.\d+\.\d+$/) });
  });
  it("refuses its own network otherwise, cuts an answer too big, and follows no redirect", async () => {
    await expect(get("/v1/packs", {})).rejects.toThrow("private address");
    expect((await get("/big", { allowPrivate: true, maxBytes: 100 })).tooBig).toBe(true);
    expect((await get("/moved")).status).toBe(302);
  });
  it("reaches the loopback server through the operator's exact host, and not when only a neighbour is named", async () => {
    expect((await get("/x", { privateHosts: ["localhost"] })).status).toBe(200);
    await expect(get("/x", { privateHosts: ["localhost.evil.com", "local"] })).rejects.toThrow("private address");
  });
  it("ends an answer that trickles in at its deadline, however steadily the bytes come", async () => {
    const started = Date.now();
    await expect(get("/drip", { allowPrivate: true, maxBytes: 1_000_000, deadlineMs: 600 })).rejects.toThrow("timeout");
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
