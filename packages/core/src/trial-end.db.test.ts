// The end of a Trial Workspace, against the real database (spec 0021, ticket 9): one reminder the day before, closing
// at the end, deletion a week later with everything and everyone in it, ending it now, and its values as CSV.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { actorForSecret, createAccessKey } from "./access-keys";
import { db } from "./db";
import { createFeed } from "./feeds";
import { closeEndedTrials, deleteExpiredTrials, endTrialNow, remindEndingTrials, trialValuesCsv } from "./trial-end";
import { workspace } from "./test/db-fixtures";
import { setNumberStyle } from "./workspace-settings";
import { ensureWorkspaceKey, forgetWorkspaceKey, workspaceCipher } from "./workspace-keys";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c().catch(() => {}); });
const HOUR = 3_600_000;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A Trial Workspace ending `hours` from now (negative: ended), with an Owner who has a sign-in. */
async function trial(hours: number) {
  const w = await workspace("Trial");
  cleanups.push(async () => { await db().from("access_keys").delete().eq("workspace_id", w.id); await w.cleanup(); });
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  const { data: user } = await db().auth.admin.createUser({ email: `auth-${randomUUID().slice(0, 8)}@example.test`, email_confirm: true });
  await db().from("profiles").update({ auth_user_id: user.user!.id }).eq("id", owner);
  cleanups.push(async () => { await db().auth.admin.deleteUser(user.user!.id).catch(() => {}); });
  const setEnd = (h: number) => db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + h * HOUR).toISOString() }).eq("id", w.id);
  await setEnd(hours);
  return { ...w, owner, authId: user.user!.id, ownerActor: w.actor(owner), setEnd };
}
const reminders = async (ws: string) => (await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "notice")).count;

describe("the end of a trial", () => {
  it("reminds the Owner once, the day before", async () => {
    const t = await trial(12);
    const later = await trial(60);
    expect(await remindEndingTrials()).toBeGreaterThanOrEqual(1);
    await remindEndingTrials();
    expect(await reminders(t.id)).toBe(1);
    expect(await reminders(later.id)).toBe(0);
  });

  it("stops keys at the end at once, and closing revokes them", async () => {
    const t = await trial(2);
    const { secret } = await createAccessKey(t.ownerActor, { name: "k", scopes: ["metrics:read"], expiresOn: day(5) });
    expect(await actorForSecret(secret)).not.toBeNull();
    await t.setEnd(-1);
    expect(await actorForSecret(secret)).toBeNull();
    await closeEndedTrials();
    const { data } = await db().from("access_keys").select("revoked_at").eq("workspace_id", t.id);
    expect(data!.every((k) => k.revoked_at)).toBe(true);
  });

  it("deletes a trial a week after its end, with its rows, its Contacts and Feeds, and its Owner's sign-in", async () => {
    const t = await trial(-8 * 24);
    const kept = await trial(-3 * 24);
    const m = await t.metric(t.owner);
    await t.value(m.id, "2026-10-01", 5, t.owner);
    const contact = await t.contact({ email: "c@example.test" });
    const { data: ws } = await db().from("workspaces").select("trial_ends_at").eq("id", t.id).single();
    // Make a Feed while the trial runs, then put its end back.
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + HOUR).toISOString() }).eq("id", t.id);
    const feed = await createFeed(t.ownerActor, `Feed ${randomUUID().slice(0, 6)}`);
    await db().from("workspaces").update({ trial_ends_at: ws!.trial_ends_at }).eq("id", t.id);

    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).toBeNull();
    expect((await db().from("workspaces").select("id").eq("id", kept.id).maybeSingle()).data).not.toBeNull();
    // Every table that names a workspace is empty for it.
    const { data: tables } = await db().rpc("tables_with_workspace_id");
    for (const name of (tables as string[] | null) ?? []) {
      const { count } = await db().from(name).select("*", { count: "exact", head: true }).eq("workspace_id", t.id);
      expect([name, count]).toEqual([name, 0]);
    }
    const { data: people } = await db().from("profiles").select("id").in("id", [t.owner, contact, feed.id]);
    expect(people).toEqual([]);
    expect((await db().auth.admin.getUserById(t.authId)).data.user).toBeNull();
  });

  it("is ended now only by its Owner, and only for a trial", async () => {
    const t = await trial(48);
    const ben = await t.person("member");
    await expect(endTrialNow(t.actor(ben, "member"))).rejects.toBeInstanceOf(Forbidden);
    const w = await workspace();
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await expect(endTrialNow(w.actor(sara))).rejects.toBeInstanceOf(Forbidden);
    await endTrialNow(t.actor(t.owner));
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).toBeNull();
  });
});

describe("deleting a trial's people", () => {
  it("keeps an Owner who belongs to another workspace too, with their sign-in", async () => {
    const t = await trial(-8 * 24);
    const other = await workspace();
    cleanups.push(other.cleanup);
    await db().from("memberships").insert({ workspace_id: other.id, user_id: t.owner, role: "member" });
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).toBeNull();
    expect((await db().from("profiles").select("id").eq("id", t.owner).maybeSingle()).data).not.toBeNull();
    expect((await db().auth.admin.getUserById(t.authId)).data.user).not.toBeNull();
  });
});

describe("a trial's values as CSV", () => {
  it("has a row per value, every field quoted, and a formula never runs", async () => {
    const t = await trial(48);
    const m = await t.metric(t.owner, { name: "=HYPERLINK(\"x\")" });
    await t.value(m.id, "2026-09-01", 3, t.owner);
    await t.value(m.id, "2026-10-01", 4, t.owner);
    const csv = await trialValuesCsv(t.ownerActor);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe('"metric","name","period","period_start","value","unit","source","recorded_at"');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain('"2026-09-01","3"');
    await expect(trialValuesCsv(t.actor(await t.person("member"), "member"))).rejects.toBeInstanceOf(Forbidden);
  });

  it("writes values in the Number Style, with ; between fields when the decimal mark is a comma (spec 0022)", async () => {
    const t = await trial(48);
    const m = await t.metric(t.owner, { name: "Margin", unit: "%" });
    await t.value(m.id, "2026-09-01", -1234.25, t.owner);
    await t.value(m.id, "2026-10-01", 0.000123, t.owner);
    const comma = (await trialValuesCsv(t.ownerActor)).trim().split("\r\n");
    expect(comma[1]).toContain('"2026-09-01","-1234.25","%"');
    await setNumberStyle(t.ownerActor, "1.234,5");
    const semi = (await trialValuesCsv(t.ownerActor)).trim().split("\r\n");
    expect(semi[0]).toBe('"metric";"name";"period";"period_start";"value";"unit";"source";"recorded_at"');
    // No group marks, every stored decimal, and a negative value stays a number, not an escaped formula.
    expect(semi[1]).toContain('"2026-09-01";"-1234,25";"%"');
    expect(semi[2]).toContain('"2026-10-01";"0,000123"');
    await setNumberStyle(t.ownerActor, "1'234.5");
    expect((await trialValuesCsv(t.ownerActor)).split("\r\n")[1]).toContain('"2026-09-01","-1234.25"');
  });
});

describe("deleting a trial destroys its Workspace Key first (spec 0028)", () => {
  const saved = process.env.ZIFFR_SECRETS_KEY;
  beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 77).toString("base64"); });
  afterEach(() => {
    vi.restoreAllMocks();
    if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
    else process.env.ZIFFR_SECRETS_KEY = saved;
  });
  const at = { table: "thread_messages", column: "body", row: 1 };

  /** Records which tables rows are deleted from, in order; `failOn` makes that table's delete fail. */
  function watchDeletes(failOn?: string) {
    const deleted: string[] = [];
    const client = db();
    const from = client.from.bind(client);
    vi.spyOn(client, "from").mockImplementation(((table: string) => {
      const builder = from(table);
      const remove = builder.delete.bind(builder);
      builder.delete = ((...args: Parameters<typeof remove>) => {
        deleted.push(table);
        if (table === failOn) return { eq: () => ({ not: async () => ({ error: { message: "down" } }) }) } as never;
        return remove(...args);
      }) as typeof builder.delete;
      return builder;
    }) as typeof client.from);
    return deleted;
  }

  it("before any of its rows, and leaves other Workspaces' keys alone", async () => {
    const t = await trial(-8 * 24);
    const other = await trial(48);
    await ensureWorkspaceKey(t.id);
    await ensureWorkspaceKey(other.id);
    const sealedOther = (await workspaceCipher(other.id)).seal(at, "still ours");
    const deleted = watchDeletes();
    await endTrialNow(t.actor(t.owner)).catch(() => {});
    await deleteExpiredTrials();
    vi.restoreAllMocks();
    expect(deleted.indexOf("workspace_keys")).toBeGreaterThanOrEqual(0);
    expect(deleted.indexOf("workspace_keys")).toBeLessThan(deleted.indexOf("workspaces"));
    expect((await db().from("workspace_keys").select("version").eq("workspace_id", t.id)).data).toEqual([]);
    forgetWorkspaceKey(other.id);
    expect((await workspaceCipher(other.id)).open(at, sealedOther)).toBe("still ours");
  });

  it("so a deletion that stops half-way leaves nothing that opens, and no new key is made", async () => {
    const t = await trial(48);
    await ensureWorkspaceKey(t.id);
    const sealed = (await workspaceCipher(t.id)).seal(at, "the trial's words");
    watchDeletes("workspaces");
    await expect(endTrialNow(t.actor(t.owner))).rejects.toThrow(/could not be deleted/);
    vi.restoreAllMocks();
    // The Workspace is still there, its key is not, and it cannot be given a new one.
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).not.toBeNull();
    await expect(workspaceCipher(t.id)).rejects.toThrow(/key is gone/);
    await expect(ensureWorkspaceKey(t.id)).rejects.toThrow(/key is gone/);
    expect(sealed).not.toContain("words");
    // The next try finishes the deletion.
    await endTrialNow(t.actor(t.owner));
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).toBeNull();
  });

  it("is recorded in the Installation's audit by the Workspace's id, never its name", async () => {
    const t = await trial(48);
    await ensureWorkspaceKey(t.id);
    await endTrialNow(t.actor(t.owner));
    const { data } = await db().from("installation_audit_events").select("actor_id, actor_name, kind, subject").eq("subject", t.id);
    expect(data).toEqual([{ actor_id: null, actor_name: "Ziffr", kind: "workspace.deleted", subject: t.id }]);
  });

  it("is never done for a workspace that is not a trial", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await ensureWorkspaceKey(w.id);
    await expect(endTrialNow(w.actor(sara))).rejects.toBeInstanceOf(Forbidden);
    expect((await db().from("workspace_keys").select("version").eq("workspace_id", w.id)).data).toHaveLength(1);
  });
});
