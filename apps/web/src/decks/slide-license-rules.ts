// When the slide editor needs its license key (GLOSSARY: Installation Settings, Deck). This repeats tldraw's own rule
// for "production" only to say beforehand what is missing; tldraw checks every key itself, and nothing here changes
// what it decides.

/** Whether tldraw shows its canvas at this address only with a license key: a built app, reached over https and not on
 * this machine (or at a *.localhost name). Elsewhere it shows the canvas without one. */
export function needsLicenseKey({ protocol, hostname }: { protocol: string; hostname: string }, built: boolean): boolean {
  if (!built) return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.endsWith(".localhost")) return true;
  if (protocol === "http:") return false;
  const thisMachine = host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
  return !(protocol === "https:" && thisMachine);
}
