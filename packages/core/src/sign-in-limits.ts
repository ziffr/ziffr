// Ziffr's own limits on sign-in links (spec 0009, ticket #129; ADR 0003). Asked before Supabase sends a link, so a
// mistake in Supabase's settings cannot let someone flood an inbox or the mail quota. Nobody is signed in yet, so
// this takes no Actor; it stores only hashes of the address and the network address, for a day.
//
// The low limit counts an address and a network address together, so someone elsewhere cannot use up a person's
// links; the address alone has a higher ceiling, and so does one network address (a team behind one office address).
import { createHash } from "node:crypto";
import { db } from "./db";

/** Sign-in links per address from one network address in an hour. */
export const LINKS_PER_PLACE = 5;
/** Sign-in links per address in an hour, from anywhere: high enough that others cannot lock a person out easily. */
export const LINKS_PER_ADDRESS = 30;
/** Sign-in links per network address in an hour, to any addresses. */
export const LINKS_PER_NETWORK = 20;

const hash = (kind: string, value: string) => createHash("sha256").update(`ziffr-sign-in:${kind}:${value}`).digest("hex");

/** The inbox an address reaches, for counting: lowercased, without a "+tag", and for Gmail without dots, so
 * a+1@…, a+2@… and a.b@gmail.com count as the one inbox they are. The link still goes to the address as typed. */
export function inboxOf(address: string): string {
  const [local = "", domain = ""] = String(address ?? "").trim().toLowerCase().split("@");
  const base = local.split("+")[0];
  return `${domain === "gmail.com" || domain === "googlemail.com" ? base.replace(/\./g, "") : base}@${domain === "googlemail.com" ? "gmail.com" : domain}`;
}

/** Whether another sign-in link may go to this address from this network address, and counts it if so. The network
 * address may be unknown (see networkAddress); the address's own limits always hold. */
export async function claimSignInLink(address: string, network: string | null): Promise<boolean> {
  const inbox = inboxOf(address);
  const place = network ? String(network).trim().toLowerCase().slice(0, 64) : "";
  const { data, error } = await db().rpc("claim_sign_in_link", {
    p_address_key: hash("address", inbox),
    // Without a network address there is no place to count per: the low limit would then hold for the address from
    // anywhere and let anyone lock a person out, so only the address's higher ceiling applies.
    p_pair_key: place ? hash("pair", `${inbox} ${place}`) : null,
    p_network_key: place ? hash("network", place) : null,
    p_per_pair: LINKS_PER_PLACE,
    p_per_address: LINKS_PER_ADDRESS,
    p_per_network: LINKS_PER_NETWORK,
  });
  // A database that does not answer sends no link either: failing open would turn the limit off when it is needed.
  if (error) throw new Error("Sign-in is not available right now. Try again in a minute.");
  return data === true;
}

/** The network address a request came from, or null when it cannot be trusted. Only with ZIFFR_PROXY_HOPS (how many
 * proxies in front of Ziffr add to X-Forwarded-For, usually 1): the entry that many from the right, which the
 * self-hoster's own proxy wrote; entries further left are whatever the client sent. An IPv6 address counts by its
 * /64, which one sender usually holds whole. */
export function networkAddress(headers: { get(name: string): string | null }, env: Record<string, string | undefined> = process.env): string | null {
  const hops = Number(env.ZIFFR_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops < 1 || hops > 5) return null;
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = chain.length >= hops ? chain[chain.length - hops] : "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
  if (/^[0-9a-f:]{2,39}$/i.test(ip) && ip.includes(":")) return ipv6Prefix(ip);
  return null;
}

/** The first four groups (/64) of an IPv6 address, "::" expanded. */
function ipv6Prefix(ip: string): string | null {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
