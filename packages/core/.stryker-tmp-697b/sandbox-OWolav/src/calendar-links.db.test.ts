// @ts-nocheck
// Calendar Links against the real database (spec 0027, ticket #243; GLOSSARY: Calendar Link): only the hash is kept,
// the address works until revoked and then answers like an unknown one, a new link ends the old one, leaving the
// Workspace ends it, "no names" holds no Metric name, period or Action words, UIDs stay the same across fetches, and
// a link is fetched at most 60 times an hour. Owners and Admins list and revoke links, never seeing an address.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { CALENDAR_FETCHES_PER_HOUR, fetchCalendar, listCalendarLinks, makeCalendarLink, myCalendarLink, revokeCalendarLink, setCalendarNoNames } from "./calendar-links";
import { removeMember } from "./handover";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace, opened } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const ORIGIN = "https://ziffr.example";
const LONG_AGO = "2025-01-01T00:00:00Z";
const ok = async (secret: string) => {
  const r = await fetchCalendar(secret, ORIGIN);
  if (r.status !== "ok") throw new Error(`Expected the calendar, got ${r.status}`);
  return r;
};

/** A workspace where Ben owes Revenue and has a Task on it, so his calendar has events with names. */
async function withDuties() {
  const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
  const m = await w.metric(sara, { name: "Revenue Secretname", created_at: LONG_AGO });
  await w.token(m.id, ben, { created_at: LONG_AGO });
  const today = new Date().toISOString().slice(0, 10);
  await w.action({ metric_id: m.id, period_start: "2026-01-01", asker_id: sara, assignee_id: ben, kind: "task", question: "Renegotiate the confidential rate", due_date: today });
  return { w, sara, ben, m };
}

describe("making and revoking", () => {
  it("keeps only the hash, works until revoked, then answers like an unknown link", async () => {
    const { w, ben } = await withDuties();
    const { secret } = await makeCalendarLink(w.actor(ben, "member"));
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { data: rows } = await db().from("calendar_links").select("*").eq("workspace_id", w.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(rows![0].secret_hash).toMatch(/^[0-9a-f]{64}$/);
    const first = await ok(secret);
    expect(first.ics).toContain("Revenue Secretname");
    expect(await myCalendarLink(w.actor(ben, "member"))).toMatchObject({ noNames: false, lastFetchedAt: expect.any(String) });
    expect(await revokeCalendarLink(w.actor(ben, "member"))).toBe(true);
    expect(await fetchCalendar(secret, ORIGIN)).toEqual({ status: "not_found" });
    expect(await fetchCalendar("A".repeat(43), ORIGIN)).toEqual({ status: "not_found" });
    expect(await fetchCalendar("../../etc/passwd", ORIGIN)).toEqual({ status: "not_found" });
    expect(await myCalendarLink(w.actor(ben, "member"))).toBeNull();
    // The Audit Log says who and what, never the address.
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, kind, details").eq("workspace_id", w.id).like("kind", "calendar_link.%").order("id")).data, { dropId: true });
    expect(events!.map((e) => e.kind)).toEqual(["calendar_link.made", "calendar_link.revoked"]);
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it("ends the old address when a new one is made, keeping the no names choice", async () => {
    const { w, ben } = await withDuties();
    const a = w.actor(ben, "member");
    const { secret: old } = await makeCalendarLink(a, { noNames: true });
    const { secret: fresh } = await makeCalendarLink(a);
    expect(await fetchCalendar(old, ORIGIN)).toEqual({ status: "not_found" });
    expect((await ok(fresh)).ics).toContain("Ziffr: 1 value due");
    expect(await myCalendarLink(a)).toMatchObject({ noNames: true });
  });

  it("ends when the person leaves the Workspace, whichever way", async () => {
    const { w, sara, ben } = await withDuties();
    const { secret } = await makeCalendarLink(w.actor(ben, "member"));
    await ok(secret);
    await removeMember(w.actor(sara), ben, sara);
    expect(await fetchCalendar(secret, ORIGIN)).toEqual({ status: "not_found" });
    const { count } = await db().from("calendar_links").select("id", { count: "exact", head: true }).eq("workspace_id", w.id);
    expect(count).toBe(0);
  });

  it("refuses keys and the demo, and others' links to anyone but Owners and Admins", async () => {
    const { w, sara, ben } = await withDuties();
    const eve = await w.person("member"); const ann = await w.person("admin");
    await expect(makeCalendarLink({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" })).rejects.toEqual(expect.any(Forbidden));
    await expect(makeCalendarLink({ ...w.actor(ben, "member"), key: { id: "1", scopes: ["metrics:read"] } } as never)).rejects.toEqual(expect.any(Forbidden));
    const { secret } = await makeCalendarLink(w.actor(ben, "member"));
    await expect(revokeCalendarLink(w.actor(eve, "member"), ben)).rejects.toEqual(expect.any(Forbidden));
    await expect(listCalendarLinks(w.actor(eve, "member"))).rejects.toEqual(expect.any(Forbidden));
    const listed = await listCalendarLinks(w.actor(sara));
    expect(listed).toEqual([{ personId: ben, name: expect.any(String), createdAt: expect.any(String), lastFetchedAt: null }]);
    expect(JSON.stringify(listed)).not.toContain(secret);
    expect(await revokeCalendarLink(w.actor(ann, "admin"), ben)).toBe(true);
    expect(await fetchCalendar(secret, ORIGIN)).toEqual({ status: "not_found" });
  });

  it("ends with an ended trial", async () => {
    const { w, ben } = await withDuties();
    const { secret } = await makeCalendarLink(w.actor(ben, "member"));
    await w.trial("2026-01-01");
    expect(await fetchCalendar(secret, ORIGIN)).toEqual({ status: "not_found" });
  });
});

describe("what a fetch shows", () => {
  it("with no names, holds no Metric name, period or Action words, and can be switched without a new address", async () => {
    const { w, ben } = await withDuties();
    const a = w.actor(ben, "member");
    const { secret } = await makeCalendarLink(a, { noNames: true });
    const metrics = await opened("metrics", w.id, (await db().from("metrics").select("id, name, slug").eq("workspace_id", w.id)).data);
    const flat = (await ok(secret)).ics.replace(/\r\n /g, "");
    for (const m of metrics!) { expect(flat).not.toContain(m.name); expect(flat).not.toContain(m.slug); }
    expect(flat).not.toContain("confidential");
    expect(flat).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
    expect(flat).toContain("Ziffr: 1 Task");
    expect(await setCalendarNoNames(a, false)).toBe(true);
    expect((await ok(secret)).ics).toContain("Task: Renegotiate the confidential rate");
    // Showing names again is in the Audit Log.
    const changed = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("workspace_id", w.id).eq("kind", "calendar_link.names_changed")).data, { dropId: true });
    expect(changed!.map((e) => e.details)).toEqual([{ no_names: false }]);
  });

  it("keeps UIDs and the ETag across fetches of the same Schedule", async () => {
    const { w, ben } = await withDuties();
    const { secret } = await makeCalendarLink(w.actor(ben, "member"));
    const uids = (ics: string) => [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim());
    const [one, two] = [await ok(secret), await ok(secret)];
    expect(uids(one.ics).length).toBeGreaterThan(0);
    expect(uids(two.ics)).toEqual(uids(one.ics));
    expect(two.etag).toBe(one.etag);
  });

  it("answers at most 60 fetches an hour", async () => {
    const { w, ben } = await withDuties();
    const { secret } = await makeCalendarLink(w.actor(ben, "member"));
    await db().from("calendar_links").update({ window_started_at: new Date().toISOString(), window_fetches: CALENDAR_FETCHES_PER_HOUR - 1 }).eq("workspace_id", w.id);
    await ok(secret);
    expect(await fetchCalendar(secret, ORIGIN)).toEqual({ status: "rate_limited" });
    // A new hour starts the count again.
    await db().from("calendar_links").update({ window_started_at: new Date(Date.now() - 3_700_000).toISOString() }).eq("workspace_id", w.id);
    await ok(secret);
  });
});
