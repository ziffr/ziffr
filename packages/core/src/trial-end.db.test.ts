// The end of a Trial Workspace, against the real database (spec 0021, ticket 9): one reminder the day before, closing
// at the end, deletion a week later with everything and everyone in it, ending it now, and its values as CSV.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { actorForSecret, createAccessKey } from "./access-keys";
import { db } from "./db";
import { createFeed } from "./feeds";
import { closeEndedTrials, deleteExpiredTrials, endTrialNow, remindEndingTrials, trialCleanup, trialValuesCsv } from "./trial-end";
import { forgetStoredSettings } from "./settings-in-effect";
import { keepTrial } from "./trials";
import { opened, workspace } from "./test/db-fixtures";
import { setNumberStyle } from "./workspace-settings";
import { destroyWorkspaceKeys, ensureWorkspaceKey, forgetWorkspaceKey, workspaceCipher } from "./workspace-keys";

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
    const later = await trial(100);
    expect(await remindEndingTrials()).toBeGreaterThanOrEqual(1);
    await remindEndingTrials();
    expect(await reminders(t.id)).toBe(1);
    expect(await reminders(later.id)).toBe(0);
  });

  it("reminds three days before, one day before and as it ends, each once, naming the two ways on and the day of the deletion", async () => {
    const t = await trial(70);
    const sent = async () => await opened("deliveries", t.id, (await db().from("deliveries").select("id, subject, body").eq("workspace_id", t.id).eq("kind", "notice").order("id")).data);
    await remindEndingTrials(); await remindEndingTrials();
    expect((await sent()).map((d) => d.subject)).toEqual(["Your Ziffr trial ends in 3 days"]);
    await t.setEnd(20); await remindEndingTrials(); await remindEndingTrials();
    await t.setEnd(1); await remindEndingTrials(); await remindEndingTrials();
    const all = await sent();
    expect(all.map((d) => d.subject)).toEqual(["Your Ziffr trial ends in 3 days", "Your Ziffr trial ends tomorrow", "Your Ziffr trial ends today"]);
    const { data: ws } = await db().from("workspaces").select("trial_ends_at, trial_grace_days").eq("id", t.id).single();
    const deletedOn = new Date(new Date(ws!.trial_ends_at as string).getTime() + (ws!.trial_grace_days as number) * 86_400_000);
    for (const d of all) {
      expect(d.body).toContain("two ways on");
      expect(d.body).toContain("Subscribe to a Size");
      expect(d.body).toContain("Workspace Export");
      expect(d.body).toContain("/settings/export");
    }
    // The last says the day the data goes: the end plus the days promised.
    expect(all[2].body).toContain(`it is deleted with everything in it`);
    expect(all[2].body).toContain(`on ${deletedOn.getUTCDate()} ${deletedOn.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} it is deleted`);
  });

  it("sends one reminder, not three, for a trial that is made for a day or two", async () => {
    const t = await trial(10);
    await remindEndingTrials(); await t.setEnd(1); await remindEndingTrials();
    expect(await reminders(t.id)).toBe(2);
    const quick = await trial(1);
    await remindEndingTrials();
    expect(await reminders(quick.id)).toBe(1);
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
    expect(lines[0]).toBe('"metric","name","period","period_start","value","unit","source","recorded_at","period_end","condensed_from","state"');
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
    expect(semi[0]).toBe('"metric";"name";"period";"period_start";"value";"unit";"source";"recorded_at";"period_end";"condensed_from";"state"');
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

  /** Records, in order, which tables rows are deleted from and when the keys are destroyed (as "keys"); `failOn`
   * makes that table's delete fail. */
  function watchDeletes(failOn?: string) {
    const deleted: string[] = [];
    const client = db();
    // The core uses one client: watching it watches every call.
    expect(db()).toBe(client);
    const from = client.from.bind(client);
    const rpc = client.rpc.bind(client);
    vi.spyOn(client, "rpc").mockImplementation(((name: string, ...args: unknown[]) => {
      if (name === "destroy_workspace_keys") deleted.push("keys");
      return (rpc as (...a: unknown[]) => unknown)(name, ...args);
    }) as typeof client.rpc);
    vi.spyOn(client, "from").mockImplementation(((table: string) => {
      const builder = from(table);
      const remove = builder.delete.bind(builder);
      builder.delete = ((...args: Parameters<typeof remove>) => {
        deleted.push(table);
        if (table === failOn) return { eq: () => ({ not: () => ({ is: () => ({ select: async () => ({ data: null, error: { message: "down" } }) }) }) }) } as never;
        return remove(...args);
      }) as typeof builder.delete;
      return builder;
    }) as typeof client.from);
    return deleted;
  }

  it("before any of its rows, and leaves other Workspaces' keys alone", async () => {
    const t = await trial(48);
    const other = await trial(48);
    await ensureWorkspaceKey(t.id);
    await ensureWorkspaceKey(other.id);
    const sealedOther = (await workspaceCipher(other.id)).seal(at, "still ours");
    const deleted = watchDeletes();
    await endTrialNow(t.actor(t.owner));
    vi.restoreAllMocks();
    expect(deleted.indexOf("keys")).toBe(0);
    expect(deleted.indexOf("workspaces")).toBeGreaterThan(0);
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

  it("also for a trial that never had a key: none can be made for it after a deletion that stopped", async () => {
    const t = await trial(48);
    watchDeletes("workspaces");
    await expect(endTrialNow(t.actor(t.owner))).rejects.toThrow(/could not be deleted/);
    vi.restoreAllMocks();
    await expect(ensureWorkspaceKey(t.id)).rejects.toThrow(/key is gone/);
    await expect(workspaceCipher(t.id)).rejects.toThrow(/key is gone/);
    expect((await db().from("workspace_keys").select("version").eq("workspace_id", t.id)).data).toEqual([]);
  });

  it("wins over a first key made at the same moment", async () => {
    const t = await trial(48);
    await Promise.all([ensureWorkspaceKey(t.id).catch(() => false), destroyWorkspaceKeys(t.id), ensureWorkspaceKey(t.id).catch(() => false)]);
    // Whichever ran first, no key outlives the destroy unless it was made before it and destroyed with it.
    const left = (await db().from("workspace_keys").select("version").eq("workspace_id", t.id)).data ?? [];
    expect(left).toEqual([]);
    await expect(ensureWorkspaceKey(t.id)).rejects.toThrow(/key is gone/);
  });

  it("is recorded in the Installation's audit by the Workspace's id, never its name", async () => {
    const t = await trial(48);
    await ensureWorkspaceKey(t.id);
    await endTrialNow(t.actor(t.owner));
    const { data } = await db().from("installation_audit_events").select("actor_id, actor_name, kind, subject").eq("subject", t.id);
    expect(data).toEqual([{ actor_id: null, actor_name: "Ziffr", kind: "workspace.key_destroyed", subject: t.id }]);
    // A retry adds no second line, and a Workspace that does not exist gets none.
    await destroyWorkspaceKeys(t.id);
    expect(await destroyWorkspaceKeys("00000000-0000-4000-8000-0000000000aa")).toBe(false);
    expect((await db().from("installation_audit_events").select("id").eq("subject", t.id)).data).toHaveLength(1);
    expect((await db().from("installation_audit_events").select("id").eq("subject", "00000000-0000-4000-8000-0000000000aa")).data).toHaveLength(0);
  });

  it("is never done for a workspace that is not a trial", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await ensureWorkspaceKey(w.id);
    await expect(endTrialNow(w.actor(sara))).rejects.toBeInstanceOf(Forbidden);
    expect((await db().from("workspace_keys").select("version").eq("workspace_id", w.id)).data).toHaveLength(1);
    // Nor by the database step itself, whoever calls it.
    await expect(destroyWorkspaceKeys(w.id)).rejects.toThrow();
    expect((await db().from("workspace_keys").select("version").eq("workspace_id", w.id)).data).toHaveLength(1);
  });
});

describe("when the Installation Settings cannot be read (fail closed)", () => {
  afterEach(() => { vi.restoreAllMocks(); forgetStoredSettings(); });

  /** Makes every read of the stored Installation Settings fail, as a database hiccup would. */
  function settingsDown() {
    const client = db();
    const from = client.from.bind(client);
    vi.spyOn(client, "from").mockImplementation(((table: string) => table === "installation_settings"
      ? { select: () => ({ in: async () => ({ data: null, error: { code: "XX000", message: "down" } }) }) }
      : from(table)) as typeof client.from);
    forgetStoredSettings();
    vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("deletes no trial, closes none and aborts the whole run", async () => {
    const old = await trial(-8 * 24);
    const ended = await trial(-1);
    settingsDown();
    await expect(deleteExpiredTrials()).rejects.toThrow(/could not be read/);
    await expect(closeEndedTrials()).rejects.toThrow(/could not be read/);
    await expect(trialCleanup()).rejects.toThrow(/could not be read/);
    vi.restoreAllMocks();
    expect((await db().from("workspaces").select("id").eq("id", old.id).maybeSingle()).data).not.toBeNull();
    const { data } = await db().from("workspaces").select("trial_closed_at").eq("id", ended.id).single();
    expect(data!.trial_closed_at).toBeNull();
  });

  it("also refuses to remind", async () => {
    const t = await trial(12);
    settingsDown();
    await expect(remindEndingTrials()).rejects.toThrow(/could not be read/);
    vi.restoreAllMocks();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).not.toBeNull();
  });

  it("deletes nothing for a stored keep row without a Ziffr Cloud key, which still governs the trials that exist (spec 0040)", async () => {
    const key = process.env.ZIFFR_CLOUD_KEY;
    delete process.env.ZIFFR_CLOUD_KEY;
    const old = await trial(-8 * 24);
    await db().from("installation_settings").upsert({ name: "ZIFFR_TRIAL_THEN", value: "keep", sealed: false }).throwOnError();
    forgetStoredSettings();
    try {
      expect(await deleteExpiredTrials()).toBe(0);
      expect(await closeEndedTrials()).toBeGreaterThanOrEqual(1);
      expect((await db().from("workspaces").select("trial_kept_at").eq("id", old.id).single()).data!.trial_kept_at).not.toBeNull();
      await expect(endTrialNow(old.ownerActor)).rejects.toThrow();
    } finally { if (key !== undefined) process.env.ZIFFR_CLOUD_KEY = key; await db().from("installation_settings").delete().eq("name", "ZIFFR_TRIAL_THEN"); forgetStoredSettings(); }
    expect((await db().from("workspaces").select("id").eq("id", old.id).maybeSingle()).data).not.toBeNull();
  });

  it("deletes an ended trial on hosted Ziffr whatever a stored ZIFFR_TRIAL_THEN row says: there is no Free Size", async () => {
    const key = process.env.ZIFFR_CLOUD_KEY;
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(40);
    const old = await trial(-8 * 24);
    await db().from("installation_settings").upsert({ name: "ZIFFR_TRIAL_THEN", value: "keep", sealed: false }).throwOnError();
    forgetStoredSettings();
    try {
      expect(await deleteExpiredTrials()).toBeGreaterThanOrEqual(1);
    } finally { if (key === undefined) delete process.env.ZIFFR_CLOUD_KEY; else process.env.ZIFFR_CLOUD_KEY = key; await db().from("installation_settings").delete().eq("name", "ZIFFR_TRIAL_THEN"); forgetStoredSettings(); }
    expect((await db().from("workspaces").select("id").eq("id", old.id).maybeSingle()).data).toBeNull();
  });

  it("never deletes a trial that was subscribed to", async () => {
    const old = await trial(-8 * 24);
    const kept = await trial(-8 * 24);
    await keepTrial(kept.id);
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", kept.id).maybeSingle()).data).not.toBeNull();
    expect((await db().from("workspaces").select("id").eq("id", old.id).maybeSingle()).data).toBeNull();
  });
});
