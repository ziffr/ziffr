import { describe, expect, it } from "vitest";
import { digestTokenAvailable, signDigestToken, verifyDigestToken } from "./usage-digest-token";

const JOB = { ZIFFR_JOB_SECRET: "j".repeat(40) };
const KEY = { ZIFFR_SECRETS_KEY: Buffer.alloc(32, 7).toString("base64") };

describe("usage digest token", () => {
  it("round-trips a person and nothing else", () => {
    const t = signDigestToken("t-1234", JOB)!;
    expect(verifyDigestToken(t, JOB)).toBe("t-1234");
    expect(t).not.toContain("t-1234");
  });
  it("is refused when changed, cut, for another person or under another key", () => {
    const t = signDigestToken("ann", JOB)!;
    const [, sig] = t.split(".");
    expect(verifyDigestToken(`${Buffer.from("bob").toString("base64url")}.${sig}`, JOB)).toBeNull();
    expect(verifyDigestToken(t.slice(0, -1), JOB)).toBeNull();
    expect(verifyDigestToken(`${t}A`, JOB)).toBeNull();
    expect(verifyDigestToken(t, { ZIFFR_JOB_SECRET: "k".repeat(40) })).toBeNull();
    for (const bad of ["", "x", "a.b", null, undefined, 5, "..", `${Buffer.from("ann").toString("base64url")}.${"A".repeat(43)}`]) expect(verifyDigestToken(bad, JOB)).toBeNull();
  });
  it("cannot be signed without a key, and a short job secret is no key", () => {
    expect(digestTokenAvailable({})).toBe(false);
    expect(digestTokenAvailable({ ZIFFR_JOB_SECRET: "short" })).toBe(false);
    expect(signDigestToken("ann", {})).toBeNull();
    expect(verifyDigestToken("YW5u." + "A".repeat(43), {})).toBeNull();
  });
  it("signs with the job secret only where there is no secrets key", () => {
    const both = { ...KEY, ...JOB };
    const viaJob = signDigestToken("ann", JOB)!;
    expect(verifyDigestToken(viaJob, both)).toBeNull();
    expect(verifyDigestToken(signDigestToken("ann", both)!, KEY)).toBe("ann");
  });
  it("survives a change of the secrets key through the previous one", () => {
    const t = signDigestToken("ann", KEY)!;
    const next = { ZIFFR_SECRETS_KEY: Buffer.alloc(32, 9).toString("base64"), ZIFFR_SECRETS_KEY_PREVIOUS: KEY.ZIFFR_SECRETS_KEY };
    expect(verifyDigestToken(t, next)).toBe("ann");
    expect(verifyDigestToken(t, { ZIFFR_SECRETS_KEY: next.ZIFFR_SECRETS_KEY })).toBeNull();
  });
});
