// Workflows for programs against the database (ticket #433; GLOSSARY: Workflow, Approver, Tell, Access Key): each call
// needs its scope, acts only for the key's creator and only on their own Workflows (another person's, or another
// Workspace's, is not there), and who approves or who is told is chosen only by a program's key with its own scope,
// never an assistant's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { actorForSecret, checkKeyRequest, createAccessKey } from "./access-keys";
import { Forbidden, type KeyActor, type Scope } from "./actor";
import { createWorkflowWithKey, deleteWorkflowWithKey, getWorkflowWithKey, updateWorkflowWithKey, WorkflowRefused } from "./api-workflows";
import { requestedScopes } from "./assistant-connections";
import { db } from "./db";
import { workspace } from "./test/db-fixtures";
import { saveWorkflow } from "./workflows";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c().catch(() => {}); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
type W = Awaited<ReturnType<typeof workspace>>;

async function keyOf(w: W, person: string, role: "owner" | "admin" | "member", scopes: Scope[]): Promise<KeyActor> {
  const { secret } = await createAccessKey(w.actor(person, role), { name: "Program", scopes, expiresOn: inDays(30) });
  return (await actorForSecret(secret)) as KeyActor;
}
const WRITE: Scope[] = ["metrics:read", "workflows:write"];
const PEOPLE: Scope[] = [...WRITE, "workflows:people"];

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member"); const ada = await w.person("admin"); const guest = await w.person("guest");
  return { w, sara, ann, ada, guest };
}

describe("making, reading, changing and deleting a Workflow with a key", () => {
  it("does what the editor does, for the creator only, and names the key in the history", async () => {
    const { w, sara, ann } = await setup();
    const key = await keyOf(w, sara, "owner", WRITE);
    const made = await createWorkflowWithKey(key, { name: "  Weekly close ", due_working_days: 2, steps: [{ type: "remind", days_before: 1 }, { type: "check", change_pct: 20, outside_target: true }, { type: "publish", lock: true }] });
    expect(made).toMatchObject({ name: "Weekly close", due_working_days: 2, lock_summary: false, metrics: 0, steps: [{ type: "remind", days_before: 1 }, { type: "check", change_pct: 20, outside_target: true }, { type: "publish", lock: true }] });
    expect((await db().from("workflows").select("owner_id").eq("id", made.id).single()).data?.owner_id).toBe(sara);
    // The editor's own cleaning: a publish step is always there, and last.
    expect((await createWorkflowWithKey(key, { name: "Bare" })).steps).toEqual([{ type: "publish", lock: false }]);
    const changed = await updateWorkflowWithKey(key, made.id, { due_working_days: 5, lock_summary: true });
    expect(changed).toMatchObject({ name: "Weekly close", due_working_days: 5, lock_summary: true, steps: made.steps });
    expect(await getWorkflowWithKey(key, made.id)).toEqual(changed);
    // Somebody else's Workflow is not there for them: not read, not changed, not deleted.
    const anns = await keyOf(w, ann, "member", PEOPLE);
    await expect(getWorkflowWithKey(anns, made.id)).rejects.toBeInstanceOf(Forbidden);
    await expect(updateWorkflowWithKey(anns, made.id, { name: "Mine now" })).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteWorkflowWithKey(anns, made.id)).rejects.toBeInstanceOf(Forbidden);
    expect((await db().from("workflows").select("name").eq("id", made.id).single()).data?.name).toBe("Weekly close");
    await deleteWorkflowWithKey(key, made.id);
    expect((await db().from("workflows").select("id").eq("id", made.id)).data).toEqual([]);
  });

  it("needs its scope, a role that may create, and nothing from another Workspace", async () => {
    const { w, sara, guest } = await setup();
    await expect(createWorkflowWithKey(await keyOf(w, sara, "owner", ["metrics:read"]), { name: "X" })).rejects.toThrow(/Build workflows/);
    const own = await saveWorkflow(w.actor(sara), null, "Mine", { dueWorkingDays: 1, steps: [{ type: "publish", lock: false }] });
    await expect(updateWorkflowWithKey(await keyOf(w, sara, "owner", ["metrics:read"]), own, { name: "Y" })).rejects.toThrow(/Build workflows/);
    await expect(deleteWorkflowWithKey(await keyOf(w, sara, "owner", ["metrics:read"]), own)).rejects.toThrow(/Build workflows/);
    await expect(getWorkflowWithKey(await keyOf(w, sara, "owner", ["workflows:write"]), own)).rejects.toThrow(/Read metrics/);
    // A Guest creates nothing, so no key of theirs holds the scope.
    expect(() => checkKeyRequest(w.actor(guest, "guest"), ["workflows:write"], inDays(30))).toThrow(/cannot build Workflows/);
    expect(() => checkKeyRequest(w.actor(sara), ["workflows:people"], inDays(30))).toThrow(/needs Build workflows/);
    const other = await workspace(); cleanups.push(other.cleanup);
    const eve = await other.person("owner");
    const eves = await keyOf(other, eve, "owner", PEOPLE);
    await expect(getWorkflowWithKey(eves, own)).rejects.toBeInstanceOf(Forbidden);
    await expect(updateWorkflowWithKey(eves, own, { name: "Z" })).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteWorkflowWithKey(eves, own)).rejects.toBeInstanceOf(Forbidden);
  });

  it("refuses a step that cannot be, in words", async () => {
    const { w, sara } = await setup();
    const key = await keyOf(w, sara, "owner", PEOPLE);
    await expect(createWorkflowWithKey(key, { name: "T", steps: [{ type: "tell", condition: { kind: "at_or_above", value: "abc" }, people: [], groups: [] }, { type: "publish", lock: false }] })).rejects.toBeInstanceOf(WorkflowRefused);
    // An Approver who is not a member of this Workspace is refused, not dropped without a word.
    await expect(createWorkflowWithKey(key, { name: "A", steps: [{ type: "approve", approvers: ["00000000-0000-4000-8000-000000000000"], values: "every", nobody_else: "count" }] })).rejects.toThrow(/members of this Workspace/);
  });
});

describe("who approves and who is told", () => {
  it("is chosen only with workflows:people; without it the Approve and Tell steps stay exactly as stored", async () => {
    const { w, sara, ada, ann } = await setup();
    const plain = await keyOf(w, sara, "owner", WRITE);
    const asked = { type: "approve" as const, approvers: [ada], values: "every" as const, nobody_else: "count" as const };
    // Not when making one, not even a Tell step.
    await expect(createWorkflowWithKey(plain, { name: "A", steps: [asked] })).rejects.toThrow(/cannot choose who approves/);
    await expect(createWorkflowWithKey(plain, { name: "A", steps: [{ type: "tell", condition: { kind: "below", value: "5" }, people: [ann], groups: [] }] })).rejects.toThrow(/cannot choose who approves/);
    expect((await db().from("workflows").select("id").eq("owner_id", sara).eq("name", "A")).data).toEqual([]);
    const programs = await keyOf(w, sara, "owner", PEOPLE);
    const made = await createWorkflowWithKey(programs, { name: "Close", steps: [{ type: "check", change_pct: 10, outside_target: false }, asked, { type: "tell", condition: { kind: "below", value: "5" }, people: [ann], groups: [] }, { type: "publish", lock: false }] });
    expect(made.steps.find((s) => s.type === "approve")).toEqual(asked);
    const tell = made.steps.find((s) => s.type === "tell");
    expect(tell).toMatchObject({ id: expect.any(String), people: [ann] });
    // Without the scope: other steps change, and the Approve and Tell steps may be sent back as read, nothing else of them.
    const check = { type: "check" as const, change_pct: 30, outside_target: false };
    const changed = await updateWorkflowWithKey(plain, made.id, { steps: [check, asked, tell!, { type: "publish", lock: true }] });
    expect(changed.steps.map((s) => s.type)).toEqual(["check", "approve", "tell", "publish"]);
    expect(changed.steps[0]).toMatchObject({ change_pct: 30 });
    const refused = /cannot choose who approves/;
    await expect(updateWorkflowWithKey(plain, made.id, { steps: [check, { ...asked, approvers: [sara] }, tell!, { type: "publish", lock: true }] })).rejects.toThrow(refused);
    await expect(updateWorkflowWithKey(plain, made.id, { steps: [check, asked, { type: "publish", lock: true }] })).rejects.toThrow(refused);
    await expect(updateWorkflowWithKey(plain, made.id, { steps: [{ type: "publish", lock: true }] })).rejects.toThrow(refused);
    await expect(updateWorkflowWithKey(plain, made.id, { steps: [check, asked, { ...tell!, people: [] } as never, { type: "publish", lock: true }] })).rejects.toThrow(refused);
    // Parts left out change nothing of them; and deleting one that holds an Approval gate needs the scope too.
    expect((await updateWorkflowWithKey(plain, made.id, { name: "Renamed" })).steps).toEqual(changed.steps);
    await expect(deleteWorkflowWithKey(plain, made.id)).rejects.toThrow(/cannot delete a Workflow that has an Approve/);
    expect((await updateWorkflowWithKey(programs, made.id, { steps: [{ ...asked, approvers: [sara] }, { type: "publish", lock: false }] })).steps[0]).toMatchObject({ approvers: [sara] });
    await deleteWorkflowWithKey(programs, made.id);
    expect((await db().from("workflows").select("id").eq("id", made.id)).data).toEqual([]);
  });

  it("is never offered to an assistant, never granted to one, and the database refuses it", async () => {
    const { w, sara } = await setup();
    expect(requestedScopes("workflows:write workflows:people metrics:read")).toEqual(["metrics:read", "workflows:write"]);
    expect(() => checkKeyRequest(w.actor(sara), ["workflows:write", "workflows:people"], inDays(30), { assistant: true })).toThrow(/cannot be allowed to approve/);
    expect(checkKeyRequest(w.actor(sara), ["workflows:write"], inDays(30), { assistant: true }).scopes).toEqual(["workflows:write"]);
    // A key made for an assistant never holds the scope: the database refuses it, and the core checks the key's kind.
    const key = await keyOf(w, sara, "owner", PEOPLE);
    const client = "zc_" + "B".repeat(22);
    await db().from("oauth_clients").insert({ id: client, name: "Assistant", redirect_uris: ["https://assistant.example.test/cb"] });
    cleanups.push(async () => { await db().from("access_keys").delete().eq("id", Number(key.key.id)); await db().from("oauth_clients").delete().eq("id", client); });
    const { error: held } = await db().from("access_keys").update({ kind: "assistant", oauth_client_id: client }).eq("id", Number(key.key.id));
    expect(held?.message).toMatch(/access_keys_assistant_never_approves/);
    const { error } = await db().from("access_keys").update({ kind: "assistant", oauth_client_id: client, scopes: WRITE }).eq("id", Number(key.key.id));
    expect(error).toBeNull();
    const { error: backstop } = await db().from("access_keys").update({ scopes: PEOPLE }).eq("id", Number(key.key.id));
    expect(backstop?.message).toMatch(/access_keys_assistant_never_approves/);
    // An assistant's key that somehow carried the scope in memory still names nobody: the key's kind is read from its row.
    const stale: KeyActor = { ...key, key: { ...key.key, scopes: PEOPLE } };
    await expect(createWorkflowWithKey(stale, { name: "Sneaky", steps: [{ type: "approve", approvers: [sara], values: "every", nobody_else: "count" }] })).rejects.toThrow(/cannot choose who approves/);
  });
});
