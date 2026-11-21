// /api/v1/shares (ticket #434, GLOSSARY: Share). GET: who can see a Metric, dashboard or deck the key's creator sees, and why.
// POST: shares one the creator owns with a member or a Group, or takes the Share away. Scope shares:write, only a
// program's own Access Key (never an assistant's), the same rules as the app.
import { shareWithKey, whoCanSeeWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, query, sensitiveRoute } from "@/lib/api";
import { Audience, SetShare, ShareSet, sharesQuery } from "../schemas";

/** Who can see it and why. A thing the creator cannot see is not found. */
export const GET = sensitiveRoute("shares:write", async (actor, req) => {
  const q = sharesQuery.parse(query(req));
  const ref = q.type === "metric" ? q.id : /^\d{1,10}$/.test(q.id) ? Number(q.id) : undefined;
  return json(Audience.parse(await whoCanSeeWithKey(actor, q.type, ref)));
});

/** Sets or removes one Share. */
export const POST = sensitiveRoute("shares:write", async (actor, req) => {
  const input = SetShare.parse(await jsonBody(req));
  return json(ShareSet.parse(await shareWithKey(actor, input)));
});
