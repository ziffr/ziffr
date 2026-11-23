// Demo Mode is read-only (spec 0029, #271; GLOSSARY: Demo Mode): the database refuses every write to the demo, the
// core says one sentence for it whichever function tried, the seed alone writes it, and the demo's simulated channels
// say what would happen without saving anything. The walk of every server action is apps/web's demo-read-only test.
import { afterEach, describe, expect, it } from "vitest";
import { db, seedingDemo } from "./db";
import { visitingDemo } from "./demo-visiting";
import { DemoReadOnly, demoReadOnlyWords } from "./demo";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_DIGEST, DEMO_READ_ONLY, DEMO_READ_ONLY_TRIAL, demoWordsForDigest } from "./demo-words";
import { simulateMessage, simulatePromptAnswer } from "./demo-channels";
import { resetDemoWorkspace } from "./demo-reset";
import { renameWorkspace } from "./workspace-settings";
import { updateMyProfile } from "./profile";
import { addContact, DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import type { Actor } from "./actor";
const CLOUD = { ZIFFR_CLOUD_KEY: "k".repeat(32) };

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

/** How many rows a table holds in the demo. */
async function demoRows(table: string): Promise<number> {
  const { count } = await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID);
  return count ?? 0;
}

describe("the demo refuses every write", () => {
  it("in every table that has a workspace, and in the tables of its people", async () => {
    const { data, error } = await db().rpc("demo_read_only_gaps");
    expect(error).toBeNull();
    const unguarded = (data ?? []) as string[];
    expect(unguarded, `These tables have a workspace_id but no demo guard: ${unguarded.join(", ")}. Call attach_demo_guard in your migration: select attach_demo_guard('${unguarded[0]}');`).toEqual([]);
  });

  it("in every table, either on the open list or on the closed one (spec 0051)", async () => {
    const { data, error } = await db().rpc("demo_unclassified_tables");
    expect(error).toBeNull();
    const unclassified = (data ?? []) as string[];
    expect(unclassified, `These tables have a workspace_id but are on neither list of the demo: ${unclassified.join(", ")}. Add each to demo_closed_tables (with its reason) or, to let visitors write it, to demo_open_tables, in your migration.`).toEqual([]);
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    const closed = ((await db().from("demo_closed_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    expect(open.filter((t) => closed.includes(t)), "A table is on both lists of the demo.").toEqual([]);
  });

  it("with the lists changed by migrations only: the service role may read them and nothing else", async () => {
    for (const t of ["demo_open_tables", "demo_closed_tables"]) {
      expect((await db().from(t).select("table_name").limit(1)).error).toBeNull();
      expect((await db().from(t).insert({ table_name: "dashboards", reason: "x" })).error?.code).toBe("42501");
      expect((await db().from(t).update({ table_name: "x" }).eq("table_name", "dashboards")).error?.code).toBe("42501");
      expect((await db().from(t).delete().eq("table_name", "dashboards")).error?.code).toBe("42501");
    }
    // demo_state: the core updates its row, but never inserts or deletes one.
    expect((await db().from("demo_state").insert({ id: false })).error?.code).toBe("42501");
    expect((await db().from("demo_state").delete().eq("id", true)).error?.code).toBe("42501");
  });

  it("with every open table taking the reset lock before its rows are locked", async () => {
    const { data, error } = await db().rpc("demo_open_tables_without_lock");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("with the Installation's flag off unless the reset job set it", async () => {
    expect((await db().from("demo_state").select("open_to_visitors").single()).data?.open_to_visitors).toBe(false);
    await resetDemoWorkspace({ openToVisitors: true });
    expect((await db().from("demo_state").select("open_to_visitors").single()).data?.open_to_visitors).toBe(true);
    // Any call without the setting in effect closes it again.
    await resetDemoWorkspace();
    expect((await db().from("demo_state").select("open_to_visitors").single()).data?.open_to_visitors).toBe(false);
  });

  it("with every table closed today: the open list is empty", async () => {
    const open = (await db().from("demo_open_tables").select("table_name")).data ?? [];
    expect(open).toEqual([]);
  });

  it("as one sentence, thrown, whether the query answers with an error or throws", async () => {
    await expect(db().from("dashboards").insert({ name: "x", owner_id: "sara", workspace_id: DEMO_WORKSPACE_ID })).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(db().from("metrics").update({ name: "x" }).eq("workspace_id", DEMO_WORKSPACE_ID).throwOnError()).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(db().from("workspaces").update({ name: "x" }).eq("id", DEMO_WORKSPACE_ID).select("id").single()).rejects.toThrow(demoReadOnlyWords());
    await expect(db().from("profiles").update({ name: "x" }).eq("id", "sara")).rejects.toBeInstanceOf(DemoReadOnly);
    // Inside Promise.all too: each query is its own promise.
    await expect(Promise.all([db().from("metrics").select("id").limit(1), db().from("metrics").delete().eq("workspace_id", DEMO_WORKSPACE_ID)])).rejects.toBeInstanceOf(DemoReadOnly);
    const { data: name } = await db().from("workspaces").select("name").eq("id", DEMO_WORKSPACE_ID).single();
    expect(name?.name).not.toBe("x");
  });

  it("from a core function, which says the sentence instead of its own words", async () => {
    await expect(renameWorkspace(sara, "Mine now")).rejects.toThrow(demoReadOnlyWords());
    await expect(updateMyProfile(sara, { name: "Someone else" })).rejects.toThrow(demoReadOnlyWords());
    // A Contact's person would be made outside the demo first: refused before it.
    // Looked for by name, not by counting every profile: other test files' people may be made meanwhile (#476).
    await expect(addContact(sara, { name: "Ann Other", email: "ann@contact.test" })).rejects.toBeInstanceOf(DemoReadOnly);
    expect((await db().from("profiles").select("id", { count: "exact", head: true }).eq("name", "Ann Other")).count).toBe(0);
  });

  it("and never a real workspace's", async () => {
    const w = await workspace("Real");
    cleanups.push(w.cleanup);
    const owner = await w.person("owner");
    await renameWorkspace(w.actor(owner), "Still mine");
    const { data } = await db().from("workspaces").select("name").eq("id", w.id).single();
    expect(data?.name).toBe("Still mine");
    await db().from("profiles").update({ name: "Renamed" }).eq("id", owner).throwOnError();
  });

  it("but lets the seed write it", async () => {
    const { data: dash } = await db().from("dashboards").select("id, name").eq("workspace_id", DEMO_WORKSPACE_ID).order("id").limit(1).single();
    await seedingDemo(async () => {
      await db().from("dashboards").update({ name: `${dash!.name} ` }).eq("id", dash!.id).throwOnError();
      await db().from("dashboards").update({ name: dash!.name }).eq("id", dash!.id).throwOnError();
    });
    // Only inside: the same write outside is refused again.
    await expect(db().from("dashboards").update({ name: "x" }).eq("id", dash!.id)).rejects.toBeInstanceOf(DemoReadOnly);
  });
});

describe("the sentence", () => {
  it("points to a trial only where this Installation offers them", () => {
    expect(demoReadOnlyWords({})).toBe(DEMO_READ_ONLY);
    expect(demoReadOnlyWords({ ...CLOUD, ZIFFR_TRIAL_DAYS: "14" })).toBe(DEMO_READ_ONLY_TRIAL);
    expect(demoReadOnlyWords({ ...CLOUD, ZIFFR_TRIAL_DAYS: "nonsense" })).toBe(DEMO_READ_ONLY);
    expect(DEMO_READ_ONLY_TRIAL).toBe("The demo can't be changed. Start a trial to try it with your own numbers.");
  });

  it("reaches a plain form's error screen as a fixed code, never as text", () => {
    expect(new DemoReadOnly({}).digest).toBe(DEMO_DIGEST.plain);
    expect(new DemoReadOnly({ ...CLOUD, ZIFFR_TRIAL_DAYS: "7" }).digest).toBe(DEMO_DIGEST.trial);
    expect(demoWordsForDigest(DEMO_DIGEST.trial)).toBe(DEMO_READ_ONLY_TRIAL);
    expect(demoWordsForDigest("1234567")).toBeNull();
  });
});

describe("the nightly seed", () => {
  it("fills the demo again, with its Snapshots and an Outbox to answer", async () => {
    await db().rpc("demo_reset", { min_gap: "0 seconds" }).throwOnError();
    // As the nightly job finds it: seeded a while ago.
    await seedingDemo(async () => { await db().from("workspaces").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", DEMO_WORKSPACE_ID).throwOnError(); });
    expect(await resetDemoWorkspace()).toBe(true);
    // A minute later it is not done again.
    expect(await resetDemoWorkspace()).toBe(false);
    expect(await demoRows("dashboard_snapshots")).toBeGreaterThan(0);
    const { data: outbox } = await db().from("deliveries").select("kind, mail_state").eq("workspace_id", DEMO_WORKSPACE_ID);
    expect(outbox?.length).toBeGreaterThan(0);
    // Never sent: the demo's Deliveries stay in the Outbox.
    expect(new Set(outbox?.map((d) => d.mail_state))).toEqual(new Set(["outbox"]));
  });
});

describe("the demo's simulated channels", () => {
  it("say what a message would do, and save nothing", async () => {
    const { data: m } = await db().from("metrics").select("id, name").eq("workspace_id", DEMO_WORKSPACE_ID).eq("slug", "deals-closed").single();
    const [values, log] = [await demoRows("observations"), await demoRows("intake_log")];
    const r = await simulateMessage(sara, { source: "slack", sender: "@anna", text: "closed 2 deals" });
    expect(r.detail).toContain(m!.name);
    const stranger = await simulateMessage(sara, { source: "slack", sender: "@max.stranger", text: "3" });
    expect(stranger).toMatchObject({ ok: false, outcome: "rejected_unknown_sender" });
    expect([await demoRows("observations"), await demoRows("intake_log")]).toEqual([values, log]);
  });

  it("answer a Prompt without recording it or marking it answered", async () => {
    const { data: d } = await db().from("deliveries").select("id, prompts!inner(id, source, answered_at)").eq("workspace_id", DEMO_WORKSPACE_ID).eq("kind", "prompt").in("prompts.source", ["slack", "mail"]).is("prompts.answered_at", null).limit(1).maybeSingle();
    expect(d).not.toBeNull();
    if (!d) return;
    const values = await demoRows("observations");
    await simulatePromptAnswer(sara, d.id as number, "42");
    expect(await demoRows("observations")).toBe(values);
    const { data: p } = await db().from("prompts").select("answered_at").eq("id", (d.prompts as unknown as { id: number }).id).single();
    expect(p?.answered_at).toBeNull();
  });
});

describe("a visit's header (spec 0051)", () => {
  const VISIT = "0123456789abcdef0123456789abcdef";
  const saved = { changes: process.env.ZIFFR_DEMO_CHANGES, only: process.env.ZIFFR_DEMO_ONLY };
  const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
  afterEach(() => { restore("ZIFFR_DEMO_CHANGES", saved.changes); restore("ZIFFR_DEMO_ONLY", saved.only); forgetStoredSettings(); });

  /** The demo's current Generation. */
  async function generation(): Promise<number> {
    const { data } = await db().from("demo_state").select("generation").single();
    return Number(data?.generation);
  }
  const turnOn = () => { process.env.ZIFFR_DEMO_CHANGES = "1"; process.env.ZIFFR_DEMO_ONLY = "1"; forgetStoredSettings(); };

  it("changes nothing while the open list is empty: the write is refused as before, with the current Generation too", async () => {
    turnOn();
    const g = await generation();
    await visitingDemo({ generation: g, visit: VISIT }, async () => {
      await expect(db().from("dashboards").update({ name: "x" }).eq("workspace_id", DEMO_WORKSPACE_ID)).rejects.toBeInstanceOf(DemoReadOnly);
      await expect(db().from("workspaces").update({ name: "x" }).eq("id", DEMO_WORKSPACE_ID).select("id").single()).rejects.toBeInstanceOf(DemoReadOnly);
      await expect(db().from("profiles").update({ name: "x" }).eq("id", "sara")).rejects.toBeInstanceOf(DemoReadOnly);
    });
    // Nothing marked the demo as changed.
    expect((await db().from("demo_state").select("changed_since_reset").single()).data?.changed_since_reset).toBe(false);
  });

  it("is refused as before with an old Generation, or when the setting is off (the header is then not sent at all)", async () => {
    turnOn();
    const g = await generation();
    await visitingDemo({ generation: g - 1, visit: VISIT }, async () => {
      await expect(db().from("dashboards").update({ name: "x" }).eq("workspace_id", DEMO_WORKSPACE_ID)).rejects.toBeInstanceOf(DemoReadOnly);
    });
    delete process.env.ZIFFR_DEMO_CHANGES;
    forgetStoredSettings();
    await visitingDemo({ generation: g, visit: VISIT }, async () => {
      await expect(db().from("dashboards").update({ name: "x" }).eq("workspace_id", DEMO_WORKSPACE_ID)).rejects.toBeInstanceOf(DemoReadOnly);
    });
  });

  it("is not a way to write for a request that is not the core's: the guard's function says no without the service role's claims", async () => {
    // Called as the service role, outside any request: no headers, so no.
    const { data } = await db().rpc("demo_visit_allows", { t: "dashboards" });
    expect(data).toBe(false);
  });

  it("never moves a row into or out of the demo, nor changes its id", async () => {
    turnOn();
    const w = await workspace("Elsewhere");
    cleanups.push(w.cleanup);
    const { data: dash } = await db().from("dashboards").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).single();
    await visitingDemo({ generation: await generation(), visit: VISIT }, async () => {
      await expect(db().from("dashboards").update({ workspace_id: w.id }).eq("id", dash!.id)).rejects.toBeInstanceOf(DemoReadOnly);
      await expect(db().from("workspaces").update({ id: w.id }).eq("id", DEMO_WORKSPACE_ID)).rejects.toBeInstanceOf(DemoReadOnly);
    });
    expect((await db().from("dashboards").select("workspace_id").eq("id", dash!.id).single()).data?.workspace_id).toBe(DEMO_WORKSPACE_ID);
  });

  it("does not touch a real workspace's rows", async () => {
    turnOn();
    const w = await workspace("Real, visited");
    cleanups.push(w.cleanup);
    const owner = await w.person("owner");
    await visitingDemo({ generation: await generation(), visit: VISIT }, async () => {
      await renameWorkspace(w.actor(owner), "Still mine");
    });
    expect((await db().from("workspaces").select("name").eq("id", w.id).single()).data?.name).toBe("Still mine");
  });
});
