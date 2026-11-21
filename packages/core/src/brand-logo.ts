// A Workspace's logo as a cacheable address (GLOSSARY: Theme; ticket #542): public pages show it from
// /api/brand/logo/<workspace>/<hash> instead of carrying the picture inline in every page. The address names the
// picture by a hash of its content, so it never changes under the same address (cache for a year) and only a picture
// one of the Workspace's own Themes holds, and that passes the logo checks, is ever served. Server only.
import { createHash } from "node:crypto";
import { db } from "./db";
import { logoOk, type ThemeLook } from "./theme-look";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hashOf = (dataUrl: string) => createHash("sha256").update(dataUrl).digest("hex").slice(0, 16);

/** The look with its logo as an address on this site (or null), for pages that go to a browser. */
export function publicLook(workspaceId: string, look: ThemeLook): ThemeLook {
  return { ...look, logo: look.logo && logoOk(look.logo) ? `/api/brand/logo/${workspaceId}/${hashOf(look.logo)}` : null };
}

/** The picture behind such an address: its type and bytes, or null when no Theme of that Workspace holds it. */
export async function brandLogo(workspaceId: string, hash: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  if (!UUID.test(String(workspaceId)) || !/^[0-9a-f]{16}$/.test(String(hash))) return null;
  const { data } = await db().from("themes").select("slides").eq("workspace_id", workspaceId);
  for (const t of data ?? []) {
    const logo = (t.slides as { logo?: unknown } | null)?.logo;
    if (logoOk(logo) && hashOf(logo) === hash) {
      const [head, body] = [logo.slice(5, logo.indexOf(";")), logo.slice(logo.indexOf(",") + 1)];
      return { contentType: head, bytes: Buffer.from(body, "base64") };
    }
  }
  return null;
}
