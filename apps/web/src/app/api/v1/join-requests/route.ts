// GET /api/v1/join-requests (ticket #434): the open requests to join by the workspace's domain, with the address each
// person proved. Scope people:write, only a program's own Access Key; Owners and Admins only.
import { listJoinRequestsWithKey } from "@ziffr/core/api-sharing";
import { json, sensitiveRoute } from "@/lib/api";
import { JoinRequestList } from "../schemas";

/** The open requests. */
export const GET = sensitiveRoute("people:write", async (actor) => json(JoinRequestList.parse({ items: await listJoinRequestsWithKey(actor) })));
