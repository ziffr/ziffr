// GET /api/v1/installation/usage (spec 0031, ticket #365; GLOSSARY: Usage, Usage Key): the Installation's daily Usage
// figures, counts only: never a Workspace's or a Metric's name, a person or a value. Only with a Usage Key in
// `Authorization: Bearer`. It is not an Access Key endpoint and the job secret does not open it. Anyone else, with no
// key, a wrong one, an Access Key or a Feed Key, gets a bare 404, as the jobs answer, so the endpoint is not known to
// be there; a Usage Key past 60 calls an hour gets 429. The core decides everything, including the small-number rules.
import { authenticateUsageKey, installationUsage, UsageRangeError } from "@ziffr/core/installation-usage";
import { UsageResponse, usageQuery } from "../../schemas";

const HEADERS = { "cache-control": "no-store" };
const notFound = () => new Response(null, { status: 404, headers: HEADERS });

/** The days of figures in the range. */
export const GET = async (req: Request): Promise<Response> => {
  const given = /^Bearer\s+(\S{1,200})$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const actor = await authenticateUsageKey(given);
  if (!actor) return notFound();
  if (actor === "limited") return Response.json({ error: { code: "rate_limited", message: "Too many calls this hour; wait for Retry-After seconds." } }, { status: 429, headers: { ...HEADERS, "retry-after": "3600" } });
  const parsed = usageQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "`from` and `to` are days written YYYY-MM-DD." } }, { status: 400, headers: HEADERS });
  try {
    return Response.json(UsageResponse.parse({ days: await installationUsage(actor, parsed.data) }), { headers: HEADERS });
  } catch (e) {
    if (e instanceof UsageRangeError) return Response.json({ error: { code: "invalid_request", message: e.message } }, { status: 400, headers: HEADERS });
    console.error("installation usage failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: { code: "internal", message: "Something went wrong on the server." } }, { status: 500, headers: HEADERS });
  }
}
