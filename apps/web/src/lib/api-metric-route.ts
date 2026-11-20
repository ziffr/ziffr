// The start every per-Metric API route shares (GLOSSARY: Metric, Access Key): a valid key with the scope, and the Metric's
// slug from the path, checked. The handler gets the slug; reading the Metric stays in the core, which says what the
// key's creator may see.
import type { KeyActor, Scope } from "@ziffr/core/actor";
import { keyRoute } from "@/lib/api";
import { slugParam } from "@/app/api/v1/schemas";

/** The context Next.js hands a route under /metrics/[slug]. */
type MetricCtx = { params: Promise<{ slug: string }> };

/** Wraps a handler for a route under /metrics/{slug}: key, scope and limit as keyRoute, then the slug, validated. */
export function metricRoute(scope: Scope, handler: (actor: KeyActor, req: Request, slug: string) => Promise<Response>) {
  return keyRoute(scope, async (actor, req, ctx: MetricCtx) => handler(actor, req, slugParam.parse((await ctx.params).slug)));
}
