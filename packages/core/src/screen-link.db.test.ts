// Screen Links against the database and the local mail catcher (spec 0055; GLOSSARY: Screen Link): the email reaches the
// person who asked and nobody else, leads only to a listed screen, shares the limit of Test Messages, and is refused for
// a program, in the demo, for a Guest and for any other address.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { setMyQuietHours } from "./quiet-hours";
import { sendScreenLink } from "./screen-link";
import { SCREEN_LINK_SUBJECT } from "./screen-link-words";
import { sendTestMessage } from "./test-message";
import { NO_WAY_HERE, TEST_PER_WAY_PER_WINDOW } from "./test-message-words";
import { DEMO_WORKSPACE_ID } from "./team";
import { auditRowsOf, workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; }
  delete process.env.ZIFFR_INBOUND_DOMAIN;
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;

/** The messages the mail catcher holds for an address. */
async function inbox(to: string) {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
  return Promise.all(messages.map(async (m) => await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json() as { Subject: string; Text: string; To: { Address: string }[]; Cc: unknown[]; Bcc: unknown[] }));
}
const deliveriesOf = async (wsId: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).order("id")).data ?? [];

async function setup() {
  const w = await workspace("Acme Trading"); cleanups.push(w.cleanup);
  const mail = address("ann");
  const ann = await w.person("member", { email: mail });
  const boMail = address("bo");
  const bo = await w.person("owner", { email: boMail });
  return { w, ann, mail, bo, boMail };
}

describe("a Screen Link", () => {
  it("emails the link to the person who asked, to nobody else, with fixed words, also in their Quiet Hours", async () => {
    const { w, ann, mail, boMail } = await setup();
    await setMyQuietHours(w.actor(ann), { fromHour: 0, toHour: 23, days: [0, 1, 2, 3, 4, 5], timeZone: "UTC" });
    // A deck that does not exist, or that they may not open: the words name none, and the screen checks on opening.
    expect(await sendScreenLink(w.actor(ann), "/decks/999999")).toEqual({ state: "sent", words: "Sent. Look in your email." });
    const [m, ...rest] = await inbox(mail);
    expect(rest).toHaveLength(0);
    expect(m.Subject).toBe(SCREEN_LINK_SUBJECT);
    expect(m.Text).toContain("You asked for this link, to open a deck in Acme Trading on a larger screen.");
    expect(m.Text).toContain("/decks/999999");
    expect(m.To.map((t) => t.Address)).toEqual([mail]);
    expect(m.Cc).toHaveLength(0); expect(m.Bcc).toHaveLength(0);
    expect(await inbox(boMail)).toHaveLength(0);
    expect(await deliveriesOf(w.id)).toMatchObject([{ kind: "notice", connector: "email", recipient_id: ann, sender_id: null, mail_state: "sent", not_before: null }]);
    const rows = await auditRowsOf(w.id, "connector.screen_link_sent");
    expect(rows).toMatchObject([{ details: { screen: "a deck", outcome: "sent" } }]);
    expect(JSON.stringify(rows)).not.toContain(mail);
    expect(JSON.stringify(rows)).not.toContain("999999");
  });

  it("sends nothing for any other address, a program, a Guest, someone outside the Workspace or the demo", async () => {
    const { w, ann } = await setup();
    const guest = await w.person("guest", { email: address("gil") });
    for (const path of ["https://evil.example/decks/1", "//evil.example", "/decks/1?next=//evil.example", "/metrics", 7, undefined]) {
      await expect(sendScreenLink(w.actor(ann), path)).rejects.toThrow(Forbidden);
    }
    await expect(sendScreenLink({ ...w.actor(ann), key: { id: "k", scopes: ["values:submit"] } } as unknown as Actor, "/analyze")).rejects.toThrow(Forbidden);
    // The role on the Actor is not trusted: the membership is read again.
    await expect(sendScreenLink({ ...w.actor(guest), role: "owner" }, "/analyze")).rejects.toThrow(Forbidden);
    await expect(sendScreenLink({ personId: "t-nobody", workspaceId: w.id, role: "member" }, "/analyze")).rejects.toThrow(Forbidden);
    await expect(sendScreenLink({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "/analyze")).rejects.toThrow(DemoReadOnly);
    expect(await deliveriesOf(w.id)).toEqual([]);
    expect((await db().from("test_message_sends").select("id").eq("workspace_id", w.id)).data).toEqual([]);
  });

  it("shares the limit of Test Messages by email, also when pressed at once, and sends nothing over it", async () => {
    const { w, ann, mail } = await setup();
    expect((await sendTestMessage(w.actor(ann), "email")).state).toBe("sent");
    const results = await Promise.all(Array.from({ length: TEST_PER_WAY_PER_WINDOW + 2 }, () => sendScreenLink(w.actor(ann), "/analyze")));
    expect(results.filter((r) => r.state === "sent")).toHaveLength(TEST_PER_WAY_PER_WINDOW - 1);
    const over = results.find((r) => r.state === "limited")!;
    expect(over.words).toMatch(/^You asked for 3 emails to yourself in the last 10 minutes\. Try again in (9|10) minutes\.$/);
    expect(await inbox(mail)).toHaveLength(TEST_PER_WAY_PER_WINDOW);
  });

  it("stays in the Outbox and says why where email cannot go out", async () => {
    const { w, ann, mail } = await setup();
    const was = process.env.ZIFFR_SMTP_URL; delete process.env.ZIFFR_SMTP_URL;
    try {
      expect(await sendScreenLink(w.actor(ann), "/analyze")).toEqual({ state: "kept", words: `Not emailed. ${NO_WAY_HERE.mail}` });
    } finally { process.env.ZIFFR_SMTP_URL = was; }
    const noAddress = await w.person("member");
    expect(await sendScreenLink(w.actor(noAddress), "/analyze")).toEqual({ state: "kept", words: `Not emailed. ${NO_WAY_HERE.address}` });
    expect((await deliveriesOf(w.id)).map((d) => d.mail_state)).toEqual(["outbox", "outbox"]);
    expect(await inbox(mail)).toHaveLength(0);
  });
});
