// PUT /api/cloud/v1/workspaces/{id}/limit (spec 0029, ticket #267): Ziffr Cloud sets a Workspace's limit (`metrics`,
// or null to fall back to the Installation's default), the name to show and an optional coming change. Checked with
// zod, plain text only, at most 4 KB. Answers the Workspace as GET does.
import { z } from "zod";
import { setCloudLimit } from "@ziffr/core/cloud-api";
import { LABEL_MAX, LIMIT_MAX } from "@ziffr/core/workspace-limits";
import { cloudJson, cloudRoute } from "@/lib/cloud-route";

type Ctx = { params: Promise<{ id: string }> };

const label = z.string().trim().min(1).max(LABEL_MAX).regex(/^[^\u0000-\u001f\u007f<>]+$/, "Plain text only.");
const Body = z.object({
  metrics: z.number().int().min(1).max(LIMIT_MAX).nullable(),
  label: label.nullable().optional(),
  next: z.object({ label, on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().nullable().optional(),
}).strict();

/** Sets one Workspace's limit. */
export const PUT = cloudRoute(async (caller, body, _req, ctx: Ctx) => {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return cloudJson({ error: { code: "invalid_request", message: "The body is not valid JSON." } }, 400); }
  return cloudJson(await setCloudLimit(caller, (await ctx.params).id, Body.parse(parsed)));
});
