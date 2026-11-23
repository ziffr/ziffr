// @ts-nocheck
// The Send Email Hook's signature check (spec 0025, #198): Standard Webhooks, with the secret Docker makes. A forged
// call would make Ziffr send sign-in emails to anyone, so this check is the whole defence.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authHookSecrets, authHookSigned, firstHookCall } from "./auth-email";

const KEY = Buffer.alloc(32, 9);
const SECRET = `v1,whsec_${KEY.toString("base64")}`;
const sign = (id: string, ts: string, body: string, key = KEY) => `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
const now = 1_790_000_000_000;
const ts = String(now / 1000);

describe("the Send Email Hook's secret", () => {
  it("is read as Auth takes it, and not at all when malformed", () => {
    expect(authHookSecrets({ ZIFFR_AUTH_HOOK_SECRET: SECRET })).toEqual([KEY]);
    expect(authHookSecrets({ ZIFFR_AUTH_HOOK_SECRET: `whsec_${KEY.toString("base64")}` })).toEqual([KEY]);
    // While one replaces another, Auth takes several separated by |.
    const other = Buffer.alloc(32, 3);
    expect(authHookSecrets({ ZIFFR_AUTH_HOOK_SECRET: `${SECRET}|v1,whsec_${other.toString("base64")}` })).toEqual([KEY, other]);
    for (const bad of [undefined, "", "secret", "v1,whsec_", `v1,whsec_${Buffer.alloc(8).toString("base64")}`, "v1,whsec_not base64!", `${SECRET}|nonsense`]) {
      expect(authHookSecrets({ ZIFFR_AUTH_HOOK_SECRET: bad })).toEqual([]);
    }
  });
});

describe("a hook call's signature", () => {
  const body = JSON.stringify({ user: { email: "a@example.test" } });
  it("passes when signed with the secret a moment ago, also among several signatures", () => {
    expect(authHookSigned([KEY], { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(true);
    expect(authHookSigned([KEY], { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
  });
  it("fails for another secret, another body, id or time, a stale or future call, and anything missing", () => {
    const good = { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) };
    expect(authHookSigned([KEY], { ...good, signature: sign("msg_1", ts, body, Buffer.alloc(32, 1)) }, body, now)).toBe(false);
    expect(authHookSigned([KEY], good, `${body} `, now)).toBe(false);
    expect(authHookSigned([KEY], { ...good, id: "msg_2" }, body, now)).toBe(false);
    expect(authHookSigned([KEY], good, body, now + 301_000)).toBe(false);
    expect(authHookSigned([KEY], good, body, now - 301_000)).toBe(false);
    const old = String(now / 1000 - 400);
    expect(authHookSigned([KEY], { id: "msg_1", timestamp: old, signature: sign("msg_1", old, body) }, body, now)).toBe(false);
    expect(authHookSigned([KEY], { ...good, signature: null }, body, now)).toBe(false);
    expect(authHookSigned([KEY], { ...good, id: null }, body, now)).toBe(false);
    expect(authHookSigned([KEY], { ...good, timestamp: "soon" }, body, now)).toBe(false);
    expect(authHookSigned([KEY], { ...good, signature: good.signature.replace("v1,", "v2,") }, body, now)).toBe(false);
  });
});

describe("a hook call sent again", () => {
  it("is taken once within its window, and again once the window has passed", () => {
    expect(firstHookCall("msg_replayed", now)).toBe(true);
    expect(firstHookCall("msg_replayed", now + 1000)).toBe(false);
    expect(firstHookCall("msg_other", now + 1000)).toBe(true);
    expect(firstHookCall("msg_replayed", now + 11 * 60_000)).toBe(true);
  });
});
