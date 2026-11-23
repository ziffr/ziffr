// @ts-nocheck
import { describe, expect, it } from "vitest";
import { signInvitationStopToken, invitationStopTokenValid } from "./invitation-stop";
import { signDigestToken, verifyDigestToken } from "./usage-digest-token";

const KEY = { ZIFFR_SECRETS_KEY: Buffer.alloc(32, 7).toString("base64") };

describe("signed unsubscribe tokens of different labels", () => {
  it("never validate as one another's, though they sign the same subject", () => {
    const a = signInvitationStopToken("nia@example.test", KEY)!;
    const d = signDigestToken("nia@example.test", KEY)!;
    expect(a).not.toBe(d);
    expect(verifyDigestToken(a, KEY)).toBeNull();
    process.env.ZIFFR_SECRETS_KEY = KEY.ZIFFR_SECRETS_KEY;
    try {
      expect(invitationStopTokenValid(a)).toBe(true);
      expect(invitationStopTokenValid(d)).toBe(false);
    } finally { delete process.env.ZIFFR_SECRETS_KEY; }
  });
  it("sign an address up to 254 characters and refuse anything that is not one", () => {
    const long = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(50)}.test`;
    expect(long.length).toBeLessThanOrEqual(254);
    expect(signInvitationStopToken(long, KEY)).not.toBeNull();
    for (const bad of ["", "ab", "has space@x.test", "x".repeat(255), "line\nbreak@x.test"]) expect(signInvitationStopToken(bad, KEY)).toBeNull();
  });
  it("round-trip a non-ASCII address", () => {
    const t = signInvitationStopToken("jörg@exämple.test", KEY)!;
    expect(t).not.toBeNull();
    process.env.ZIFFR_SECRETS_KEY = KEY.ZIFFR_SECRETS_KEY;
    try { expect(invitationStopTokenValid(t)).toBe(true); } finally { delete process.env.ZIFFR_SECRETS_KEY; }
  });
  it("are not made without a key", () => {
    expect(signInvitationStopToken("nia@example.test", {})).toBeNull();
  });
});
