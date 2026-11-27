// GET /metric-values?metric=slug&metric=slug (spec 0056; GLOSSARY: Metric, Audit Log): the values of the Metrics a person
// chose, as a CSV file. The core checks who and which Metrics (only those the person sees) and writes the download in the
// Audit Log; the route passes on slugs as plain strings, never as a query filter. A refusal is said in words.
import { EXPORT_METRICS, exportMetricValues } from "@ziffr/core/metric-values-export";
import { csvFile } from "@/lib/csv-file";
import { fileDownload } from "@/lib/file-download";

/** The file, 403 for anyone who may not, 400 with the reason when it cannot be made. */
export function GET(req: Request) {
  // Untrusted: at most one more than the limit is read, so the core can refuse a longer list in words.
  const slugs = new URL(req.url).searchParams.getAll("metric").slice(0, EXPORT_METRICS + 1);
  return fileDownload(req, async (actor) => ({ body: csvFile((await exportMetricValues(actor, slugs)).csv), type: "text/csv; charset=utf-8", filename: "ziffr-values.csv" }));
}
