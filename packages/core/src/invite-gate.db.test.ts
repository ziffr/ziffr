// Whether somebody can be invited now, against the database (spec 0040; ADR 0015; GLOSSARY: Invitation, Trial
// Workspace, Trial Limit, Submitter): who may ask, which Metric an Owner is offered and that nobody else's is named,
// and the states ended, waiting, full and open.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { inviteGate } from "./invite-gate";
import { workspace } from "./test/db-fixtures";

const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => { for (const w of made.splice(0)) await w.cleanup(); });
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function fresh() {
  const w = await workspace("Gate Co");
  made.push(w);
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  return { w, owner, o: w.actor(owner, "owner") };
}

describe("the invite gate", () => {
  it("answers Owners and Admins only, and is open outside a trial", async () => {
    const { w, o } = await fresh();
    const member = w.actor(await w.person("member"), "member");
    const guest = w.actor(await w.person("guest"), "guest");
    await expect(inviteGate(member)).rejects.toBeInstanceOf(Forbidden);
    await expect(inviteGate(guest)).rejects.toBeInstanceOf(Forbidden);
    await expect(inviteGate({ ...o, key: { id: 1, scopes: [] } } as never)).rejects.toBeInstanceOf(Forbidden);
    expect(await inviteGate(o)).toEqual({ state: "open" });
  });

  it("offers the waiting Owner a Metric they send values for, never one of somebody else, and an Admin none", async () => {
    const { w, o, owner } = await fresh();
    const admin = await w.person("admin");
    const theirs = await w.metric(admin, { name: "Admin's own" });
    await w.token(theirs.id, admin);
    await w.trial(day(7));
    expect(await inviteGate(o)).toEqual({ state: "waiting", you: true, firstSteps: false, metric: null });
    const mine = await w.metric(owner, { name: "Cash at hand" });
    await w.token(mine.id, owner);
    const old = await w.metric(owner, { name: "Old", archived_at: new Date().toISOString() });
    await w.token(old.id, owner);
    expect(await inviteGate(o)).toMatchObject({ state: "waiting", you: true, metric: { id: mine.id, name: "Cash at hand", slug: mine.slug, canAsk: true, offer: { metricId: mine.id } } });
    expect(await inviteGate(w.actor(admin, "admin"))).toEqual({ state: "waiting", you: false, firstSteps: false, metric: null });
  });

  it("opens with the Owner's own value, is full when every place is taken, and says when the trial ended", async () => {
    const { w, o, owner } = await fresh();
    const m = await w.metric(owner);
    await w.value(m.id, "2026-11-01", 3, owner);
    await w.trial(day(7));
    expect(await inviteGate(o)).toEqual({ state: "open" });
    for (let i = 0; i < 4; i++) await w.person("member");
    expect(await inviteGate(o)).toEqual({ state: "full", limit: 5 });
    await w.trial(day(-1));
    expect(await inviteGate(o)).toEqual({ state: "ended" });
  });
});
