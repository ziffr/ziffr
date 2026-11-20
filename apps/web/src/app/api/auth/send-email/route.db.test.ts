// POST /api/auth/send-email over HTTP (spec 0025, #198): Supabase Auth's Send Email Hook. A signed call sends one
// sign-in email through the mail server in effect, here the local Mailpit; an unsigned, stale or wrongly signed call,
// a link that would lead off this Ziffr, and a kind Ziffr does not send are refused with nothing sent.
import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mailOn } from "@ziffr/core/mail";
import { POST } from "./route";

const SMTP = process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const KEY = Buffer.alloc(32, 5);
const SITE = "https://ziffr.example.test";
const KEYS = ["ZIFFR_AUTH_HOOK_SECRET", "ZIFFR_SMTP_URL", "ZIFFR_MAIL_FROM", "ZIFFR_SITE_URL", "SUPABASE_PUBLIC_URL"] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.ZIFFR_AUTH_HOOK_SECRET = `v1,whsec_${KEY.toString("base64")}`;
  process.env.ZIFFR_SMTP_URL = SMTP;
  process.env.ZIFFR_MAIL_FROM = "Ziffr <ziffr@example.test>";
  process.env.ZIFFR_SITE_URL = SITE;
  process.env.SUPABASE_PUBLIC_URL = SITE;
});
afterEach(() => { for (const k of KEYS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });

const address = () => `signin-${randomUUID().slice(0, 8)}@example.test`;
const payload = (email: string, data: Record<string, unknown> = {}, user: Record<string, unknown> = {}) => JSON.stringify({
  user: { id: randomUUID(), email, ...user },
  email_data: { token: "123456", token_hash: "test-token-hash", redirect_to: `${SITE}/auth/callback?next=%2F`, email_action_type: "magiclink", site_url: SITE, ...data },
});
function call(body: string, opts: { key?: Buffer; at?: number; id?: string; signature?: string | null } = {}) {
  const id = opts.id ?? `msg_${randomUUID()}`;
  const ts = String(Math.floor((opts.at ?? Date.now()) / 1000));
  const signature = opts.signature === undefined ? `v1,${createHmac("sha256", opts.key ?? KEY).update(`${id}.${ts}.${body}`).digest("base64")}` : opts.signature;
  return POST(new Request("http://app:3000/api/auth/send-email", { method: "POST", body, headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, ...(signature === null ? {} : { "webhook-signature": signature }) } }));
}
async function inbox(to: string): Promise<{ Subject: string; ID: string }[]> {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await r.json()) as { messages: { Subject: string; ID: string }[] }).messages;
}
async function textOf(id: string): Promise<string> {
  return ((await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string }).Text;
}

describe("POST /api/auth/send-email", () => {
  it("answers 404 while no hook secret is set", async () => {
    delete process.env.ZIFFR_AUTH_HOOK_SECRET;
    expect((await call(payload(address()))).status).toBe(404);
  });

  it("sends a signed call's sign-in link through the mail server in effect, to Auth's verify address", async () => {
    const to = address();
    const res = await call(payload(to));
    expect(res.status).toBe(200);
    const [m] = await inbox(to);
    expect(m.Subject).toBe("Your Ziffr sign-in link");
    const text = await textOf(m.ID);
    expect(text).toContain(`${SITE}/auth/v1/verify?token=test-token-hash&type=magiclink&redirect_to=${encodeURIComponent(`${SITE}/auth/callback?next=%2F`)}`);
  });

  it("confirms a change of address at both addresses, each with its own link", async () => {
    const old = address();
    const fresh = address();
    expect((await call(payload(old, { email_action_type: "email_change", token_hash: "newaddresshash01", token_hash_new: "oldaddresshash01" }, { new_email: fresh }))).status).toBe(200);
    expect(await textOf((await inbox(fresh))[0].ID)).toContain("token=newaddresshash01&type=email_change");
    expect(await textOf((await inbox(old))[0].ID)).toContain("token=oldaddresshash01&type=email_change");
  });

  it("refuses an unsigned, stale, wrongly signed or replayed-elsewhere call, and sends nothing", async () => {
    for (const opts of [{ signature: null }, { at: Date.now() - 10 * 60_000 }, { key: Buffer.alloc(32, 6) }, { signature: "v1,bm90IGEgc2lnbmF0dXJl" }]) {
      const to = address();
      const res = await call(payload(to), opts);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { http_code: 401, message: "not_signed" } });
      expect(await inbox(to)).toEqual([]);
    }
  });

  it("refuses a link that would lead off this Ziffr, a kind it does not send, and a bad token, and sends nothing", async () => {
    for (const data of [{ redirect_to: "https://evil.example.test/" }, { redirect_to: `${SITE}.evil.example.test/` }, { email_action_type: "reauthentication" }, { token_hash: "<script>" }]) {
      const to = address();
      const res = await call(payload(to, data));
      expect(res.status).toBe(400);
      expect(await inbox(to)).toEqual([]);
    }
  });

  it("answers an error when mail is off, so Auth fails visibly", async () => {
    delete process.env.ZIFFR_SMTP_URL;
    const res = await call(payload(address()));
    // A mail server saved on the page may still be in effect on this database; without one, Auth hears 503.
    expect(res.status).toBe((await mailOn()) ? 200 : 503);
  });
});
