// GET /audit/export (spec 0008, GLOSSARY: Audit Log): the workspace's Audit Log as a CSV file, for its signed-in
// Owners and Admins, with the same filter as the page. The core checks who asks, records the export and writes the
// lines; this only streams them, never cached, as a download.
import { CSV_BYTE_ORDER_MARK } from "@/lib/csv-file";
import { currentActor } from "@/lib/viewer";
import { AuditExportLimit, exportAuditLog } from "@ziffr/core/audit-log";
import { Forbidden } from "@ziffr/core/actor";

/** Streams the filtered Audit Log as CSV; anyone else gets 404, as if there were nothing here. */
export async function GET(req: Request) {
  const actor = await currentActor();
  const query = Object.fromEntries(new URL(req.url).searchParams);
  let file: Awaited<ReturnType<typeof exportAuditLog>>;
  try {
    file = await exportAuditLog(actor, query);
  } catch (e) {
    if (e instanceof Forbidden) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    // Only Owners and Admins get this far, so saying why is safe (spec 0009).
    if (e instanceof AuditExportLimit) return new Response(e.message, { status: 429, headers: { "cache-control": "no-store", "retry-after": "3600", "content-type": "text/plain; charset=utf-8" } });
    throw e;
  }
  const encoder = new TextEncoder();
  const lines = file.lines[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode(CSV_BYTE_ORDER_MARK)); },
    // One batch of lines per pull, so a large export is read from the database only as fast as it is sent.
    async pull(controller) {
      const next = await lines.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    async cancel() { await lines.return?.(); },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
