// What the routes that hand a signed-in person a file of their Metrics share (specs 0056 and 0065; GLOSSARY: Metric,
// Audit Log): only Ziffr's own pages may ask, the person is the one signed in, and a refusal is said in words.
import { unstable_rethrow } from "next/navigation";
import { Forbidden, type Actor } from "@ziffr/core/actor";
import { forPeople } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";

const headers = { "cache-control": "no-store" };

/** The person asking. Someone who is no member of the Workspace is refused like anyone else who may not. */
async function person(): Promise<Actor> {
  try {
    return await currentActor();
  } catch (e) {
    unstable_rethrow(e);
    if (forPeople(e) === null) throw e;
    throw new Forbidden();
  }
}

/** A file made for the person asking, as an attachment: 403 for anyone who may not, 400 with the reason when it cannot
 * be made. `make` gets the Actor and asks the core, which checks who and what. */
export async function fileDownload(req: Request, make: (actor: Actor) => Promise<{ body: string | Uint8Array<ArrayBuffer>; type: string; filename: string }>): Promise<Response> {
  // The download is written in the Audit Log, so another site may not make a signed-in person's browser fetch it.
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return new Response("Not allowed.", { status: 403, headers });
  try {
    const file = await make(await person());
    return new Response(file.body, { headers: { ...headers, "content-type": file.type, "content-disposition": `attachment; filename="${file.filename}"` } });
  } catch (e) {
    // A redirect to sign in, or to make a Workspace, is Next.js's, not a refusal to put into words.
    unstable_rethrow(e);
    const words = forPeople(e);
    if (words === null) throw e;
    return new Response(words, { status: e instanceof Forbidden ? 403 : 400, headers });
  }
}
