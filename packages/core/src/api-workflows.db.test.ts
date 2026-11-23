// Workflows for programs against the database (ticket #433; GLOSSARY: Workflow, Approver, Tell, Access Key): each call
// needs its scope, acts only for the key's creator and only on their own Workflows (another person's, or another
// Workspace's, is not there), and who approves or who is told is chosen only by a program's key with its own scope,
// never an assistant's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actorForSecret, checkKeyRequest, createAccessKey } from "./access-keys";
import { Forbidden, type KeyActor, type Scope } from "./actor";
import { createWorkflowWithKey, deleteWorkflowWithKey, getWorkflowWithKey, updateWorkflowWithKey, WorkflowRefused } from "./api-workflows";
import { requestedScopes } from "./assistant-connections";
import { db } from "./db";
import { mailHostResolver } from "./mail-hosts";
import { createWebhook } from "./webhooks";
import { workspace } from "./test/db-fixtures";
import { saveWorkflow } from "./workflows";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
const saved = process.env.ZIFFR_SECRETS_KEY;
const realLookup = mailHostResolver.lookup;
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 81).toString("base64");
  mailHostResolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved; for (const c of cleanups.splice(0)) await c().catch(() => {}); });
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
    expect(changed).toMatchObject({ name: "Weekly close", due_working_days: 5, lock_summary: true, asking: null, steps: made.steps });
    expect(await getWorkflowWithKey(key, made.id)).toEqual(changed);
    // The Asking Schedule: set, kept when something else changes, cleared with null, and refused when it makes no sense.
    const asking = { hour: 14, days: { kind: "chosen_weekdays" as const, days: [1, 4] } };
    expect((await updateWorkflowWithKey(key, made.id, { asking })).asking).toEqual(asking);
    expect((await updateWorkflowWithKey(key, made.id, { name: "Weekly close" })).asking).toEqual(asking);
    await expect(updateWorkflowWithKey(key, made.id, { asking: { hour: 25, days: { kind: "every_day" } } })).rejects.toBeInstanceOf(WorkflowRefused);
    expect((await getWorkflowWithKey(key, made.id)).asking).toEqual(asking);
    expect((await updateWorkflowWithKey(key, made.id, { asking: null })).asking).toBeNull();
    expect((await createWorkflowWithKey(key, { name: "Scheduled", asking: { hour: null, days: { kind: "every_n_days", n: 3, from: "2026-12-01" } } })).asking).toEqual({ hour: null, days: { kind: "every_n_days", n: 3, from: "2026-12-01" } });
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

  it("is checked again against the creator's role on every change", async () => {
    const { w, sara } = await setup();
    const key = await keyOf(w, sara, "owner", WRITE);
    const made = await createWorkflowWithKey(key, { name: "Mine" });
    const demoted: KeyActor = { ...key, role: "guest" };
    await expect(updateWorkflowWithKey(demoted, made.id, { name: "Still mine" })).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteWorkflowWithKey(demoted, made.id)).rejects.toBeInstanceOf(Forbidden);
    expect((await db().from("workflows").select("name").eq("id", made.id).single()).data?.name).toBe("Mine");
  });

  it("leaves the Webhooks of a Tell step as the editor set them, and cannot name any", async () => {
    const { w, sara, ann } = await setup();
    const hook = await createWebhook(w.actor(sara), { name: "Chat", url: "https://chat.example.test/hook", events: ["action.created"] });
    const other = await createWebhook(w.actor(sara), { name: "Other", url: "https://other.example.test/hook", events: ["action.created"] });
    const step = { type: "tell" as const, id: "tell-step-0001", condition: { kind: "below" as const, value: "5" }, people: [ann], groups: [], webhooks: [hook.id] };
    const id = await saveWorkflow(w.actor(sara), null, "Alerts", { dueWorkingDays: 1, steps: [step, { type: "publish", lock: false }] });
    const stored = async () => ((await db().from("workflows").select("config").eq("id", id).single()).data?.config as { steps: { type: string; webhooks?: string[] }[] }).steps.find((x) => x.type === "tell")?.webhooks;
    expect(await stored()).toEqual([hook.id]);
    // An Owner's key with every scope changes the Workflow and sends the Tell step back as read (the API has no Webhooks in it): they stay.
    const programs = await keyOf(w, sara, "owner", PEOPLE);
    const read = await getWorkflowWithKey(programs, id);
    expect(JSON.stringify(read)).not.toContain(hook.id);
    await updateWorkflowWithKey(programs, id, { due_working_days: 3, steps: read.steps });
    expect(await stored()).toEqual([hook.id]);
    // Naming a Webhook through the API is not possible: the schema has no such field and the core ignores one smuggled in.
    const smuggled = read.steps.map((x) => (x.type === "tell" ? { ...x, webhooks: [other.id] } : x)) as never;
    await updateWorkflowWithKey(programs, id, { steps: smuggled });
    expect(await stored()).toEqual([hook.id]);
    // A Tell step made through the API starts with none.
    const made = await createWorkflowWithKey(programs, { name: "New", steps: [{ type: "tell", condition: { kind: "below", value: "5" }, people: [ann], groups: [] }, { type: "publish", lock: false }] });
    expect(((await db().from("workflows").select("config").eq("id", made.id).single()).data?.config as { steps: { webhooks?: string[] }[] }).steps[0].webhooks).toBeUndefined();
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
  it("reads a Checklist Item with its words, and lets only workflows:people choose who it goes to", async () => {
    const { w, sara, ann } = await setup();
    const plain = await keyOf(w, sara, "owner", WRITE);
    const programs = await keyOf(w, sara, "owner", PEOPLE);
    const item = { type: "checklist" as const, kind: "info" as const, text: "Invoices must be in by Friday.", day: 2, people: [ann], groups: [] };
    const publish = { type: "publish" as const, lock: false };
    // Not when making one without the scope: it names people.
    await expect(createWorkflowWithKey(plain, { name: "C", steps: [item, publish] })).rejects.toThrow(/cannot choose who approves or who is told/);
    const made = await createWorkflowWithKey(programs, { name: "Close", steps: [item, publish] });
    const read = made.steps.find((s) => s.type === "checklist")!;
    expect(read).toEqual({ type: "checklist", id: expect.stringMatching(/^[A-Za-z0-9-]{8,40}$/), kind: "info", text: "Invoices must be in by Friday.", day: 2, people: [ann], groups: [] });
    expect(await getWorkflowWithKey(plain, made.id)).toEqual(made);
    // Without the scope: other steps change and the item may be sent back as read, nothing else of it.
    const refused = /cannot choose who approves or who is told/;
    expect((await updateWorkflowWithKey(plain, made.id, { due_working_days: 4, steps: [read, { type: "remind", days_before: 1 }, publish] })).steps.map((s) => s.type)).toEqual(["checklist", "remind", "publish"]);
    for (const steps of [[{ ...read, text: "Something else." }], [{ ...read, people: [ann, sara] }], [{ ...read, id: undefined }], [{ type: "remind" as const, days_before: 1 }]]) {
      await expect(updateWorkflowWithKey(plain, made.id, { steps: [...steps, publish] as never })).rejects.toThrow(refused);
    }
    await expect(deleteWorkflowWithKey(plain, made.id)).rejects.toThrow(/cannot delete a Workflow that has an Approve, Tell, checklist or Send Snapshot step/);
    // A person who is no member, or words that are too long, are refused in words.
    await expect(updateWorkflowWithKey(programs, made.id, { steps: [{ ...read, people: ["nobody"] }, publish] })).rejects.toThrow(/must be members/);
    await expect(updateWorkflowWithKey(programs, made.id, { steps: [{ ...read, text: "x".repeat(501) }, publish] })).rejects.toThrow(/at most 500/);
    expect((await updateWorkflowWithKey(programs, made.id, { steps: [{ ...read, text: "Now by Monday.", read_group: undefined }, publish] })).steps[0]).toMatchObject({ text: "Now by Monday.", id: read.id });
    await deleteWorkflowWithKey(programs, made.id);
  });

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
    // An Approve step that holds back only Unusual Values holds nothing without its check: that step stays.
    const unusual = await createWorkflowWithKey(programs, { name: "Unusual", steps: [check, { ...asked, values: "unusual" }, { type: "publish", lock: false }] });
    await expect(updateWorkflowWithKey(plain, unusual.id, { steps: [{ ...asked, values: "unusual" }, { type: "publish", lock: false }] })).rejects.toThrow(/check step stays/);
    expect((await updateWorkflowWithKey(plain, unusual.id, { steps: [{ ...check, change_pct: 50 }, { ...asked, values: "unusual" }, { type: "publish", lock: false }] })).steps[0]).toMatchObject({ change_pct: 50 });
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
    for (const scope of ["values:approve", "view-links:write", "usage:read", "workflows:people", "shares:write", "groups:write", "people:write"]) {
      const { error: refused } = await db().from("access_keys").update({ scopes: [scope] }).eq("id", Number(key.key.id));
      expect(refused?.message, scope).toMatch(/access_keys_assistant_never_approves/);
    }
    const { error: backstop } = await db().from("access_keys").update({ scopes: PEOPLE }).eq("id", Number(key.key.id));
    expect(backstop?.message).toMatch(/access_keys_assistant_never_approves/);
    // An assistant's key that somehow carried the scope in memory still names nobody: the key's kind is read from its row.
    const stale: KeyActor = { ...key, key: { ...key.key, scopes: PEOPLE } };
    await expect(createWorkflowWithKey(stale, { name: "Sneaky", steps: [{ type: "approve", approvers: [sara], values: "every", nobody_else: "count" }] })).rejects.toThrow(/cannot choose who approves/);
  });
});
