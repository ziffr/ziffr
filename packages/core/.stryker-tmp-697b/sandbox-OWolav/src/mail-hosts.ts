// @ts-nocheck
// Where a mail server saved on the Installation Settings page may be (spec 0025; GLOSSARY: Installation Settings):
// never inside the server's own network unless the server allows it (ZIFFR_ALLOW_PRIVATE_MAIL_HOST=1). Judged on the
// name as written and on every address it resolves to, and the connection is then made to the address that was
// checked, so a name that changes its answer between the check and the connection (DNS rebinding) reaches nothing new.
import { lookup } from "node:dns/promises";
import { BlockList, isIP, isIPv4, isIPv6 } from "node:net";

/** The name lookup the checks use; tests put their own answers in. */
export const mailHostResolver = {
  /** Every address of a name, as the system resolver answers. */
  lookup: async (host: string): Promise<{ address: string; family: number }[]> => lookup(host, { all: true, verbatim: true }),
};

/** Thrown when a mail server's host is refused or cannot be found; `code` is EPRIVATEHOST or EDNS. */
export class MailHostError extends Error {
  /** EPRIVATEHOST (inside the server's network) or EDNS (no address). */
  code: "EPRIVATEHOST" | "EDNS";
  constructor(code: "EPRIVATEHOST" | "EDNS") {
    super(code === "EPRIVATEHOST" ? "That mail server is inside this server's own network." : "That mail server's name has no address.");
    this.name = "MailHostError";
    this.code = code;
  }
}

/** Whether the server allows mail servers inside its own network to be saved on the page. */
export const privateMailHostsAllowed = () => process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST === "1";

// Every IPv4 range that is not global unicast. Kept apart from the IPv6 list: a BlockList holding ::ffff:0:0/96
// matches every IPv4 address checked against it, so the IPv4 inside IPv6 is unwrapped by hand instead.
const DENIED_V4 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) DENIED_V4.addSubnet(net, bits, "ipv4");

// IPv6 ranges inside global unicast (2000::/3) that are no place for a mail server: documentation and Teredo, which
// hides an IPv4 address. Everything outside 2000::/3 is refused anyway (loopback, ::, fc00::/7, fe80::/10, ff00::/8).
const DENIED_V6 = new BlockList();
for (const [net, bits] of [["2001:db8::", 32], ["2001::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) DENIED_V6.addSubnet(net, bits, "ipv6");

/** An IPv6 address as its 16 bytes, a trailing dotted IPv4 included; null for anything else. */
function v6Bytes(ip: string): number[] | null {
  if (!isIPv6(ip)) return null;
  let text = ip;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (dotted) {
    const [a, b, c, d] = dotted.split(".").map(Number);
    text = text.slice(0, -dotted.length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.includes("::") ? text.split("::") : [text, null];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === null ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8) return null;
  return groups.flatMap((g) => { const n = parseInt(g || "0", 16); return [n >> 8, n & 255]; });
}

/** The IPv4 address an IPv6 address carries: mapped (::ffff:0:0/96), translated (::ffff:0:0:0/96), compatible
 * (::/96), NAT64 (64:ff9b::/96) or 6to4 (2002::/16); null when it carries none. */
export function innerIPv4(ip: string): string | null {
  const b = v6Bytes(ip);
  if (!b) return null;
  const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  const v4 = (at: number) => b.slice(at, at + 4).join(".");
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4(12);
  if (zero(0, 8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return v4(12);
  if (zero(0, 12)) return v4(12);
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12)) return v4(12);
  if (b[0] === 0x20 && b[1] === 0x02) return v4(2);
  return null;
}

/** Whether an IP address is anything but global unicast: every range reserved, private, shared, local, for
 * documentation or benchmarks, multicast or broadcast, and IPv4 inside IPv6 that is one of those. True for anything
 * that is not an IP address, so whatever cannot be judged is refused. */
export function privateAddress(raw: string): boolean {
  const ip = String(raw).toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (isIPv4(ip)) return DENIED_V4.check(ip, "ipv4");
  if (!isIPv6(ip)) return true;
  const inner = innerIPv4(ip);
  if (inner !== null) return DENIED_V4.check(inner, "ipv4");
  const b = v6Bytes(ip)!;
  // Global unicast is 2000::/3 only.
  if ((b[0] & 0xe0) !== 0x20) return true;
  return DENIED_V6.check(ip, "ipv6");
}

/** Whether a mail server host, as written, is inside the server's own network: a private IP address (see
 * privateAddress), or a bare name without a dot (`mail`, `localhost`) or one under `.localhost`. */
export function privateMailHost(raw: string): boolean {
  const host = String(raw).toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) return privateAddress(host);
  return !host.includes(".") || host.endsWith(".localhost");
}

/** The address to connect to for a host saved on the page, checked: refused (EPRIVATEHOST) when the name or any
 * address it resolves to is private, unless the server allows that; EDNS when it has no address. `servername` is the
 * name TLS checks the certificate against when the host was a name. */
export async function checkedMailHost(rawHost: string): Promise<{ address: string; servername?: string }> {
  const host = String(rawHost).replace(/^\[|\]$/g, "");
  const allowed = privateMailHostsAllowed();
  if (!allowed && privateMailHost(host)) throw new MailHostError("EPRIVATEHOST");
  if (isIP(host)) return { address: host };
  let found: { address: string }[];
  try {
    found = await mailHostResolver.lookup(host);
  } catch {
    throw new MailHostError("EDNS");
  }
  if (!found.length) throw new MailHostError("EDNS");
  // Every address counts: a name with one public and one private answer could be steered to the private one.
  if (!allowed && found.some((a) => privateAddress(a.address))) throw new MailHostError("EPRIVATEHOST");
  return { address: found[0].address, servername: host };
}
