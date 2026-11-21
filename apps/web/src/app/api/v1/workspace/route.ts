// GET /api/v1/workspace (spec 0017; GLOSSARY: Fiscal Year, Number Style): the month the workspace's year starts in and how it
// writes numbers, so a program knows where its quarters and years begin and can show values as the app does. Scope
// metrics:read; every member may read it. Besides the year start and Number Style: the time zone, the hour Workflows ask
// at, the first day of the week and the ways the key's creator can be reached (ticket #614), so an assistant can set a
// schedule in their time without guessing. No account details.
import { workspaceYearStart } from "@ziffr/core/fiscal-year";
import { workspaceNumberStyle } from "@ziffr/core/workspace-settings";
import { workspaceReach } from "@ziffr/core/api-workspace";
import { json, keyRoute } from "@/lib/api";
import { ApiWorkspace } from "../schemas";

/** The workspace's year start and Number Style. */
export const GET = keyRoute("metrics:read", async (actor) => {
  const [yearStart, numberStyle, clock] = await Promise.all([workspaceYearStart(actor), workspaceNumberStyle(actor), workspaceReach(actor)]);
  return json(ApiWorkspace.parse({ year_start_month: yearStart, number_style: numberStyle.style, ...clock }));
});
