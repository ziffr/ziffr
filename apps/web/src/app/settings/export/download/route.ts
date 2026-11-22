// POST /settings/export/download (spec 0040, ticket 8; GLOSSARY: Workspace Export): the Workspace Export as a file, for
// the Workspace's Owner after a sign-in from the last 10 minutes. The core checks who asks and when they signed in,
// records it, and builds the file while it is read; this only streams it, never cached and never stored, and ends the
// response with an error, not a short file, when the core cannot finish it.
import { currentActor } from "@/lib/viewer";
import { Forbidden } from "@ziffr/core/actor";
import { exportWorkspace, SignInTooOld, WorkspaceExportLimit } from "@ziffr/core/workspace-export";
import { SITE_URL } from "@/lib/sign-in";

const NO_STORE = { "cache-control": "no-store, private" };

/** Streams the file. Anyone but the Owner gets 404; an Owner who signed in too long ago is sent back to the page. */
export async function POST() {
  let file: Awaited<ReturnType<typeof exportWorkspace>>;
  try {
    file = await exportWorkspace(await currentActor());
  } catch (e) {
    if (e instanceof SignInTooOld) return Response.redirect(`${SITE_URL}/settings/export`, 303);
    if (e instanceof Forbidden) return new Response("Not found", { status: 404, headers: NO_STORE });
    if (e instanceof WorkspaceExportLimit) return new Response(e.message, { status: 429, headers: { ...NO_STORE, "retry-after": "3600", "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  const bytes = file.stream[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    // One piece per pull, so the file is read from the database only as fast as it is sent; an error ends the response.
    async pull(controller) {
      const next = await bytes.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() { await bytes.return?.(undefined); },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${file.filename}"`,
      ...NO_STORE,
      "x-content-type-options": "nosniff",
    },
  });
}
