// Sealed columns against the real database (spec 0028, ticket #246): Thread messages and the text of Questions and
// Tasks are written sealed with the Workspace Key and read opened, plain rows from before still read, the demo and an
// Installation without ZIFFR_SECRETS_KEY stay in clear, and no sealed column holds the words people wrote.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { actionThread } from "./page-data";
import { ask, reply } from "./questions";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { getActions } from "./workspace-data";
import { forgetWorkspaceKey, isSealed } from "./workspace-keys";
import { insertSealed, SEALED_COLUMNS } from "./sealed-columns";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 61).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

/** A Workspace with an Owner, a member and a Metric, removed after the test. */
async function setup() {
  const w = await workspace("Sealed");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const owner = await w.person("owner");
  const ana = await w.person("member");
  const m = await w.metric(owner);
  return { ...w, owner, ana, m };
}

async function stored(table: "actions" | "thread_messages", id: number) {
  const { data } = await db().from(table).select("*").eq("id", id).single();
  return data as Record<string, string>;
}

describe("Questions, Tasks and their Threads", () => {
  it("are stored sealed and read as written", async () => {
    const w = await setup();
    const id = await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: "Why did Hamburg drop?" });
    await reply(w.actor(w.ana, "member"), id, "The Hamburg depot closed for a week.", null);
    const action = await stored("actions", id);
    expect(isSealed(action.question)).toBe(true);
    expect(action.question).not.toContain("Hamburg");
    const { data: messages } = await db().from("thread_messages").select("id, body").eq("action_id", id);
    expect(messages).toHaveLength(1);
    expect(isSealed(messages![0].body)).toBe(true);
    // Read through the core, opened.
    forgetWorkspaceKey(w.id);
    const thread = await actionThread(w.actor(w.owner), id);
    expect(thread?.action.question).toBe("Why did Hamburg drop?");
    expect(thread?.messages.map((x) => x.body)).toEqual(["The Hamburg depot closed for a week."]);
    expect((await getActions(w.id)).find((a) => a.id === id)?.question).toBe("Why did Hamburg drop?");
  });

  it("written before the upgrade, in clear, still read as they are", async () => {
    const w = await setup();
    const { data } = await db().from("actions").insert({ question: "Written before the upgrade", kind: "question", workspace_id: w.id, metric_id: w.m.id, period_start: "2026-10-01", asker_id: w.owner, assignee_id: w.ana }).select("id").single();
    const thread = await actionThread(w.actor(w.owner), data!.id);
    expect(thread?.action.question).toBe("Written before the upgrade");
  });

  it("do not open when copied to another row or another Workspace", async () => {
    const w = await setup();
    const other = await setup();
    const id = await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: "Only for this one" });
    const sealedText = (await stored("actions", id)).question;
    const second = await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: "Another" });
    await db().from("actions").update({ question: sealedText }).eq("id", second);
    expect((await actionThread(w.actor(w.owner), second))?.action.question).toBeNull();
    const { data: theirs } = await db().from("actions").insert({ question: sealedText, kind: "question", workspace_id: other.id, metric_id: other.m.id, period_start: "2026-10-01", asker_id: other.owner, assignee_id: other.ana }).select("id").single();
    expect((await actionThread(other.actor(other.owner), theirs!.id))?.action.question).toBeNull();
  });

  it("leave no clear text in any sealed column", async () => {
    const w = await setup();
    const words = `marker-${Date.now()}`;
    const id = await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: `Ask about ${words}` });
    await reply(w.actor(w.ana, "member"), id, `Answer about ${words}`, null);
    for (const [table, columns] of Object.entries(SEALED_COLUMNS)) {
      for (const column of columns) {
        const { count } = await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", w.id).ilike(column, `%${words}%`);
        expect([table, column, count]).toEqual([table, column, 0]);
      }
    }
  });

  it("stay in clear without ZIFFR_SECRETS_KEY, which works as before", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    const w = await setup();
    const id = await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: "In clear" });
    expect((await stored("actions", id)).question).toBe("In clear");
    expect((await actionThread(w.actor(w.owner), id))?.action.question).toBe("In clear");
  });

  it("stay in clear in the demo, whose data is made up and public", async () => {
    const { data: demoAction } = await db().from("actions").select("id, asker_id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).maybeSingle();
    if (!demoAction) return;
    const [row] = await insertSealed("thread_messages", DEMO_WORKSPACE_ID, [{ action_id: demoAction.id, author_id: demoAction.asker_id, body: "Demo words" }], "id, body");
    cleanups.push(async () => { await db().from("thread_messages").delete().eq("id", row.id as number); });
    expect((await stored("thread_messages", row.id as number)).body).toBe("Demo words");
  });

  it("are refused, not written in clear, when the Workspace's key is gone", async () => {
    const w = await setup();
    await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: "First" });
    await db().from("workspace_keys").delete().eq("workspace_id", w.id);
    forgetWorkspaceKey(w.id);
    await expect(ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: "Second" })).rejects.toThrow();
    const { data } = await db().from("actions").select("question").eq("workspace_id", w.id);
    expect(data!.map((a) => a.question)).not.toContain("Second");
  });
});

describe("reserving row ids", () => {
  it("is only for tables with sealed columns, and closed to the public roles", async () => {
    expect((await db().rpc("reserve_row_ids", { p_table: "profiles", p_count: 1 })).error).not.toBeNull();
    expect((await db().rpc("reserve_row_ids", { p_table: "actions", p_count: 0 })).error).not.toBeNull();
    const { data } = await db().rpc("reserve_row_ids", { p_table: "actions", p_count: 2 });
    expect(data).toHaveLength(2);
    if (!process.env.SUPABASE_ANON_KEY) return;
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    expect((await anon.rpc("reserve_row_ids", { p_table: "actions", p_count: 1 })).error).not.toBeNull();
  });
});
