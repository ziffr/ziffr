// /api/v1/alerts (spec 0032, GLOSSARY: Alert). GET: the key's creator's own Alerts they can still see (scope
// metrics:read). POST: makes one for the creator on a Metric they see (scope alerts:write). Never anyone else's.
import { AlertRefused, createAlertWithKey, listAlertsWithKey } from "@ziffr/core/api-alerts";
import { errorBody, json, jsonBody, keyRoute, query } from "@/lib/api";
import { alertsQuery, AlertList, ApiAlert, CreateAlert } from "../schemas";

/** Lists the creator's own Alerts, newest first. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { metric } = alertsQuery.parse(query(req));
  return json(AlertList.parse({ items: await listAlertsWithKey(actor, { metric }) }));
});

/** Makes an Alert. 201 with it; 422 with the words when a limit or the Metric forbids it; 404 for a Metric not seen. */
export const POST = keyRoute("alerts:write", async (actor, req) => {
  const input = CreateAlert.parse(await jsonBody(req));
  try {
    return json(ApiAlert.parse(await createAlertWithKey(actor, input)), 201);
  } catch (e) {
    if (e instanceof AlertRefused) { const { status, body } = errorBody("unprocessable", e.message); return json(body, status); }
    throw e;
  }
});
