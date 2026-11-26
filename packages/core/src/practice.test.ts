// The core's side of "nothing leaves a Practice Workspace" (spec 0063; GLOSSARY: Practice Workspace) without a
// database: it fails closed when the question cannot be answered, and a made-up person's address reaches no mail server.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { smtpTransportWith, sendMail, type OutgoingMail } from "./mail";
import { assertMayLeave, heldBack, isPracticeWorkspace, mayAnswer, mayQueue, neverRouted, PracticeRefused, wayOpen, type SelfWay, type WayOut } from "./practice";

const fake = vi.hoisted(() => ({ row: null as { practice_for: string | null } | null, error: null as { message: string } | null, reads: 0, way: null as { destination: string | null } | null, admin: true, verified: "admin@example.test" }));
vi.mock("./db", () => {
  const from = (table: string) => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => {
      if (table === "workspaces") { fake.reads++; return { data: fake.row, error: fake.error }; }
      if (table === "practice_ways") return { data: fake.way, error: fake.error };
      return { data: { auth_user_id: "auth-1" }, error: null };
    } };
    return chain;
  };
  return { db: () => ({ from, auth: { admin: { getUserById: async () => ({ data: { user: { email: fake.verified, email_confirmed_at: "2026-01-01" } }, error: null }) } } }) };
});
vi.mock("./installation-admins", () => ({ isInstallationAdmin: async () => fake.admin }));
const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
vi.mock("./settings-in-effect", async (actual) => ({ ...(await actual<object>()), settingsInEffect: async () => SETTINGS }));

const NEVER: WayOut[] = ["invitation", "billing", "feedback", "marketplace_report"];
const ALWAYS: WayOut[] = ["view_link", "calendar_link"];
const TO_ONESELF: WayOut[] = ["email", "slack", "telegram"];
const WAYS: WayOut[] = [...NEVER, ...ALWAYS, ...TO_ONESELF, "webhook"];
let n = 0;
/** A Workspace id never asked about before, so no earlier answer is remembered for it. */
const fresh = () => `workspace-${++n}`;
beforeEach(() => { Object.assign(fake, { row: null, error: null, reads: 0, way: null, admin: true, verified: "admin@example.test" }); });
const ME = { recipientId: "admin", destination: "admin@example.test" };
/** A Practice Workspace made for "admin" with email switched on for admin@example.test. */
const switchedOn = () => { fake.row = { practice_for: "admin" }; fake.way = { destination: "admin@example.test" }; return fresh(); };

describe("whether something is held back", () => {
  it.each(NEVER)("holds %s in a Practice Workspace, whoever it would reach", async (way) => {
    const ws = switchedOn();
    expect(await heldBack(ws, way, ME)).toBe(true);
    await expect(assertMayLeave(ws, way)).rejects.toBeInstanceOf(PracticeRefused);
  });
  it.each(ALWAYS)("lets a Practice Workspace make a %s", async (way) => {
    fake.row = { practice_for: "admin" };
    expect(await heldBack(fresh(), way)).toBe(false);
  });
  it.each(TO_ONESELF)("holds %s while it is not switched on", async (way) => {
    fake.row = { practice_for: "admin" };
    const ws = fresh();
    expect(await heldBack(ws, way, ME)).toBe(true);
    expect(await wayOpen(ws, way as SelfWay)).toBe(false);
  });
  it("lets a Webhook be set up, and sends only one the person made", async () => {
    fake.row = { practice_for: "admin" };
    const ws = fresh();
    expect(await heldBack(ws, "webhook")).toBe(false);
    expect(await heldBack(ws, "webhook", { recipientId: "admin" })).toBe(false);
    for (const other of ["", "made-up", "second-admin"]) expect(await heldBack(ws, "webhook", { recipientId: other })).toBe(true);
  });
  it("lets email go only to its person at the very address switched on and still verified", async () => {
    const ws = switchedOn();
    expect(await heldBack(ws, "email", ME)).toBe(false);
    expect(await heldBack(ws, "email", { ...ME, destination: " Admin@Example.test " })).toBe(false);
    const near = ["other@example.test", "admin+x@example.test", "ad.min@example.test", "admin@example.test.evil.org", "admin@example.test, other@example.test", "admin@example.test;other@example.test", "Admin <admin@example.test>", ""];
    for (const destination of near) expect([destination, await heldBack(ws, "email", { ...ME, destination })]).toEqual([destination, true]);
    expect(await heldBack(ws, "email", { ...ME, recipientId: "second-admin" })).toBe(true);
    expect(await heldBack(ws, "email", { destination: ME.destination })).toBe(true);
    expect(await heldBack(ws, "email", { recipientId: "admin" })).toBe(true);
    fake.verified = "new@example.test";
    expect(await heldBack(ws, "email", ME)).toBe(true);
    expect(await heldBack(ws, "email", { ...ME, destination: "new@example.test" })).toBe(true);
    fake.verified = "admin@example.test";
    fake.admin = false;
    expect(await heldBack(ws, "email", ME)).toBe(true);
    expect(await mayQueue(ws, "email", "admin")).toBe(false);
  });
  it("compares a chat account with the one recorded, and none recorded reaches nobody", async () => {
    const ws = switchedOn();
    fake.way = { destination: "4242" };
    expect(await heldBack(ws, "telegram", { recipientId: "admin", destination: "4242" })).toBe(false);
    expect(await heldBack(ws, "telegram", { recipientId: "admin", destination: "4243" })).toBe(true);
    expect(await mayAnswer(ws, "telegram", "4242")).toBe(true);
    expect(await mayAnswer(ws, "telegram", "4243")).toBe(false);
    fake.way = { destination: null };
    expect(await heldBack(ws, "telegram", { recipientId: "admin", destination: "4242" })).toBe(true);
    expect(await mayQueue(ws, "telegram", "admin")).toBe(true);
    expect(await mayQueue(ws, "telegram", "made-up")).toBe(false);
  });
  it.each(WAYS)("holds nothing back of %s elsewhere", async (way) => {
    fake.row = { practice_for: null };
    expect(await heldBack(fresh(), way)).toBe(false);
  });
  it("throws, so nothing is sent, when it cannot be read", async () => {
    fake.error = { message: "down" };
    const ws = fresh();
    await expect(heldBack(ws, "email")).rejects.toThrow("nothing was sent");
    await expect(assertMayLeave(ws, "webhook")).rejects.toThrow("nothing was sent");
    // An unanswered question is not remembered: the next one asks again.
    fake.error = null;
    fake.row = { practice_for: null };
    expect(await heldBack(ws, "email")).toBe(false);
  });
  it("holds everything of a Workspace that is not there, and does not remember that", async () => {
    const ws = fresh();
    for (const way of WAYS) expect([way, await heldBack(ws, way, ME)]).toEqual([way, true]);
    expect(fake.reads).toBe(WAYS.length);
  });
  it("reads a Workspace once: the mark never changes", async () => {
    fake.row = { practice_for: "admin" };
    const ws = fresh();
    await isPracticeWorkspace(ws);
    fake.row = { practice_for: null };
    expect(await isPracticeWorkspace(ws)).toBe(true);
    expect(fake.reads).toBe(1);
  });
});

describe("a made-up person's address", () => {
  it.each(["a@practice.invalid", "a@PRACTICE.INVALID", "a@x.y.invalid", "a@invalid", "a@practice.invalid.", "a@practice.invalid ", "Ann <a@practice.invalid>"])("%s is never routed", (address) => {
    expect(neverRouted(address)).toBe(true);
  });
  it.each(["a@example.test", "invalid@example.com", "a@invalid.example.com", "a@notinvalid", "a.invalid@example.com"])("%s is an address like any other", (address) => {
    expect(neverRouted(address)).toBe(false);
  });
  const mail: OutgoingMail = { to: "ann@practice.invalid", subject: "Hello", text: "Hello" };
  it("is refused by the SMTP transport itself, before any connection", async () => {
    await expect(smtpTransportWith(SETTINGS)(mail)).rejects.toMatchObject({ code: "ENOROUTE" });
  });
  it("is refused by sendMail for a Workspace and for a sign-in alike, and the transport receives nothing", async () => {
    fake.row = { practice_for: null };
    const sent: OutgoingMail[] = [];
    const transport = async (m: OutgoingMail) => { sent.push(m); return { messageId: "1" }; };
    await expect(sendMail(mail, fresh(), transport)).rejects.toThrow("cannot be mailed");
    await expect(sendMail(mail, null, transport)).rejects.toThrow("cannot be mailed");
    expect(sent).toEqual([]);
  });
  it("and a Practice Workspace sends no email at all, to whatever address", async () => {
    fake.row = { practice_for: "admin" };
    const sent: OutgoingMail[] = [];
    await expect(sendMail({ ...mail, to: "admin@example.test" }, fresh(), async (m) => { sent.push(m); return { messageId: "1" }; })).rejects.toBeInstanceOf(PracticeRefused);
    expect(sent).toEqual([]);
  });
});
