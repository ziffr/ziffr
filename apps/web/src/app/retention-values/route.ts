// GET /retention-values?metric=…&keep=…&then=…&into=… (GLOSSARY: Retention; spec 0033, ticket #382): the values a Retention
// would remove from one Metric, as a CSV, offered before a delete is confirmed. The core checks who may set the Metric's
// Retention, reads the setting as untrusted input and writes the download in the Audit Log; a refusal is said in words.
import { Forbidden } from "@ziffr/core/actor";
import { retentionValuesCsv } from "@ziffr/core/retention-setting";
import { forPeople } from "@/lib/action-result";
import { csvFile } from "@/lib/csv-file";
import { currentActor } from "@/lib/viewer";

const headers = { "cache-control": "no-store" };

/** The file, 403 for anyone who may not set the Metric's Retention, 400 with the reason when it cannot be made. */
export async function GET(req: Request) {
  // The download is written in the Audit Log, so another site may not make a signed-in person's browser fetch it: only
  // the app's own links (same origin) and a typed or bookmarked address (none) count.
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return new Response("Not allowed.", { status: 403, headers });
  const q = new URL(req.url).searchParams;
  const setting = q.get("then") === "delete" ? { keep_months: Number(q.get("keep")), then: "delete" } : { keep_months: Number(q.get("keep")), then: q.get("then"), into: q.get("into") };
  try {
    const csv = await retentionValuesCsv(await currentActor(), Number(q.get("metric")), setting);
    return new Response(csvFile(csv), { headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ziffr-values-to-delete.csv"' } });
  } catch (e) {
    const words = forPeople(e);
    if (words === null) throw e;
    // A refusal is a sentence for people: 403 for who may not, 400 for a setting that does not fit or nothing to download.
    return new Response(words, { status: e instanceof Forbidden ? 403 : 400, headers });
  }
}
