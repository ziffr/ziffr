// GET /metric-record?metric=id&metric=id (spec 0065; GLOSSARY: Metric Record, Metric Owner, Audit Log): the record of
// the Metrics a person is about to delete, as a ZIP file. The core checks that they own every one, and writes the
// download in the Audit Log, which is what unlocks the deletion; the route passes on ids as plain numbers.
import { exportMetricRecord } from "@ziffr/core/metric-record";
import { DELETE_METRICS } from "@ziffr/core/metric-delete-rules";
import { fileDownload } from "@/lib/file-download";

/** The file, 403 for anyone who may not, 400 with the reason when it cannot be made. */
export function GET(req: Request) {
  // Untrusted: at most one more than the limit is read, so the core can refuse a longer list in words.
  const ids = new URL(req.url).searchParams.getAll("metric").slice(0, DELETE_METRICS + 1).map(Number);
  return fileDownload(req, async (actor) => {
    const { zip, filename } = await exportMetricRecord(actor, ids);
    return { body: new Uint8Array(zip), type: "application/zip", filename };
  });
}
