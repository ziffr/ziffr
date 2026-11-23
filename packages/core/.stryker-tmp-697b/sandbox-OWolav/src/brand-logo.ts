// @ts-nocheck
// A Workspace's logo as a cacheable address (GLOSSARY: Theme; ticket #542): public pages show it from
// /api/brand/logo/<workspace>/<hash> instead of carrying the picture inline in every page. The address names the
// picture by a hash of its content, so it never changes under the same address (cache for a year) and only a picture
// one of the Workspace's own Themes holds, and that passes the logo checks, is ever served. Server only.
import { createHmac, timingSafeEqual } from "node:crypto";
import { secretsKey } from "./secrets";
import { db } from "./db";
import { cleanLogo as cleanPackLogo, PACK_LOGO_MAX_BYTES } from "@ziffr/pack/logo";
import { cleanLogo, type ThemeLook } from "./theme-look";
import type { Actor } from "./actor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The address part for a logo of a Workspace: a keyed hash of the Workspace id and the picture, so holding a Workspace's
 * id and a public picture (a Pack's logo) is not enough to ask whether that Workspace holds it. The key is the
 * Installation's secret (ZIFFR_SECRETS_KEY, else the service key it always has), set apart by a label. */
export function hashOf(workspaceId: string, dataUrl: string): string {
  const base = secretsKey() ?? Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", "utf8");
  // Closed, not open: with no secret at all the key would be guessable, so no address is made.
  if (base.length === 0) throw new Error("No secret to key logo addresses with.");
  const key = createHmac("sha256", base).update("ziffr-brand-logo").digest();
  return createHmac("sha256", key).update(`${workspaceId}\n${dataUrl}`).digest("hex").slice(0, 16);
}
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The look with its logo as an address on this site (or null), for pages that go to a browser. */
export function publicLook(workspaceId: string, look: ThemeLook): ThemeLook {
  const logo = cleanLogo(look.logo);
  let address: string | null = null;
  try { address = logo ? `/api/brand/logo/${workspaceId}/${hashOf(workspaceId, logo)}` : null; } catch { /* no secret: no address */ }
  return { ...look, logo: address };
}

/** The picture behind such an address: its type and bytes, or null when no Theme of that Workspace holds it. */
export async function brandLogo(workspaceId: string, hash: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  if (!UUID.test(String(workspaceId)) || !/^[0-9a-f]{16}$/.test(String(hash))) return null;
  const { data } = await db().from("themes").select("slides").eq("workspace_id", workspaceId);
  for (const t of data ?? []) {
    // What is served is the picture as Ziffr wrote it out itself (an SVG is serialized again from what was parsed), and a
    // stored logo that no longer passes the checks is served as nothing.
    const logo = cleanLogo((t.slides as { logo?: unknown } | null)?.logo);
    let expected = "";
    try { expected = logo ? hashOf(workspaceId, logo) : ""; } catch { return null; }
    if (logo && same(expected, hash)) {
      const [head, body] = [logo.slice(5, logo.indexOf(";")), logo.slice(logo.indexOf(",") + 1)];
      return { contentType: head, bytes: Buffer.from(body, "base64") };
    }
  }
  return null;
}

/** The address of an installed Pack's logo on this site (spec 0039): named by a keyed hash of the Workspace, the install and
 * the picture, so a changed logo is a new address. Null when the install has no logo that passes the checks, or no secret
 * is set. The kept logo is checked again here, whatever was stored. */
export function packLogoAddress(workspaceId: string, installId: number, kept: unknown): string | null {
  const logo = kept === undefined || kept === null ? null : cleanPackLogo(kept, PACK_LOGO_MAX_BYTES);
  if (!logo) return null;
  try { return `/api/packs/${installId}/logo/${hashOf(workspaceId, `pack:${installId}\n${logo}`)}`; } catch { return null; }
}

/** The picture behind such an address for a person of the install's Workspace (not a Guest, not a key): its type and
 * bytes as Ziffr wrote them out itself, or null when the install is not this Workspace's, has no such logo any more, or
 * the logo fails the checks. Security: spec 0039; the Packs page is for people of the Workspace only. */
export async function packLogo(actor: Actor, installId: number, hash: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  if ((actor as { key?: unknown }).key || actor.role === "guest") return null;
  if (!Number.isInteger(installId) || installId < 1 || !/^[0-9a-f]{16}$/.test(String(hash))) return null;
  const { data } = await db().from("pack_installs").select("manifest").eq("id", installId).eq("workspace_id", actor.workspaceId).maybeSingle();
  const kept = (data?.manifest as { logo?: unknown } | null)?.logo;
  const logo = kept === undefined || kept === null ? null : cleanPackLogo(kept, PACK_LOGO_MAX_BYTES);
  if (!logo) return null;
  let expected = "";
  try { expected = hashOf(actor.workspaceId, `pack:${installId}\n${logo}`); } catch { return null; }
  if (!same(expected, hash)) return null;
  return { contentType: logo.slice(5, logo.indexOf(";")), bytes: Buffer.from(logo.slice(logo.indexOf(",") + 1), "base64") };
}
