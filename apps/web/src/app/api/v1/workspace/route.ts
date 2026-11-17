// GET /api/v1/workspace (spec 0017; GLOSSARY: Fiscal Year): the month the workspace's year starts in, so a program
// knows where its quarters and years begin. Scope metrics:read; every member may read it, and it holds nothing else.
import { workspaceYearStart } from "@ziffr/core/fiscal-year";
import { json, keyRoute } from "@/lib/api";
import { ApiWorkspace } from "../schemas";

/** The workspace's year start. */
export const GET = keyRoute("metrics:read", async (actor) => json(ApiWorkspace.parse({ year_start_month: await workspaceYearStart(actor) })));
