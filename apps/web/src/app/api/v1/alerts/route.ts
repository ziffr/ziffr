// /api/v1/alerts (spec 0032, GLOSSARY: Alert). GET: the key's creator's own Alerts they can still see (scope
// metrics:read). POST: makes one for the creator on a Metric they see (scopes alerts:write and metrics:read, since it answers with the Metric). Never anyone else's.
import { AlertRefused, createAlertWithKey, listAlertsWithKey } from "@ziffr/core/api-alerts";
import { scopeRefusal } from "@ziffr/core/actor";
import { apiError, errorBody, json, jsonBody, keyRoute, query } from "@/lib/api";
import { alertsQuery, AlertList, ApiAlert, CreateAlert } from "../schemas";

/** Lists the creator's own Alerts, newest first. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { metric } = alertsQuery.parse(query(req));
  return json(AlertList.parse({ items: await listAlertsWithKey(actor, { metric }) }));
});

/** Makes an Alert. 201 with it; 422 with the words when a limit or the Metric forbids it; 404 for a Metric not seen. */
export const POST = keyRoute("alerts:write", async (actor, req) => {
  if (!actor.key.scopes.includes("metrics:read")) return apiError("forbidden", scopeRefusal("metrics:read"));
  const input = CreateAlert.parse(await jsonBody(req));
  try {
    return json(ApiAlert.parse(await createAlertWithKey(actor, input)), 201);
  } catch (e) {
    if (e instanceof AlertRefused) { const { status, body } = errorBody("unprocessable", e.message); return json(body, status); }
    throw e;
  }
});
