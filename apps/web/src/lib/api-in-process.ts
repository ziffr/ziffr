// The API called from inside the app (spec 0023, GLOSSARY: MCP Server, Access Key): a `fetch` that hands a request
// for /api/v1 to the route handler that answers it over HTTP, in the same process. The remote MCP Server gives this
// to its SDK client, so every tool still goes through the API's key check, limit and Access Log, without a second
// trip through the network or an internal address to configure. Only the endpoints for people's keys are here: a
// Feed's endpoints and the OpenAPI document are not tools.
import * as alerts from "@/app/api/v1/alerts/route";
import * as alert from "@/app/api/v1/alerts/[id]/route";
import * as dashboards from "@/app/api/v1/dashboards/route";
import * as dashboard from "@/app/api/v1/dashboards/[id]/route";
import * as findings from "@/app/api/v1/dashboards/[id]/findings/route";
import * as finding from "@/app/api/v1/dashboards/[id]/findings/[findingId]/route";
import * as widgets from "@/app/api/v1/dashboards/[id]/widgets/route";
import * as widget from "@/app/api/v1/dashboards/[id]/widgets/[widgetId]/route";
import * as fromTemplate from "@/app/api/v1/dashboards/from-template/route";
import * as feeds from "@/app/api/v1/feeds/route";
import * as groups from "@/app/api/v1/groups/route";
import * as metrics from "@/app/api/v1/metrics/route";
import * as metric from "@/app/api/v1/metrics/[slug]/route";
import * as archive from "@/app/api/v1/metrics/[slug]/archive/route";
import * as observations from "@/app/api/v1/metrics/[slug]/observations/route";
import * as projections from "@/app/api/v1/metrics/[slug]/projections/route";
import * as restore from "@/app/api/v1/metrics/[slug]/restore/route";
import * as submitters from "@/app/api/v1/metrics/[slug]/submitters/route";
import * as thread from "@/app/api/v1/metrics/[slug]/thread/route";
import * as targetSeries from "@/app/api/v1/metrics/[slug]/target-series/route";
import * as unusualValueCheck from "@/app/api/v1/metrics/[slug]/unusual-value-check/route";
import * as find from "@/app/api/v1/find/route";
import * as people from "@/app/api/v1/people/route";
import * as scheduleRoute from "@/app/api/v1/schedule/route";
import * as templates from "@/app/api/v1/templates/route";
import * as workflows from "@/app/api/v1/workflows/route";
import * as periodStatus from "@/app/api/v1/workflows/[id]/period-status/route";
import * as workspace from "@/app/api/v1/workspace/route";
import * as rest from "@/app/api/v1/[...rest]/route";
import { runFromMcp } from "@/lib/mcp-context";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", unknown>>;

/** The routes, as path patterns under /api/v1 (`[name]` is one segment), static ones before the ones they shadow. */
export const ROUTES: [pattern: string, module: RouteModule][] = [
  ["alerts", alerts],
  ["alerts/[id]", alert],
  ["dashboards", dashboards],
  ["dashboards/from-template", fromTemplate],
  ["dashboards/[id]", dashboard],
  ["dashboards/[id]/findings", findings],
  ["dashboards/[id]/findings/[findingId]", finding],
  ["dashboards/[id]/widgets", widgets],
  ["dashboards/[id]/widgets/[widgetId]", widget],
  ["feeds", feeds],
  ["groups", groups],
  ["metrics", metrics],
  ["metrics/[slug]", metric],
  ["metrics/[slug]/archive", archive],
  ["metrics/[slug]/observations", observations],
  ["metrics/[slug]/projections", projections],
  ["metrics/[slug]/restore", restore],
  ["metrics/[slug]/submitters", submitters],
  ["metrics/[slug]/target-series", targetSeries],
  ["metrics/[slug]/thread", thread],
  ["metrics/[slug]/unusual-value-check", unusualValueCheck],
  ["find", find],
  ["people", people],
  ["schedule", scheduleRoute],
  ["templates", templates],
  ["workflows", workflows],
  ["workflows/[id]/period-status", periodStatus],
  ["workspace", workspace],
];

/** Route folders under /api/v1 that are deliberately not reachable from inside: a Feed's own endpoints, the public
 * OpenAPI document and the catch-all. A test fails when a new route is in neither list. */
export const NOT_IN_PROCESS = ["feed", "feed/observations", "installation/usage", "openapi.json", "[...rest]"];

/** The handler and path parameters for a path under /api/v1, or null. Segments are matched as given, never decoded
 * into a pattern, so a crafted path cannot reach another route. */
export function matchRoute(path: string): { mod: RouteModule; params: Record<string, string> } | null {
  const segments = path.split("/");
  for (const [pattern, mod] of ROUTES) {
    const parts = pattern.split("/");
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; ok && i < parts.length; i++) {
      if (!parts[i].startsWith("[")) ok = parts[i] === segments[i];
      else if (!segments[i]) ok = false;
      else {
        // As Next does: a parameter is the segment decoded; one that cannot be decoded matches nothing.
        try { params[parts[i].slice(1, -1)] = decodeURIComponent(segments[i]); } catch { ok = false; }
      }
    }
    if (ok) return { mod, params };
  }
  return null;
}

const METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;

/** A `fetch` for the SDK that answers /api/v1 requests with the app's own route handlers. Anything else is refused
 * as a network error: the remote MCP Server reaches nothing outside the API. */
export const inProcessFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init);
  const m = /^\/api\/v1\/(.+)$/.exec(new URL(req.url).pathname);
  if (!m) throw new TypeError("Only the Ziffr API can be called from inside.");
  const method = METHODS.find((x) => x === req.method.toUpperCase());
  if (!method) throw new TypeError("Only GET, POST, PATCH and DELETE are used.");
  const found = matchRoute(m[1]);
  // A known path without the method is 405, as Next answers; an unknown path goes to the catch-all, which logs it.
  if (found && !found.mod[method]) return new Response(null, { status: 405 });
  const handler = (found ? found.mod[method] : rest[method]) as Handler;
  return runFromMcp(() => handler(req, { params: Promise.resolve(found?.params ?? {}) }));
};
