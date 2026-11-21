// A Workspace's logo for the public pages (GLOSSARY: Theme; ticket #542): no sign-in, because the form link and View Link
// pages show it to people who have none. Only a picture one of the Workspace's Themes holds is served, named by the hash
// of its content, so the address never changes meaning and may be cached for good.
import { brandLogo } from "@ziffr/core/brand-logo";

export async function GET(_req: Request, { params }: { params: Promise<{ workspace: string; hash: string }> }) {
  const { workspace, hash } = await params;
  const logo = await brandLogo(workspace, hash);
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      // A picture and nothing else: never sniffed into a page, and an SVG opened on its own runs nothing and loads nothing.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
