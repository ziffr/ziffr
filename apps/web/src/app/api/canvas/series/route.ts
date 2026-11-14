// GET /api/canvas/series?ids=1,2,3 (ticket #125; GLOSSARY: Widget, Metric): more series for a dashboard, deck or
// canvas that is open, when someone places or picks a Metric the page did not send. A page sends only the series it
// draws, so this keeps what goes to a browser small. Signed-in people only (the proxy refuses others); the core
// answers only Metrics this person sees. A GET, not a server action: server actions run one after another, and a
// widget placed while another action is pending must not wait for its numbers.
import { NextResponse } from "next/server";
import { canvasSeries, MAX_SERIES_REQUEST } from "@ziffr/core/access";
import { Forbidden } from "@ziffr/core/actor";
import { currentActor } from "@/lib/viewer";

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

/** The series, Breakdowns, Target Series and Projections of the Metrics named in `ids` that the person sees. */
export async function GET(req: Request) {
  // Only this app's own pages ask; another site cannot read the answer anyway (no CORS), and this says so early.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NextResponse.json({ error: "Not from this site." }, { status: 403, headers });
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  // Whole numbers only, at most MAX_SERIES_REQUEST of them; anything else is refused before the core is asked.
  const parts = raw.split(",").filter(Boolean);
  if (parts.length > MAX_SERIES_REQUEST || !parts.every((p) => /^\d{1,12}$/.test(p))) return NextResponse.json({ error: "ids must be up to 200 whole numbers." }, { status: 400, headers });
  try {
    return NextResponse.json(await canvasSeries(await currentActor(), parts.map(Number)), { headers });
  } catch (e) {
    if (e instanceof Forbidden) return NextResponse.json({ error: "Not allowed." }, { status: 403, headers });
    throw e;
  }
}
