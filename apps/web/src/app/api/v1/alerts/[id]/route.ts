// PATCH and DELETE /api/v1/alerts/{id} (spec 0032, GLOSSARY: Alert): change or remove one of the key's creator's own
// Alerts (scope alerts:write). Another person's Alert, one on a Metric the creator cannot see, or a missing one is 404.
import { AlertRefused, deleteAlertWithKey, updateAlertWithKey } from "@ziffr/core/api-alerts";
import { errorBody, json, jsonBody, keyRoute } from "@/lib/api";
import { ApiAlert, idParam, RemovedAlert, UpdateAlert } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

const refused = (e: unknown): Response | null => {
  if (!(e instanceof AlertRefused)) return null;
  const { status, body } = errorBody("unprocessable", e.message);
  return json(body, status);
};

/** Changes an Alert. */
export const PATCH = keyRoute("alerts:write", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  const input = UpdateAlert.parse(await jsonBody(req));
  try {
    return json(ApiAlert.parse(await updateAlertWithKey(actor, id, input)));
  } catch (e) {
    const r = refused(e);
    if (r) return r;
    throw e;
  }
});

/** Removes an Alert. */
export const DELETE = keyRoute("alerts:write", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  try {
    await deleteAlertWithKey(actor, id);
    return json(RemovedAlert.parse({ removed: id }));
  } catch (e) {
    const r = refused(e);
    if (r) return r;
    throw e;
  }
});
