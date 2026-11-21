// The re-encryption job against the real database (spec 0028, ticket #247): plain rows of the sealed columns are
// sealed in batches, again and again without harm, two jobs at once seal every row once, a row changed since it was read
// is not overwritten, a Contact's blind indexes are filled in, a collision is held back and never dropped, a value
// that does not open is counted apart and left alone, rows move to the newest key version, finished columns refuse
// plain values, and Installation Admins see progress and versions but never a key.
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { ALL_SEALED_COLUMNS, openRows } from "./sealed-columns";
import { SEALED_THINGS } from "./sealed-things";
import { installationAdmin, workspace } from "./test/db-fixtures";
import { sealCandidate, reencryptionJob } from "./workspace-key-job";
import { SEALED_LABELS } from "./sealed-labels";
import { keyProgress } from "./workspace-key-progress";
import { forgetWorkspaceKey, installationKeyWrapper, isSealed, sealedVersion, workspaceCipher } from "./workspace-keys";

const saved = process.env.ZIFFR_SECRETS_KEY;
const savedPrevious = process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 71).toString("base64"); delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS; });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
  if (savedPrevious === undefined) delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
  else process.env.ZIFFR_SECRETS_KEY_PREVIOUS = savedPrevious;
}, 120_000);

/** A Workspace of rows written in clear, as every Workspace is before the upgrade. */
async function plainWorkspace() {
  const w = await workspace("Job");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const owner = await w.person("owner");
  const ana = await w.person("member");
  const m = await w.metric(owner);
  const actions: number[] = [];
  for (let i = 0; i < 5; i++) actions.push(await w.action({ metric_id: m.id, period_start: "2026-10-01", asker_id: owner, assignee_id: ana, question: `Question ${i} about Hamburg` }));
  const messages: number[] = [];
  for (const a of actions) {
    const { data } = await db().from("thread_messages").insert({ action_id: a, author_id: ana, body: `Reply on ${a} about Hamburg`, workspace_id: w.id }).select("id").single();
    messages.push(data!.id as number);
  }
  const contact = await w.contact({ email: "Ada@Example.test", slack_handle: "@ada", phone: "+49 30 1" });
  await db().from("audit_events").insert({ workspace_id: w.id, actor_name: "Ana", kind: "metric.created", object_type: "metric", object_id: "1", object_name: "Hamburg visits", details: { note: "Hamburg" } });
  return { ...w, owner, ana, m, actions, messages, contactId: contact, newContact: w.contact };
}

/** An Installation Admin for the progress view. */
async function admin() {
  const a = await installationAdmin();
  cleanups.push(a.cleanup);
  return a;
}

const only = (w: { id: string }) => ({ only: [w.id] });
const body = async (id: number) => (await db().from("thread_messages").select("body").eq("id", id).single()).data!.body as string;
const progressOf = async (id: string, table: string, column: string) => (await db().from("workspace_seal_progress").select("plain, unopenable, held_back, done_at").eq("workspace_id", id).eq("table_name", table).eq("column_name", column).single()).data!;

describe("the re-encryption job", () => {
  it("seals every plain row, and a second run changes nothing", async () => {
    const w = await plainWorkspace();
    const first = await reencryptionJob({ ...only(w), batch: 2 });
    expect(first.keysMade).toBe(1);
    expect(first.rowsSealed).toBeGreaterThanOrEqual(5 + 5 + 1 + 1 + 1 + 1);
    expect(first.errors).toBe(0);
    for (const id of w.messages) expect(isSealed(await body(id))).toBe(true);
    const { data: c } = await db().from("contacts").select("email, slack_handle, phone, email_index, slack_index").eq("person_id", w.contactId).single();
    expect([c!.email, c!.slack_handle, c!.phone].every((v) => isSealed(v as string))).toBe(true);
    expect(c!.email_index).toMatch(/^b1\.1\./);
    expect(c!.slack_index).toMatch(/^b1\.1\./);
    const { data: p } = await db().from("profiles").select("name").eq("id", w.contactId).single();
    expect(isSealed(p!.name as string)).toBe(true);
    // Members' own names are theirs, across Workspaces: untouched.
    const { data: member } = await db().from("profiles").select("name").eq("id", w.ana).single();
    expect(isSealed(member!.name as string)).toBe(false);
    const { data: ev } = await db().from("audit_events").select("object_name, details").eq("workspace_id", w.id).single();
    expect(isSealed(ev!.object_name as string)).toBe(true);
    expect(isSealed((ev!.details as { sealed: string }).sealed)).toBe(true);
    // Read back as written.
    const cipher = await workspaceCipher(w.id);
    expect(cipher.open({ table: "thread_messages", column: "body", row: w.messages[0] }, await body(w.messages[0]))).toBe(`Reply on ${w.actions[0]} about Hamburg`);
    const again = await reencryptionJob(only(w));
    expect([again.rowsSealed, again.rowsMoved, again.errors]).toEqual([0, 0, 0]);
  });

  it("stops and starts at any time", async () => {
    const w = await plainWorkspace();
    const stopped = await reencryptionJob({ ...only(w), seconds: 0 });
    expect(stopped.stoppedEarly).toBe(true);
    const done = await reencryptionJob({ ...only(w), batch: 1 });
    expect(done.stoppedEarly).toBe(false);
    for (const id of w.messages) expect(isSealed(await body(id))).toBe(true);
  });

  it("run twice at once seals each row once", async () => {
    const w = await plainWorkspace();
    const [a, b] = await Promise.all([reencryptionJob({ ...only(w), batch: 1 }), reencryptionJob({ ...only(w), batch: 1 })]);
    expect(a.errors + b.errors).toBe(0);
    // Between them every row was sealed, none twice and none lost.
    expect(a.rowsSealed + b.rowsSealed).toBeGreaterThanOrEqual(5 + 5 + 1 + 1 + 1 + 1);
    expect(a.rowsSealed + b.rowsSealed).toBeLessThanOrEqual(5 + 5 + 1 + 1 + 1 + 1);
    const rows = await openRows("thread_messages", w.id, (await db().from("thread_messages").select("id, body").eq("workspace_id", w.id)).data);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => String(r.body).includes("about Hamburg"))).toBe(true);
    const raw = (await db().from("thread_messages").select("body").eq("workspace_id", w.id)).data!;
    expect(raw.every((r) => isSealed(r.body as string))).toBe(true);
  });

  it("does not overwrite a row that changed after it was read", async () => {
    const w = await plainWorkspace();
    await workspaceCipher(w.id);
    const { data } = await db().rpc("seal_candidates", { p_workspace: w.id, p_table: "thread_messages", p_current: 1, p_skip: [], p_limit: 10 });
    const read = (data as Record<string, unknown>[])[0];
    await db().from("thread_messages").update({ body: "Edited in the meantime" }).eq("id", Number(read.key));
    expect(await sealCandidate(await workspaceCipher(w.id), w.id, "thread_messages", read)).toBe("changed");
    expect(await body(Number(read.key))).toBe("Edited in the meantime");
  });

  it("holds back a Contact whose address another sealed Contact has, and drops nobody", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    // A plain row and a sealed one with one address, side by side: the old plain index does not see the sealed one.
    const twin = await w.newContact({ email: "ADA@example.test" });
    const run = await reencryptionJob(only(w));
    expect(run.heldBack).toBe(1);
    const { data } = await db().from("contacts").select("email").eq("person_id", twin).single();
    expect(isSealed(data!.email as string)).toBe(false);
    const { count } = await db().from("contacts").select("*", { count: "exact", head: true }).eq("workspace_id", w.id);
    expect(count).toBe(2);
    expect((await progressOf(w.id, "contacts", "email")).held_back).toBe(1);
  });

  it("counts a value that does not open apart from plain rows, and leaves it alone", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    // Another message's sealed text: in the format, but it opens nowhere else.
    const taken = await body(w.messages[0]);
    await db().from("thread_messages").update({ body: taken }).eq("id", w.messages[1]);
    // The daily check looks at the column once more.
    await db().from("workspace_seal_progress").update({ done_at: null }).eq("workspace_id", w.id);
    const run = await reencryptionJob(only(w));
    expect(await body(w.messages[1])).toBe(taken);
    expect(run.rowsSealed + run.rowsMoved).toBe(0);
    const row = await progressOf(w.id, "thread_messages", "body");
    expect([row.plain, row.unopenable]).toEqual([0, 1]);
  });

  it("moves rows under an older key version to the newest", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    expect(sealedVersion(await body(w.messages[0]))).toBe(1);
    const { wrapped, under } = await installationKeyWrapper().wrap(w.id, 2, randomBytes(32));
    await db().from("workspace_keys").update({ retired_at: new Date().toISOString() }).eq("workspace_id", w.id).eq("version", 1);
    await db().from("workspace_keys").insert({ workspace_id: w.id, version: 2, wrapped, wrapper: "installation", wrapped_under: under });
    forgetWorkspaceKey(w.id);
    const run = await reencryptionJob(only(w));
    expect(run.rowsMoved).toBeGreaterThanOrEqual(5);
    for (const id of w.messages) expect(sealedVersion(await body(id))).toBe(2);
    const cipher = await workspaceCipher(w.id);
    expect(cipher.open({ table: "thread_messages", column: "body", row: w.messages[0] }, await body(w.messages[0]))).toContain("about Hamburg");
    const { data: ev } = await db().from("audit_events").select("object_name").eq("workspace_id", w.id).single();
    expect(sealedVersion(ev!.object_name as string)).toBe(2);
    const { data: ci } = await db().from("contacts").select("email_index").eq("person_id", w.contactId).single();
    expect(ci!.email_index).toMatch(/^b1\.2\./);
  });

  it("makes a finished column refuse plain values, and seals them again", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    expect((await progressOf(w.id, "thread_messages", "body")).done_at).not.toBeNull();
    // Someone with database access plants clear text.
    await db().from("thread_messages").update({ body: "Planted in clear" }).eq("id", w.messages[0]);
    forgetWorkspaceKey(w.id);
    const [row] = await openRows("thread_messages", w.id, (await db().from("thread_messages").select("id, body").eq("id", w.messages[0])).data);
    expect(row.body).toBeNull();
    // The next pass finds it plain and seals it.
    await db().from("workspaces").update({ sealed_checked_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq("id", w.id);
    await reencryptionJob(only(w));
    forgetWorkspaceKey(w.id);
    const [fixed] = await openRows("thread_messages", w.id, (await db().from("thread_messages").select("id, body").eq("id", w.messages[0])).data);
    expect(fixed.body).toBe("Planted in clear");
  });

  it("is the only way the Audit Log changes, and only into sealed text", async () => {
    const w = await plainWorkspace();
    const { data: ev } = await db().from("audit_events").select("id").eq("workspace_id", w.id).single();
    expect((await db().from("audit_events").update({ object_name: "Rewritten" }).eq("id", ev!.id)).error).not.toBeNull();
    const plain = await db().rpc("seal_audit_event", { p_id: ev!.id, p_name_was: "Hamburg visits", p_name: "Rewritten in clear", p_details_was: { note: "Hamburg" }, p_details: { sealed: "nope" } });
    expect(plain.error).not.toBeNull();
    const { data: after } = await db().from("audit_events").select("object_name").eq("id", ev!.id).single();
    expect(after!.object_name).toBe("Hamburg visits");
  });

  it("lets the Audit Log change only to sealed text of a newer key version", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    const { data: ev } = await db().from("audit_events").select("id, object_name, details").eq("workspace_id", w.id).single();
    // Sealed already, at the same version: a different sealed value does not replace it, not even one that opens.
    const cipher = await workspaceCipher(w.id);
    const other = cipher.seal({ table: "audit_events", column: "object_name", row: String(ev!.id) }, "Rewritten history");
    const same = await db().rpc("seal_audit_event", { p_id: ev!.id, p_name_was: ev!.object_name, p_name: other, p_details_was: ev!.details, p_details: ev!.details });
    expect(same.error).not.toBeNull();
    // And the mark that allows the change cannot be set from outside the function.
    expect((await db().from("audit_events").update({ object_name: other }).eq("id", ev!.id)).error).not.toBeNull();
    const { data: after } = await db().from("audit_events").select("object_name").eq("id", ev!.id).single();
    expect(after!.object_name).toBe(ev!.object_name);
  });

  it("checks a big column over several runs, from where the last one stopped", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    await db().from("workspace_seal_progress").update({ done_at: null }).eq("workspace_id", w.id);
    // Every run may open only a few rows before its time is up: here no time at all after the sealing is done.
    let doneAt: string | null = null;
    for (let i = 0; i < 40 && !doneAt; i++) {
      await reencryptionJob({ ...only(w), seconds: 1 });
      doneAt = (await progressOf(w.id, "thread_messages", "body")).done_at as string | null;
    }
    expect(doneAt).not.toBeNull();
  });

  it("does not seal the name of a person who is a Contact of two Workspaces", async () => {
    const w = await plainWorkspace();
    const other = await plainWorkspace();
    const { error } = await db().from("contacts").insert({ workspace_id: other.id, person_id: w.contactId, email: "twin@example.test" });
    expect(error).toBeNull();
    await reencryptionJob(only(w));
    const { data } = await db().from("profiles").select("name").eq("id", w.contactId).single();
    expect(isSealed(data!.name as string)).toBe(false);
  });

  it("seals old plain Breakdown labels with their index", async () => {
    const w = await plainWorkspace();
    const obs = await w.value(w.m.id, "2026-10-01", 10, w.owner);
    await db().from("breakdown_rows").insert([{ observation_id: obs, label: "Hamburg", value: 6, position: 0 }, { observation_id: obs, label: "Berlin", value: 4, position: 1 }]);
    const run = await reencryptionJob(only(w));
    expect(run.errors).toBe(0);
    const { data: rows } = await db().from("breakdown_rows").select("id, label, label_index").eq("observation_id", obs);
    const cipher = await workspaceCipher(w.id);
    expect(rows!.map((r) => cipher.open({ table: "breakdown_rows", column: "label", row: r.id as number }, r.label as string)).sort()).toEqual(["Berlin", "Hamburg"]);
    expect(rows!.every((r) => isSealed(r.label as string) && /^b1\.1\./.test(r.label_index as string))).toBe(true);
    expect(rows!.find((r) => cipher.open({ table: "breakdown_rows", column: "label", row: r.id as number }, r.label as string) === "Hamburg")!.label_index).toBe(cipher.blindIndex("breakdown_rows.label", " hamburg "));
    for (const id of w.messages) expect(isSealed(await body(id))).toBe(true);
  });

  it("waits without ZIFFR_SECRETS_KEY", async () => {
    const w = await plainWorkspace();
    delete process.env.ZIFFR_SECRETS_KEY;
    expect((await reencryptionJob(only(w))).waiting).toBe(true);
    expect(isSealed(await body(w.messages[0]))).toBe(false);
  });
});

describe("the lists of sealed columns", () => {
  it("are the same in SEALED_COLUMNS, the job's SQL and the progress page's words", async () => {
    // Whoever seals a column adds it to all three; this fails until they do.
    const columns = [...Object.entries(ALL_SEALED_COLUMNS).flatMap(([t, cols]) => cols.map((c) => `${t}.${c}`)), "audit_events.details"].sort();
    const expected = [...columns, ...SEALED_THINGS.map((t) => `${t.table}.${t.column}`)].sort();
    const w = await plainWorkspace();
    const { data, error } = await db().rpc("seal_counts", { p_workspace: w.id, p_current: 1 });
    expect(error).toBeNull();
    expect((data as { table_name: string; column_name: string }[]).map((r) => `${r.table_name}.${r.column_name}`).sort()).toEqual(columns);
    for (const table of Object.keys(ALL_SEALED_COLUMNS)) {
      const { error: e } = await db().rpc("seal_candidates", { p_workspace: w.id, p_table: table, p_current: 1, p_skip: [], p_limit: 1 });
      expect([table, e]).toEqual([table, null]);
    }
    expect(Object.keys(SEALED_LABELS).sort()).toEqual(expected);
  });
});

describe("the progress for Installation Admins", () => {
  it("shows counts and key versions, never a key, and only to Installation Admins", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    const a = await admin();
    const view = await keyProgress(a.actor);
    const mine = view.listed.find((l) => l.workspaceId === w.id);
    expect(view.encrypting).toBe(true);
    expect(mine?.versions).toEqual([{ version: 1, current: true, pending: false, wrappedUnderPrevious: false }]);
    expect(mine?.columnsDone).toBe(mine?.columns);
    const { data: key } = await db().from("workspace_keys").select("wrapped").eq("workspace_id", w.id).single();
    expect(JSON.stringify(view)).not.toContain(key!.wrapped as string);
    expect(JSON.stringify(view)).not.toContain("k1.");
    await expect(keyProgress({ personId: w.owner })).rejects.toThrow(Forbidden);
  });

  it("counts keys still wrapped under the previous Installation key", async () => {
    const w = await plainWorkspace();
    await reencryptionJob(only(w));
    process.env.ZIFFR_SECRETS_KEY_PREVIOUS = process.env.ZIFFR_SECRETS_KEY;
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 72).toString("base64");
    const view = await keyProgress((await admin()).actor);
    expect(view.hasPreviousKey).toBe(true);
    expect(view.keysUnderPreviousKey).toBeGreaterThanOrEqual(1);
    expect(view.listed.find((l) => l.workspaceId === w.id)?.versions[0].wrappedUnderPrevious).toBe(true);
  });
});
