import { describe, expect, it } from "vitest";
import { countsAsSignedIn, staleSessionCookies } from "./demo-only-session";

describe("a demo-only Ziffr and a leftover session", () => {
  const names = ["sb-abc-auth-token", "sb-abc-auth-token.0", "sb-abc-auth-token-code-verifier", "ziffr-demo", "ziffr-workspace", "theme"];

  it("clears exactly the sign-in cookies, and nothing else", () => {
    expect(staleSessionCookies(true, names)).toEqual(["sb-abc-auth-token", "sb-abc-auth-token.0", "sb-abc-auth-token-code-verifier"]);
  });

  it("clears nothing where sign-in is on", () => {
    expect(staleSessionCookies(false, names)).toEqual([]);
  });

  it("counts nobody as signed in, whatever cookie comes", () => {
    expect(countsAsSignedIn(true, true)).toBe(false);
    expect(countsAsSignedIn(true, false)).toBe(false);
  });

  it("counts a session cookie as signed in elsewhere", () => {
    expect(countsAsSignedIn(false, true)).toBe(true);
    expect(countsAsSignedIn(false, false)).toBe(false);
  });
});
