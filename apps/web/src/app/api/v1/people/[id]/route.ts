// PATCH and DELETE /api/v1/people/{id} (ticket #434, GLOSSARY: Workspace Role, Contact): change a member's role, or
// remove a Contact or a member (handing over what they own). Scope people:write, only a program's own Access Key;
// Owners and Admins only, and only Owners make or remove Owners, as in the app.
import { removePersonWithKey, setRoleWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, query, sensitiveRoute } from "@/lib/api";
import { ChangeRole, personIdParam, removePersonQuery, RemovedPerson, RoleChanged } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Changes a member's Workspace Role. */
export const PATCH = sensitiveRoute("people:write", async (actor, req, ctx: Ctx) => {
  const id = personIdParam.parse((await ctx.params).id);
  const { role } = ChangeRole.parse(await jsonBody(req));
  return json(RoleChanged.parse(await setRoleWithKey(actor, id, role)));
});

/** Removes a Contact, or a member with `successor` taking over what they own. */
export const DELETE = sensitiveRoute("people:write", async (actor, req, ctx: Ctx) => {
  const id = personIdParam.parse((await ctx.params).id);
  const { successor } = removePersonQuery.parse(query(req));
  return json(RemovedPerson.parse(await removePersonWithKey(actor, id, successor ?? null)));
});
