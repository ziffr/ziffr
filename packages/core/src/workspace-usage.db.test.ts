// Size and usage against the real database (spec 0029, ticket #266): the numbers Owners and Admins see, the note near
// the limit, the banner while over, and the Owners' two emails, each once per time over the limit.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { workspace } from "./test/db-fixtures";
import { GRACE_DAYS } from "./workspace-limits";
import { nearLimitNote, overLimitBanner, sendLimitNotices, sizeAndUsage, workspaceUsage } from "./workspace-usage";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const DAY = 86_400_000;

/** A workspace with two Owners, an Admin, a Member and `n` Metrics, and a limit of its own. */
async function setup(n: number, limit: number | null, label: string | null = "Small") {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const olga = await w.person("owner"); const adam = await w.person("admin"); const ben = await w.person("member");
  for (let i = 0; i < n; i++) await w.metric(sara, { name: `M${i}` });
  await db().from("workspace_limits").insert({ workspace_id: w.id, metrics: limit, label, set_by: "installation_admin", next_label: "Team", next_on: "2026-12-01" });
  return { w, sara, olga, adam, ben };
}
const notices = async (wsId: string) => ((await db().from("deliveries").select("recipient_id, subject").eq("workspace_id", wsId).eq("kind", "notice").order("id")).data ?? []);

describe("Size and usage", () => {
  it("shows Owners and Admins the Size, the count, the grace and a coming change; never Members or Guests", async () => {
    const { w, sara, adam, ben } = await setup(21, 20);
    const u = await sizeAndUsage(w.actor(adam, "admin"));
    expect(u).toMatchObject({ metrics: 21, limit: 20, label: "Small", room: 22, waiting: false, next: { label: "Team", on: "2026-12-01" } });
    expect(u.overSince).not.toBeNull();
    expect(new Date(u.graceEnds!).getTime() - new Date(u.overSince!).getTime()).toBe(GRACE_DAYS * DAY);
    expect((await sizeAndUsage(w.actor(sara))).metrics).toBe(21);
    await expect(sizeAndUsage(w.actor(ben, "member"))).rejects.toThrow(Forbidden);
    expect(overLimitBanner(u)).toMatch(/^This Workspace holds 21 Metrics, more than the 20 its Size Small allows\. New Metrics can be made until \d+ \w+ \d{4}\./);
    await db().from("workspaces").update({ over_limit_since: new Date(Date.now() - (GRACE_DAYS + 1) * DAY).toISOString() }).eq("id", w.id);
    expect(overLimitBanner(await workspaceUsage({ workspaceId: w.id }))).toBe("This Workspace holds 21 Metrics, more than the 20 its Size Small allows. New Metrics wait now. Everything else keeps working.");
  });

  it("without a limit shows only the count, and says nothing near or over", async () => {
    const { w, sara } = await setup(3, null, null);
    const u = await sizeAndUsage(w.actor(sara));
    expect(u).toMatchObject({ metrics: 3, limit: null, room: null, overSince: null, waiting: false });
    expect(nearLimitNote(u)).toBeNull();
    expect(overLimitBanner(u)).toBeNull();
  });

  it("notes the count from 90 % of the limit", () => {
    expect(nearLimitNote({ metrics: 44, limit: 50 })).toBeNull();
    expect(nearLimitNote({ metrics: 45, limit: 50 })).toBe("45 of 50 Metrics");
    expect(nearLimitNote({ metrics: 1100, limit: 1000 })).toBe("1,100 of 1,000 Metrics");
  });
});

describe("the Owners' emails", () => {
  it("go to Owners only, once when the grace starts and once when it ends, and again for a new time over", async () => {
    const { w, sara, olga } = await setup(11, 10);
    await sendLimitNotices();
    await sendLimitNotices();
    expect((await notices(w.id)).map((n) => [n.recipient_id, n.subject]).sort()).toEqual([[olga, "Your Workspace is over its limit"], [sara, "Your Workspace is over its limit"]].sort());
    // 14 days later: the second email, once.
    await sendLimitNotices(new Date(Date.now() + (GRACE_DAYS + 1) * DAY));
    await sendLimitNotices(new Date(Date.now() + (GRACE_DAYS + 2) * DAY));
    expect((await notices(w.id)).filter((n) => n.subject === "New Metrics now wait in your Workspace")).toHaveLength(2);
    // Back under, then over again: told again.
    await db().from("workspace_limits").update({ metrics: 20 }).eq("workspace_id", w.id);
    await db().from("workspace_limits").update({ metrics: 10 }).eq("workspace_id", w.id);
    await sendLimitNotices();
    expect((await notices(w.id)).filter((n) => n.subject === "Your Workspace is over its limit")).toHaveLength(4);
  });
});
