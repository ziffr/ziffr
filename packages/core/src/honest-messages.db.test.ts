// What the core answers after creating a Metric or inviting someone (ticket #523), against the real database: who was
// really asked and how, with no Submitters, with no mail set up, and with mail set up; and whether an invitation was
// really emailed. The pages build their sentences from exactly these answers.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { firstAsksFor } from "./first-asks";
import { inviteByEmail } from "./invitations";
import { createMetric } from "./metrics";
import { workspace } from "./test/db-fixtures";

const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
const mailOn = () => { for (const k of Object.keys(MAIL)) process.env[k] = MAIL[k as keyof typeof MAIL]; };
const mailOff = () => { for (const k of Object.keys(MAIL)) delete process.env[k]; };
beforeAll(() => { for (const k of Object.keys(MAIL)) saved[k] = process.env[k]; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const address = () => `ana-${randomUUID().slice(0, 8)}@example.test`;

describe("createMetric says who was asked", () => {
  it("with no Submitters, nobody", async () => {
    mailOn();
    const w = await ws(); const sara = await w.person("owner");
    const made = await createMetric(w.actor(sara), { name: "Cups" });
    expect(made).toMatchObject({ submitters: 0, asked: [] });
    expect(await firstAsksFor(w.actor(sara), made.id)).toBe("Nobody submits it yet: add Submitters under Who submits on its Description tab.");
  });
  it("with no mail set up, the request stays in the Outbox and the sentence says nothing was sent", async () => {
    mailOff();
    const w = await ws(); const sara = await w.person("owner"); const ana = await w.contact({ email: address() });
    const made = await createMetric(w.actor(sara), { name: "Cups", submitters: [ana], sources: ["web_form", "mail"] });
    expect(made.submitters).toBe(1);
    expect(made.asked).toEqual([expect.objectContaining({ personId: ana, connector: "email", state: "outbox" })]);
    expect(await firstAsksFor(w.actor(sara), made.id)).toContain("Email is not set up on this Ziffr, so nothing was sent to");
  });
  it("with mail set up, the request is sent and the sentence says by email", async () => {
    mailOn();
    const w = await ws(); const sara = await w.person("owner"); const ana = await w.contact({ email: address() });
    const made = await createMetric(w.actor(sara), { name: "Cups", submitters: [ana], sources: ["web_form", "mail"] });
    expect(made.asked).toEqual([expect.objectContaining({ personId: ana, connector: "email", state: "sent" })]);
    expect(await firstAsksFor(w.actor(sara), made.id)).toMatch(/got a form link and a first request by email\.$/);
  });
  it("tells only the Metric's owner", async () => {
    mailOff();
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const made = await createMetric(w.actor(sara), { name: "Cups" });
    expect(await firstAsksFor(w.actor(ben, "member"), made.id)).toBeNull();
  });
});

describe("inviteByEmail says whether it emailed", () => {
  it("emailed when mail is set up, and not when it is not", async () => {
    const w = await ws(); const sara = await w.person("owner");
    mailOn();
    expect(await inviteByEmail(w.actor(sara), { email: address(), role: "member" })).toMatchObject({ emailed: true, token: expect.any(String) });
    mailOff();
    expect(await inviteByEmail(w.actor(sara), { email: address(), role: "member" })).toMatchObject({ emailed: false, token: expect.any(String) });
  });
});
