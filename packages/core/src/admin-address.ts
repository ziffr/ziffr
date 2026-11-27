// The Admin Address (spec 0066; GLOSSARY: Admin Address, Installation Settings): an address of its own that whoever
// runs the server may give the Installation's pages (ZIFFR_ADMIN_URL), so the network in front can restrict who reaches
// them. Pure: no database, no framework. The web app's middleware, its actions and the sign-in email all ask here, so
// there is one rule. It is a second lock, not the first: every admin operation still checks the Installation Admin.

/** Where the Installation's pages answer: wherever Ziffr does ("off", nothing set), only at the Admin Address ("on"),
 * or nowhere ("closed": the setting is there but wrong, so nothing is opened by a typing mistake). */
export type AdminAddress = { state: "off" } | { state: "closed"; why: string } | { state: "on"; origin: string; host: string; port: string | null };

/** Which side of an Installation with an Admin Address a request reached; "mixed" when its two host headers disagree
 * about it, which no proxy set up as the guide says ever sends. */
export type RequestSide = "app" | "admin" | "mixed";

type Env = { ZIFFR_ADMIN_URL?: string; ZIFFR_SITE_URL?: string };

// Read by name, so the middleware's runtime sees them too.
const fromProcess = (): Env => ({ ZIFFR_ADMIN_URL: process.env.ZIFFR_ADMIN_URL, ZIFFR_SITE_URL: process.env.ZIFFR_SITE_URL });

/** A host as a Host header names it, split: the name in lower case and the port, with the scheme's own port as none. */
function hostParts(host: string): { name: string; port: string | null } {
  const m = /^(.*?)(?::(\d{1,5}))?$/.exec(host.trim().toLowerCase());
  const port = m?.[2] ?? null;
  return { name: m?.[1] ?? "", port: port === "80" || port === "443" ? null : port };
}

/** The Admin Address as the server sets it. It must be an http(s) address with nothing but a host (and a port), and
 * its host must differ from the one of ZIFFR_SITE_URL: the same host would leave nothing for the app to answer on. */
export function adminAddress(env: Env = fromProcess()): AdminAddress {
  const raw = env.ZIFFR_ADMIN_URL?.trim();
  if (!raw) return { state: "off" };
  let url: URL;
  try { url = new URL(raw); } catch { return { state: "closed", why: "ZIFFR_ADMIN_URL is not an address such as https://admin.example.com." }; }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    return { state: "closed", why: "ZIFFR_ADMIN_URL must be an address such as https://admin.example.com, with no path." };
  }
  const { name, port } = hostParts(url.host);
  try {
    if (env.ZIFFR_SITE_URL && hostParts(new URL(env.ZIFFR_SITE_URL).host).name === name) {
      return { state: "closed", why: "ZIFFR_ADMIN_URL must name another host than ZIFFR_SITE_URL." };
    }
  } catch {
    // A site address that cannot be read names no host to clash with.
  }
  return { state: "on", origin: url.origin, host: name, port };
}

/** Which side a request reached, by its Host header; X-Forwarded-Host (the first value) must agree when there is one.
 * The Host header decides because the proxy in front routes by it, so the network's restriction on the Admin Address
 * and this answer are about the same name. A port counts only when the Admin Address names one. */
export function requestSide(headers: { get(name: string): string | null }, address: AdminAddress = adminAddress()): RequestSide {
  if (address.state !== "on") return "app";
  const isAdmin = (value: string) => {
    const h = hostParts(value);
    return h.name === address.host && (address.port === null || h.port === address.port);
  };
  const host = isAdmin(headers.get("host") ?? "");
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded && isAdmin(forwarded) !== host) return "mixed";
  return host ? "admin" : "app";
}

/** Whether the Installation's pages and their actions may answer this request: everywhere without an Admin Address,
 * else only there. */
export function adminPagesHere(headers: { get(name: string): string | null }, address: AdminAddress = adminAddress()): boolean {
  if (address.state === "off") return true;
  return address.state === "on" && requestSide(headers, address) === "admin";
}

/** The pages of the Installation's panel. */
export const isAdminPath = (path: string): boolean => path === "/installation" || path.startsWith("/installation/");

// What the Admin Address answers besides the panel: signing in and out. Static files never reach this.
const SIGN_IN = (path: string) => path === "/login" || path === "/auth/callback";

/** What to do with a request for a path, before anything else: let it pass, answer "not found", or send the Admin
 * Address's front page to the panel. */
export function adminRoute(path: string, headers: { get(name: string): string | null }, address: AdminAddress = adminAddress()): "pass" | "not_found" | "panel" {
  if (address.state === "off") return "pass";
  if (address.state === "closed") return isAdminPath(path) ? "not_found" : "pass";
  const side = requestSide(headers, address);
  if (side === "mixed") return "not_found";
  if (side === "app") return isAdminPath(path) ? "not_found" : "pass";
  if (path === "/") return "panel";
  return isAdminPath(path) || SIGN_IN(path) ? "pass" : "not_found";
}

/** The address of a page of the panel as a link from anywhere in Ziffr: the path alone, or at the Admin Address. */
export function installationHref(path: string, address: AdminAddress = adminAddress()): string {
  return address.state === "on" ? `${address.origin}${path}` : path;
}
