// The one way Ziffr sends a request to an address that people or settings name (Marketplace, spec 0030; Webhooks,
// spec 0034; GLOSSARY: Marketplace, Webhook). Judged and pinned here so every caller gets the same SSRF rules: https
// only, the name looked up once, every address it has must be public (IPv6 forms that carry IPv4 included), the
// connection goes only to an address that was checked (DNS rebinding reaches nothing new), TLS checks the name, no
// redirect is followed, the answer is cut at a size, and the whole request ends at a deadline however slowly it trickles.
import { validateHeaderName, validateHeaderValue, type ClientRequest } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import { ZIFFR_VERSION } from "./ziffr-version";
import { mailHostResolver, privateAddress, privateMailHost } from "./mail-hosts";

/** What one request gives back: its status and its body, cut at the limit given. */
export type OutboundAnswer = { status: number; body: string; tooBig: boolean };

/** The longest a whole request may take, in milliseconds; a caller may only ask for less. */
export const OUTBOUND_TIMEOUT_MS = 10_000;

/** Certificates to trust besides the system's, for a test's own TLS server; never set by the app. */
export const outboundTls: { ca?: string } = {};

/** A host in one spelling: trimmed, lower case, without brackets or a trailing dot. */
const normal = (h: string) => h.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");

/** The hosts the operator lets reach their own network: exact names from ZIFFR_WEBHOOK_PRIVATE_HOSTS (comma-separated,
 * never ranges, no wildcards). Read from the server's environment only, never from Installation Settings or anything a
 * Workspace can write, so a Workspace Admin cannot widen it. */
export function operatorPrivateHosts(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ZIFFR_WEBHOOK_PRIVATE_HOSTS ?? "").split(",").map(normal).filter(Boolean);
}

/** Whether a host is exactly one the operator named (case-insensitive; a neighbour such as a subdomain or a longer name never matches). */
const named = (host: string, hosts: readonly string[]) => hosts.includes(normal(host));

/** What is wrong with an address to send to, in words for people, or null: https only, no user or password, and not
 * inside the server's own network unless `allowPrivate` or the host is exactly one in `privateHosts`. A name is judged
 * again at the lookup of every request; this is the early answer for a form. */
export function outboundUrlProblem(raw: string, opts: { allowPrivate?: boolean; privateHosts?: readonly string[] } = {}): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return "That is not an address."; }
  if (url.protocol !== "https:") return "The address has to start with https://.";
  if (url.username || url.password) return "The address cannot hold a user or password.";
  if (!opts.allowPrivate && !named(url.hostname, opts.privateHosts ?? []) && privateMailHost(url.hostname)) return "That address is inside this server's own network.";
  return null;
}

/** Headers that decide where a request goes or how it is framed; only Ziffr sets them. */
const FORBIDDEN_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection", "upgrade", "te", "trailer", "expect", "proxy-authorization"]);

/** What a request takes besides its address. */
export type OutboundInit = {
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  maxBytes: number;
  deadlineMs?: number;
  /** Lets every address through (a server's own switch, as the Marketplace has); never set from a Workspace. */
  allowPrivate?: boolean;
  /** Exact hosts allowed to resolve to any address, private ones included (see operatorPrivateHosts); the operator lists only names their own DNS answers. */
  privateHosts?: readonly string[];
};

/** One https request to an address the core checked: see the header. An IP written in the address is not looked up
 * but is checked as every address of a name is. */
export function outboundRequest(url: URL, init: OutboundInit): Promise<OutboundAnswer> {
  if (url.protocol !== "https:") return Promise.reject(new Error("https only"));
  const allowPrivate = init.allowPrivate === true || named(url.hostname, init.privateHosts ?? []);
  // Headers a caller may add: valid ones only (Node throws on the rest), and none that steer the connection or the framing.
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(init.headers ?? {})) {
    try { validateHeaderName(name); validateHeaderValue(name, value); } catch { return Promise.reject(new Error("bad header")); }
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) return Promise.reject(new Error("bad header"));
    headers[name] = value;
  }
  // Node never looks an IP address up, so it is judged here.
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate && isIP(literal) && privateAddress(literal)) return Promise.reject(new Error("private address"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (f: () => void) => { if (!settled) { settled = true; clearTimeout(deadline); f(); } };
    // The whole request, not only a pause between bytes (Node's `timeout` below): an answer that trickles in ends here.
    const live: { req?: ClientRequest } = {};
    const deadline = setTimeout(() => { live.req?.destroy(); done(() => reject(new Error("timeout"))); }, Math.min(init.deadlineMs ?? OUTBOUND_TIMEOUT_MS, OUTBOUND_TIMEOUT_MS));
    const req = live.req = request(url, {
      method: init.method,
      headers: { ...headers, "user-agent": `Ziffr/${ZIFFR_VERSION}`, ...(init.body ? { "content-length": Buffer.byteLength(init.body) } : {}) },
      // A connection of its own each time: a pooled one would skip the lookup and its checks.
      agent: false,
      ...(outboundTls.ca ? { ca: outboundTls.ca } : {}),
      timeout: OUTBOUND_TIMEOUT_MS,
      // Node asks for every address at once (`all`) when it may try IPv4 and IPv6; each one was checked either way.
      lookup: ((host: string, opts: { all?: boolean }, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) => {
        const found = isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : mailHostResolver.lookup(host);
        found.then((addresses) => {
          if (!addresses.length) return cb(new Error("no address"), "", 0);
          if (!allowPrivate && addresses.some((a) => privateAddress(a.address))) return cb(new Error("private address"), "", 0);
          if (opts?.all) return cb(null, addresses.map((a) => ({ address: a.address, family: a.family })));
          cb(null, addresses[0].address, addresses[0].family);
        }, (e) => cb(e, "", 0));
      }) as never,
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > init.maxBytes) { res.destroy(); done(() => resolve({ status: res.statusCode ?? 0, body: "", tooBig: true })); return; }
        chunks.push(c);
      });
      res.on("end", () => done(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), tooBig: false })));
      res.on("error", (e) => done(() => reject(e)));
      res.on("close", () => done(() => reject(new Error("the answer ended early"))));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => done(() => reject(e)));
    if (init.body) req.write(init.body);
    req.end();
  });
}
