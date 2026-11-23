// @ts-nocheck
// A TLS server of a test's own that stands in for a Webhook's receiver (GLOSSARY: Webhook): it records what it is sent and
// answers as the test says. The outbound request trusts its certificate for the test's length only.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outboundTls } from "../outbound-request";

/** Whether openssl is there to make the certificate; a test skips without it. */
export const hasOpenssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();

/** One request the receiver got. */
export type Received = { path: string; headers: IncomingMessage["headers"]; body: string };

/** Starts the receiver on localhost and returns its port, what it saw, and how to stop it. */
export async function startReceiver(): Promise<{ port: number; seen: Received[]; stop: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "ziffr-receiver-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "cert.pem"), "utf8");
  const seen: Received[] = [];
  const reply = (_q: IncomingMessage, res: ServerResponse) => { res.statusCode = 200; res.end("ok"); };
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => { seen.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") }); reply(req, res); });
  });
  await new Promise<void>((r) => server.listen(0, "localhost", () => r()));
  outboundTls.ca = cert;
  return { port: (server.address() as AddressInfo).port, seen, stop: () => { outboundTls.ca = undefined; server.close(); } };
}
