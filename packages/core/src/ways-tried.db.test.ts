// Which ways have worked in a Trial Workspace, against the real database (spec 0021, ticket 6): nothing for a new
// trial, then each way once a value really came by it. Owners only.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { waysTried } from "./what-works-here";

const made: { workspaces: string[]; people: string[] } = { workspaces: [], people: [] };
afterEach(async () => {
  delete process.env.ZIFFR_TRIAL_DAYS;
  for (const id of made.workspaces.splice(0)) {
    await db().from("breakdown_rows").delete().eq("workspace_id", id);
    await db().from("observations").delete().eq("workspace_id", id);
    await db().from("access_keys").delete().eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
  }
  if (made.people.length) await db().from("profiles").delete().in("id", made.people.splice(0));
});

describe("ways tried", () => {
  it("are none in a new trial, then each one a real value came by", async () => {
    process.env.ZIFFR_TRIAL_DAYS = "7";
    const owner = `t-${randomUUID()}`;
    made.people.push(owner);
    await db().from("profiles").insert({ id: owner, name: "Owner", role: "", color: "#000", email: `o-${owner.slice(2, 10)}@example.test` });
    const ws = await createWorkspace(owner, "Trial");
    made.workspaces.push(ws);
    const actor = { personId: owner, workspaceId: ws, role: "owner" as const };
    expect(Object.values(await waysTried(actor)).some(Boolean)).toBe(false);

    const { data: m } = await db().from("metrics").select("id").eq("workspace_id", ws).single(); // the Test Metric, its name is sealed
    const add = (row: Record<string, unknown>) => db().from("observations").insert({ metric_id: m!.id, period_start: "2026-11-01", value: 1, submitter_id: owner, workspace_id: ws, ...row });
    await add({ source: "mail" });
    await add({ source: "web_form" });
    const { data: key } = await db().from("access_keys").insert({ workspace_id: ws, created_by: owner, name: "k", prefix: randomUUID().slice(0, 12), secret_hash: randomUUID(), scopes: ["metrics:read"], expires_on: "2026-12-01" }).select("id").single();
    await add({ source: "api", access_key_id: key!.id });
    const tried = await waysTried(actor);
    expect(tried).toMatchObject({ email: true, "web-form": true, api: true, mcp: true, slack: false, telegram: false, feeds: false, "email-replies": false });
    // Only the Owner is told; it counts every value of the workspace.
    expect(Object.values(await waysTried({ ...actor, role: "member" })).some(Boolean)).toBe(false);
  });
});
