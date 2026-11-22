"use server";
// Opening a Workspace that an import made (spec 0040, ticket 9): switches to it, as switching to any of one's own.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, personFor, sessionUser } from "@/lib/auth";
import { importStatus } from "@ziffr/core/workspace-import";
import { isMemberOf } from "@ziffr/core/page-data";
import { WORKSPACE_COOKIE } from "@/lib/viewer";

/** Makes the Workspace of a finished import the one being looked at, then opens it. */
export async function openImported(form: FormData) {
  const user = await sessionUser();
  if (!user) redirect("/login");
  const person = await personFor(user);
  const job = await importStatus(person, String(form.get("id") ?? ""));
  // Only one's own finished import, and only while one is still in the Workspace.
  if (!job || job.status !== "done" || !job.workspaceId || !(await isMemberOf(person, job.workspaceId))) redirect("/welcome");
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, job.workspaceId, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.delete(DEMO_COOKIE);
  redirect("/");
}
