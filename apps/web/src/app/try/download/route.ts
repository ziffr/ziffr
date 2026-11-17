// GET /try/download (spec 0021): a trial's Metrics and values as a CSV file, for its Owner to keep before the trial is
// deleted. The core checks that the person is the trial's Owner; the file holds only that workspace's values.
import { currentActor } from "@/lib/viewer";
import { trialValuesCsv } from "@ziffr/core/trial-end";

/** The file, or 403 for anyone but the trial's Owner. */
export async function GET() {
  let csv: string;
  try {
    csv = await trialValuesCsv(await currentActor());
  } catch {
    return new Response("Not allowed.", { status: 403 });
  }
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ziffr-trial-values.csv"', "cache-control": "no-store" } });
}
