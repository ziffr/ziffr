// GET /api/v1/templates (spec 0014): what a key can build with: built-in views, the team's Widget Templates and the
// Dashboard Templates, with their Slots and suggested Metrics the key's creator sees (scope dashboards:read).
import { listTemplatesWithKey } from "@ziffr/core/api-dashboards";
import { json, keyRoute, query } from "@/lib/api";
import { TemplateList, templatesQuery } from "../schemas";

/** Lists the templates. */
export const GET = keyRoute("dashboards:read", async (actor, req) => {
  const { kind } = templatesQuery.parse(query(req));
  return json(TemplateList.parse({ items: await listTemplatesWithKey(actor, kind) }));
});
