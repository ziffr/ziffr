// Whose name and picture a Slack message carries (GLOSSARY: Workspace, Theme, Connector; ticket #650). With the bot
// scope chat:write.customize Slack lets each message bring its own name and icon: Ziffr sends the Workspace's name
// and its Theme logo, as emails and the form link already do (#542). Nothing here reads the database itself.
import { publicLook } from "./brand-logo";
import type { ThemeLook } from "./theme-look";

/** The scope that lets a message bring its own name and icon; a Slack connection made without it keeps the app's. */
export const CUSTOMIZE_SCOPE = "chat:write.customize";

/** Whether the scopes Slack granted at install (a comma-separated list) include the one for a name and icon per message. */
export const canCustomize = (scopes: string | null | undefined): boolean => String(scopes ?? "").split(",").map((s) => s.trim()).includes(CUSTOMIZE_SCOPE);

/**
 * The fields of chat.postMessage that give a message the Workspace's name and logo; nothing without the scope.
 * Slack fetches `icon_url` itself, from the public logo address (brand-logo.ts), so it must be absolute. Without a
 * logo, or without a usable site address, only the name is set: the app's icon stays.
 * Slack draws PNG, JPEG and GIF icons, not SVG, so a Workspace whose logo is an SVG sends only its name.
 * Why a public address is fine (AGENTS rule 3): Slack fetches it with no sign-in, and the address only ever serves the
 * logo picture itself, named by a hash of its content in a Workspace's own Theme (brand-logo.ts) and already shown to
 * anyone holding a form link or View Link. What leaves is the Workspace's name and that address: no Theme data.
 */
export function slackIdentity(scopes: string | null | undefined, workspaceId: string, look: ThemeLook, siteUrl: string | null | undefined): { username?: string; icon_url?: string } {
  if (!canCustomize(scopes)) return {};
  const out: { username?: string; icon_url?: string } = {};
  if (look.name.trim()) out.username = look.name.trim().slice(0, 80);
  const site = String(siteUrl ?? "").trim().replace(/\/+$/, "");
  const logo = look.logo && /^data:image\/(png|jpeg);/i.test(look.logo) ? publicLook(workspaceId, look).logo : null;
  // https and a bare host only: never credentials from the address, and Slack fetches nothing over plain http.
  const origin = (() => { try { const u = new URL(site); return u.protocol === "https:" && !u.username && !u.password && u.origin === site ? site : null; } catch { return null; } })();
  if (logo && origin) out.icon_url = `${origin}${logo}`;
  return out;
}
