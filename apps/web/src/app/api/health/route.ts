// GET /api/health (spec 0015): whether this Installation's app answers, for Docker, a load balancer or a monitor to
// ask without signing in. It says "ok" and nothing else: no version, no settings, nothing about the database.

export const dynamic = "force-dynamic";

/** Answers "ok" while the server runs. */
export function GET() {
  return new Response("ok", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
