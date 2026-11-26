// GET /metric-values?metric=slug&metric=slug (spec 0056; GLOSSARY: Metric, Audit Log): the values of the Metrics a person
// chose, as a CSV file. The core checks who and which Metrics (only those the person sees) and writes the download in the
// Audit Log; the route passes on slugs as plain strings, never as a query filter. A refusal is said in words.
import { unstable_rethrow } from "next/navigation";
import { Forbidden, type Actor } from "@ziffr/core/actor";
import { EXPORT_METRICS, exportMetricValues } from "@ziffr/core/metric-values-export";
import { forPeople } from "@/lib/action-result";
import { csvFile } from "@/lib/csv-file";
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

/** The file, 403 for anyone who may not, 400 with the reason when it cannot be made. */
export async function GET(req: Request) {
  // The download is written in the Audit Log, so another site may not make a signed-in person's browser fetch it.
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return new Response("Not allowed.", { status: 403, headers });
  // Untrusted: at most one more than the limit is read, so the core can refuse a longer list in words.
  const slugs = new URL(req.url).searchParams.getAll("metric").slice(0, EXPORT_METRICS + 1);
  try {
    const { csv } = await exportMetricValues(await person(), slugs);
    return new Response(csvFile(csv), { headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ziffr-values.csv"' } });
  } catch (e) {
    // A redirect to sign in, or to make a Workspace, is Next.js's, not a refusal to put into words.
    unstable_rethrow(e);
    const words = forPeople(e);
    if (words === null) throw e;
    return new Response(words, { status: e instanceof Forbidden ? 403 : 400, headers });
  }
}
