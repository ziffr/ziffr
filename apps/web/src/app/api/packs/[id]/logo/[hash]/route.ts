// An installed Pack's logo for the Packs page (GLOSSARY: Pack; spec 0039): signed-in people of the install's Workspace
// only (never Guests), named by a keyed hash of the picture, and served only if it still passes the logo checks. The page
// draws it in an `img` in a bordered box and nowhere else.
import { packLogo } from "@ziffr/core/brand-logo";
import { currentActor } from "@/lib/viewer";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; hash: string }> }) {
  const { id, hash } = await params;
  let logo: Awaited<ReturnType<typeof packLogo>> = null;
  try { logo = /^\d{1,12}$/.test(id) ? await packLogo(await currentActor(), Number(id), hash) : null; } catch { logo = null; }
  if (!logo) return new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.contentType,
      // Private: it is for people signed in to this Workspace, and the address changes when the picture does.
      "cache-control": "private, max-age=31536000, immutable",
      // A picture and nothing else: never sniffed into a page, and an SVG opened on its own runs nothing and loads nothing.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
