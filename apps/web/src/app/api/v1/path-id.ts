// The id in the path of a route under /api/v1 (tickets #435): validated as every id is, so a bad one is a 400.
import { idParam } from "./schemas";

/** The context Next.js hands a route whose folder is `[id]`. */
export type IdCtx = { params: Promise<{ id: string }> };

/** The id from the path, or a ZodError the API answers as 400. */
export async function pathId(ctx: IdCtx): Promise<number> {
  return idParam.parse((await ctx.params).id);
}
