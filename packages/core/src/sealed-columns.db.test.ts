// Sealed columns against the real database (spec 0028, ticket #246): Thread messages and the text of Questions and
// Tasks are written sealed with the Workspace Key and read opened, plain rows from before still read, the demo and an
// Installation without ZIFFR_SECRETS_KEY stay in clear, and no sealed column holds the words people wrote.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, seedingDemo } from "./db";
import { actionThread, connectorsView, sourcesView } from "./page-data";
import { auditLog, recordAudit } from "./audit-log";
import { sendDelivery } from "./mail";
import { ask, reply } from "./questions";
import { peopleIn, submitValue } from "./submissions";
import { addContact, removeContact } from "./team";
import { DEMO_WORKSPACE_ID } from "./team";
import { opened, workspace } from "./test/db-fixtures";
import { getActions } from "./workspace-data";
import { forgetWorkspaceKey, isSealed } from "./workspace-keys";
import { insertSealed, openNames, SEALED_COLUMNS } from "./sealed-columns";

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
    await addContact(w.actor(w.owner), { name: `Contact ${words}`, email: `${words}@example.test`, slackHandle: `@${words}`, phone: "+49 30 999888" });
    const id = await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: `Ask about ${words}` });
    await reply(w.actor(w.ana, "member"), id, `Answer about ${words}`, null);
    for (const [table, columns] of Object.entries(SEALED_COLUMNS)) {
      // People's rows have no Workspace column: Contacts' names are checked with the Contacts below.
      if (table === "profiles") continue;
      for (const column of columns) {
        const { count } = await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", w.id).ilike(column, `%${words}%`);
        expect([table, column, count]).toEqual([table, column, 0]);
      }
    }
    const { data: names } = await db().from("contacts").select("person_id").eq("workspace_id", w.id);
    const { count: named } = await db().from("profiles").select("*", { count: "exact", head: true }).in("id", (names ?? []).map((n) => n.person_id)).ilike("name", `%${words}%`);
    expect(named).toBe(0);
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
    // Only the demo's seed writes it (#271).
    const [row] = await seedingDemo(() => insertSealed("thread_messages", DEMO_WORKSPACE_ID, [{ action_id: demoAction.id, author_id: demoAction.asker_id, body: "Demo words" }], "id, body"));
    cleanups.push(() => seedingDemo(async () => { await db().from("thread_messages").delete().eq("id", row.id as number); }));
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

describe("Contacts", () => {
  it("are stored with name, address, handle and phone sealed, and read as given", async () => {
    const w = await setup();
    const id = await addContact(w.actor(w.owner), { name: "Zoe Fieldrep", email: "Zoe@Example.test", slackHandle: "@zoe.f", phone: "+49 30 1234567" });
    const { data: c } = await db().from("contacts").select("*").eq("person_id", id).single();
    for (const column of ["email", "slack_handle", "phone"]) expect([column, isSealed(c![column])]).toEqual([column, true]);
    // Sealed columns are random ciphertext, which may hold any letters or digits: only whole values are compared.
    for (const [column, plain] of [["email", "Zoe@Example.test"], ["slack_handle", "@zoe.f"], ["phone", "+49 30 1234567"]]) expect(String(c![column]), column).not.toBe(plain);
    expect(c!.email_index).toMatch(/^b1\.1\./);
    const { data: p } = await db().from("profiles").select("name").eq("id", id).single();
    expect(isSealed(p!.name)).toBe(true);
    forgetWorkspaceKey(w.id);
    const zoe = (await peopleIn(w.id, { contactDetails: true })).find((x) => x.id === id);
    expect(zoe).toMatchObject({ name: "Zoe Fieldrep", email: "zoe@example.test", slack_handle: "@zoe.f", phone: "+49 30 1234567", contact: true });
    // Without the details, only the name.
    expect((await peopleIn(w.id)).find((x) => x.id === id)).toMatchObject({ name: "Zoe Fieldrep", email: "" });
  });

  it("keep an address and a handle unique in the Workspace through the blind index, also when added at once", async () => {
    const w = await setup();
    await addContact(w.actor(w.owner), { name: "First", email: "same@example.test" });
    await expect(addContact(w.actor(w.owner), { name: "Second", email: "SAME@example.test" })).rejects.toThrow(/already uses/);
    const both = await Promise.allSettled([addContact(w.actor(w.owner), { name: "A", slackHandle: "@twin" }), addContact(w.actor(w.owner), { name: "B", slackHandle: "@Twin" })]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // The one refused leaves no person row behind.
    const { data: people } = await db().from("contacts").select("person_id").eq("workspace_id", w.id);
    expect(people).toHaveLength(2);
    // The same address is free in another Workspace.
    const other = await setup();
    await expect(addContact(other.actor(other.owner), { name: "Elsewhere", email: "same@example.test" })).resolves.toBeTruthy();
  });

  it("from before the upgrade, in clear, are still found and read", async () => {
    const w = await setup();
    const id = await w.contact({ email: "old@example.test" });
    expect((await peopleIn(w.id, { contactDetails: true })).find((p) => p.id === id)?.email).toBe("old@example.test");
    await expect(addContact(w.actor(w.owner), { name: "New", email: "old@example.test" })).rejects.toThrow(/already uses/);
  });

  it("read as \"A Contact\" when their name does not open, and their removal is recorded by name", async () => {
    const w = await setup();
    const id = await addContact(w.actor(w.owner), { name: "Kept Name", email: "k@example.test" });
    await removeContact(w.actor(w.owner), id);
    const [ev] = await opened("audit_events", w.id, (await db().from("audit_events").select("id, object_name").eq("workspace_id", w.id).eq("kind", "contact.removed")).data);
    expect(ev?.object_name).toBe("Kept Name");
    const other = await setup();
    const moved = await addContact(other.actor(other.owner), { name: "Moved", email: "m@example.test" });
    const { data: p } = await db().from("profiles").select("name").eq("id", moved).single();
    const elsewhere = await addContact(w.actor(w.owner), { name: "Target", email: "t@example.test" });
    await db().from("profiles").update({ name: p!.name }).eq("id", elsewhere);
    expect((await peopleIn(w.id)).find((x) => x.id === elsewhere)?.name).toBe("A Contact");
  });

  it("removed while the Workspace's key cannot be opened still lose their form links", async () => {
    const w = await setup();
    const id = await addContact(w.actor(w.owner), { name: "Leaving", email: "l@example.test" });
    const code = await w.token(w.m.id, id);
    await db().from("workspace_keys").delete().eq("workspace_id", w.id);
    forgetWorkspaceKey(w.id);
    await removeContact(w.actor(w.owner), id);
    expect((await db().from("tokens").select("code").eq("code", code)).data).toEqual([]);
  });

  it("never show a sealed name read without its row, nor take a name in the sealed format", async () => {
    const w = await setup();
    const id = await addContact(w.actor(w.owner), { name: "Hidden", email: "h@example.test" });
    const { data: p } = await db().from("profiles").select("name").eq("id", id).single();
    expect(await openNames(w.id, [{ name: p!.name }])).toEqual([{ name: "A Contact" }]);
    await expect(addContact(w.actor(w.owner), { name: p!.name, email: "x@example.test" })).rejects.toThrow(/cannot be shown/);
  });

  it("stay in clear without ZIFFR_SECRETS_KEY, kept unique as before", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    const w = await setup();
    const id = await addContact(w.actor(w.owner), { name: "Plain", email: "p@example.test" });
    const { data: c } = await db().from("contacts").select("email, email_index").eq("person_id", id).single();
    expect(c).toEqual({ email: "p@example.test", email_index: null });
    await expect(addContact(w.actor(w.owner), { name: "Again", email: "p@example.test" })).rejects.toThrow(/already uses/);
  });
});

describe("the Outbox, the intake log and the Audit Log", () => {
  it("keep a Delivery's subject and text sealed, shown opened on the Connectors page, and never send one that does not open", async () => {
    const w = await setup();
    const id = await ask(w.actor(w.owner), { metricId: w.m.id, period: "2026-10-01", assigneeId: w.ana, text: "Outbox words here" });
    const { data: raw } = await db().from("deliveries").select("id, subject, body").eq("action_id", id);
    expect(raw!.length).toBeGreaterThan(0);
    for (const d of raw!) expect([isSealed(d.subject), isSealed(d.body)]).toEqual([true, true]);
    const view = await connectorsView(w.actor(w.owner));
    expect(view.deliveries.some((d) => String(d.body).includes("Outbox words here"))).toBe(true);
    // A body copied from another Delivery does not open: it is failed for good, never sent as "null".
    const [first] = raw!;
    const { data: queued } = await db().from("deliveries").insert({ connector: "email", recipient_id: w.ana, sender_id: w.owner, kind: "notice", workspace_id: w.id, subject: first.subject, body: first.body, mail_state: "queued" }).select("id").single();
    expect(await sendDelivery(queued!.id, async () => { throw new Error("must not send"); })).not.toBe("sent");
    expect((await db().from("deliveries").select("mail_state").eq("id", queued!.id).single()).data?.mail_state).toBe("failed");
  });

  it("keep what came in sealed, shown opened on the Sources page", async () => {
    const w = await setup();
    const code = await w.token(w.m.id, w.owner);
    await submitValue({ source: "web_form", sender: code, text: "Revenue was 4711 intake words" });
    const { data: raw } = await db().from("intake_log").select("sender, raw, detail").eq("workspace_id", w.id);
    expect(raw).toHaveLength(1);
    expect([isSealed(raw![0].sender), isSealed(raw![0].raw), isSealed(raw![0].detail)]).toEqual([true, true, true]);
    const view = await sourcesView(w.actor(w.owner));
    expect(view.log.map((l) => l.raw)).toEqual(["Revenue was 4711 intake words"]);
  });

  it("keep an event's name and details sealed, read as recorded, and older plain events as they were", async () => {
    const w = await setup();
    await recordAudit(w.id, w.owner, { kind: "contact.added", object: { type: "person", id: "p-1", name: "Audit Name" }, details: { role: "viewer" } });
    const { data: raw } = await db().from("audit_events").select("object_name, details").eq("workspace_id", w.id).eq("object_id", "p-1").single();
    expect(isSealed(raw!.object_name)).toBe(true);
    expect(Object.keys(raw!.details)).toEqual(["sealed"]);
    expect(JSON.stringify(raw)).not.toMatch(/Audit Name|viewer/);
    await db().from("audit_events").insert({ workspace_id: w.id, actor_id: w.owner, actor_name: "Owner", kind: "contact.removed", object_type: "person", object_id: "p-2", object_name: "Plain Before", details: { role: "member" } });
    const { events } = await auditLog(w.actor(w.owner));
    expect(events.find((e) => e.objectId === "p-1")).toMatchObject({ objectName: "Audit Name", details: { role: "viewer" } });
    expect(events.find((e) => e.objectId === "p-2")).toMatchObject({ objectName: "Plain Before", details: { role: "member" } });
  });
});

describe("the Audit Log, sealed, in every script and with given ids", () => {
  it("records a name of 120 characters in any script, and plain details with a key called sealed stay whole", async () => {
    const w = await setup();
    const long = "東".repeat(120);
    await recordAudit(w.id, w.owner, { kind: "dashboard.created", object: { type: "dashboard", id: 7, name: long }, details: { sealed: "not a wrapper", to: "x" } as never });
    await db().from("audit_events").insert({ workspace_id: w.id, actor_id: w.owner, actor_name: "Owner", kind: "contact.removed", object_type: "person", object_id: "p-9", object_name: "Plain", details: { sealed: "plain words", role: "member" } });
    const { events } = await auditLog(w.actor(w.owner));
    expect(events.find((e) => e.objectId === "7")).toMatchObject({ objectName: long, details: { to: "x" } });
    expect(events.find((e) => e.objectId === "p-9")?.details).toEqual({ sealed: "plain words", role: "member" });
  });

  it("refuses an event id ahead of the ones handed out", async () => {
    const w = await setup();
    const { error } = await db().from("audit_events").insert({ id: 9_000_000_000, workspace_id: w.id, actor_id: null, actor_name: "Ziffr", kind: "contact.removed", details: {} });
    expect(error).not.toBeNull();
  });
});

describe("writing sealed rows", () => {
  it("refuses a row whose Workspace the database sets to another one, and keeps nothing of it", async () => {
    const w = await setup();
    const other = await setup();
    // The Action belongs to w's Metric, so the database makes it w's, whatever the caller says.
    await expect(insertSealed("actions", other.id, [{ question: "Misfiled", kind: "question", metric_id: w.m.id, period_start: "2026-10-01", asker_id: w.owner, assignee_id: w.ana }])).rejects.toThrow();
    const { count } = await db().from("actions").select("id", { count: "exact", head: true }).eq("metric_id", w.m.id);
    expect(count).toBe(0);
  });

  it("answers the columns asked for, opened, also when none of them is called id", async () => {
    const w = await setup();
    const [row] = await insertSealed("actions", w.id, [{ question: "Asked", kind: "question", metric_id: w.m.id, period_start: "2026-10-01", asker_id: w.owner, assignee_id: w.ana }], "asker_id, question");
    expect(row).toMatchObject({ asker_id: w.owner, question: "Asked" });
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
