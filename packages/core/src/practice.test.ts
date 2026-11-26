// The core's side of "nothing leaves a Practice Workspace" (spec 0063; GLOSSARY: Practice Workspace) without a
// database: it fails closed when the question cannot be answered, and a made-up person's address reaches no mail server.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { smtpTransportWith, sendMail, type OutgoingMail } from "./mail";
import { assertMayLeave, heldBack, isPracticeWorkspace, neverRouted, PracticeRefused, type WayOut } from "./practice";

const fake = vi.hoisted(() => ({ row: null as { practice_for: string | null } | null, error: null as { message: string } | null, reads: 0 }));
vi.mock("./db", () => ({ db: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { fake.reads++; return { data: fake.row, error: fake.error }; } }) }) }) }) }));
const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
vi.mock("./settings-in-effect", async (actual) => ({ ...(await actual<object>()), settingsInEffect: async () => SETTINGS }));

const WAYS: WayOut[] = ["email", "slack", "telegram", "webhook", "invitation", "view_link", "calendar_link", "billing", "feedback", "marketplace_report"];
let n = 0;
/** A Workspace id never asked about before, so no earlier answer is remembered for it. */
const fresh = () => `workspace-${++n}`;
beforeEach(() => { fake.row = null; fake.error = null; fake.reads = 0; });

describe("whether something is held back", () => {
  it.each(WAYS)("holds %s in a Practice Workspace, whoever it would reach", async (way) => {
    fake.row = { practice_for: "admin" };
    const ws = fresh();
    expect(await heldBack(ws, way, { recipientId: "admin", address: "admin@example.test" })).toBe(true);
    await expect(assertMayLeave(ws, way)).rejects.toBeInstanceOf(PracticeRefused);
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
    expect(await heldBack(ws, "email")).toBe(true);
    expect(await heldBack(ws, "email")).toBe(true);
    expect(fake.reads).toBe(2);
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
