// Where a mail server saved on the Installation Settings page may be (spec 0025; GLOSSARY: Installation Settings):
// never inside the server's own network unless the server allows it (ZIFFR_ALLOW_PRIVATE_MAIL_HOST=1). Judged on the
// name as written and on every address it resolves to, and the connection is then made to the address that was
// checked, so a name that changes its answer between the check and the connection (DNS rebinding) reaches nothing new.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

// An IPv4 address as its four numbers, or null.
function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

const privateV4 = ([a, b]: number[]) =>
  a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);

/** Whether an IP address is inside a private network: loopback, RFC 1918, CGNAT, link-local, unspecified, fc00::/7,
 * fe80::/10, or IPv4 inside IPv6 that is one of those. False for anything that is not an IP address. */
export function privateAddress(raw: string): boolean {
  const ip = String(raw).toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = ipv4(ip);
  if (v4) return privateV4(v4);
  if (!ip.includes(":")) return false;
  if (ip === "::" || ip === "::1") return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(ip) || /^fe[89ab][0-9a-f]?:/.test(ip)) return true;
  // IPv4 mapped into IPv6, written with dots or as URL writes it (::ffff:7f00:1).
  const mapped = /^::ffff:(.+)$/.exec(ip)?.[1];
  if (mapped) {
    const dotted = ipv4(mapped);
    if (dotted) return privateV4(dotted);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
    if (hex) { const hi = parseInt(hex[1], 16); return privateV4([hi >> 8, hi & 255]); }
  }
  return false;
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
