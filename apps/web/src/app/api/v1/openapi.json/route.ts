// GET /api/v1/openapi.json (spec 0002, ticket #50): the API's description, built from the server's own schemas when
// the app is built. Public: it describes what exists, never anyone's data, so it needs no key.
import { openApiDocument } from "../openapi";

export const dynamic = "force-static";

/** The OpenAPI 3.1 document. */
export function GET() {
  return Response.json(openApiDocument(), { headers: { "cache-control": "public, max-age=300" } });
}
