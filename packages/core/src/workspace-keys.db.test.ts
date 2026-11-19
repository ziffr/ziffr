// Workspace Keys against the real database (spec 0028, ticket #245): a key for every new Workspace, stored only
// wrapped, one first version however many processes race, none for the demo, opened again after the Installation's
// key changes, and refused rather than replaced when it cannot be unwrapped.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { ensureWorkspaceKey, forgetWorkspaceKey, installationKeyFingerprint, workspaceCipher } from "./workspace-keys";

const installationKey = Buffer.alloc(32, 41);
const newInstallationKey = Buffer.alloc(32, 42);
const at = { table: "thread_messages", column: "body", row: 7 };
const made: { workspaces: string[]; people: string[] } = { workspaces: [], people: [] };
const saved = { current: process.env.ZIFFR_SECRETS_KEY, previous: process.env.ZIFFR_SECRETS_KEY_PREVIOUS };

beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = installationKey.toString("base64");
  delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
});
afterEach(async () => {
  for (const [k, v] of [["ZIFFR_SECRETS_KEY", saved.current], ["ZIFFR_SECRETS_KEY_PREVIOUS", saved.previous]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const id of made.workspaces) forgetWorkspaceKey(id);
  if (made.workspaces.length) await db().from("workspaces").delete().in("id", made.workspaces.splice(0));
  if (made.people.length) await db().from("profiles").delete().in("id", made.people.splice(0));
}, 60_000);

/** A bare Workspace row with no key yet, as every Workspace made before the upgrade is. */
async function bareWorkspace() {
  const id = randomUUID();
  made.workspaces.push(id);
  const { error } = await db().from("workspaces").insert({ id, name: "Keys test" });
  if (error) throw error;
  return id;
}

async function keysOf(workspaceId: string) {
  const { data } = await db().from("workspace_keys").select("*").eq("workspace_id", workspaceId).order("version");
  return data ?? [];
}

describe("a key for every new Workspace", () => {
  it("is made with the Workspace, wrapped under the Installation's key, never in clear", async () => {
    const person = `t-${randomUUID()}`;
    made.people.push(person);
    await db().from("profiles").insert({ id: person, name: "Owner", role: "", color: "#000" });
    const id = await createWorkspace(person, "Encrypted from the start");
    made.workspaces.push(id);
    const rows = await keysOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 1, wrapper: "installation", wrapped_under: installationKeyFingerprint(installationKey), retired_at: null });
    expect(rows[0].wrapped).toMatch(/^k1\./);
    // What it seals opens with it, and the row holds no clear text.
    const cipher = await workspaceCipher(id);
    expect(cipher.sealing).toBe(true);
    const sealed = cipher.seal(at, "Margin fell because of the Hamburg depot");
    expect(sealed).not.toContain("Hamburg");
    forgetWorkspaceKey(id);
    expect((await workspaceCipher(id)).open(at, sealed)).toBe("Margin fell because of the Hamburg depot");
  });

  it("is made once, also when several processes ask at the same time", async () => {
    const id = await bareWorkspace();
    const results = await Promise.all(Array.from({ length: 6 }, () => ensureWorkspaceKey(id)));
    expect(results.every(Boolean)).toBe(true);
    expect(await keysOf(id)).toHaveLength(1);
    const { data } = await db().from("workspaces").select("keyed_at").eq("id", id).single();
    expect(data?.keyed_at).not.toBeNull();
    expect(await ensureWorkspaceKey(id)).toBe(true);
    expect(await keysOf(id)).toHaveLength(1);
  });

  it("is made when a Workspace from before the upgrade first seals something", async () => {
    const id = await bareWorkspace();
    expect(await keysOf(id)).toHaveLength(0);
    const cipher = await workspaceCipher(id);
    expect(cipher.sealing).toBe(true);
    expect(await keysOf(id)).toHaveLength(1);
    // Rows written before stay readable as they are.
    expect(cipher.open(at, "written before the upgrade")).toBe("written before the upgrade");
  });

  it("is never made for the demo, whose data is made up and public", async () => {
    expect(await ensureWorkspaceKey(DEMO_WORKSPACE_ID)).toBe(false);
    const cipher = await workspaceCipher(DEMO_WORKSPACE_ID);
    expect(cipher.sealing).toBe(false);
    expect(cipher.seal(at, "Northwind")).toBe("Northwind");
    expect(await keysOf(DEMO_WORKSPACE_ID)).toHaveLength(0);
    const { error } = await db().from("workspace_keys").insert({ workspace_id: DEMO_WORKSPACE_ID, version: 1, wrapped: "k1.x", wrapper: "installation" });
    expect(error).not.toBeNull();
  });

  it("is not made on an Installation without ZIFFR_SECRETS_KEY, which keeps working in clear", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    const id = await bareWorkspace();
    expect(await ensureWorkspaceKey(id)).toBe(false);
    const cipher = await workspaceCipher(id);
    expect(cipher.sealing).toBe(false);
    expect(cipher.seal(at, "plain")).toBe("plain");
    expect(await keysOf(id)).toHaveLength(0);
    // Once the key is set, the next use makes one.
    process.env.ZIFFR_SECRETS_KEY = installationKey.toString("base64");
    expect((await workspaceCipher(id)).sealing).toBe(true);
    expect(await keysOf(id)).toHaveLength(1);
  });
});

describe("a Workspace's sealed values", () => {
  it("do not open in another Workspace", async () => {
    const a = await bareWorkspace();
    const b = await bareWorkspace();
    const sealed = (await workspaceCipher(a)).seal(at, "only for a");
    expect((await workspaceCipher(b)).open(at, sealed)).toBeNull();
    expect((await workspaceCipher(a)).open(at, sealed)).toBe("only for a");
  });

  it("have blind indexes that match within the Workspace and differ across Workspaces", async () => {
    const a = await workspaceCipher(await bareWorkspace());
    const b = await workspaceCipher(await bareWorkspace());
    expect(a.blindIndex("contacts.email", "Ana@Example.com")).toBe(a.blindIndex("contacts.email", "ana@example.com"));
    expect(a.blindIndex("contacts.email", "ana@example.com")).not.toBe(b.blindIndex("contacts.email", "ana@example.com"));
  });

  it("no longer open once the key is gone, and no new key takes its place, while other Workspaces' still open", async () => {
    const gone = await bareWorkspace();
    const kept = await bareWorkspace();
    (await workspaceCipher(gone)).seal(at, "will be unreadable");
    const sealedKept = (await workspaceCipher(kept)).seal(at, "still readable");
    await db().from("workspace_keys").delete().eq("workspace_id", gone);
    forgetWorkspaceKey(gone);
    forgetWorkspaceKey(kept);
    await expect(workspaceCipher(gone)).rejects.toThrow(/key is gone/);
    await expect(ensureWorkspaceKey(gone)).rejects.toThrow(/key is gone/);
    expect(await keysOf(gone)).toHaveLength(0);
    // Also without ZIFFR_SECRETS_KEY it is refused, not taken for a Workspace that never had a key.
    delete process.env.ZIFFR_SECRETS_KEY;
    await expect(workspaceCipher(gone)).rejects.toThrow(/key is gone/);
    process.env.ZIFFR_SECRETS_KEY = installationKey.toString("base64");
    expect((await workspaceCipher(kept)).open(at, sealedKept)).toBe("still readable");
  });

  it("are kept from the cache for this process until it is told to forget them", async () => {
    const id = await bareWorkspace();
    const first = await workspaceCipher(id);
    expect(await workspaceCipher(id)).toBe(first);
    forgetWorkspaceKey(id);
    expect(await workspaceCipher(id)).not.toBe(first);
  });
});

describe("changing the Installation's key (spec 0009)", () => {
  it("still opens every Workspace with ZIFFR_SECRETS_KEY_PREVIOUS set to the old key", async () => {
    const id = await bareWorkspace();
    const sealed = (await workspaceCipher(id)).seal(at, "sealed before the change");
    forgetWorkspaceKey(id);
    process.env.ZIFFR_SECRETS_KEY = newInstallationKey.toString("base64");
    process.env.ZIFFR_SECRETS_KEY_PREVIOUS = installationKey.toString("base64");
    const before = (await keysOf(id))[0];
    const cipher = await workspaceCipher(id);
    expect(cipher.open(at, sealed)).toBe("sealed before the change");
    // Opened with the previous key, the Workspace Key was wrapped again under the new one: the same key, so what it
    // sealed still opens once the previous key is gone.
    const rows = await keysOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].wrapped).not.toBe(before.wrapped);
    expect(rows[0].wrapped_under).toBe(installationKeyFingerprint(newInstallationKey));
    delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
    forgetWorkspaceKey(id);
    expect((await workspaceCipher(id)).open(at, sealed)).toBe("sealed before the change");
  });

  it("refuses, and makes no new key, when the key changed without ZIFFR_SECRETS_KEY_PREVIOUS", async () => {
    const id = await bareWorkspace();
    await workspaceCipher(id);
    const before = await keysOf(id);
    forgetWorkspaceKey(id);
    process.env.ZIFFR_SECRETS_KEY = newInstallationKey.toString("base64");
    await expect(workspaceCipher(id)).rejects.toThrow(/ZIFFR_SECRETS_KEY_PREVIOUS/);
    expect(await keysOf(id)).toEqual(before);
    // Losing the key altogether is refused the same way: nothing is written in clear in place of a sealed value.
    delete process.env.ZIFFR_SECRETS_KEY;
    await expect(workspaceCipher(id)).rejects.toThrow();
  });

  it("refuses a wrapped key moved to another Workspace or version", async () => {
    const a = await bareWorkspace();
    const b = await bareWorkspace();
    await ensureWorkspaceKey(a);
    const [row] = await keysOf(a);
    await db().from("workspace_keys").insert({ workspace_id: b, version: 1, wrapped: row.wrapped, wrapper: "installation", wrapped_under: row.wrapped_under });
    await expect(workspaceCipher(b)).rejects.toThrow(/cannot be unwrapped/);
    await db().from("workspace_keys").update({ retired_at: new Date().toISOString() }).eq("workspace_id", a);
    await db().from("workspace_keys").insert({ workspace_id: a, version: 2, wrapped: row.wrapped, wrapper: "installation", wrapped_under: row.wrapped_under });
    forgetWorkspaceKey(a);
    await expect(workspaceCipher(a)).rejects.toThrow(/cannot be unwrapped/);
  });
});

describe("the workspace_keys table", () => {
  it("holds one current version per Workspace", async () => {
    const id = await bareWorkspace();
    await ensureWorkspaceKey(id);
    const [row] = await keysOf(id);
    const { error } = await db().from("workspace_keys").insert({ workspace_id: id, version: 2, wrapped: row.wrapped, wrapper: "installation" });
    expect(error).not.toBeNull();
  });

  it("goes with its Workspace", async () => {
    const ws = await workspace();
    await ensureWorkspaceKey(ws.id);
    expect(await keysOf(ws.id)).toHaveLength(1);
    await ws.cleanup();
    expect(await keysOf(ws.id)).toHaveLength(0);
  });

  it("makes first keys only through the core: the public roles cannot call its function", async () => {
    if (!process.env.SUPABASE_ANON_KEY) return;
    const id = await bareWorkspace();
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anon.rpc("create_first_workspace_key", { p_workspace: id, p_wrapped: "k1.x", p_wrapper: "installation", p_under: null });
    expect(error).not.toBeNull();
    expect(await keysOf(id)).toHaveLength(0);
  });

  it("is closed to the public roles", async () => {
    if (!process.env.SUPABASE_ANON_KEY) return;
    const id = await bareWorkspace();
    await ensureWorkspaceKey(id);
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.from("workspace_keys").select("*").eq("workspace_id", id);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
