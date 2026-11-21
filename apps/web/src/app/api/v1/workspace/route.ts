// GET /api/v1/workspace (spec 0017; GLOSSARY: Fiscal Year, Number Style): the month the workspace's year starts in and how it
// writes numbers, so a program knows where its quarters and years begin and can show values as the app does. Scope
// metrics:read; every member may read it, and it holds nothing else.
import { workspaceYearStart } from "@ziffr/core/fiscal-year";
import { workspaceNumberStyle } from "@ziffr/core/workspace-settings";
import { json, keyRoute } from "@/lib/api";
import { ApiWorkspace } from "../schemas";

/** The workspace's year start and Number Style. */
export const GET = keyRoute("metrics:read", async (actor) => {
  const [yearStart, numberStyle] = await Promise.all([workspaceYearStart(actor), workspaceNumberStyle(actor)]);
  return json(ApiWorkspace.parse({ year_start_month: yearStart, number_style: numberStyle.style }));
});
