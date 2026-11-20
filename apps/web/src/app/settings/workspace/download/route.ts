// GET /settings/workspace/download (spec 0029, ticket #269): the values of every Metric the person sees, as a CSV file,
// for Owners and Admins, such as before a Workspace unused for months is deleted. The core checks who and which Metrics.
import { Forbidden } from "@ziffr/core/actor";
import { workspaceValuesCsv } from "@ziffr/core/unused-workspaces";
import { currentActor } from "@/lib/viewer";

/** The file, or 403 for anyone but an Owner or Admin. */
export async function GET() {
  let csv: string;
  try {
    csv = await workspaceValuesCsv(await currentActor());
  } catch (e) {
    if (e instanceof Forbidden) return new Response("Not allowed.", { status: 403, headers: { "cache-control": "no-store" } });
    throw e;
  }
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ziffr-values.csv"', "cache-control": "no-store" } });
}
