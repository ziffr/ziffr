import { describe, expect, it } from "vitest";
import { newVisitId, visitCookieOptions, visitFromCookie, visitIdOf, withCookie } from "./demo-visit-cookie";

describe("the demo's visit id", () => {
  it("is 128 bits as 32 hex characters, and different each time", () => {
    const a = newVisitId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newVisitId()).not.toBe(a);
  });

  it("is kept when the cookie holds one", () => {
    const id = newVisitId();
    expect(visitFromCookie(id)).toEqual({ id, fresh: false });
  });

  it("is no visit when there is no cookie", () => {
    expect(visitFromCookie(undefined)).toBeNull();
  });

  it("is replaced when the cookie is malformed, the old 1 or forged", () => {
    for (const bad of ["1", "", "xyz", "A".repeat(32), "a".repeat(31), "a".repeat(33), "a".repeat(64), `${"a".repeat(31)}g`, "../etc"]) {
      const v = visitFromCookie(bad);
      expect(v?.fresh).toBe(true);
      expect(v?.id).toMatch(/^[0-9a-f]{32}$/);
      expect(v?.id).not.toBe(bad);
      expect(visitIdOf(bad)).toBeNull();
    }
  });

  it("sets the flags: never readable from JavaScript, Lax, the whole site, secure where HTTPS", () => {
    expect(visitCookieOptions(true)).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: true });
    expect(visitCookieOptions(false).secure).toBe(false);
  });

  it("puts the new id into the request's Cookie header in place of the old value", () => {
    expect(withCookie("a=1; ziffr-demo=1; b=2", "ziffr-demo", "x")).toBe("a=1; b=2; ziffr-demo=x");
    expect(withCookie(null, "ziffr-demo", "x")).toBe("ziffr-demo=x");
  });
});
